# Part V · Becoming a contributor

[Index](../LEARN.md) · [Part 0](00-basics.md) · [Part I](01-attacks.md) · [Part II](02-extensions.md) · [Part III](03-popshield.md) · [Part IV](04-decisions.md) · **Part V** · [Glossary](glossary.md)

You understand what PopShield does and why. This part gets you from reader to
contributor: running the tests on your own computer, finding your way around
the code, adding a test for a new trick, and debugging when something doesn't
behave. The project's rules for contributions are in
[CONTRIBUTING.md](../../CONTRIBUTING.md) and [AGENTS.md](../../AGENTS.md).

- [1. Setting up your computer](#1-setting-up-your-computer)
- [2. Running the tests and reading the results](#2-running-the-tests)
- [3. A walk through the code](#3-a-walk-through-the-code)
- [4. Teaching PopShield a new trick](#4-teaching-popshield-a-new-trick)
- [5. When something doesn't behave](#5-when-something-doesnt-behave)
- [6. Exercises](#6-exercises)
- [7. Further reading](#7-further-reading)

---

## 1. Setting up your computer

The tests drive a real browser from a program, so you need three tools:

- **[Node.js](glossary.md#nodejs)** runs JavaScript outside a browser, on
  your computer. The test programs are written in JavaScript and run with
  Node. Install version 22 (what the project's automated checks use) from
  [nodejs.org](https://nodejs.org).
- **[npm](glossary.md#npm)** comes with Node. It downloads the libraries a
  project lists in its `package.json` file and runs the project's named
  commands ("scripts").
- **[Playwright](glossary.md#playwright)** is a library that starts a real
  Chromium, loads PopShield into it, and clicks around like a person would.

You type commands into a **terminal** (Terminal on macOS, PowerShell or
Windows Terminal on Windows, any terminal on Linux). From inside the
PopShield folder:

```bash
npm install                        # download the libraries listed in package.json (here: Playwright)
npx playwright install chromium    # download the Chromium browser that Playwright will drive
npm test                           # run the full test suite: end-to-end tests, then the popup test
```

`npx` runs a command that comes with a downloaded library, here Playwright's
own installer. If `npx playwright install` seems to hang on very new Node
versions, unzip the downloaded browser archive yourself, as described in the
README.

> Run only one test command at a time on a machine. The tests use a small web
> server on fixed ports (8711 and 8712), and two runs would fight over them.

### Check your understanding

1. What's the difference between `npm install` and `npm test`?

<details><summary>Answer</summary>

`npm install` downloads the libraries the project needs. `npm test` runs the
command the project named "test", which starts the test programs.

</details>

## 2. Running the tests

`npm test` runs two programs:

- `test/run.mjs`, the **end-to-end** suite. For every scenario it opens a test
  page in real Chromium, clicks like a person (with trusted events), and
  checks the outcome, first without PopShield (the baseline) and then with it.
  There are 120 scenarios. Counting each baseline run and each PopShield run
  as one check (mode-only cases have no baseline), that's 223 checks that
  decide pass or fail, plus one known bypass that is only reported (below).
  The run takes about 50 seconds because many browsers work in parallel.
- `test/popup-ui.mjs`, which triggers real blocks and then checks the popup:
  the badge, the list, the mode buttons, a per-site setting, the Report link,
  the Open button. It also saves light and dark screenshots.

The test pages come from `test/server.mjs`, which serves the same files on two
addresses that count as **different sites**: `localhost:8711` plays "the
website" and `127.0.0.1:8712` plays "the ad network".

You can run part of the suite:

```bash
npm run test:e2e -- doc-click-popunder   # only scenarios whose name contains "doc-click-popunder"
npm run test:ui                          # only the popup test
E2E_WORKERS=2 npm run test:e2e           # use 2 parallel browsers instead of the automatic number
```

The output has two sections. In the baseline section each line shows what
plain Chromium did (`tabs=1 url=same` means one ad tab opened and the page
stayed put: the attack worked). In the PopShield section each line shows what
PopShield logged, as `kind/reason` pairs:

```text
pass  doc-click-popunder  tabs=1 url=same                         <- baseline: the ad tab opened
pass  doc-click-popunder  blocked: [popup/page-wide-listener]     <- with PopShield: blocked, and why
```

The `kind/reason` pair tells you which rule fired, which is the first thing
to look at when a test fails.

A few lines start with `OPEN` or `FIXD` instead of `pass` or `FAIL`. Those are
**[known bypasses](glossary.md#known-bypass)**: attacks the project has
decided not to block, kept in the suite so nobody forgets them. `OPEN` means
PopShield still lets it through, as expected; `FIXD` means a change now blocks
it, and the case's `knownBypass` flag should be removed. Neither fails the
run. Today there is one: Smart mode's patient redirect (`rt-delayed-redirect`,
see [Part IV](04-decisions.md#24-smart-and-strict-one-honest-trade-off)). The
last line counts only the other checks: `223/223 checks passed` means all is
well.

`npm run test:live -- <address> [clicks]` does the same kind of before/after
comparison on a real website. It needs an internet connection and isn't part
of the automated checks.

### Check your understanding

1. A new attack scenario passes with PopShield, but its baseline line shows
   `tabs=0`. What's wrong?

<details><summary>Answer</summary>

The attack didn't work even without PopShield, so the test proves nothing.
Either the scenario is broken or Chromium already blocks it (which must then be
stated in a `note`).

</details>

## 3. A walk through the code

Read the files in this order. Each builds on the one before.

**[`manifest.json`](../../manifest.json)** declares everything (you've seen it
in [Part II](02-extensions.md#2-popshields-manifest-line-by-line)).

**[`src/common.js`](../../src/common.js)** is small and shared by the bridge,
the worker and the popup. `siteOf()` turns a host name into a site (keeping
three labels for endings like `co.uk`). `getMode()` returns the mode for a
site: a per-site choice if you made one, otherwise your default. `PROVIDERS`
is the sign-in and payment list, and `looksLikeAuthOrPay()` decides whether
an address on one of them is a sign-in or payment page.

**[`src/inject.js`](../../src/inject.js)** (page's world). From the top:

1. a long block of saved built-in tools, before anything else;
2. the private line: making the stamp, `sayHello()`, `onDown()` (answers from
   the bridge) and `ask()`;
3. small link helpers (`isLink`, `linkHref`, `linkOpensNew`);
4. the async hint, `asyncOrigin()`;
5. framework recognition: `onPress()` (which React data existed when you
   pressed), `attributeFrameworks()` and `wrapHandler()`;
6. `patchRealm(win)`, which installs every hook in a window: `open`, `click`,
   `dispatchEvent`, `submit`, Picture-in-Picture, `document.open/write`, and
   the frame doors. It is called for the page's own window and for every new
   frame window the page reaches into.

Notice that there is no "is this allowed?" logic here. Every hook ends in
`ask(...) !== 'ok'`.

**[`src/bridge.js`](../../src/bridge.js)** (isolated world), the heart of
PopShield. From the top:

1. settings and the site of the top page;
2. the private line (`onHello`, `onUp`, `down`);
3. messages to the worker: `allow()` issues tickets, `block()` logs with rate
   limits;
4. detectors: `targetOf`, `effectiveOpacity`, `hasVisiblePaint`,
   `isOverlay`, `isAdLayer`, `isPageWide`, `inAdBoxFrame`, `isDeadHref`,
   `clickedLink`, `providerFlow`;
5. the gesture state, the snapshot and the verdict: `snapshotFor()`,
   `gestureVerdict()`, `asyncAllowed()`, `judge()`, `handleAsk()`;
6. `onGesture()`: records clicks and presses, takes the snapshot, cancels
   overlay links, issues link tickets;
7. `onSubmit()`: the form guard (same-task rule);
8. top frame only: `frameJustClicked()`, the `tabState` question to the worker,
   the `navigate` listener with `redirectReason()` (redirect guard) and
   `onBeforeUnload()` (player hijack).

**[`src/background.js`](../../src/background.js)** (service worker):
constants (ticket lifetimes, limits), the whitelists of kinds and reasons,
rate limits, tickets (`addToken`, `tokenFits`, `takeToken`,
`takeSwappedLink`), the redirect-chain follower's state (`tabWatch`,
`navWatch`, `landingOk`) and the per-tab "opened a tab at" memory
(`newTabAt`), the per-tab list (`logBlocked`, `flushLog`, `clearTab`), the
anonymous counter (`bumpStatsMany`), the message handler, the backstop
(`onCreatedNavigationTarget`), the chain follower and cleanup
(`onCommitted`), cleanup when a tab closes, and the welcome page on install.

**[`src/popup.js`](../../src/popup.js)**: the counter and bar chart, Reset
stats, the mode buttons, the list with Open buttons, and the Report and
Feedback links.

**[`test/fixtures/scenario.js`](../../test/fixtures/scenario.js)** and
**[`test/run.mjs`](../../test/run.mjs)**: every scenario, and the table of
what each must do (`CASES`).

### Check your understanding

1. You want to change when a click counts as "page-wide". Which file and
   function?
2. You want to change how long a right-click ticket lasts. Which file?

<details><summary>Answers</summary>

1. `src/bridge.js`, `isPageWide()`.
2. `src/background.js`, the `CONTEXTMENU_TTL` constant.

</details>

## 4. Teaching PopShield a new trick

Say you've found an ad that opens a tab on `pointerup` from a listener on
`window`. The rule of the project: **first prove the attack works without
PopShield, then make sure PopShield stops it, and make sure nothing
legitimate breaks.**

**Step 1: write the attack** as a new entry in the `S` object in
`test/fixtures/scenario.js`:

```js
'window-pointerup-popunder'() {                       // the scenario's name, used in the address ?t=...
  playerControls();                                   // add the fake video player with a Play button
  window.addEventListener('pointerup', () => {        // the attack: listen on window for every pointer release
    window.open(AD + '?pointerup-win');               // and open the ad (AD is the "ad network" address)
  });                                                 // end of the attack's listener
},                                                    // end of the scenario
```

**Step 2: describe what must happen** as a new entry in `CASES` in
`test/run.mjs`:

```js
{ t: 'window-pointerup-popunder',   // which scenario to load
  act: 'play',                      // what the test does: click the Play button
  tabs: 0,                          // with PopShield: no new tab may stay open
  url: 'same',                      // with PopShield: the page must stay where it is
  played: true,                     // the Play button must still work
  blocked: ['popup'],               // PopShield must log a blocked popup
  baseline: { tabs: 1 } },          // without PopShield: one ad tab opens (proves the attack)
```

**Step 3: run it**, `npm run test:e2e -- window-pointerup`. If the baseline
fails, your attack doesn't work in plain Chromium; fix the scenario first. If
the PopShield run fails, the `kind/reason` output tells you what PopShield
did.

**Step 4: fix PopShield**, if needed. New decisions go in `src/bridge.js`;
`inject.js` only gets a new hook if there's a new way to open a tab. Read
[AGENTS.md](../../AGENTS.md) for the rules (no decisions in the page's world,
tickets only from the bridge, saved built-ins in `inject.js`).

**Step 5: add a legitimate twin** if your change could affect real sites: a
`legit-...` scenario doing the honest version, with `blocked: []`, so that a
false positive fails the suite.

**Step 6: run everything**, `npm test`, and update the README and CHANGELOG
if users will notice the change.

### Check your understanding

1. Why does every attack case need a `baseline`?
2. When do you need a `legit-*` twin?

<details><summary>Answers</summary>

1. To prove the attack really works without PopShield; otherwise a passing
   test proves nothing.
2. When the change could block something a real site does honestly.

</details>

## 5. When something doesn't behave

- **Read the `kind/reason` pair first.** It names the rule that fired.
- **Where do `console.log` messages go?** From `inject.js` and `bridge.js`,
  to the page's own console (DevTools, Console tab). From
  `background.js`, to the service worker's console: `chrome://extensions` →
  PopShield → "service worker". Remove logs before committing.
- **Look at the stored list** from the service worker console:
  `chrome.storage.session.get(null)` shows every tab's list and count.
- **Watch a test run.** Copy the `launch()` function from `test/run.mjs` into a
  scratch script outside the repository, with `headless: false` and `slowMo`,
  to see the browser. Don't commit headed mode.
- **Timing.** The mode reaches the page a moment after it loads; the tests wait
  250 ms. A scratch script that clicks immediately runs in Smart mode.
- **Manual testing.** After every edit, reload PopShield on
  `chrome://extensions` **and** reload the page; content scripts only start
  when a page loads.

### Check your understanding

1. You changed `bridge.js`, reloaded the page, and nothing changed. Why?

<details><summary>Answer</summary>

The extension itself wasn't reloaded on `chrome://extensions`, so Chrome still
runs the old copy.

</details>

## 6. Exercises

### Predict, then run

For each scenario, predict the `kind/reason` PopShield logs, then check with
`npm run test:e2e -- <name>`: `window-mousedown-popunder`, `overlay-anchor`,
`decoy-hash-swap`, `tab-under`.

<details><summary>Answers</summary>

- `window-mousedown-popunder`: `popup/non-activating-event` (the event type is
  checked before the listener's position).
- `overlay-anchor`: `overlay-link/invisible-overlay` (the bridge cancels the
  click before any page listener).
- `decoy-hash-swap`: `new-tab/no-user-intent`, logged by the **backstop**: the
  click earned a "same site only" ticket, and the swapped ad address is on
  another site.
- `tab-under`: `popup/page-wide-listener` and `redirect/page-wide-listener`.
  Both come from a `document` listener, so they fail the page-wide check
  before any tab-under rule is reached. Try `element-tab-under` (a button's
  own handler opens the tab, then redirects) to see the `tab-under` reason.

Two more, a little harder: `rt-link-href-swap-redirector` and
`rt-redirector-navigation`.

<details><summary>Answers</summary>

- `rt-link-href-swap-redirector`: `new-tab/link-swapped`. Your link ticket
  names the exact article; the tab opens at the swapped redirector address,
  so the worker closes it and opens the article instead.
- `rt-redirector-navigation`: `redirect/redirect-chain`. The move to the
  same-site redirector is let through, but followed; when the tab lands on
  the ad site, the worker sends it back.

</details>

</details>

### Find a limitation

Write a scenario where a button opens a **same-site** page from a timer:

```js
'legit-button-timeout'() {                                  // scenario name
  el('<button id="b">Open</button>');                       // add a button
  $('#b').addEventListener('click', () => {                 // when it's clicked...
    setTimeout(() => window.open('/other.html?t'), 0);      // ...open a same-site page from a timer
  });                                                       // end of the listener
},                                                          // end of the scenario
```

With the case `{ t: 'legit-button-timeout', act: '#b', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } }`,
the baseline passes and the PopShield run fails. Why? What if the handler used
`await new Promise(r => setTimeout(r, 0))` instead? And what if, with `await`,
it opened `AD + '?x'`? (Compare `legit-async-open` and
`async-cross-site-element`.) Don't commit this case unless you also fix the
limitation.

<details><summary>Answer</summary>

The timer runs after the click is over, and the bottom of its stack trace is
the timer's own function, not the button's listener, so the hint is "no" and
the bridge blocks it. With `await`, the resumed button listener is the bottom
of the stack (`HTMLButtonElement`), the click was under 5 seconds ago, and the
address is on the same site: allowed, with a weak ticket. With `await` but an
ad address, the bridge still blocks it, because after `await` only the same
site or a provider's sign-in or payment page is allowed.

</details>

### Break it on purpose

In `snapshotFor()` in `src/bridge.js`, temporarily remove the
`isAdLayer(t) ? 'ad-layer' :` part of the line that sets `target`, and run
`npm run test:e2e -- ad-layer`. The `ad-layer-tab-under` case
should fail. Which other rule still catches part of the attack? (Hint: the
popup is of this same page.) Put the line back afterwards.

### Poison a tool

Write a scratch scenario that runs, before its attack,
`Object.defineProperty(Event.prototype, 'currentTarget', { get() { return document.body.firstElementChild; } })`,
then adds a `document` click listener that opens `AD`. Predict whether
PopShield still blocks it, and why. (Part III, chapter 4.)

<details><summary>Answer</summary>

Still blocked. The page swapped the tool in its own world; the bridge reads
`currentTarget` with its own clean tool in the isolated world and sees
`document`.

</details>

### Trace a player hijack

Read `test/fixtures/player.html` (`?mode=top`) and the
`player-iframe-top-redirect` case. Write down, in order, every file and
function your press inside the player passes through until "Leave site?"
appears. Compare with the diagram in
[Part III](03-popshield.md#hijacks-from-the-video-player).

### A real site

`npm run test:live -- <address> 8` on a site you know shows ads. Compare the
two sections. If something gets through, that's a bug report (see
CONTRIBUTING.md).

## 7. Further reading

Chrome extensions:

- [What is Manifest V3?](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
- [Content scripts, including isolated worlds](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Manifest `content_scripts` reference](https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts)
- [Extension service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers)
- [Message passing](https://developer.chrome.com/docs/extensions/develop/concepts/messaging)
- [`chrome.webNavigation`](https://developer.chrome.com/docs/extensions/reference/api/webNavigation),
  [`chrome.storage`](https://developer.chrome.com/docs/extensions/reference/api/storage),
  [`chrome.dom`](https://developer.chrome.com/docs/extensions/reference/api/dom)

The web platform:

- [Navigation API](https://developer.chrome.com/docs/web-platform/navigation-api)
- [User activation (MDN)](https://developer.mozilla.org/en-US/docs/Web/Security/User_activation)
- [Event bubbling and capture (MDN)](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/Event_bubbling)
- [`Event.isTrusted`](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted),
  [`Event.currentTarget`](https://developer.mozilla.org/en-US/docs/Web/API/Event/currentTarget),
  [`Event.composedPath()`](https://developer.mozilla.org/en-US/docs/Web/API/Event/composedPath)
- [`beforeunload` (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
- [V8 stack trace API](https://v8.dev/docs/stack-trace-api) and
  [Faster async functions and promises](https://v8.dev/blog/fast-async)
- [Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture)

Testing and supply chain:

- [Playwright: Chrome extensions](https://playwright.dev/docs/chrome-extensions)
- [GitHub Actions: security hardening](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions)
- [Artifact attestations](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations)

---

Back to the [index](../LEARN.md) · [Glossary](glossary.md)
