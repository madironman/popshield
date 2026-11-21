# Part II · How a browser extension works

[Index](../LEARN.md) · [Part 0](00-basics.md) · [Part I](01-attacks.md) · **Part II** · [Part III](03-popshield.md) · [Part IV](04-decisions.md) · [Part V](05-contributing.md) · [Glossary](glossary.md)

PopShield is a browser extension. Before we look at how it fights the tricks
from Part I, this part explains what an extension is, where its code runs,
and what it is allowed to do.

- [1. Add-ons with special powers](#1-add-ons-with-special-powers)
- [2. PopShield's manifest, line by line](#2-popshields-manifest-line-by-line)
- [3. Where an extension's code runs](#3-where-an-extensions-code-runs)
- [4. Two worlds inside one page](#4-two-worlds-inside-one-page)
- [5. Getting there first](#5-getting-there-first)
- [6. What PopShield is allowed to do](#6-what-popshield-is-allowed-to-do)
- [7. Trying PopShield in your own browser](#7-trying-popshield-in-your-own-browser)

---

## 1. Add-ons with special powers

An **[extension](glossary.md#extension)** is a small add-on program that you
install into your browser. It is made of the same ingredients as a web page
(HTML, CSS, JavaScript), plus one description file. What makes it different
from a page is that the browser gives it extra abilities: it can run code
inside the pages you visit, react to things the browser does (like "a tab just
opened a new tab"), and keep its own settings. Each of these abilities has to
be requested up front, as a **[permission](glossary.md#permission)**.

Chrome extensions follow a set of rules called
**[Manifest V3](glossary.md#manifest-v3)** (MV3), the current version of the
extension platform. Two MV3 rules matter for PopShield:

- The extension's background code is a **service worker**: it starts when
  something needs it and is shut down when idle (chapter 3).
- An extension may not download and run code from the internet. All its code
  ships inside the package, where reviewers can read it. PopShield goes
  further: it never contacts the internet at all.

PopShield has no "build step": the files in the repository are exactly the
files Chrome runs. You can read every line that runs in your browser.

### Check your understanding

1. What makes an extension different from a normal web page?

<details><summary>Answer</summary>

The browser gives it extra abilities, such as running code inside other pages
and reacting to browser events, each requested as a permission.

</details>

## 2. PopShield's manifest, line by line

Every extension has a **[manifest](glossary.md#manifest)**: a file called
`manifest.json` that tells the browser what the extension is, what it needs
and which code to run where. It is written in JSON, a simple format of
labelled values in curly braces. Here is PopShield's, slightly shortened
(the icon lists are left out), with a comment on every line:

```jsonc
{
  "manifest_version": 3,                    // follow the Manifest V3 rules
  "name": "PopShield",                      // the name shown in Chrome
  "version": "0.1.0",                       // the version number
  "minimum_chrome_version": "119",          // refuse to install on older browsers
  "permissions": [                          // abilities PopShield asks for:
    "storage",                              //   keep settings and counters in the browser
    "webNavigation"                         //   be told when a tab opens a new tab or loads a page
  ],                                        // end of the list
  "host_permissions": ["<all_urls>"],       // may run on every website
  "background": {                           // the background program:
    "service_worker": "src/background.js"   //   this file, run as a service worker
  },                                        // end of background
  "action": {                               // the toolbar button:
    "default_popup": "src/popup.html"       //   clicking it shows this small page
  },                                        // end of action
  "content_scripts": [                      // code to run inside web pages:
    {                                       // first group:
      "matches": ["<all_urls>"],            //   on every site
      "js": ["src/common.js", "src/bridge.js"], // these two files, in the extension's private world
      "run_at": "document_start",           //   before any of the page's own scripts
      "all_frames": true,                   //   in every frame, not only the top one
      "match_origin_as_fallback": true      //   including blank and script-built frames
    },                                      // end of first group
    {                                       // second group:
      "matches": ["<all_urls>"],            //   on every site
      "js": ["src/inject.js"],              //   this file...
      "world": "MAIN",                      //   ...in the page's own world
      "run_at": "document_start",           //   before any of the page's own scripts
      "all_frames": true,                   //   in every frame
      "match_origin_as_fallback": true      //   including blank and script-built frames
    }                                       // end of second group
  ]                                         // end of content scripts
}
```

Don't worry if some lines don't make sense yet. "World", `document_start` and
`match_origin_as_fallback` each get their own chapter below.

### Check your understanding

1. Which file runs when you click PopShield's toolbar button?
2. How many groups of content scripts does PopShield declare, and how do they
   differ?

<details><summary>Answers</summary>

1. `src/popup.html` (with its script, `src/popup.js`).
2. Two. Both run everywhere, early, in every frame; the first
   (`common.js` + `bridge.js`) runs in the extension's private world, the
   second (`inject.js`) in the page's own world.

</details>

## 3. Where an extension's code runs

An extension's code lives in three different places, each with different
abilities.

**Inside web pages.** A **[content script](glossary.md#content-script)** is
extension code that the browser runs inside the pages you visit. It can see
and change the page's DOM, just like the page's own scripts. PopShield has
three: `inject.js`, `bridge.js`, and a small shared helper, `common.js`.

**In the background.** The **[service worker](glossary.md#service-worker)**
(`background.js`) is the extension's behind-the-scenes program. It has no page
and no screen. The browser wakes it when something it cares about happens (a
message arrives, a tab opens a new tab) and may put it to sleep when idle. So
it must not rely on remembering things for long; anything important goes into
storage. PopShield's service worker is its last line of defence, the
"backstop" you'll meet in Part III.

**In the toolbar.** The **[popup](glossary.md#extension-popup)** (not to be
confused with ad popups) is the small page that appears when you click the
extension's button. PopShield's shows how much it has blocked, what it blocked
on the current page, and the mode switch.

Content scripts and the service worker can't call each other directly. They
send **[messages](glossary.md#message)**, like notes passed under a door,
through the browser's `chrome.runtime.sendMessage`.

### Check your understanding

1. Why can't the service worker keep important information in memory?

<details><summary>Answer</summary>

Chrome may shut it down when it's idle; memory is lost when that happens.

</details>

## 4. Two worlds inside one page

This is the most important idea in Part II.

Every page has a JavaScript **[world](glossary.md#world)**: its global object
(`window`), all the built-in tools and their shared toolboxes (the prototypes
from [Part 0](00-basics.md#5-reading-just-enough-javascript)), and every
variable the page's scripts create.

A content script can run in one of two worlds:

- The **[isolated world](glossary.md#isolated-world)** (the default). Think of
  it as a **soundproof room with a one-way window** built into the page. From
  inside, the extension can see the page's DOM and the events flowing through
  it. But it has its own copy of every tool and toolbox, and nobody outside
  can reach in. If the page swaps a tool in its own toolbox, the soundproof
  room's copy is untouched. Only code in this room can use the extension's
  special `chrome.*` abilities (storage, messages).
- The **[MAIN world](glossary.md#main-world)**: the page's own world. Code here
  sits at the same table as the page's scripts. It can replace `window.open`
  *for the page*, which is something the isolated world can't do. The price:
  the page can see and tamper with everything there, including the shared
  toolboxes, and there are no `chrome.*` abilities.

```text
 ┌──────────────────────── one frame of a web page ────────────────────────┐
 │                                                                          │
 │   MAIN world (shared table)             isolated world (soundproof room)  │
 │   ┌───────────────────────────┐         ┌──────────────────────────────┐  │
 │   │ page scripts, ad scripts  │         │ bridge.js + common.js         │  │
 │   │ inject.js                 │  ◄────► │ own clean tools               │  │
 │   │ shared, swappable tools   │  DOM    │ chrome.* abilities            │  │
 │   └───────────────────────────┘ events  └──────────────────────────────┘  │
 │                         both see the same DOM tree                        │
 └──────────────────────────────────────────────────────────────────────────┘
```

The two worlds share only the DOM. To talk, they leave messages on it:
**[custom events](glossary.md#custom-event)**, events that scripts invent and
send themselves, dispatched on `document`.

That's why PopShield has two kinds of content script: `inject.js` in the MAIN
world, because only there can it intercept `window.open`, and `bridge.js` in
the isolated world, where nobody can tamper with it. Part III explains how the
work is divided between them, and why.

### Check your understanding

1. Why can't PopShield do everything from the isolated world?
2. Why not do everything from the MAIN world?

<details><summary>Answers</summary>

1. The isolated world has its own `window`, so replacing `window.open` there
   doesn't affect the page's `window.open`.
2. The page can see and tamper with everything in the MAIN world, and code
   there has no access to the extension's `chrome.*` abilities.

</details>

## 5. Getting there first

Three manifest settings make sure PopShield is in place before any ad.

**`run_at: "document_start"`** runs the content scripts the moment a page's
document is created, before any of the page's own scripts. If an ad script ran
first, it could save its own copy of the real `window.open`, and a hook
installed later would be useless. Running first also lets PopShield's two
scripts agree on a secret before any page script exists (Part III).

**`all_frames: true`** runs them in every frame, not only the top page. Ads
love frames, especially video players.

**`match_origin_as_fallback: true`** covers frames that have no normal web
address: blank frames (`about:blank`), frames whose content is written by a
script, and a few other special kinds. Without it, the blank frame from
"Borrowing a clean `window.open`" in Part I would have no PopShield inside.

### Check your understanding

1. What could an ad do if it ran before PopShield?

<details><summary>Answer</summary>

Save the real `window.open` before PopShield wraps it, and use that copy later.

</details>

## 6. What PopShield is allowed to do

PopShield asks for three permissions. Each one is the smallest that does the
job.

| Permission | What it lets PopShield do | Why it's needed |
|---|---|---|
| `storage` | keep data inside your browser | your mode choices, an anonymous counter of blocks, and the per-tab list of what was blocked |
| `webNavigation` | be told when a tab opens a new tab, and when a tab lands on a new page | the backstop closes tabs nobody approved; for a few seconds after a doubtful approval, it checks where a tab actually lands; the per-tab list is reset on a new page |
| access to all sites (`<all_urls>`) | run content scripts on every page and frame | ads appear on any site and inside frames from other sites |

PopShield doesn't ask for your browsing history, your cookies, the ability to
read or change network traffic, or the ability to inject scripts on demand.
It also uses `chrome.dom`, an extension-only helper for looking inside closed
web components, which needs no permission.

### Check your understanding

1. Which permission lets PopShield close a tab a page opened by itself?

<details><summary>Answer</summary>

`webNavigation`: it tells the service worker that a tab opened a new tab, so
the backstop can close it.

</details>

## 7. Trying PopShield in your own browser

PopShield isn't in the Chrome Web Store yet, so you load it from its folder.
This is called loading an "unpacked" extension.

1. Download the project: on its GitHub page, choose **Code → Download ZIP**,
   then unzip it. (Or, if you have `git`: `git clone https://github.com/madironman/popshield.git`.)
2. In Chrome, go to the address `chrome://extensions`.
3. Turn on **Developer mode** (top right). This lets you load extensions from
   a folder.
4. Click **Load unpacked** and choose the folder that contains `manifest.json`.
5. Click the puzzle-piece icon in the toolbar and pin PopShield so its button
   is always visible.

You need Chrome, or another Chromium-based browser, version 119 or newer.
Pages that were already open need a reload before PopShield runs in them. On
first install a welcome page opens. After that, the number on PopShield's
button shows how much it blocked on the current page; click the button to see
the list.

### Check your understanding

1. Why do already-open pages need a reload?

<details><summary>Answer</summary>

Content scripts run when a page's document is created (`document_start`); a
page that was already loaded never gets that moment again until it reloads.

</details>

---

Next: [Part III · How PopShield works](03-popshield.md)
