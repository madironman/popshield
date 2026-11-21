// UI test for the toolbar popup: triggers real blocks, opens the popup for that
// tab, checks the log + mode switch, and saves screenshots (light + dark).
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { startServers } from './server.mjs';

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(EXT, 'test', 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const stop = startServers();
const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'popshield-ui-')), {
  channel: 'chromium', headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  ignoreDefaultArgs: ['--disable-popup-blocking', '--disable-extensions'],
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 45000 });
const extId = new URL(sw.url()).host;
// Fresh install opens the welcome tab (runtime.onInstalled); wait for it and close it
// so it is not mistaken for a tab opened by the popup.
for (const end = Date.now() + 3000; Date.now() < end && !ctx.pages().some((p) => p.url().startsWith('chrome-extension://'));) await new Promise((r) => setTimeout(r, 50));
for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'pass' : 'FAIL'}  ${msg}`); if (!cond) failed++; };

// Trigger three different blocks on one page.
const page = await ctx.newPage();
page.on('dialog', (d) => d.dismiss());
await page.goto('http://localhost:8711/scenario.html?t=tab-under');
await page.waitForTimeout(300);
const b = await page.locator('#play').boundingBox();
await page.mouse.click(b.x + 5, b.y + 5);
await page.waitForTimeout(800);
await page.evaluate(() => { const a = document.createElement('a'); a.href = 'http://127.0.0.1:8712/ad.html?late'; a.target = '_blank'; a.click(); });
await page.waitForTimeout(800);
const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'http://localhost:8711/*' }))[0].id);
const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
ok(badge === '3', `toolbar badge shows 3 (got "${badge}")`);

for (const scheme of ['light', 'dark']) {
  const ui = await ctx.newPage();
  await ui.emulateMedia({ colorScheme: scheme });
  await ui.setViewportSize({ width: 360, height: 520 });
  await ui.goto(`chrome-extension://${extId}/src/popup.html?tab=${tabId}`);
  await ui.waitForSelector('#log li');
  const items = await ui.locator('#log li .kind').allTextContents();
  if (scheme === 'light') {
    ok(items.length === 3, `popup lists 3 blocked items: ${items.join(', ')}`);
    ok((await ui.locator('#site').textContent()) === 'localhost', 'popup shows the current site');
    ok((await ui.locator('.seg button[aria-pressed="true"]').textContent()) === 'Smart', 'Smart is selected by default');
    ok((await ui.locator('#log li button').count()) === 3, 'each blocked item has an Open button');
  }
  await ui.screenshot({ path: path.join(OUT, `popup-${scheme}.png`), fullPage: true });
  if (scheme === 'light') {
    await ui.click('.seg button[data-mode="strict"]');
    await ui.waitForTimeout(200);
    const sites = await sw.evaluate(() => chrome.storage.local.get('sites'));
    ok(sites.sites.localhost === 'strict', 'clicking Strict saves a per-site override');
    await ui.click('.seg button[data-mode="smart"]');
    await ui.waitForTimeout(200);
    const sites2 = await sw.evaluate(() => chrome.storage.local.get('sites'));
    ok(!('localhost' in sites2.sites), 'picking the default again removes the override');
    // Report button -> pre-filled GitHub issue (github.com stubbed: no network in tests).
    await ctx.route('https://github.com/**', (r) => r.fulfill({ body: 'stub', contentType: 'text/plain' }));
    const [issue] = await Promise.all([ctx.waitForEvent('page'), ui.click('#report-ad')]);
    await issue.waitForLoadState('domcontentloaded').catch(() => {});
    const iu = new URL(issue.url());
    ok(iu.pathname === '/madironman/popshield/issues/new' && iu.searchParams.get('template') === 'ad-got-through.yml' &&
      iu.searchParams.get('url') === 'http://localhost:8711/scenario.html' && /popup|redirect|scripted/.test(iu.searchParams.get('blocked-log') || ''),
      'Report button opens a pre-filled issue (site without query string, blocked summary)');
    await issue.close();
    const before = ctx.pages().length;
    await ui.locator('#log li button').first().click();
    await ui.waitForTimeout(500);
    ok(ctx.pages().length === before + 1, 'Open button opens the blocked item in a new tab');
  }
  await ui.close();
}
await ctx.close();
stop();
console.log(failed ? `\n${failed} popup check(s) failed` : '\nall popup checks passed');
process.exit(failed ? 1 : 0);
