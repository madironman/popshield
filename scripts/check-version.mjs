#!/usr/bin/env node
// Checks that the PopShield version is consistent everywhere.
//
//   node scripts/check-version.mjs [vX.Y.Z] [--notes-file <path>]
//
// Fails (exit 1) when:
//   - manifest.json, package.json, package-lock.json (top level and
//     packages[""]) disagree on the version;
//   - the version is not plain X.Y.Z with parts 0-65535 (Chrome manifest rule);
//   - CHANGELOG.md has no "## [X.Y.Z] - YYYY-MM-DD" section for it;
//   - a tag is given (as the argument, or GITHUB_REF_NAME when
//     GITHUB_REF_TYPE is "tag") and it is not "v" + the manifest version.
//
// --notes-file <path> writes this version's CHANGELOG section (without its
// heading) to <path>, for use as GitHub Release notes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const args = process.argv.slice(2);
let tag = null;
let notesFile = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--notes-file') {
    notesFile = args[++i];
    if (!notesFile) {
      console.error('check-version: --notes-file needs a path');
      process.exit(1);
    }
  } else if (a === '--help') {
    console.log('usage: node scripts/check-version.mjs [vX.Y.Z] [--notes-file <path>]');
    process.exit(0);
  } else if (a.startsWith('--')) {
    console.error(`check-version: unknown option ${a}`);
    process.exit(1);
  } else if (tag === null) {
    tag = a;
  } else {
    console.error(`check-version: unexpected argument ${a}`);
    process.exit(1);
  }
}
if (tag === null && process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
  tag = process.env.GITHUB_REF_NAME;
}
if (tag === '') tag = null;

const errors = [];
function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    errors.push(`${rel} not found`);
    return null;
  }
}
function readJson(rel) {
  const t = read(rel);
  if (t === null) return null;
  try {
    return JSON.parse(t);
  } catch (e) {
    errors.push(`${rel} is not valid JSON: ${e.message}`);
    return null;
  }
}

const manifest = readJson('manifest.json');
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const changelog = read('CHANGELOG.md');

const version = manifest?.version;
const found = {
  'manifest.json': manifest?.version,
  'package.json': pkg?.version,
  'package-lock.json': lock?.version,
  'package-lock.json packages[""]': lock?.packages?.['']?.version,
};
if (manifest && pkg && lock) {
  const bad = Object.entries(found).filter(([, v]) => v !== version);
  if (bad.length) {
    errors.push(
      'version mismatch:\n' +
        Object.entries(found).map(([k, v]) => `    ${k}: ${JSON.stringify(v)}`).join('\n'),
    );
  }
}

if (manifest) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    errors.push(`manifest.json version ${JSON.stringify(version)} is not plain X.Y.Z`);
  } else if (version.split('.').some((n) => Number(n) > 65535)) {
    errors.push(`manifest.json version ${version} has a part above 65535`);
  }
}

if (tag !== null && version !== undefined && tag !== `v${version}`) {
  errors.push(`tag ${tag} does not match manifest version (expected v${version})`);
}

let notes = null;
if (changelog !== null && typeof version === 'string') {
  const lines = changelog.split(/\r?\n/);
  const esc = version.replace(/\./g, '\\.');
  const idx = lines.findIndex((l) => new RegExp(`^## \\[${esc}\\]`).test(l));
  if (idx === -1) {
    errors.push(`CHANGELOG.md has no "## [${version}] - YYYY-MM-DD" section`);
  } else {
    if (!new RegExp(`^## \\[${esc}\\] - \\d{4}-\\d{2}-\\d{2}\\s*$`).test(lines[idx])) {
      errors.push(`CHANGELOG.md heading "${lines[idx]}" should be "## [${version}] - YYYY-MM-DD"`);
    }
    let end = lines.length;
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^## /.test(lines[i]) || /^\[[^\]]+\]:\s*\S/.test(lines[i])) {
        end = i;
        break;
      }
    }
    const body = lines.slice(idx + 1, end);
    while (body.length && body[0].trim() === '') body.shift();
    while (body.length && body[body.length - 1].trim() === '') body.pop();
    notes = body.join('\n');
    if (!lines.some((l) => new RegExp(`^\\[${esc}\\]:\\s*\\S`).test(l))) {
      console.warn(`check-version: warning: CHANGELOG.md has no [${version}] link reference`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error(`check-version: ${e}`);
  process.exit(1);
}

if (notesFile) {
  fs.writeFileSync(notesFile, (notes || `Release v${version}.`) + '\n');
}
console.log(`check-version: OK ${version}${tag ? ` (tag ${tag})` : ''}`);
