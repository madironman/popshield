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

### Summary (from the manifest `description`, 122 of 132 characters)

```
Stops sites from opening ad tabs, popups, popunders and hijack redirects, while the links you actually click keep working.
```

The summary comes from `manifest.json` and has no room left for the privacy
promise ("PopShield never records which sites you visit"), so the promise
opens the detailed description below. A shorter manifest `description` that
includes it would be, for example (112 characters):

```
Blocks ad tabs, popunders and hijack redirects. Links you click still work. Never records which sites you visit.
```

### Detailed description (plain text, paste as is)

```
PopShield stops websites from opening ad tabs, popups and popunders, and from hijacking the tab you are on with ad redirects. The tabs you open yourself keep working.

PopShield never records which sites you visit. It keeps only an anonymous count of blocks on your device, and the list of what was blocked on a page disappears with the tab. No telemetry, no network requests, no remote code.

Streaming, download and free-content sites often attach an ad script to the whole page. Every click anywhere, even on the play button or the volume slider, opens an ad tab behind your back or swaps the current tab for an ad. Chrome's built-in popup blocker lets this through because a real click happened. PopShield looks at where the click went and what the page did with it, and only lets a new tab open when you actually asked for one.

WHAT IT BLOCKS
- Popups and popunders opened by page-wide click hooks
- Invisible full-page ad layers and ad images stacked over buttons
- Tab-under and click-hijack redirects that replace the page you were on
- Popups sent to an ad site before you have used them
- Fake clicks on hidden links and forms
- Picture-in-Picture windows opened by ad scripts
- Popups opened by timers or background code with no click at all
- New tabs that a page opens without your action (closed instantly as a backstop)

WHAT KEEPS WORKING
- Links you click, including target=_blank links
- Ctrl/Cmd-click, middle-click and "Open link in new tab"
- Share buttons, sign-in windows and other buttons that open a window when you click them
- Sites built with React, Solid and jQuery, and sign-in or checkout buttons that open a window after loading data
- Downloads, normal navigation and page reloads

THREE MODES, PER SITE
- Smart (default): blocks what ad scripts trigger, allows what you click.
- Strict: no script may open a tab on that site. Links you click still work.
- Off: PopShield does nothing on that site.
Embedded players from other domains follow the mode of the page they are on.

SEE WHAT WAS BLOCKED
The toolbar badge counts what was stopped on the current page. Open the PopShield popup to see each blocked item and why it was blocked, and click Open on any item to open it anyway. The popup also shows how many popups and redirects PopShield has blocked since you installed it, with a 14-day chart. You can reset this counter at any time.

REPORT A SITE
If ads still get through on a site, or something is blocked by mistake, the Report buttons open a pre-filled public GitHub issue that you can read and edit before submitting. PopShield itself never sends anything.

PRIVATE BY DESIGN
- PopShield never records which sites you visit
- Only an anonymous count of blocks (total, per day, per kind) is kept, on your device
- The list of what was blocked on a page lives only in that tab and is wiped when the tab navigates or closes, and when the browser exits
- No data collection, analytics or telemetry
- No network requests: PopShield never contacts any server
- No remote code and no downloaded filter lists: everything ships in the extension
- No share or social features
- Open source (MIT): https://github.com/madironman/popshield

BUILT TO RESIST HOSTILE PAGES
PopShield's decisions are made in Chrome's isolated extension environment, which web pages cannot see or tamper with, and a background safety net closes any new tab that was not approved there.

WHY IT NEEDS ACCESS TO ALL SITES
Ad tabs and redirects can come from any website and from embedded frames such as video players. PopShield must run on every page, before the page's own scripts, to stop them. It processes everything locally and never records the pages you visit.

KNOWN LIMITATIONS
- PopShield is not a content blocker. Ads that are ordinary links styled as the site's own buttons, and fake dialogs inside the page, are not removed. Use a content blocker alongside it.
- Buttons that wait and then open an unrelated third-party site, or open a tab from a delayed timer, are blocked in Smart mode. Use Open in the popup, or set that site to Off.
- If a cross-site video player tries to take over the whole tab, Chrome may show a "Leave site?" prompt. Click Cancel to stay on the page.
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
from the real extension: the demo page runs real ad tricks and PopShield
blocked them (all requests were answered locally, and the sites shown use
reserved `.example` domains).

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
Saves the user's mode choices (Smart, Strict or Off, as a default and for sites where the user picked a mode) and an anonymous block counter (total, per day, per kind of block; no site names or addresses) in chrome.storage.local. Keeps the per-tab list of blocked items shown in the toolbar popup in chrome.storage.session (memory only, cleared when the tab navigates or closes and when the browser exits). PopShield never records which sites the user visits. Nothing is synced or sent anywhere.
```

**webNavigation**

```
PopShield uses webNavigation.onCreatedNavigationTarget to detect when a page opens a new tab or window, so it can immediately close tabs the page opened without the user's click (the main defence against popunders that bypass the in-page checks). It uses webNavigation.onCommitted to reset the per-tab blocked list when the tab loads a new page. No navigation data is stored beyond that per-tab list, which lives only in memory for that tab, and nothing is transmitted.
```

**Host permission: `<all_urls>`** (used by the content scripts and to read the tab's site in the popup)

```
Ad popups, popunders, ad tabs and redirect hijacks can come from any website and from embedded cross-origin frames such as video players, so PopShield's content scripts must run on every page and in every frame at document_start, before the page's own scripts. One of them runs in the page's MAIN world so it can intercept window.open, scripted link clicks, form submits and Picture-in-Picture windows; it asks the other, isolated-world content script, which decides whether the user actually caused them and guards against redirect hijacks. The host permission also lets the popup and background worker read the current tab's site to apply the per-site mode. A narrower match list is not possible because the user can meet these ads on any site. All processing is local; the extension makes no network requests and collects no data.
```

### Remote code

- Are you using remote code? **No, I am not using remote code.**

```
All JavaScript is included in the extension package. PopShield does not load external scripts, does not use eval or new Function, does not download filter lists, and makes no network requests.
```

### Data usage

What user data do you plan to collect from users now or in the future?
Leave **every box unticked**:

- [ ] Personally identifiable information
- [ ] Health information
- [ ] Financial and payment information
- [ ] Authentication information
- [ ] Personal communications
- [ ] Location
- [ ] Web history
- [ ] User activity
- [ ] Website content

(The per-tab blocked list, the anonymous block counter and the mode settings
never leave the device, so under the Chrome Web Store definition they are not
"collected". The Report buttons only open a GitHub page that the user fills in
and submits; PopShield transmits nothing. No permission is needed for the
`chrome.dom` API, which PopShield uses to find links inside closed shadow
roots.)

Tick all three certifications:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

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
       It writes `dist/popshield-0.1.0.zip` with only `manifest.json`, `src/`
       and `icons/`. Optional check: `python3 -m zipfile -t dist/popshield-0.1.0.zip`.
4. [ ] Load the unzipped package once with "Load unpacked" and try it on a
       real site.

Developer account (one time):

5. [ ] Go to https://chrome.google.com/webstore/devconsole and sign in with
       the Google account that will own the listing. 2-Step Verification
       must be turned on for that account.
6. [ ] Accept the developer agreement and pay the one-time **US $5**
       registration fee.
7. [ ] In Account settings: set the publisher display name, verify the
       contact email, and complete the trader / non-trader declaration
       (a free hobby project without a business is normally "non-trader").

Create the item:

8. [ ] Click **New item** and upload `dist/popshield-0.1.0.zip`.
9. [ ] **Store listing** tab: paste the description, pick the category and
       language, upload the store icon, the 5 screenshots, the small promo
       tile and (optional) the marquee, and fill in the homepage and support
       URLs from section 1.
10. [ ] **Privacy practices** tab: paste the single purpose, the three
        permission justifications, choose "No, I am not using remote code",
        leave all data-collection boxes unticked, tick the three
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
