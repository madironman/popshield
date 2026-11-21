// PopShield page-world hooks. Runs in the page's MAIN world at document_start,
// in every frame, before any page script.
//
// SECURITY MODEL: this world is shared with the page, so anything here can be
// observed or poisoned by a hostile page. This script therefore decides
// nothing on its own. It only:
//   1. hooks the APIs that open tabs (window.open, element.click(),
//      dispatchEvent(click), form.submit(), Document Picture-in-Picture),
//   2. asks the isolated-world bridge (bridge.js) for a verdict, synchronously,
//      over a private channel set up before any page script runs,
//   3. supplies two hints the bridge cannot compute itself: "a framework
//      handler of the clicked element is running" and "this call came from an
//      element's handler after an await" (V8 async stack traces).
// The bridge judges with clean, unpoisonable APIs and is the only thing that
// can mint the allow tokens the background backstop requires. If this script
// is subverted, the worst a page achieves is skipping our early block; the
// backstop still closes any tab the bridge didn't approve.
(() => {
  'use strict';

  // ---------------------------------------- built-ins, captured up front
  const W = window;
  const D = document;
  const R_apply = Reflect.apply;
  const defineProp = Object.defineProperty;
  const getOwnDesc = Object.getOwnPropertyDescriptor;
  const ObjCreate = Object.create;
  const ObjKeys = Object.keys;
  const getter = (proto, name) => { const d = getOwnDesc(proto, name); return d && d.get; };
  const origAddEL = EventTarget.prototype.addEventListener;
  const origRemoveEL = EventTarget.prototype.removeEventListener;
  const origDispatch = EventTarget.prototype.dispatchEvent;
  const origComposedPath = Event.prototype.composedPath;
  const evType = getter(Event.prototype, 'type');
  const detailGet = getter(CustomEvent.prototype, 'detail');
  const keyGet = getter(KeyboardEvent.prototype, 'key');
  const nodeTypeGet = getter(Node.prototype, 'nodeType');
  const ownerDocGet = getter(Node.prototype, 'ownerDocument');
  const localNameGet = getter(Element.prototype, 'localName');
  const nsGet = getter(Element.prototype, 'namespaceURI');
  const getAttr = Element.prototype.getAttribute;
  const getAttrNS = Element.prototype.getAttributeNS;
  const hasAttr = Element.prototype.hasAttribute;
  const hasAttrNS = Element.prototype.hasAttributeNS;
  const elMatches = Element.prototype.matches;
  const elClosest = Element.prototype.closest;
  const getRootNode = Node.prototype.getRootNode;
  const docQS = Document.prototype.querySelector;
  const docBaseURI = getter(Node.prototype, 'baseURI');
  const anchorHref = getter(HTMLAnchorElement.prototype, 'href');
  const areaHref = getter(HTMLAreaElement.prototype, 'href');
  const defaultViewGet = getter(Document.prototype, 'defaultView');
  const URL_ = URL;
  const urlHref = getter(URL.prototype, 'href');
  const strToLower = String.prototype.toLowerCase;
  const strStartsWith = String.prototype.startsWith;
  const strSplit = String.prototype.split;
  const strIndexOf = String.prototype.indexOf;
  const strTrim = String.prototype.trim;
  const reTest = RegExp.prototype.test;
  const JSONs = JSON.stringify;
  const JSONp = JSON.parse;
  const CustomEv = CustomEvent;
  const WSet = WeakSet, wsHas = WeakSet.prototype.has, wsAdd = WeakSet.prototype.add;
  const ErrorCtor = Error;
  const setTimeout_ = W.setTimeout;
  const cryptoObj = W.crypto;
  const getRandomValues = Crypto.prototype.getRandomValues;
  const Uint8 = Uint8Array;
  const numToString = Number.prototype.toString;
  const perfNow = Performance.prototype.now;
  const perfObj = W.performance;
  const MapGet = Map.prototype.get, MapSet = Map.prototype.set, MapClear = Map.prototype.clear;

  const MARK = Symbol.for('popshield.installed');
  if (W[MARK]) return;
  defineProp(W, MARK, { value: true });

  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : '' + v);
  const lower = (s) => R_apply(strToLower, str(s), []);

  // ---------------------------------------------- private bridge channel
  // 128-bit random nonce, exchanged once at document_start (before any page
  // script exists) and never broadcast again.
  let nonce = '';
  {
    const b = new Uint8(16);
    R_apply(getRandomValues, cryptoObj, [b]);
    for (let i = 0; i < 16; i++) { const h = R_apply(numToString, b[i], [16]); nonce += h.length === 1 ? '0' + h : h; }
  }
  const UP = 'ps-' + nonce + '-up';
  const DOWN = 'ps-' + nonce + '-down';
  let connected = false;
  let mode = 'smart';
  let answerId = -1, answer = null, askSeq = 0;

  function post(msg) {
    const init = ObjCreate(null);
    init.detail = JSONs(msg);
    R_apply(origDispatch, D, [new CustomEv(UP, init)]);
  }
  function onDown(e) {
    let m;
    try { m = JSONp(R_apply(detailGet, e, [])); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'verdict') { if (m.id === answerId) answer = m.v; }
    else if (m.type === 'mode') { if (m.mode === 'smart' || m.mode === 'strict' || m.mode === 'off') mode = m.mode; }
    else if (m.type === 'connected') { connected = true; R_apply(origRemoveEL, D, ['popshield:req', onReq]); }
  }
  function sayHello() {
    const init = ObjCreate(null);
    init.detail = nonce;
    R_apply(origDispatch, D, [new CustomEv('popshield:hello', init)]);
  }
  function onReq() { if (!connected) sayHello(); }
  R_apply(origAddEL, D, [DOWN, onDown]);
  R_apply(origAddEL, D, ['popshield:req', onReq]);
  sayHello();
  // document.open() erases document listeners: re-add ours (no new handshake).
  let lastRoot = D.documentElement;
  try {
    new MutationObserver(() => {
      if (D.documentElement === lastRoot) return;
      lastRoot = D.documentElement;
      R_apply(origAddEL, D, [DOWN, onDown]);
      armRealm(W);
    }).observe(D, { childList: true });
  } catch {}

  // Ask the bridge; returns 'ok' or a block reason. Fails closed.
  function ask(kind, url) {
    if (!connected) return 'no-bridge';
    const m = ObjCreate(null);
    m.type = 'ask';
    m.id = ++askSeq;
    m.kind = kind;
    m.url = str(url);
    m.async = asyncOrigin();
    answerId = m.id;
    answer = null;
    try { post(m); } catch { return 'error'; }
    const v = answer;
    answerId = -1;
    answer = null;
    return typeof v === 'string' ? v : 'no-answer';
  }

  // ------------------------------------------------------------- helpers
  function absUrl(u) {
    try { return R_apply(urlHref, new URL_(str(u), location.href), []); } catch { return str(u); }
  }
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';
  function isElement(n) { try { return !!n && R_apply(nodeTypeGet, n, []) === 1; } catch { return false; } }
  function isLink(n) {
    if (!isElement(n)) return false;
    const ln = R_apply(localNameGet, n, []);
    if (R_apply(nsGet, n, []) === SVG_NS) return ln === 'a' && (R_apply(hasAttr, n, ['href']) || R_apply(hasAttrNS, n, [XLINK_NS, 'href']));
    return (ln === 'a' || ln === 'area') && R_apply(hasAttr, n, ['href']);
  }
  function linkHref(a) {
    try {
      if (R_apply(nsGet, a, []) === SVG_NS) {
        const raw = R_apply(getAttr, a, ['href']) || R_apply(getAttrNS, a, [XLINK_NS, 'href']) || '';
        return R_apply(urlHref, new URL_(str(raw), R_apply(docBaseURI, a, [])), []);
      }
      return R_apply(R_apply(localNameGet, a, []) === 'area' ? areaHref : anchorHref, a, []);
    } catch { return ''; }
  }
  function targetOpensNew(t) {
    t = lower(t);
    return t !== '' && t !== '_self' && t !== '_parent' && t !== '_top';
  }
  function baseTarget(el) {
    try {
      const doc = R_apply(ownerDocGet, el, []);
      const b = doc && R_apply(docQS, doc, ['base[target]']);
      return b ? R_apply(getAttr, b, ['target']) : '';
    } catch { return ''; }
  }
  function linkOpensNew(a) {
    let t = R_apply(getAttr, a, ['target']);
    if (t == null) t = baseTarget(a);
    return targetOpensNew(t);
  }
  function closestLink(el) {
    try {
      const a = R_apply(elClosest, el, ['a,area']);
      return a && isLink(a) ? a : null;
    } catch { return null; }
  }

  // ---- hint: async origin (e.g. `await fetch(); window.open(url)` in a click
  // handler). V8 async stack traces keep the listener's receiver across await:
  //   element listener  -> "at async HTMLButtonElement.<anonymous>"
  //   page-wide hook    -> "at HTMLDocument.<anonymous>" / "Window."
  //   framework handler -> our "__popshieldFramework__" marker frame
  // A page can fake this (custom stack formatting, bound receivers), so the
  // bridge only honours it for same-site and sign-in/payment destinations.
  const PAGE_FRAME = /\bat (?:async )?(?:HTMLDocument|Document|Window|HTMLHtmlElement|HTMLBodyElement)\./;
  const ELEM_FRAME = /\bat (?:async )?(?:HTML|SVG)\w*Element\./;
  function asyncOrigin() {
    try {
      // The bridge only honours the async hint within 5 s of a trusted gesture:
      // outside that window skip the 50-frame stack capture. (isTrusted can't be faked.)
      if (R_apply(perfNow, perfObj, []) - lastTrusted > 5000) return false;
      if (getOwnDesc(ErrorCtor, 'prepareStackTrace')) return false; // page reformats stacks: fail closed
      const ld = getOwnDesc(ErrorCtor, 'stackTraceLimit');
      if (!ld || !('value' in ld) || !ld.writable) return false;
      let st;
      try { ErrorCtor.stackTraceLimit = 50; st = new ErrorCtor().stack; } finally { ErrorCtor.stackTraceLimit = ld.value; }
      if (typeof st !== 'string') return false;
      const lines = R_apply(strSplit, st, ['\n']);
      // The element handler must be the BOTTOM of the synchronous stack (what a
      // resumed `await` looks like), not something a timer called into, e.g. a
      // listener for a fake event dispatched from setTimeout.
      let marker = false, bottomSync = '';
      for (let i = 1; i < lines.length; i++) {
        const l = lines[i];
        if (R_apply(strIndexOf, l, ['chrome-extension://']) !== -1) {
          if (R_apply(strIndexOf, l, ['__popshieldFramework__']) !== -1) marker = true;
          continue; // our own hook frames
        }
        if (R_apply(reTest, PAGE_FRAME, [l])) return false;
        if (R_apply(strIndexOf, l, ['    at async ']) !== 0) bottomSync = l;
      }
      return marker || (!!bottomSync && R_apply(reTest, ELEM_FRAME, [bottomSync]));
    } catch { return false; }
  }

  // ---- hint: framework attribution. Old React (<=16, handlers run from one
  // listener on document), React 17+ (root container listener), Solid
  // (delegated on document) and jQuery .on(selector) run the clicked element's
  // own handler from a page-wide listener. We wrap that handler for the
  // duration of the event and tell the bridge while it runs.
  const HANDLER_PROPS = {
    click: ['onClick', 'onClickCapture'], auxclick: ['onAuxClick'], dblclick: ['onDoubleClick'],
    mouseup: ['onMouseUp'], pointerup: ['onPointerUp'], touchend: ['onTouchEnd'],
    keydown: ['onKeyDown'], keyup: ['onKeyUp'],
  };
  const wrappedFns = new WSet();
  const restores = [];
  let restoreQueued = false;
  // Its frame shows up in async stack traces of framework handlers that await.
  async function __popshieldFramework__(p) { try { await p; } catch {} }
  function fw(d) { const m = ObjCreate(null); m.type = 'fw'; m.d = d; try { post(m); } catch {} }
  function wrapHandler(obj, key) {
    let orig;
    try { orig = obj[key]; } catch { return; }
    if (typeof orig !== 'function' || R_apply(wsHas, wrappedFns, [orig])) return;
    const w = function () {
      fw(1);
      let r;
      try { r = R_apply(orig, this, arguments); } finally { fw(-1); }
      if (r && typeof r === 'object' && typeof r.then === 'function') __popshieldFramework__(r);
      return r;
    };
    R_apply(wsAdd, wrappedFns, [w]);
    try { obj[key] = w; } catch { return; } // frozen (React dev builds): skip
    if (obj[key] !== w) return;
    restores[restores.length] = () => { try { if (obj[key] === w) obj[key] = orig; } catch {} };
    if (!restoreQueued) {
      restoreQueued = true;
      R_apply(setTimeout_, W, [() => { restoreQueued = false; for (let i = restores.length - 1; i >= 0; i--) restores[i](); restores.length = 0; }, 0]);
    }
  }
  function safeMatches(el, sel) { try { return R_apply(elMatches, el, [sel]); } catch { return false; } }
  function realJQuery() {
    const jq = W.jQuery;
    try {
      return jq && typeof jq._data === 'function' && jq.fn && typeof jq.fn.jquery === 'string' && typeof jq.expando === 'string' ? jq : null;
    } catch { return null; }
  }
  const reactKeys = []; // '__reactProps$<random>' names seen on this page (one per React copy)
  const selCount = new Map(); // selector -> document-wide match count, for one gesture (cleared next task)
  let selCountQueued = false;
  // Only framework props that were already on the element when the user
  // pressed count: a page can't plant fake ones in its own press handler.
  // (Keyboard activation has no press snapshot for the clicked element's
  // props if focus moved by script, so Enter/Space trust the keydown snapshot.)
  let propsAtPress = new WSet();
  function atPress(props) { return R_apply(wsHas, propsAtPress, [props]); }
  const dateNow = Date.now;
  let lastPointerDown = 0;
  function onPress(e) {
    if (!e.isTrusted || mode === 'off') return;
    // One snapshot per physical press: the compatibility mousedown fires after
    // pointerdown, when page handlers may already have planted fake props.
    let type = '';
    try { type = R_apply(evType, e, []); } catch { return; }
    const now = R_apply(dateNow, Date, []);
    if (type === 'pointerdown') lastPointerDown = now;
    else if (type === 'mousedown' && now - lastPointerDown < 1000) return;
    let path;
    try { path = R_apply(origComposedPath, e, []); } catch { return; }
    propsAtPress = new WSet();
    const body = D.body, html = D.documentElement;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (n === W || n === D || n === body || n === html || n == null || typeof n !== 'object') continue;
      let keys;
      try { keys = ObjKeys(n); } catch { continue; }
      for (let j = 0; j < keys.length; j++) {
        if (R_apply(strStartsWith, keys[j], ['__react'])) {
          try { const v = n[keys[j]]; if (v && typeof v === 'object') R_apply(wsAdd, propsAtPress, [v]); } catch {}
        }
      }
    }
  }
  function attributeFrameworks(type, path) {
    const names = HANDLER_PROPS[type];
    if (!names) return;
    const body = D.body, html = D.documentElement;
    const solidKey = '$$' + type;
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      // composedPath() of a trusted event holds only elements, shadow roots, the document and the window:
      // skip the known non-elements by identity instead of a guarded nodeType getter call per node.
      if (n === W || n === D || n === body || n === html || n == null || typeof n !== 'object') continue;
      // Fast path: the React props key(s) already seen on this page; no Object.keys allocation.
      let known = false;
      for (let r = 0; r < reactKeys.length; r++) {
        let props; try { props = n[reactKeys[r]]; } catch {}
        if (props && typeof props === 'object') { known = true; if (atPress(props)) for (let q = 0; q < names.length; q++) wrapHandler(props, names[q]); }
      }
      if (known) continue;
      let keys;
      try { keys = ObjKeys(n); } catch { continue; }
      for (let j = 0; j < keys.length; j++) {
        const k = keys[j];
        // React <=16: __reactEventHandlers$x, React 17+: __reactProps$x (both hold the props).
        if (R_apply(strStartsWith, k, ['__reactProps$']) || R_apply(strStartsWith, k, ['__reactEventHandlers$'])) {
          if (reactKeys.length < 4) { let seen = false; for (let r = 0; r < reactKeys.length; r++) if (reactKeys[r] === k) seen = true; if (!seen) reactKeys[reactKeys.length] = k; }
          let props; try { props = n[k]; } catch {}
          if (props && typeof props === 'object' && atPress(props)) for (let q = 0; q < names.length; q++) wrapHandler(props, names[q]);
        } else if (k === solidKey) {
          wrapHandler(n, k); // Solid's delegated handler
        }
      }
    }
    // jQuery delegated handlers: $(document).on('click', '.share', fn) — specific
    // selectors only, never ones that match <body>/<html> or most of the page.
    const jq = realJQuery();
    if (!jq) return;
    const t0 = path[0];
    let inLightDom = false;
    try { inLightDom = isElement(t0) && R_apply(getRootNode, t0, []) === D; } catch {}
    for (const g of [D, html, body]) {
      let list;
      try { const ev = g && jq._data(g, 'events'); list = ev && ev[type]; } catch {}
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        const sel = h && h.selector;
        if (typeof sel !== 'string' || !R_apply(reTest, /[.#[]/, [sel]) || R_apply(strIndexOf, sel, [':not(']) !== -1) continue;
        // One native closest() from the target instead of matches() on every path node
        // (closest() stops at shadow roots, so walk the path inside shadow DOM).
        let hit = false;
        if (inLightDom) {
          let m = null;
          try { m = R_apply(elClosest, t0, [sel]); } catch {}
          hit = !!m && m !== body && m !== html;
        } else {
          for (let j = 0; j < path.length; j++) {
            const n = path[j];
            if (isElement(n) && n !== body && n !== html && safeMatches(n, sel)) { hit = true; break; }
          }
        }
        if (!hit) continue; // common case: no document-wide querySelectorAll at all
        if (safeMatches(body, sel) || safeMatches(html, sel)) continue;
        let count = R_apply(MapGet, selCount, [sel]);
        if (count === undefined) {
          try { count = D.querySelectorAll(sel).length; } catch { continue; }
          R_apply(MapSet, selCount, [sel, count]);
          if (!selCountQueued) { selCountQueued = true; R_apply(setTimeout_, W, [() => { selCountQueued = false; R_apply(MapClear, selCount, []); }, 0]); }
        }
        if (count > 50) continue;
        wrapHandler(h, 'handler');
      }
    }
  }

  // Capturing listener at window (registered before any page listener).
  // Only attribution work happens here; keyboard only for Enter/Space.
  let lastTrusted = -1e9; // performance.now() of the last trusted activating gesture (any key)
  function onGesture(e) {
    if (!e.isTrusted || mode === 'off') return;
    lastTrusted = R_apply(perfNow, perfObj, []);
    let type;
    try { type = R_apply(evType, e, []); } catch { return; }
    if ((type === 'keydown' || type === 'keyup')) {
      let k = '';
      try { k = R_apply(keyGet, e, []); } catch {}
      if (k !== 'Enter' && k !== ' ') return;
    }
    let path;
    try { path = R_apply(origComposedPath, e, []); } catch { return; }
    attributeFrameworks(type, path);
  }
  const ATTRIBUTION_EVENTS = ['click', 'auxclick', 'dblclick', 'mouseup', 'pointerup', 'touchend', 'keydown', 'keyup'];
  const PRESS_EVENTS = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
  function armRealm(win) {
    for (let i = 0; i < PRESS_EVENTS.length; i++) {
      try { R_apply(origAddEL, win, [PRESS_EVENTS[i], onPress, true]); } catch {}
    }
    for (let i = 0; i < ATTRIBUTION_EVENTS.length; i++) {
      try { R_apply(origAddEL, win, [ATTRIBUTION_EVENTS[i], onGesture, true]); } catch {}
    }
  }
  armRealm(W);

  // ------------------------------------------------- per-realm API hooks
  // Installed on our own window and on any same-origin child window the page
  // reaches into (ads create blank iframes to grab a pristine window.open).
  const patched = new WSet();
  function patchRealm(win) {
    try {
      if (!win || R_apply(wsHas, patched, [win])) return;
      R_apply(wsAdd, patched, [win]);
      try { if (!win[MARK]) defineProp(win, MARK, { value: true }); } catch {}

      // window.open
      const realOpen = win.open;
      const hookedOpen = function open(url, target) {
        try {
          if (mode === 'off') return R_apply(realOpen, this, arguments);
          const t = target === undefined || target === null ? '_blank' : str(target);
          if (!targetOpensNew(t)) return R_apply(realOpen, this, arguments); // same tab: redirect guard
          const u = url === undefined || url === null || url === '' ? 'about:blank' : absUrl(url);
          if (ask('popup', u) !== 'ok') return null;
        } catch { return null; }
        return R_apply(realOpen, this, arguments);
      };
      // May already be locked by this frame's own copy of PopShield (injected
      // first); that's fine — don't let it abort the remaining hooks below.
      try { defineProp(win, 'open', { get: () => hookedOpen, set() {}, configurable: false, enumerable: true }); } catch {}

      // element.click() on a link that opens a new tab
      const EP = win.HTMLElement.prototype;
      const realClick = EP.click;
      defineProp(EP, 'click', {
        value: function click() {
          try {
            if (mode !== 'off' && isLink(this) && !R_apply(hasAttr, this, ['download']) && linkOpensNew(this) &&
                ask('scripted-link', linkHref(this)) !== 'ok') return undefined;
          } catch { return undefined; }
          return R_apply(realClick, this, arguments);
        }, writable: true, configurable: true,
      });

      // el.dispatchEvent(new MouseEvent('click')) on such a link (HTML or SVG)
      const ETP = win.EventTarget.prototype;
      const realDispatch = ETP.dispatchEvent;
      defineProp(ETP, 'dispatchEvent', {
        value: function dispatchEvent(ev) {
          let blockIt = false;
          try {
            if (mode !== 'off' && ev && R_apply(evType, ev, []) === 'click' && isElement(this)) {
              const a = isLink(this) ? this : closestLink(this);
              if (a && !R_apply(hasAttr, a, ['download']) && linkOpensNew(a) && ask('scripted-link', linkHref(a)) !== 'ok') blockIt = true;
            }
          } catch {
            try { blockIt = R_apply(evType, ev, []) === 'click'; } catch {}
          }
          if (blockIt) return false;
          return R_apply(realDispatch, this, arguments);
        }, writable: true, configurable: true,
      });

      // form.submit() into a new tab (requestSubmit fires a submit event,
      // which the bridge judges directly)
      const FP = win.HTMLFormElement.prototype;
      const realSubmit = FP.submit;
      defineProp(FP, 'submit', {
        value: function submit() {
          try {
            if (mode !== 'off') {
              let t = R_apply(getAttr, this, ['target']);
              if (t == null) t = baseTarget(this);
              if (targetOpensNew(t)) {
                const action = absUrl(R_apply(getAttr, this, ['action']) || location.href);
                if (ask('scripted-form', action) !== 'ok') return undefined;
              }
            }
          } catch { return undefined; }
          return R_apply(realSubmit, this, arguments);
        }, writable: true, configurable: true,
      });

      // Document Picture-in-Picture: an always-on-top window no tab check can see.
      try {
        const dpip = win.documentPictureInPicture;
        if (dpip) {
          const proto = Object.getPrototypeOf(dpip);
          const realReq = proto.requestWindow;
          if (typeof realReq === 'function') {
            defineProp(proto, 'requestWindow', {
              value: function requestWindow() {
                try {
                  if (mode !== 'off' && ask('popup', 'about:blank#picture-in-picture') !== 'ok') {
                    return Promise.reject(new DOMException('Blocked by PopShield', 'NotAllowedError'));
                  }
                } catch { return Promise.reject(new DOMException('Blocked by PopShield', 'NotAllowedError')); }
                return R_apply(realReq, this, arguments);
              }, writable: true, configurable: true,
            });
          }
        }
      } catch {}

      // document.open()/write() erase listeners: re-arm attribution afterwards.
      const DP = win.Document.prototype;
      for (const name of ['open', 'write', 'writeln']) {
        const real = DP[name];
        if (typeof real !== 'function') continue;
        defineProp(DP, name, {
          value: { [name]: function () {
            const r = R_apply(real, this, arguments);
            try { const v = R_apply(defaultViewGet, this, []); if (v && (v === W || R_apply(wsHas, patched, [v]))) armRealm(v); } catch {}
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
              if (r) { try { patchRealm(prop === 'contentWindow' ? r : R_apply(defaultViewGet, r, [])); } catch {} }
              return r;
            }, configurable: true, enumerable: d.enumerable,
          });
        }
      }
    } catch { /* cross-origin or exotic window: the background backstop still applies */ }
  }
  patchRealm(W);
})();
