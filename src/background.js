// PopShield background service worker.
//  * Backstop: any tab a page opens without a matching "user intended this"
//    token is closed within a fraction of a second. Tokens are minted only by the isolated-world
//    bridge (bridge.js), each bound to the URL it was issued for.
//  * Keeps a per-tab log of blocked items (cleared when the tab goes to a new
//    page or closes) and the toolbar badge count.
//  * Keeps an anonymous lifetime counter on this device (no site names).
importScripts('common.js');

const TOKEN_TTL = 3000;        // ms a user-intended open stays valid
const CONTEXTMENU_TTL = 8000;  // right-click "Open link in new tab" takes a moment
const MAX_TOKENS = 4;          // per tab
const GRACE = 400;             // wait for a late token message before closing a tab
const LOG_MAX = 50;

const KINDS = new Set(['popup', 'new-tab', 'overlay-link', 'scripted-link', 'scripted-form', 'redirect']);
const REASONS = new Set(['page-wide-listener', 'invisible-overlay', 'ad-layer', 'ad-box-frame', 'no-gesture',
  'non-activating-event', 'strict-mode', 'no-user-intent', 'embedded-frame', 'tab-under', 'popup-hijack', 'redirect-chain', 'link-swapped', 'form-swapped', 'non-interactive-listener']);
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
const tokens = new Map();          // tabId -> [{ exp, url, sameSiteOnly, frameId, weak }]
const frameOverlayAt = new Map();  // tabId -> Date.now() of the last click into an invisible frame

function addToken(tabId, frameId, how, url, sameSiteOnly, weak) {
  // A click that went into a large, near-invisible frame isn't trusted.
  if (frameId !== 0 && Date.now() - (frameOverlayAt.get(tabId) || 0) < 1500) return;
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  // A link the user clicked must open at exactly that page: a script swapping
  // the address mid-click (even to a same-site redirector) doesn't fit.
  const exact = how === 'user-link' || how === 'contextmenu';
  arr.push({ exp: Date.now() + (how === 'contextmenu' ? CONTEXTMENU_TTL : TOKEN_TTL), url, sameSiteOnly: !!sameSiteOnly, frameId, weak: !!weak, exact, how });
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
  if (t.exact) {
    try { const a = new URL(t.url), b = new URL(url); return a.origin === b.origin && a.pathname === b.pathname; } catch { return false; }
  }
  const ts = PS.siteOfUrl(t.url);
  return !!ts && ts === site;
}
// The user clicked a real link but the tab is opening somewhere else: a script
// swapped the link's address during the click. Returns that link token.
function takeSwappedLink(tabId, url) {
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  // (Not for decoy "#" links: their "real" target is just this page.)
  const i = arr.findIndex((t) => t.how === 'user-link' && !t.sameSiteOnly && t.url && /^https?:/.test(t.url) && t.url !== url);
  const tok = i >= 0 ? arr.splice(i, 1)[0] : null;
  tokens.set(tabId, arr);
  return tok;
}
// Consume one token for a new tab opened at `url` from a page on `srcSite`;
// returns the token (or null).
function takeToken(tabId, url, srcSite) {
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  const i = arr.findIndex((t) => tokenFits(t, url, srcSite));
  const tok = i >= 0 ? arr.splice(i, 1)[0] : null;
  tokens.set(tabId, arr);
  return tok;
}

// ------------------------------------------------------- redirect chains
// A token or a same-site navigation only vouches for the FIRST address. When
// the decision rested on weaker evidence, follow where the tab actually ends
// up for a few seconds: landing on an unrelated site (a redirector bouncing to
// an ad) closes the new tab, or sends this tab back.
const WATCH_MS = 8000;
const tabWatch = new Map(); // new tabId -> { until, allowed:Set<site>, sourceTabId }
const navWatch = new Map(); // tabId -> { until, site }
function landingOk(url, allowed) {
  const site = PS.siteOfUrl(url);
  if (!site) return true; // about:blank, data: ... nothing to judge yet
  return allowed.has(site) || PS.isProviderFlow(url);
}
// Only act on hops the page or server made, never on the user's own
// navigation (typed URL, bookmark, link click, back/forward, reload).
function isRedirectHop(d) {
  const q = d.transitionQualifiers || [];
  if (q.includes('forward_back') || q.includes('from_address_bar')) return false;
  if (['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated', 'reload'].includes(d.transitionType)) return false;
  return q.includes('server_redirect') || q.includes('client_redirect');
}
const weakTabs = new Set(); // tabs opened on weak evidence, until their first page asks
const restoring = new Set(); // tabs we are sending back: keep their log
// Embedded-content takeover: when the user last pressed inside a child frame
// vs. on the page itself, the last real target=_top link clicked in a frame,
// and the page each tab is on.
const FRAME_TAKEOVER_MS = 6000;
const frameGestureAt = new Map(), topGestureAt = new Map(), frameTopLink = new Map(), lastTopUrl = new Map();
function samePage(a, b) { try { const x = new URL(a), y = new URL(b); return x.origin === y.origin && x.pathname === y.pathname; } catch { return false; } }
async function checkFrameTakeover(d, prevUrl) {
  const now = Date.now();
  const fg = frameGestureAt.get(d.tabId) || 0;
  if (!prevUrl || now - fg > FRAME_TAKEOVER_MS || fg <= (topGestureAt.get(d.tabId) || 0)) return false;
  const q = d.transitionQualifiers || [];
  if (['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated', 'reload'].includes(d.transitionType) ||
      q.includes('forward_back') || q.includes('from_address_bar')) return false;  // the user's own navigation
  const prevSite = PS.siteOfUrl(prevUrl), site = PS.siteOfUrl(d.url);
  if (!prevSite || !site || site === prevSite || PS.isProviderFlow(d.url)) return false;
  const link = frameTopLink.get(d.tabId);
  if (link && now - link.at < FRAME_TAKEOVER_MS && samePage(link.url, d.url)) return false;  // a real link the user clicked
  const tab = await chrome.tabs.get(d.tabId).catch(() => null);
  if ((await PS.getMode(prevSite, !!(tab && tab.incognito))) === 'off') return false;
  frameGestureAt.delete(d.tabId);
  restoring.add(d.tabId);
  chrome.tabs.goBack(d.tabId).catch(() => { restoring.delete(d.tabId); });
  logBlocked(d.tabId, { kind: 'redirect', reason: 'embedded-frame', url: clamp(d.url, 2000) });
  return true;
}
// When a tab last opened another tab. Kept here (not in the page) so a hop to
// another page of the same site can't make the opener "forget" it.
const newTabAt = new Map(); // tabId -> Date.now()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------- stats (local only)
// Total, per day (last 30 days) and per kind of block. No site names or
// addresses are ever stored in it.
function localDay() { return new Date().toLocaleDateString('en-CA'); } // YYYY-MM-DD, local time

// ------------------------------------------------------- per-tab log
// Serialised so concurrent events don't clobber each other; bounded.
let logChain = Promise.resolve();
// Items are buffered and flushed together every FLUSH_MS: one session get+set,
// one badge update per tab and one stats write per burst, instead of 5 API
// calls (and a storage.onChanged fan-out to every frame) per blocked item.
const FLUSH_MS = 250;
const pendingLog = new Map();   // tabId -> [entry, ...] oldest first
const pendingKinds = new Map(); // kind -> n
let pendingN = 0, flushTimer = 0;
function logBlocked(tabId, entry) {
  if (pendingN > 100) return logChain;
  pendingN++;
  let q = pendingLog.get(tabId);
  if (!q) pendingLog.set(tabId, q = []);
  q.push({ ...entry, time: Date.now() });
  pendingKinds.set(entry.kind, (pendingKinds.get(entry.kind) || 0) + 1);
  if (!flushTimer) flushTimer = setTimeout(flushLog, FLUSH_MS);
  return logChain;
}
function flushLog() {
  flushTimer = 0;
  const batch = [...pendingLog]; const kinds = [...pendingKinds];
  pendingLog.clear(); pendingKinds.clear(); pendingN = 0;
  logChain = logChain.then(async () => {
    const defaults = {};
    for (const [tabId] of batch) { defaults['log:' + tabId] = []; defaults['count:' + tabId] = 0; }
    const got = await chrome.storage.session.get(defaults);
    const out = {};
    for (const [tabId, items] of batch) {
      const log = got['log:' + tabId];
      for (const it of items) log.unshift(it);
      log.length = Math.min(log.length, LOG_MAX);
      out['log:' + tabId] = log;
      out['count:' + tabId] = got['count:' + tabId] + items.length;
    }
    await chrome.storage.session.set(out);
    for (const [tabId, items] of batch) {
      const total = out['count:' + tabId];
      try {
        await chrome.action.setBadgeText({ tabId, text: String(total > 999 ? '999+' : total) });
        if (total === items.length) await chrome.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
      } catch {}
    }
    await bumpStatsMany(kinds);
  }).catch(() => {});
}
async function bumpStatsMany(kinds) {
  if (!kinds.length) return;
  const { stats } = await chrome.storage.local.get({ stats: null });
  const st = stats && typeof stats === 'object' ? stats : { total: 0, since: Date.now(), days: {}, kinds: {} };
  delete st.sites;
  let n = 0;
  st.kinds = st.kinds || {};
  for (const [kind, c] of kinds) { st.kinds[kind] = (st.kinds[kind] || 0) + c; n += c; }
  st.total = (st.total || 0) + n;
  const day = localDay();
  st.days = st.days || {};
  st.days[day] = (st.days[day] || 0) + n;
  const days = Object.keys(st.days).sort();
  while (days.length > 30) delete st.days[days.shift()];
  await chrome.storage.local.set({ stats: st });
}
async function clearTab(tabId) {
  const q = pendingLog.get(tabId);
  if (q) { pendingN -= q.length; pendingLog.delete(tabId); }
  await chrome.storage.session.remove(['log:' + tabId, 'count:' + tabId]);
  try { await chrome.action.setBadgeText({ tabId, text: '' }); } catch {}
}
// Page address without query string / fragment (they can hold personal tokens).
function cleanUrl(u) { try { const x = new URL(u); return x.origin + x.pathname; } catch { return ''; } }
const clamp = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');

// ------------------------------------------------------- messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg !== 'object' || sender.id !== chrome.runtime.id || !sender.tab) return;
  const tabId = sender.tab.id;
  if (typeof tabId !== 'number' || tabId < 0) return;

  if (msg.type === 'allow') {
    if (!ALLOW_HOWS.has(msg.how) || overLimit(tabId, 'allow', 12, 10000)) return;
    addToken(tabId, sender.frameId, msg.how, typeof msg.url === 'string' ? msg.url.slice(0, 2000) : null, msg.sameSiteOnly === true, msg.weak === true);
  } else if (msg.type === 'blocked') {
    if (!KINDS.has(msg.kind) || !REASONS.has(msg.reason) || overLimit(tabId, 'blocked', 30, 10000)) return;
    logBlocked(tabId, {
      kind: msg.kind, reason: msg.reason, url: clamp(msg.url, 2000),
      frameUrl: cleanUrl(sender.url || ''), source: clamp(msg.source, 120) || undefined,
    });
  } else if (msg.type === 'topGesture') {
    if (sender.frameId === 0) topGestureAt.set(tabId, Date.now());
  } else if (msg.type === 'frameTopLink') {
    // The user clicked a real target=_top link inside embedded content.
    if (sender.frameId !== 0 && typeof msg.url === 'string') frameTopLink.set(tabId, { url: msg.url.slice(0, 2000), at: Date.now() });
  } else if (msg.type === 'frameGesture') {
    // A child frame saw the user press the pointer: remember it, tell the top frame.
    if (sender.frameId === 0 || overLimit(tabId, 'frameGesture', 4, 1000)) return;
    frameGestureAt.set(tabId, Date.now());
    chrome.tabs.sendMessage(tabId, { type: 'frameGesture' }, { frameId: 0 }).catch(() => {});
  } else if (msg.type === 'tabState') {
    // A top frame asks at startup: did this tab open another tab recently?
    if (sender.frameId !== 0) return;
    const at = newTabAt.get(tabId);
    const weakOpened = weakTabs.delete(tabId);
    sendResponse({ newTabAgo: at ? Date.now() - at : null, weakOpened });
    return;
  } else if (msg.type === 'getMode') {
    // Incognito tabs: per-site choices made there live only in memory.
    const site = typeof msg.site === 'string' ? msg.site.slice(0, 255) : null;
    PS.getMode(site, !!sender.tab.incognito).then((mode) => sendResponse({ mode })).catch(() => sendResponse({ mode: 'smart' }));
    return true;
  } else if (msg.type === 'watchNav') {
    // The top frame let a suspicious same-site navigation through: follow it.
    if (sender.frameId !== 0) return;
    const site = PS.siteOfUrl(sender.url || '');
    // `also`: the sign-in/payment host the page is handing off to.
    const also = typeof msg.also === 'string' && PS.isProviderFlow(msg.also) ? PS.siteOfUrl(msg.also) : null;
    if (site) navWatch.set(tabId, { until: Date.now() + WATCH_MS, sites: new Set([site, also].filter(Boolean)) });
  } else if (msg.type === 'frameOverlay') {
    // The top frame saw a click go into a near-invisible frame. The frame's own
    // "allow" can arrive in the same instant, so also revoke child-frame
    // tokens minted just before this signal (order-independent).
    if (sender.frameId === 0) {
      frameOverlayAt.set(tabId, Date.now());
      const arr = (tokens.get(tabId) || []).filter((t) => t.frameId === 0 || t.exp - TOKEN_TTL < Date.now() - 1500);
      tokens.set(tabId, arr);
    }
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
  if ((await PS.getMode(site, !!src.incognito)) === 'off') return;
  let tok = takeToken(d.sourceTabId, d.url, site);
  if (!tok) { await sleep(GRACE); tok = takeToken(d.sourceTabId, d.url, site); }
  // A tab opened from a child frame: give the top frame's "that frame is
  // invisible" signal a moment to arrive before trusting the frame's click.
  if (tok && tok.frameId !== 0) {
    await sleep(150);
    if (Date.now() - (frameOverlayAt.get(d.sourceTabId) || 0) < 2000) tok = null;
  }
  if (tok) {
    // Tell the opener's top frame: redirects of that tab now look like tab-unders.
    newTabAt.set(d.sourceTabId, Date.now());
    chrome.tabs.sendMessage(d.sourceTabId, { type: 'newTab' }, { frameId: 0 }).catch(() => {});
    if (tok.weak || tok.sameSiteOnly) {
      const allowed = new Set([site, PS.siteOfUrl(tok.url || '') || site].filter(Boolean));
      tabWatch.set(d.tabId, { until: Date.now() + WATCH_MS, allowed, sourceTabId: d.sourceTabId });
      if (tok.weak) weakTabs.add(d.tabId);
    }
    return;
  }
  const swapped = takeSwappedLink(d.sourceTabId, d.url);
  let tab = null;
  try { tab = await chrome.tabs.get(d.tabId); await chrome.tabs.remove(d.tabId); } catch { return; }
  if (swapped) {
    // Close the ad, open the page the user actually clicked.
    chrome.tabs.create({ url: swapped.url, index: tab ? tab.index : undefined, openerTabId: d.sourceTabId, active: tab ? tab.active : false }).catch(() => {});
    logBlocked(d.sourceTabId, { kind: 'new-tab', reason: 'link-swapped', url: clamp(d.url, 2000) });
    return;
  }
  logBlocked(d.sourceTabId, { kind: 'new-tab', reason: 'no-user-intent', url: clamp(d.url, 2000) });
});

// Fresh log for each new page in the tab; nothing outlives the tab.
chrome.webNavigation.onCommitted.addListener(async (d) => {
  if (d.frameId !== 0) return;
  const prevUrl = lastTopUrl.get(d.tabId);
  lastTopUrl.set(d.tabId, d.url);
  if (await checkFrameTakeover(d, prevUrl)) return;
  const now = Date.now();
  const hop = isRedirectHop(d);
  const tw = tabWatch.get(d.tabId);
  if (tw) {
    if (now > tw.until || !hop) tabWatch.delete(d.tabId);
    else if (!landingOk(d.url, tw.allowed)) {
      tabWatch.delete(d.tabId);
      chrome.tabs.remove(d.tabId).catch(() => {});
      logBlocked(tw.sourceTabId, { kind: 'new-tab', reason: 'redirect-chain', url: clamp(d.url, 2000) });
      return;
    }
  }
  const nw = navWatch.get(d.tabId);
  if (nw) {
    navWatch.delete(d.tabId);
    if (now <= nw.until && hop && !landingOk(d.url, nw.sites)) {
      restoring.add(d.tabId);
      chrome.tabs.goBack(d.tabId).catch(() => { restoring.delete(d.tabId); });
      logBlocked(d.tabId, { kind: 'redirect', reason: 'redirect-chain', url: clamp(d.url, 2000) });
      return;
    }
    // Still on an allowed site (e.g. a client-side hop): keep following.
    if (now <= nw.until && nw.sites.has(PS.siteOfUrl(d.url))) navWatch.set(d.tabId, nw);
  }
  if (restoring.has(d.tabId)) { restoring.delete(d.tabId); return; }
  // The user went somewhere themselves (typed a URL, used a bookmark or the
  // address bar): the "opened a tab" memory is over. Script navigations are
  // not labelled as redirects by Chrome, so they don't clear it.
  if (['typed', 'auto_bookmark', 'generated', 'keyword', 'keyword_generated'].includes(d.transitionType) ||
      (d.transitionQualifiers || []).includes('from_address_bar')) newTabAt.delete(d.tabId);
  if (d.transitionType !== 'reload') clearTab(d.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => {
  tokens.delete(tabId);
  frameOverlayAt.delete(tabId);
  tabWatch.delete(tabId);
  navWatch.delete(tabId);
  newTabAt.delete(tabId);
  frameGestureAt.delete(tabId); topGestureAt.delete(tabId); frameTopLink.delete(tabId); lastTopUrl.delete(tabId);
  weakTabs.delete(tabId);
  restoring.delete(tabId);
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
