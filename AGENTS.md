# AGENTS.md — guide for AI coding agents

This file is for AI coding agents (Claude Code, Codex, Copilot agents, Cursor and
similar) working on this repository. Humans are welcome to read it too. For the
human-oriented process see [CONTRIBUTING.md](CONTRIBUTING.md); for the deep dive
see [docs/LEARN.md](docs/LEARN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What this project is

PopShield is a Manifest V3 Chrome extension (Chrome 111+) that blocks ad popups,
popunders, ad new-tabs and tab-hijack redirects, while tabs the user deliberately
opens (Share buttons, `target="_blank"` links, ctrl/middle-click, "Open link in
new tab") keep working. It decides by **where a click was handled**, not only
whether a click happened.

## Non-negotiables

1. **No network requests.** Nothing in `src/` may call `fetch`, `XMLHttpRequest`,
   `WebSocket`, `sendBeacon` or anything similar. CI greps for these (comment lines
   excepted).
2. **No telemetry, analytics or tracking** of any kind.
3. **No remote code and no remote configuration**: no downloaded scripts, filter
   lists or `eval` of fetched text. Everything is decided locally.
4. **No new permissions** in `manifest.json` without an explicit discussion and a
   reason in the PR. Current set: `storage`, `webNavigation`, host `<all_urls>`.
5. **Plain JavaScript, no build step**, no bundler, no TypeScript, no runtime
   dependencies. What is in `src/` is what Chrome runs. `devDependencies` are for
   tests only (Playwright).
6. **Manifest V3** only.

PRs that break any of these are rejected regardless of what else they do.

## Repo map

| Path | What it does |
|---|---|
| `manifest.json` | MV3 manifest. Two content-script entries, both `<all_urls>`, `run_at: document_start`, `all_frames: true`, `match_origin_as_fallback: true`: one isolated-world (`common.js` + `bridge.js`), one `world: "MAIN"` (`inject.js`). |
| `src/inject.js` | The brain. Runs in the page's own JS world before page scripts. Tracks trusted gestures, computes the verdict, hooks `window.open`, `HTMLElement.prototype.click`, `EventTarget.prototype.dispatchEvent`, `HTMLFormElement.prototype.submit/requestSubmit`, iframe `contentWindow/contentDocument` getters; overlay/ad-layer/ad-box detection; React/jQuery attribution; async stack attribution; tab-under; Navigation API redirect guard; `beforeunload` frame-hijack guard. |
| `src/bridge.js` | Isolated-world content script. Nonce handshake with `inject.js` over `CustomEvent`s, reads the mode for the **top-level site** from storage, forwards `allow` / `blocked` / `frameGesture` messages to the background, relays `frameGesture` down into the top frame. |
| `src/common.js` | `PS` helpers shared by background, bridge and popup: `siteOf`, `siteOfUrl`, `getSettings`, `getMode`, `setSiteMode`, `setDefaultMode`. (`inject.js` keeps its own private copy of `siteOf`.) |
| `src/background.js` | Service worker. In-memory allow tokens per tab, the **backstop** (`webNavigation.onCreatedNavigationTarget` closes un-tokened new tabs after a 400 ms grace), per-tab blocked log + badge, frame-gesture relay to frame 0, log reset on `onCommitted`. |
| `src/popup.html`, `src/popup.js` | Toolbar popup: per-site Smart/Strict/Off, default mode, blocked list with an **Open** button. `?tab=<id>` lets tests open it as a normal page. |
| `test/run.mjs` | E2E suite. `CASES` list; each case runs in a **baseline** Chromium without the extension and again with PopShield. |
| `test/fixtures/scenario.js` | One function per scenario in the `S` object, selected with `scenario.html?t=<name>`. |
| `test/fixtures/*.html` | `scenario.html` (host page), `ad.html` (the "ad"), `other.html` (same-site page), `player.html` (cross-site player iframe with `?mode=popup|top|top2|none`). |
| `test/server.mjs` | Serves fixtures on `localhost:8711` ("the site") and `127.0.0.1:8712` ("the ad network", a different site). |
| `test/popup-ui.mjs` | Popup UI test: triggers 3 blocks, checks badge, list, mode buttons, overrides, Open button; writes screenshots to `test/screenshots/` (git-ignored). |
| `test/live.mjs` | Before/after check against a real URL. Needs network; not in CI. |
| `scripts/package.mjs` | Builds `dist/popshield-<version>.zip` (manifest, `src/`, `icons/` only). |
| `.github/workflows/ci.yml` | Policy job (MV3 + no-network grep) and the test job (`npm test`). |
| `docs/` | `LEARN.md` (tutorial), `ARCHITECTURE.md` (reference), `assets/` (README images). |

## The mental model in 10 lines

1. `inject.js` runs first in every frame and saves the original browser functions.
2. A capturing listener on `window` records every **trusted** gesture event as `curEvent`.
3. When the page calls `window.open` (or a scripted `_blank` click/submit), `verdict()` asks: is a trusted event *being dispatched right now*?
4. Is it an **activating** event (click, keyup, pointerup...), not mousedown/pointerdown?
5. Is `curEvent.currentTarget` a **specific element**, not `window`/`document`/`<html>`/`<body>` (unless a React/jQuery handler for the clicked element is running)?
6. Did the click land on a real target, not an **invisible overlay** or a **max-z-index ad layer**?
7. No gesture but inside an `await` from an element's handler (V8 async stack) during user activation? Allowed. Strict mode allows no scripted opens at all.
8. Allowed opens send an **allow token** to the background; un-tokened new tabs are closed by the backstop.
9. In the top frame, the Navigation API guard cancels cross-site redirects from page-wide hooks, overlays, ad layers, tab-unders and just-clicked embedded frames.
10. Cross-site iframes doing `top.location = ad` are held with `beforeunload` ("Leave site?"), using a frame-gesture relay for timing.

## Running tests

```bash
npm install
npx playwright install chromium
npm test                              # e2e (baseline + extension) then popup UI test
npm run test:e2e -- <substring>       # only CASES whose name (or t) contains <substring>
npm run test:ui                       # popup UI test only
npm run test:live -- <url> [clicks]   # real site, with and without PopShield (needs network)
```

Tests launch real headless Chromium with `--load-extension` and keep Chrome's own
popup blocker on (`--disable-popup-blocking` is removed from Playwright's defaults).

### The rule

**Every behaviour change needs a scenario in `test/fixtures/scenario.js` and a
`CASES` entry in `test/run.mjs` with a `baseline` expectation that proves the
attack works without the extension** (e.g. `baseline: { tabs: 1 }` or
`baseline: { url: 'ad' }`). A test whose baseline is already blocked by Chrome
proves nothing; if that is genuinely the case, say so in `note`. If the change
could affect real sites, add a `legit-*` counterpart with `blocked: []` (that is
how false positives are caught). `baseline: null` is only for mode/override cases.
Case fields are documented in CONTRIBUTING.md ("Adding a new attack scenario").

## Debugging

- Run one case: `npm run test:e2e -- decoy-hash-swap`. The output shows the block
  log as `kind/reason` pairs, which tells you which rule fired.
- `console.log` in `src/inject.js` goes to the **page** console (it runs in the
  MAIN world). In a scratch Playwright script, use `page.on('console', m => ...)`.
  Remove logs before committing.
- `console.log` in `src/background.js` goes to the service worker. From
  Playwright: `sw.evaluate(...)`; manually: `chrome://extensions` -> PopShield ->
  "service worker" link.
- Inspect the block log directly: `await sw.evaluate(() => chrome.storage.session.get(null))`.
- To watch a run, write a scratch script (in your scratch dir, not `test/`) that
  copies `launch()` from `test/run.mjs` with `headless: false` and `slowMo`. Do not
  commit headed mode.
- Mode is delivered asynchronously; `run.mjs` waits 250 ms after load. A scratch
  script that clicks immediately may run in the default `smart` mode.
- Manual testing: load unpacked from the repo root, then after every edit reload
  the extension card **and** the page (content scripts attach only on load).
- `test/live.mjs --json` gives machine-readable before/after results for a real URL.

## Coding conventions

- **Capture originals at `document_start`.** `inject.js` saves `addEventListener`,
  `dispatchEvent`, `getComputedStyle`, `closest`, `querySelector`,
  `getBoundingClientRect`, `composedPath`, `JSON.*`, `CustomEvent`, `URL` before
  any page script runs. Pages can monkey-patch prototypes later; never call the
  live prototype method when a saved original exists.
- **Call saved originals with `R_apply`** (`Reflect.apply`), e.g.
  `R_apply(origGetCS, W, [el])`, not `el.method()` or `fn.call()` (a page can
  replace `Function.prototype.call`).
- **Never throw from a hook.** Hooks run inside page code; an exception breaks the
  site. Wrap detection in `try { ... } catch { return false; }` and keep the
  `try/catch` around `patchRealm` and the `dispatchEvent` hook.
- **Fail-open vs fail-closed, deliberately.** Detectors that *add* suspicion
  (`isOverlay`, `isAdLayer`, `inAdBoxFrame`) return `false` on error so the page
  keeps working. Detectors that *grant* permission (`asyncOrigin`) also return
  `false` on error, so an unexplained open stays blocked. The background backstop
  is the fail-closed safety net for anything the hooks miss. When unsure, prefer
  letting a legitimate action through and covering the ad with a narrower rule.
- Don't leave globals in the page. Everything in `inject.js` lives in one IIFE; the
  only page-visible marker is `Symbol.for('popshield.installed')`.
- Messages cross worlds as JSON strings in `CustomEvent.detail`; parse with the
  saved `JSONp` inside `try`.
- `chrome.runtime.sendMessage(...)` / `chrome.tabs.sendMessage(...)` always get
  `.catch(() => {})`: the worker or the frame may be gone.
- Style: 2-space indent, single quotes, semicolons, small functions, a comment on
  *why* for every non-obvious rule. See `.editorconfig`.
- User-visible behaviour change: update `README.md` and `CHANGELOG.md`
  (**Unreleased**). New `kind` or `reason` strings also need a label in
  `KINDS` / `REASONS` in `src/popup.js`.

## PR expectations

- One focused change per PR, naming the site or ad technique it addresses.
- `npm test` passes locally (baseline and extension runs, plus the popup test).
- New blocking behaviour has an attack case with a baseline that proves the attack.
- Anything that could hit legitimate pages has a `legit-*` case with `blocked: []`.
- No network, remote code, telemetry; no new permissions without justification.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md`. Don't commit `dist/`,
  `test/screenshots/` or `node_modules/`.

## Things agents commonly get wrong

- **Running two test runs at once.** `test/server.mjs` binds fixed ports **8711**
  and **8712**. Parallel `npm test` / `test:e2e` / `test:ui` invocations (including
  from parallel agents or worktrees on the same machine) fail with `EADDRINUSE` or
  flaky results. Run them sequentially.
- **Forgetting MAIN-world code is visible to pages.** Anything `inject.js` puts on
  `window`, a prototype or the DOM can be read, called or replaced by the page.
  Don't expose state, don't add globals, don't rely on secrecy beyond the nonce.
- **Trusting page-provided data.** `href`, `target`, `textContent`, `jQuery._data`,
  React props, iframe `src`, even `event.detail` on a nonce'd event can be
  attacker-controlled. Only `event.isTrusted`, `navigator.userActivation` and
  browser-side data (`webNavigation`, `sender.tab`, `sender.frameId`) are
  trustworthy. The bridge only forwards `allow`, `blocked` and `frameGesture`.
- **Changing `siteOf` in one place.** The multi-part TLD list (`MULTI`) lives in
  both `src/common.js` and `src/inject.js` (and a shorter one in `test/live.mjs`).
- **Using the same origin for "site" and "ad".** Fixtures rely on `localhost` vs
  `127.0.0.1` being different sites; use `AD` / `window.AD_ORIGIN` for ad URLs.
- **Skipping the baseline.** A new attack case without a baseline that shows the
  attack succeeding is not a test.
- **Breaking legit flows to catch an ad.** Max-z-index consent modals,
  `_blank` links to `#top`, React root listeners and downloads are all covered by
  `legit-*` cases for a reason; read them before tightening a rule.
- **Using `HTMLElement.prototype.click` etc. inside `inject.js`.** Those are hooked;
  calling them from PopShield code re-enters the verdict.
- **Adding a hook that only patches the top window.** Hooks must go inside
  `patchRealm(win)` so fresh iframes get them too.
- **Assuming tokens survive.** Background tokens live in memory with a 3 s TTL
  (60 s for context-menu opens); they are not persisted.
- **Editing generated or owned files.** Don't touch `dist/`, `store/image-src/raw/`
  or screenshots by hand.
