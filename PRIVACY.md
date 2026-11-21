# PopShield Privacy Policy

**Effective date:** 2026-11-21

PopShield is an open-source Chrome extension that blocks ad popups, popunders,
ad tabs and redirect hijacks. This policy explains what data PopShield handles.
In short: **PopShield does not collect, transmit, sell or share any data.**

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

PopShield keeps two small pieces of information, both inside your own browser
using Chrome's extension storage. Neither ever leaves your device.

1. **Your settings** (`chrome.storage.local`): the default mode (Smart, Strict
   or Off) and any per-site mode you choose, stored as the site's domain name
   (for example `example.com` → `strict`). These stay until you change them or
   remove the extension.
2. **The blocked-items log** (`chrome.storage.session`): for each open tab, a
   list of up to 50 items PopShield blocked on the current page (the type of
   block, the reason, the address the page tried to open, and the address of
   the page or frame it came from) plus a count for the toolbar badge. This
   log is kept in memory only, is shown to you in the PopShield popup, and is
   deleted when the tab navigates to a new page, when the tab is closed, or
   when the browser exits.

Chrome's own sync is not used, so these settings are not copied to other
devices.

## Reporting a problem (only when you choose to)

The toolbar popup has **Report ads that got through**, **Report something
blocked by mistake** and **Feedback** buttons. They only open a new browser tab
on github.com with a form that is pre-filled with:

- the site's address, without its query string or `#fragment`
- the PopShield mode for that site
- the Chrome and PopShield version numbers
- a short summary of what was blocked: the type of each block and the
  ad server's hostname

PopShield sends nothing itself. You can read and edit everything in the form,
and nothing is published unless you sign in to GitHub and click **Submit**.
Issues on GitHub are public, and GitHub's own privacy policy applies to them.

## Why PopShield needs access to all websites

To stop a popup or redirect, PopShield has to run on every page and frame
before the page's own scripts do. Its content scripts watch for attempts to
open new tabs or redirect the current tab and decide, inside your browser,
whether you actually asked for it. The `webNavigation` permission lets it close
tabs that a page opened without your action. This processing happens locally
and nothing about the pages you visit is recorded beyond the blocked-items log
described above.

## Your control

- Switch PopShield to **Off** for any site, or as the default, from the
  toolbar popup.
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
