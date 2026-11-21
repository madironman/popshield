import { chromium } from 'playwright';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(dir, '../images');
const jobs = [
  ['hero', 1280, 800, 'screenshot-1-blocked.png'],
  ['beforeafter', 1280, 800, 'screenshot-2-before-after.png'],
  ['modes', 1280, 800, 'screenshot-3-modes.png'],
  ['dark', 1280, 800, 'screenshot-4-dark.png'],
  ['privacy', 1280, 800, 'screenshot-5-privacy.png'],
  ['tile', 440, 280, 'promo-small-440x280.png'],
  ['marquee', 1400, 560, 'promo-marquee-1400x560.png'],
];
const b = await chromium.launch({ channel: 'chromium' });
for (const [s, w, h, f] of jobs) {
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.goto(`file://${dir}/compose.html?s=${s}`);
  await p.waitForLoadState('load'); await p.waitForTimeout(150);
  await p.screenshot({ path: path.join(OUT, f), clip: { x: 0, y: 0, width: w, height: h } });
  await p.close();
}
await b.close();
