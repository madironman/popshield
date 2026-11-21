<div align="center">

<img src="docs/assets/hero.svg" alt="PopShield: clicks on a web page try to open ad windows, and each one is blocked" width="100%">

<br>

<a href="https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"><img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-1a73e8?style=flat-square"></a>
<img alt="Chrome 119+" src="https://img.shields.io/badge/Chrome-119%2B-1a73e8?style=flat-square">
<a href="https://github.com/madironman/popshield/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/madironman/popshield/ci.yml?branch=main&style=flat-square&label=CI"></a>
<img alt="Tests: 225 e2e checks" src="https://img.shields.io/badge/tests-225%20e2e%20checks-2ea44f?style=flat-square">
<img alt="No telemetry" src="https://img.shields.io/badge/telemetry-none-2ea44f?style=flat-square">
<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square"></a>

### Blocks ad popups, popunders, ad tabs and tab-hijack redirects. The tabs you open still work.

[Install](#-install) · [How it works](#-how-it-works) · [Privacy](#-privacy) · [Security](#-security) · [Limitations](#-known-limitations) · [Tests](#-testing) · [Contributing](CONTRIBUTING.md)

</div>

> [!IMPORTANT]
> **PopShield keeps no browsing history.** The only site names it saves are the ones you choose a mode for; everything else is an anonymous count (total, per day, per kind), kept on this device. The list of what was blocked on a page lives only in that tab: it is cleared when you go to a new page or close the tab (reloads and in-page route changes keep it), and when the browser exits. No telemetry, no background network requests, no remote code. If you press **Report**, PopShield first shows what will be shared, then opens github.com with those details filled in. GitHub receives them when the tab opens, and nothing becomes public unless you sign in and submit. [Details](#-privacy)

---

## Why

On some sites, **every click on the page opens an ad tab**: a click on a button, on a link, or anywhere else on the page. Some ad scripts attach one listener to the whole page. Any click anywhere then runs `window.open(ad)`.

**Chrome's built-in popup blocker lets these through.** It is built to stop popups opened *without* a user gesture, and here a real click did happen. It just wasn't a click on anything that should open a tab.

PopShield looks at **where the click was handled**, not only *whether* there was a click. A page may open a new tab only while your real click is being delivered to a listener **on a specific element**, such as a Share button or a link. Page-wide hooks, invisible overlays, ad layers and timers don't count.

> [!NOTE]
> **What the tests show.** Every attack in the test suite runs on a local test page, first in plain Chromium with its popup blocker on, then with PopShield. In the baseline, 76 of 78 attacks get through. With PopShield all of them are stopped except one documented Smart-mode trade-off. No third-party website is contacted. [Results](#-results-in-the-test-suite)

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

**🛡️ Intent-based blocking**<br>
Blocks popups and popunders fired from page-wide click hooks (including wrappers that cover a large part of the page), invisible overlays (judged by what they actually paint) and max z-index ad layers. Share buttons, `target="_blank"` links, ctrl / middle-click and "Open link in new tab" keep working.

</td>
<td width="50%" valign="top">

**↪️ Redirect, tab-under and hijack guards**<br>
Stops cross-site redirects of the current tab driven by ad click hooks or fired right after a click, tab-unders ("open this page in a new tab, send this tab to an ad"), popups sent to another site before you use them, and hijacks from a frame embedded from another site (for example a widget). Same-site redirectors that bounce on to an ad are followed and undone.

</td>
</tr>
<tr>
<td valign="top">

**🧱 Hardened against hostile pages**<br>
The page's world only hosts hooks. Every decision and every "allow" token is made in Chrome's isolated extension world, which pages can't touch, and a background backstop closes any new tab that wasn't approved there.

</td>
<td valign="top">

**⚙️ Understands common site patterns**<br>
Understands React ≤16 and 17+, Solid and jQuery event delegation, sign-in and payment popups after `await`, links inside closed shadow roots, and SVG links.

</td>
</tr>
<tr>
<td valign="top">

**📊 Local counter and per-site modes**<br>
The popup shows how many popups and redirects were blocked since install, with a 14-day sparkline, and lets you pick **Smart** (default), **Strict** or **Off** per site.

</td>
<td valign="top">

**🔒 Private by design**<br>
Keeps no browsing history: the only site names it saves are the ones you choose a mode for, and everything else is an anonymous count. No telemetry, no remote filter lists, no accounts. Plain JavaScript with no build step, so the code you read is the code that runs.

</td>
</tr>
</table>

## 🖼️ Demo

The toolbar popup shows the lifetime counter, lists everything blocked on the current page with the reason, and gives each item an **Open** button in case you wanted it after all. The badge on the icon shows the count for the current page.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/popup-dark.png">
    <img src="docs/assets/popup-light.png" alt="PopShield popup: Smart mode selected for localhost, with three blocked items (scripted link, redirect hijack, popup), each with an Open button, and the two Report buttons with their notice below" width="360">
  </picture>
</p>

<p align="center"><sub>Screenshot from the automated UI test (<code>test/popup-ui.mjs</code>) after it triggers three blocks on a local test page.</sub></p>

The popup also has:

- **Report ads that got through** and **Report something blocked by mistake**: after a confirmation that lists what will be shared, these open github.com with an issue form filled in (the page's address without anything after `?` or `#`, your mode, the Chrome and PopShield versions, and a summary of what was blocked: types and ad hostnames). GitHub receives those details as soon as the tab opens. Nothing becomes public unless you sign in and submit the form. The buttons are hidden in incognito windows.
- **Feedback**: opens GitHub Discussions (Ideas).
- **Reset stats**: resets the lifetime counter on this device.

A welcome page opens once, on first install.

## 📦 Install

### Chrome Web Store

*Coming soon.* The store listing isn't published yet. Until then, load it unpacked.

### Load unpacked (developer mode)

1. Download this repository ([ZIP](https://github.com/madironman/popshield/archive/refs/heads/main.zip) or `git clone https://github.com/madironman/popshield.git`) and unzip it.
2. Open `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select the folder that contains `manifest.json`.
4. Pin PopShield to the toolbar. The badge shows how many items were blocked on the current page.

Requires Chrome **119 or newer**. PopShield is built and tested for Chrome (the automated tests run in Chromium); other Chromium-based browsers may work but are not tested. Pages that were already open before you installed it need a reload.

## 🧠 How it works

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.svg">
    <img src="docs/assets/how-it-works-light.svg" alt="Flow: a page asks for a new tab. Check 1, real gesture. Check 2, full click. Check 3, listener on an element. Check 4, real target. All pass: allowed. Any fails: blocked and listed in the popup." width="100%">
  </picture>
</p>

PopShield puts small hooks into the page's own JavaScript world, in every frame, before any page script. When the page tries to open a tab, the hook asks PopShield's isolated script: *is the code running right now handling a real click on a specific element?* An open is **blocked** when:

| Check | Fails when | Reason shown in the popup |
|---|---|---|
| **1. Real gesture** | no trusted user action is in progress (timers, async callbacks) | not caused by your click |
| **2. Full click** | the open fires on mouse-down or pointer-down instead of a full click | fired on mouse-down, not a real click |
| **3. On an element** | the listener is on `window`, `document`, `<html>`, `<body>`, a shadow root, a wrapper element covering **at least 40% of the viewport**, or an element that wasn't on the click's path at all: a page-wide hook | opened by a page-wide click hook |
| | …or, for a script-opened tab or popup to **another site**, nothing between the element you clicked and the listener looks clickable: no link, button, input or other interactive element, and no pointer-style cursor (ad scripts that attach a listener to every element on the page) | opened by a script on something that isn't a button or link |
| **4. Real target** | the click landed on an **invisible overlay**: an element covering ≥ 35% of the screen that paints nothing you can see, however it was stacked on top | click landed on an invisible overlay |
| | …or on an **ad layer**: a visible element at near-maximum z-index (≥ 2147480000), positioned fixed/absolute, covering ≥ 25% of the viewport, where the click hit an image or blank area rather than a button, link or input | click landed on an ad layer stacked over the page |

Checks 3 and 4 measure the page **the moment your click arrives** (as you release the button), before any page code has run for it. The pointer-up, mouse-up and click events of one physical click share that one snapshot, so an ad can't shrink its wrapper or pull its overlay away in between and then ask.

PopShield also remembers **what you pressed**, at the moment you press. If a script then re-points the link under your pointer to another site, or attaches the button you pressed to a different form (or changes where that form submits) before you release, the click or submit is refused. Ordinary typing doesn't trigger this bookkeeping; only Enter and Space, which can activate something, do.

**What "invisible" means.** PopShield looks at what the element actually paints. It counts as invisible when its effective opacity (multiplied up the ancestor chain, including `filter: opacity()`) is below 0.2, or when nothing inside it is visible: no text with a visible colour (transparent `color` and `-webkit-text-fill-color` both count as invisible), no background colour or picture that shows (a gradient made only of transparent colour stops counts as empty), and no picture, canvas or other media element taking up a real share of it. PopShield looks at up to 300 elements inside it; if none of them shows anything, the element counts as invisible, so an overlay can't escape by padding itself with hundreds of empty children. How it got on top doesn't matter: `position: fixed`, a grid cell, negative margins or a transform are all treated the same. When the element under your pointer sits inside a closed shadow root, PopShield looks inside it with `chrome.dom.openOrClosedShadowRoot`.

<details>
<summary><b>Refinements that keep legitimate sites working</b></summary>

<br>

- **Framework delegation.** React ≤16 runs click handlers from one listener on `document`, React 17+ from the root container, Solid from `document` (`$$click`), and jQuery's `$(document).on('click', '.btn', fn)` the same way. During each click, PopShield wraps the handler that belongs to the clicked element, and an open made inside it counts as element-scoped. React props only count if they were already on the element when you pressed, so props a page plants from its own press handler are ignored. jQuery only gets this for a real jQuery and specific selectors (containing `.`, `#` or `[`, not matching `<body>`, at most 50 matches); a catch-all such as `*` doesn't.
- **Opens after `await`.** V8 async stack traces keep the listener's receiver across `await`, for example `at async HTMLButtonElement.<anonymous>`. An open after `await` is allowed when the element's (or framework's) handler is the bottom of the resumed stack, your click was less than 5 s ago and landed on a real target, **and the address is on the same site or is the start of a sign-in or payment flow at a known provider** (Google, Apple, Microsoft, GitHub, PayPal, Stripe and others). That list (`PROVIDER_FLOWS` in [`src/common.js`](src/common.js)) names exact hosts and the path where each flow begins, such as GitHub's OAuth authorize page or Stripe's checkout host. Nothing broader counts: not the rest of a provider's domain (which can also contain pages that forward elsewhere), not multi-tenant identity domains where anyone can register a subdomain, and not an arbitrary address that merely carries a `client_id=` parameter. If the page tampers with stack formatting, the hint is ignored. Because this rests on a hint the page could influence, the background follows the new tab for 8 s and closes it if it lands on an unrelated site.
- **Legitimate max z-index UI.** The ad-layer check only applies when the click hit non-interactive content, so buttons inside cookie banners and modals stacked at the maximum z-index still work.
- **Links you click.** A `_blank` link, ctrl / middle-click and right-click "Open link in new tab" on a real, visible link get an allow token for **exactly that page** (origin and path). If a script swaps the link's address during a left, middle or modifier click, the ad tab is closed and the page you actually clicked is opened instead. Right-click opens aren't repaired this way, only blocked, because the menu can sit open for a while. A decoy `#` link's new tab must stay on the same site, and a modifier-click where PopShield sees no link allows only a same-site tab.
- **Forms you submit.** A `target="_blank"` form submitted natively counts only when it happens in the same task as your click on a visible submit button of that form, or your Enter inside it.
- **Same-site and on-load redirects** are left alone (a same-site hop right after a suspicious click is followed, see below). Reloads, back/forward, downloads, link clicks, bookmarks and URLs you type are never touched, by the page guard or by the background's redirect follower.

</details>

### Redirects of the tab you're on

In the top frame, the Navigation API guard cancels cross-site, script-driven navigations of the current tab when:

- **Click hijack.** It happens within 5 s of a click but doesn't come from an element-scoped handler (page-wide hook, overlay, ad layer, mouse-down), or it is a timer / `<meta refresh>` redirect right after a click.
- **Tab-under.** This tab opened a new tab in the last 60 s and you haven't pressed anything since (a press within half a second is the same click). The worker remembers the opened tab per tab, so hopping to another page of the same site doesn't reset it; going somewhere yourself (typing an address, using a bookmark) does. A tab opened by a link you click counts once the new tab has really appeared. Opening this same page (any `?query`) in a new tab during a click is blocked too.
- **Popup hijack.** A popup that hasn't received any click yet is sent to another site. This also covers a tab opened with `noopener` when its approval rested on weaker evidence, because the background tells the new tab's first page how it was opened.

A cross-site frame doing `top.location = ad` never reaches that guard: Chrome gives the top page no `navigate` event for it. PopShield's background worker handles this case instead.

- **Embedded-frame hijack.** The worker records when you last pressed inside a child frame (a frame embedded from another site, for example a widget) and when you last pressed on the page itself. If the tab then lands on a different site within 6 seconds of a press inside a frame, with no newer press on the page, the worker sends the tab back to the page you were on and logs the attempt. It leaves alone your own navigations (typing an address, a bookmark, reload, back and forward), sign-in and payment flows, sites set to Off, and a real link you click inside the frame that is meant to open in the whole tab (`target="_top"` or `_parent`); that link is matched by origin and path.

A hand-off to a known sign-in or payment flow is allowed when none of the tab-under, popup-hijack or Strict rules applies; those are checked first, so a provider address can't be used to launder them. A suspicious navigation to **the same site** isn't cancelled, because sites hop between their own pages all the time. In both cases the worker follows the tab for 8 s, judging only real redirect hops: if it ends up on an unrelated site (a same-site redirector, or a sign-in page that forwards on elsewhere), the tab is sent back.

### Smart or Strict: the one trade-off

Smart mode lets a script move the tab to another site **more than about 5 seconds after your last click**, as long as none of the rules above applies. That keeps checkouts and bank hand-offs working, which often redirect after a wait. The price is that an ad script patient enough to wait out that window gets through in Smart. **Strict** closes the gap: once you have interacted with a page, no script may send the tab to another site on its own, however long it waits, and that includes sign-in and payment pages (a redirect made directly by the button you clicked, while the click is being handled, still works). Use Smart as the everyday setting and Strict for sites you don't trust.

### Architecture

```mermaid
flowchart LR
  subgraph Page["Web page (every frame)"]
    PG["page and ad scripts"]
    I["inject.js<br/>MAIN world<br/>hooks only"]
    B["bridge.js<br/>isolated world<br/>decides, mints tokens,<br/>redirect guards"]
  end
  BG["background.js<br/>service worker<br/>tokens, backstop, log, stats"]
  P["popup<br/>counter, modes, blocked list"]
  S[("chrome.storage<br/>local: modes, counter<br/>session: per-tab log")]

  PG -- "window.open, click(), submit()" --> I
  I -- "1. ask (nonce channel)" --> B
  B -- "2. verdict" --> I
  B -- "3. allow token bound to URL / blocked" --> BG
  B -- "reads mode" --> S
  BG -- "writes log, count, counter" --> S
  P <--> S
  BG -. "4. closes new tabs with no token" .-> X(("new tab"))
```

1. **`inject.js` (page's MAIN world) only hooks.** It wraps the APIs that open tabs (`window.open`, `click()` on links, `dispatchEvent(click)` on HTML and SVG links, `form.submit()`, Document Picture-in-Picture) and synchronously asks the bridge for a verdict over a private channel. The channel's 128-bit nonce is exchanged once at `document_start`, before any page script runs, and never re-broadcast. All built-ins it uses are captured up front.
2. **`bridge.js` (isolated world) decides.** Pages can't see or tamper with this world, so it judges with clean APIs, tracks your clicks itself, runs the redirect and form-submit guards, and tells the background when you press inside an embedded frame.
3. **Only the bridge mints allow tokens**, each bound to the URL it is for: to the site for script opens, to the exact page for links you click. The background worker accepts them only from PopShield's own scripts, keeps them for 3 s (8 s for right-click "Open link in new tab"), at most 4 per tab.
4. **The backstop** closes any new tab that arrives without a fitting token. When the decision rested on weaker evidence (a framework or `await` hint, a decoy link), it follows the new tab for 8 s and closes it if it lands on an unrelated site.

So if a hostile page manages to subvert `inject.js`, the worst it gets is skipping the early block: the backstop still closes any tab the bridge didn't approve. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design.

### Protection layers

| Layer | Where | Stops |
|---|---|---|
| `window.open` hook | page world, every frame | scripted popups and popunders, same-page tab-unders |
| `a.click()`, `dispatchEvent(click)` (HTML and SVG links), `form.submit()` hooks | page world | fake clicks on `_blank` links and forms |
| Document Picture-in-Picture hook | page world | always-on-top `requestWindow()` windows |
| Fresh-iframe patching | page world | grabbing an unhooked `window.open` from a new iframe |
| Verdict and token minting | isolated world (`bridge.js`) | everything above; the page can't forge an approval |
| Overlay-click guard | isolated world, capturing listener on `window` | invisible full-page `<a target=_blank>` ad layers, decoy links in pinned ad boxes, links re-pointed to another site between your press and your click |
| Native form-submit guard | isolated world | `_blank` forms submitted by `requestSubmit()`, a scripted submit-button click, a button re-wired to another form between press and click, or anything other than your own click / Enter in that task |
| Redirect guard (Navigation API) | isolated world, top frame | click-hijack, timer-after-click, tab-under and popup-hijack redirects; in Strict, any script redirect to another site after you've interacted |
| Frame-takeover check | background worker (`webNavigation.onCommitted`), fed by the bridge in every frame | a cross-site embedded frame doing `top.location = ad` right after you press inside it (the tab is sent back) |
| Backstop | background worker (`webNavigation.onCreatedNavigationTarget`) | any new tab the bridge didn't approve is closed; a tab opened from a link whose address a script swapped is replaced by the page you clicked |
| Redirect-chain follower | background worker (`webNavigation.onCommitted`) | a weakly-approved new tab, a same-site hop or a sign-in/payment hand-off that redirects on to an unrelated site within 8 s |

### Modes

Set per site from the toolbar popup. A default for all other sites is at the bottom of the popup.

| Mode | What it does |
|---|---|
| **Smart** *(default, the normal setting)* | The rules above. Blocks tabs, popups and redirects that ad scripts trigger; new tabs you open yourself still work. A script redirect more than ~5 s after your last click is allowed, so checkouts and bank hand-offs keep working. |
| **Strict** *(maximum protection)* | No script may open a tab at all, and once you've interacted with the page no script may send the tab to another site, however long it waits, sign-in and payment pages included. Links you click yourself, ctrl / middle-click, "Open link in new tab" and forms you submit still work. |
| **Off** | PopShield does nothing on the site. |

Embedded frames, such as a widget from another domain, follow the mode of the page that contains them. A mode you pick for a site in an incognito window applies to incognito tabs only and is kept in memory, never on disk.

## 🔬 Results in the test suite

PopShield's results are the results of its test suite, and you can reproduce them with `npm test`. Every scenario is a local test page served from your own machine, with one address standing in for "the site" and another for "the ad". No third-party website is contacted, named or measured.

Each attack runs twice in real headless Chromium. The first run has no extension and leaves Chromium's own popup blocker on. This baseline has to show the attack getting through, otherwise the test would prove nothing. The second run loads PopShield and has to show the attack stopped. A run passes only when every line of this table holds:

| Scenarios | Plain Chromium, popup blocker on | With PopShield |
|---|---|---|
| 78 attacks | 76 get through. Chromium itself already refuses the other 2 (a popup opened through a fresh hidden iframe). | 77 are stopped; a tab taken over by an embedded frame is sent back to the original page. 1 gets through in Smart mode by design. |
| 9 of those attacks again, in Strict mode | not run again | All 9 are stopped, including the one Smart lets through. |
| 27 legitimate patterns (Share buttons, `_blank` links, a `target=_top` link inside a frame, forms, downloads, framework handlers, opens after `await`) | All work. | All still work, and nothing is logged as blocked. |
| 7 mode checks (Off, Strict, an override for one site) | not applicable | Each behaves as set. |

The one attack that gets through is the documented Smart-mode trade-off: a script that waits more than about 5 seconds after your click and then redirects the tab, which looks the same as a payment page handing you off to your bank. The suite keeps it as a known bypass, prints it on every run, and checks that Strict blocks it ([details](#smart-or-strict-the-one-trade-off)).

These numbers describe the test pages in this repository. They are not a measurement of any website, and pages in the wild differ; see [Known limitations](#-known-limitations).

## 🔒 Privacy

**PopShield keeps no browsing history. The only site names it saves are the ones you choose a mode for; everything else is an anonymous count.**

- **The counter is anonymous.** `chrome.storage.local` holds the total number of blocks, the count per day (last 30 days) and the count per kind of block, plus the date counting started. No site, URL or page address is part of it. **Reset stats** in the popup clears it.
- **The per-page list stays in the tab.** What was blocked on a page lives in `chrome.storage.session` under that tab only: up to 50 items, each with the blocked address and the address of the page or frame it came from without its query string, and, for a blocked ad link laid over the page, up to 120 characters of the link's text. The list is cleared when you go to a new page or close the tab (reloads and in-page route changes keep it), and when the browser exits.
- **Working memory is short-lived.** To follow a redirect chain or match a new tab to your click, the background worker holds the address or site involved for a few seconds (up to 8 s for a right-click "Open link in new tab"), plus a timestamp of when each tab last opened a tab. This lives only in the worker's memory, is never written to storage, and is dropped when the tab closes or the worker stops.
- **Your settings.** The default mode and the per-site modes *you chose* (for example `example.com → Strict`) are stored in `chrome.storage.local`. A site appears there only if you set a mode for it; these are the only site names PopShield saves. Modes you choose in incognito are kept only in memory (`chrome.storage.session`) and forgotten when the browser exits.
- **No telemetry, no analytics, no remote code, no remote lists.** PopShield's own code makes no network requests (a CI check searches the source for network APIs), the developer receives no data from it, and all decisions are made locally.
- **Reports go to GitHub, and only when you ask.** The Report buttons first show what will be shared. If you continue, they open github.com in a new tab with an issue form filled in from the address: the page's address (origin and path only, nothing after `?` or `#`), your mode, the Chrome and PopShield versions, and the types and ad hostnames of what was blocked. GitHub receives those details as soon as the tab opens. Nothing becomes public unless you sign in and submit the form. The Report buttons are hidden in incognito windows.
- **No share or social features.**
- **Pages can tell PopShield is there.** Like most extensions that change page behaviour, its effects (a blocked popup, a wrapped function) are observable, so a site could detect it and use that as one more fingerprinting signal. PopShield tells sites nothing about you, but it does not try to hide.

Full policy: [PRIVACY.md](PRIVACY.md).

<details>
<summary><b>Permissions and why each one is needed</b></summary>

<br>

| Permission | Why |
|---|---|
| `storage` | Save your default mode and per-site modes and the anonymous block counter; keep the per-tab blocked list and badge count for the popup. |
| `webNavigation` | `onCreatedNavigationTarget` tells the backstop which tab opened a new tab, so tabs without a token can be closed. `onCommitted` resets the per-tab list when a tab loads a new page and, for a few seconds after a doubtful approval, shows where a followed tab lands. Chrome's own warning for this permission reads "Read your browsing history", because it lets an extension see tab navigations as they happen; PopShield uses those events only for these jobs and stores none of them. |
| Host access `<all_urls>` | The content scripts must run at `document_start` in **every frame of every site**, before any ad script, so that `window.open` and friends are hooked first. Ads appear on arbitrary sites and inside frames embedded from other sites. |

PopShield does not request `tabs`, `scripting`, `webRequest`, `cookies` or `history`. The `chrome.dom` API it uses to find links inside closed shadow roots needs no permission.

</details>

## 🔐 Security

PopShield assumes the page is hostile: ad scripts can install listeners anywhere, create overlays and iframes, and poison any built-in function in the page's JavaScript world.

- **Nothing in the page's world decides.** `inject.js` only hooks and asks. The verdict, every allow token, the redirect guards and the block log come from `bridge.js` in the isolated world, which the page can't reach.
- **Private channel.** The 128-bit nonce is exchanged once at `document_start`, before any page script exists, and never re-broadcast.
- **Defence in depth.** If a page subverts `inject.js`, the worst it gets is skipping the early block; the backstop still closes any tab the bridge didn't approve.
- **A strict worker.** `background.js` trusts only messages from PopShield's own scripts, whitelists the kinds and reasons in the log, rate-limits per tab, takes the frame address from Chrome (`sender.url`, origin and path only), and binds, caps and expires tokens.
- **Exact sign-in and payment exemptions.** Only listed provider hosts and paths are exempt, never a whole domain, a multi-tenant domain or an address with a `client_id=` parameter, and the exemption is checked after the tab-under, popup-hijack and Strict rules.
- **Reviewed, not independently audited.** Several internal security and performance review rounds by the author; no independent third-party audit has been done. In our own benchmarks, a click costs PopShield about 0.1 ms, with no forced layouts and no leaks observed.
- **Residual risk.** A page that fakes framework data on the element you click, specifically to fool PopShield, can still get the framework exemption. For React this now has to be done before you press (props planted by the page's own press handler are ignored); Solid- and jQuery-shaped handlers aren't snapshotted. The bridge then approves the open. Because that approval rests on a hint, the worker follows the new tab and closes it if it bounces on to a site other than the page's or the approved address's, but an open straight to the ad's own address still gets through.

Threat model: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#threat-model). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

**Supply chain.** CI and release workflows pin every action to a commit SHA, check out with `persist-credentials: false` and install with `npm ci --ignore-scripts`. A release is built and tested by a read-only job; a separate minimal job publishes the GitHub Release with a build-provenance attestation.

## ⚖️ Comparison

PopShield's niche is **click-triggered** popups. Its goal is to block them without asking you to approve each tab and without breaking the tabs you open on purpose.

| Scenario (test name) | Chromium's built-in blocker (in this repo's baseline tests) | PopShield (Smart) |
|---|:---:|:---:|
| Popunder from a page-wide click hook (`doc-click-popunder`) | ❌ allowed | ✅ blocked |
| Invisible overlay or max z-index ad layer over the page (`overlay-anchor`, `ad-layer-tab-under`) | ❌ allowed | ✅ blocked |
| Tab-under or click-hijack redirect of the current tab (`tab-under`, `click-redirect`) | ❌ allowed | ✅ blocked (frame hijacks: tab sent back) |
| Popup opened through a fresh hidden iframe during a click (`iframe-pristine-open`) | ✅ blocked | ✅ blocked |
| Share button or `_blank` link you click (`legit-button-open`, `legit-blank-link`) | ✅ works | ✅ works |

The middle column records what plain Chromium did, with its popup blocker on, in this repository's baseline runs on local test pages; `npm test` prints it for every scenario. It is not a statement about every Chrome version, setting or website.

Other blockers use allow-lists, block every new tab, or rely on remote lists; PopShield's difference is the intent model. PopShield isn't a content blocker. For banner ads, trackers and fake download buttons, use it **alongside** a list-based blocker.

## 🚧 Known limitations

- **Ads disguised as real links.** An ad that is a plain `<a href=ad target=_blank>` styled as the site's own button (for example a fake "Direct Download" button), which you really click, is out of scope. Catching it needs a list of ad domains: pair PopShield with a content blocker.
- **Fake in-page dialogs and ads aren't hidden.** PopShield stops tabs and redirects; it doesn't remove page content.
- **Pages written against PopShield.** A page that fakes framework data on the element you click can get the framework exemption. React props must already be there when you press, so this takes planning ahead; an open straight to the ad's address then gets through, because the bridge does approve. In the same way, a page can make non-clickable content look clickable (for example with a pointer cursor) to get past the check for listeners on non-clickable content.
- **Smart mode allows patient redirects.** A script that waits more than about 5 seconds after your last click and then sends the tab to another site is allowed in Smart, so that payment pages handing off to a bank keep working. Strict blocks it. This is a deliberate trade-off, and the test suite reports it as an accepted known bypass rather than hiding it.
- **Opens after `await` to arbitrary third-party sites** are blocked; only the same site and the listed sign-in / payment flows of known providers pass; a provider not on that exact list is treated like any other site. Opens scheduled with `setTimeout` or `.then()` are blocked too. Use **Open** in the popup, or set the site to Off.
- **Cross-site script redirects right after a click** (for example a timer that sends you to a partner site) are blocked, unless they go to a sign-in or payment page. So is a cross-site script redirect within 60 s of the tab opening another tab, until you press something again.
- **Delegation on a full-page container.** A plain listener on a wrapper that covers 40% or more of the page and opens windows is treated as page-wide unless it belongs to a recognised framework (React, Solid, jQuery).
- **Cross-site popups from non-clickable content.** A site that opens a popup to another site from a listener on plain text or an image, with no link, button or pointer cursor in between, is blocked in Smart. Use **Open** in the popup.
- **Detectable.** Pages can detect that PopShield is installed (see [Privacy](#-privacy)).
- **Embedded-frame hijacks are undone, not prevented.** A cross-site frame doing `top.location = ad` can't be cancelled before it starts, so the other site may begin loading for a moment before PopShield sends the tab back. Going back reloads the page you were on, so anything you hadn't saved on it (a half-filled form, your place in it) can be lost. PopShield never shows a "leave this page" prompt, so closing a tab or typing an address is never interrupted.

Found a site where ads get through, or where something legitimate is blocked? Use the **Report** buttons in the popup, or see [CONTRIBUTING.md](CONTRIBUTING.md#reporting-a-site-where-ads-still-get-through).

## 🧪 Testing

```bash
npm install
npx playwright install chromium
npm test
```

`npm test` runs two suites in a real (headless) Chromium with the unpacked extension loaded and Chrome's own popup blocker left on. Both use only local test pages (`localhost:8711` and `127.0.0.1:8712`); no public website is contacted.

| Suite | What it does |
|---|---|
| `test/run.mjs` (e2e, 121 scenarios, 225 counted checks, about 50 s) | Runs each attack scenario first **without** the extension, to record what Chrome alone does and prove the attack works, then **with** PopShield, checking that every attack is blocked, every legitimate pattern still works, and nothing else gets logged. Both passes run at once in parallel browsers (`E2E_WORKERS` overrides the automatic count). |
| `test/popup-ui.mjs` | Triggers real blocks, then checks the badge count, the blocked list, the mode buttons, per-site overrides, the Report confirmation and the pre-filled address it would open (captured inside the test, so GitHub is never contacted) and the Open button. Saves light and dark screenshots to `test/screenshots/`. |

<details>
<summary><b>What the e2e suite covers</b></summary>

<br>

**Attacks (must be blocked):** popunders from `document` click, `window` mousedown and `<body>` pointerup hooks · a popunder on a page-sized wrapper element · invisible overlay links and overlay listeners · scripted `_blank` anchors (timer, `dispatchEvent`, SVG links) · scripted `_blank` form submits and submit-button clicks · pristine `window.open` from fresh iframes and `frames[i]` · tab-under and click-hijack redirects, `window.open(_self)` redirects · timer popups · popups and top-frame hijacks from a cross-site embedded frame (including a second click later) · a jQuery `*` delegated popunder · a popunder on a React 16 site · page-wide hooks that open after `await` or in `.then()` · an element handler that opens a third-party site after `await` · a max z-index ad layer over a Continue button · a same-page tab-under from an element handler · decoy-link `href` swaps and ad-box frames · retry loops · the backstop closing a tab opened through an unhooked JS world.

**Red-team regressions:** 58 scenarios written during three internal red-team rounds, each an attempt to get past PopShield: poisoned built-ins, forged stack traces and spoofed receivers, a leaked channel nonce, planted React props and fake jQuery, overlays hidden behind transparent text, transparent gradients, grid stacking, closed shadow roots or a parent's opacity, overlays and wrappers that change between press and click, near-invisible cross-site frames, scripted and keystroke-triggered form submits, tab-unders that wait, hop to another page of the same site or ride on a link you clicked, same-site redirectors, links whose address is swapped during the click, and hijacked popups. Several run in Strict mode too.

**Legitimate patterns (must keep working):** button `window.open` · React root listeners, React 16 and 17+ (sync and after `await`) · jQuery delegated handlers · `_blank` links, ctrl- and middle-click, big image links, `#top` links, chat-widget links · scripted anchors from element handlers · downloads · same-site, on-load and link navigations · a `target=_top` link you click inside an embedded frame · leaving or reloading the page after clicking inside an embedded frame · `_blank` forms via click and Enter · `window.open` after `await` · buttons in a max z-index consent modal.

**Modes:** Off allows popunders and redirects, Strict blocks scripted popups while real links, ctrl+click and links inside closed shadow roots still work, and a per-site Off override applies only to its site.

**Known bypasses** are cases marked `knownBypass`: they still run and are reported (`OPEN` while PopShield doesn't stop them, `FIXD` once it does), but they don't fail the run. Only one remains: the patient redirect in Smart mode described under [Known limitations](#-known-limitations), which is an accepted trade-off; its Strict twin must and does pass.

</details>

> [!TIP]
> On very new Node versions (v26), `npx playwright install` can hang while unzipping. If that happens, unzip the downloaded archive from `/tmp` into `~/.cache/ms-playwright/chromium-<rev>/` yourself.

## 📁 Project structure

```text
popshield/
├── manifest.json          # MV3 manifest: content scripts in every frame at document_start
├── icons/                 # toolbar and store icons (16, 32, 48, 128)
├── src/
│   ├── inject.js          # page (MAIN) world: API hooks only; asks the bridge, supplies two hints
│   ├── bridge.js          # isolated world: verdicts, allow tokens, overlay/form/redirect guards, frame-press relay
│   ├── common.js          # shared helpers: site parsing, per-site modes, sign-in/payment flow list
│   ├── background.js      # service worker: tokens, new-tab backstop, redirect-chain follower, badge, per-tab log, local counter
│   ├── popup.html         # toolbar popup UI (light + dark)
│   ├── popup.js           # counter + sparkline, per-site mode, blocked list, Report / Feedback
│   └── welcome.html       # first-install welcome page
├── test/
│   ├── run.mjs            # e2e suite: baseline vs. with-extension
│   ├── popup-ui.mjs       # popup UI test + screenshots
│   ├── server.mjs         # serves fixtures on localhost:8711 ("site") and 127.0.0.1:8712 ("ad network")
│   └── fixtures/          # attack and legitimate scenario pages
└── docs/                  # LEARN.md + learn/ (guide from zero), ARCHITECTURE.md (reference), RELEASING.md, assets/
```

## 🤝 Contributing

Bug reports, site reports (ads getting through, or legitimate tabs blocked) and new test scenarios are very welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](SECURITY.md).

## 🙌 Credits

Built by Madhevan Ramalingam with coding help from Claude.

## 📄 License

[MIT](LICENSE). One file is the exception: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) is adapted from the Contributor Covenant and stays under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

PopShield is an independent project, not affiliated with or endorsed by Google or any company named here. Google Chrome and Chromium are trademarks of Google LLC; other names belong to their owners and are used only to describe compatibility.
