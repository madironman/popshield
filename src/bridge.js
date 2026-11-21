// PopShield bridge: the decision maker. Runs in the extension's ISOLATED world
// in every frame at document_start. Pages cannot see or tamper with this world:
// its built-ins, prototypes, event getters, navigator.userActivation and DOM
// accessors are all clean, unlike the page's MAIN world, where inject.js only
// installs hooks and asks this script for a verdict.
//
// It:
//  * watches trusted user gestures itself (clean isTrusted/currentTarget/path)
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
      const m = await PS.getMode(topSite);
      if (m !== mode) { mode = m; down({ type: 'mode', mode }); }
    } catch {}
  }
  refresh();
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.sites || c.defaultMode)) refresh(); });

  // ------------------------------------------------ messages to background
  function send(msg) { try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch {} }
  function allow(how, url, sameSiteOnly) {
    send({ type: 'allow', how, url: typeof url === 'string' ? url.slice(0, 2000) : null, sameSiteOnly: !!sameSiteOnly });
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
  function targetOf(e) { try { const p = e.composedPath(); if (p && p.length) return p[0]; } catch {} return e.target; }
  function visibleArea(el, view) {
    const r = el.getBoundingClientRect();
    const vw = view.innerWidth || 1, vh = view.innerHeight || 1;
    const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
    return (w * h) / (vw * vh);
  }
  function alphaOf(color) {
    if (!color || color === 'transparent') return 0;
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
  function positionedWithin(el, levels) {
    for (let n = el, i = 0; n && n.nodeType === 1 && i < levels; n = n.parentElement, i++) {
      const p = viewOf(n).getComputedStyle(n).position;
      if (p === 'fixed' || p === 'absolute') return true;
    }
    return false;
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
      if (!positionedWithin(el, 4)) return false;
      if (effectiveOpacity(el) < 0.2) return true;
      // Fully transparent box: no background, no visible text, no sizeable visible media.
      const cs = view.getComputedStyle(el);
      if (cs.backgroundImage !== 'none' || alphaOf(cs.backgroundColor) >= 0.1) return false;
      if ((el.innerText || '').trim()) return false;
      const elArea = Math.max(1, el.getBoundingClientRect().width * el.getBoundingClientRect().height);
      for (const m of el.querySelectorAll('img,video,canvas,svg,picture,object,embed,iframe')) {
        const r = m.getBoundingClientRect();
        if ((r.width * r.height) / elArea >= 0.1 && effectiveOpacity(m) >= 0.2) return false;
      }
      return true;
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
  // frame, or a wrapper element covering at least half the viewport (a
  // React-style root or "#app" div). Framework-attributed handlers are exempt.
  function isPageWide(ct) {
    try {
      if (!ct) return true;
      if (ct === window || ct === document || ct.window === ct) return true;
      if (ct.nodeType === 9 || ct.nodeType === 11) return true;
      if (ct.nodeType !== 1) return false;
      if (ct.localName === 'html' || ct.localName === 'body') return true;
      if (ct.matches(INTERACTIVE)) return false;
      return visibleArea(ct, viewOf(ct)) >= 0.5;
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
  function baseTarget(doc) { try { const b = doc.querySelector('base[target]'); return b ? b.getAttribute('target') : ''; } catch { return ''; } }
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

  // Sign-in and payment providers: a popup or redirect to them after an await
  // (no live click any more) is normal. Ads never qualify.
  const ASYNC_OK = new Set(['google.com', 'apple.com', 'microsoftonline.com', 'live.com', 'microsoft.com', 'github.com',
    'gitlab.com', 'facebook.com', 'x.com', 'twitter.com', 'linkedin.com', 'paypal.com', 'stripe.com', 'razorpay.com',
    'auth0.com', 'okta.com', 'amazon.com', 'yahoo.com', 'discord.com', 'slack.com', 'zoom.us', 'dropbox.com', 'atlassian.com']);

  // --------------------------------------------------------- gesture state
  const GESTURES = ['click', 'auxclick', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup',
    'touchstart', 'touchend', 'keydown', 'keyup', 'contextmenu'];
  const ACTIVATING = new Set(['click', 'auxclick', 'dblclick', 'mouseup', 'pointerup', 'touchend', 'keydown', 'keyup']);
  let cur = null;               // the last trusted gesture event (live while being dispatched)
  let lastAct = null;           // { t, target } of the last trusted activating gesture
  let gestures = 0;             // count of trusted activating gestures in this document
  let fwDepth = 0;              // > 0 while inject.js runs the clicked element's framework handler
  let openedSinceGesture = false; // a script-opened tab was allowed since the last real gesture
  let lastFrameGesture = 0;     // (top) Date.now() of the last click inside a child frame
  let lastTopGesture = 0;       // Date.now() of the last trusted activating gesture in this frame
  let lastRelay = 0;            // (child) throttle for frame-gesture relays

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
    if (fwDepth === 0 && isPageWide(e.currentTarget)) return 'page-wide-listener';
    const t = targetOf(e);
    if (isOverlay(t)) return 'invisible-overlay';
    if (isAdLayer(t)) return 'ad-layer';
    return 'ok';
  }
  // After an await: only to this site or a sign-in/payment provider, only
  // while Chrome still considers the user's click active.
  function asyncAllowed(url) {
    try {
      if (!lastAct || performance.now() - lastAct.t > 5000) return false;
      if (isOverlay(lastAct.target) || isAdLayer(lastAct.target)) return false;
      const s = destSite(url);
      return !!s && (s === pageSite() || ASYNC_OK.has(s));
    } catch { return false; }
  }
  function judge(url, async) {
    if (modeIs('off')) return 'ok';
    if (modeIs('strict')) return 'strict-mode';
    const v = gestureVerdict();
    if (v === 'no-gesture' && async && asyncAllowed(url)) return 'ok';
    return v;
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
      if (!modeIs('off')) { openedSinceGesture = true; allow(kind, url, false); }
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
    if (ACTIVATING.has(type)) {
      lastAct = { t: performance.now(), target: targetOf(e) };
      gestures++;
      openedSinceGesture = false;
      lastTopGesture = Date.now();
    }

    if (type === 'click' || type === 'auxclick' || type === 'contextmenu') {
      const a = clickedLink(e);
      const modifier = e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;
      if (a && type !== 'contextmenu' && (isOverlay(a) || (isDeadHref(a) && inAdBoxFrame(viewOf(a))))) {
        // Invisible full-page ad link, or a decoy link in an injected ad box.
        e.preventDefault();
        e.stopImmediatePropagation();
        block('overlay-link', isOverlay(a) ? 'invisible-overlay' : 'ad-box-frame', linkHref(a), (a.textContent || '').trim());
        return;
      }
      if (type === 'contextmenu') {
        // "Open link in new tab" from the menu: only for a real, visible link.
        if (a && !isDeadHref(a) && !isOverlay(a)) allow('contextmenu', linkHref(a), false);
      } else if (a && (modifier || anchorOpensNew(a))) {
        // The user really clicked a link: the tab must open at that address. A
        // decoy ("#") link's tab must also stay on this site.
        allow('user-link', linkHref(a), isDeadHref(a));
      } else if (modifier) {
        // Modifier click with no link we can see: same-site tabs only.
        allow('user-link', null, true);
      }
    }
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
      // Native submit: must follow the user's own click / Enter on this form.
      const prev = cur, src = prev && targetOf(prev);
      const ok = !!prev && performance.now() - prev.timeStamp < 1000 &&
        ((prev.type === 'click' && sub && src && sub.contains(src)) ||
         ((prev.type === 'keydown' || prev.type === 'keyup') && src && f.contains(src)));
      v = ok ? 'ok' : (modeIs('strict') ? 'strict-mode' : 'no-gesture');
    }
    if (v === 'ok') { allow('user-form', action, false); return; }
    e.preventDefault();
    e.stopImmediatePropagation();
    block('scripted-form', v, action);
  }
  armWindow();

  // ------------------------------------- same-tab hijack redirects (top frame)
  // The user's most recent click was inside a child frame, less than 4 s ago.
  // (When the user reloads or types a URL, focus moves to Chrome's toolbar, so
  // document.hasFocus() is false; an ad hijacking from inside the player
  // leaves the focus on the page.)
  function frameJustClicked() {
    return Date.now() - lastFrameGesture < 4000 && lastFrameGesture >= lastTopGesture && document.hasFocus();
  }
  if (isTop) {
    chrome.runtime.onMessage.addListener((m) => { if (m && m.type === 'frameGesture') lastFrameGesture = Date.now(); });
    window.addEventListener('blur', onTopBlur, true);
    function onTopBlur() {
      const a = document.activeElement;
      if (!a || (a.localName !== 'iframe' && a.localName !== 'frame')) return;
      lastFrameGesture = Date.now();
      // The click went into a large, near-invisible frame: an overlay, not the
      // thing the user saw. Tell the background not to trust that frame's clicks.
      try { if (visibleArea(a, window) >= 0.35 && effectiveOpacity(a) < 0.2) send({ type: 'frameOverlay' }); } catch {}
    }

    if (window.navigation) {
      window.navigation.addEventListener('navigate', (e) => {
        if (modeIs('off') || e.userInitiated || !e.cancelable) return;
        const nt = e.navigationType;
        if (nt === 'traverse' || nt === 'reload' || e.hashChange || e.downloadRequest) return;
        const dest = e.destination && e.destination.url;
        const ds = destSite(dest);
        if (!ds || ds === pageSite()) return;                 // same site / unknown scheme: never interfere
        let reason = null;
        if (openedSinceGesture) {
          // Tab-under: a script opened a tab and now sends this tab elsewhere,
          // before the user clicked again.
          reason = 'tab-under';
        } else if (!gestures && window.opener && !ASYNC_OK.has(ds)) {
          // A popup we allowed is being sent somewhere else before anyone used it.
          reason = 'popup-hijack';
        } else {
          if (!activationActive()) return;                   // not interaction-driven (e.g. on-load redirect)
          const v = gestureVerdict();
          if (v === 'ok') return;
          if (v === 'no-gesture') {
            if (frameJustClicked()) reason = 'embedded-frame';
            else if (!ASYNC_OK.has(ds)) reason = 'no-gesture'; // timer / <meta refresh> right after a click
          } else {
            reason = v;
          }
          if (!reason && modeIs('strict')) reason = 'strict-mode';
        }
        if (!reason) return;
        e.preventDefault();
        block('redirect', reason, dest);
      });
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
