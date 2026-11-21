# PopShield: Chrome Web Store listing and submission kit

Everything needed to fill in the Chrome Web Store Developer Dashboard for
PopShield 0.1.0. Copy each block into the matching field. Nothing here has
been submitted; the account owner submits it.

- Package to upload: `dist/popshield-0.1.0.zip` (build it with `npm run package`)
- Images: `store/images/` (regenerate with `node store/image-src/capture.mjs && node store/image-src/render.mjs`)
- Privacy policy URL: https://github.com/madironman/popshield/blob/main/PRIVACY.md

---

## 1. Store listing tab

### Name

Taken from `manifest.json` (it can't be edited in the dashboard):

```
PopShield
```

### Summary (from the manifest `description`, 127 of 132 characters)

```
Helps stop sites from opening ad tabs, popups, popunders and hijack redirects, while the links you actually click keep working.
```

The summary comes from `manifest.json` and has no room left for the privacy
promise ("PopShield keeps no browsing history"), so the promise opens the
detailed description below. A shorter manifest `description` that includes it
would be, for example (107 characters):

```
Helps block ad tabs, popunders and hijack redirects. Links you click still work. Keeps no browsing history.
```

### Detailed description (plain text, paste as is)

```
PopShield helps stop websites from opening ad tabs, popups and popunders, and from hijacking the tab you are on with ad redirects. The tabs you open yourself keep working.

PopShield keeps no browsing history. The only site names it saves are the ones you choose a mode for; everything else is an anonymous count. No telemetry, no remote code.

Some sites attach an ad script to the whole page. Every click anywhere, on a button, on a link or on an empty part of the page, opens an ad tab behind your back or swaps the current tab for an ad. Chrome's built-in popup blocker lets this through because a real click happened. PopShield looks at where the click went and what the page did with it, and only lets a new tab open when you actually asked for one.

WHAT IT BLOCKS
- Popups and popunders opened by page-wide click hooks, or by ad listeners attached to every element of the page
- Invisible full-page ad layers and ad images stacked over buttons
- Tab-under and click-hijack redirects that replace the page you were on
- Redirect chains that bounce through the site's own pages on to an ad
- Links whose address a script swaps while you click (you get the page you clicked, not the ad), and buttons re-wired to an ad form between your press and your click
- Popups sent to an ad site before you have used them
- Fake clicks on hidden links and forms
- Always-on-top mini windows opened by ad scripts
- Popups opened by timers or background code with no click at all
- New tabs that a page opens without your action (closed within a fraction of a second as a backstop)

WHAT KEEPS WORKING
- Links you click, including target=_blank links
- Ctrl/Cmd-click, middle-click and "Open link in new tab"
- Share buttons, sign-in windows and other buttons that open a window when you click them
- Sites built with React, Solid and jQuery, and sign-in or checkout buttons that open a window after loading data
- Downloads, normal navigation and page reloads

THREE MODES, PER SITE
- Smart (default, the everyday setting): blocks what ad scripts trigger, allows what you click. Payment pages that hand you off to your bank a few seconds after you click keep working, because a redirect that happens more than a few seconds after your click is allowed.
- Strict (maximum protection): no script may open a tab on that site, and once you have used the page no script may send it to another site, however long it waits, sign-in and payment pages included. Links you click still work.
- Off: PopShield does nothing on that site.
Frames embedded from other sites follow the mode of the page they are on. Modes you pick in incognito windows are kept in memory only.

SEE WHAT WAS BLOCKED
The toolbar badge counts what was stopped on the current page. Open the PopShield popup to see each blocked item and why it was blocked, and click Open on any item to open it anyway. The popup also shows how many popups and redirects PopShield has blocked since you installed it, with a 14-day chart. You can reset this counter at any time.

REPORT A SITE
If ads still get through on a site, or something is blocked by mistake, the Report buttons open a GitHub issue form that is already filled in. PopShield first shows you what will be shared: the page's address (without anything after ? or #), your mode, the Chrome and PopShield versions, and a summary of what was blocked. GitHub receives those details when the tab opens. Nothing becomes public unless you sign in and submit the form, and you can edit everything first. The Report buttons are hidden in incognito windows.

PRIVATE BY DESIGN
- PopShield keeps no browsing history
- The only site names it saves are the ones you choose a mode for; everything else is an anonymous count (total, per day, per kind), kept on your device
- The list of what was blocked on a page lives only in that tab. It is cleared when you go to a new page or close the tab (reloads and in-page route changes keep it), and when the browser exits
- Site modes you choose in incognito are never written to disk
- No analytics or telemetry; the developer receives no data
- No background network requests: details leave your browser only if you press Report and confirm
- No remote code and no downloaded filter lists: everything ships in the extension
- No share or social features
- Open source (MIT): https://github.com/madironman/popshield

BUILT TO RESIST HOSTILE PAGES
PopShield's decisions are made in Chrome's isolated extension environment, which web pages cannot see or tamper with, and a background safety net closes any new tab that was not approved there.

WHY IT NEEDS ACCESS TO ALL SITES
Ad tabs and redirects can come from any website and from frames embedded from other sites. PopShield must run on every page, before the page's own scripts, to stop them. It processes everything locally and keeps no browsing history.

KNOWN LIMITATIONS
- PopShield is not a content blocker. Ads that are ordinary links styled as the site's own buttons, and fake dialogs inside the page, are not removed. Use a content blocker alongside it.
- Buttons that wait and then open an unrelated third-party site, or open a tab from a delayed timer, are blocked in Smart mode. Use Open in the popup, or set that site to Off.
- In Smart mode, an ad script that waits more than a few seconds after your click before redirecting the page can get through; this keeps payment pages working. Use Strict on sites you don't trust.
- A site that opens another site from a listener on plain text or an image (nothing that looks clickable) is blocked in Smart mode. Use Open in the popup.
- Sign-in and payment services are recognised from a fixed list of exact addresses; others are treated like any other site.
- If a frame embedded from another site takes over the whole tab right after you click inside it, PopShield sends the tab back to the page you were on. The other page may appear for a moment first, and the original page loads again.
- Like any extension that changes page behaviour, PopShield can be detected by the pages you visit.
- PopShield is built and tested for Chrome. Other Chromium-based browsers are not tested.

PopShield is an independent project, not affiliated with or endorsed by Google or any company named here. Google Chrome and Chromium are trademarks of Google LLC; other names belong to their owners and are used only to describe compatibility.
```

### Category

- Primary suggestion: **Privacy & Security**
- Alternative: **Functionality & UI**

### Language

- **English** (the extension UI is English only; no `_locales`)

### Graphic assets (upload from `store/images/`)

| Dashboard field | File | Size |
|---|---|---|
| Store icon | `icons/128.png` | 128x128 |
| Screenshot 1 | `store/images/screenshot-1-blocked.png` | 1280x800 |
| Screenshot 2 | `store/images/screenshot-2-before-after.png` | 1280x800 |
| Screenshot 3 | `store/images/screenshot-3-modes.png` | 1280x800 |
| Screenshot 4 | `store/images/screenshot-4-dark.png` | 1280x800 |
| Screenshot 5 | `store/images/screenshot-5-privacy.png` | 1280x800 |
| Small promo tile | `store/images/promo-small-440x280.png` | 440x280 |
| Marquee promo tile (optional) | `store/images/promo-marquee-1400x560.png` | 1400x560 |

All images are 24-bit PNG with no alpha channel. The popup screenshots come
from the real extension: a local demo page runs popup-script tricks and
PopShield blocked them. Every request was answered locally, nothing went to
the network, and the hosts shown are reserved `.example` names.

### Additional fields

- Official URL: leave as "None" (needs a verified domain)
- Homepage URL: `https://github.com/madironman/popshield`
- Support URL: `https://github.com/madironman/popshield/issues`
- Mature content: No

---

## 2. Privacy practices tab

### Single purpose description

```
PopShield has one purpose: to stop websites from opening tabs, popups, popunders and redirects that the user did not ask for, while letting the tabs the user deliberately opens work normally.
```

### Permission justifications

**storage**

```
Saves the user's mode choices (Smart, Strict or Off, as a default and for sites where the user picked a mode) and an anonymous block counter (total, per day, per kind of block; no site names or addresses) in chrome.storage.local. Per-site choices made in incognito windows are kept only in chrome.storage.session (memory only) and never written to disk. Keeps the per-tab list of blocked items shown in the toolbar popup in chrome.storage.session (memory only, cleared when the user goes to a new page or closes the tab, and when the browser exits). PopShield keeps no browsing history: the only site names it saves are the ones the user chooses a mode for. Nothing is synced, and nothing is sent to the developer. A summary of the per-tab list leaves the browser only if the user presses a Report button and confirms.
```

**webNavigation**

```
PopShield uses webNavigation.onCreatedNavigationTarget to detect when a page opens a new tab or window, so it can close, within a fraction of a second, tabs the page opened without the user's click (the main defence against popunders that bypass the in-page checks). It uses webNavigation.onCommitted to reset the per-tab blocked list when the tab loads a new page; to notice when a frame embedded from another site sends the whole tab to a different site within a few seconds of the user clicking inside that frame, so it can send the tab back; and, for up to 8 seconds after a doubtful approval, to check whether a tab was redirected on to an unrelated site, so it can close that tab or send it back; navigations the user makes (typed addresses, bookmarks, links, back/forward, reload) are never treated as redirects. No navigation data is stored beyond that per-tab list, which lives only in memory for that tab; the short-lived checks are kept in memory only and never saved. None of it is sent to the developer.
```

**Host permission: `<all_urls>`** (used by the content scripts and to read the tab's site in the popup)

```
Ad popups, popunders, ad tabs and redirect hijacks can come from any website and from cross-origin frames embedded in a page (widgets, for example), so PopShield's content scripts must run on every page and in every frame at document_start, before the page's own scripts. One of them runs in the page's MAIN world so it can intercept window.open, scripted link clicks, form submits and Picture-in-Picture windows; it asks the other, isolated-world content script, which decides whether the user actually caused them and guards against redirect hijacks. The host permission also lets the popup and background worker read the current tab's site to apply the per-site mode. A narrower match list is not possible because the user can meet these ads on any site. All processing is local. The extension's own code makes no network requests, and the developer receives no data.
```

### Remote code

- Are you using remote code? **No, I am not using remote code.**

```
All JavaScript is included in the extension package. PopShield does not load external scripts, does not use eval or new Function, does not download filter lists, and its own code makes no network requests.
```

### Data usage

What user data do you plan to collect from users now or in the future?

Google asks for data that is only handled locally to be disclosed here too.
The recommended answer is to tick the three boxes that describe what
PopShield looks at, and to leave the others unticked:

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [x] Web history
- [x] User activity
- [x] Website content

Why each of the three applies:

| Box | What PopShield handles |
|---|---|
| Web history | Page addresses are handled locally to tell one site from another. The per-site mode choices are saved under site names, and the per-tab blocked list holds page and link addresses. |
| User activity | Clicks and key presses are observed locally to judge whether the user asked for a new tab or a redirect. |
| Website content | Link addresses, and up to 120 characters of link text, are kept in the per-tab blocked list. |

All of this is processed and stored locally and never sent to the developer.

If the form offers a free-text field, this is the full picture: the per-tab
blocked list lives in memory only and is cleared when the user goes to a new
page or closes the tab; the block counter is anonymous; the only site names
saved to disk are the ones the user chooses a mode for. The Report buttons
are the one path by which details leave the browser. After a confirmation
they open github.com with the page address (origin and path), the mode, the
Chrome and PopShield versions and a summary of what was blocked (types and ad
hostnames) in the address, so GitHub receives them when the tab opens.
Nothing becomes public unless the user signs in and submits, and the buttons
are hidden in incognito windows. No permission is needed for the `chrome.dom`
API, which PopShield uses to find links inside closed shadow roots.

Then the three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

Read the first one against the Report flow before ticking it. That flow is
the only transfer: the user starts it, sees what will be shared before
anything is sent, and it exists to fix missed ads and wrong blocks.
`PRIVACY.md` states that PopShield's use of the information it handles
complies with the Chrome Web Store User Data Policy, including the Limited
Use requirements.

### Privacy policy URL

```
https://github.com/madironman/popshield/blob/main/PRIVACY.md
```

---

## 3. Distribution tab

- Payments: Free of charge
- Visibility: **Public**
- Regions: All regions

---

## 4. Submission checklist

Before you start:

1. [ ] Push the repo to GitHub as `madironman/popshield` (public) so the privacy
       policy URL, homepage and support links work. Open
       https://github.com/madironman/popshield/blob/main/PRIVACY.md in a
       private window to confirm.
2. [ ] Run `npm test` and confirm it passes.
3. [ ] Build the package: `npm run package` (or `node scripts/package.mjs`).
       It writes `dist/popshield-0.1.0.zip` with only `manifest.json`, `src/`,
       `icons/` and `LICENSE`. Optional check: `python3 -m zipfile -t dist/popshield-0.1.0.zip`.
4. [ ] Load the unzipped package once with "Load unpacked" and try it on the
       local test pages (see "In your own browser" in
       `docs/learn/05-contributing.md`).

Developer account (one time):

5. [ ] Go to https://chrome.google.com/webstore/devconsole and sign in with
       the Google account that will own the listing. 2-Step Verification
       must be turned on for that account.
6. [ ] Accept the developer agreement and pay the one-time **US $5**
       registration fee.
7. [ ] In Account settings: set the publisher display name, verify the
       contact email, and complete the trader / non-trader declaration.
       Decide whether you act as a trader under the guidance on the form; if
       you enable sponsorships, revisit this.

Create the item:

8. [ ] Click **New item** and upload `dist/popshield-0.1.0.zip`.
9. [ ] **Store listing** tab: paste the description, pick the category and
       language, upload the store icon, the 5 screenshots, the small promo
       tile and (optional) the marquee, and fill in the homepage and support
       URLs from section 1.
10. [ ] **Privacy practices** tab: paste the single purpose, the three
        permission justifications, choose "No, I am not using remote code",
        tick Web history, User activity and Website content as described in
        section 2 and leave the other data boxes unticked, tick the three
        certifications and enter the privacy policy URL.
11. [ ] **Distribution** tab: Free, **Public**, all regions.
12. [ ] Click **Save draft**, fix anything the dashboard flags, then
        **Submit for review**. Optionally tick "Publish automatically after
        review"; otherwise publish it yourself once it is approved.

After submitting:

- Review usually takes a few days. Extensions that request broad host
  permissions such as `<all_urls>` and run content scripts in the MAIN world
  get an in-depth review and can take longer (sometimes a few weeks). The
  dashboard will say so after upload. Clear permission justifications help.
- If the review is rejected, the email names the policy. Fix it, bump
  `version` in `manifest.json`, rebuild the zip and upload the new package.
- For each later release: bump `version` in `manifest.json` (and
  `package.json`), run `npm test`, run `npm run package`, then in the
  dashboard open the item, go to **Package**, **Upload new package**, and
  submit for review again.
