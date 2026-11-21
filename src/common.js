// Shared helpers for the background worker, the bridge content script and the popup.
// (inject.js runs in the page's world and keeps its own private copy.)
var PS = (() => {
  const MODES = ['smart', 'strict', 'off'];
  const MULTI = new Set(['co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.jp',
    'co.in', 'co.nz', 'com.br', 'com.cn', 'com.mx', 'co.za', 'com.tr', 'com.sg', 'com.hk', 'co.kr', 'com.ar']);

  function siteOf(host) {
    host = String(host || '').replace(/\.$/, '').toLowerCase();
    if (!host || /^[\d.]+$/.test(host) || host.includes(':')) return host;
    const p = host.split('.');
    if (p.length <= 2) return host;
    const last2 = p.slice(-2).join('.');
    return MULTI.has(last2) ? p.slice(-3).join('.') : last2;
  }
  function siteOfUrl(u) {
    try {
      const x = new URL(u);
      return /^https?:$/.test(x.protocol) ? siteOf(x.hostname) : null;
    } catch { return null; }
  }
  async function getSettings() {
    const s = await chrome.storage.local.get({ defaultMode: 'smart', sites: {} });
    if (!MODES.includes(s.defaultMode)) s.defaultMode = 'smart';
    return s;
  }
  async function getMode(site) {
    const s = await getSettings();
    const m = site && s.sites[site];
    return MODES.includes(m) ? m : s.defaultMode;
  }
  async function setSiteMode(site, mode) {
    const s = await getSettings();
    if (mode === null) delete s.sites[site];
    else if (MODES.includes(mode)) s.sites[site] = mode;
    await chrome.storage.local.set({ sites: s.sites });
  }
  async function setDefaultMode(mode) {
    if (MODES.includes(mode)) await chrome.storage.local.set({ defaultMode: mode });
  }
  return { MODES, siteOf, siteOfUrl, getSettings, getMode, setSiteMode, setDefaultMode };
})();
