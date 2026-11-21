// Regenerates the store images. Run from the repo root:
//   node store/image-src/capture.mjs && node store/image-src/render.mjs
// capture.mjs writes real popup/demo screenshots to store/image-src/raw/ (all requests
// are answered locally by Playwright routing; nothing goes to the network).
// Captures real PopShield popup screenshots and a demo streaming page, with and
// without the extension. All requests are fulfilled locally via page routing:
// nothing goes to the network.
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const EXT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), 'raw');
fs.mkdirSync(OUT, { recursive: true });
fs.copyFileSync(path.join(EXT, 'icons/128.png'), path.join(OUT, 'icon128.png'));

const SITE = 'https://www.watch.example/series/night-harbor/episode-4';

const DEMO = `<!doctype html><html><head><meta charset="utf-8"><title>Night Harbor · Episode 4</title>
<style>
*{box-sizing:border-box} body{margin:0;background:#0f1115;color:#e8eaed;font:15px/1.45 "Ubuntu Sans",sans-serif;min-height:100vh}
nav{display:flex;align-items:center;gap:28px;padding:16px 32px;background:#16191f;border-bottom:1px solid #262a33}
nav b{font-size:20px;letter-spacing:.5px;color:#fff} nav span{color:#9aa0a6}
main{display:flex;gap:28px;padding:28px 32px}
#player{flex:1;aspect-ratio:16/9;border-radius:10px;position:relative;overflow:hidden;
 background:radial-gradient(circle at 30% 35%,#3a4a63 0,#1b2230 45%,#0b0d12 100%)}
#player .bigplay{position:absolute;left:50%;top:50%;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;
 background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.6)}
#player .bigplay:after{content:"";position:absolute;left:33px;top:24px;border-left:26px solid #fff;border-top:18px solid transparent;border-bottom:18px solid transparent}
#bar{position:absolute;left:0;right:0;bottom:0;padding:12px 16px;display:flex;align-items:center;gap:14px;background:linear-gradient(transparent,rgba(0,0,0,.7))}
#bar button{background:none;border:0;color:#fff;font:inherit;font-weight:600;cursor:pointer}
#bar .track{flex:1;height:4px;border-radius:2px;background:rgba(255,255,255,.25);position:relative}
#bar .track i{position:absolute;left:0;top:0;bottom:0;width:18%;background:#e53935;border-radius:2px}
aside{width:300px} aside h3{margin:0 0 12px;font-size:15px;color:#9aa0a6;font-weight:600}
.ep{display:flex;gap:12px;margin-bottom:12px;align-items:center}
.ep i{width:110px;height:62px;border-radius:6px;background:linear-gradient(135deg,#2b3446,#151a24)}
.ep.cur i{outline:2px solid #e53935}
h1{font-size:22px;margin:18px 0 4px} .meta{color:#9aa0a6}
</style></head><body>
<nav><b>WATCH</b><span>Home</span><span>Series</span><span>Movies</span><span>My list</span></nav>
<main><div style="flex:1">
<div id="player"><div class="bigplay"></div><div id="bar"><button id="play">Play</button><div class="track"><i></i></div><span>12:04 / 58:30</span></div></div>
<h1>Night Harbor - Episode 4</h1><div class="meta">Season 1 · 58 min</div>
</div>
<aside><h3>Up next</h3>
<div class="ep cur"><i></i><div>Episode 4<br><span class="meta">58 min</span></div></div>
<div class="ep"><i></i><div>Episode 5<br><span class="meta">55 min</span></div></div>
<div class="ep"><i></i><div>Episode 6<br><span class="meta">61 min</span></div></div>
<div class="ep"><i></i><div>Episode 7<br><span class="meta">49 min</span></div></div>
</aside></main>
<script>
  // Typical ad-network tricks, reproduced for the demo:
  document.getElementById('play').addEventListener('click', (e) => { e.target.textContent = 'Pause'; });
  let n = 0;
  document.addEventListener('click', () => {            // page-wide "OnClick" popunder hook
    n++;
    if (n === 1) window.open('https://pop.ads.example/r?zone=4471&sub=watch');
    if (n >= 2 && !window.tu) { window.tu = 1; window.open(location.href); location.href = 'https://prize-winner.example/claim?id=88'; } // tab-under
    if (n === 1) setTimeout(() => {                        // invisible full-page ad layer
      const a = document.createElement('a'); a.href = 'https://track.ads.example/ov?c=12'; a.target = '_blank';
      a.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent'; a.id = 'ov';
      a.addEventListener('click', () => setTimeout(() => a.remove(), 0));
      document.body.append(a);
    }, 100);
  });
  setTimeout(() => window.open('https://casino-deals.example/?ref=watch'), 1200); // no user action
</script></body></html>`;

const AD = (u) => `<!doctype html><html><head><meta charset="utf-8"><title>${new URL(u).hostname}</title></head>
<body style="margin:0;font:28px sans-serif;background:#ffeb3b;display:grid;place-items:center;height:100vh"><b>Advertisement</b></body></html>`;

async function launch(withExt) {
  const args = withExt ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : [];
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ps-store-')), {
    channel: 'chromium', headless: true, args,
    ignoreDefaultArgs: ['--disable-popup-blocking', ...(withExt ? ['--disable-extensions'] : [])],
    viewport: { width: 1280, height: 720 },
  });
  await ctx.route((u) => /^https?:/.test(u.href), (route) => {
    const u = route.request().url();
    if (u.startsWith('https://www.watch.example/')) return route.fulfill({ contentType: 'text/html', body: DEMO });
    return route.fulfill({ contentType: 'text/html', body: AD(u) });
  });
  return ctx;
}

async function runDemo(ctx) {
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  await page.goto(SITE);
  await page.waitForTimeout(400);
  await page.click('#play');            // 1st click: popunder + overlay appears
  await page.waitForTimeout(700);
  await page.mouse.click(400, 300);     // 2nd click: lands on overlay
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('ov')?.remove());
  await page.mouse.click(900, 200);     // 3rd click: tab-under (open copy + hijack this tab)
  await page.waitForTimeout(1200);
  return page;
}

// ---------- without extension: count what opens ----------
{
  const ctx = await launch(false);
  const page = await runDemo(ctx);
  await page.waitForTimeout(500);
  const tabs = ctx.pages().map((p) => p.url());
  fs.writeFileSync(path.join(OUT, 'without.json'), JSON.stringify({ tabs, mainUrl: page.url() }, null, 2));
  console.log('without extension:', tabs);
  await ctx.close();
}

// ---------- with extension ----------
{
  const ctx = await launch(true);
  const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = await runDemo(ctx);
  // remove the (already-neutralised) overlay so the page screenshot is clean
  await page.evaluate(() => document.getElementById('ov')?.remove());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.screenshot({ path: path.join(OUT, 'demo-page.png') });
  const tabs = ctx.pages().map((p) => p.url());
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.watch.example/*' }))[0].id);
  const badge = await sw.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  const log = await sw.evaluate((id) => chrome.storage.session.get('log:' + id), tabId);
  fs.writeFileSync(path.join(OUT, 'with.json'), JSON.stringify({ tabs, badge, mainUrl: page.url(), log }, null, 2));
  console.log('with extension:', tabs, 'badge', badge);

  const FONT = 'body{font-family:"Ubuntu Sans",system-ui,sans-serif !important}';
  for (const [scheme, mode] of [['light','smart'],['dark','smart'],['light','strict'],['dark','strict']]) {
    const ui = await ctx.newPage();
    await ui.emulateMedia({ colorScheme: scheme });
    await ui.setViewportSize({ width: 720, height: 1400 });
    await ui.goto(`chrome-extension://${extId}/src/popup.html?tab=${tabId}`);
    await ui.addStyleTag({ content: FONT + 'html{zoom:2} ul{max-height:none !important}' });
    await ui.waitForSelector('#log li');
    const want = mode;
    const cur = await ui.locator('.seg button[aria-pressed="true"]').getAttribute('data-mode');
    if (cur !== want) { await ui.click(`.seg button[data-mode="${want}"]`); }
    await ui.waitForTimeout(400);
    const h = await ui.evaluate(() => Math.ceil(document.documentElement.getBoundingClientRect().height * 2));
    await ui.setViewportSize({ width: 720, height: h });
    await ui.waitForTimeout(100);
    await ui.locator('body').screenshot({ path: path.join(OUT, `popup-${scheme}-${mode}.png`) });
    await ui.close();
  }
  await ctx.close();
}
console.log('done');
