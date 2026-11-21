// Regenerates the store images. Run from the repo root:
//   node store/image-src/capture.mjs && node store/image-src/render.mjs
// capture.mjs writes real popup/demo screenshots to store/image-src/raw/ (all requests
// are answered locally by Playwright routing; nothing goes to the network).
// Captures real PopShield popup screenshots and a generic demo page, with and
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

const SITE = 'https://www.site.example/example-page';

const DEMO = `<!doctype html><html><head><meta charset="utf-8"><title>Example page</title><link rel="icon" href="data:,">
<style>
*{box-sizing:border-box} body{margin:0;background:#f6f8fb;color:#1f2328;font:17px/1.55 "Ubuntu Sans",sans-serif;min-height:100vh}
header{display:flex;align-items:center;gap:30px;padding:16px 40px;background:#fff;border-bottom:1px solid #dde3ea}
header b{font-size:20px;letter-spacing:.2px} header span{color:#5d6670}
main{display:flex;gap:44px;padding:40px 40px}
article{flex:1;min-width:0}
h1{font-size:38px;line-height:1.15;margin:0 0 8px} .meta{color:#5d6670;margin-bottom:20px}
p{margin:0 0 14px;max-width:60ch}
#extra{display:none}
.actions{display:flex;gap:12px;margin-top:24px}
button{font:inherit;font-weight:600;border-radius:9px;padding:10px 20px;cursor:pointer}
#more{background:#1a73e8;color:#fff;border:1px solid #1a73e8}
#share{background:#fff;color:#1f2328;border:1px solid #cfd8e6}
figure{width:430px;margin:0;flex:none}
.pic{height:270px;border-radius:14px;position:relative;overflow:hidden;background:linear-gradient(180deg,#cfe1fb 0,#e9f1fd 100%)}
.pic i{position:absolute;left:52px;top:44px;width:58px;height:58px;border-radius:50%;background:#fdd663}
.pic b{position:absolute;left:-40px;right:-40px;bottom:-150px;height:260px;border-radius:50%;background:#9fc3f5}
.pic u{position:absolute;right:-120px;bottom:-170px;width:420px;height:300px;border-radius:50%;background:#7fadee}
figcaption{color:#5d6670;font-size:14px;margin-top:10px}
</style></head><body>
<header><b>Example site</b><span>Home</span><span>Articles</span><span>About</span><span>Contact</span></header>
<main><article>
<h1>Example page</h1><div class="meta">A sample article · 3 min read</div>
<p>This is an ordinary web page: a heading, a few paragraphs of text, a picture and a couple of buttons. Nothing on it should open a new tab unless you ask for one.</p>
<p>Pages also load scripts from other places. Most are harmless. Some listen for every click on the page and use it to open an advertisement in a new tab, or to send the tab you are reading somewhere else.</p>
<p id="extra">The buttons on this page are its own: they only change what you see here. You clicked one of them, and the page did what you asked.</p>
<div class="actions"><button id="more">Read more</button><button id="share">Share</button></div>
</article>
<figure><div class="pic"><i></i><b></b><u></u></div><figcaption>A picture on the page</figcaption></figure>
</main>
<script>
  // The page's own button: it only changes the page.
  document.getElementById('more').addEventListener('click', (e) => {
    const x = document.getElementById('extra'); const open = x.style.display === 'block';
    x.style.display = open ? 'none' : 'block'; e.target.textContent = open ? 'Read more' : 'Show less';
  });
  // Typical popup-script tricks, reproduced for the demo:
  let n = 0;
  document.addEventListener('click', () => {            // page-wide popunder hook
    n++;
    if (n === 1) window.open('https://pop.ads.example/r?zone=4471&sub=page');
    if (n >= 2 && !window.tu) { window.tu = 1; window.open(location.href); location.href = 'https://prize-winner.example/claim?id=88'; } // tab-under
    if (n === 1) setTimeout(() => {                        // invisible full-page ad layer
      const a = document.createElement('a'); a.href = 'https://track.ads.example/ov?c=12'; a.target = '_blank';
      a.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent'; a.id = 'ov';
      a.addEventListener('click', () => setTimeout(() => a.remove(), 0));
      document.body.append(a);
    }, 100);
  });
  setTimeout(() => window.open('https://deals.example/?ref=page'), 1200); // no user action
</script></body></html>`;

const AD = (u) => `<!doctype html><html><head><meta charset="utf-8"><title>${new URL(u).hostname}</title><link rel="icon" href="data:,"></head>
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
    if (u.startsWith('https://www.site.example/')) return route.fulfill({ contentType: 'text/html', body: DEMO });
    return route.fulfill({ contentType: 'text/html', body: AD(u) });
  });
  return ctx;
}

async function runDemo(ctx) {
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss());
  await page.goto(SITE);
  await page.waitForTimeout(400);
  await page.click('#more');            // 1st click, on the page's own button: popunder + overlay appears
  await page.waitForTimeout(700);
  await page.mouse.click(400, 300);     // 2nd click, on the page's text: lands on the overlay
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('ov')?.remove());
  await page.mouse.click(900, 250);     // 3rd click, on the picture: tab-under (open copy + hijack this tab)
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
  // A fresh install opens the welcome tab: wait for it and close it, so it cannot take
  // focus from the demo page (a background tab cannot be screenshotted).
  for (const end = Date.now() + 3000; Date.now() < end && !ctx.pages().some((p) => p.url().startsWith('chrome-extension://'));) await new Promise((r) => setTimeout(r, 50));
  for (const p of ctx.pages()) if (p.url().startsWith('chrome-extension://')) await p.close().catch(() => {});
  const page = await runDemo(ctx);
  // remove the (already-neutralised) overlay so the page screenshot is clean
  await page.evaluate(() => document.getElementById('ov')?.remove());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.bringToFront();
  await page.screenshot({ path: path.join(OUT, 'demo-page.png') });
  const tabs = ctx.pages().map((p) => p.url());
  const tabId = await sw.evaluate(async () => (await chrome.tabs.query({ url: 'https://www.site.example/*' }))[0].id);
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
