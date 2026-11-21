# Contributing to PopShield

Thanks for helping. PopShield is a small Manifest V3 Chrome extension written
in plain JavaScript. The most useful contributions are:

- reports of sites where ads still get through (see [below](#reporting-a-site-where-ads-still-get-through)),
- reports of legitimate popups or links that get blocked (false positives),
- new attack scenarios with tests, and fixes for them.

By participating you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
Security problems go through [SECURITY.md](SECURITY.md), not public issues.

## Development setup

Requirements: Chrome or Chromium 119+, Node.js 22 (what CI uses; 18+ should work).

```bash
git clone https://github.com/madironman/popshield.git
cd popshield
npm install
npx playwright install chromium
```

Load the extension:

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the repository folder (the one containing `manifest.json`).
3. After editing files, click the reload icon on the PopShield card, then reload
   the page you are testing. Content scripts only attach to pages loaded after
   the extension.

There is no build step. What is in `src/` is what Chrome runs.

### Layout

| Path | What it is |
|---|---|
| `manifest.json` | Extension manifest |
| `src/inject.js` | Page-world (`MAIN`) hooks only: `window.open`, link clicks, `dispatchEvent`, `form.submit`, Picture-in-Picture, child-frame patching. It asks the bridge and supplies two hints; it decides nothing |
| `src/bridge.js` | Isolated-world decision maker: judges every request, mints URL-bound tokens, runs the redirect, form and embedded-frame guards, writes the block log |
| `src/common.js` | Shared helpers: sites, modes (including incognito-only choices kept in memory), the exact list of sign-in/payment flows (`PROVIDER_FLOWS`) |
| `src/background.js` | Service worker: validates bridge messages, backstop for new tabs, redirect-chain following, per-tab log, badge, anonymous counter |
| `src/popup.html`, `src/popup.js` | Toolbar popup: counter, blocked list, Open, Smart/Strict/Off, Report and Feedback |
| `src/welcome.html` | First-install welcome page |
| `test/` | Playwright tests, local fixture server and attack fixtures |
| `scripts/` | `package.mjs` builds the release zip (and refuses symlinks and stray files such as `*.orig`, `*.rej`, `*.bak` or dotfiles); `check-version.mjs` checks that versions agree |

## Tests

```bash
npm test                         # e2e suite + popup UI test
npm run test:e2e                 # only test/run.mjs
npm run test:e2e -- tab-under    # only cases whose name contains "tab-under"
npm run test:ui                  # only test/popup-ui.mjs
```

Every test runs on local fixture pages served from your own machine. No test
contacts a public website, and none should be added that does.

- **`test/run.mjs`** starts two local servers (`localhost:8711` for the page,
  `127.0.0.1:8712` as the cross-site "ad" origin, plus an open redirector at
  `/__redir?to=`) and runs every case in real headless Chromium twice. The
  **baseline** run has no extension and proves each attack really works in
  plain Chrome (with Chrome's own popup blocker on). The second run loads
  PopShield and checks that every attack is blocked, every legitimate pattern
  still works, and the block log contains the expected kinds. Both passes run
  at the same time across parallel browsers (sized from your CPU and memory;
  set `E2E_WORKERS=N` to override). The full suite is 120 scenarios and 223
  counted checks, and takes about 50 seconds. `rt-*` cases are regressions
  from internal red-team rounds.
- **Known bypasses.** A case with `knownBypass: true` is an attack the project
  has decided not to block. It runs and is printed as `OPEN` (still gets
  through) or `FIXD` (now blocked: remove the flag), but it doesn't fail the
  run. The only one today is `rt-delayed-redirect` in Smart mode, the
  deliberate trade-off that keeps payment hand-offs working; its Strict twin
  must pass. Don't use `knownBypass` to park a test that fails for other
  reasons.
- **`test/popup-ui.mjs`** triggers real blocks, then checks the toolbar popup:
  badge count, blocked list, mode buttons, the Report confirmation with the
  pre-filled address it would open (captured inside the test, so GitHub is
  never contacted) and the Open button. It saves light and dark screenshots
  to `test/screenshots/` (git-ignored; CI uploads them as an artifact).

CI runs `npm test` on every push and pull request to `main`, plus a policy job
that checks `manifest.json` and the no-network rule.

## Adding a new attack scenario

Every blocking rule should be backed by a test that shows the attack works
without PopShield and fails with it.

1. **Add a fixture** to `test/fixtures/scenario.js`: a new entry in the `S`
   object, keyed by the scenario name. It runs when the page is opened as
   `scenario.html?t=<name>`. Use the helpers already there: `playerControls()`
   for the page's own box with one button (`#play`; the names are historical
   test identifiers), `el(html)` to add markup, and `AD` (a URL on the
   cross-site ad origin) as the destination.

   ```js
   'window-pointerup-popunder'() { // short comment describing the technique
     playerControls();
     window.addEventListener('pointerup', () => window.open(AD + '?pointerup-win'));
   },
   ```

2. **Add a case** to `CASES` in `test/run.mjs`:

   ```js
   { t: 'window-pointerup-popunder', act: 'play', tabs: 0, url: 'same', played: true,
     blocked: ['popup'], baseline: { tabs: 1 } },
   ```

   - `act`: what the test does: `'play'` (click the page's own button,
     `#play`), `'#selector'`, `'ctrl:#sel'`, `'middle:#sel'`, `'rclick:#sel'`,
     `'enter:#sel'`, `'key:<key>'`, `'wait:<ms>'`, `'iframe'` (click inside the
     embedded cross-site frame), `'frame:<iframe>:<el>'`, `'none'`, and others
     handled in `act()`. Several steps can be chained with spaces, e.g.
     `'rclick:#play wait:300 #play'`.
   - `wait`: extra milliseconds to let a delayed attack run its course.
   - `tabs` / `url`: the expected result **with** PopShield (`url` is `'same'`,
     `'ad'`, `'other'` or `'hop'`). `adTab: true` / `false`: some new tab must /
     must not end up at the ad page.
   - `blocked` / `blockedAny`: kinds that must appear in the block log (`popup`,
     `scripted-link`, `scripted-form`, `overlay-link`, `redirect`, `new-tab`).
     `blocked: []` means "nothing may be logged" and is how legitimate cases
     catch false positives.
   - `played` / `iframePlayed`: the page's own button must keep working.
   - `dialog: 'beforeunload'` / `noDialog: true`: a "Leave site?" prompt must /
     must not appear. `downloaded`, `maxBlocked`: a download must happen; the
     log may hold at most this many entries.
   - `baseline`: what plain Chrome does without the extension, e.g.
     `{ tabs: 1 }` or `{ url: 'ad' }`. **This must show the attack succeeding**,
     otherwise the test proves nothing. If Chrome already blocks it, say so with
     `note`. Use `baseline: null` only for mode tests that have no meaningful
     baseline.
   - `mode` / `site`: run the case in `smart`, `strict` or `off`, or with
     per-site overrides. For anything that differs between Smart and Strict,
     add a twin with `name: '<t> (strict)'`, `mode: 'strict'`, `baseline: null`.
   - `note`: why the case looks the way it does (printed with the result).
     `knownBypass: true` only together with a `note` saying why the project
     accepts it.

3. **Add the legitimate counterpart** if your fix could affect real sites
   (name it `legit-...`, with `blocked: []`).

4. Run `npm run test:e2e -- <name>` until it passes, then the full `npm test`.

## Reporting a site where ads still get through

Use the **Ad got through** issue form, or the **Report** buttons in the
popup, which open the same form already filled in after a confirmation that
shows what GitHub will receive.

Issues are public and tied to your GitHub account.
Don't post links to adult content or to sites offering content illegally;
describe what the page did instead. Such links will be removed.

Please include:

- **The URL** of the page (one that reproduces without logging in, if possible).
- **The mode** shown in the PopShield popup for that site: Smart, Strict or Off.
- **What opened**: a new tab, a popup window, a tab behind the current one, a
  redirect of the current tab, or a "Leave site?" prompt; and what you clicked
  (a button, a link, anywhere on the page...).
- **The PopShield popup log**: open the toolbar popup on that tab and attach a
  screenshot of the blocked list, even if it is empty.
- Your Chrome version (`chrome://version`) and PopShield version
  (`chrome://extensions`), and any other ad blockers you run.

Don't paste URLs containing session tokens or personal data.

## Coding conventions

- **Plain JavaScript, no build step**, no bundler, no TypeScript, no runtime
  dependencies. `devDependencies` are for tests only.
- **No network calls, no remote code, no telemetry.** PopShield never calls
  `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` or similar, never loads
  remote scripts or filter lists, and never collects usage data. CI enforces
  part of this. **Pull requests that add remote code, remote configuration,
  analytics or tracking of any kind will be rejected.**
- Don't add permissions to `manifest.json` without a clear reason in the PR.
- `src/inject.js` runs in the page's own world, where a hostile page can
  tamper with anything: capture every built-in at startup and call it through
  `R_apply`, never make security decisions there, and never mint allow tokens
  outside `src/bridge.js` (see [AGENTS.md](AGENTS.md)).
- Keep no browsing history: the only site names PopShield may save are the
  ones the user chooses a mode for, and everything else stays an anonymous
  count. Don't add share or social features.
- The Report buttons are the only way details leave the browser, and only
  after their confirmation. If you change what they share, change the
  confirmation text, `PRIVACY.md` and `store/listing.md` in the same PR.
- Wording in docs, comments and test names stays neutral: describe what a page
  does ("some sites open popups") and never name a website or an ad network
  that does it. Examples use a button, a link, anywhere on the page or a frame
  embedded from another site, on `example.com` or a reserved `.example` host.
  (The sign-in and payment providers in `PROVIDER_FLOWS` are named only to
  describe compatibility.)
- Keep pages working: when in doubt, prefer letting a legitimate action through
  (and covering the ad with a narrower rule) over a broad block.
- Sign-in and payment exemptions are exact: add a provider to `PROVIDER_FLOWS`
  in `src/common.js` as an exact host plus the path prefix where its flow
  starts. Never exempt a whole domain, a domain where anyone can get a
  subdomain, or URLs by their query string.
- Mode choices made in incognito must stay in `chrome.storage.session`; never
  write them to `chrome.storage.local`.
- PopShield runs on every click and keystroke: keep per-event work small (in
  our own benchmarks a click costs about 0.1 ms, with no forced layouts), and
  don't do per-keystroke work for keys other than Enter and Space.
- Style: 2-space indentation, single quotes, semicolons, small functions with a
  comment explaining *why* for any non-obvious rule. `.editorconfig` covers the
  basics.
- Update `README.md` (layers, modes, known limitations) and `CHANGELOG.md`
  (under **Unreleased**) when behaviour visible to users changes.

## Pull request checklist

- [ ] `npm test` passes locally.
- [ ] New blocking behaviour has an attack case whose baseline proves the attack works in plain Chrome.
- [ ] Behaviour that could affect real sites has a `legit-*` case with `blocked: []`.
- [ ] No network calls, remote code or telemetry; no new permissions without justification.
- [ ] Plain JS, no build step, no new runtime dependencies.
- [ ] README and CHANGELOG updated where relevant.
- [ ] One focused change per PR, with a description of the technique it addresses.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).

## Guides

- [AGENTS.md](AGENTS.md): rules, repo map, testing and debugging tips for AI coding agents and other automated contributors (and a fast orientation for humans).
- [docs/LEARN.md](docs/LEARN.md): "PopShield from scratch", a beginner-friendly tutorial from browser basics to the decision pipeline, with exercises.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): technical reference: components, message flow, verdict algorithm, tokens, storage schema, threat model and design decisions.
