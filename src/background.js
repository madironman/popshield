// PopShield background service worker.
//  * Backstop: any tab a page opens without a matching "user intended this"
//    token from the content script is closed immediately.
//  * Keeps a per-tab log of blocked items and the toolbar badge count.
importScripts('common.js');

const TOKEN_TTL = 3000;        // ms a user-intended open stays valid
const CONTEXTMENU_TTL = 60000; // "Open link in new tab" via right-click can take a while
const GRACE = 400;             // wait for a late token message before closing a tab
const LOG_MAX = 50;

const tokens = new Map(); // tabId -> [{ exp, sameSiteOnly }, ...]

function addToken(tabId, ttl, sameSiteOnly) {
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  arr.push({ exp: Date.now() + ttl, sameSiteOnly: !!sameSiteOnly });
  tokens.set(tabId, arr);
}
// Consume one token for a new tab opened at `url` from a page on `srcSite`.
// A "sameSiteOnly" token (from a click on a decoy "#" link) can't be spent on
// a tab that opens on another site.
function takeToken(tabId, url, srcSite) {
  const arr = (tokens.get(tabId) || []).filter((t) => t.exp > Date.now());
  const site = PS.siteOfUrl(url);
  const i = arr.findIndex((t) => !t.sameSiteOnly || (site && site === srcSite));
  if (i >= 0) arr.splice(i, 1);
  tokens.set(tabId, arr);
  return i >= 0;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Serialise log writes so concurrent events don't clobber each other.
let logChain = Promise.resolve();
function logBlocked(tabId, entry) {
  logChain = logChain.then(async () => {
    const key = 'log:' + tabId;
    const cur = (await chrome.storage.session.get({ [key]: [] }))[key];
    cur.unshift({ ...entry, time: Date.now() });
    cur.length = Math.min(cur.length, LOG_MAX);
    const total = ((await chrome.storage.session.get({ ['count:' + tabId]: 0 }))['count:' + tabId]) + 1;
    await chrome.storage.session.set({ [key]: cur, ['count:' + tabId]: total });
    try {
      await chrome.action.setBadgeText({ tabId, text: String(total > 999 ? '999+' : total) });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#d93025' });
    } catch {}
  }).catch(() => {});
  return logChain;
}
async function clearTab(tabId) {
  await chrome.storage.session.remove(['log:' + tabId, 'count:' + tabId]);
  try { await chrome.action.setBadgeText({ tabId, text: '' }); } catch {}
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab && sender.tab.id;
  if (msg.type === 'allow' && tabId != null) {
    addToken(tabId, msg.how === 'contextmenu' ? CONTEXTMENU_TTL : TOKEN_TTL, msg.sameSiteOnly);
  } else if (msg.type === 'blocked' && tabId != null) {
    logBlocked(tabId, { kind: msg.kind, reason: msg.reason, url: String(msg.url || '').slice(0, 2000), frameUrl: msg.frameUrl, source: msg.source ? String(msg.source).slice(0, 500) : undefined });
  } else if (msg.type === 'frameGesture' && tabId != null && sender.frameId !== 0) {
    // A child frame saw the user press the pointer: tell the top frame.
    chrome.tabs.sendMessage(tabId, { type: 'frameGesture' }, { frameId: 0 }).catch(() => {});
  }
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (d) => {
  if (d.sourceTabId == null || d.sourceTabId < 0) return;
  let src;
  try { src = await chrome.tabs.get(d.sourceTabId); } catch { return; }
  const site = PS.siteOfUrl(src.url || src.pendingUrl || '');
  if (!site) return; // chrome://, extension pages, file:// etc.
  if ((await PS.getMode(site)) === 'off') return;
  if (takeToken(d.sourceTabId, d.url, site)) return;
  await sleep(GRACE);
  if (takeToken(d.sourceTabId, d.url, site)) return;
  try { await chrome.tabs.remove(d.tabId); } catch { return; }
  logBlocked(d.sourceTabId, { kind: 'new-tab', reason: 'no-user-intent', url: d.url });
});

// Fresh log for each new page in the tab.
chrome.webNavigation.onCommitted.addListener((d) => {
  if (d.frameId === 0 && d.transitionType !== 'reload') clearTab(d.tabId);
});
chrome.tabs.onRemoved.addListener((tabId) => { tokens.delete(tabId); clearTab(tabId); });
