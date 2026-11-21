// PopShield bridge — isolated-world content script. Connects the page-world
// script (inject.js) to extension storage and the background worker.
(() => {
  'use strict';
  let nonce = null;
  let mode = null;

  // The mode follows the top-level site, so a video-player iframe inherits the
  // setting of the page that embeds it.
  let topSite;
  try {
    const anc = location.ancestorOrigins;
    const topOrigin = window === window.top ? location.href : (anc && anc.length ? anc[anc.length - 1] : location.href);
    topSite = PS.siteOfUrl(topOrigin);
  } catch { topSite = null; }

  function down(msg) {
    if (nonce) document.dispatchEvent(new CustomEvent('ps-' + nonce + '-down', { detail: JSON.stringify(msg) }));
  }
  function onUp(e) {
    let m; try { m = JSON.parse(e.detail); } catch { return; }
    if (m.type !== 'blocked' && m.type !== 'allow' && m.type !== 'frameGesture') return;
    m.frameUrl = location.href;
    chrome.runtime.sendMessage(m).catch(() => {});
  }
  function onHello(e) {
    if (typeof e.detail !== 'string') return;
    if (nonce && e.detail !== nonce) return; // only ever talk to our own page script
    nonce = e.detail;
    document.addEventListener('ps-' + nonce + '-up', onUp);
    down({ type: 'connected' });
    if (mode) down({ type: 'mode', mode });
  }
  document.addEventListener('popshield:hello', onHello);
  document.dispatchEvent(new CustomEvent('popshield:req')); // in case inject.js ran first

  // document.open() erases our listeners; reattach when the root element is replaced.
  let root = document.documentElement;
  new MutationObserver(() => {
    if (document.documentElement === root) return;
    root = document.documentElement;
    document.addEventListener('popshield:hello', onHello);
    if (nonce) document.addEventListener('ps-' + nonce + '-up', onUp);
    document.dispatchEvent(new CustomEvent('popshield:req'));
  }).observe(document, { childList: true });

  async function refresh() {
    try {
      const m = await PS.getMode(topSite);
      if (m !== mode) { mode = m; down({ type: 'mode', mode }); }
    } catch {}
  }
  refresh();
  // Top frame only: "the user is clicking inside a child frame", relayed by the background.
  if (window === window.top) {
    chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'frameGesture') down({ type: 'frameGesture' }); });
  }
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local') refresh(); });
})();
