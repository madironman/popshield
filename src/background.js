// PopShield background service worker.
//  * Backstop: any tab a page opens without a matching "user intended this"
//    token is closed immediately. Tokens are minted only by the isolated-world
//    bridge (bridge.js), each bound to the URL it was issued for.
//  * Keeps a per-tab log of blocked items (wiped when the tab navigates or
//    closes) and the toolbar badge count.
//  * Keeps a lifetime counter on this device only — never which sites.
importScripts('common.js');

const TOKEN_TTL = 3000;        // ms a user-intended open stays valid
const CONTEXTMENU_TTL = 15000; // right-click "Open link in new tab" takes a moment
const MAX_TOKENS = 4;          // per tab
const GRACE = 400;             // wait for a late token message before closing a tab
const LOG_MAX = 50;

const KINDS = new Set(['popup', 'new-tab', 'overlay-link', 'scripted-link', 'scripted-form', 'redirect']);
const REASONS = new Set(['page-wide-listener', 'invisible-overlay', 'ad-layer', 'ad-box-frame', 'no-gesture',
  'non-activating-event', 'strict-mode', 'no-user-intent', 'embedded-frame', 'tab-under', 'popup-hijack']);
const ALLOW_HOWS = new Set(['popup', 'scripted-link', 'scripted-form', 'user-link', 'user-form', 'contextmenu']);

// ------------------------------------------------------------ rate limits
const buckets = new Map(); // `${tabId}|${kind}` -> { start, n }
function overLimit(tabId, kind, max, windowMs) {
  const k = tabId + '|' + kind, now = Date.now();
  let b = buckets.get(k);
  if (!b || now - b.start > windowMs) { b = { start: now, n: 0 }; buckets.set(k, b); }
  return ++b.n > max;
}

// ------------------------------------------------------------ tokens
const tokens = new Map();          // tabId -> [{ exp, url, sameSiteOnly, frameId }]
const frameOverlayAt = new Map();  // tabId -> Date.now() of the last click into an invisible frame

function addToken(tabId, frameId, how, url, sameSiteOnly) {
  // A click that went into a large, near-invisible frame isn't trusted.
  if (frameId !== 0 && Date.now() - (frameOverlayAt.get(tabId) || 0) < 1500) return;
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  arr.push({ exp: Date.now() + (how === 'contextmenu' ? CONTEXTMENU_TTL : TOKEN_TTL), url, sameSiteOnly: !!sameSiteOnly, frameId });
  while (arr.length > MAX_TOKENS) arr.shift();
  tokens.set(tabId, arr);
}
function isBlank(u) { return typeof u === 'string' && u.startsWith('about:blank'); }
function tokenFits(t, url, srcSite) {
  const site = PS.siteOfUrl(url);
  if (t.sameSiteOnly && !(site && site === srcSite)) return false;
  if (!t.url) return true;
  if (isBlank(t.url)) return isBlank(url);
  if (isBlank(url)) return false;
  const ts = PS.siteOfUrl(t.url);
  return !!ts && ts === site;
}
// Consume one token for a new tab opened at `url` from a page on `srcSite`.
function takeToken(tabId, url, srcSite) {
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  const i = arr.findIndex((t) => tokenFits(t, url, srcSite));
  if (i >= 0) arr.splice(i, 1);
  tokens.set(tabId, arr);
  return i >= 0;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------- stats (local only)
// Total, per day (last 30 days) and per kind of block. Which sites the user
// visits is deliberately NEVER recorded.
function localDay() { return new Date().toLocaleDateString('en-CA'); } // YYYY-MM-DD, local time
async function bumpStats(kind) {
  const { stats } = await chrome.storage.local.get({ stats: null });
  const st = stats && typeof stats === 'object' ? stats : { total: 0, since: Date.now(), days: {}, kinds: {} };
  delete st.sites;
  st.total = (st.total || 0) + 1;
  const day = localDay();
  st.days = st.days || {};
  st.days[day] = (st.days[day] || 0) + 1;
  const days = Object.keys(st.days).sort();
  while (days.length > 30) delete st.days[days.shift()];
  st.kinds = st.kinds || {};
  st.kinds[kind] = (st.kinds[kind] || 0) + 1;
  await chrome.storage.local.set({ stats: st });
}

// ------------------------------------------------------- per-tab log
// Serialised so concurrent events don't clobber each other; bounded.
let logChain = Promise.resolve();
let pending = 0;
function logBlocked(tabId, entry) {
  if (pending > 100) return logChain;
  pending++;
  logChain = logChain.then(async () => {
    const key = 'log:' + tabId, ckey = 'count:' + tabId;
    const got = await chrome.storage.session.get({ [key]: [], [ckey]: 0 });
    const cur = got[key];
    cur.unshift({ ...entry, time: Date.now() });
    cur.length = Math.min(cur.length, LOG_MAX);
    const total = got[ckey] + 1;
    await chrome.storage.session.set({ [key]: cur, [ckey]: total });
    try {
      await chrome.action.setBadgeText({ tabId, text: String(total > 999 ? '999+' : total) });
      if (total === 1) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
    } catch {}
    await bumpStats(entry.kind);
  }).catch(() => {}).finally(() => { pending--; });
  return logChain;
}
async function clearTab(tabId) {
  await chrome.storage.session.remove(['log:' + tabId, 'count:' + tabId]);
  try { await chrome.action.setBadgeText({ tabId, text: '' }); } catch {}
}
// Page address without query string / fragment (they can hold personal tokens).
function cleanUrl(u) { try { const x = new URL(u); return x.origin + x.pathname; } catch { return ''; } }
const clamp = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

// ------------------------------------------------------- messages
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg !== 'object' || sender.id !== chrome.runtime.id || !sender.tab) return;
  const tabId = sender.tab.id;
  if (typeof tabId !== 'number' || tabId < 0) return;

  if (msg.type === 'allow') {
    if (!ALLOW_HOWS.has(msg.how) || overLimit(tabId, 'allow', 12, 10000)) return;
    addToken(tabId, sender.frameId, msg.how, typeof msg.url === 'string' ? msg.url.slice(0, 2000) : null, msg.sameSiteOnly === true);
  } else if (msg.type === 'blocked') {
    if (!KINDS.has(msg.kind) || !REASONS.has(msg.reason) || overLimit(tabId, 'blocked', 30, 10000)) return;
    logBlocked(tabId, {
      kind: msg.kind, reason: msg.reason, url: clamp(msg.url, 2000),
      frameUrl: cleanUrl(sender.url || ''), source: clamp(msg.source, 120) || undefined,
    });
  } else if (msg.type === 'frameGesture') {
    // A child frame saw the user press the pointer: tell the top frame.
    if (sender.frameId === 0 || overLimit(tabId, 'frameGesture', 4, 1000)) return;
    chrome.tabs.sendMessage(tabId, { type: 'frameGesture' }, { frameId: 0 }).catch(() => {});
  } else if (msg.type === 'frameOverlay') {
    // The top frame saw a click go into a large, near-invisible frame.
    if (sender.frameId === 0) frameOverlayAt.set(tabId, Date.now());
  }
});

// ------------------------------------------------------- backstop
// Site whose mode applies to a source tab; undefined = not a web page (skip).
function sourceSite(u) {
  if (!u || /^(chrome|chrome-extension|devtools|edge|chrome-untrusted|view-source):/.test(u)) return undefined;
  try {
    const x = new URL(u);
    if (x.protocol === 'blob:') return PS.siteOfUrl(new URL(x.pathname).origin);
    return /^https?:$/.test(x.protocol) ? PS.siteOf(x.hostname) : null; // about:, data:, file: -> default mode
  } catch { return null; }
}
chrome.webNavigation.onCreatedNavigationTarget.addListener(async (d) => {
  if (d.sourceTabId == null || d.sourceTabId < 0) return;
  let src;
  try { src = await chrome.tabs.get(d.sourceTabId); } catch { return; }
  const site = sourceSite(src.url || src.pendingUrl || '');
  if (site === undefined) return;
  if ((await PS.getMode(site)) === 'off') return;
  if (takeToken(d.sourceTabId, d.url, site)) return;
  await sleep(GRACE);
  if (takeToken(d.sourceTabId, d.url, site)) return;
  try { await chrome.tabs.remove(d.tabId); } catch { return; }
  logBlocked(d.sourceTabId, { kind: 'new-tab', reason: 'no-user-intent', url: clamp(d.url, 2000) });
});

// Fresh log for each new page in the tab; nothing outlives the tab.
chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId === 0 && d.transitionType !== 'reload') clearTab(d.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tokens.delete(tabId);
  frameOverlayAt.delete(tabId);
  for (const k of buckets.keys()) if (k.startsWith(tabId + '|')) buckets.delete(k);
  clearTab(tabId);
});

// First install: show the welcome page, and start the stats clock.
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason !== 'install') return;
  const { stats } = await chrome.storage.local.get({ stats: null });
  if (!stats) await chrome.storage.local.set({ stats: { total: 0, since: Date.now(), days: {}, kinds: {} } });
  chrome.tabs.create({ url: chrome.runtime.getURL('src/welcome.html') }).catch(() => {});
});
