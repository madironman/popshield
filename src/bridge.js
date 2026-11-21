// PopShield bridge: the decision maker. Runs in the extension's ISOLATED world
// in every frame at document_start. Pages cannot see or tamper with this world:
// its built-ins, prototypes, event getters, navigator.userActivation and DOM
// accessors are all clean, unlike the page's MAIN world, where inject.js only
// installs hooks and asks this script for a verdict.
//
// It:
//  * tracks trusted user gestures itself (clean isTrusted/currentTarget/path)
//  * judges every "may this page open a tab?" question from inject.js
//  * mints the allow tokens the background backstop needs (nothing else can),
//    each bound to the URL it is for
//  * runs the redirect guard (Navigation API) and the embedded-frame hijack guard
//  * writes the blocked log (rate-limited) via the background
(() => {
  'use strict';

  const isTop = window === window.top;
  let armTopWindow = () => {};

  // ------------------------------------------------------------ settings
  let mode = null; // smart | strict | off (null until storage answers: treated as smart)
  let topSite;
  try {
    const anc = location.ancestorOrigins;
    const topOrigin = isTop ? location.href : (anc && anc.length ? anc[anc.length - 1] : location.href);
    topSite = PS.siteOfUrl(topOrigin);
  } catch { topSite = null; }
  const modeIs = (m) => (mode || 'smart') === m;

  // ------------------------------------------------ channel to inject.js
  // One-time handshake at document_start, before any page script runs. The
  // nonce is never broadcast again, and only our own page script knows it.
  let nonce = null;
  function down(msg) {
    if (nonce) document.dispatchEvent(new CustomEvent('ps-' + nonce + '-down', { detail: JSON.stringify(msg) }));
  }
  function onUp(e) {
    let m;
    try { m = JSON.parse(e.detail); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'ask') handleAsk(m);
    else if (m.type === 'fw') fwDepth = Math.max(0, fwDepth + (m.d === 1 ? 1 : -1));
  }
  function onHello(e) {
    if (nonce || typeof e.detail !== 'string' || !/^[0-9a-f]{32}$/.test(e.detail)) return;
    nonce = e.detail;
    document.removeEventListener('popshield:hello', onHello);
    document.addEventListener('ps-' + nonce + '-up', onUp);
    down({ type: 'connected' });
    if (mode) down({ type: 'mode', mode });
  }
  document.addEventListener('popshield:hello', onHello);
  document.dispatchEvent(new CustomEvent('popshield:req')); // in case inject.js ran first

  // document.open() erases listeners on the document: reattach ours (no new handshake).
  let root = document.documentElement;
  new MutationObserver(() => {
    if (document.documentElement === root) return;
    root = document.documentElement;
    if (nonce) document.addEventListener('ps-' + nonce + '-up', onUp);
    armWindow();
    if (isTop) armTopWindow();
  }).observe(document, { childList: true });

  async function refresh() {
    try {
      const m = chrome.extension.inIncognitoContext
        ? ((await chrome.runtime.sendMessage({ type: 'getMode', site: topSite })) || {}).mode || 'smart'
        : await PS.getMode(topSite);
      if (m !== mode) { mode = m; down({ type: 'mode', mode }); }
    } catch {}
  }
  refresh();
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.sites || c.defaultMode)) refresh(); });

  // ------------------------------------------------ messages to background
  function send(msg) { try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch {} }
  let allowStart = 0, allowCount = 0;
  // weak: the decision rested on a hint the page could influence (framework
  // attribution, async origin); the background then follows the new tab's
  // redirects and closes it if it ends up somewhere else.
  function allow(how, url, sameSiteOnly, weak) {
    // A script-opened tab arms the tab-under rule right away (the redirect can
    // follow in the same handler); user links and right-clicks arm it only
    // once the background confirms a tab really opened ("newTab").
    if (how === 'popup' || how === 'scripted-link' || how === 'scripted-form') lastNewTabAt = performance.now();
    const now = Date.now();
    if (now - allowStart > 10000) { allowStart = now; allowCount = 0; }
    if (++allowCount > 12) return; // background's per-tab limit; a retry loop would only burn IPC
    send({ type: 'allow', how, url: typeof url === 'string' ? url.slice(0, 2000) : null, sameSiteOnly: !!sameSiteOnly, weak: !!weak });
  }
  // Ad scripts retry blocked opens hundreds of times per click: report each
  // distinct block at most once per 5 s, and at most 20 per 10 s per frame.
  const recentBlocks = new Map();
  let burstStart = 0, burstCount = 0;
  function block(kind, reason, url, source) {
    const now = Date.now();
    const key = kind + '|' + reason + '|' + url;
    const last = recentBlocks.get(key);
    if (last && now - last < 5000) return;
    if (now - burstStart > 10000) { burstStart = now; burstCount = 0; }
    if (++burstCount > 20) return;
    recentBlocks.set(key, now);
    if (recentBlocks.size > 200) recentBlocks.clear();
    send({ type: 'blocked', kind, reason, url: String(url || '').slice(0, 2000), source: source ? String(source).slice(0, 120) : undefined });
  }

  // ------------------------------------------------------------ helpers
  function pageSite() { return PS.siteOfUrl(location.href) || topSite; }
  // Site of a destination; blob: URLs count as their inner origin.
  function destSite(u) {
    try {
      const x = new URL(u, location.href);
      if (x.protocol === 'blob:') return PS.siteOfUrl(new URL(x.pathname).origin);
      return /^https?:$/.test(x.protocol) ? PS.siteOf(x.hostname) : null;
    } catch { return null; }
  }
  // Same document as this page — ignoring #hash AND ?query, so a cache-busted
  // copy of the page (tab-under trick) still counts.
  function isSamePage(u) {
    try {
      const a = new URL(u, location.href), b = new URL(location.href);
      return a.origin === b.origin && a.pathname === b.pathname;
    } catch { return false; }
  }
  function viewOf(el) { try { return el.ownerDocument.defaultView || window; } catch { return window; } }
  // The element actually under the pointer, even inside a closed shadow root
  // (whose host may have no box of its own, e.g. display: contents).
  // Only these HTML elements and custom elements can host a shadow root
  // (attachShadow / declarative shadow DOM); skip the extension API call
  // (~5 us, several times per click) for links, buttons, images, inputs...
  const SHADOW_HOSTS = new Set(['article', 'aside', 'blockquote', 'body', 'div', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'header', 'main', 'nav', 'p', 'section', 'span']);
  function mayHostShadow(t) {
    return t.namespaceURI === 'http://www.w3.org/1999/xhtml' && (SHADOW_HOSTS.has(t.localName) || t.localName.includes('-'));
  }
  function targetOf(e) {
    let t = null;
    try { const p = e.composedPath(); if (p && p.length) t = p[0]; } catch {}
    if (!t) t = e.target;
    try {
      for (let i = 0; i < 4 && t && t.nodeType === 1 && typeof e.clientX === 'number' && mayHostShadow(t); i++) {
        const sr = chrome.dom && chrome.dom.openOrClosedShadowRoot(t);
        if (!sr) break;
        const inner = sr.elementFromPoint(e.clientX, e.clientY);
        if (!inner || inner === t) break;
        t = inner;
      }
    } catch {}
    return t;
  }
  function visibleArea(el, view) {
    const r = el.getBoundingClientRect();
    const vw = view.innerWidth || 1, vh = view.innerHeight || 1;
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return (w * h) / (vw * vh);
  }
  function alphaOf(color) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return 0; // common computed value: skip the regex
    const m = /rgba?\(([^)]+)\)/.exec(color);
    if (!m) return 1;
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    return parts.length >= 4 ? parseFloat(parts[3]) : 1;
  }
  // Opacity as the user sees it: product up the ancestor chain, 0 if hidden.
  function effectiveOpacity(el) {
    let o = 1;
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 25; n = n.parentElement, i++) {
      const cs = viewOf(n).getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      o *= parseFloat(cs.opacity);
      const f = /opacity\(([\d.]+)(%?)\)/.exec(cs.filter || '');
      if (f) o *= f[2] ? parseFloat(f[1]) / 100 : parseFloat(f[1]);
      if (o < 0.01) return 0;
    }
    return o;
  }
  // Does a CSS background-image paint anything visible? (url() images do;
  // gradients only if one of their colour stops is visibly opaque.)
  function bgImageVisible(bi) {
    if (!bi || bi === 'none') return false;
    if (/url\(/i.test(bi)) return true;
    // Computed gradients always serialise colours as rgb()/rgba().
    const colors = bi.match(/rgba?\([^)]*\)/gi);
    return !colors || colors.some((c) => alphaOf(c) >= 0.1);
  }
  const MEDIA_TAGS = new Set(['img', 'video', 'canvas', 'svg', 'picture', 'object', 'embed', 'iframe']);
  // Does this element (or anything inside it) paint something the user can see?
  function hasVisiblePaint(el) {
    const view = viewOf(el);
    const box = el.getBoundingClientRect();
    const boxArea = Math.max(1, box.width * box.height);
    const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n = el, steps = 0;
    while (n && steps++ < 300) {
      if (n.nodeType === 3) {
        if (n.data.trim()) {
          const cs = view.getComputedStyle(n.parentElement);
          const fill = cs.getPropertyValue('-webkit-text-fill-color') || cs.color;
          if (alphaOf(cs.color) >= 0.1 && alphaOf(fill) >= 0.1 && parseFloat(cs.fontSize) >= 6 &&
              effectiveOpacity(n.parentElement) >= 0.2) return true;
        }
      } else {
        const cs = view.getComputedStyle(n);
        if (cs.display === 'none' || cs.visibility === 'hidden') { n = walker.nextSibling() || nextOutside(walker); continue; }
        if (alphaOf(cs.backgroundColor) >= 0.1 || bgImageVisible(cs.backgroundImage)) {
          if (effectiveOpacity(n) >= 0.2) return true;
        }
        if (MEDIA_TAGS.has(n.localName)) {
          const r = n.getBoundingClientRect();
          if ((r.width * r.height) / boxArea >= 0.1 && effectiveOpacity(n) >= 0.2) return true;
        }
      }
      n = walker.nextNode();
    }
    return false; // nothing visible found within the first 300 nodes: treat as invisible
  }
  function nextOutside(walker) {
    for (let p = walker.parentNode(); p; p = walker.parentNode()) { const s = walker.nextSibling(); if (s) return s; }
    return null;
  }

  const INTERACTIVE = 'a[href],button,input,select,textarea,label,summary,[role=button],[role=link],[onclick],[contenteditable]';
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const XLINK_NS = 'http://www.w3.org/1999/xlink';

  // An (effectively) invisible element covering much of the viewport: the
  // click is meant for whatever the user can see underneath it.
  function isOverlay(el) {
    try {
      if (!el || el.nodeType !== 1 || el.localName === 'html' || el.localName === 'body') return false;
      const tag = el.localName;
      if (tag === 'video' || tag === 'img' || tag === 'canvas' || tag === 'svg') return false;
      const view = viewOf(el);
      if (visibleArea(el, view) < 0.35) return false;
      if (effectiveOpacity(el) < 0.2) return true;
      // Paints nothing visible (transparent text, transparent gradients, no
      // sizeable visible media), however it got stacked on top: position,
      // grid, negative margins, transforms.
      return !hasVisiblePaint(el);
    } catch { return false; }
  }

  // A visible layer stacked at (near) the max z-index over a large part of the
  // page, clicked on non-interactive content (offerwall image over a button).
  function isAdLayer(el) {
    try {
      if (!el || el.nodeType !== 1 || el.localName === 'html' || el.localName === 'body') return false;
      if (el.closest(INTERACTIVE)) return false;
      const view = viewOf(el);
      for (let n = el, i = 0; n && n.localName !== 'body' && n.localName !== 'html' && i < 4; n = n.parentElement, i++) {
        const cs = view.getComputedStyle(n);
        if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
        if ((parseInt(cs.zIndex, 10) || 0) < 2147480000) continue;
        if (visibleArea(n, view) >= 0.25) return true;
      }
      return false;
    } catch { return false; }
  }

  // A listener that sees every click: window/document/<html>/<body> of any
  // frame, or a wrapper element covering at least 40% of the viewport (a
  // React-style root or "#app" div). Framework-attributed handlers are exempt.
  // The geometry comes from the snapshot taken when the event started, so a
  // handler can't shrink its wrapper just before it asks. A listener element
  // that isn't on the event's path (detached, moved) is treated as page-wide.
  function isPageWide(ct, snap) {
    try {
      if (!ct) return true;
      if (ct === window || ct === document || ct.window === ct) return true;
      if (ct.nodeType === 9 || ct.nodeType === 11) return true;
      if (ct.nodeType !== 1) return false;
      if (ct.localName === 'html' || ct.localName === 'body') return true;
      if (snap) return !snap.path.has(ct) || snap.big.has(ct);
      if (ct.matches(INTERACTIVE)) return false;
      return visibleArea(ct, viewOf(ct)) >= 0.4;
    } catch { return true; }
  }

  function isLink(n) {
    try {
      if (!n || n.nodeType !== 1) return false;
      if (n.namespaceURI === SVG_NS) return n.localName === 'a' && (n.hasAttribute('href') || n.hasAttributeNS(XLINK_NS, 'href'));
      return (n.localName === 'a' || n.localName === 'area') && n.hasAttribute('href');
    } catch { return false; }
  }
  function rawHref(a) { return (a.getAttribute('href') || a.getAttributeNS(XLINK_NS, 'href') || '') + ''; }
  function linkHref(a) {
    try {
      if (a.namespaceURI === SVG_NS) return new URL(rawHref(a), a.ownerDocument.baseURI).href;
      return a.href;
    } catch { return ''; }
  }
  const baseLists = new WeakMap(); // document -> live HTMLCollection of <base>
  function baseTarget(doc) {
    try {
      let bases = baseLists.get(doc);
      if (!bases) baseLists.set(doc, bases = doc.getElementsByTagName('base'));
      for (let i = 0; i < bases.length; i++) if (bases[i].hasAttribute('target')) return bases[i].getAttribute('target');
      return '';
    } catch { return ''; }
  }
  function targetOpensNew(t) {
    t = String(t || '').toLowerCase();
    return t !== '' && t !== '_self' && t !== '_parent' && t !== '_top';
  }
  function anchorOpensNew(a) {
    let t = a.getAttribute('target');
    if (t == null) t = baseTarget(a.ownerDocument);
    return targetOpensNew(t);
  }
  // A link that doesn't really go anywhere: "#", "#x", "javascript:", or this page.
  function isDeadHref(a) {
    const raw = rawHref(a).trim().toLowerCase();
    return raw === '' || raw[0] === '#' || raw.startsWith('javascript:') || isSamePage(linkHref(a));
  }
  // A same-origin, script-built frame pinned over the page at (near) max z-index.
  function inAdBoxFrame(win) {
    try {
      if (win === win.top) return false;
      const fe = win.frameElement;
      if (!fe) return false;
      const src = (fe.getAttribute('src') || '').trim().toLowerCase();
      if (!(fe.hasAttribute('srcdoc') || src === '' || src.startsWith('about:') || src.startsWith('data:'))) return false;
      const cs = fe.ownerDocument.defaultView.getComputedStyle(fe);
      return cs.position === 'fixed' && (parseInt(cs.zIndex, 10) || 0) >= 2147480000;
    } catch { return false; }
  }
  // The link the user clicked, including links inside (closed) shadow roots.
  function clickedLink(e) {
    let p = [];
    try { p = e.composedPath(); } catch {}
    for (let i = 0; i < p.length; i++) if (isLink(p[i])) return p[i];
    try {
      const host = p[0];
      const sr = host && host.nodeType === 1 && chrome.dom && chrome.dom.openOrClosedShadowRoot(host);
      if (sr && typeof e.clientX === 'number') {
        for (let n = sr.elementFromPoint(e.clientX, e.clientY); n; n = n.parentNode instanceof ShadowRoot ? null : n.parentNode) {
          if (isLink(n)) return n;
        }
      }
    } catch {}
    return null;
  }

  // A sign-in or payment flow at a known provider: exact host and path only (a
  // provider's domain can also contain pages that forward elsewhere).
  function providerFlow(url) { return PS.isProviderFlow(url); }

  // --------------------------------------------------------- gesture state
  const GESTURES = ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'keydown', 'keyup', 'contextmenu'];
  const ACTIVATING = new Set(['click', 'auxclick', 'dblclick', 'mouseup', 'pointerup', 'touchend', 'keydown', 'keyup']);
  let cur = null;               // the last trusted gesture event (live while being dispatched)
  let lastAct = null;           // { t, target } of the last trusted activating gesture
  let gestures = 0;             // count of trusted activating gestures in this document
  let fwDepth = 0;              // > 0 while inject.js runs the clicked element's framework handler
  let lastNewTabAt = -1e9;      // performance.now() of the last new tab we allowed from this tab
  let lastPressAt = -1e9;       // performance.now() of the last trusted pointer/key press
  let lastFrameGesture = 0;     // (top) Date.now() of the last click inside a child frame
  let lastTopGesture = 0;       // Date.now() of the last trusted activating gesture in this frame
  let lastRelay = 0;            // (child) throttle for frame-gesture relays
  let clickTask = null;         // the trusted click being handled in the current task
  let press = null;             // what the user pressed: { link, href, control, form, type, ftarget, faction }
  let weakOpened = false;       // (top) this tab was opened on weak evidence and not used yet
  let enterTask = null;         // the trusted Enter keydown being handled in the current task

  function inDispatch() { return !!cur && cur.eventPhase !== 0; }
  // Transient user activation, tracked ourselves (navigator.userActivation is
  // not reliable from extension worlds): a trusted activating gesture in this
  // frame within the last 5 s, matching Chrome's own activation window.
  function activationActive() { return !!lastAct && performance.now() - lastAct.t < 5000; }

  // Is the code running right now handling a real, element-scoped user gesture?
  function gestureVerdict() {
    const e = cur;
    if (!e || e.eventPhase === 0) return 'no-gesture';
    if (!ACTIVATING.has(e.type)) return 'non-activating-event';
    const snap = snapshotFor(e);
    if (fwDepth === 0 && isPageWide(e.currentTarget, snap)) return 'page-wide-listener';
    return snap.target;
  }
  // Geometry snapshot, taken by our capture listener when a trusted activating
  // event starts — before any page code runs — and shared by the events of one
  // physical click (pointerup, mouseup, click) so page handlers in between
  // can't remove an overlay or shrink a wrapper to fool the check.
  let snap = null;
  function snapshotFor(e) {
    if (snap && snap.e === e) return snap;
    const t = targetOf(e);
    if (snap && snap.t === t && Math.abs(e.timeStamp - snap.ts) < 1000) { snap.e = e; return snap; }
    const big = new Set(), path = new Set();
    let p = [];
    try { p = e.composedPath(); } catch {}
    for (let i = 0; i < p.length; i++) {
      const n = p[i];
      path.add(n);
      try {
        if (n && n.nodeType === 1 && n.localName !== 'html' && n.localName !== 'body' && !n.matches(INTERACTIVE) &&
            visibleArea(n, viewOf(n)) >= 0.4) big.add(n);
      } catch {}
    }
    const target = isOverlay(t) ? 'invisible-overlay' : isAdLayer(t) ? 'ad-layer' : 'ok';
    return (snap = { e, t, ts: e.timeStamp, big, path, target });
  }
  // After an await: only to this site or a sign-in/payment provider, only
  // while Chrome still considers the user's click active.
  function asyncAllowed(url) {
    try {
      if (!lastAct || performance.now() - lastAct.t > 5000) return false;
      if (lastAct.verdict !== 'ok') return false;
      const s = destSite(url);
      return !!s && (s === pageSite() || providerFlow(url));
    } catch { return false; }
  }
  function judge(url, async) {
    if (modeIs('off')) return 'ok';
    if (modeIs('strict')) return 'strict-mode';
    const v = gestureVerdict();
    if (v === 'no-gesture' && async && asyncAllowed(url)) return 'ok';
    // A cross-site popup from a listener on something that isn't clickable
    // (ads attached to every element on the page): something between the
    // clicked element and the listener must look clickable.
    if (v === 'ok' && fwDepth === 0 && destSite(url) !== pageSite() && !clickablePath(cur)) return 'non-interactive-listener';
    return v;
  }
  function clickablePath(e) {
    try {
      const ct = e.currentTarget, p = e.composedPath();
      for (let i = 0; i < p.length; i++) {
        const n = p[i];
        if (n && n.nodeType === 1) {
          if (n.matches(INTERACTIVE)) return true;
          const c = viewOf(n).getComputedStyle(n).cursor;
          if (c && c !== 'auto' && c !== 'default' && c !== 'text') return true;
        }
        if (n === ct) break;
      }
      return false;
    } catch { return true; }
  }

  const ASK_KINDS = { popup: 'popup', 'scripted-link': 'scripted-link', 'scripted-form': 'scripted-form' };
  function handleAsk(m) {
    const kind = ASK_KINDS[m.kind];
    if (!kind || typeof m.id !== 'number') return;
    const url = typeof m.url === 'string' ? m.url : '';
    let v = judge(url, m.async === true);
    // Tab-under: opening *this same page* (any query) in a new tab during a click.
    if (v === 'ok' && !modeIs('off') && kind === 'popup' && url && url !== 'about:blank' && isSamePage(url)) v = 'tab-under';
    if (v === 'ok') {
      // Weak if it rested on the framework or async hint (both page-influenced).
      // (Picture-in-Picture opens no tab, so it needs no backstop token.)
      if (!modeIs('off') && url !== 'about:blank#picture-in-picture') allow(kind, url, false, fwDepth > 0 || !inDispatch());
    } else {
      block(kind, v, url);
    }
    down({ type: 'verdict', id: m.id, v });
  }

  // --------------------------------------------------- gesture listener
  function onGesture(e) {
    if (!e.isTrusted) return;
    cur = e;
    const type = e.type;
    if (modeIs('off')) return;

    // Child frame: tell the top frame (via the background) the user is clicking here.
    if (!isTop && (type === 'pointerdown' || type === 'mousedown' || type === 'touchstart')) {
      const now = Date.now();
      if (now - lastRelay > 250) { lastRelay = now; send({ type: 'frameGesture' }); }
    }
    if (type === 'pointerdown' || type === 'mousedown' || type === 'touchstart' || type === 'keydown') {
      lastPressAt = performance.now();
      // Snapshot what is being pressed, before page handlers can re-wire it
      // (swap a link's address, attach a button to an ad form). The compat
      // mousedown / touchstart right after a pointerdown are the same press.
      // Typing: only Enter/Space activate, so other keys just drop the old
      // snapshot instead of walking the focused element's path per keystroke.
      if (type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') press = null;
      else if (!((type === 'mousedown' || type === 'touchstart') && press && press.type0 === 'pointerdown' && performance.now() - press.t < 1000)) press = pressSnapshot(e, type);
    }
    const keyOk = (type !== 'keydown' && type !== 'keyup') || e.key === 'Enter' || e.key === ' ';
    if (ACTIVATING.has(type) && keyOk) {
      lastAct = { t: performance.now(), verdict: snapshotFor(e).target };
      gestures++;
      lastTopGesture = Date.now();
    }
    // Native form submits are only the user's when they happen in the same
    // task as their click / Enter (a page timer runs after our clear-out).
    if (type === 'click') { clickTask = e; setTimeout(() => { if (clickTask === e) clickTask = null; }, 0); }
    if (type === 'keydown' && e.key === 'Enter') { enterTask = e; setTimeout(() => { if (enterTask === e) enterTask = null; }, 0); }

    if (type === 'click' || type === 'auxclick' || type === 'contextmenu') {
      const a = clickedLink(e);
      const modifier = e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
      const aOverlay = !!a && isOverlay(a);
      const aDead = !!a && isDeadHref(a);
      if (a && type !== 'contextmenu' && (aOverlay || (aDead && inAdBoxFrame(viewOf(a))))) {
        // Invisible full-page ad link, or a decoy link in an injected ad box.
        e.preventDefault();
        e.stopImmediatePropagation();
        block('overlay-link', aOverlay ? 'invisible-overlay' : 'ad-box-frame', linkHref(a), (a.textContent || '').trim());
        return;
      }
      // The page re-pointed the pressed link to another site between press and click.
      if (a && type !== 'contextmenu' && press && press.link === a && press.href) {
        const now = linkHref(a);
        if (now !== press.href && destSite(now) !== destSite(press.href)) {
          e.preventDefault();
          e.stopImmediatePropagation();
          block('scripted-link', 'link-swapped', now);
          return;
        }
      }
      if (type === 'contextmenu') {
        // "Open link in new tab" from the menu: only for a real, visible link.
        if (a && !aDead && !aOverlay) allow('contextmenu', linkHref(a), false);
      } else if (a && (modifier || anchorOpensNew(a))) {
        // The user really clicked a link: the tab must open at that address. A
        // decoy ("#") link's tab must also stay on this site.
        allow('user-link', linkHref(a), aDead);
      } else if (modifier) {
        // Modifier click with no link we can see: same-site tabs only.
        allow('user-link', null, true);
      }
    }
  }
  function pressSnapshot(e, type0) {
    const snapP = { t: performance.now(), type0, link: null, href: '', control: null };
    let p = [];
    try { p = e.composedPath(); } catch {}
    for (let i = 0; i < p.length; i++) {
      const n = p[i];
      if (!snapP.link && isLink(n)) { snapP.link = n; snapP.href = linkHref(n); }
      if (!snapP.control && n && n.nodeType === 1 && (n.localName === 'button' || n.localName === 'input')) {
        snapP.control = n;
        try {
          snapP.form = n.form; snapP.type = n.type;
          snapP.ftarget = n.getAttribute('formtarget'); snapP.faction = n.getAttribute('formaction');
        } catch {}
      }
    }
    return snapP;
  }
  // document.open() erases this frame's window listeners too: armWindow() is
  // called again from the MutationObserver above when the document is replaced.
  function armWindow() {
    for (const t of GESTURES) window.addEventListener(t, onGesture, true);
    window.addEventListener('submit', onSubmit, true);
  }

  // Form submits into a new tab. The submit event is trusted even when a script
  // triggered it (submitButton.click(), requestSubmit()), so judge it by its cause.
  function onSubmit(e) {
    if (!e.isTrusted || modeIs('off')) return;
    const f = targetOf(e);
    if (!f || f.localName !== 'form') return;
    const sub = e.submitter;
    let t = (sub && sub.getAttribute('formtarget')) || f.getAttribute('target');
    if (t == null) t = baseTarget(f.ownerDocument);
    if (!targetOpensNew(t)) return; // same-tab submit: the redirect guard covers it
    let action = '';
    try { action = new URL((sub && sub.getAttribute('formaction')) || f.getAttribute('action') || '', f.ownerDocument.baseURI).href; } catch {}
    let v;
    if (inDispatch()) {
      v = judge(action, false);           // fired from inside an event handler
    } else {
      // Native submit: must come from the user's own click on a visible submit
      // button, or Enter in this form, in the same task.
      const ct = clickTask && targetOf(clickTask), kt = enterTask && targetOf(enterTask);
      const rewired = !!press && press.control === sub && (sub.form !== press.form || sub.type !== press.type ||
        sub.getAttribute('formtarget') !== press.ftarget || sub.getAttribute('formaction') !== press.faction);
      const byClick = !!ct && !!sub && sub.contains(ct) && snapshotFor(clickTask).target === 'ok' && !isOverlay(sub) && !rewired;
      if (rewired) { e.preventDefault(); e.stopImmediatePropagation(); block('scripted-form', 'form-swapped', action); return; }
      const byEnter = !!kt && f.contains(kt);
      v = byClick || byEnter ? 'ok' : (modeIs('strict') ? 'strict-mode' : 'no-gesture');
    }
    if (v === 'ok') { allow('user-form', action, false); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    block('scripted-form', v, action);
  }
  armWindow();

  // ------------------------------------- same-tab hijack redirects (top frame)
  // The user's most recent click was inside a child frame, less than 6 s ago.
  // (When the user reloads or types a URL, focus moves to Chrome's toolbar, so
  // document.hasFocus() is false; an ad hijacking from inside the embedded
  // frame leaves the focus on the page.)
  function frameJustClicked() {
    return Date.now() - lastFrameGesture < 6000 && lastFrameGesture >= lastTopGesture && document.hasFocus();
  }
  if (isTop) {
    chrome.runtime.onMessage.addListener((m) => {
      if (m && m.type === 'frameGesture') lastFrameGesture = Date.now();
      else if (m && m.type === 'newTab') lastNewTabAt = performance.now(); // opened from any frame of this tab
    });
    // A new page in this tab: did the tab open another one recently?
    try {
      chrome.runtime.sendMessage({ type: 'tabState' }).then((r) => {
        if (r && typeof r.newTabAgo === 'number' && r.newTabAgo < 60000) {
          lastNewTabAt = Math.max(lastNewTabAt, performance.now() - r.newTabAgo);
        }
        if (r && r.weakOpened) weakOpened = true;
      }).catch(() => {});
    } catch {}
    window.addEventListener('blur', onTopBlur, true);
    function onTopBlur() {
      const a = document.activeElement;
      if (!a || (a.localName !== 'iframe' && a.localName !== 'frame')) return;
      lastFrameGesture = Date.now();
      // The click went into a large, near-invisible frame: an overlay, not the
      // thing the user saw. Tell the background not to trust that frame's clicks.
      // (A frame you can barely see that receives a click is an overlay, whatever its size.)
      try { if (effectiveOpacity(a) < 0.5) send({ type: 'frameOverlay' }); } catch {}
    }

    if (window.navigation) {
      window.navigation.addEventListener('navigate', (e) => {
        if (modeIs('off') || e.userInitiated || !e.cancelable) return;
        const nt = e.navigationType;
        if (nt === 'traverse' || nt === 'reload' || e.hashChange || e.downloadRequest) return;
        const dest = e.destination && e.destination.url;
        const ds = destSite(dest);
        if (!ds) return;                                      // mailto:, tel:, intent: ... never interfere
        const reason = redirectReason(ds, dest);
        if (!reason) return;
        if (reason === 'provider-flow') { send({ type: 'watchNav', also: dest }); return; }
        if (ds === pageSite()) {
          // Same site: let it go, but have the background follow it — a
          // same-site redirector can bounce the tab to an ad.
          send({ type: 'watchNav' });
          return;
        }
        e.preventDefault();
        block('redirect', reason, dest);
      });
    }
    // Would a script-driven navigation of this tab to `ds` be a hijack?
    function redirectReason(ds, dest) {
      // Tab-under: a new tab was opened from this tab and the user hasn't
      // pressed anything since (a press within 0.5 s is the same click).
      if (performance.now() - lastNewTabAt < 60000 && lastPressAt < lastNewTabAt + 500) return 'tab-under';
      // A popup we allowed is being sent elsewhere before anyone used it.
      if (!gestures && (window.opener || weakOpened)) return 'popup-hijack';
      // Strict: once the user has interacted with this page, a script may not
      // send the tab to another site on its own, however long it waits.
      if (modeIs('strict') && gestures && !inDispatch()) return 'strict-mode';
      // A sign-in or payment flow (exact provider hosts and paths): allowed,
      // but the background follows where it goes next.
      if (providerFlow(dest)) return 'provider-flow';
      if (!activationActive()) return null;                 // not interaction-driven (e.g. on-load redirect)
      const v = gestureVerdict();
      if (v === 'ok') return modeIs('strict') && !inDispatch() ? 'strict-mode' : null;
      if (v === 'no-gesture') return frameJustClicked() ? 'embedded-frame' : 'no-gesture';
      return v;
    }

    // A cross-site iframe doing `top.location = ad` never fires the navigate
    // event above. The top page still gets beforeunload: if the user clicked
    // inside a cross-site frame a moment ago, hold the page ("Leave site?").
    window.addEventListener('beforeunload', onBeforeUnload, true);
    function onBeforeUnload(e) {
      if (modeIs('off') || !frameJustClicked() || inDispatch()) return;
      // Was the recent click inside a cross-site frame?
      let crossSite = false;
      for (const f of document.querySelectorAll('iframe,frame')) {
        const fs = destSite(f.src);
        if (fs && fs !== pageSite()) { crossSite = true; break; }
      }
      if (!crossSite) return;
      e.preventDefault();
      e.returnValue = '';
      block('redirect', 'embedded-frame', '');
    }
    armTopWindow = () => {
      window.addEventListener('blur', onTopBlur, true);
      window.addEventListener('beforeunload', onBeforeUnload, true);
    };
  }
})();
