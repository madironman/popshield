# PopShield Privacy Policy

**Effective date:** 2026-11-21

PopShield is an open-source Chrome extension that blocks ad popups, popunders,
ad tabs and redirect hijacks. This policy explains what data PopShield handles.
In short: **PopShield does not collect, transmit, sell or share any data.**

> **PopShield never records which sites you visit.** It keeps only an
> anonymous count of blocks (total, per day, per kind), on this device. The
> list of what was blocked on a page lives only in that tab and is wiped when
> the tab navigates or closes, and when the browser exits. There is no
> telemetry, no network request and no remote code. A report is sent only if
> you click **Report** and submit the GitHub form yourself.

## What PopShield does not do

- It does not collect personal information, browsing history, page content,
  keystrokes, location, or any other user data.
- It does not send any data to the developer or to anyone else. The extension
  makes no network requests at all: there is no server, no analytics, no
  telemetry, no crash reporting and no advertising.
- It does not download remote code, scripts or filter lists. All of its logic
  ships inside the extension package and can be read in the public source code.
- It does not use cookies or identifiers, and it does not require an account.

## Data stored on your device

PopShield keeps three small pieces of information, all inside your own
browser using Chrome's extension storage. None of them ever leaves your
device, and none of them is a record of the sites you visit.

1. **Your settings** (`chrome.storage.local`): the default mode (Smart, Strict
   or Off) and any per-site mode **you choose** in the popup, stored as the
   site's domain name (for example `example.com` → `strict`). A site appears
   here only if you set a mode for it; picking the default mode again removes
   it. These stay until you change them or remove the extension.
2. **An anonymous block counter** (`chrome.storage.local`): the total number of
   blocks, the number per day (the last 30 days are kept), the number per kind
   of block (for example "popup" or "redirect"), and the date counting started.
   It contains **no site names, addresses or page content**. The popup shows it
   as "N popups & redirects blocked since <date> · N today" with a 14-day
   chart. **Reset stats** in the popup clears it.
3. **The per-tab blocked list** (`chrome.storage.session`): for each open tab,
   a list of up to 50 items PopShield blocked on the current page (the type of
   block, the reason, the address the page tried to open, and the address of
   the page or frame it came from without its query string or `#fragment`),
   plus a count for the toolbar badge. This list is kept in memory only, under
   that tab, and is shown to you in the PopShield popup so you can open
   anything you wanted after all. It is deleted when the tab navigates to a new
   page, when the tab is closed, and when the browser exits.

Chrome's own sync is not used, so none of this is copied to other devices.

### Short-lived working memory (never stored)

While it works, PopShield's background worker keeps a few things in its
memory only, and never writes them to storage:

- for a few seconds after you click a link or a page is allowed to open a
  tab, the address that new tab is allowed to open (up to 15 seconds for
  right-click "Open link in new tab"), so a tab you didn't ask for can be
  told apart from one you did;
- for up to 8 seconds after a doubtful approval, the site names a tab is
  allowed to land on, so a redirect that bounces on to an unrelated site can
  be undone;
- for each tab, the time it last opened another tab, so a page can't turn
  the tab you left behind into an ad.

This is not a record of your browsing: it is never saved, never sent, and it
is dropped when the tab closes or the worker stops.

## Reporting a problem (only when you choose to)

The toolbar popup has **Report ads that got through** and **Report something
blocked by mistake** buttons. They only open a new browser tab on github.com
with a public issue form that is pre-filled with:

- the site's address, without its query string or `#fragment`
- the PopShield mode for that site
- the Chrome and PopShield version numbers
- a short summary of what was blocked on that page: the type and reason of
  each block and the hostname it tried to open

PopShield sends nothing itself. You can read and edit everything in the form,
and nothing is published unless you sign in to GitHub and click **Submit**.
Issues on GitHub are public, and GitHub's own privacy policy applies to them.

The **Feedback** link only opens GitHub Discussions in a new tab, with nothing
pre-filled.

PopShield has no share buttons or other social features.

## Why PopShield needs access to all websites

To stop a popup or redirect, PopShield has to run on every page and frame
before the page's own scripts do. Its content scripts watch for attempts to
open new tabs or redirect the current tab and decide, inside your browser,
whether you actually asked for it. The `webNavigation` permission lets it close
tabs that a page opened without your action, and check, for a few seconds,
where a doubtfully approved tab actually lands. This processing happens locally
and nothing about the pages you visit is recorded beyond the per-tab blocked
list described above, which disappears with the tab.

## Your control

- Switch PopShield to **Off** for any site, or as the default, from the
  toolbar popup.
- Reset the block counter with **Reset stats** in the popup.
- Remove all stored data by removing the extension from `chrome://extensions`.

## Children

PopShield does not knowingly collect information from anyone, including
children under 13, because it does not collect information at all.

## Changes to this policy

If this policy changes, the new version will be published in this file with a
new effective date. The history of changes is visible in the repository.

## Contact

Questions about privacy can be raised as an issue on the project's GitHub
repository: https://github.com/madironman/popshield/issues
