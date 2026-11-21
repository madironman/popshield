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
  // Per-site choices made in incognito are kept in memory only
  // (chrome.storage.session), so no incognito site name ever reaches disk.
  async function getMode(site, incognito) {
    const s = await getSettings();
    if (incognito && site) {
      const { incogSites } = await chrome.storage.session.get({ incogSites: {} });
      if (MODES.includes(incogSites[site])) return incogSites[site];
    }
    const m = site && s.sites[site];
    return MODES.includes(m) ? m : s.defaultMode;
  }
  async function setSiteMode(site, mode, incognito) {
    if (incognito) {
      const { incogSites } = await chrome.storage.session.get({ incogSites: {} });
      if (mode === null) delete incogSites[site];
      else if (MODES.includes(mode)) incogSites[site] = mode;
      await chrome.storage.session.set({ incogSites });
      return;
    }
    const s = await getSettings();
    if (mode === null) delete s.sites[site];
    else if (MODES.includes(mode)) s.sites[site] = mode;
    await chrome.storage.local.set({ sites: s.sites });
  }
  async function setDefaultMode(mode) {
    if (MODES.includes(mode)) await chrome.storage.local.set({ defaultMode: mode });
  }
  // Sign-in and payment FLOWS a page may legitimately send you to without a
  // live click (after an await, an OAuth round-trip, a checkout hand-off).
  // Exact hosts + path prefixes only: never whole domains (multi-tenant
  // domains like *.auth0.com host attacker content) and never "any URL with
  // client_id=" (a page controls the query string).
  const PROVIDER_FLOWS = [
    ['accounts.google.com', /^\//],
    ['appleid.apple.com', /^\/auth\//],
    ['login.microsoftonline.com', /^\/[^/]+\/oauth2\//],
    ['login.live.com', /^\/oauth20_authorize\.srf/],
    ['github.com', /^\/login\/oauth\/authorize/],
    ['gitlab.com', /^\/oauth\/authorize/],
    ['www.facebook.com', /^\/(v\d+\.\d+\/)?dialog\/oauth/],
    ['x.com', /^\/i\/oauth2\/authorize/],
    ['twitter.com', /^\/i\/oauth2\/authorize/],
    ['api.twitter.com', /^\/oauth\/authorize/],
    ['www.linkedin.com', /^\/oauth\/v2\/authorization/],
    ['discord.com', /^\/(api\/)?oauth2\/authorize/],
    ['slack.com', /^\/(openid\/connect|oauth)\/(v2\/)?authorize/],
    ['zoom.us', /^\/oauth\/authorize/],
    ['www.dropbox.com', /^\/oauth2\/authorize/],
    ['auth.atlassian.com', /^\/authorize/],
    ['www.amazon.com', /^\/ap\/(signin|oa)/],
    ['login.yahoo.com', /^\//],
    ['www.paypal.com', /^\/(checkoutnow|signin|connect|webapps\/hermes|pay\/)/],
    ['checkout.stripe.com', /^\//],
    ['connect.stripe.com', /^\/oauth\/authorize/],
    ['checkout.razorpay.com', /^\//],
    ['api.razorpay.com', /^\/v1\/checkout\//],
  ];
  function isProviderFlow(u) {
    try {
      const x = new URL(u);
      if (x.protocol !== 'https:') return false;
      for (let i = 0; i < PROVIDER_FLOWS.length; i++) {
        if (x.hostname === PROVIDER_FLOWS[i][0] && PROVIDER_FLOWS[i][1].test(x.pathname)) return true;
      }
      return false;
    } catch { return false; }
  }
  return { MODES, siteOf, siteOfUrl, isProviderFlow, getSettings, getMode, setSiteMode, setDefaultMode };
})();
