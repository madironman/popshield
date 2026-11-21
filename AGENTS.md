# AGENTS.md — guide for AI coding agents and other automated contributors

This file is for AI coding agents and other automated contributors working on
this repository. Humans are welcome to read it too. For the
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
10. **Keep no browsing history.** The only site names PopShield may save are
    the ones the user chooses a mode for; everything else in persistent
    storage is an anonymous counter (total, per day, per kind). Anything that
    names a page lives in `chrome.storage.session` under its tab and is
    cleared when the tab goes to a new page or closes (reloads and in-page
    route changes keep it) and on browser exit.
11. **No share or social features**, and no per-site stats.
12. **Details leave the browser only through the Report buttons**, after
    their confirmation, and never from an incognito window. Changing what
    they share means changing the confirmation text, `PRIVACY.md` and
    `store/listing.md` in the same change.
13. **Local tests, neutral wording.** Tests and tools never contact a public
    website: fixtures use `localhost`, `127.0.0.1` and reserved `.example`
    hosts. Docs, comments and test names describe behaviour ("some sites open
    popups") with neutral examples (a button, a link, anywhere on the page, a
    frame embedded from another site) and never name a website or ad network
    that does it.

PRs that break any of these are rejected regardless of what else they do.

## Repo map

| Path | What it does |
|---|---|
| `manifest.json` | MV3 manifest, `minimum_chrome_version` 119. Two content-script entries, both `<all_urls>`, `run_at: document_start`, `all_frames: true`, `match_origin_as_fallback: true`: one isolated-world (`common.js` + `bridge.js`), one `world: "MAIN"` (`inject.js`). |
| `src/inject.js` | **Hooks only (untrusted world).** Captures every built-in up front, opens the nonce channel, hooks `window.open`, `HTMLElement.prototype.click`, `EventTarget.prototype.dispatchEvent` (clicks on HTML and SVG links), `HTMLFormElement.prototype.submit`, `documentPictureInPicture.requestWindow`, iframe `contentWindow/contentDocument` getters (`patchRealm`), `document.open/write`. Each hook synchronously `ask()`s the bridge and fails closed (`no-bridge`). Indexed loops only (no `for...of`, which uses the page's array iterator); regex matching through the captured `exec` (`reMatch`), never `test`. Supplies two hints: framework attribution (React ≤16/17+ props only if already present at the first press event, snapshotted by `onPress()`, which skips keys other than Enter/Space; Solid `$$click`; real jQuery with specific selectors -> `fw` +1/-1) and async origin (`asyncOrigin()`, V8 async stacks; true only if the element listener is the bottom of the synchronous stack or the framework marker is present; false if `Error.prepareStackTrace` is set or a page-wide frame appears). |
| `src/bridge.js` | **The decision maker (isolated world).** Accepts the nonce hello, reads the mode for the **top-level site**, tracks trusted gestures itself and takes a geometry **snapshot** at gesture start (`snapshotFor`, shared by the events of one physical click), `judge()`s every ask, mints every allow token (bound to a URL; `weak` when it rests on a hint) via `allow()`, takes a **press-time snapshot** (`pressSnapshot`: pressed link + href, pressed button + form/type/formtarget/formaction; Enter/Space only for keys) and refuses a click on a link re-pointed to another site (`link-swapped`) or a submit from a re-wired button (`form-swapped`), swallows overlay / ad-box link clicks, judges native `_blank` submits (same task as the user's click / Enter only), refuses cross-site opens when nothing between target and listener looks clickable (`clickablePath`, `non-interactive-listener`), and in the top frame runs the Navigation API redirect guard (`redirectReason`, in order: tab-under, popup-hijack (`window.opener` or the worker's `weakOpened`), Strict, then the provider-flow exemption (followed via `watchNav` with `also`), click hijack, timer-after-click, embedded-frame; suspicious same-site moves are handed to the worker with `watchNav`) and the `beforeunload` frame-hijack guard. In incognito it gets its mode from the worker (`getMode` message). Detectors: `isPageWide` (≥ 40% viewport or off-path), `isOverlay` (paint-based: `effectiveOpacity`, `hasVisiblePaint` (fails closed at its 300-node cap), no positioning requirement), `isAdLayer`, `inAdBoxFrame`, `isDeadHref`, `targetOf` / `clickedLink` (closed shadow roots via `chrome.dom`, asked only for possible shadow hosts), `providerFlow`. Rate-limits the block log. |
| `src/common.js` | `PS` helpers shared by background, bridge and popup: `siteOf`, `siteOfUrl`, `getSettings`, `getMode`, `setSiteMode`, `setDefaultMode` (`getMode` / `setSiteMode` take an `incognito` flag: incognito per-site choices live only in `chrome.storage.session` `incogSites`), and `PROVIDER_FLOWS` / `isProviderFlow(url)`: exact `https:` hosts + path prefixes where sign-in/payment flows start; no whole domains, no multi-tenant domains, no query-string matching. |
| `src/background.js` | Service worker. Trusts only bridge messages: whitelists `how` / `kind` / `reason`, rate-limits per tab, takes `frameUrl` from `sender.url` (origin + path). Tokens: TTL 3 s (8 s for `contextmenu`), max 4 per tab, bound to a URL's site (`user-link` / `contextmenu`: exact origin + path), refused from child frames 1.5 s after `frameOverlay`. The **backstop** (`webNavigation.onCreatedNavigationTarget`, 400 ms grace; on for `blob:`/`about:`/`data:`/`file:` openers; repairs swapped links from `user-link` tokens only (not `contextmenu`): closes the tab, opens the clicked page, logs `link-swapped`). The **redirect-chain follower** (`onCommitted`, 8 s, real redirect hops only (`isRedirectHop`: server/client redirect qualifiers, never typed/bookmark/link/back-forward/reload): `tabWatch` for tabs opened on `weak` / `sameSiteOnly` tokens, `navWatch` after `watchNav` (plus the provider site from `also`); logs `redirect-chain`). `newTabAt` per tab, answered via `tabState` and pushed as `newTab`, for tab-under detection across page loads; cleared when the user navigates the tab themselves (typed URL, bookmark, address bar). `weakTabs`: tabs opened on a `weak` token, reported once as `weakOpened` to their first page. `getMode` answers incognito pages. Per-tab log + badge in `chrome.storage.session` (batched every 250 ms), anonymous `stats` in `chrome.storage.local`, `frameGesture` relay to frame 0, welcome page on first install. |
| `src/popup.html`, `src/popup.js` | Toolbar popup: lifetime counter, 14-day sparkline, Reset stats, per-site Smart/Strict/Off, default mode, blocked list with an **Open** button, Report buttons (a `confirm()` lists what GitHub will receive, then a pre-filled GitHub issue opens in a new tab; hidden in incognito), Feedback link. `?tab=<id>` lets tests open it as a normal page. |
| `src/welcome.html` | Static welcome page opened once on first install. |
| `test/run.mjs` | E2E suite: 120 `CASES`, 223 counted checks, ~50 s with parallel workers (`E2E_WORKERS`). Each case runs in a **baseline** Chromium without the extension and again with PopShield. `rt-*` cases are red-team regressions; `knownBypass: true` cases are reported (`OPEN` / `FIXD`) but don't fail the run (only `rt-delayed-redirect` in Smart, an accepted trade-off). |
| `test/fixtures/scenario.js` | One function per scenario in the `S` object, selected with `scenario.html?t=<name>`. |
| `test/fixtures/*.html` | `scenario.html` (host page), `ad.html` (the "ad"), `other.html` (same-site page), `player.html` (the cross-site embedded frame: a fake widget with one button, with `?mode=...`), `rt-frame.html` (cross-site frames for red-team cases), `rt-hop.html` (same-site page that redirects to the ad after `?ms`). |
| `test/server.mjs` | Serves fixtures on `localhost:8711` ("the site") and `127.0.0.1:8712` ("the ad network", a different site), plus an open redirector at `/__redir?to=` (`REDIR()` in `scenario.js`). |
| `test/popup-ui.mjs` | Popup UI test: triggers 3 blocks, checks badge, list, mode buttons, overrides, the Report confirmation and pre-filled URL (captured by stubbing `chrome.tabs.create`, so GitHub is never contacted), Open button; writes screenshots to `test/screenshots/` (git-ignored). |
| `scripts/package.mjs` | Builds `dist/popshield-<version>.zip` (manifest, `src/`, `icons/` and `LICENSE` only). Refuses symlinks and stray files (`*.orig`, `*.rej`, `*.bak`, `*.swp`, `*.tmp`, `*~`, dotfiles). |
| `scripts/check-version.mjs` | Checks manifest / package / lockfile / CHANGELOG versions agree. |
| `.github/workflows/ci.yml` | Policy job (MV3, versions, no-network grep) and the test job (`npm test`). Actions pinned to SHAs, `persist-credentials: false`, `npm ci --ignore-scripts`. |
| `.github/workflows/release.yml` | On a `v*.*.*` tag: read-only build/test job, then a minimal publish job (GitHub Release + build-provenance attestation). |
| `docs/` | `LEARN.md` (tutorial), `ARCHITECTURE.md` (reference, threat model), `RELEASING.md`, `assets/` (README images). |
| `store/` | `listing.md` (Chrome Web Store texts, permission justifications and data-usage answers; keep it in step with `PRIVACY.md`), `image-src/` (`capture.mjs` runs a local demo page, `render.mjs` composes `images/`). |

## The mental model in 14 lines

1. Both content scripts run first in every frame. `inject.js` (MAIN) captures its built-ins and hands a 128-bit nonce to `bridge.js` (isolated) once; it is never re-broadcast.
2. The bridge's capturing listeners on `window` record every **trusted** gesture event (`cur`, `lastAct`, `lastPressAt`) and, before any page code runs, take a geometry **snapshot** (real target, overlay / ad-layer verdict, path, big wrappers) shared by the pointerup / mouseup / click of one physical click.
3. When the page calls `window.open` (or a scripted `_blank` click/submit, or Document PiP), the hook in `inject.js` **asks** the bridge synchronously and obeys the answer.
4. The bridge's `gestureVerdict()`: is a trusted event *being dispatched right now*, and is it **activating** (click, keyup, pointerup...), not mousedown/pointerdown?
5. Is `cur.currentTarget` a **specific element** on the snapshot's path, not `window`/document/shadow root/`<html>`/`<body>`, a wrapper covering ≥ 40% of the viewport, or an element that wasn't on the path (unless `inject.js` reports the clicked element's React/Solid/jQuery handler is running; React props only count if present at the press)? For a cross-site open with no framework handler, does something between the target and the listener look clickable (interactive element or pointer-like cursor)?
6. Did the click land on a real target, not an **invisible overlay** (covers ≥ 35% and paints nothing visible, however stacked) or a **max-z-index ad layer**?
7. No live gesture but `inject.js` says "after `await` in an element handler" (element listener at the bottom of the sync stack)? Allowed only within 5 s of a real, non-overlay click and only to the same site or a listed sign-in/payment flow (`PS.isProviderFlow`). Strict mode allows no scripted opens at all.
8. Allowed opens make the bridge mint an **allow token bound to the URL** (site), `weak` if it rested on a hint; real link clicks and right-clicks mint **exact-page** tokens. A link re-pointed to another site, or a button re-wired, between press and click is refused in the bridge. Un-tokened new tabs are closed by the backstop; a tab whose link was swapped during a left/middle/modifier click is replaced by the clicked page.
9. If a page subverts `inject.js`, it only skips the early block: the backstop still closes tabs the bridge didn't approve.
10. In the top frame, the bridge's Navigation API guard cancels cross-site script redirects from page-wide hooks, overlays, ad layers, timers within 5 s of a click, tab-unders (any new tab from this tab in the last 60 s, until a new press ≥ 0.5 s later; remembered by the worker across page loads, forgotten when the user navigates the tab) and popup hijacks (also for `noopener` tabs opened on weak evidence). Listed sign-in/payment flows are exempt only after the tab-under, popup-hijack and Strict checks, and are followed by the worker.
11. Smart allows a cross-site script redirect > 5 s after the last click (payment hand-offs; accepted trade-off). Strict blocks any script-driven cross-site redirect once the user has interacted with the page, sign-in/payment flows included (unless made from an element-scoped handler during the click).
12. Suspicious same-site moves, provider hand-offs and tabs opened on `weak` / `sameSiteOnly` tokens are followed by the worker for 8 s (`webNavigation.onCommitted`, redirect hops only); landing on an unrelated site closes the tab or sends it back (`redirect-chain`).
13. Cross-site iframes doing `top.location = ad` within 6 s of a frame click (no top click since, page focused) are held with `beforeunload` ("Leave site?"), using a frame-gesture relay for timing. A clicked frame with effective opacity < 0.5 is an overlay: child-frame tokens are refused for 1.5 s.
14. The worker counts blocks anonymously (total / day / kind) and keeps the per-page list only in session storage for that tab. It keeps no browsing history: the only site names saved are the user's per-site mode choices (incognito ones stay in session storage), and its in-memory working state (tokens, redirect-chain checks, timestamps) is never persisted.

## Running tests

```bash
npm install
npx playwright install chromium
npm test                              # e2e (baseline + extension) then popup UI test
npm run test:e2e -- <substring>       # only CASES whose name (or t) contains <substring>
npm run test:ui                       # popup UI test only
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
`knownBypass: true` is only for an attack the project has **decided** not to
block (with a `note` saying why); never use it to park a failing test.

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
- To see a run in a visible browser, write a scratch script (in your scratch
  dir, not `test/`) that copies `launch()` from `test/run.mjs` with
  `headless: false` and `slowMo`. Do not commit headed mode.
- Mode is delivered asynchronously; `run.mjs` waits 250 ms after load. A scratch
  script that clicks immediately may run in the default `smart` mode.
- Manual testing: load unpacked from the repo root, then after every edit reload
  the extension card **and** the page (content scripts attach only on load).

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
  keeps working (`isPageWide` is the exception: on error it says page-wide). Checks that *grant* permission (`asyncOrigin`, `asyncAllowed`)
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

- One focused change per PR, naming the ad technique it addresses (the technique, not a website).
- `npm test` passes locally (baseline and extension runs, plus the popup test).
- New blocking behaviour has an attack case with a baseline that proves the attack.
- Anything that could hit legitimate pages has a `legit-*` case with `blocked: []`.
- No network, remote code, telemetry, share/social features or browsing
  history; no new permissions without justification.
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
- **Reimplementing `siteOf`.** Site parsing and the multi-part TLD list
  (`MULTI`) live only in `src/common.js` (`PS.siteOf`, `PS.siteOfUrl`); use
  them instead of writing a second copy.
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
  (8 s for context-menu opens), at most 4 per tab; they are not persisted.
  The same goes for `tabWatch`, `navWatch`, `newTabAt` and `weakTabs`.
- **Measuring geometry at ask time.** Overlay and page-wide decisions must
  come from `snapshotFor()` (taken before page code runs), not from a fresh
  measurement when the ad asks; the page can change the DOM in between.
- **Loosening the provider exemption.** Use `providerFlow()` /
  `PS.isProviderFlow()`. Add exact hosts with a path prefix to
  `PROVIDER_FLOWS`, never a whole domain, a multi-tenant identity domain or
  a query-string test: a provider's domain can also contain pages that
  forward elsewhere, on multi-tenant identity domains anyone can register a
  subdomain, and pages write query strings. Keep the
  exemption after the tab-under, popup-hijack and Strict checks in
  `redirectReason`.
- **Persisting incognito state.** Per-site choices made in incognito go to
  `chrome.storage.session` (`incogSites`) via the `incognito` flag of
  `PS.getMode` / `PS.setSiteMode`; never write them to `chrome.storage.local`.
- **Walking the path on every keystroke.** Press snapshots (bridge and
  `inject.js`) are taken only for pointer/touch presses and Enter/Space; keep
  per-event work in the capture listeners small (per-click budget is about
  0.1 ms, with no forced layouts).
- **Treating the user's own navigation as a redirect.** The worker's chain
  follower must act only on `isRedirectHop()` commits.
- **Adding "helpful" stats.** Per-site counters, "top blocked sites", share
  cards or anything that names a site in persistent storage break rule 10/11.
- **Editing generated or owned files.** Don't touch `dist/`, `store/image-src/raw/`
  or screenshots by hand.
- **Testing against, or naming, someone else's site.** Rule 13: no tool that
  visits third-party pages, no website or ad-network names, no site
  categories. Reproduce the technique as a local scenario instead.
- **Overclaiming.** PopShield has had internal review rounds by the author
  and no independent third-party audit, so don't write "audited". Don't write
  that nothing ever leaves the browser (rule 12 describes the Report flow), that it
  works in every browser (it is built and tested for Chrome), or performance
  figures without "in our own benchmarks".
- **Adding tool credits.** Don't add assistant, tool or model names, or
  "made with" lines, to any file. The Credits line in `README.md` is the only
  acknowledgement.
