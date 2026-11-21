// Each scenario reproduces one technique ad scripts use (or one legit pattern
// that must keep working). Selected with ?t=<name>.
const AD = window.AD_ORIGIN + '/ad.html';
const params = new URLSearchParams(location.search);
const t = params.get('t');
const $ = (s) => document.querySelector(s);
const ui = $('#ui');

function el(html, parent = ui) { const d = document.createElement('div'); d.innerHTML = html.trim(); const n = d.firstChild; parent.append(n); return n; }
function playerControls(parent = ui) {
  // The page's own control: a box with one button that most scenarios click.
  // (playerControls, #player and #play are historical test identifiers.)
  const p = el('<div id="player" style="width:640px;height:300px;background:#000;position:relative"><button id="play" style="position:absolute;left:10px;bottom:10px">Play</button></div>', parent);
  $('#play').addEventListener('click', () => { $('#play').textContent = 'Pause'; document.body.dataset.played = '1'; });
  return p;
}

const S = {
  // ---------- attacks (should be blocked) ----------
  'doc-click-popunder'() { // page-wide popunder hook: one listener that hears every click on the page
    playerControls();
    document.addEventListener('click', () => window.open(AD + '?doc', '_blank'));
  },
  'window-mousedown-popunder'() {
    playerControls();
    window.addEventListener('mousedown', () => window.open(AD + '?mousedown'), true);
  },
  'body-pointerup-popunder'() {
    playerControls();
    document.body.addEventListener('pointerup', () => window.open(AD + '?pointerup'));
  },
  'overlay-anchor'() { // transparent full-page <a target=_blank> on top of everything
    playerControls();
    el(`<a id="ov" href="${AD}?overlay" target="_blank" style="position:fixed;inset:0;z-index:99999;background:transparent"></a>`);
  },
  'overlay-div-listener'() { // invisible div with its own click listener
    playerControls();
    const d = el('<div id="ov" style="position:fixed;inset:0;z-index:99999;opacity:0.01;background:#fff"></div>');
    d.addEventListener('click', () => { window.open(AD + '?overlaydiv'); d.remove(); });
  },
  'synthetic-anchor-timer'() { // click -> later a hidden <a target=_blank>.click()
    playerControls();
    document.addEventListener('click', () => setTimeout(() => {
      const a = document.createElement('a'); a.href = AD + '?synthetic'; a.target = '_blank'; a.click();
    }, 50));
  },
  'dispatch-anchor'() {
    playerControls();
    const a = el(`<a id="hidden" href="${AD}?dispatch" target="_blank" style="display:none">x</a>`);
    document.addEventListener('click', () => a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  },
  'form-submit-blank'() {
    playerControls();
    const f = el(`<form id="f" action="${AD}" method="get" target="_blank"><input name="form" value="1"></form>`);
    document.addEventListener('click', () => f.submit());
  },
  'submit-button-click'() { // click a hidden submit button of a target=_blank form
    playerControls();
    const f = el(`<form id="f" action="${AD}" method="get" target="_blank" style="display:none"><input name="btn" value="1"><button id="sb">go</button></form>`);
    document.addEventListener('click', () => $('#sb').click());
  },
  'iframe-pristine-open'() { // grab a fresh window.open from a blank iframe
    playerControls();
    document.addEventListener('click', () => {
      const f = document.createElement('iframe'); f.style.display = 'none'; document.body.append(f);
      f.contentWindow.open(AD + '?iframeopen');
    });
  },
  'frames-index-open'() { // same, but via window.frames[] (skips the contentWindow getter)
    playerControls();
    document.addEventListener('click', () => {
      const f = document.createElement('iframe'); f.style.display = 'none'; document.body.append(f);
      window.frames[window.frames.length - 1].open(AD + '?framesindex');
    });
  },
  'tab-under'() { // open the real page in a new tab, turn this tab into an ad
    playerControls();
    document.addEventListener('click', () => { window.open(location.href); location.href = AD + '?tabunder'; });
  },
  'click-redirect'() { // hijack this tab on click
    playerControls();
    document.addEventListener('click', () => { location.href = AD + '?redirect'; });
  },
  'open-self-redirect'() {
    playerControls();
    document.addEventListener('click', () => window.open(AD + '?openself', '_self'));
  },
  'timer-popup'() { // no user action at all
    setTimeout(() => window.open(AD + '?timer'), 200);
  },
  'player-iframe-popup'() { // a widget embedded from another site (cross-site frame) whose ad script hooks clicks
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=popup" style="width:660px;height:320px;border:0"></iframe>`);
  },
  'player-iframe-top-redirect'() { // a widget embedded from another site that hijacks the whole tab
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=top" style="width:660px;height:320px;border:0"></iframe>`);
  },

  // ---------- legit (must keep working) ----------
  'legit-button-open'() { // share / OAuth-style button
    el('<button id="share">Share</button>');
    $('#share').addEventListener('click', () => window.open(AD + '?share', 'share', 'width=500,height=400'));
  },
  'legit-react-root'() { // React 17+ delegates events at the root container
    const root = el('<div id="app"><button id="btn">Open docs</button></div>');
    root.addEventListener('click', (e) => { if (e.target.id === 'btn') window.open(AD + '?react'); });
  },
  'legit-blank-link'() {
    el(`<a id="link" href="${AD}?blanklink" target="_blank">Open in new tab</a>`);
  },
  'legit-modifier-link'() {
    el(`<a id="link" href="${AD}?modlink">Normal link</a>`);
  },
  'legit-big-image-link'() { // large, visible, clickable banner — not an overlay
    el(`<a id="link" href="${AD}?banner" target="_blank" style="position:absolute;inset:0"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" style="width:100%;height:100%"></a>`);
  },
  'legit-scripted-anchor'() { // "Open report" button building a link and clicking it
    el('<button id="report">Open report</button>');
    $('#report').addEventListener('click', () => {
      const a = document.createElement('a'); a.href = AD + '?report'; a.target = '_blank'; a.click();
    });
  },
  'legit-download-anchor'() { // client-side download via a.click() from a timer — never blocked
    el('<button id="dl">Download</button>');
    $('#dl').addEventListener('click', () => setTimeout(() => {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['hello'])); a.download = 'x.txt'; a.target = '_blank'; a.click();
      document.body.dataset.downloaded = '1';
    }, 50));
  },
  'legit-same-site-redirect'() {
    playerControls();
    document.addEventListener('click', () => { location.href = '/other.html'; });
  },
  'legit-onload-redirect'() { // cross-site redirect without any user interaction (e.g. SSO)
    setTimeout(() => { location.href = AD + '?onload'; }, 100);
  },
  'legit-link-navigation'() { // plain cross-site link click in the same tab
    el(`<a id="link" href="${AD}?navlink">Go</a>`);
  },
  'legit-leave-after-player'() { // click inside the embedded widget, then click a real link on the page
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=none" style="width:660px;height:320px;border:0"></iframe>`);
    el(`<p><a id="link" href="${AD}?leave">Go somewhere else</a></p>`);
  },
  'legit-form-blank'() { // a visible form the user submits into a new tab
    el(`<form action="${AD}" method="get" target="_blank"><input id="q" name="q" value="hello"><button id="go">Search</button></form>`);
  },
  'backstop'() { playerControls(); }, // the test opens a tab through an unhooked window.open (CDP isolated world)
  'legit-async-open'() { // element handler opens a same-site page after an await (checkout-style)
    el('<button id="async">Checkout</button>');
    $('#async').addEventListener('click', async () => { await new Promise((r) => setTimeout(r, 30)); window.open('/other.html?async'); });
  },
};

// ---- framework simulations -------------------------------------------------
// React <=16 attaches ONE listener on document and calls the clicked element's
// props.onClick, which it reads from node.__reactEventHandlers$<key>.
function fakeReact16(btn, onClick) {
  btn.__reactEventHandlers$k3y = { onClick, children: 'x' };
  document.addEventListener('click', function dispatchDiscreteEvent(e) {
    for (let n = e.target; n && n !== document; n = n.parentNode) {
      const p = n.__reactEventHandlers$k3y;
      if (p && p.onClick) p.onClick({ nativeEvent: e, target: e.target });
    }
  });
}
// React 17+: same, but the listener sits on the root container and props live in __reactProps$.
function fakeReact17(root, btn, onClick) {
  btn.__reactProps$k3y = { onClick };
  root.addEventListener('click', (e) => {
    for (let n = e.target; n && n !== root; n = n.parentNode) { const p = n.__reactProps$k3y; if (p && p.onClick) p.onClick({ nativeEvent: e }); }
  });
}
// jQuery: $(document).on('click', '.share-btn', handler)
function fakeJQueryOn(selector, handler) {
  const handleObj = { selector, handler, type: 'click' };
  // Shaped like real jQuery (PopShield checks fn.jquery and expando).
  window.jQuery = { fn: { jquery: '3.7.1' }, expando: 'jQuery3710' + Math.random().toString().slice(2),
    _data: (el, key) => (el === document && key === 'events' ? { click: [handleObj] } : undefined) };
  document.addEventListener('click', (e) => {
    const m = e.target.closest(handleObj.selector);
    if (m) handleObj.handler.call(m, e); // jQuery reads handleObj.handler at dispatch time
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
Object.assign(S, {
  'legit-react16'() { el('<button id="btn">Share (React 16)</button>'); fakeReact16($('#btn'), () => window.open(AD + '?react16')); },
  'legit-react16-async'() { el('<button id="btn">Pay (React 16)</button>'); fakeReact16($('#btn'), async () => { await sleep(30); window.open('/other.html?react16async'); }); },
  'legit-react17-async'() { const root = el('<div id="root"><button id="btn">Pay (React 18)</button></div>'); fakeReact17(root, $('#btn'), async () => { await sleep(30); window.open('/other.html?react17async'); }); },
  'legit-jquery-delegated'() { el('<button id="btn" class="share-btn">Share (jQuery)</button>'); fakeJQueryOn('.share-btn', () => window.open(AD + '?jquery')); },
  'jquery-star-popunder'() { // ad using a catch-all delegated selector must NOT get the framework pass
    playerControls(); fakeJQueryOn('*', () => window.open(AD + '?jqstar'));
  },
  'react16-site-plus-popunder'() { // old-React site that ALSO has a popunder hook
    el('<button id="btn">Like</button>'); fakeReact16($('#btn'), () => { document.body.dataset.played = '1'; });
    document.addEventListener('click', () => window.open(AD + '?react16ad'));
  },
  'doc-async-await-popunder'() { // ad hook that hides behind an await
    playerControls(); document.addEventListener('click', async () => { await sleep(30); window.open(AD + '?docawait'); });
  },
  'doc-promise-popunder'() { // ad hook using a promise callback
    playerControls(); document.addEventListener('click', () => { sleep(30).then(() => window.open(AD + '?docpromise')); });
  },
  'player-iframe-top-redirect-2nd'() { // hijack only on the 2nd click inside the embedded widget
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=top2" style="width:660px;height:320px;border:0"></iframe>`);
  },
  'legit-player-then-reload'() { el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=none" style="width:660px;height:320px;border:0"></iframe>`); },
});

Object.assign(S, {
  'ad-layer-tab-under'() { // visible max-z-index ad image over the Continue button ("Continue"-button style)
    el('<button id="cont" style="position:absolute;left:400px;top:300px">Continue</button>');
    const img = el(`<img id="adimg" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'900\' height=\'500\'><rect width=\'900\' height=\'500\' fill=\'%23fc0\'/></svg>')}" style="position:absolute;left:50px;top:100px;width:900px;height:500px;z-index:2147483643">`);
    img.addEventListener('click', () => { window.open(location.href); window.open(AD + '?adlayer', '_self'); });
  },
  'element-tab-under'() { // tab-under from a normal element handler
    el('<button id="btn">Get link</button>');
    $('#btn').addEventListener('click', () => { window.open(AD + '?copy'); location.href = AD + '?under'; });
  },
  'legit-max-z-modal'() { // cookie/consent modal at max z-index with a real button
    el('<div style="position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5)"><div style="background:#fff;margin:200px auto;width:300px;padding:20px"><button id="manage">Manage options</button></div></div>');
    $('#manage').addEventListener('click', () => window.open(AD + '?consent'));
  },
  'adbox-frame'() { // blank iframe pinned at max z-index with a fake-CAPTCHA link
    playerControls();
    const f = document.createElement('iframe');
    f.id = 'adbox';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:500px;height:350px;border:0;z-index:2147483647;background:#fff';
    document.body.append(f);
    const d = f.contentDocument;
    d.open(); d.write('<body style="margin:0"><a id="robot" href="#" target="_blank" style="display:block;padding:40px;font:20px sans-serif">CONFIRM YOU ARE NOT A ROBOT</a></body>'); d.close();
    const a = d.getElementById('robot');
    a.addEventListener('click', () => { a.href = AD + '?adbox'; }); // swapped during the click
  },
  'decoy-hash-swap'() { // visible "#" link whose href is swapped to an ad during the click
    el('<a id="link" href="#" target="_blank">Claim reward</a>');
    $('#link').addEventListener('click', (e) => { e.currentTarget.href = AD + '?decoy'; });
  },
  'legit-hash-blank'() { // odd but harmless: "#" link with target=_blank opens this page again
    el('<a id="link" href="#top" target="_blank">Open this page in a new tab</a>');
  },
  'legit-chat-widget-link'() { // chat widget: script-built fixed max-z-index frame with a real help link
    const f = document.createElement('iframe');
    f.id = 'chat';
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:380px;height:500px;border:0;z-index:2147483003;background:#fff';
    document.body.append(f);
    const d = f.contentDocument;
    d.open(); d.write(`<body><a id="help" href="${AD}?helparticle" target="_blank" style="display:block;padding:30px">Read the help article</a></body>`); d.close();
  },
  'retry-loop-popunder'() { // ad script that retries window.open hundreds of times once blocked
    playerControls();
    document.addEventListener('click', () => { for (let i = 0; i < 300; i++) window.open('', '_blank'); window.open(AD + '?loop'); });
  },
});

Object.assign(S, {
  'async-cross-site-element'() { // element handler that opens an ad site after an await
    el('<button id="btn">Download</button>');
    $('#btn').addEventListener('click', async () => { await sleep(30); window.open(AD + '?asyncx'); });
  },
  'wrapper-div-popunder'() { // popunder hook on a full-page wrapper div instead of document
    const app = el('<div id="app" style="min-height:100vh"></div>', document.body);
    app.append(ui); // everything (the button box included) sits inside the wrapper
    playerControls();
    app.addEventListener('click', () => window.open(AD + '?wrapper'));
  },
  'legit-react17-root'() { // React 17+ root container covering the viewport, button opens synchronously
    const root = el('<div id="root" style="min-height:100vh"><button id="btn">Open docs (React 17)</button></div>');
    fakeReact17(root, $('#btn'), () => window.open(AD + '?react17root'));
  },
  'svg-link-dispatch'() { // hidden SVG <a target=_blank> clicked via a synthetic event
    playerControls();
    const svg = el(`<svg width="10" height="10"><a href="${AD}?svg" target="_blank"><text y="9">x</text></a></svg>`);
    const svgA = svg.querySelector('a');
    document.addEventListener('click', (e) => {
      if (svgA.contains(e.target)) return; // don't re-handle our own synthetic click
      svgA.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  },
});

// ---- red-team regressions -------------------------------------------------
// One scenario per bypass found by the red-team passes ("rt-" prefix). Each
// worked in plain Chrome AND got past some earlier PopShield version.
const REDIR = (to) => '/__redir?to=' + encodeURIComponent(to); // same-site open redirector (server.mjs)
const RT_FRAME = (mode) => window.AD_ORIGIN + '/rt-frame.html?mode=' + mode;
// An SVG <a> with only xlink:href, clicked by a synthetic event: opens a tab without any hooked API.
function unhookedOpen(url) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const a = document.createElementNS('http://www.w3.org/2000/svg', 'a');
  a.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', url); a.setAttribute('target', '_blank');
  s.append(a); document.documentElement.append(s);
  a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); s.remove();
}
Object.assign(S, {
  // -- round 1 --
  'rt-prepare-stack-trace'() { // fake an "element handler after await" stack
    playerControls();
    Error.prepareStackTrace = () => '    at async HTMLButtonElement.onclick (x)';
    document.addEventListener('click', () => setTimeout(() => window.open(AD + '?rt-pst'), 0));
  },
  'rt-bound-element-receiver'() { // timer callback bound to an element: "at HTMLButtonElement.pop"
    playerControls();
    const fake = document.createElement('button');
    function pop() { window.open(AD + '?rt-bound'); }
    document.addEventListener('click', () => setTimeout(pop.bind(fake), 0));
  },
  'rt-currenttarget-spoof'() { // page rewrites Event.prototype.currentTarget
    playerControls();
    const g = Object.getOwnPropertyDescriptor(Event.prototype, 'currentTarget').get;
    const fake = document.createElement('button');
    Object.defineProperty(Event.prototype, 'currentTarget', { configurable: true, get() {
      const c = g.call(this); return (c === document || c === window) && this.__ad ? fake : c; } });
    document.addEventListener('click', (e) => { e.__ad = 1; window.open(AD + '?rt-ct'); });
  },
  'rt-timer-redirect'() { // page-wide hook, redirect from a timer
    playerControls();
    document.addEventListener('click', () => setTimeout(() => { location.href = AD + '?rt-timer'; }, 0), { once: true });
  },
  'rt-delayed-tab-under'() { // cache-busted copy tab, redirect 2.1 s later
    const app = el('<div id="app"></div>', document.body); app.append(ui); playerControls();
    app.addEventListener('click', () => {
      window.open(location.href.split('?')[0] + '?t=none&copy=1');
      setTimeout(() => { location.href = AD + '?rt-tabunder'; }, 2100);
    }, { once: true });
  },
  'rt-overlay-link-pixel'() { // invisible full-page link with a 1x1 image inside
    playerControls();
    el(`<a href="${AD}?rt-pixel" target="_blank" style="position:fixed;inset:0;opacity:0;z-index:99"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="1" height="1"></a>`);
  },
  'rt-overlay-parent-opacity'() { // opacity on the wrapper, the link itself is opaque
    playerControls();
    el(`<div style="position:fixed;inset:0;opacity:0;z-index:99"><a href="${AD}?rt-parentopacity" target="_blank" style="display:block;width:100%;height:100%"></a></div>`);
  },
  'rt-overlay-near-threshold'() { // opacity 0.15, background alpha 0.01
    playerControls();
    el(`<a href="${AD}?rt-alpha" target="_blank" style="position:fixed;inset:0;opacity:0.15;background:rgba(255,255,255,0.01);z-index:99"></a>`);
  },
  'rt-nonce-leak-document-open'() { // document.open() used to re-broadcast the bridge nonce
    setTimeout(() => {
      let nonce;
      document.open();
      document.addEventListener('popshield:hello', (e) => { nonce = e.detail; });
      document.write('<!doctype html><body data-ready="1"><button id="play" style="margin:40px">Play</button></body>');
      document.close();
      setTimeout(() => {
        if (nonce) document.dispatchEvent(new CustomEvent('ps-' + nonce + '-down', { detail: JSON.stringify({ type: 'mode', mode: 'off' }) }));
        document.addEventListener('click', () => {
          if (nonce) document.dispatchEvent(new CustomEvent('ps-' + nonce + '-up', { detail: JSON.stringify({ type: 'allow', how: 'contextmenu' }) }));
          window.open(AD + '?rt-nonce');
        });
      }, 50);
    }, 0);
  },
  'rt-poison-trim'() { // String.prototype.trim poisoned to make an empty overlay look non-empty
    playerControls();
    el(`<a href="${AD}?rt-trim" target="_blank" style="position:fixed;inset:0;opacity:0;z-index:99"></a>`);
    const trim = String.prototype.trim;
    String.prototype.trim = function () { const r = trim.call(this); return r === '' ? ' ' : r; };
  },
  'rt-poison-regexp'() { // RegExp.prototype.test poisoned so the URL scheme check fails
    playerControls();
    const test = RegExp.prototype.test;
    RegExp.prototype.test = function (s) { return this.source === '^https?:$' ? false : test.call(this, s); };
    document.addEventListener('click', () => { location.href = AD + '?rt-regexp'; });
  },
  'rt-poison-useractivation'() { // navigator.userActivation lies "inactive"
    playerControls();
    Object.defineProperty(UserActivation.prototype, 'isActive', { get: () => false, configurable: true });
    document.addEventListener('click', () => { location.href = AD + '?rt-ua'; });
  },
  'rt-pristine-click'() { // HTMLElement.prototype.click from a fresh iframe realm
    playerControls();
    const f = document.createElement('iframe'); f.style.display = 'none'; document.documentElement.append(f);
    const pristineClick = frames[frames.length - 1].HTMLElement.prototype.click;
    document.addEventListener('click', () => {
      const a = document.createElement('a'); a.href = AD + '?rt-pristineclick'; a.target = '_blank';
      pristineClick.call(a);
    });
  },
  'rt-contextmenu-token-ride'() { // whole page inside an href'd element; right-click, then click
    el('<a href="#" style="display:contents;color:inherit"><button id="play">Play</button></a>');
    document.addEventListener('click', (e) => { e.preventDefault(); unhookedOpen(AD + '?rt-ctxtoken'); }, true);
  },
  'rt-svg-xlink-dispatch'() { // SVG <a> with only xlink:href, synthetic click
    playerControls();
    const svg = el('<svg width="0" height="0"><a id="sa" target="_blank"><rect width="1" height="1"/></a></svg>');
    svg.querySelector('#sa').setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', AD + '?rt-svgxlink');
    document.addEventListener('click', () => svg.querySelector('#sa').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
  },
  'rt-transparent-xframe'() { // invisible full-page cross-site frame, div listener inside
    playerControls();
    el(`<iframe src="${RT_FRAME('fulldiv')}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0;z-index:99"></iframe>`);
  },
  'rt-frame-redirect-delayed'() { // embedded widget frame hijacks the top page 1.7 s after the click
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=topdelay&ms=1700" style="width:660px;height:320px;border:0"></iframe>`);
  },
  'rt-frame-redirect-blur-first'() { // embedded widget frame gives focus back to the top page, then hijacks
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=topblur" style="width:660px;height:320px;border:0"></iframe>`);
  },
  'rt-ctrl-anywhere-token'() { // ctrl+click on a non-link used to mint a token for any site
    playerControls();
    document.addEventListener('click', () => unhookedOpen(AD + '?rt-ctrl'));
  },
  'rt-real-link-token-race'() { // the user's real link click; an unhooked ad open races for its token
    el('<a id="dl" href="/other.html?download" target="_blank">Download</a>');
    document.addEventListener('click', () => unhookedOpen(AD + '?rt-race'), true);
  },
  'rt-meta-refresh'() { // <meta refresh> injected on click
    playerControls();
    document.addEventListener('click', () => {
      const m = document.createElement('meta'); m.httpEquiv = 'refresh'; m.content = '0;url=' + AD + '?rt-meta';
      document.head.append(m);
    }, { once: true });
  },
  'rt-fake-jquery'() { // jQuery-shaped object with a match-everything delegated selector
    playerControls();
    const h = { selector: '*:not(.zz)', handler() { window.open(AD + '?rt-fakejq'); } };
    window.jQuery = { _data: (n, k) => (n === document && k === 'events' ? { click: [h] } : undefined) };
    document.addEventListener('click', () => h.handler());
  },
  'rt-fake-react-props'() { // React-shaped props planted on the clicked node, called from a page-wide listener
    playerControls();
    const K = '__reactProps$rtx';
    document.addEventListener('pointerdown', (e) => { e.target[K] = { onClick() { window.open(AD + '?rt-fakereact'); } }; }, true);
    document.addEventListener('click', (e) => { const p = e.target[K]; if (p) p.onClick(); });
  },
  'rt-wrapper-redirect'() { // same-tab hijack from a full-page wrapper div
    const app = el('<div id="app" style="min-height:100vh"></div>', document.body); app.append(ui); playerControls();
    app.addEventListener('click', () => { location.href = AD + '?rt-wrapredirect'; }, { once: true });
  },
  'rt-hijack-legit-popup'() { // a legit share popup is later sent to an ad by the opener
    el('<button id="share">Share</button>');
    let w;
    $('#share').addEventListener('click', () => { w = window.open('/other.html?share', 'share'); });
    document.addEventListener('click', () => setTimeout(() => { if (w) w.location.href = AD + '?rt-reused'; }, 1500));
  },
  'rt-sandboxed-realm'() { // script-less same-origin frame: its realm is never patched
    playerControls();
    const f = el('<iframe sandbox="allow-same-origin" srcdoc="<p>x" style="display:none"></iframe>');
    document.addEventListener('click', () => {
      const a = document.createElement('a'); a.href = AD + '?rt-sandboxrealm'; a.target = '_blank';
      f.contentWindow.HTMLElement.prototype.click.call(a);
    });
  },
  // -- round 2 --
  'rt-async-forge-redirector'() { // forged element frame after a timer, same-site 302 to the ad
    playerControls();
    const b = document.createElement('button');
    b.addEventListener('x', () => window.open(REDIR(AD + '?rt-asyncforge'), '_blank', 'noopener'));
    document.addEventListener('click', () => setTimeout(() => b.dispatchEvent(new Event('x')), 0));
  },
  'rt-redirector-navigation'() { // page-wide hook sends this tab to a same-site redirector
    playerControls();
    document.addEventListener('click', () => { location.href = REDIR(AD + '?rt-redirector'); });
  },
  'rt-tabunder-pointerup-reset'() { // tab opened on pointerup; the click resets state; redirect after 5.3 s
    playerControls();
    $('#play').addEventListener('pointerup', () => window.open('/other.html?watch'));
    $('#play').addEventListener('click', () => setTimeout(() => { location.href = AD + '?rt-tabunder-reset'; }, 5300));
  },
  'rt-delayed-redirect'() { // element click, then a redirect after the 5 s activation window
    playerControls();
    $('#play').addEventListener('click', () => setTimeout(() => { location.href = AD + '?rt-delayed'; }, 5300));
  },
  'rt-tabunder-after-user-link'() { // real target=_blank link, then the original tab is redirected 5.3 s later
    el('<a id="link" href="/other.html?watch" target="_blank">Watch</a>');
    $('#link').addEventListener('click', () => setTimeout(() => { location.href = AD + '?rt-tabunder-link'; }, 5300));
  },
  'rt-two-49pct-wrappers'() { // two wrappers, each just under half the viewport
    const top = el('<div id="w1" style="height:49vh;overflow:hidden"></div>', document.body);
    el('<div id="w2" style="height:49vh;overflow:hidden"><p>more content</p></div>', document.body);
    top.append(ui); playerControls();
    for (const w of [top, $('#w2')]) w.addEventListener('click', () => window.open(AD + '?rt-wrap49'));
  },
  'rt-closed-shadow-overlay'() { // invisible overlay inside a closed shadow root, host has no box
    playerControls();
    const h = el('<span id="h" style="display:contents"></span>', document.body);
    h.attachShadow({ mode: 'closed' }).innerHTML = '<div style="position:fixed;inset:0;z-index:99"></div>';
    h.addEventListener('click', () => window.open(AD + '?rt-shadow-overlay'));
  },
  'rt-overlay-submit-button'() { // invisible full-page submit button of a target=_blank form
    playerControls();
    el(`<form id="rtf" action="${AD}" method="get"><input type="hidden" name="rt" value="submit-overlay"></form>`);
    el('<button form="rtf" formtarget="_blank" style="position:fixed;inset:0;opacity:0;z-index:99;border:0"></button>');
  },
  'rt-keystroke-requestsubmit'() { // any keystroke in a field, then requestSubmit() from a timer
    el(`<form id="rtf" action="${AD}" target="_blank"><input id="q" name="q" placeholder="search"></form>`);
    $('#q').addEventListener('keyup', () => setTimeout(() => $('#rtf').requestSubmit(), 0));
  },
  'rt-small-invisible-xframe'() { // opacity-0 cross-site frame exactly over the page's button
    playerControls();
    const r = $('#play').getBoundingClientRect();
    el(`<iframe src="${RT_FRAME('button')}" style="position:absolute;left:${r.left + scrollX}px;top:${r.top + scrollY}px;width:${r.width}px;height:${r.height}px;border:0;opacity:0;z-index:9"></iframe>`, document.body);
  },
  'rt-xframe-opacity021-link'() { // full-page cross-site frame at opacity 0.21 with a link inside
    playerControls();
    el(`<iframe src="${RT_FRAME('link')}" style="position:fixed;inset:0;width:100vw;height:100vh;border:0;opacity:0.21;z-index:99"></iframe>`);
  },
  'rt-grid-overlay-link'() { // invisible link stacked by CSS grid, no positioning
    const g = el('<div id="g" style="display:grid;min-height:100vh"></div>', document.body);
    const c = el('<div style="grid-area:1/1"></div>', g); c.append(ui); playerControls();
    el(`<a href="${AD}?rt-grid" target="_blank" style="grid-area:1/1;opacity:0;z-index:5"></a>`, g);
  },
  'rt-overlay-transparent-text'() { // fixed overlay link whose text is transparent
    playerControls();
    el(`<a href="${AD}?rt-transparent-text" target="_blank" style="position:fixed;inset:0;z-index:99;color:transparent;font-size:1px">ad</a>`);
  },
  'rt-overlay-transparent-gradient'() { // fixed overlay link with a gradient that paints nothing
    playerControls();
    el(`<a href="${AD}?rt-gradient" target="_blank" style="position:fixed;inset:0;z-index:99;background-image:linear-gradient(transparent,transparent)"></a>`);
  },
  'rt-overlay-detach-before-open'() { // overlay removes itself before asking to open
    playerControls();
    const d = el('<div style="position:fixed;inset:0;z-index:99"></div>');
    d.addEventListener('click', () => { d.remove(); window.open(AD + '?rt-detach'); });
  },
  'rt-wrapper-shrink-before-open'() { // full-page root shrinks itself for the ask, then restores
    const app = el('<div id="app" style="min-height:100vh"></div>', document.body); app.append(ui); playerControls();
    app.addEventListener('click', () => {
      const h = app.style.cssText; app.style.cssText = 'height:1px;min-height:0;overflow:hidden';
      window.open(AD + '?rt-shrink');
      app.style.cssText = h;
    });
  },
  'rt-requestsubmit-formtarget'() { // page-wide hook: requestSubmit(submitter with formtarget=_blank)
    playerControls();
    el(`<form id="rtf" action="${AD}"><input type="hidden" name="rt" value="formtarget"><button id="s" formtarget="_blank" style="display:none"></button></form>`);
    document.addEventListener('click', () => setTimeout(() => $('#rtf').requestSubmit($('#s')), 0)); // timer: the native-submit path
  },
  'rt-submitter-click-post'() { // page-wide hook: real .click() on a POST target=_blank form's button
    playerControls();
    el(`<form id="rtf" method="post" target="_blank" action="${AD}?rt-submitter-click"><button id="s" style="display:none"></button></form>`);
    document.addEventListener('click', () => $('#s').click()); // inside the click: the in-dispatch path
  },
  'rt-frame-redirect-after-4s'() { // embedded widget frame hijacks the top page 4.3 s after the click
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=topdelay&ms=4300" style="width:660px;height:320px;border:0"></iframe>`);
  },
  // -- round 3 --
  'rt-tabunder-samesite-hop'() { // real _blank link; the opener hops to a same-site page that redirects 8.5 s later
    el('<a id="link" href="/other.html?watch" target="_blank">Watch</a>');
    $('#link').addEventListener('click', () => setTimeout(() => { location.href = '/rt-hop.html?ms=8500'; }, 50));
  },
  'rt-link-href-swap-redirector'() { // real _blank link to this site; a page-wide listener swaps its href to a same-site redirector
    el('<a id="link" href="/other.html?watch" target="_blank">Watch</a>');
    document.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) a.href = REDIR(AD + '?rt-href-swap'); });
  },
  // -- legit (false-positive guard found by the red team) --
  'legit-closed-shadow-link'() { // a target=_blank link inside a closed-shadow web component
    const h = el('<span id="host" style="display:block;width:300px;height:40px"></span>');
    h.attachShadow({ mode: 'closed' }).innerHTML = `<a href="${AD}?shadowlink" target="_blank" style="display:block;height:40px">Docs</a>`;
  },
});

if (S[t]) S[t]();
document.title = 'scenario:' + t;
document.body.dataset.ready = '1';
