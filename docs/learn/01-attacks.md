# Part I · How ads hijack your clicks

[Index](../LEARN.md) · [Part 0](00-basics.md) · **Part I** · [Part II](02-extensions.md) · [Part III](03-popshield.md) · [Part IV](04-decisions.md) · [Part V](05-contributing.md) · [Glossary](glossary.md)

You now know what a page is and how a click travels through it. This part
shows what ad scripts do with that knowledge. Every trick here is real, and
every one has a matching test scenario in
[`test/fixtures/scenario.js`](../../test/fixtures/scenario.js) (the name in
`code` after each trick).

- [1. Why sites let ads open tabs](#1-why-sites-let-ads-open-tabs)
- [2. Tricks that open a new tab](#2-tricks-that-open-a-new-tab)
- [3. Tricks that steal the tab you are on](#3-tricks-that-steal-the-tab-you-are-on)
- [4. Why Chrome's own popup blocker lets them through](#4-why-chromes-own-popup-blocker-lets-them-through)

In the code below, `AD` stands for the ad's web address.

---

## 1. Why sites let ads open tabs

Ad networks pay websites when an ad is shown (an *impression*) or clicked. A
whole new tab filled with an ad is impossible to miss, so this format pays
well. Sites with little other income, such as free streaming sites, link
shorteners and file hosts, add these ad scripts to their pages, and the
scripts compete to open as many tabs as they can.

The ad script runs inside the page, with the same powers as the site's own
code. It can add listeners anywhere, create elements, and call `window.open`.
The site invited it in.

### Check your understanding

1. Why does an ad script have so much power over the page?

<details><summary>Answer</summary>

The site added it to its own page, so it runs as part of that page with the
same abilities as the site's own scripts.

</details>

## 2. Tricks that open a new tab

### The page-wide click hook (popunder)

You click the video's Play button. A new tab with an ad opens.

```text
 ┌──────────── your tab ─────────────┐        ┌──────── new tab ────────┐
 │  ▶ Play   <- you click here        │  ───►  │   AD AD AD AD AD AD     │
 │  (listener on the whole document   │        │   (opened by the ad)    │
 │   hears the click too)             │        └─────────────────────────┘
 └────────────────────────────────────┘
```

```js
document.addEventListener('click', () => {   // listen to EVERY click anywhere in the page
  window.open(AD);                           // and open the ad in a new tab each time
});                                          // end of the listener
```

Remember from [Part 0](00-basics.md#6-how-a-click-travels-through-a-page): a
listener on `document` hears every click, so it doesn't matter what you
clicked. A **[popunder](glossary.md#popunder)** is the variant that then puts
your original window back in front, so the ad hides *under* it and you only
find it later. (`doc-click-popunder`, `body-pointerup-popunder`)

A sneakier version fires on `mousedown`, the moment you *press* the button,
before your click has even finished (`window-mousedown-popunder`):

```js
window.addEventListener('mousedown', () => window.open(AD), true);  // on every button press, during capture, open the ad
```

And another hides the listener on a `<div>` that wraps the whole page, instead
of on `document` itself, hoping nobody checks there (`wrapper-div-popunder`).

The most spread-out version doesn't use one big listener at all. It puts a
small listener on **every** element of the page, every paragraph, picture
and empty box, so wherever you click, one of them hears it:

```js
for (const el of document.querySelectorAll('*')) {   // every element on the page...
  el.addEventListener('click', () => window.open(AD)); // ...gets its own little ad listener
}
```

### The invisible overlay

A see-through element covers the whole page. You think you are clicking Play;
you are clicking the ad.

```text
 ┌──────────── your tab ─────────────┐
 │ ┌───────────────────────────────┐ │
 │ │  transparent link to the ad   │ │  <- sits on top, you can't see it
 │ │        ▶ Play                 │ │  <- what you see, underneath
 │ └───────────────────────────────┘ │
 └────────────────────────────────────┘
```

```html
<!-- a link to the ad, opening in a new tab (href, target),
     pinned over the whole screen (position:fixed; inset:0),
     and completely transparent (opacity:0) -->
<a href="AD" target="_blank" style="position:fixed; inset:0; opacity:0"></a>
```

(`overlay-anchor`, `overlay-div-listener`)

`position: fixed` isn't the only way to get on top. CSS grid can put two
elements in the same cell, one over the other, and negative margins or a
transform can do the same. And `opacity: 0` isn't the only way to be
invisible: text can be painted in a transparent colour, and a background can
be a "gradient" made of transparent colours. Red teams tried all of these
(`rt-grid-overlay-link`, `rt-overlay-transparent-text`,
`rt-overlay-transparent-gradient`).

### The visible ad layer

Not invisible this time: a big ad image placed on top of everything, right
over the site's own "Continue" button. The CSS property
**[z-index](glossary.md#z-index)** decides which element sits on top when
they overlap; the ad uses the largest value possible. (`ad-layer-tab-under`)

```text
 ┌──────────── your tab ─────────────┐
 │   ┌─────────────────────────┐     │
 │   │  BIG AD IMAGE (z-index  │     │  <- on top of everything
 │   │  2147483647)  [Continue]│     │  <- the real button, hidden beneath
 │   └─────────────────────────┘     │
 └────────────────────────────────────┘
```

### Fake clicks and fake forms

A script builds a hidden link and "clicks" it from code
(`synthetic-anchor-timer`, `dispatch-anchor`, `svg-link-dispatch`):

```js
const a = document.createElement('a');   // make a new link element (not shown on the page)
a.href = AD;                             // point it at the ad
a.target = '_blank';                     // ask for a new tab
a.click();                               // click it from code: the browser follows the link
```

Or submits a hidden form that targets a new tab (`form-submit-blank`,
`submit-button-click`):

```js
form.submit();   // send a hidden <form action="AD" target="_blank">, which opens the ad in a new tab
```

### Borrowing a clean `window.open`

If something has wrapped `window.open` (as a blocker would), the ad creates a
brand-new blank iframe and uses *its* untouched copy
(`iframe-pristine-open`, `frames-index-open`):

```js
const f = document.createElement('iframe');   // make a new, empty frame
document.body.append(f);                      // put it in the page so it comes to life
f.contentWindow.open(AD);                     // use the new frame's own window.open
```

### The decoy link

A visible link that says "Claim reward" with `href="#"`, which would only
reload this page. During your click, a listener swaps its address for the
ad's, so the browser opens the ad (`decoy-hash-swap`):

```js
link.addEventListener('click', (e) => {   // when the decoy link is clicked...
  e.currentTarget.href = AD;              // ...quickly change where it points, before the browser follows it
});                                       // end of the listener
```

A cousin of this: a blank iframe pinned over the page at the top z-index,
filled with a fake "confirm you are not a robot" link (`adbox-frame`).

### The swapped link

The decoy's bigger sibling. This time the link is real: it points at a real
article, and you really want it. A listener high up in the page waits for
your click and changes the address at the last moment
(`rt-link-href-swap-redirector`):

```js
document.addEventListener('click', (e) => {     // on any click anywhere...
  const a = e.target.closest('a');              // ...find the link that was clicked, if any
  if (a) a.href = '/go?to=' + AD;               // ...and point it somewhere else before the browser follows it
});                                             // end of the listener
```

The new address is on the same site as the page, which makes it look
harmless. It's a *redirector*, described below.

A variant does the swap even earlier, in the moment between pressing the
mouse button and releasing it. Your finger is already down on the link, so
your mind is made up; the script changes where the link goes, or, for a
button, quietly attaches it to a different, hidden form that opens the ad.
When you let go, the browser obeys your genuine click and goes to the ad.

### Check your understanding

1. Why does the ad's `document` listener fire when you click the Play button?
2. In the invisible overlay, which element did you really click?

<details><summary>Answers</summary>

1. The click bubbles up from the button to `document`, and every listener on
   the route hears it.
2. The transparent link on top, not the Play button you could see.

</details>

## 3. Tricks that steal the tab you are on

Some ads don't open a new tab. They take the one you're using.

### The click-hijack redirect

A **[redirect](glossary.md#redirect)** is when a page sends your tab to a
different address. On click, the ad sends your tab to the ad
(`click-redirect`, `open-self-redirect`):

```text
 ┌── your tab ──┐   click   ┌── same tab ──┐
 │  ▶ Play      │  ──────►  │  AD AD AD    │   (your page is gone)
 └──────────────┘           └──────────────┘
```

```js
document.addEventListener('click', () => {   // on any click anywhere...
  location.href = AD;                        // ...send this tab to the ad
});                                          // end of the listener
```

### The tab-under

The clever one. The ad opens *your page* again in a new tab, which comes to
the front, so it looks as if nothing happened. Meanwhile it turns the original
tab, now behind, into an ad (`tab-under`, `element-tab-under`):

```text
 before:  [ your page ]
 after:   [ AD AD AD ]  [ your page (copy, in front) ]
             ▲ the original tab, now an ad, waiting behind
```

```js
document.addEventListener('click', () => {   // on any click...
  window.open(location.href);                // ...open a copy of this very page in a new tab
  location.href = AD;                        // ...and send the original tab to the ad
});                                          // end of the listener
```

### The tab-under that waits

A tab-under doesn't have to happen in the same instant. The ad can wait for
any new tab to leave yours, even one you opened yourself with a real link,
and only then turn the tab you left behind into an ad
(`rt-tabunder-after-user-link`). It can wait a few seconds so that "right
after the click" is over (`rt-delayed-tab-under`). It can even move your tab
to another page of the same site first, hoping a fresh page forgets what just
happened, and redirect from there (`rt-tabunder-samesite-hop`).

### The redirector bounce

A **[redirector](glossary.md#redirector)** is a page whose only job is to
forward you somewhere else. Many sites have one, for example
`/go?to=<address>`, to count clicks on outgoing links. To a blocker that asks
"is this move staying on the same site?", a redirector looks innocent: it
*is* on the same site. A moment later, it forwards you to the ad
(`rt-redirector-navigation`, `rt-async-forge-redirector`):

```text
 your tab:  [ site.example/watch ] ──script──► [ site.example/go?to=AD ] ──forwards──► [ AD ]
                                                ▲ same site: looks harmless
```

The same bounce works on a new tab.

### The popup hijack

You click "Sign in with ...", and a small sign-in popup opens, as it should.
Before you touch it, a script sends the popup somewhere else.

```text
 [ your page ] ──► [ popup: sign-in ] ──(script)──► [ popup: AD ]
```

Sign-in pages are an attractive disguise in general. A blocker has to let
pages move you to a sign-in or payment page without a fresh click (logging
in and paying often work that way), so an ad that can make its address
*look* like one gets a free pass. Tricks include adding `?client_id=...` to
any address, or renting a sub-address on a sign-in service that gives one to
every customer.

### The hijack from inside the video player

The video player is a frame from another site ([Part 0, chapter 3](00-basics.md#3-pages-inside-pages)).
Its own ad script can navigate the **whole tab**, using `top`, the name for the
top frame (`player-iframe-top-redirect`):

```js
// this code runs inside the player frame
document.addEventListener('click', () => {   // on any click inside the player...
  top.location.href = AD;                    // ...send the whole tab (the top frame) to the ad
});                                          // end of the listener
```

### Check your understanding

1. In a tab-under, which tab ends up showing the ad?
2. Why can the player frame redirect the whole tab?
3. Why does a redirector on the same site fool a rule that only asks "is this
   move staying on the same site?"

<details><summary>Answers</summary>

1. The original tab, which is now behind the copy of your page.
2. A frame is allowed to navigate the top frame, even across sites, so the
   player's script can send the whole tab elsewhere.
3. The rule only looks at the first address. The redirector's address is on
   the same site, so it passes; the forward to the ad happens afterwards.

</details>

## 4. Why Chrome's own popup blocker lets them through

Chrome already has a popup blocker. It relies on
**[user activation](glossary.md#user-activation)**: a page may open a popup
only shortly after you did something (clicked, pressed a key, tapped). This
stopped the oldest trick, popups that open by themselves when a page loads.

Now look back at every trick above. **They all run inside a real click.**
Chrome asks *"did the user just do something?"*, and the answer is yes. It
doesn't ask *"did the user click on something that is supposed to open a
tab?"*

That missing question is PopShield's whole job.

> PopShield's test suite proves this for each trick: it first runs plain
> Chromium, with its popup blocker on, and checks that the attack **works**.
> Only then does it check that PopShield stops it. Two tricks
> (`iframe-pristine-open`, `frames-index-open`) are already refused by Chromium
> itself, and the tests note that.

### Check your understanding

1. What question does Chrome's popup blocker ask, and what question does it
   not ask?

<details><summary>Answer</summary>

It asks whether the user did something recently. It doesn't ask whether the
thing the user clicked was meant to open a tab.

</details>

---

Next: [Part II · How a browser extension works](02-extensions.md)
