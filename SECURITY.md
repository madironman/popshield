# Security Policy

## Supported versions

PopShield is a small project. Only the latest release receives fixes.

| Version | Supported |
|---------|-----------|
| 0.1.x (latest) | Yes |
| Older | No |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub Security Advisories:

1. Go to the [Security tab](https://github.com/madironman/popshield/security) of the repository.
2. Click **Report a vulnerability**
   (direct link: <https://github.com/madironman/popshield/security/advisories/new>).
3. Describe the issue, the affected version, and steps or a minimal test page that reproduce it.

You should get an acknowledgement within 7 days. Once a fix is ready it will be
released and the advisory published, crediting you unless you prefer otherwise.

## Threat model in brief

PopShield assumes the web page is hostile. Ad scripts can add listeners
anywhere, create overlays and frames, swap link addresses mid-click, navigate
the top window, and replace any built-in function in the page's own
JavaScript (MAIN) world. The full model is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#threat-model).

- **No decisions in the page's world.** `src/inject.js` (MAIN world) only hooks
  the APIs that open tabs and synchronously asks `src/bridge.js` (isolated
  world, which pages cannot reach) for a verdict. It captures every built-in it
  uses before any page script runs (including regular-expression matching and
  DOM getters), and its two hints (framework attribution,
  async origin) can only relax a check in a narrow, bounded way.
- **A private channel.** The 128-bit nonce is exchanged once at
  `document_start`, before any page script exists, and never re-broadcast.
- **Only the bridge mints allow tokens**, each bound to a URL's site (to the
  exact page for links the user clicks), valid for 3 s (8 s for right-click
  "Open link in new tab"), at most 4 per tab.
- **Measured before the page can react.** Overlay and page-wide checks use a
  snapshot taken when the user's gesture starts, before any page code runs.
  The pressed link's address and the pressed button's form wiring are
  recorded at the press, so re-pointing them before the click is refused.
  The invisible-paint check fails closed when it reaches its size limit.
- **Exact sign-in and payment exemptions.** Only listed provider hosts with
  their flow's path prefix are exempt, never a whole domain, a multi-tenant
  identity domain or a URL that merely carries `client_id=`. The exemption is
  checked after the tab-under, popup-hijack and Strict rules.
- **Thin evidence is followed.** Tokens that rest on a page-influenced hint,
  suspicious same-site navigations and sign-in / payment hand-offs are
  followed by the background for 8 s; a tab whose redirects land on an
  unrelated site is closed or sent back. The user's own navigations are never
  treated as redirects.
- **Audited.** Three internal security audits and two performance audits;
  after the fixes from the latest round, no release blockers remain.
- **The background worker trusts only bridge messages**: it whitelists message
  types, kinds and reasons, rate-limits per tab, and takes the frame address
  from `sender.url` (origin and path only).
- **Defence in depth.** If a page subverts `inject.js`, the worst it gets is
  skipping the early block; the backstop closes any new tab the bridge didn't
  approve.
- **Known residual risks.** A page that fakes framework data on the element
  the user clicks *before the press* (React props), or fakes a Solid or jQuery
  handler, specifically to fool PopShield, can get the framework exemption.
  The bridge then approves; redirect chains are still caught, but an open
  straight to the ad's address is not. Likewise, a page can style
  non-clickable content with a pointer cursor to pass the check for listeners
  on non-clickable content. Plain ad links that the user really clicks are
  out of scope. Same-tab redirects have no token
  backstop and rely on the bridge's Navigation API and `beforeunload` guards
  plus the background's chain follower. In Smart mode, a script redirect more
  than about 5 s after the last click is allowed by design (payment
  hand-offs); Strict mode blocks it. Pages can detect that PopShield is
  installed (see below).
- **Supply chain.** Workflows pin actions to commit SHAs, use
  `persist-credentials: false` and `npm ci --ignore-scripts`; releases are
  built by a read-only job and published by a minimal job with a
  build-provenance attestation.

## Scope

In scope:

- **Bypassing the bridge.** A web page that can get a new tab past the
  backstop without the bridge's approval, influence a verdict in `bridge.js`,
  learn or forge the channel nonce, or forge the messages the content scripts
  send to the background worker (for example to mint a token or spoof the
  blocked log).
- **Tampering or disabling by pages.** A web page that can read or tamper
  with PopShield's state, or unhook its `window.open` / link / form /
  navigation guards. (Skipping only the early block in
  `inject.js` while the backstop still closes the tab is expected behaviour.)
- **Privilege issues.** Anything that lets a page or another extension use
  PopShield's permissions (`<all_urls>` host access, `storage`, `webNavigation`)
  beyond what it already has, e.g. reading other sites' URLs, the per-site
  mode list or the per-tab blocked lists, or opening tabs on its own.
- **Unsafe UI.** Script injection through the toolbar popup or blocked log
  (for example a crafted URL rendered as HTML).
- **Privacy leaks.** Anything that makes PopShield send data off the device,
  or record which sites the user visits in persistent storage. By design it
  makes no network requests at all and keeps only anonymous counts.

Out of scope (please use the normal issue forms instead):

- An ad that still gets through on some site: use **Ad got through**.
- A legitimate popup or link that gets blocked: use **False positive**.
- The known limitations listed in the README (e.g. the "Leave site?" prompt for
  cross-site player iframes, opens scheduled with `setTimeout`, ad links styled
  as site buttons, Smart mode's delayed-redirect window).
- **Detection.** A page can tell that PopShield is installed (its hooks and
  refused popups are observable), which makes it one more fingerprinting
  signal. PopShield does not try to hide; this is documented in
  [PRIVACY.md](PRIVACY.md).

Framework and clickability spoofing are known residual risks, but a new,
practical way to exploit them is still welcome as a private report.
