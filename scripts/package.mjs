#!/usr/bin/env node
// Builds dist/popshield-<version>.zip for the Chrome Web Store.
// The zip contains only what the extension needs at runtime:
//   manifest.json, src/, icons/, LICENSE
// No tests, no node_modules, no docs. Uses only Node built-ins (a small zip
// writer on top of node:zlib), so it works the same on every OS.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = ['manifest.json', 'src', 'icons', 'LICENSE'];
const SKIP = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\..*\.swp)$|~$/;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const version = manifest.version;
if (!/^\d+(\.\d+){0,3}$/.test(version || '')) {
  console.error(`manifest.json has an invalid version: ${JSON.stringify(version)}`);
  process.exit(1);
}

// ---- collect files (sorted, forward-slash paths relative to ROOT)
// Refuse symlinks (they could pull in files from outside the repo) and
// editor/patch leftovers that must never ship.
const JUNK = /(\.(orig|rej|bak|swp|tmp)|~)$|(^|\/)\.[^/]+$/;
function walk(rel) {
  const abs = path.join(ROOT, rel);
  const lst = fs.lstatSync(abs);
  if (lst.isSymbolicLink()) { console.error(`refusing symlink: ${rel}`); process.exit(1); }
  if (JUNK.test(rel)) { console.error(`refusing stray file: ${rel} (delete it first)`); process.exit(1); }
  const st = fs.statSync(abs);
  if (st.isFile()) return [rel];
  return fs.readdirSync(abs).sort().flatMap((n) => walk(rel + '/' + n));
}
const files = INCLUDE.flatMap((p) => {
  if (!fs.existsSync(path.join(ROOT, p))) { console.error(`missing: ${p}`); process.exit(1); }
  return walk(p);
}).filter((f) => !SKIP.test(f));

// Check that every file the manifest references is in the package.
const referenced = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);
const missing = referenced.filter((f) => !files.includes(f));
if (missing.length) { console.error('manifest references files not in the package:', missing); process.exit(1); }

// ---- minimal zip writer (deflate, no zip64; fine for an extension package)
const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const locals = [];
const centrals = [];
let offset = 0;
for (const name of files) {
  const data = fs.readFileSync(path.join(ROOT, name));
  const st = fs.statSync(path.join(ROOT, name));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const useDeflate = deflated.length < data.length;
  const body = useDeflate ? deflated : data;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(data);
  const { time, date } = dosTime(st.mtime);
  const nameBuf = Buffer.from(name, 'utf8');

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);          // version needed
  lh.writeUInt16LE(0x0800, 6);      // flags: UTF-8 names
  lh.writeUInt16LE(method, 8);
  lh.writeUInt16LE(time, 10);
  lh.writeUInt16LE(date, 12);
  lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(body.length, 18);
  lh.writeUInt32LE(data.length, 22);
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  locals.push(lh, nameBuf, body);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0);
  ch.writeUInt16LE(0x0314, 4);      // made by: Unix, spec 2.0
  ch.writeUInt16LE(20, 6);
  ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(method, 10);
  ch.writeUInt16LE(time, 12);
  ch.writeUInt16LE(date, 14);
  ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(body.length, 20);
  ch.writeUInt32LE(data.length, 24);
  ch.writeUInt16LE(nameBuf.length, 28);
  ch.writeUInt16LE(0, 30);          // extra
  ch.writeUInt16LE(0, 32);          // comment
  ch.writeUInt16LE(0, 34);          // disk
  ch.writeUInt16LE(0, 36);          // internal attrs
  ch.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file, rw-r--r--
  ch.writeUInt32LE(offset, 42);
  centrals.push(ch, nameBuf);

  offset += lh.length + nameBuf.length + body.length;
}
const centralSize = centrals.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralSize, 12);
end.writeUInt32LE(offset, 16);

const outDir = path.join(ROOT, 'dist');
const out = path.join(outDir, `popshield-${version}.zip`);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, ...centrals, end]));

console.log(`${path.relative(ROOT, out)}  (${files.length} files, ${fs.statSync(out).size} bytes)`);
for (const f of files) console.log('  ' + f);
