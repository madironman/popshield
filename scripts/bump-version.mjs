#!/usr/bin/env node
// Bumps the PopShield version everywhere it lives and cuts a CHANGELOG section.
//
//   node scripts/bump-version.mjs <major|minor|patch|X.Y.Z> [--dry-run] [--allow-empty]
//
// Updates:
//   - manifest.json        "version"
//   - package.json         "version"
//   - package-lock.json    top-level "version" and packages[""].version
//   - CHANGELOG.md         moves the [Unreleased] entries into a new
//                          "## [X.Y.Z] - YYYY-MM-DD" section, leaves an empty
//                          [Unreleased] section and updates the compare links.
//
// Policy: plain X.Y.Z only. Chrome's manifest "version" allows only 1-4
// dot-separated integers (0-65535), so pre-release suffixes such as
// 1.2.0-beta.1 are refused. The new version must be greater than the current
// one. The script never runs git; it prints the commands to run next.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const MAX_PART = 65535;

function die(msg) {
  console.error(`bump-version: ${msg}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
for (const f of flags) {
  if (!['--dry-run', '--allow-empty', '--help'].includes(f)) die(`unknown option ${f}`);
}
if (flags.has('--help') || positional.length !== 1) {
  console.log('usage: node scripts/bump-version.mjs <major|minor|patch|X.Y.Z> [--dry-run] [--allow-empty]');
  console.log('  --dry-run      show what would change, write nothing');
  console.log('  --allow-empty  allow a release whose [Unreleased] section is empty');
  process.exit(flags.has('--help') ? 0 : 1);
}
const DRY = flags.has('--dry-run');
const request = positional[0];

// ---- read files
const files = {
  manifest: 'manifest.json',
  pkg: 'package.json',
  lock: 'package-lock.json',
  changelog: 'CHANGELOG.md',
};
const text = {};
for (const [key, rel] of Object.entries(files)) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) die(`${rel} not found`);
  text[key] = fs.readFileSync(abs, 'utf8');
}
const json = {};
for (const key of ['manifest', 'pkg', 'lock']) {
  try {
    json[key] = JSON.parse(text[key]);
  } catch (e) {
    die(`${files[key]} is not valid JSON: ${e.message}`);
  }
}

// ---- current version: all files must agree before we bump
const current = json.manifest.version;
const found = {
  'manifest.json version': json.manifest.version,
  'package.json version': json.pkg.version,
  'package-lock.json version': json.lock.version,
  'package-lock.json packages[""].version': json.lock.packages?.['']?.version,
};
const mismatched = Object.entries(found).filter(([, v]) => v !== current);
if (mismatched.length) {
  die(
    'versions are out of sync; fix them before bumping:\n' +
      Object.entries(found).map(([k, v]) => `  ${k}: ${JSON.stringify(v)}`).join('\n'),
  );
}
if (!SEMVER.test(current)) die(`current version ${JSON.stringify(current)} is not plain X.Y.Z`);

// ---- next version
const cur = current.split('.').map(Number);
let next;
if (request === 'major') next = `${cur[0] + 1}.0.0`;
else if (request === 'minor') next = `${cur[0]}.${cur[1] + 1}.0`;
else if (request === 'patch') next = `${cur[0]}.${cur[1]}.${cur[2] + 1}`;
else {
  const v = request.replace(/^v/, '');
  if (/^\d+\.\d+\.\d+[-+]/.test(v)) {
    die(
      `${request}: pre-release/build suffixes are not supported. Chrome's manifest ` +
        'version must be 1-4 dot-separated integers, so use plain X.Y.Z.',
    );
  }
  if (!SEMVER.test(v)) die(`${request}: expected major, minor, patch or a plain X.Y.Z version (no leading zeros)`);
  next = v;
}
const nxt = next.split('.').map(Number);
if (nxt.some((n) => n > MAX_PART)) die(`${next}: each part must be at most ${MAX_PART} (Chrome manifest limit)`);
const cmp = nxt[0] - cur[0] || nxt[1] - cur[1] || nxt[2] - cur[2];
if (cmp <= 0) die(`${next} must be greater than the current version ${current}`);

// ---- JSON updates (files are 2-space JSON with a trailing newline)
function serialize(key, obj) {
  const original = text[key];
  const indent = original.match(/^[{[]\r?\n([ \t]+)/)?.[1] ?? '  ';
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  let out = JSON.stringify(obj, null, indent);
  if (eol !== '\n') out = out.replace(/\n/g, eol);
  return out + (/\r?\n$/.test(original) ? eol : '');
}
json.manifest.version = next;
json.pkg.version = next;
json.lock.version = next;
json.lock.packages[''].version = next;

// ---- CHANGELOG
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
const date = process.env.RELEASE_DATE || today();
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die(`RELEASE_DATE must be YYYY-MM-DD, got ${date}`);

const cl = text.changelog;
const eol = cl.includes('\r\n') ? '\r\n' : '\n';
const lines = cl.split(/\r?\n/);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

if (lines.some((l) => new RegExp(`^## \\[${esc(next)}\\]`).test(l))) {
  die(`CHANGELOG.md already has a section for ${next}`);
}
const unrelIdx = lines.findIndex((l) => /^## \[Unreleased\]\s*$/i.test(l));
if (unrelIdx === -1) die('CHANGELOG.md has no "## [Unreleased]" heading');

// Body of [Unreleased] runs until the next "## " heading or the link references.
let endIdx = lines.length;
for (let i = unrelIdx + 1; i < lines.length; i++) {
  if (/^## /.test(lines[i]) || /^\[[^\]]+\]:\s*\S/.test(lines[i])) {
    endIdx = i;
    break;
  }
}
const body = lines.slice(unrelIdx + 1, endIdx);
while (body.length && body[0].trim() === '') body.shift();
while (body.length && body[body.length - 1].trim() === '') body.pop();
// Only empty "### Added" style headings do not count as content.
const hasContent = body.some((l) => l.trim() !== '' && !/^###\s/.test(l));
if (!hasContent && !flags.has('--allow-empty')) {
  die(
    'the [Unreleased] section of CHANGELOG.md is empty. Describe the changes ' +
      'first, or pass --allow-empty to release anyway.',
  );
}

const section = [`## [${next}] - ${date}`, ''];
if (body.length) section.push(...body, '');
const newLines = [
  ...lines.slice(0, unrelIdx + 1),
  '',
  ...section,
  ...lines.slice(endIdx),
];

// Compare links at the bottom.
const repoFromPkg = (json.pkg.repository?.url || json.pkg.repository || '')
  .toString()
  .replace(/^git\+/, '')
  .replace(/\.git$/, '');
const unrelLinkIdx = newLines.findIndex((l) => /^\[Unreleased\]:\s*\S/i.test(l));
let repo;
if (unrelLinkIdx !== -1) {
  repo = newLines[unrelLinkIdx].match(/^\[Unreleased\]:\s*(\S+?)\/compare\//i)?.[1];
}
repo = repo || repoFromPkg;
if (!/^https:\/\//.test(repo || '')) die('cannot work out the repository URL for CHANGELOG links');

const unrelLink = `[Unreleased]: ${repo}/compare/v${next}...HEAD`;
const versionLink = `[${next}]: ${repo}/compare/v${current}...v${next}`;
if (unrelLinkIdx !== -1) {
  newLines.splice(unrelLinkIdx, 1, unrelLink, versionLink);
} else {
  while (newLines.length && newLines[newLines.length - 1].trim() === '') newLines.pop();
  newLines.push('', unrelLink, versionLink);
}
let newChangelog = newLines.join(eol);
if (!newChangelog.endsWith(eol)) newChangelog += eol;

// ---- write (everything is computed first, so a failure above writes nothing)
const outputs = {
  manifest: serialize('manifest', json.manifest),
  pkg: serialize('pkg', json.pkg),
  lock: serialize('lock', json.lock),
  changelog: newChangelog,
};
for (const [key, content] of Object.entries(outputs)) {
  if (DRY) continue;
  const abs = path.join(ROOT, files[key]);
  const tmp = abs + '.tmp-bump';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, abs);
}

console.log(`${DRY ? '[dry run] would bump' : 'Bumped'} ${current} -> ${next}`);
for (const rel of Object.values(files)) console.log(`  ${DRY ? 'would update' : 'updated'} ${rel}`);
console.log(`  CHANGELOG: [Unreleased] -> [${next}] - ${date}${body.length ? '' : ' (empty section)'}`);
if (DRY) {
  console.log('\nNew CHANGELOG section:\n');
  console.log(section.join('\n'));
  process.exit(0);
}
console.log(`
Next steps (review the diff first: git diff):
  node scripts/check-version.mjs v${next}
  git commit -am "release: v${next}" && git tag -a v${next} -m "v${next}" && git push --follow-tags

Pushing the tag runs .github/workflows/release.yml, which builds
dist/popshield-${next}.zip and publishes the GitHub Release.`);
