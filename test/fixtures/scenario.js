// Each scenario reproduces one technique ad scripts use (or one legit pattern
// that must keep working). Selected with ?t=<name>.
const AD = window.AD_ORIGIN + '/ad.html';
const params = new URLSearchParams(location.search);
const t = params.get('t');
const $ = (s) => document.querySelector(s);
const ui = $('#ui');

function el(html, parent = ui) { const d = document.createElement('div'); d.innerHTML = html.trim(); const n = d.firstChild; parent.append(n); return n; }
function playerControls(parent = ui) {
  // A fake video player with controls, like the one on streaming sites.
  const p = el('<div id="player" style="width:640px;height:300px;background:#000;position:relative"><button id="play" style="position:absolute;left:10px;bottom:10px">Play</button></div>', parent);
  $('#play').addEventListener('click', () => { $('#play').textContent = 'Pause'; document.body.dataset.played = '1'; });
  return p;
}

const S = {
  // ---------- attacks (should be blocked) ----------
  'doc-click-popunder'() { // popunder network "OnClick" format: hook every click on the page
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
  'player-iframe-popup'() { // cross-site player iframe whose ad script hooks clicks
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=popup" style="width:660px;height:320px;border:0"></iframe>`);
  },
  'player-iframe-top-redirect'() { // cross-site player iframe that hijacks the whole tab
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
  'legit-leave-after-player'() { // use the player, then click a real link on the page
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
  'player-iframe-top-redirect-2nd'() { // hijack only on the 2nd click inside the player
    el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=top2" style="width:660px;height:320px;border:0"></iframe>`);
  },
  'legit-player-then-reload'() { el(`<iframe id="pf" src="${window.AD_ORIGIN}/player.html?mode=none" style="width:660px;height:320px;border:0"></iframe>`); },
});

Object.assign(S, {
  'ad-layer-tab-under'() { // visible max-z-index ad image over the Continue button (link-shortener style)
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
  'adbox-frame'() { // streaming-player style: blank iframe pinned at max z-index with a fake-CAPTCHA link
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
    app.append(ui); // everything (player included) lives inside the wrapper
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

if (S[t]) S[t]();
document.title = 'scenario:' + t;
document.body.dataset.ready = '1';
