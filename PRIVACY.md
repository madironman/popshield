# PopShield Privacy Policy

**Effective date:** 2026-11-21

PopShield is an open-source Chrome extension that blocks ad popups, popunders,
ad tabs and redirect hijacks. This policy explains what information PopShield
handles, what it keeps, and the one case in which some of it leaves your
browser. In short: **everything happens inside your browser; the developer
receives no data from it.**

> **PopShield keeps no browsing history. The only site names it saves are the
> ones you choose a mode for; everything else is an anonymous count.** The
> list of what was blocked on a page lives only in that tab: it is cleared
> when you go to a new page or close the tab (reloads and in-page route
> changes keep it), and when the browser exits. There is no telemetry and no
> remote code, and PopShield makes no network requests in the background. If
> you press **Report**, GitHub receives the details shown in the confirmation
> as soon as the tab opens; nothing becomes public unless you sign in and
> submit.

## What PopShield handles while it works

To decide whether you asked for a new tab, PopShield has to look at a few
things on the pages you visit. All of it is processed inside your browser, and
none of it is sent to the developer.

- **Page addresses.** The address of the page you are on, and of the tab or
  redirect a page asks for, so that PopShield can tell one site from another
  and apply the mode you chose for a site.
- **Your clicks and key presses.** Which element a click or key press landed
  on, and when, so that PopShield can judge whether an open or a redirect was
  caused by you. PopShield does not record what you type: for a key press it
  notes only that one happened, and it looks at the pressed element only for
  Enter and Space.
- **A little page content.** The addresses of the links and forms involved in
  an attempt to open a tab. When PopShield blocks an ad link laid over the
  page, it also keeps up to 120 characters of that link's text for the
  per-tab list.

Most of this is used for a moment and forgotten. What is kept, and for how
long, is listed under "Data stored on your device" below.

## What PopShield does not do

- It keeps no browsing history and no record of what you type.
- The developer and advertisers receive nothing from it, and it has no
  server: no analytics, no telemetry, no crash reporting and no advertising.
  Its own code makes no network requests.
- It does not download remote code, scripts or filter lists. All of its logic
  ships inside the extension package and can be read in the public source code.
- It does not use cookies or identifiers, and it does not require an account.
- It does not sell or transfer information to anyone. The only transfer is the
  one you start yourself with a Report button, described below.

## Data stored on your device

PopShield keeps three small pieces of information, all inside your own
browser using Chrome's extension storage. None of them is a browsing history,
and PopShield sends none of them anywhere on its own. A summary of the third
is included in a report when you choose to send one.

1. **Your settings** (`chrome.storage.local`): the default mode (Smart, Strict
   or Off) and any per-site mode **you choose** in the popup, stored as the
   site's domain name (for example `example.com` → `strict`). A site appears
   here only if you set a mode for it; picking the default mode again removes
   it. These are the only site names PopShield saves. They stay until you
   change them or remove the extension.

   A mode you choose for a site **in an incognito window** is handled
   differently: it is kept only in memory (`chrome.storage.session`), applies
   only to incognito tabs, and is forgotten when the browser exits. It is
   never written to disk, so it can't reveal a site you visited privately.
2. **An anonymous block counter** (`chrome.storage.local`): the total number of
   blocks, the number per day (the last 30 days are kept), the number per kind
   of block (for example "popup" or "redirect"), and the date counting started.
   It contains **no site names, addresses or page content**. The popup shows it
   as "N popups & redirects blocked since <date> · N today" with a 14-day
   chart. **Reset stats** in the popup clears it.
3. **The per-tab blocked list** (`chrome.storage.session`): for each open tab,
   a list of up to 50 items PopShield blocked on the current page, plus a
   count for the toolbar badge. Each item holds the type of block, the
   reason, the address the page tried to open, and the address of the page or
   frame it came from without its query string or `#fragment`. For a blocked
   ad link laid over the page it also holds up to 120 characters of the
   link's text.
   This list is kept in memory only, under that tab, and is shown to you in
   the PopShield popup so you can open anything you wanted after all. It is
   deleted when the tab goes to a new page, when the tab is closed, and when
   the browser exits. Reloading the page keeps it, and so does a page that
   changes its address without loading a new page.

Chrome's own sync is not used, so none of this is copied to other devices.

### Short-lived working memory (never stored)

While it works, PopShield's background worker keeps a few things in its
memory only, and never writes them to storage:

- for a few seconds after you click a link or a page is allowed to open a
  tab, the address that new tab is allowed to open (up to 8 seconds for
  right-click "Open link in new tab"), so a tab you didn't ask for can be
  told apart from one you did;
- for up to 8 seconds after a doubtful approval, the site names a tab is
  allowed to land on, so a redirect that bounces on to an unrelated site can
  be undone;
- for each tab, the time it last opened another tab, so a page can't turn
  the tab you left behind into an ad (forgotten when you navigate that tab
  yourself);
- for a new tab opened on doubtful evidence, a flag saying so, until that
  tab's first page has loaded.

This is not a record of your browsing: it is never saved, it is not part of
any report, and it is dropped when the tab closes or the worker stops.

## Pages can tell that PopShield is installed

PopShield changes how pages behave: popups get refused, and functions such as
`window.open` are replaced by PopShield's own versions. A web page that looks
for these effects can tell that PopShield (or something like it) is
installed. Like any detectable extension, that is one more detail a site
could combine with others to recognise a browser ("fingerprinting").
PopShield does not try to hide itself. It does not pass pages any information
about you or about the other sites you visit; a page can only observe how
PopShield behaves on that page, for example that its popups are refused.

## Reporting a problem (only when you choose to)

The toolbar popup has **Report ads that got through** and **Report something
blocked by mistake** buttons. Pressing one first shows a confirmation that
lists what will be shared. If you continue, PopShield opens a new browser tab
on github.com with a public issue form. The following details are written
into that tab's address, so that the form arrives already filled in:

- the page's address: origin and path only, without its query string or
  `#fragment`, and the site's name in the issue title
- the PopShield mode for that site
- the Chrome and PopShield version numbers
- a short summary of what was blocked on that page: the type and reason of
  each block and the hostname it tried to open

Because these details travel in the address, **GitHub receives them as soon
as the tab opens**, before you submit anything, and GitHub's own privacy
statement applies to them. They do not go to the developer. Nothing becomes
public unless you sign in to GitHub and press **Submit**, and you can read
and edit everything in the form first. Issues on GitHub are public.

The Report buttons are hidden in incognito windows, so the address of a page
you opened privately is never offered for sharing.

The **Feedback** link only opens GitHub Discussions in a new tab, with
nothing about your browsing filled in. The **Open** button next to a blocked
item opens that address in a new tab, because you asked for it.

PopShield has no share buttons or other social features.

## Why PopShield needs access to all websites

To stop a popup or redirect, PopShield has to run on every page and frame
before the page's own scripts do. Its content scripts look out for attempts
to open new tabs or redirect the current tab and decide, inside your browser,
whether you actually asked for it. The `webNavigation` permission lets it close
tabs that a page opened without your action, and check, for a few seconds,
whether a doubtfully approved tab is redirected somewhere else. Navigations
you make yourself (typing an address, a bookmark, a link, back, forward,
reload) are never second-guessed.

Chrome describes the `webNavigation` permission with the words "Read your
browsing history", because it lets an extension see where tabs navigate as it
happens. PopShield looks at those events for the purposes above and does not
store them. Nothing about the pages you visit is kept beyond the per-tab
blocked list described above, which is cleared when you go to a new page or
close the tab.

## Limited use

PopShield's use of the information it handles complies with the Chrome Web
Store User Data Policy, including the Limited Use requirements.

## Your control

- Switch PopShield to **Off** for any site, or as the default, from the
  toolbar popup.
- Reset the block counter with **Reset stats** in the popup.
- The Report buttons share nothing unless you press one and confirm.
- Remove all stored data by removing the extension from `chrome://extensions`.

## Children

PopShield collects no data from anyone of any age.

## Changes to this policy

If this policy changes, the new version will be published in this file with a
new effective date. The history of changes is visible in the repository.

## Contact

PopShield is published by Madhevan Ramalingam.

- General questions about privacy: open a public issue on the project's
  GitHub repository, https://github.com/madironman/popshield/issues
- Anything that should stay private: use GitHub's private vulnerability
  reporting form, https://github.com/madironman/popshield/security/advisories/new
