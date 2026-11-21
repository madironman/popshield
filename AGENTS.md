# AGENTS.md — guide for AI coding agents

This file is for AI coding agents (Claude Code, Codex, Copilot agents, Cursor and
similar) working on this repository. Humans are welcome to read it too. For the
human-oriented process see [CONTRIBUTING.md](CONTRIBUTING.md); for the deep dive
see [docs/LEARN.md](docs/LEARN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## What this project is

PopShield is a Manifest V3 Chrome extension (Chrome 119+) that blocks ad popups,
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
7. **Never decide security in the MAIN world.** `src/inject.js` only hooks, asks
   `bridge.js` and supplies hints. Every verdict, guard and check that blocks or
   allows something lives in `src/bridge.js` (isolated world). A hint from
   `inject.js` may only relax a check in a narrow, bounded way.
8. **Never mint allow tokens outside `src/bridge.js`.** `inject.js` cannot (it
   has no `chrome.*`), and `background.js` and the popup must not. The backstop
   is only meaningful if the bridge is the sole source of tokens.
9. **Capture every built-in up front in `inject.js`.** Any built-in it calls at
   hook time (functions, prototype methods, property getters) must be saved
   before page scripts run and called through `R_apply`. Never call a live
   prototype method, rely on `Array.prototype[Symbol.iterator]` in hot paths,
   or read page-overridable getters directly.
10. **Never record which sites the user visits.** Persistent storage may hold
    only the user's own mode settings and anonymous counters (total, per day,
    per kind). Anything that names a page lives in `chrome.storage.session`
    under its tab and is wiped on navigation, tab close and browser exit.
11. **No share or social features**, and no per-site stats.

PRs that break any of these are rejected regardless of what else they do.

## Repo map

| Path | What it does |
|---|---|
| `manifest.json` | MV3 manifest, `minimum_chrome_version` 119. Two content-script entries, both `<all_urls>`, `run_at: document_start`, `all_frames: true`, `match_origin_as_fallback: true`: one isolated-world (`common.js` + `bridge.js`), one `world: "MAIN"` (`inject.js`). |
| `src/inject.js` | **Hooks only (untrusted world).** Captures every built-in up front, opens the nonce channel, hooks `window.open`, `HTMLElement.prototype.click`, `EventTarget.prototype.dispatchEvent` (clicks on HTML and SVG links), `HTMLFormElement.prototype.submit`, `documentPictureInPicture.requestWindow`, iframe `contentWindow/contentDocument` getters (`patchRealm`), `document.open/write`. Each hook synchronously `ask()`s the bridge and fails closed (`no-bridge`). Supplies two hints: framework attribution (React ≤16/17+, Solid `$$click`, real jQuery with specific selectors -> `fw` +1/-1) and async origin (`asyncOrigin()`, V8 async stacks; false if `Error.prepareStackTrace` is set). |
| `src/bridge.js` | **The decision maker (isolated world).** Accepts the nonce hello, reads the mode for the **top-level site**, tracks trusted gestures itself, `judge()`s every ask, mints every allow token (bound to a URL) via `allow()`, swallows overlay / ad-box link clicks, judges native `_blank` submits, and in the top frame runs the Navigation API redirect guard (click hijack, timer-after-click, tab-under, popup-hijack, embedded-frame) and the `beforeunload` frame-hijack guard. Detectors: `isPageWide`, `isOverlay` (effective opacity), `isAdLayer`, `inAdBoxFrame`, `isDeadHref`, `clickedLink` (closed shadow roots via `chrome.dom`). `ASYNC_OK` lists sign-in/payment providers. Rate-limits the block log. |
| `src/common.js` | `PS` helpers shared by background, bridge and popup: `siteOf`, `siteOfUrl`, `getSettings`, `getMode`, `setSiteMode`, `setDefaultMode`. |
| `src/background.js` | Service worker. Trusts only bridge messages: whitelists `how` / `kind` / `reason`, rate-limits per tab, takes `frameUrl` from `sender.url` (origin + path). Tokens: TTL 3 s (15 s for `contextmenu`), max 4 per tab, bound to a URL's site, refused from child frames 1.5 s after `frameOverlay`. The **backstop** (`webNavigation.onCreatedNavigationTarget`, 400 ms grace; on for `blob:`/`about:`/`data:`/`file:` openers). Per-tab log + badge in `chrome.storage.session`, anonymous `stats` in `chrome.storage.local`, `frameGesture` relay to frame 0, welcome page on first install. |
| `src/popup.html`, `src/popup.js` | Toolbar popup: lifetime counter, 14-day sparkline, Reset stats, per-site Smart/Strict/Off, default mode, blocked list with an **Open** button, Report buttons (pre-filled GitHub issue the user submits), Feedback link. `?tab=<id>` lets tests open it as a normal page. |
| `src/welcome.html` | Static welcome page opened once on first install. |
| `test/run.mjs` | E2E suite. `CASES` list; each case runs in a **baseline** Chromium without the extension and again with PopShield. |
| `test/fixtures/scenario.js` | One function per scenario in the `S` object, selected with `scenario.html?t=<name>`. |
| `test/fixtures/*.html` | `scenario.html` (host page), `ad.html` (the "ad"), `other.html` (same-site page), `player.html` (cross-site player iframe with `?mode=popup|top|top2|none`). |
| `test/server.mjs` | Serves fixtures on `localhost:8711` ("the site") and `127.0.0.1:8712` ("the ad network", a different site). |
| `test/popup-ui.mjs` | Popup UI test: triggers 3 blocks, checks badge, list, mode buttons, overrides, Report link, Open button; writes screenshots to `test/screenshots/` (git-ignored). |
| `test/live.mjs` | Before/after check against a real URL. Needs network; not in CI. |
| `scripts/package.mjs` | Builds `dist/popshield-<version>.zip` (manifest, `src/`, `icons/` only). |
| `scripts/check-version.mjs` | Checks manifest / package / lockfile / CHANGELOG versions agree. |
| `.github/workflows/ci.yml` | Policy job (MV3, versions, no-network grep) and the test job (`npm test`). Actions pinned to SHAs, `persist-credentials: false`, `npm ci --ignore-scripts`. |
| `.github/workflows/release.yml` | On a `v*.*.*` tag: read-only build/test job, then a minimal publish job (GitHub Release + build-provenance attestation). |
| `docs/` | `LEARN.md` (tutorial), `ARCHITECTURE.md` (reference, threat model), `RELEASING.md`, `assets/` (README images). |

## The mental model in 12 lines

1. Both content scripts run first in every frame. `inject.js` (MAIN) captures its built-ins and hands a 128-bit nonce to `bridge.js` (isolated) once; it is never re-broadcast.
2. The bridge's capturing listeners on `window` record every **trusted** gesture event (`cur`, `lastAct`).
3. When the page calls `window.open` (or a scripted `_blank` click/submit, or Document PiP), the hook in `inject.js` **asks** the bridge synchronously and obeys the answer.
4. The bridge's `gestureVerdict()`: is a trusted event *being dispatched right now*, and is it **activating** (click, keyup, pointerup...), not mousedown/pointerdown?
5. Is `cur.currentTarget` a **specific element**, not `window`/document/shadow root/`<html>`/`<body>` or a wrapper covering ≥ 50% of the viewport (unless `inject.js` reports the clicked element's React/Solid/jQuery handler is running)?
6. Did the click land on a real target, not an **invisible overlay** (effective opacity) or a **max-z-index ad layer**?
7. No live gesture but `inject.js` says "after `await` in an element handler"? Allowed only within 5 s of a real click and only to the same site or `ASYNC_OK`. Strict mode allows no scripted opens at all.
8. Allowed opens make the bridge mint an **allow token bound to the URL**; real link clicks and right-clicks mint tokens too. Un-tokened new tabs are closed by the backstop.
9. If a page subverts `inject.js`, it only skips the early block: the backstop still closes tabs the bridge didn't approve.
10. In the top frame, the bridge's Navigation API guard cancels cross-site redirects from page-wide hooks, overlays, ad layers, timers right after a click, tab-unders (until the next real click) and popup hijacks.
11. Cross-site iframes doing `top.location = ad` within 4 s of a frame click are held with `beforeunload` ("Leave site?"), using a frame-gesture relay for timing.
12. The worker counts blocks anonymously (total / day / kind) and keeps the per-page list only in session storage for that tab. It never records visited sites.

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

- **Decide in `bridge.js`, hook in `inject.js`.** New blocking logic, new
  detectors and new guards go in the bridge, which runs with clean built-ins.
  `inject.js` gets only what the isolated world cannot see (page JS objects
  such as framework props, stack traces) and reports it as a hint.
- **Capture originals at `document_start`.** `inject.js` saves
  `addEventListener`, `dispatchEvent`, `composedPath`, property getters
  (`Event.prototype.type`, `Node.prototype.nodeType`, `HTMLAnchorElement.prototype.href`...),
  `JSON.*`, `CustomEvent`, `URL`, string and regexp methods,
  `crypto.getRandomValues` and more before any page script runs. Pages can
  monkey-patch prototypes later; never call the live prototype method when a
  saved original exists, and add a new capture when you need a new built-in.
- **Call saved originals with `R_apply`** (`Reflect.apply`), e.g.
  `R_apply(origGetCS, W, [el])`, not `el.method()` or `fn.call()` (a page can
  replace `Function.prototype.call`).
- **Never throw from a hook.** Hooks run inside page code; an exception breaks the
  site. Wrap detection in `try { ... } catch { return false; }` and keep the
  `try/catch` around `patchRealm` and the `dispatchEvent` hook.
- **Fail-open vs fail-closed, deliberately.** Detectors that *add* suspicion
  (`isOverlay`, `isAdLayer`, `inAdBoxFrame`) return `false` on error so the page
  keeps working. Checks that *grant* permission (`asyncOrigin`, `asyncAllowed`)
  return `false` on error, so an unexplained open stays blocked. A hook whose
  ask fails (no bridge, no answer) blocks. The background backstop is the
  fail-closed safety net for anything the hooks miss. When unsure, prefer
  letting a legitimate action through and covering the ad with a narrower rule.
- Don't leave globals in the page. Everything in `inject.js` lives in one IIFE; the
  only page-visible marker is `Symbol.for('popshield.installed')`.
- Messages cross worlds as JSON strings in `CustomEvent.detail`; parse with the
  saved `JSONp` inside `try`. The channel carries only `ask` / `fw` up and
  `connected` / `mode` / `verdict` down.
- Background messages: any new message type or field must be validated in
  `background.js` (whitelist, length clamp, rate limit). Take page addresses
  from `sender.url`, never from the message.
- Storage: never write a site, URL or page address to `chrome.storage.local`
  (only `defaultMode`, `sites` mode overrides the user set, and anonymous
  `stats`).
- `chrome.runtime.sendMessage(...)` / `chrome.tabs.sendMessage(...)` always get
  `.catch(() => {})`: the worker or the frame may be gone.
- Style: 2-space indent, single quotes, semicolons, small functions, a comment on
  *why* for every non-obvious rule. See `.editorconfig`.
- User-visible behaviour change: update `README.md` and `CHANGELOG.md`
  (**Unreleased**). New `kind` or `reason` strings also need an entry in the
  `KINDS` / `REASONS` whitelists in `src/background.js` and a label in
  `KINDS` / `REASONS` in `src/popup.js`.

## PR expectations

- One focused change per PR, naming the site or ad technique it addresses.
- `npm test` passes locally (baseline and extension runs, plus the popup test).
- New blocking behaviour has an attack case with a baseline that proves the attack.
- Anything that could hit legitimate pages has a `legit-*` case with `blocked: []`.
- No network, remote code, telemetry, share/social features or visited-site
  records; no new permissions without justification.
- No security decision or token minting outside `src/bridge.js`.
- Fill in `.github/PULL_REQUEST_TEMPLATE.md`. Don't commit `dist/`,
  `test/screenshots/` or `node_modules/`.

## Things agents commonly get wrong

- **Running two test runs at once.** `test/server.mjs` binds fixed ports **8711**
  and **8712**. Parallel `npm test` / `test:e2e` / `test:ui` invocations (including
  from parallel agents or worktrees on the same machine) fail with `EADDRINUSE` or
  flaky results. Run them sequentially.
- **Forgetting MAIN-world code is visible to pages.** Anything `inject.js` puts on
  `window`, a prototype or the DOM can be read, called or replaced by the page,
  and any built-in it calls live can be poisoned. Don't expose state, don't add
  globals, don't rely on secrecy beyond the nonce, and **don't put a decision
  there**: put it in `bridge.js`.
- **Trusting page-provided data.** `href`, `target`, `textContent`, `jQuery._data`,
  React props, iframe `src`, even `event.detail` on a nonce'd event can be
  attacker-controlled, and so is everything `inject.js` tells the bridge
  (`fw`, the async hint). Only `event.isTrusted`, the bridge's own gesture
  state, the Navigation API's `userInitiated` and browser-side data
  (`webNavigation`, `sender.id`, `sender.tab`, `sender.frameId`, `sender.url`)
  are trustworthy.
- **Changing `siteOf` in one place.** The multi-part TLD list (`MULTI`) lives in
  `src/common.js` (and a shorter one in `test/live.mjs`).
- **Using the same origin for "site" and "ad".** Fixtures rely on `localhost` vs
  `127.0.0.1` being different sites; use `AD` / `window.AD_ORIGIN` for ad URLs.
- **Skipping the baseline.** A new attack case without a baseline that shows the
  attack succeeding is not a test.
- **Breaking legit flows to catch an ad.** Max-z-index consent modals,
  `_blank` links to `#top`, React root listeners and downloads are all covered by
  `legit-*` cases for a reason; read them before tightening a rule.
- **Using `HTMLElement.prototype.click` etc. inside `inject.js`.** Those are hooked;
  calling them from PopShield code re-enters the ask.
- **Adding a hook that only patches the top window.** Hooks must go inside
  `patchRealm(win)` so fresh iframes get them too.
- **Assuming tokens survive.** Background tokens live in memory with a 3 s TTL
  (15 s for context-menu opens), at most 4 per tab; they are not persisted.
- **Adding "helpful" stats.** Per-site counters, "top blocked sites", share
  cards or anything that names a site in persistent storage break rule 10/11.
- **Editing generated or owned files.** Don't touch `dist/`, `store/image-src/raw/`
  or screenshots by hand.
