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
  built-in `inject.js` uses is captured up front. It supplies only two hints:
  framework attribution and async origin (ignored if `Error.prepareStackTrace`
  is set). `bridge.js` judges with clean APIs, mints every allow token (each
  bound to a URL), runs the redirect, embedded-frame and native form-submit
  guards, and writes the block log. A page that subverts `inject.js` can at
  most skip the early block: the backstop still closes any tab the bridge
  didn't approve.
- **Strict background worker.** Accepts only bridge messages; whitelists the
  kinds and reasons in the block log; rate-limits messages per tab; takes the
  frame address from `sender.url` (origin and path only); tokens last 3 s
  (15 s for right-click "Open link in new tab"), at most 4 per tab, and only
  fit a new tab on the site they were minted for.
- **Page-wide listener detection.** Listeners on `window`, a document, a
  shadow root, `<html>`, `<body>`, or a non-interactive wrapper element
  covering at least 50% of the viewport cannot open tabs, unless the clicked
  element's own framework handler is running.
- **Invisible overlay guard.** Clicks that land on positioned elements covering
  most of the screen with an effective opacity (multiplied up the ancestor
  chain, including `filter: opacity()`) below 0.2, or on see-through boxes
  with no visible content, are refused, including full-page
  `<a target="_blank">` ad layers.
- **Ad-layer detection.** Clicks on non-interactive content of a visible layer
  stacked at (near) the maximum z-index over a large part of the page cannot
  open tabs or redirect.
- **Scripted link and form hooks.** `a.click()`, `dispatchEvent(click)` on
  `_blank` HTML and SVG links, `form.submit()`, `requestSubmit()` and clicks on
  hidden submit buttons of `target="_blank"` forms follow the same intent
  rules.
- **Document Picture-in-Picture.** `documentPictureInPicture.requestWindow()`
  is judged like a popup.
- **Fresh-iframe patching.** Newly created iframes are hooked before a page can
  borrow an unhooked `window.open` from them (including via `window.frames[i]`).
- **Redirect guard (Navigation API).** In Smart mode, cross-site script
  redirects of the current tab are blocked when they happen during a click but
  don't come from an element-scoped handler, or come from a timer or
  `<meta refresh>` right after a click (sign-in and payment providers
  excepted). Same-site, on-load and user-initiated navigations still work.
- **Tab-under detection.** Opening this same page (any query string) in a new
  tab is blocked, and after a script-opened tab, cross-site redirects of the
  current tab stay blocked until the user's next real click.
- **Popup-hijack guard.** A popup that has not received any user gesture yet
  cannot be sent to another site (sign-in and payment providers excepted).
- **Embedded-frame hijack guard.** When a cross-site player iframe tries to
  navigate the whole tab (`top.location = ad`) within 4 s of a click inside a
  frame, with no click on the main page since and while the page has focus,
  PopShield holds the page so Chrome asks "Leave site?". The frame relays its
  pointer-down to the top page through the background worker. Large,
  near-invisible iframes are treated as overlays, and tokens from child frames
  are refused right after a click into one. Reloads and typed URLs are never
  interrupted.
- **Background backstop.** `webNavigation.onCreatedNavigationTarget` closes any
  new tab a page opened without a matching token from the bridge. It also
  covers `blob:`, `about:`, `data:` and `file:` source tabs.
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
  selector matching at most 50 elements) count as element-scoped. Catch-all
  selectors do not.
- **Async/await attribution.** Opens after `await` inside an element's (or
  framework's) handler are allowed within 5 s of a real click, but only to the
  same site or a built-in list of sign-in and payment providers.
- **Survives `document.open()`.** Script-built frames (chat widgets, ad boxes)
  that rewrite themselves keep PopShield's listeners and channel, without a new
  handshake.
- **Quiet logging.** Ad scripts that retry `window.open()` hundreds of times
  once blocked are reported once per 5 s (max 20 per 10 s per frame; the worker
  accepts at most 30 per 10 s per tab).
- **Per-site modes.** Smart (default), Strict (no script may open a tab; real
  links, ctrl/middle-click, "Open link in new tab" and forms you submit still
  work) and Off. Embedded frames follow the mode of the page that contains
  them.
- **Toolbar popup.** Badge count of blocked items, a list of everything blocked
  on the page with an **Open** button for each, and the mode switch. Light and
  dark themes.
- **Lifetime counter.** The popup shows "N popups & redirects blocked since
  <date> · N today" with a 14-day sparkline and a **Reset stats** link. Only
  anonymous counts (total, per day, per kind) are stored, on this device.
- **Report and Feedback.** "Report ads that got through" and "Report something
  blocked by mistake" open a pre-filled public GitHub issue (site address
  without query string, mode, versions, block summary) that the user reviews
  and submits; PopShield sends nothing itself. "Feedback" opens GitHub
  Discussions (Ideas).
- **Welcome page** on first install.
- **Tests.** End-to-end suite (`test/run.mjs`) that runs every scenario in real
  Chromium without the extension (proving each attack works) and with
  PopShield, in parallel browsers; popup UI test (`test/popup-ui.mjs`) with
  screenshots; and a live checker (`npm run test:live -- <url>`) for real
  sites.

### Security

- CI and release workflows pin every action to a commit SHA, check out with
  `persist-credentials: false` and install with `npm ci --ignore-scripts`.
- Releases are built and tested by a read-only job; a separate minimal job
  publishes the GitHub Release with a build-provenance attestation.

### Privacy

- PopShield never records which sites you visit. Persistent storage holds only
  your mode settings and anonymous block counts; the per-page blocked list
  lives in session storage under its tab and is wiped when the tab navigates or
  closes and when the browser exits.
- No telemetry, no remote code, no remote lists, no network requests. No share
  or social features.

[Unreleased]: https://github.com/madironman/popshield/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/madironman/popshield/releases/tag/v0.1.0
