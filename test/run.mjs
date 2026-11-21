// End-to-end tests: real Chromium, real extension, real clicks.
//   node test/run.mjs            -> baseline (no extension) + PopShield runs
// Each scenario is run twice:
//   1. baseline, without the extension — proves the attack really works in Chrome
//   2. with PopShield — must block the attack / keep legit behaviour working
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServers } from './server.mjs';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://localhost:8711/scenario.html?t=';
const SETTLE = 1500; // > backstop grace (400ms) + slack

// tabs: new tabs left open afterwards. url: where the main tab must end up
// ('same' = unchanged). played: the player's own button must still work.
// blocked: kinds PopShield must log. baseline: what Chrome alone does.
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
  let sw = null;
  if (withExt) sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  return { ctx, sw };
}

async function center(page, sel) {
  const b = await page.locator(sel).boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

async function act(page, how) {
  if (how === 'none') return;
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
    await page.waitForTimeout(2000); // user watches a bit, then reloads / types a URL
    if (how === 'iframe-wait-reload') return page.reload().catch(() => {});
    return page.goto('http://127.0.0.1:8712/ad.html?typed').catch(() => {});
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
  return u;
}

async function runCase(env, c, withExt) {
  const { ctx, sw } = env;
  for (const p of ctx.pages()) await p.close().catch(() => {});
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
  await page.waitForTimeout(SETTLE);

  const others = ctx.pages().filter((p) => p !== page);
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

const stop = startServers();
let failed = 0;
const summary = [];
try {
  for (const withExt of [false, true]) {
    const env = await launch(withExt);
    console.log(`\n=== ${withExt ? 'WITH PopShield' : 'BASELINE (no extension) — attacks should succeed'} ===`);
    const only = process.argv[2];
    for (const c of CASES) {
      if (!withExt && !c.baseline) continue;
      if (only && !(c.name || c.t).includes(only)) continue;
      const r = await runCase(env, c, withExt);
      const fails = check(c, r, withExt);
      const name = c.name || c.t;
      const detail = withExt ? `  blocked: [${r.blocked.map((b) => `${b.kind}/${b.reason}`).join(', ')}]` : `  tabs=${r.tabs} url=${r.url}`;
      console.log(`${fails.length ? 'FAIL' : 'pass'}  ${name}${detail}${c.note && withExt ? `\n      note: ${c.note}` : ''}`);
      for (const f of fails) console.log('      - ' + f);
      if (fails.length) failed++;
      summary.push({ withExt, name, fails });
    }
    await env.ctx.close();
  }
} finally {
  stop();
}
const total = summary.length;
if (!total) { console.log('no cases matched'); process.exit(1); }
console.log(`\n${total - failed}/${total} checks passed`);
process.exit(failed ? 1 : 0);
