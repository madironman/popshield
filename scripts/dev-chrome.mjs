#!/usr/bin/env node
// Opens a visible Chromium with PopShield loaded from this folder, plus the
// local test pages, so you can click around and watch it work.
//   npm run dev                 -> opens the default attack page
//   npm run dev -- <scenario>   -> opens test/fixtures/scenario.html?t=<scenario>
// Uses Playwright's Chromium (installed by `npx playwright install chromium`).
// The profile is temporary; nothing touches your normal browser.
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServers } from '../test/server.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scenario = process.argv[2] || 'doc-click-popunder';

// The tests use the same ports, so refuse to start while a test run is going.
process.on('uncaughtException', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${e.port} is busy. Is a test run or another dev browser open? Close it and retry.`);
  else console.error(e);
  process.exit(1);
});
const stop = startServers();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'popshield-dev-'));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run'],
  ignoreDefaultArgs: ['--disable-popup-blocking', '--disable-extensions'],
});
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto(`http://localhost:8711/scenario.html?t=${encodeURIComponent(scenario)}`);
console.log(`PopShield dev browser is open on scenario "${scenario}".`);
console.log('Other scenarios: see test/fixtures/scenario.js. Close the browser window to quit.');

let done = false;
const quit = () => {
  if (done) return;
  done = true;
  stop();
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(0);
};
ctx.on('close', quit);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => ctx.close().then(quit, quit));
