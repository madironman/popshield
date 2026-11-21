// End-to-end tests: real Chromium, real extension, real clicks.
//   node test/run.mjs            -> baseline (no extension) + PopShield runs
//   node test/run.mjs <substr>   -> only cases whose name contains <substr>
//   E2E_WORKERS=N                -> number of parallel browsers (default: cores/RAM based, max 12)
// Each scenario is run twice:
//   1. baseline, without the extension — proves the attack really works in Chrome
//   2. with PopShield — must block the attack / keep legit behaviour working
// Cases run in parallel: each worker is its own persistent Chromium profile (own
// extension service worker + chrome.storage), and runs its cases one at a time.
// Both passes run at the same time; all workers share one static file server.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServers } from './server.mjs';

const EXT = process.env.POPSHIELD_EXT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8711/scenario.html?t=';
const SETTLE = 1500; // > backstop grace (400ms) + slack

// tabs: new tabs left open afterwards. url: where the main tab must end up
// ('same' = unchanged). played: the player's own button must still work.
// blocked: kinds PopShield must log. baseline: what Chrome alone does.
// act: one action, or several separated by spaces ("rclick:#play wait:300 play").
// wait: extra ms to settle (delayed attacks). adTab: true = some new tab must be at
// the ad page, false = none may be. knownBypass: an attack PopShield does NOT stop
// yet — run and reported, but it doesn't fail the suite (note says why).
const CASES = [
  // ------------------------------------------------------------ attacks
  { t: 'doc-click-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'window-mousedown-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'body-pointerup-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'overlay-anchor', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'overlay-div-listener', act: 'play', tabs: 0, url: 'same', blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'synthetic-anchor-timer', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['scripted-link'], baseline: { tabs: 1 } },
  { t: 'dispatch-anchor', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['scripted-link'], baseline: { tabs: 1 } },
  { t: 'form-submit-blank', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['scripted-form'], baseline: { tabs: 1 } },
  { t: 'submit-button-click', act: 'play', tabs: 0, url: 'same', played: true, blockedAny: ['scripted-form', 'new-tab'], baseline: { tabs: 1 } },
  { t: 'iframe-pristine-open', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 0 }, note: 'Chromium itself already refuses popups from a fresh hidden iframe' },
  { t: 'frames-index-open', act: 'play', tabs: 0, url: 'same', played: true, blockedAny: ['popup', 'new-tab'], baseline: { tabs: 0 }, note: 'Chromium itself already refuses popups from a fresh hidden iframe' },
  { t: 'tab-under', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup', 'redirect'], baseline: { tabs: 1, url: 'ad' } },
  { t: 'click-redirect', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'open-self-redirect', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'timer-popup', act: 'none', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'player-iframe-popup', act: 'iframe', tabs: 0, url: 'same', iframePlayed: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'player-iframe-top-redirect', act: 'iframe', tabs: 0, url: 'same', iframePlayed: true, blocked: ['redirect'], dialog: 'beforeunload', baseline: { url: 'ad' },
    note: 'Chrome shows "Leave site?"; the test answers Stay, like a user would' },
  // ------------------------------------------------------------ legit
  { t: 'legit-button-open', act: '#share', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-react-root', act: '#btn', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-blank-link', act: '#link', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-modifier-link', act: 'ctrl:#link', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-modifier-link', name: 'legit-middle-click-link', act: 'middle:#link', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-big-image-link', act: '#link', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-scripted-anchor', act: '#report', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-download-anchor', act: '#dl', tabs: 0, url: 'same', downloaded: true, blocked: [], baseline: { tabs: 0 } },
  { t: 'legit-same-site-redirect', act: 'play', tabs: 0, url: 'other', blocked: [], baseline: { url: 'other' } },
  { t: 'legit-onload-redirect', act: 'none', tabs: 0, url: 'ad', blocked: [], baseline: { url: 'ad' } },
  { t: 'legit-link-navigation', act: '#link', tabs: 0, url: 'ad', blocked: [], baseline: { url: 'ad' } },
  { t: 'legit-leave-after-player', act: 'iframe-then:#link', tabs: 0, url: 'ad', noDialog: true, blocked: [], baseline: { url: 'ad' } },
  { t: 'legit-form-blank', act: '#go', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-form-blank', name: 'legit-form-enter-key', act: 'enter:#q', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'backstop', name: 'backstop: tab opened by code PopShield could not hook', act: 'cdp-open', tabs: 0, url: 'same', blocked: ['new-tab'], baseline: { tabs: 1 } },
  { t: 'legit-async-open', act: '#async', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  // ------------------------------------------------------------ frameworks & async (limitation fixes)
  { t: 'legit-react16', act: '#btn', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-react16-async', act: '#btn', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-react17-async', act: '#btn', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-jquery-delegated', act: '#btn', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'jquery-star-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'react16-site-plus-popunder', act: '#btn', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'doc-async-await-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'doc-promise-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'player-iframe-top-redirect-2nd', act: 'iframe-human-x2', tabs: 0, url: 'same', blocked: ['redirect'], dialog: 'beforeunload', baseline: { url: 'ad' } },
  { t: 'legit-player-then-reload', act: 'iframe-wait-reload', tabs: 0, url: 'same', noDialog: true, blocked: [], baseline: { url: 'same' } },
  { t: 'legit-player-then-reload', name: 'legit-player-then-type-url', act: 'iframe-wait-goto', tabs: 0, url: 'ad', noDialog: true, blocked: [], baseline: { url: 'ad' } },
  // ------------------------------------------------------------ found by the live site survey
  { t: 'ad-layer-tab-under', act: '#cont', tabs: 0, url: 'same', blocked: ['popup', 'redirect'], baseline: { tabs: 1, url: 'ad' } },
  { t: 'element-tab-under', act: '#btn', tabs: 1, url: 'same', blocked: ['redirect'], baseline: { tabs: 1, url: 'ad' },
    note: 'the cross-site copy tab is allowed (button click), but the redirect right after it is a tab-under and is blocked' },
  { t: 'adbox-frame', act: 'frame:#adbox:#robot', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'decoy-hash-swap', act: '#link', tabs: 0, url: 'same', blocked: ['new-tab'], baseline: { tabs: 1 } },
  { t: 'legit-hash-blank', act: '#link', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-chat-widget-link', act: 'frame:#chat:#help', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'retry-loop-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], maxBlocked: 5, baseline: { tabs: 1 },
    note: '301 blocked attempts collapse to a couple of log entries' },
  { t: 'legit-max-z-modal', act: '#manage', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  // ------------------------------------------------------------ async targets, wrappers, SVG links
  { t: 'async-cross-site-element', act: '#btn', tabs: 0, url: 'same', blocked: ['popup'], baseline: { tabs: 1 },
    note: 'element handler opening an ad site after an await is blocked; only same-site/sign-in/payment targets are allowed after an await' },
  { t: 'wrapper-div-popunder', act: 'play', tabs: 0, url: 'same', played: true, blocked: ['popup'], baseline: { tabs: 1 } },
  { t: 'legit-react17-root', act: '#btn', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'svg-link-dispatch', act: 'play', tabs: 0, url: 'same', played: true, blockedAny: ['scripted-link', 'new-tab'], baseline: { tabs: 1 } },

  // ------------------------------------------------------------ red-team regressions (round 1)
  { t: 'rt-prepare-stack-trace', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-bound-element-receiver', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-currenttarget-spoof', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-timer-redirect', act: 'play', tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'rt-delayed-tab-under', act: 'play', wait: 1500, tabs: 0, url: 'same', blockedAny: ['popup', 'redirect'], baseline: { tabs: 1, url: 'ad' } },
  { t: 'rt-overlay-link-pixel', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-overlay-parent-opacity', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-overlay-near-threshold', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-nonce-leak-document-open', act: 'wait:300 play', tabs: 0, blockedAny: ['popup', 'new-tab'], baseline: { tabs: 1 },
    note: 'main tab URL is unchanged by document.open(); checked as "same"' },
  { t: 'rt-poison-trim', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-poison-regexp', act: 'play', tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'rt-poison-useractivation', act: 'play', tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'rt-pristine-click', act: 'play', tabs: 0, url: 'same', blockedAny: ['scripted-link', 'new-tab'], baseline: { tabs: 1 } },
  { t: 'rt-contextmenu-token-ride', act: 'rclick:#play wait:300 #play', tabs: 0, url: 'same', blockedAny: ['scripted-link', 'new-tab'], baseline: { tabs: 1 } },
  { t: 'rt-svg-xlink-dispatch', act: 'play wait:200 play', tabs: 0, url: 'same', blockedAny: ['scripted-link', 'new-tab'], baseline: { adTab: true } },
  { t: 'rt-transparent-xframe', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup', 'new-tab'], baseline: { tabs: 1 } },
  { t: 'rt-frame-redirect-delayed', act: 'iframe', wait: 2500, tabs: 0, url: 'same', blocked: ['redirect'], dialog: 'beforeunload', baseline: { url: 'ad' } },
  { t: 'rt-frame-redirect-blur-first', act: 'iframe', wait: 1000, tabs: 0, url: 'same', blocked: ['redirect'], dialog: 'beforeunload', baseline: { url: 'ad' } },
  { t: 'rt-ctrl-anywhere-token', act: 'ctrl:#play', tabs: 0, url: 'same', blockedAny: ['scripted-link', 'new-tab'], baseline: { adTab: true } },
  { t: 'rt-real-link-token-race', act: '#dl', tabs: 1, adTab: false, url: 'same', blockedAny: ['scripted-link', 'new-tab'], baseline: { tabs: 1, adTab: true },
    note: "Chrome alone gives the click's one popup to the ad; with PopShield the user's own link opens and the ad tab is stopped" },
  { t: 'rt-meta-refresh', act: 'play', tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'rt-fake-jquery', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-fake-react-props', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 },
    note: 'any page can plant __reactProps$ on the clicked node and call the wrapped handler from a page-wide listener (fwDepth > 0 skips the page-wide check)' },
  { t: 'rt-wrapper-redirect', act: 'play', tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'rt-hijack-legit-popup', act: '#share', wait: 1000, tabs: 1, adTab: false, url: 'same', blocked: ['redirect'], baseline: { tabs: 1, adTab: true } },
  { t: 'rt-sandboxed-realm', act: 'play', tabs: 0, url: 'same', blockedAny: ['new-tab', 'scripted-link'], baseline: { tabs: 1 } },
  // ------------------------------------------------------------ red-team regressions (round 2)
  { t: 'rt-async-forge-redirector', act: 'play', wait: 500, tabs: 0, url: 'same', blockedAny: ['popup', 'new-tab'], baseline: { tabs: 1, adTab: true } },
  { t: 'rt-redirector-navigation', act: 'play', wait: 500, tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' } },
  { t: 'rt-redirector-navigation', name: 'rt-redirector-navigation (strict)', mode: 'strict', act: 'play', wait: 500, tabs: 0, url: 'same', blocked: ['redirect'], baseline: null },
  { t: 'rt-tabunder-pointerup-reset', act: 'play', wait: 4500, tabs: 1, adTab: false, url: 'same', blocked: ['redirect'], baseline: { tabs: 1, url: 'ad' } },
  { t: 'rt-delayed-redirect', act: 'play', wait: 4500, tabs: 0, url: 'same', blocked: ['redirect'], baseline: { url: 'ad' }, knownBypass: true,
    note: 'ACCEPTED TRADE-OFF in Smart mode: a redirect more than 5 s after a click (e.g. a payment page handing off to the bank) is allowed so checkouts keep working; Strict mode blocks it (see the strict case)' },
  { t: 'rt-delayed-redirect', name: 'rt-delayed-redirect (strict)', mode: 'strict', act: 'play', wait: 4500, tabs: 0, url: 'same', blocked: ['redirect'], baseline: null,
    note: 'same as above; in strict mode this is how the pointerup tab-under still lands (its tab is blocked, the delayed redirect is not)' },
  { t: 'rt-tabunder-after-user-link', act: '#link', wait: 4500, tabs: 1, adTab: false, url: 'same', blocked: ['redirect'], baseline: { tabs: 1, url: 'ad' } },
  { t: 'rt-tabunder-after-user-link', name: 'rt-tabunder-after-user-link (strict)', mode: 'strict', act: '#link', wait: 4500, tabs: 1, adTab: false, url: 'same', blocked: ['redirect'], baseline: null },
  { t: 'rt-two-49pct-wrappers', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-closed-shadow-overlay', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-overlay-submit-button', act: 'play', tabs: 0, url: 'same', blockedAny: ['scripted-form'], baseline: { tabs: 1 } },
  { t: 'rt-overlay-submit-button', name: 'rt-overlay-submit-button (strict)', mode: 'strict', act: 'play', tabs: 0, url: 'same', blockedAny: ['scripted-form'], baseline: null },
  { t: 'rt-keystroke-requestsubmit', act: '#q key:a', tabs: 0, url: 'same', blockedAny: ['scripted-form'], baseline: { tabs: 1 } },
  { t: 'rt-keystroke-requestsubmit', name: 'rt-keystroke-requestsubmit (strict)', mode: 'strict', act: '#q key:a', tabs: 0, url: 'same', blockedAny: ['scripted-form'], baseline: null },
  { t: 'rt-small-invisible-xframe', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup', 'new-tab'], baseline: { tabs: 1 } },
  { t: 'rt-xframe-opacity021-link', act: 'play', tabs: 0, url: 'same', blockedAny: ['overlay-link', 'new-tab'], baseline: { tabs: 1 } },
  { t: 'rt-xframe-opacity021-link', name: 'rt-xframe-opacity021-link (strict)', mode: 'strict', act: 'play', tabs: 0, url: 'same', blockedAny: ['overlay-link', 'new-tab'], baseline: null },
  { t: 'rt-grid-overlay-link', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-grid-overlay-link', name: 'rt-grid-overlay-link (strict)', mode: 'strict', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: null },
  { t: 'rt-overlay-transparent-text', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-overlay-transparent-gradient', act: 'play', tabs: 0, url: 'same', blocked: ['overlay-link'], baseline: { tabs: 1 } },
  { t: 'rt-overlay-detach-before-open', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-wrapper-shrink-before-open', act: 'play', tabs: 0, url: 'same', blockedAny: ['popup'], baseline: { tabs: 1 } },
  { t: 'rt-requestsubmit-formtarget', act: 'play', wait: 300, tabs: 0, url: 'same', blockedAny: ['scripted-form'], baseline: { tabs: 1, adTab: true } },
  { t: 'rt-submitter-click-post', act: 'play', wait: 300, tabs: 0, url: 'same', blockedAny: ['scripted-form'], baseline: { tabs: 1, adTab: true } },
  { t: 'rt-frame-redirect-after-4s', act: 'iframe', wait: 4500, tabs: 0, url: 'same', blocked: ['redirect'], dialog: 'beforeunload', baseline: { url: 'ad' } },
  // ------------------------------------------------------------ red-team round 3 (still open)
  { t: 'rt-tabunder-samesite-hop', act: '#link', wait: 8500, tabs: 1, adTab: false, url: 'hop', blocked: ['redirect'], baseline: { tabs: 1, url: 'ad' },
    note: "the 60 s tab-under window lives in the opener's document; a same-site hop erases it and the 8 s redirect watch has expired by the time the hop page redirects" },
  { t: 'rt-tabunder-samesite-hop', name: 'rt-tabunder-samesite-hop (strict)', mode: 'strict', act: '#link', wait: 8500, tabs: 1, adTab: false, url: 'hop', blocked: ['redirect'], baseline: null,
    note: 'same, in strict mode' },
  { t: 'rt-link-href-swap-redirector', act: '#link', wait: 500, tabs: 1, adTab: false, url: 'same', blockedAny: ['new-tab'], baseline: { tabs: 1, adTab: true },
    note: 'user-link tokens are bound by site and never followed: an href swapped to a same-site redirector during the click lands on the ad' },
  { t: 'rt-link-href-swap-redirector', name: 'rt-link-href-swap-redirector (strict)', mode: 'strict', act: '#link', wait: 500, tabs: 1, adTab: false, url: 'same', blockedAny: ['new-tab'], baseline: null,
    note: 'same, in strict mode' },
  { t: 'legit-closed-shadow-link', act: '#host', tabs: 1, url: 'same', blocked: [], baseline: { tabs: 1 } },
  { t: 'legit-closed-shadow-link', name: 'mode-strict: closed-shadow link still works', mode: 'strict', act: '#host', tabs: 1, url: 'same', blocked: [], baseline: null },
  // ------------------------------------------------------------ modes
  { t: 'doc-click-popunder', name: 'mode-off: popunder allowed', mode: 'off', act: 'play', tabs: 1, url: 'same', played: true, blocked: [], baseline: null },
  { t: 'click-redirect', name: 'mode-off: redirect allowed', mode: 'off', act: 'play', tabs: 0, url: 'ad', blocked: [], baseline: null },
  { t: 'legit-button-open', name: 'mode-strict: scripted popup blocked', mode: 'strict', act: '#share', tabs: 0, url: 'same', blocked: ['popup'], baseline: null },
  { t: 'legit-blank-link', name: 'mode-strict: real link still works', mode: 'strict', act: '#link', tabs: 1, url: 'same', blocked: [], baseline: null },
  { t: 'legit-modifier-link', name: 'mode-strict: ctrl+click still works', mode: 'strict', act: 'ctrl:#link', tabs: 1, url: 'same', blocked: [], baseline: null },
  { t: 'doc-click-popunder', name: 'per-site override: off for localhost only', mode: 'smart', site: { localhost: 'off' }, act: 'play', tabs: 1, url: 'same', played: true, blocked: [], baseline: null },
];

async function launch(withExt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'popshield-'));
  const args = ['--no-first-run', '--no-default-browser-check'];
  if (withExt) args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', headless: true, args,
    // Keep Chrome's real popup blocker on, so the baseline is realistic.
    ignoreDefaultArgs: ['--disable-popup-blocking', '--disable-extensions'],
    viewport: { width: 1000, height: 700 },
    acceptDownloads: true,
  });
  const env = { ctx, dir, withExt, sw: null };
  if (withExt) {
    env.sw = await extWorker(env);
    await closeWelcome(ctx);
  }
  return env;
}

// A fresh install opens the extension's welcome tab (runtime.onInstalled); it is not
// part of any scenario, so close it once and never count extension pages as tabs.
const isExtPage = (p) => p.url().startsWith('chrome-extension://');
async function closeWelcome(ctx) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && !ctx.pages().some(isExtPage)) await new Promise((r) => setTimeout(r, 50));
  for (const p of ctx.pages().filter(isExtPage)) await p.close().catch(() => {});
}

// The extension's service worker; re-fetched per case in case Chrome restarted it.
async function extWorker(env) {
  const live = env.ctx.serviceWorkers().find((w) => w.url().startsWith('chrome-extension://'));
  if (live) return (env.sw = live);
  // Poll as well as listen: under heavy load the worker can register before
  // our listener is attached, or take a while to start.
  const deadline = Date.now() + 45000;
  const ev = env.ctx.waitForEvent('serviceworker', { timeout: 45000 }).catch(() => null);
  while (Date.now() < deadline) {
    const w = env.ctx.serviceWorkers().find((x) => x.url().startsWith('chrome-extension://'));
    if (w) return (env.sw = w);
    const got = await Promise.race([ev, new Promise((r) => setTimeout(() => r(null), 200))]);
    if (got) return (env.sw = got);
  }
  throw new Error('extension service worker did not start within 45 s');
}

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function act(page, how) {
  if (how.includes(' ')) { for (const step of how.split(' ')) await act(page, step); return; }
  if (how === 'none') return;
  if (how.startsWith('wait:')) return page.waitForTimeout(+how.slice(5));
  if (how.startsWith('key:')) return page.keyboard.press(how.slice(4));
  if (how.startsWith('rclick:')) {
    const c = await center(page, how.slice(7));
    await page.mouse.click(c.x, c.y, { button: 'right' });
    return page.keyboard.press('Escape');
  }
  if (how === 'play') { const c = await center(page, '#play'); return page.mouse.click(c.x, c.y); }
  if (how === 'iframe') {
    const b = await page.frameLocator('#pf').locator('#ctrl').boundingBox();
    return page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  if (how.startsWith('frame:')) { // frame:<iframe selector>:<element selector inside it>
    const [, fsel, sel] = how.split(':');
    const b = await page.frameLocator(fsel).locator(sel).boundingBox();
    return page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }
  if (how === 'cdp-open') {
    // Simulates a hook bypass: a fresh isolated JS world has an untouched window.open.
    const cdp = await page.context().newCDPSession(page);
    const { frameTree } = await cdp.send('Page.getFrameTree');
    const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'bypass' });
    await cdp.send('Runtime.evaluate', { expression: "window.open('http://127.0.0.1:8712/ad.html?backstop')", contextId: executionContextId, userGesture: true });
    return;
  }
  if (how.startsWith('enter:')) {
    await page.locator(how.slice(6)).focus();
    return page.keyboard.press('Enter');
  }
  if (how === 'iframe-human-x2' || how === 'iframe-wait-reload' || how === 'iframe-wait-goto') {
    const b = await page.frameLocator('#pf').locator('#ctrl').boundingBox();
    const x = b.x + b.width / 2, y = b.y + b.height / 2;
    const humanClick = async () => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(90); await page.mouse.up(); };
    await humanClick();
    if (how === 'iframe-human-x2') { await page.waitForTimeout(2500); return humanClick(); } // 2nd click well after focus moved in
    // User watches a while, then reloads / types a URL. (In a real browser,
    // clicking the reload button or the address bar takes focus away from the
    // page, which already disarms the guard; headless Chromium can't emulate
    // that, so wait past the 6 s frame-click window instead.)
    await page.waitForTimeout(6500);
    if (how === 'iframe-wait-reload') return page.reload({ timeout: 5000 }).catch(() => {}); // a (wrongly) blocked navigation must not stall for 30s
    return page.goto('http://127.0.0.1:8712/ad.html?typed', { timeout: 5000 }).catch(() => {});
  }
  if (how.startsWith('iframe-then:')) {
    await act(page, 'iframe');
    await page.waitForTimeout(300);
    return act(page, how.slice(12));
  }
  if (how.startsWith('ctrl:')) {
    const c = await center(page, how.slice(5));
    await page.keyboard.down('Control'); await page.mouse.click(c.x, c.y); await page.keyboard.up('Control');
    return;
  }
  if (how.startsWith('middle:')) { const c = await center(page, how.slice(7)); return page.mouse.click(c.x, c.y, { button: 'middle' }); }
  const c = await center(page, how);
  return page.mouse.click(c.x, c.y);
}

function urlKind(u, start) {
  if (u === start) return 'same';
  if (u.includes('/ad.html')) return 'ad';
  if (u.includes('/other.html')) return 'other';
  if (u.includes('/rt-hop.html')) return 'hop';
  return u;
}

async function runCase(env, c, withExt) {
  const { ctx } = env;
  for (const p of ctx.pages()) await p.close().catch(() => {});
  const sw = withExt ? await extWorker(env) : null;
  if (sw) {
    await sw.evaluate(async ({ mode, site }) => {
      await chrome.storage.local.set({ defaultMode: mode, sites: site });
      await chrome.storage.session.clear();
    }, { mode: c.mode || 'smart', site: c.site || {} });
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); }); // "Stay on page"
  const start = BASE + c.t;
  let downloaded = false;
  page.on('download', () => { downloaded = true; });
  await page.goto(start);
  await page.waitForSelector('body[data-ready="1"]', { state: 'attached' }).catch(() => {});
  if (c.act.startsWith('iframe')) await page.frameLocator('#pf').locator('#ctrl').waitFor();
  await page.waitForTimeout(250); // let the bridge deliver the mode
  await act(page, c.act);
  await page.waitForTimeout(SETTLE + (c.wait || 0));

  const others = ctx.pages().filter((p) => p !== page && !isExtPage(p));
  const res = {
    tabs: others.length,
    tabUrls: others.map((p) => p.url()),
    url: urlKind(page.url(), start),
    played: await page.evaluate(() => document.body?.dataset.played === '1').catch(() => false),
    iframePlayed: c.iframePlayed
      ? await page.frameLocator('#pf').locator('#ctrl').textContent({ timeout: 1000 }).then((t) => t === 'Pause').catch(() => false)
      : undefined,
    downloaded: downloaded || await page.evaluate(() => document.body?.dataset.downloaded === '1').catch(() => false),
    errors,
    dialogs,
    blocked: [],
  };
  if (sw) {
    const all = await sw.evaluate(() => chrome.storage.session.get(null));
    res.blocked = Object.entries(all).filter(([k]) => k.startsWith('log:')).flatMap(([, v]) => v);
  }
  return res;
}

function check(c, r, withExt) {
  const fails = [];
  const exp = withExt ? c : c.baseline;
  if (!exp) return fails;
  if (exp.tabs !== undefined && r.tabs !== exp.tabs) fails.push(`tabs ${r.tabs} (want ${exp.tabs}) ${r.tabUrls.join(' ')}`);
  const wantUrl = exp.url || 'same';
  if (r.url !== wantUrl) fails.push(`main tab at "${r.url}" (want "${wantUrl}")`);
  const adTabs = r.tabUrls.filter((u) => u.includes('/ad.html')).length;
  if (exp.adTab === true && !adTabs) fails.push(`no tab reached the ad page (${r.tabUrls.join(' ') || 'no tabs'})`);
  if (exp.adTab === false && adTabs) fails.push(`${adTabs} tab(s) at the ad page`);
  if (withExt) {
    if (c.played && !r.played) fails.push('player button stopped working');
    if (c.iframePlayed && !r.iframePlayed) fails.push('iframe player button stopped working');
    if (c.downloaded && !r.downloaded) fails.push('download did not happen');
    const kinds = r.blocked.map((b) => b.kind);
    for (const k of c.blocked || []) if (!kinds.includes(k)) fails.push(`expected "${k}" in block log, got [${kinds}]`);
    if (c.blockedAny && !c.blockedAny.some((k) => kinds.includes(k))) fails.push(`expected one of [${c.blockedAny}] in block log, got [${kinds}]`);
    if (c.blocked && c.blocked.length === 0 && kinds.length) fails.push(`false positive: logged [${kinds}]`);
    if (c.maxBlocked !== undefined && r.blocked.length > c.maxBlocked) fails.push(`block log has ${r.blocked.length} entries (want <= ${c.maxBlocked})`);
    if (c.dialog && !r.dialogs.includes(c.dialog)) fails.push(`expected a ${c.dialog} dialog, got [${r.dialogs}]`);
    if (c.noDialog && r.dialogs.length) fails.push(`unexpected dialog [${r.dialogs}]`);
    if (r.errors.length) fails.push('page errors: ' + r.errors.join(' | '));
  }
  return fails;
}

// Rough per-case wall time, used to start the slow cases first (longest-first scheduling).
function cost(c) {
  let ms = SETTLE + 600 + (c.wait || 0);
  if (c.act === 'iframe-human-x2') ms += 2700;
  else if (c.act.startsWith('iframe-wait')) ms += 2200;
  else if (c.act.startsWith('iframe') || c.act.startsWith('frame:')) ms += 400;
  return ms;
}

function defaultWorkers() {
  const byMem = Math.floor(os.totalmem() / 2 ** 30); // ~1 GB per headless Chromium is plenty
  return Math.max(2, Math.min(os.cpus().length, byMem, 12));
}

const only = process.argv[2];
const selected = CASES.map((c, i) => ({ c, i, name: c.name || c.t })).filter((x) => !only || x.name.includes(only));
const jobs = {
  false: selected.filter((x) => x.c.baseline),
  true: selected,
};
const total = jobs.false.length + jobs.true.length;
if (!total) { console.log('no cases matched'); process.exit(1); }

// Split the browsers between the two passes in proportion to their work.
const W = Math.max(2, parseInt(process.env.E2E_WORKERS, 10) || defaultWorkers());
const work = (list) => list.reduce((a, x) => a + cost(x.c), 0);
const wB = work(jobs.false), wE = work(jobs.true);
let nE = jobs.true.length ? Math.max(1, Math.round((W * wE) / (wB + wE))) : 0;
let nB = jobs.false.length ? Math.max(1, W - nE) : 0;
nE = Math.min(nE, jobs.true.length); nB = Math.min(nB, jobs.false.length);

async function runPass(withExt, list, n) {
  const queue = [...list].sort((a, b) => cost(b.c) - cost(a.c) || a.i - b.i);
  const results = new Map();
  const worker = async () => {
    let env = null, launchErr = null;
    try { env = await launch(withExt); } catch (e) { launchErr = e; }
    try {
      for (let x; (x = queue.shift());) {
        let r = null, fails;
        if (launchErr) fails = [`browser launch failed: ${launchErr.message.split('\n')[0]}`];
        else {
          try {
            r = await runCase(env, x.c, withExt);
            fails = check(x.c, r, withExt);
          } catch (e) { fails = [`harness error: ${e.message.split('\n')[0]}`]; }
        }
        results.set(x.i, { r, fails });
        process.stderr.write(fails.length ? 'F' : '.');
      }
    } finally {
      if (env) {
        await env.ctx.close().catch(() => {});
        fs.rmSync(env.dir, { recursive: true, force: true, maxRetries: 3 });
      }
    }
  };
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}

const stop = startServers();
const t0 = Date.now();
let res;
try {
  process.stderr.write(`running ${total} checks on ${nB} baseline + ${nE} PopShield browsers\n`);
  res = await Promise.all([runPass(false, jobs.false, nB), runPass(true, jobs.true, nE)]);
  process.stderr.write('\n');
} finally {
  stop();
}

let failed = 0, knownOpen = 0, knownFixed = 0;
for (const withExt of [false, true]) {
  const list = jobs[withExt];
  if (!list.length) continue;
  console.log(`\n=== ${withExt ? 'WITH PopShield' : 'BASELINE (no extension) — attacks should succeed'} ===`);
  const results = res[withExt ? 1 : 0];
  for (const x of list) { // CASES order
    const { r, fails } = results.get(x.i);
    const c = x.c;
    const detail = !r ? '' : withExt ? `  blocked: [${r.blocked.map((b) => `${b.kind}/${b.reason}`).join(', ')}]` : `  tabs=${r.tabs} url=${r.url}`;
    // A known, still-open bypass is reported but doesn't fail the run (its baseline still must).
    const known = withExt && c.knownBypass;
    const status = known ? (fails.length ? 'OPEN' : 'FIXD') : fails.length ? 'FAIL' : 'pass';
    console.log(`${status}  ${x.name}${known ? '  [known bypass]' : ''}${detail}${c.note && withExt ? `\n      note: ${c.note}` : ''}`);
    for (const f of fails) console.log('      - ' + f);
    if (known && !fails.length) console.log('      - now blocked: drop knownBypass from this case');
    if (known) { if (fails.length) knownOpen++; else knownFixed++; } else if (fails.length) failed++;
  }
}
const known = knownOpen + knownFixed;
console.log(`\n${total - known - failed}/${total - known} checks passed (${((Date.now() - t0) / 1000).toFixed(1)}s)` +
  (known ? `; known bypasses: ${knownOpen} still open, ${knownFixed} now blocked (not counted)` : ''));
process.exit(failed ? 1 : 0);
