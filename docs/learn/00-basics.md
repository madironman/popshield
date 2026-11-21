# Part 0 · Starting from zero

[Index](../LEARN.md) · **Part 0** · [Part I](01-attacks.md) · [Part II](02-extensions.md) · [Part III](03-popshield.md) · [Part IV](04-decisions.md) · [Part V](05-contributing.md) · [Glossary](glossary.md)

This part assumes you have never written a line of code. By the end of it you
will know what a web page really is, what your browser does when you open
one, how to read a few lines of JavaScript, and what happens inside the page
when you click. That is everything the rest of the guide builds on.

Whenever a word appears in **bold with a link**, it is being defined for the
first time, and the [glossary](glossary.md) has a short reminder of it.

- [1. What a web page is made of](#1-what-a-web-page-is-made-of)
- [2. What happens when you open a web page](#2-what-happens-when-you-open-a-web-page)
- [3. Pages inside pages](#3-pages-inside-pages)
- [4. Who is allowed to touch what](#4-who-is-allowed-to-touch-what)
- [5. Reading just enough JavaScript](#5-reading-just-enough-javascript)
- [6. How a click travels through a page](#6-how-a-click-travels-through-a-page)

---

## 1. What a web page is made of

Think of a web page as a small house.

- The **[HTML](glossary.md#html)** is the frame and the rooms: it says "here is
  a heading, here is a paragraph, here is a button".
- The **[CSS](glossary.md#css)** is the paint and the furniture layout: colours,
  sizes, and where everything sits.
- The **[JavaScript](glossary.md#javascript)** (often shortened to JS) is the
  wiring: it makes things happen when you press a switch.

Here is a complete, tiny web page. The text after each `<!-- ... -->` is a
comment: a note for humans that the browser ignores.

```html
<h1>My video</h1>                              <!-- a big heading that says "My video" -->
<button id="play">Play</button>                <!-- a button labelled Play; id="play" is its name tag -->
<a href="https://example.com" target="_blank">More</a>  <!-- a link; target="_blank" means "open in a new tab" -->
<style> button { color: red; } </style>        <!-- CSS: every button's text is red -->
<script> document.getElementById('play').onclick = () => alert('Playing!'); </script>  <!-- JS: when the button named "play" is clicked, show a message -->
```

The words in angle brackets, like `<button>`, are **[tags](glossary.md#tag)**.
A tag plus what's inside it is an **[element](glossary.md#element)**. Extra
information inside a tag, like `id="play"` or `href="https://example.com"`, is
an **[attribute](glossary.md#attribute)**. Two attributes matter a lot in this
guide:

- `href` on a link: where the link goes.
- `target="_blank"` on a link or form: "open this in a new tab".

### Check your understanding

1. Which of the three languages would you change to make a button blue?
2. What does `target="_blank"` do?

<details><summary>Answers</summary>

1. CSS, the "looks" language.
2. It tells the browser to open the link in a new tab instead of the current one.

</details>

## 2. What happens when you open a web page

You type an address, press Enter, and a page appears. In between, four things
happen.

1. **The request.** Your browser sends a message across the internet to the
   computer (a **[server](glossary.md#server)**) that hosts the address:
   "please send me this page".
2. **The response.** The server sends back the HTML text.
3. **Parsing.** The browser reads the HTML from top to bottom and builds a
   family tree of every element in memory. This tree is called the
   **[DOM](glossary.md#dom)** (Document Object Model). When the HTML mentions
   CSS or JavaScript files, the browser fetches those too, and runs each
   script as soon as it reaches it.
4. **Rendering.** Using the DOM and the CSS, the browser works out where every
   box goes and paints the result on screen.

For our tiny page, the DOM tree looks like this:

```text
document                 <- the whole page (the root of the tree)
└── html                 <- every page has one <html> element
    ├── head             <- invisible information (title, styles)
    └── body             <- everything you see
        ├── h1           "My video"
        ├── button#play  "Play"
        └── a            "More"
```

JavaScript works on this tree, not on the HTML text. It can find elements,
change them, add new ones, and react when you interact with them. This is why
an ad script, once it is running inside a page, can do almost anything to that
page.

The program that does all this is the **[browser](glossary.md#browser)**.
Google Chrome is one. Under the hood, Chrome is built from
**[Chromium](glossary.md#chromium)**, an open-source browser project that Google
leads. Chromium is the engine and most of the car; Chrome adds Google's own
parts (sign-in, automatic updates, some media features). Microsoft Edge, Brave,
Opera and others are also built on Chromium, which is why PopShield works in
all of them. PopShield's automated tests run in plain Chromium.

Your browser shows pages in **[tabs](glossary.md#tab)**, and groups tabs in
**[windows](glossary.md#window)**. A page can ask the browser to open a new tab
or window. When it does that by itself, rather than because you clicked a
link, the new tab or window is called a **[popup](glossary.md#popup)**.

### Check your understanding

1. Does JavaScript change the HTML text the server sent, or the DOM?
2. What is the relationship between Chrome and Chromium?

<details><summary>Answers</summary>

1. The DOM, the tree the browser built from that text.
2. Chrome is built from Chromium, Google's open-source browser project, plus
   some extra Google parts. Edge, Brave and Opera are built from Chromium too.

</details>

## 3. Pages inside pages

A page can contain another complete page, shown in a rectangle. This is done
with the `<iframe>` tag, and the inner page is called a
**[frame](glossary.md#frame)** (or iframe):

```html
<iframe src="https://videos.example.net/player"></iframe>  <!-- show the page at this address inside this one -->
```

Picture a TV in a living room. The TV belongs to the room, but what it shows
comes from a different place entirely. On a free streaming site, the video
player is very often an iframe loaded from a different website, with its own
HTML, its own DOM, its own JavaScript, and often its own ads.

The page in the browser tab is the **[top frame](glossary.md#top-frame)**. Every
iframe inside it, and every iframe inside those, is a **child frame**.

An iframe doesn't need an address. Scripts can create an empty one
(`about:blank`, a blank page) and fill it themselves. Ads like this trick,
because a fresh blank frame comes with its own, untouched copy of the
browser's tools. You'll see why that matters in [Part I](01-attacks.md).

### Check your understanding

1. Does an iframe share the outer page's JavaScript?
2. What is the "top frame"?

<details><summary>Answers</summary>

1. No. Each frame has its own page, its own DOM and its own JavaScript.
2. The page that fills the browser tab, the outermost one.

</details>

## 4. Who is allowed to touch what

Imagine every website is a separate company in an office building. Each
company may look inside its own offices, but not in anyone else's. Browsers
enforce exactly this, and the "company" is called an
**[origin](glossary.md#origin)**.

An origin is three things together: the scheme (`https`), the host name
(`video.example.com`) and the port (usually hidden; 443 for `https`). Two pages
have the same origin only if all three match. A script on one origin can't read
or change the DOM of a page on another origin, even if that page is an iframe
right inside it.

A **[site](glossary.md#site)** is a looser idea: roughly the registered domain
name, the part you would buy from a domain seller. `www.example.com`,
`cdn.example.com` and `video.example.com` are three origins but one site,
`example.com`. Some countries use two-part endings, so `shop.example.co.uk`
belongs to the site `example.co.uk`.

PopShield cares about sites, not origins. When a page moves you from
`www.example.com` to `checkout.example.com`, that's the same site, so it is
never treated as a hijack. When a click sends you from `example.com` to
`ad-network.example`, that's a different site, and PopShield pays attention.

### Check your understanding

1. Are `https://a.example.com` and `https://b.example.com` the same origin? The
   same site?
2. Why does PopShield compare sites rather than origins?

<details><summary>Answers</summary>

1. Different origins (the host names differ), same site (`example.com`).
2. Moving between parts of the same company's website is normal; moving to a
   different company's website is what ads do.

</details>

## 5. Reading just enough JavaScript

You won't need to write JavaScript to follow this guide, but you'll see short
pieces of it. Here is everything you need to read them. Text after `//` on a
line is a comment for humans.

**Variables** are labelled boxes that hold a value.

```js
const name = 'Play';   // a box called "name" holding the text Play (const: never refilled)
let clicks = 0;        // a box called "clicks" holding the number 0 (let: may be refilled)
clicks = clicks + 1;   // refill "clicks" with its old value plus one, so now it holds 1
```

**Functions** are named recipes: a list of steps you can run whenever you like.

```js
function greet(who) {          // a recipe called greet; "who" is filled in each time it runs
  return 'Hello ' + who;       // the result: the word Hello followed by whatever "who" is
}                              // end of the recipe
greet('Sam');                  // run the recipe with who = 'Sam'; the result is 'Hello Sam'
const shout = (x) => x + '!';  // the same idea, written the short way ("arrow function")
```

**`if`** makes a choice.

```js
if (clicks > 3) {              // if the number in "clicks" is greater than 3...
  greet('busy clicker');       // ...run this line
} else {                       // otherwise...
  greet('newcomer');           // ...run this one instead
}                              // end of the choice
```

**Objects** bundle labelled values together. A function stored inside an object
is called a **[method](glossary.md#method)**.

```js
const player = {               // an object called "player"
  title: 'My video',           // a value labelled "title"
  play() { return 'playing'; } // a method labelled "play"
};                             // end of the object
player.title;                  // read a value: gives 'My video'
player.play();                 // call a method: gives 'playing'
```

The browser hands JavaScript a lot of ready-made objects. `window` is the
browser tab's own object, `document` is the DOM tree, and
`window.open(address)` is the method that asks for a new tab or popup.
`location.href = address` sends the current tab to a new address.

**Events and listeners.** When something happens (a click, a key press, the
page finishing loading), the browser creates an
**[event](glossary.md#event)**: a small object describing what happened.
Scripts can ask to be told about events by adding a
**[listener](glossary.md#listener)**: a function the browser calls when that
kind of event reaches that element.

```js
const btn = document.getElementById('play');   // find the element whose id is "play"
btn.addEventListener('click', (event) => {     // when a click reaches this button, run this function
  btn.textContent = 'Pause';                   // change the button's text to Pause
});                                            // end of the listener
```

**`async` and `await`** let a function pause while it waits for something slow,
like a reply from a server, and carry on later.

```js
btn.addEventListener('click', async () => {    // an "async" listener: it is allowed to pause
  const reply = await fetch('/price');         // ask the server for /price and pause until it answers
  window.open('/checkout');                    // later, once the answer arrived, open a new tab
});                                            // end of the listener
```

The important part for PopShield: by the time the code after `await` runs, the
click itself is long finished. The browser has moved on.

**Prototypes: the shared toolbox.** Every object in JavaScript borrows its
methods from a shared toolbox called its
**[prototype](glossary.md#prototype)**. All buttons share one toolbox, all
events share another, all pieces of text share another. When you call
`'hello'.toUpperCase()`, the text `'hello'` doesn't have its own
`toUpperCase`; it borrows the one in the shared text toolbox.

Here is the catch: **anyone in the page can swap a tool in a shared toolbox.**

```js
String.prototype.toUpperCase = () => 'GOTCHA';   // replace the shared "toUpperCase" tool with a fake one
'hello'.toUpperCase();                           // now gives 'GOTCHA' for every piece of text in the page
```

Every script in the page, good or bad, then gets the fake tool. Keep this in
mind: it is the reason for the most important design decision in PopShield
([Part III, chapter 4](03-popshield.md#4-asking-through-the-wall)).

### Check your understanding

1. What is a listener?
2. In the `async` example, is the click still "happening" when `window.open`
   runs?
3. If a script replaces a method on a prototype, who is affected?

<details><summary>Answers</summary>

1. A function the browser runs when a certain kind of event reaches a certain
   element.
2. No. `await` paused the function; the click finished long before the code
   after it ran.
3. Every object that borrows from that prototype, so every script in the page
   that uses that tool.

</details>

## 6. How a click travels through a page

When you click a button, the browser doesn't just tell the button. It sends the
click event on a trip through the DOM tree, in three
**[phases](glossary.md#event-phase)**:

```text
           window
             │  ▲
          document
             │  ▲
           <html>
             │  ▲
           <body>
             │  ▲
          <div id="player">
             │  ▲
   1. capture│  │3. bubble
     (down)  ▼  │  (up)
          <button>   <- 2. target: the element you actually clicked
```

1. **Capture**: the event travels *down* from `window` to the button.
2. **Target**: it arrives at the button you clicked.
3. **Bubble**: it travels back *up* to `window`.

An analogy: a parcel for someone on the 5th floor of an office building. It
goes through the building's mail room, then the floor's mail room, then
arrives at the desk; the delivery receipt then travels back up the same way.
Anyone along the route who asked to be told ("let me know about every parcel
that passes through here") is told, in that order.

A listener can be attached to *any* element on the route. One added with
`{ capture: true }` hears the event on the way down; a normal one hears it on
the way up, or at the target. This means a listener on `document` hears
**every** click on the page, whatever was clicked. Remember that: it is the
favourite trick of ad scripts.

Three facts about events are central to PopShield:

- **`event.target`** is the element you actually clicked.
- **`event.currentTarget`** is the element whose listener is running *right
  now*. It changes as the event travels. If the Play button was clicked and a
  listener on `document` is running, `target` is the button but
  `currentTarget` is `document`.
- **`event.isTrusted`** is `true` only if the event came from a real person
  (a real mouse, keyboard or finger). A script can create a fake click with
  `new MouseEvent('click')`, but its `isTrusted` is `false`, and no page can
  change that.

One more: all of this happens **synchronously**, in one go. The browser runs
every listener along the route, one after another, before doing anything else.
When a listener calls `window.open`, it does so *during* the trip, so whoever
is watching can look at the event at that exact moment and ask "whose listener
is running?". Code that runs later (after a timer or an `await`) runs when
the trip is over.

### Check your understanding

1. A listener on `document` and a listener on the Play button both hear a click
   on the Play button. Which `currentTarget` does each see?
2. Can a script create a click with `isTrusted` set to `true`?

<details><summary>Answers</summary>

1. The button's listener sees the button; the `document` listener sees
   `document`.
2. No. Only real user input produces trusted events.

</details>

---

Next: [Part I · How ads hijack your clicks](01-attacks.md)
