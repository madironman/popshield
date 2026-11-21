// PopShield — runs in the page's MAIN world at document_start, in every frame,
// before any page script. Decides whether a new tab / popup / redirect is
// something the user actually asked for.
//
// Core idea ("intent model"): a page may open a new window only while a
// *trusted* user event is being dispatched to a listener that is attached to a
// specific element — not to window/document/<html>/<body> (where ad scripts
// such as popunder networks hook every click on the page), and not on an
// invisible full-page overlay.
(() => {
  'use strict';

  const W = window;
  const D = document;
  const R_apply = Reflect.apply;
  const defineProp = Object.defineProperty;
  const getOwnDesc = Object.getOwnPropertyDescriptor;
  const origAddEL = EventTarget.prototype.addEventListener;
  const origRemoveEL = EventTarget.prototype.removeEventListener;
  const origDispatch = EventTarget.prototype.dispatchEvent;
  const origGetCS = W.getComputedStyle;
  const origClosest = Element.prototype.closest;
  const origQS = Element.prototype.querySelector;
  const origGBCR = Element.prototype.getBoundingClientRect;
  const origComposedPath = Event.prototype.composedPath;
  const JSONs = JSON.stringify;
  const JSONp = JSON.parse;
  const CustomEv = CustomEvent;
  const URL_ = URL;

  const MARK = Symbol.for('popshield.installed');
  if (W[MARK]) return;
  defineProp(W, MARK, { value: true });

  // ---------------------------------------------------------------- state
  let mode = 'smart'; // until the bridge reports the user's setting: smart | strict | off
  let curEvent = null; // the trusted gesture event currently being dispatched (if any)
  let lastAct = null; // { t, overlay } of the last trusted activating gesture
  let frameworkDepth = 0; // > 0 while a React/jQuery handler bound to the clicked element runs
  let lastFrameGesture = 0; // (top frame) Date.now() of the last click inside a child frame
  let lastRelay = 0; // (child frame) throttle for frame-gesture relays

  // ------------------------------------------------- bridge (isolated world)
  const nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const UP = 'ps-' + nonce + '-up';
  const DOWN = 'ps-' + nonce + '-down';
  let connected = false;
  const queue = [];

  // Some ad scripts retry window.open() in a tight loop once it's blocked
  // (hundreds of times per click). Report each distinct block at most once
  // every 5 s, and at most 20 blocks per 10 s per frame, so the log and badge
  // stay meaningful and we don't flood the background worker.
  const recentBlocks = new Map();
  let burstStart = 0, burstCount = 0;
  function throttled(msg) {
    if (msg.type !== 'blocked') return false;
    const now = Date.now();
    const key = msg.kind + '|' + msg.reason + '|' + msg.url;
    const last = recentBlocks.get(key);
    if (last && now - last < 5000) return true;
    if (now - burstStart > 10000) { burstStart = now; burstCount = 0; }
    if (++burstCount > 20) return true;
    recentBlocks.set(key, now);
    if (recentBlocks.size > 200) recentBlocks.clear();
    return false;
  }
  function send(msg) {
    if (throttled(msg)) return;
    if (!connected) { if (queue.length < 50) queue.push(msg); return; }
    R_apply(origDispatch, D, [new CustomEv(UP, { detail: JSONs(msg) })]);
  }
  function sayHello() {
    R_apply(origDispatch, D, [new CustomEv('popshield:hello', { detail: nonce })]);
  }
  function onReq() { if (!connected) sayHello(); }
  function onDown(e) {
    let m; try { m = JSONp(e.detail); } catch { return; }
    if (m.type === 'connected') {
      connected = true;
      R_apply(origRemoveEL, D, ['popshield:req', onReq]);
      while (queue.length) send(queue.shift());
    } else if (m.type === 'mode' && (m.mode === 'smart' || m.mode === 'strict' || m.mode === 'off')) {
      mode = m.mode;
    } else if (m.type === 'frameGesture') {
      lastFrameGesture = Date.now(); // relayed by the background from a child frame's pointerdown
    }
  }
  function listenChannel() {
    R_apply(origAddEL, D, [DOWN, onDown]);
    R_apply(origAddEL, D, ['popshield:req', onReq]);
  }
  listenChannel();
  sayHello();
  // document.open() (script-built frames, old document.write pages) erases every
  // listener on this document — our channel and the bridge's. A MutationObserver
  // survives it: when the root element is replaced, reconnect and re-arm.
  let lastRoot = D.documentElement;
  try {
    new MutationObserver(() => {
      if (D.documentElement === lastRoot) return;
      lastRoot = D.documentElement;
      connected = false;
      listenChannel();
      armRealm(W);
      sayHello();
    }).observe(D, { childList: true });
  } catch {}

  // ---------------------------------------------------------------- helpers
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
  function absUrl(u) {
    try { return new URL_(String(u), location.href).href; } catch { return String(u); }
  }
  function urlSite(u) {
    try {
      const x = new URL_(String(u), location.href);
      return /^https?:$/.test(x.protocol) ? siteOf(x.hostname) : null;
    } catch { return null; }
  }

  const GESTURES = ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'keydown', 'keyup', 'contextmenu'];
  // Events that carry user activation (the ones a legit "open" can come from).
  const ACTIVATING = new Set(['click', 'auxclick', 'dblclick', 'mouseup', 'pointerup', 'touchend', 'keydown', 'keyup', 'submit']);
  const MEDIA = 'img,video,canvas,svg,iframe,picture,object,embed,audio';

  // window / document / <html> / <body> of THIS frame or of a same-origin child
  // frame we watch (see armRealm), i.e. a listener that sees every click.
  function isGlobalNode(n) {
    if (n == null || n === W || n === D) return true;
    try {
      if (n.window === n) return true;                 // a Window
      if (n.nodeType === 9) return true;               // a Document
      return n.nodeType === 1 && (n.localName === 'html' || n.localName === 'body') && n.parentNode &&
        (n.parentNode.nodeType === 9 || n.parentNode.localName === 'html');
    } catch { return false; }
  }
  // The window an element lives in (a child frame's elements are measured against that frame).
  function viewOf(el) { try { return (el.ownerDocument && el.ownerDocument.defaultView) || W; } catch { return W; } }

  // An invisible element covering much of the viewport, with no content of its own.
  function isOverlay(el) {
    try {
      if (!el || el.nodeType !== 1 || el.localName === 'html' || el.localName === 'body') return false;
      const tag = el.localName;
      if (tag === 'video' || tag === 'img' || tag === 'canvas' || tag === 'iframe' || tag === 'svg') return false;
      const r = R_apply(origGBCR, el, []);
      const view = viewOf(el), vw = view.innerWidth || 1, vh = view.innerHeight || 1;
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (w * h < 0.35 * vw * vh) return false;
      if ((el.textContent || '').trim()) return false;
      if (R_apply(origQS, el, [MEDIA])) return false;
      const cs = R_apply(origGetCS, W, [el]);
      if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
      const opacity = parseFloat(cs.opacity);
      const clearBg = cs.backgroundImage === 'none' &&
        (cs.backgroundColor === 'transparent' || /,\s*0(\.0+)?\)$/.test(cs.backgroundColor));
      return opacity < 0.15 || clearBg;
    } catch { return false; }
  }

  // A *visible* ad layer stacked over the page at (near) the maximum z-index,
  // e.g. an "offerwall" image placed on top of a site's Continue button. Only
  // counts when the click hit non-interactive content (image/blank area), so
  // buttons inside legit max-z-index modals and cookie banners keep working.
  const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[role=button],[role=link],[onclick],[contenteditable]';
  function isAdLayer(el) {
    try {
      if (!el || el.nodeType !== 1 || el.localName === 'html' || el.localName === 'body') return false;
      if (R_apply(origClosest, el, [INTERACTIVE])) return false;
      const view = viewOf(el), vw = view.innerWidth || 1, vh = view.innerHeight || 1;
      for (let n = el, i = 0; n && n.localName !== 'body' && n.localName !== 'html' && i < 4; n = n.parentElement, i++) {
        const cs = R_apply(origGetCS, W, [n]);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
        if ((parseInt(cs.zIndex, 10) || 0) < 2147480000) continue;
        const r = R_apply(origGBCR, n, []);
        const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
        const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
        if (w * h >= 0.25 * vw * vh) return true;
      }
      return false;
    } catch { return false; }
  }

  // Same document as this page (ignoring #hash)? Used to spot tab-unders.
  function isSamePage(u) {
    try {
      const a = new URL_(String(u), location.href), b = new URL_(location.href);
      a.hash = ''; b.hash = '';
      return a.href === b.href;
    } catch { return false; }
  }
  let lastNewOpen = -1e9;

  // A link that doesn't really go anywhere: "#", "#x", "javascript:", or this page.
  function isDeadHref(a) {
    const raw = (a.getAttribute('href') || '').trim().toLowerCase();
    return raw === '' || raw[0] === '#' || raw.startsWith('javascript:') || isSamePage(a.href);
  }

  // Are we inside an injected ad box: a same-origin blank/srcdoc frame that the
  // parent pinned over the page at (near) max z-index with position:fixed?
  function inAdBoxFrame(win) {
    try {
      win = win || W;
      if (win === win.top) return false;
      const fe = win.frameElement; // null when cross-origin
      if (!fe) return false;
      // Script-built frame: no src (or about:/data:) or srcdoc. Such frames
      // inherit the parent's URL after document.write, so check the element.
      const src = (fe.getAttribute('src') || '').trim().toLowerCase();
      if (!(fe.hasAttribute('srcdoc') || src === '' || src.startsWith('about:') || src.startsWith('data:'))) return false;
      const cs = R_apply(origGetCS, fe.ownerDocument.defaultView, [fe]);
      return cs.position === 'fixed' && (parseInt(cs.zIndex, 10) || 0) >= 2147480000;
    } catch { return false; }
  }

  function realTarget(e) {
    try { const p = R_apply(origComposedPath, e, []); if (p && p.length) return p[0]; } catch {}
    return e.target;
  }

  // Is the code that is running right now handling a real, element-scoped user gesture?
  function verdict() {
    const e = curEvent;
    if (!e || e.eventPhase === 0) return 'no-gesture';        // timer / async / no user action
    if (!ACTIVATING.has(e.type)) return 'non-activating-event';
    // Page-wide listener — unless it is a framework (old React, jQuery .on(sel))
    // currently running the handler that belongs to the clicked element.
    if (isGlobalNode(e.currentTarget) && frameworkDepth === 0) return 'page-wide-listener';
    if (isOverlay(realTarget(e))) return 'invisible-overlay';
    if (isAdLayer(realTarget(e))) return 'ad-layer';
    return 'ok';
  }

  // ---- async opens (e.g. `await fetch(); window.open(url)` in a click handler)
  // V8 async stack traces keep the listener's receiver across `await`:
  //   element listener -> "at async HTMLButtonElement.<anonymous>"   (legit)
  //   page-wide hook   -> "at HTMLDocument.<anonymous>" / "Window."  (ad)
  //   framework handler -> our "__popshieldFramework__" marker frame
  // Timers/plain callbacks carry no receiver and stay blocked.
  const PAGE_FRAME = /\bat (?:async )?(?:HTMLDocument|Document|Window|HTMLHtmlElement|HTMLBodyElement)\./;
  const ELEM_FRAME = /\bat (?:async )?(?:(?:HTML|SVG)\w*Element\.|__popshieldFramework__)/;
  const errProto = Error;
  function asyncOrigin() {
    try {
      const ua = navigator.userActivation;
      if (!ua || !ua.isActive || !lastAct || lastAct.overlay) return false;
      if (performance.now() - lastAct.t > 5000) return false;
      const lim = errProto.stackTraceLimit;
      let st = '';
      try { errProto.stackTraceLimit = 50; st = String(new errProto().stack || ''); } finally { errProto.stackTraceLimit = lim; }
      // Ignore our own frames (hooked click/dispatchEvent live on element prototypes).
      const frames = st.split('\n').filter((l) => /^\s*at /.test(l) &&
        (l.indexOf('chrome-extension://') === -1 || l.indexOf('__popshieldFramework__') !== -1)).join('\n');
      if (PAGE_FRAME.test(frames)) return false;
      return ELEM_FRAME.test(frames);
    } catch { return false; }
  }

  // Strict: no script-opened tabs at all (real link clicks by the user still work).
  function decide() {
    if (mode === 'strict') return 'strict-mode';
    const v = verdict();
    return v === 'no-gesture' && asyncOrigin() ? 'ok' : v;
  }

  // ---- framework attribution: wrap the clicked element's own handler for the
  // duration of this event so we know when it (not some ad hook) is running.
  const HANDLER_PROPS = {
    click: ['onClick', 'onClickCapture'], auxclick: ['onAuxClick'], dblclick: ['onDoubleClick'],
    mouseup: ['onMouseUp'], pointerup: ['onPointerUp'], touchend: ['onTouchEnd'],
    keydown: ['onKeyDown'], keyup: ['onKeyUp'],
  };
  const wrappedFns = new WeakSet();
  const restores = [];
  let restoreQueued = false;
  // Its frame shows up in async stack traces of framework handlers that await.
  async function __popshieldFramework__(p) { try { await p; } catch {} }
  function wrapHandler(obj, key) {
    let orig;
    try { orig = obj[key]; } catch { return; }
    if (typeof orig !== 'function' || wrappedFns.has(orig)) return;
    const w = function () {
      frameworkDepth++;
      let r;
      try { r = R_apply(orig, this, arguments); } finally { frameworkDepth--; }
      if (r && typeof r.then === 'function') __popshieldFramework__(r);
      return r;
    };
    wrappedFns.add(w);
    try { obj[key] = w; } catch { return; } // frozen (React dev builds): skip
    if (obj[key] !== w) return;
    restores.push(() => { try { if (obj[key] === w) obj[key] = orig; } catch {} });
    if (!restoreQueued) {
      restoreQueued = true;
      setTimeout(() => { restoreQueued = false; while (restores.length) restores.pop()(); }, 0);
    }
  }
  // (top frame) Did the user click inside an embedded frame within the last 1.5 s?
  function frameJustClicked() {
    const a = D.activeElement;
    return !!a && (a.localName === 'iframe' || a.localName === 'frame') && Date.now() - lastFrameGesture < 1500;
  }
  function safeMatches(el, sel) { try { return el.matches(sel); } catch { return false; } }
  function attributeFrameworks(e, path) {
    const names = HANDLER_PROPS[e.type];
    if (!names) return;
    for (const n of path) {
      if (!n || n.nodeType !== 1 || n === D.body || n === D.documentElement) continue;
      let keys;
      try { keys = Object.keys(n); } catch { continue; }
      for (const k of keys) {
        // React 16: __reactEventHandlers$xxx, React 17+: __reactProps$xxx (both hold the props).
        if (k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')) {
          const props = n[k];
          if (props && typeof props === 'object') for (const name of names) wrapHandler(props, name);
        }
      }
    }
    // jQuery delegated handlers: $(document).on('click', '.share', fn)
    const jq = W.jQuery;
    if (jq && typeof jq._data === 'function') {
      for (const g of [D, D.documentElement, D.body]) {
        let list;
        try { const ev = g && jq._data(g, 'events'); list = ev && ev[e.type]; } catch {}
        if (!list) continue;
        for (const h of list) {
          const sel = h && h.selector;
          // Specific selectors only: '*', 'a', 'div' would match anything an ad wants.
          if (typeof sel !== 'string' || !/[.#[]/.test(sel)) continue;
          if (path.some((n) => n && n.nodeType === 1 && n !== D.body && n !== D.documentElement && safeMatches(n, sel))) wrapHandler(h, 'handler');
        }
      }
    }
  }

  function targetOpensNew(t) {
    t = String(t || '').toLowerCase();
    return t !== '' && t !== '_self' && t !== '_parent' && t !== '_top';
  }
  function anchorTarget(a) {
    let t = a.getAttribute('target');
    if (t == null) {
      const base = a.ownerDocument && a.ownerDocument.querySelector('base[target]');
      t = base ? base.getAttribute('target') : '';
    }
    return t;
  }
  function anchorOpensNew(a) { return targetOpensNew(anchorTarget(a)); }
  function isLink(n) { return n && n.nodeType === 1 && (n.localName === 'a' || n.localName === 'area') && n.hasAttribute('href'); }

  // --------------------------------------------------- gesture tracking
  // Registered first (document_start), capturing on window, so it runs before every page listener.
  function onGesture(e) {
    if (!e.isTrusted) return;
    curEvent = e;
    if (mode === 'off') return;

    // Child frame: tell the top frame (via the background) that the user is
    // clicking in here, so its hijack guard knows the timing.
    if (W !== W.top && (e.type === 'pointerdown' || e.type === 'mousedown' || e.type === 'touchstart')) {
      const now = Date.now();
      if (now - lastRelay > 250) { lastRelay = now; send({ type: 'frameGesture' }); }
    }

    let path = null;
    const getPath = () => { if (!path) { try { path = R_apply(origComposedPath, e, []); } catch { path = []; } } return path; };
    if (ACTIVATING.has(e.type)) {
      const tgt = realTarget(e);
      lastAct = { t: performance.now(), overlay: isOverlay(tgt) || isAdLayer(tgt) };
      attributeFrameworks(e, getPath());
    }

    if (e.type === 'click' || e.type === 'auxclick' || e.type === 'contextmenu') {
      const a = getPath().find(isLink);
      const modifier = e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;

      // (Ad box = decoy link in a script-built frame pinned over the page; real
      // links in chat widgets such as help articles are left alone.)
      if (a && e.type !== 'contextmenu' && (isOverlay(a) || (isDeadHref(a) && inAdBoxFrame(viewOf(a))))) {
        // Invisible full-page ad link, or a link inside an injected ad-box
        // frame: swallow the click entirely.
        e.preventDefault();
        e.stopImmediatePropagation();
        send({ type: 'blocked', kind: 'overlay-link', reason: isOverlay(a) ? 'invisible-overlay' : 'ad-box-frame', url: a.href, source: a.textContent.trim().slice(0, 80) });
        return;
      }
      if (e.type === 'contextmenu') {
        if (a) send({ type: 'allow', how: 'contextmenu' });   // "Open link in new tab" from the menu
      } else if (modifier || (a && anchorOpensNew(a))) {
        // The user really clicked a link. If it points nowhere (#, javascript:,
        // this same page), the tab it opens must stay on this site: ad scripts
        // swap such decoy links to an ad URL during the click.
        send({ type: 'allow', how: 'user-link', sameSiteOnly: !!a && isDeadHref(a) });
      }
    }
  }
  // document.open() (used to build ad boxes and chat widgets) erases every
  // listener of that frame, including ours; armRealm() puts them back.
  function armRealm(win) {
    for (const t of GESTURES) R_apply(origAddEL, win, [t, onGesture, { capture: true }]);
    R_apply(origAddEL, win, ['submit', onSubmit, { capture: true }]);
  }

  // Form submits into a new tab. The submit event is trusted even when a script
  // triggered it (submitButton.click(), requestSubmit()), so judge it by its cause.
  function onSubmit(e) {
    if (!e.isTrusted || mode === 'off') return;
    const f = realTarget(e);
    if (!f || f.localName !== 'form') return;
    const sub = e.submitter;
    const t = (sub && sub.getAttribute('formtarget')) || f.getAttribute('target');
    if (!targetOpensNew(t)) return; // same-tab submit: the redirect guard covers it
    const prev = curEvent;
    let ok, reason;
    if (prev && prev.eventPhase !== 0) {
      // Fired from inside an event handler: same intent rules as window.open.
      reason = decide();
      ok = reason === 'ok';
    } else {
      // Native submit: must follow the user's own click/Enter on this form.
      const src = prev && realTarget(prev);
      ok = !!prev && prev.isTrusted && performance.now() - prev.timeStamp < 1000 &&
        (((prev.type === 'click') && sub && src && sub.contains(src)) ||
         ((prev.type === 'keydown' || prev.type === 'keyup') && src && f.contains(src)));
      // ...or come from an element's handler after an await (requestSubmit after fetch).
      if (!ok && mode !== 'strict') ok = asyncOrigin();
      reason = mode === 'strict' ? 'strict-mode' : 'no-gesture';
      if (ok) reason = 'ok';
    }
    if (ok) { send({ type: 'allow', how: 'user-form' }); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    send({ type: 'blocked', kind: 'scripted-form', reason, url: absUrl((sub && sub.getAttribute('formaction')) || f.getAttribute('action') || '') });
  }
  armRealm(W);

  // --------------------------------------------- per-realm API hooks
  // Installed on our own window and on any same-origin child window the page
  // reaches into (ads create blank iframes to grab a pristine window.open).
  const patched = new WeakSet();
  function patchRealm(win) {
    try {
      if (!win || patched.has(win)) return;
      patched.add(win);
      win[MARK] || defineProp(win, MARK, { value: true });

      // window.open
      const realOpen = win.open;
      const hookedOpen = function open(url, target) {
        if (mode === 'off' || !targetOpensNew(target == null ? '_blank' : target)) {
          return R_apply(realOpen, this, arguments);
        }
        let v = decide();
        const u = url == null || url === '' ? 'about:blank' : absUrl(url);
        // Tab-under: open *this same page* in a new tab, then turn this tab into an ad.
        if (v === 'ok' && url != null && url !== '' && isSamePage(u)) v = 'tab-under';
        if (v === 'ok') {
          lastNewOpen = performance.now();
          send({ type: 'allow', how: 'window.open' });
          return R_apply(realOpen, this, arguments);
        }
        send({ type: 'blocked', kind: 'popup', reason: v, url: u });
        return null;
      };
      // May already be locked by this frame's own copy of PopShield (injected
      // first); that's fine — don't let it abort the remaining hooks below.
      try { defineProp(win, 'open', { get: () => hookedOpen, set() {}, configurable: false, enumerable: true }); } catch {}

      // element.click() on a link that opens a new tab
      const EP = win.HTMLElement.prototype;
      const realClick = EP.click;
      defineProp(EP, 'click', {
        value: function click() {
          if (mode !== 'off' && isLink(this) && !this.hasAttribute('download') && anchorOpensNew(this)) {
            const v = decide();
            if (v !== 'ok') { send({ type: 'blocked', kind: 'scripted-link', reason: v, url: this.href }); return; }
            lastNewOpen = performance.now();
            send({ type: 'allow', how: 'scripted-link' });
          }
          return R_apply(realClick, this, arguments);
        }, writable: true, configurable: true,
      });

      // el.dispatchEvent(new MouseEvent('click')) on such a link
      const ETP = win.EventTarget.prototype;
      const realDispatch = ETP.dispatchEvent;
      defineProp(ETP, 'dispatchEvent', {
        value: function dispatchEvent(ev) {
          try {
            if (mode !== 'off' && ev && ev.type === 'click' && this && this.nodeType === 1) {
              const a = isLink(this) ? this : R_apply(origClosest, this, ['a[href],area[href]']);
              if (a && !a.hasAttribute('download') && anchorOpensNew(a)) {
                const v = decide();
                if (v !== 'ok') { send({ type: 'blocked', kind: 'scripted-link', reason: v, url: a.href }); return false; }
                send({ type: 'allow', how: 'scripted-link' });
              }
            }
          } catch {}
          return R_apply(realDispatch, this, arguments);
        }, writable: true, configurable: true,
      });

      // form.submit() / form.requestSubmit() into a new tab
      const FP = win.HTMLFormElement.prototype;
      for (const name of ['submit', 'requestSubmit']) {
        const real = FP[name];
        if (typeof real !== 'function') continue;
        defineProp(FP, name, {
          value: function () {
            if (mode !== 'off' && targetOpensNew(this.getAttribute('target'))) {
              const v = decide();
              if (v !== 'ok') { send({ type: 'blocked', kind: 'scripted-form', reason: v, url: absUrl(this.getAttribute('action') || '') }); return; }
              send({ type: 'allow', how: 'scripted-form' });
            }
            return R_apply(real, this, arguments);
          }, writable: true, configurable: true,
        });
      }

      // document.open(): re-arm click tracking afterwards. For our own frame this
      // restores our listeners; for a script-built child frame (whose own copy of
      // this script was wiped by open()) we take over watching it.
      // (write/writeln on a loaded document do an implicit open() too.)
      const DP = win.Document.prototype;
      for (const name of ['open', 'write', 'writeln']) {
        const real = DP[name];
        if (typeof real !== 'function') continue;
        defineProp(DP, name, {
          value: { [name]: function () {
            const r = R_apply(real, this, arguments);
            try { const v = this.defaultView; if (v && (v === W || patched.has(v))) armRealm(v); } catch {}
            return r;
          } }[name], writable: true, configurable: true,
        });
      }

      // Reaching into child frames: patch them before the caller gets the window.
      for (const C of [win.HTMLIFrameElement, win.HTMLFrameElement, win.HTMLObjectElement]) {
        if (!C) continue;
        for (const prop of ['contentWindow', 'contentDocument']) {
          const d = getOwnDesc(C.prototype, prop);
          if (!d || !d.get) continue;
          defineProp(C.prototype, prop, {
            get() {
              const r = R_apply(d.get, this, []);
              if (r) patchRealm(prop === 'contentWindow' ? r : r.defaultView);
              return r;
            }, configurable: true, enumerable: d.enumerable,
          });
        }
      }
    } catch { /* cross-origin or exotic window: the background backstop still applies */ }
  }
  patchRealm(W);

  // ------------------------------------- same-tab hijack redirects (top frame)
  if (W === W.top && W.navigation) {
    R_apply(origAddEL, W.navigation, ['navigate', (e) => {
      if (mode === 'off' || e.userInitiated || !e.cancelable) return;
      if (e.navigationType === 'traverse' || e.navigationType === 'reload' || e.hashChange || e.downloadRequest) return;
      const dest = e.destination && e.destination.url;
      const ds = urlSite(dest);
      if (!ds || ds === urlSite(location.href)) return;          // same site: never interfere
      // Tab-under: a script just opened a new tab and now sends this tab elsewhere.
      // Checked first: opening that tab consumed the user activation.
      if (performance.now() - lastNewOpen < 2000) {
        e.preventDefault();
        send({ type: 'blocked', kind: 'redirect', reason: 'tab-under', url: dest });
        return;
      }
      const ua = navigator.userActivation;
      if (ua && !ua.isActive) return;                            // not interaction-driven (e.g. on-load redirect)

      const v = verdict();
      let block;
      if (mode === 'strict') {
        block = v !== 'ok' && !(v === 'no-gesture' && asyncOrigin());
      } else {
        // Smart: block redirects fired from page-wide/overlay click hooks, and
        // redirects of the whole tab right after a click inside an embedded
        // (e.g. video player) frame — the frame's ad script driving top.location.
        const fromFrame = v === 'no-gesture' && frameJustClicked();
        block = v === 'page-wide-listener' || v === 'invisible-overlay' || v === 'ad-layer' || fromFrame;
      }
      if (!block) return;
      e.preventDefault();
      send({ type: 'blocked', kind: 'redirect', reason: v === 'no-gesture' ? 'embedded-frame' : v, url: dest });
    }]);
  }

  // A cross-site iframe (e.g. a video player) doing `top.location = ad` never
  // fires the Navigation API event above. The top page still gets
  // beforeunload, so if the user clicked inside a cross-site frame a moment ago
  // and the whole tab is about to unload, hold it and let Chrome ask "Leave site?".
  // The click timing comes from the frame itself (pointerdown relayed through the
  // background) and from focus moving into the frame, so reloading or typing a
  // URL a few seconds after using the player does not trigger the prompt.
  if (W === W.top) {
    R_apply(origAddEL, W, ['blur', () => {
      const a = D.activeElement;
      if (a && (a.localName === 'iframe' || a.localName === 'frame')) lastFrameGesture = Date.now();
    }, { capture: true }]);
    R_apply(origAddEL, W, ['beforeunload', (e) => {
      if (mode === 'off') return;
      const fr = D.activeElement;
      if (!fr || (fr.localName !== 'iframe' && fr.localName !== 'frame')) return;
      const fs = urlSite(fr.src);
      if (!fs || fs === urlSite(location.href)) return;       // only cross-site frames
      if (!frameJustClicked()) return;                       // no click in the frame just now
      if (curEvent && curEvent.eventPhase !== 0) return;     // a top-level click is driving this
      e.preventDefault();
      e.returnValue = '';
      send({ type: 'blocked', kind: 'redirect', reason: 'embedded-frame', url: '', source: fr.src });
    }, { capture: true }]);
  }
})();
