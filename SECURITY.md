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

## Scope

In scope:

- **Detection or disabling by pages.** A web page that can reliably detect
  PopShield, read or tamper with its state, unhook its `window.open` / link /
  form / navigation guards, or forge the messages its content scripts send to
  the background worker (for example to fake user intent or spoof the blocked log).
- **Privilege issues.** Anything that lets a page or another extension use
  PopShield's permissions (`<all_urls>` host access, `storage`, `webNavigation`)
  beyond what it already has, e.g. reading other sites' URLs or the per-site
  mode list, or opening tabs on its own.
- **Unsafe UI.** Script injection through the toolbar popup or blocked log
  (for example a crafted URL rendered as HTML).
- **Privacy leaks.** Anything that makes PopShield send data off the device. By
  design it makes no network requests at all.

Out of scope (please use the normal issue forms instead):

- An ad that still gets through on some site: use **Ad got through**.
- A legitimate popup or link that gets blocked: use **False positive**.
- The known limitations listed in the README (e.g. the "Leave site?" prompt for
  cross-site player iframes, opens scheduled with `setTimeout`).
