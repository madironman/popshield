// Live check against a real site: clicks around the page (and inside the biggest
// iframe, usually the video player) with and without PopShield, and reports
// every tab that got opened and whether the main tab was hijacked.
//   node test/live.mjs <url> [clicks] [--json] [--shots <dir>] [--label <name>]
// POPSHIELD_EXT=<dir> tests a different copy of the extension.
// --shots <dir> saves screenshots (page loaded, after clicks, every opened tab,
// every hijack) as <label>-<baseline|ext>-*.png into <dir>.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const EXT = process.env.POPSHIELD_EXT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = process.argv.slice(2);
const opt = (name) => { const i = raw.indexOf(name); if (i < 0) return null; const v = raw[i + 1]; raw.splice(i, 2); return v; };
const SHOTS = opt('--shots');
const LABEL = (opt('--label') || 'site').replace(/[^\w.-]/g, '_');
const argv = raw.filter((a) => a !== '--json');
const JSON_OUT = process.argv.includes('--json');
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = async (p, name) => {
  if (!SHOTS) return;
  const file = path.join(SHOTS, `${LABEL}-${name}.png`);
  await p.screenshot({ path: file, timeout: 8000 }).then(() => { if (!JSON_OUT) console.log('  screenshot:', file); }).catch(() => {});
};
const url = argv[0];
const CLICKS = Number(argv[1] || 8);
if (!url) { console.error('usage: node test/live.mjs <url> [clicks]'); process.exit(2); }

// Compare registrable sites, so same-site navigation (www. vs cdn.) is not a "hijack".
const MULTI = new Set(['co.uk', 'org.uk', 'com.au', 'co.jp', 'co.in', 'co.nz', 'com.br', 'co.za', 'com.tr']);
const host = (u) => {
  try {
    const h = new URL(u).hostname; const p = h.split('.');
    if (/^[\d.]+$/.test(h) || p.length <= 2) return h;
    return MULTI.has(p.slice(-2).join('.')) ? p.slice(-3).join('.') : p.slice(-2).join('.');
  } catch { return u; }
};

async function run(withExt) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'popshield-live-'));
  const args = ['--no-first-run', '--mute-audio', '--disable-blink-features=AutomationControlled'];
  if (withExt) args.push(`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`);
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', headless: true, args,
    ignoreDefaultArgs: ['--disable-popup-blocking', '--disable-extensions'],
    viewport: { width: 1280, height: 800 },
    acceptDownloads: false,
    // Ad networks often skip "HeadlessChrome"; look like a normal desktop Chrome.
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });
  let sw = null;
  if (withExt) sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const opened = [];
  const openedUrls = new Map();
  const tag = withExt ? 'ext' : 'baseline';
  ctx.on('page', (p) => {
    opened.push(p);
    const n = opened.length;
    p.waitForLoadState('domcontentloaded', { timeout: 10000 }).then(() => p.waitForTimeout(1500)).then(() => shot(p, `${tag}-adtab-${n}`)).catch(() => {});
    p.on('framenavigated', (f) => { if (f === p.mainFrame() && f.url() !== 'about:blank') openedUrls.set(p, f.url()); });
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const dialogs = [];
  page.on('dialog', (d) => { dialogs.push(d.type()); d.dismiss().catch(() => {}); });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => console.log('  goto:', e.message));
  await page.waitForTimeout(8000);
  await shot(page, `${tag}-01-loaded`);
  const startHost = host(page.url());
  const hijacks = [];

  for (let i = 0; i < CLICKS; i++) {
    if (host(page.url()) !== startHost) {
      hijacks.push(page.url());
      await shot(page, `${tag}-hijack-${hijacks.length}`);
      await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(5000);
    }
    // Biggest visible iframe = the player; alternate between its centre and its control bar.
    const box = await page.evaluate(() => {
      let best = null;
      for (const f of document.querySelectorAll('iframe')) {
        const r = f.getBoundingClientRect();
        if (r.width * r.height > 40000 && (!best || r.width * r.height > best.width * best.height)) best = { x: r.x, y: r.y, width: r.width, height: r.height };
      }
      return best;
    }).catch(() => null);
    const vw = 1280, vh = 800;
    // Otherwise: the page's own visible control buttons (play, seek, volume, ...), plus the video area.
    const buttons = box ? [] : await page.evaluate(() => [...document.querySelectorAll('button,[role=button]')]
      .map((b) => ({ r: b.getBoundingClientRect(), t: (b.innerText || b.getAttribute('aria-label') || '').trim() }))
      .filter(({ r, t }) => r.width > 8 && r.height > 8 && r.bottom > 500 && r.top < 800 && !/back|next|skip|episode/i.test(t))
      .slice(0, 6).map(({ r }) => [r.x + r.width / 2, r.y + r.height / 2])).catch(() => []);
    const pts = box
      ? [[box.x + box.width / 2, box.y + box.height / 2], [box.x + 40, box.y + box.height - 25], [box.x + box.width - 40, box.y + box.height - 25], [vw / 2, vh - 60]]
      : [[vw / 2, vh / 2], ...buttons];
    const [x, y] = pts[i % pts.length];
    await page.mouse.click(x, y).catch(() => {});
    await page.waitForTimeout(1500);
  }
  if (host(page.url()) !== startHost) { hijacks.push(page.url()); await shot(page, `${tag}-hijack-${hijacks.length}`); }
  await shot(page, `${tag}-02-after-clicks`);
  await page.waitForTimeout(1000);

  const stillOpen = ctx.pages().filter((p) => p !== page).map((p) => p.url());
  let log = [];
  if (sw) {
    const all = await sw.evaluate(() => chrome.storage.session.get(null)).catch(() => ({}));
    log = Object.entries(all).filter(([k]) => k.startsWith('log:')).flatMap(([, v]) => v);
  }
  await ctx.close();
  return { opened: opened.length, openedUrls: [...openedUrls.values()], stillOpen, hijacks, dialogs, log, finalHost: startHost };
}

const results = {};
const guard = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('site timed out')), 150000))]);
for (const withExt of [false, true]) {
  let r;
  try { r = await guard(run(withExt)); } catch (e) { r = { error: e.message, opened: 0, openedUrls: [], stillOpen: [], hijacks: [], dialogs: [], log: [] }; }
  results[withExt ? 'withPopShield' : 'baseline'] = r;
  if (JSON_OUT) continue;
  if (r.error) console.log('  ERROR:', r.error);
  console.log(`\n=== ${withExt ? 'WITH PopShield' : 'BASELINE (no extension)'} — ${CLICKS} clicks on ${url}`);
  console.log(`  tabs opened during session: ${r.opened}`);
  console.log(`  tabs still open at end:     ${r.stillOpen.length}`);
  for (const u of r.stillOpen) console.log('     -', u.slice(0, 140));
  for (const u of r.openedUrls) console.log('     opened ->', u.slice(0, 140));
  console.log(`  main tab hijacked:          ${r.hijacks.length}`);
  if (r.dialogs.length) console.log(`  dialogs:                    ${r.dialogs.join(', ')}`);
  for (const u of r.hijacks) console.log('     -', u.slice(0, 140));
  if (withExt) {
    console.log(`  PopShield blocked:          ${r.log.length}`);
    for (const b of r.log) console.log(`     - ${b.kind}/${b.reason}  ${String(b.url).slice(0, 110)}`);
  }
}
if (JSON_OUT) console.log(JSON.stringify({ url, clicks: CLICKS, ...results }));
process.exit(0);
