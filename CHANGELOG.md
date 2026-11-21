# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-21

First public release.

### Added

- **User-intent model.** A page may open a new tab only while a real (trusted)
  click or key press is being delivered to a listener on a specific element.
  Opens from timers, plain async code, or `mousedown` / `pointerdown` instead
  of a full click are blocked.
- **Hardened architecture: decisions in the isolated world.** `inject.js`
  (page MAIN world) only hooks the APIs that open tabs (`window.open`,
  `HTMLElement.click()` on links, `dispatchEvent(click)` on HTML and SVG links,
  `form.submit()`, Document Picture-in-Picture `requestWindow()`) and
  synchronously asks the isolated-world `bridge.js` for a verdict over a
  private channel. The channel's 128-bit nonce is exchanged once at
  `document_start`, before any page script runs, and never re-broadcast. Every
  built-in `inject.js` uses is captured up front (including regular-expression
  matching through a saved `exec`, `querySelectorAll`, the `document.body` /
  `documentElement` getters, `Object.getPrototypeOf`, `Promise.reject` and
  `DOMException`), and its loops use indexes rather than the page's array
  iterator. It supplies only two hints:
  framework attribution and async origin (ignored if `Error.prepareStackTrace`
  is set). `bridge.js` judges with clean APIs, mints every allow token (each
  bound to a URL), runs the redirect, embedded-frame and native form-submit
  guards, and writes the block log.
- **Geometry snapshot at gesture start.** The bridge measures the page when a
  trusted activating event starts, before any page code runs, and the events
  of one physical click (pointerup, mouseup, click) share that snapshot. An ad
  can't remove its overlay or shrink its wrapper between your click and its
  request. A page that subverts `inject.js` can at
  most skip the early block: the backstop still closes any tab the bridge
  didn't approve.
- **Press-time snapshot.** At each press (pointer, touch, or Enter / Space),
  the bridge records the pressed link and its address, and the pressed button
  with its form, type, `formtarget` and `formaction`. If a script re-points
  that link to another site, or re-wires that button, before the click, the
  click or submit is refused (`link-swapped`, `form-swapped`). Other
  keystrokes take no snapshot, so typing costs nothing extra.
- **Strict background worker.** Accepts only bridge messages; whitelists the
  kinds and reasons in the block log; rate-limits messages per tab; takes the
  frame address from `sender.url` (origin and path only); tokens last 3 s
  (8 s for right-click "Open link in new tab"), at most 4 per tab, and only
  fit a new tab on the site they were minted for. Tokens for links the user
  clicked fit only the exact page (origin and path).
- **Page-wide listener detection.** Listeners on `window`, a document, a
  shadow root, `<html>`, `<body>`, a non-interactive wrapper element covering
  at least 40% of the viewport, or an element that wasn't on the click's path
  cannot open tabs, unless the clicked element's own framework handler is
  running.
- **Non-interactive listener rule.** A cross-site popup from a listener where
  nothing between the clicked element and the listener looks clickable (an
  interactive element, or a pointer-like cursor) is refused
  (`non-interactive-listener`). This catches ad scripts that attach a
  listener to every element on the page.
- **Invisible overlay guard, judged by paint.** A click that lands on an
  element covering at least 35% of the viewport that paints nothing visible is
  refused, however the element is stacked (no positioning requirement: grid,
  negative margins and transforms count). Invisible means an effective opacity
  (multiplied up the ancestor chain, including `filter: opacity()`) below 0.2,
  or no visible content inside: text with a transparent `color` or
  `-webkit-text-fill-color` counts as invisible, gradients count only if a
  colour stop is visible, and media must cover a real share of the element.
  If nothing visible is found within the first 300 nodes, the element counts
  as invisible (fail closed).
  The element under the pointer inside a closed shadow root is measured via
  `chrome.dom.openOrClosedShadowRoot`. Full-page `<a target="_blank">` ad
  layers are blocked at the click.
- **Ad-layer detection.** Clicks on non-interactive content of a visible layer
  stacked at (near) the maximum z-index over a large part of the page cannot
  open tabs or redirect.
- **Scripted link and form hooks.** `a.click()`, `dispatchEvent(click)` on
  `_blank` HTML and SVG links, `form.submit()`, `requestSubmit()` and clicks on
  hidden submit buttons of `target="_blank"` forms follow the same intent
  rules. A native `_blank` submit counts as the user's only in the same task
  as their click on a visible submit button of that form, or their Enter in
  it.
- **Document Picture-in-Picture.** `documentPictureInPicture.requestWindow()`
  is judged like a popup.
- **Fresh-iframe patching.** Newly created iframes are hooked before a page can
  borrow an unhooked `window.open` from them (including via `window.frames[i]`).
- **Redirect guard (Navigation API).** Cross-site script redirects of the
  current tab are blocked when they happen during a click but don't come from
  an element-scoped handler, or come from a timer or `<meta refresh>` within
  5 s of a click. Hand-offs to listed sign-in and payment flows are allowed
  (but followed by the background) once the tab-under, popup-hijack and
  Strict rules have been checked. On-load and user-initiated navigations
  still work. A suspicious
  navigation to the same site is let through but followed (see redirect
  chains below).
- **Smart and Strict redirect policy.** Smart (the default) allows a script
  redirect more than about 5 s after the last click, so payment pages handing
  off to a bank keep working; this is a documented, accepted trade-off.
  Strict blocks every script-driven cross-site redirect once the user has
  interacted with the page, however long it waits, including redirects to
  sign-in and payment pages. The popup and welcome page explain the two modes
  by this trade-off.
- **Tab-under detection.** Opening this same page (any query string) in a new
  tab is blocked. After any new tab is opened from a tab, script-driven
  cross-site redirects of that tab are blocked for up to 60 s, until the user
  presses something again at least 0.5 s later. The rule is armed when a
  script-opened tab is allowed, or when the background confirms that a new
  tab really opened (link clicks, right-clicks). The background remembers the
  new tab per tab, so a hop to another page of the same site can't erase it,
  and forgets it when the user navigates the tab themselves (typed URL,
  bookmark, address bar).
- **Popup-hijack guard.** A popup that has not received any user gesture yet
  cannot be sent to another site. A tab opened on weak evidence learns so
  from the background on its first page, so the guard applies even when it
  was opened with `noopener`.
- **Embedded-frame hijack guard.** When a cross-site embedded frame tries to
  navigate the whole tab (`top.location = ad`) within 6 s of a click inside a
  frame, with no click on the main page since and while the page has focus
  (`document.hasFocus()`), PopShield holds the page so Chrome asks "Leave
  site?". The frame relays its pointer-down to the top page through the
  background worker. A frame with an effective opacity below 0.5 that receives
  a click is treated as an overlay, whatever its size, and tokens from child
  frames are refused right after it. Reloads and typed URLs are never
  interrupted.
- **Background backstop.** `webNavigation.onCreatedNavigationTarget` closes any
  new tab a page opened without a matching token from the bridge. It also
  covers `blob:`, `about:`, `data:` and `file:` source tabs. When a script
  swaps the address of a link the user clicked (left, middle or modifier
  click), the backstop closes the ad tab and opens the page the user actually
  clicked (`link-swapped`). Right-click opens are not repaired.
- **Redirect-chain following.** Tokens that rest on page-influenced evidence
  (framework or async hints), same-site-only tokens, suspicious same-site
  navigations of the current tab and sign-in / payment hand-offs are followed
  by the background through `webNavigation.onCommitted` for 8 s. Only real
  redirect hops (server or client redirects) are judged, never the user's
  typed URL, bookmark, link click, back / forward or reload. Landing on an
  unrelated site closes the new tab or sends the tab back (`redirect-chain`).
- **Link tokens.** `_blank` link clicks, ctrl / middle-click and right-click
  "Open link in new tab" on real, non-decoy links get a token for that link's
  address; links inside closed shadow roots are found via
  `chrome.dom.openOrClosedShadowRoot`. A click on a decoy link (`#`,
  `javascript:`, this page), or a modifier-click with no visible link, only
  allows a same-site tab.
- **Ad-box and decoy-link guards.** Decoy links inside a script-built frame
  pinned over the page are blocked at the click.
- **Framework attribution.** Delegated handlers of React 16 and earlier
  (`__reactEventHandlers$`), React 17+ (`__reactProps$`), Solid (`$$click`) and
  a real jQuery (`$(document).on('click', selector, fn)` with a specific
  selector matching at most 50 elements) count as element-scoped. React props
  count only if they were on the element at the first press event, so props
  planted by page handlers don't. Catch-all selectors do not.
- **Async/await attribution.** Opens after `await` inside an element's (or
  framework's) handler are allowed within 5 s of a real click on a real
  target, but only when the element handler is the bottom of the synchronous
  stack, and only to the same site or to a listed sign-in or payment flow.
- **Exact sign-in and payment exemption.** `PS.isProviderFlow` matches only
  `https:` URLs on an exact list of provider hosts, each with the path prefix
  where its flow starts (`PROVIDER_FLOWS` in `src/common.js`). Whole domains,
  multi-tenant identity domains and URLs that merely carry `client_id=` are
  not exempt.
- **Survives `document.open()`.** Script-built frames (chat widgets, ad boxes)
  that rewrite themselves keep PopShield's listeners and channel, without a new
  handshake.
- **Quiet logging.** Ad scripts that retry `window.open()` hundreds of times
  once blocked are reported once per 5 s (max 20 per 10 s per frame; the worker
  accepts at most 30 per 10 s per tab). The worker batches log, badge and
  counter writes every 250 ms.
- **Per-site modes.** Smart (default), Strict (no script may open a tab or,
  after you interact with the page, redirect it to another site; real links,
  ctrl/middle-click, "Open link in new tab" and forms you submit still work)
  and Off. Embedded frames follow the mode of the page that contains them.
  Per-site choices made in incognito tabs are kept in memory only.
- **Toolbar popup.** Badge count of blocked items, a list of everything blocked
  on the page with an **Open** button for each and a plain-language reason
  (including "went through a redirect that ended on an unrelated site" and "a
  script swapped the link you clicked for an ad; the real link was opened
  instead", "the button you pressed was re-wired to submit an ad form" and
  "opened by a script on something that isn't a button or link"), and the
  mode switch. Light and dark themes.
- **Lifetime counter.** The popup shows "N popups & redirects blocked since
  <date> · N today" with a 14-day sparkline and a **Reset stats** link. The
  counter is anonymous (total, per day, per kind) and stays on this device.
- **Report and Feedback.** "Report ads that got through" and "Report something
  blocked by mistake" first show a confirmation that lists what will be
  shared, then open github.com with an issue form filled in: the page address
  without query string or fragment, the mode, the Chrome and PopShield
  versions, and the types and ad hostnames of what was blocked. GitHub
  receives those details when the tab opens; nothing becomes public unless
  the user signs in and submits. The buttons are hidden in incognito windows.
  "Feedback" opens GitHub Discussions (Ideas).
- **Welcome page** on first install.
- **Tests.** End-to-end suite (`test/run.mjs`, 120 scenarios, 223 counted
  checks, about 50 s) that runs every scenario in real Chromium without the
  extension (proving each attack works) and with PopShield, in parallel
  browsers. It includes 58 regression scenarios from three internal red-team
  rounds. Cases marked `knownBypass` are reported but don't fail the run; the
  only one is Smart mode's delayed redirect, an accepted trade-off. Also a
  popup UI test (`test/popup-ui.mjs`) with screenshots. Every test runs on
  local fixture pages; no public website is contacted.
- **Performance.** In our own benchmarks, about 0.1 ms of PopShield work per
  click, with no forced layouts and no leaks observed (measured in two
  internal performance review rounds).
- **License in the package.** The release zip ships the MIT `LICENSE` next to
  `manifest.json`, `src/` and `icons/`.

### Security

- CI and release workflows pin every action to a commit SHA, check out with
  `persist-credentials: false` and install with `npm ci --ignore-scripts`.
- Releases are built and tested by a read-only job; a separate minimal job
  publishes the GitHub Release with a build-provenance attestation.
- `scripts/package.mjs` refuses to package symlinks and stray files
  (`*.orig`, `*.rej`, `*.bak`, editor leftovers, dotfiles).
- Reviewed, not independently audited: several internal security and
  performance review rounds by the author; no independent third-party audit
  has been done.

### Privacy

- PopShield keeps no browsing history. The only site names it saves are the
  ones you choose a mode for; everything else is an anonymous count. The
  per-page blocked list lives in session storage under its tab and is cleared
  when you go to a new page or close the tab (reloads and in-page route
  changes keep it), and when the browser exits. The worker's short-lived
  working state (tokens, redirect-chain checks, per-tab timestamps) stays in
  memory only.
- Per-site modes chosen in incognito are kept in `chrome.storage.session`
  only and never written to disk.
- No telemetry, no remote code, no remote lists, and no network requests made
  by the extension's own code. The one way details leave the browser is the
  Report flow above, after its confirmation. No share or social features.

[Unreleased]: https://github.com/madironman/popshield/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/madironman/popshield/releases/tag/v0.1.0
