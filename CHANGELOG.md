# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-21

First public release.

### Added

- **User-intent model.** A page may open a new tab only while a real (trusted)
  click, key press or submit is being delivered to a listener on a specific
  element. Opens from timers, plain async code, or `mousedown` / `pointerdown`
  instead of a full click are blocked.
- **Page-wide listener detection.** Listeners on `window`, `document`, `<html>`
  or `<body>` (the "OnClick" popunder pattern) cannot open tabs.
- **Invisible overlay guard.** A capturing listener at `window` refuses clicks
  that land on transparent, content-free elements covering most of the screen,
  including full-page `<a target="_blank">` ad layers.
- **Scripted link and form hooks.** `a.click()`, `dispatchEvent(click)` on
  `_blank` links, `form.submit()` and clicks on hidden submit buttons of
  `target="_blank"` forms follow the same intent rules.
- **Fresh-iframe patching.** Newly created iframes are hooked before a page can
  borrow an unhooked `window.open` from them (including via `window.frames[i]`).
- **Navigation API redirect guard.** In the top frame, tab-under and
  click-hijack redirects to other sites are cancelled; same-site, on-load and
  user-initiated navigations still work.
- **Embedded-frame hijack guard.** When a cross-site player iframe tries to
  navigate the whole tab (`top.location = ad`) within 1.5 s of a click inside
  it, PopShield holds the page so Chrome asks "Leave site?". The frame relays
  its pointer-down to the top page through the background worker. Reloads and
  typed URLs are never interrupted.
- **Background backstop.** `webNavigation.onCreatedNavigationTarget` closes any
  new tab a page opened without a matching user-intent signal.
- **Framework attribution.** Delegated handlers of React 16 and earlier
  (`__reactEventHandlers$`), React 17+ (`__reactProps$`) and jQuery
  (`$(document).on('click', selector, fn)`) count as element-scoped. A
  catch-all `*` selector does not.
- **Async/await attribution.** Opens after `await` inside an element's (or
  framework's) handler are allowed during user activation, using V8 async stack
  traces; page-wide hooks that await, and promise callbacks, stay blocked.
- **Ad-layer detection.** Clicks on non-interactive content of a visible layer
  stacked at (near) the maximum z-index over a large part of the page (e.g. an
  "offerwall" image placed over a Continue button) cannot open tabs or redirect.
- **Tab-under detection.** Opening this same page in a new tab is blocked, and
  so is a cross-site redirect of the current tab within 2 s of a script-opened
  tab.
- **Ad-box and decoy-link guards.** Decoy links (`#`, `javascript:`, this page)
  inside a script-built frame pinned over the page are blocked at the click; a
  new tab opened from a click on a decoy link must stay on the same site, so
  ad scripts that swap the link's address during the click are closed by the
  backstop.
- **Survives `document.open()`.** Script-built frames (chat widgets, ad boxes)
  that rewrite themselves keep PopShield's click tracking and messaging.
- **Quiet logging.** Ad scripts that retry `window.open()` hundreds of times
  once blocked are reported once per 5 s (max 20 per 10 s per frame).
- **Per-site modes.** Smart (default), Strict (no script may open a tab; real
  links, ctrl/middle-click and "Open link in new tab" still work) and Off.
  Embedded frames follow the mode of the page that contains them.
- **Toolbar popup.** Badge count of blocked items, a list of everything blocked
  on the page with an **Open** button for each, and the mode switch. Light and
  dark themes.
- **Tests.** End-to-end suite (`test/run.mjs`) that runs every scenario in real
  Chromium without the extension (proving each attack works) and with
  PopShield; popup UI test (`test/popup-ui.mjs`) with screenshots; and a live
  checker (`npm run test:live -- <url>`) for real sites.

### Privacy

- No telemetry, no remote lists, no network requests.

[Unreleased]: https://github.com/madironman/popshield/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/madironman/popshield/releases/tag/v0.1.0
