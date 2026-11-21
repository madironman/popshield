# Releasing PopShield

This document is for maintainers. It covers how versions are numbered, how a
release is cut, and how to check that a release zip is the one CI built.

## Versioning policy

PopShield follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html),
read from the point of view of someone who has the extension installed:

| Bump      | When                                                                                                                                                                                 | Examples                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **MAJOR** | Breaking behaviour or permission changes: a new or wider permission or host permission (Chrome shows users a new warning, or disables the extension until they accept), removing a mode or setting, changing a default that users rely on, dropping support for a Chrome version. | Adding `tabs` or `<all_urls>` host access, removing Strict mode, raising `minimum_chrome_version`. |
| **MINOR** | New protections or features that keep existing behaviour and permissions.                                                                                                           | A new blocking heuristic, a new popup control, support for another framework's handlers.     |
| **PATCH** | Fixes that do not add features: false positives/negatives, crashes, UI glitches, wording, docs that ship in the package.                                                             | A site's real link was blocked; badge count was wrong.                                       |

While the version is `0.y.z`, the public behaviour is still settling: breaking
changes may go into a MINOR bump, but say so clearly in the CHANGELOG.

### Version format rules

- **Plain `X.Y.Z` only.** Chrome's manifest `version` must be 1 to 4
  dot-separated integers, each 0 to 65535, without leading zeros. Pre-release
  versions like `1.2.0-beta.1` are not valid there, so we do not use them.
  `scripts/bump-version.mjs` refuses them. If we ever need a beta channel,
  publish it as a separate unlisted Chrome Web Store item instead.
- The version is stored in **four places** that must always match:
  `manifest.json` `version`, `package.json` `version`, and
  `package-lock.json` (top-level `version` and `packages[""].version`).
  `node scripts/check-version.mjs` checks this. Never edit them by hand; use
  the bump script.
- **Tags** are annotated and named `vX.Y.Z` (for example `v0.2.0`). The tag
  must equal `v` + the manifest version. A tag is never moved or reused; if a
  release is broken, release the next PATCH.
- **Releases are cut only from `main`.** The release workflow refuses tags that
  point to commits not on `main`.
- The **Chrome Web Store** only accepts an upload whose version is strictly
  greater than the published one. A version number can be used once.

### CHANGELOG discipline

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- Every pull request that changes user-visible behaviour adds a line under
  `## [Unreleased]`, in the right group (`### Added`, `### Changed`,
  `### Deprecated`, `### Removed`, `### Fixed`, `### Security`).
- Write for users, not for reviewers: what changed and why it matters to them.
- Call out permission changes and breaking changes explicitly.
- Do not edit the sections of versions that are already released.
- The bump script moves `[Unreleased]` into the new version's section and
  updates the compare links. It refuses to release an empty `[Unreleased]`
  unless you pass `--allow-empty`.
- The new version's CHANGELOG section becomes the GitHub Release notes.

## Release process

Before you start: you are on an up-to-date `main`, the working tree is clean,
CI on `main` is green, and `[Unreleased]` in `CHANGELOG.md` describes
everything since the last release.

1. **Bump the version.** Pick the bump from the policy above.

   ```sh
   git switch main && git pull --ff-only
   node scripts/bump-version.mjs minor --dry-run   # preview
   node scripts/bump-version.mjs minor             # or major / patch / 1.4.0
   ```

   This updates `manifest.json`, `package.json`, `package-lock.json` and
   `CHANGELOG.md` (dated today; set `RELEASE_DATE=YYYY-MM-DD` to override).
   It does not run git.

2. **Review and check.**

   ```sh
   git diff
   node scripts/check-version.mjs vX.Y.Z
   npm test
   ```

3. **Commit, tag and push.** Use exactly the commands the script printed:

   ```sh
   git commit -am "release: vX.Y.Z"
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push --follow-tags
   ```

   If `main` is protected so that you cannot push to it directly, open a pull
   request with the release commit (`release/vX.Y.Z` branch), merge it, then
   tag the merged commit on `main` and push only the tag:

   ```sh
   git switch main && git pull --ff-only
   git tag -a vX.Y.Z -m "vX.Y.Z"
   git push origin vX.Y.Z
   ```

4. **CI builds the release.** Pushing the tag runs
   [`.github/workflows/release.yml`](../.github/workflows/release.yml), which:
   - checks that the tag is on `main`;
   - runs `node scripts/check-version.mjs "$GITHUB_REF_NAME"` (tag, manifest,
     package files and CHANGELOG all agree);
   - runs the full test suite in Chromium;
   - builds `dist/popshield-X.Y.Z.zip` with `node scripts/package.mjs`
     (only `manifest.json`, `src/` and `icons/`);
   - writes `popshield-X.Y.Z.zip.sha256`;
   - creates the GitHub Release `vX.Y.Z` with both files attached and this
     version's CHANGELOG section as the notes.

   If any step fails, no release is created. Fix the problem on `main`, then
   release the next PATCH version. (If the failure was not in the code, for
   example a flaky runner, re-run the workflow from the Actions tab.)

5. **Download the zip** from the GitHub Release page and
   [verify it](#verifying-a-release-zip).

6. **Upload to the Chrome Web Store** by hand: open the
   [Developer Dashboard](https://chrome.google.com/webstore/devconsole), select
   PopShield, **Package > Upload new package**, choose the zip, update the
   store listing or privacy answers if anything changed (especially for
   permission changes), and **Submit for review**. The version must be strictly
   greater than the one currently published.

7. After the store accepts it, check that the published version matches the
   tag, and close any issues that the release fixes.

Using the zip from the GitHub Release (rather than one built on your machine)
means the store gets exactly what CI tested and what the checksum describes.

## Hotfix process

The simple path, whenever `main` is releasable: fix on `main` and do a normal
PATCH release. Prefer it.

When `main` already has unreleased work that must not ship yet:

1. Branch from the release tag and make the fix (with a test), adding it under
   `[Unreleased]` in `CHANGELOG.md`:

   ```sh
   git switch -c hotfix/vX.Y.Z+1 vX.Y.Z
   ```

2. On the hotfix branch, bump and commit, and tag locally (do not push the tag
   yet):

   ```sh
   node scripts/bump-version.mjs patch
   git commit -am "release: vX.Y.Z+1"
   git tag -a vX.Y.Z+1 -m "vX.Y.Z+1"
   ```

3. Open a pull request from the hotfix branch into `main` and merge it **with a
   merge commit** (not squash or rebase), so the tagged commit becomes part of
   `main`'s history. When resolving the `CHANGELOG.md` conflict, keep `main`'s
   `[Unreleased]` entries and add the new `[X.Y.Z+1]` section below them. The
   version files take the hotfix version.
4. Push the tag: `git push origin vX.Y.Z+1`. The release workflow checks that
   the tagged commit is on `main`, which is true after step 3, and builds the
   release from the hotfix commit only (not from `main`'s unreleased work).
5. Continue with steps 5 to 7 of the normal release process.

If step 3 was squash- or rebase-merged by mistake, the tag is not on `main`
and the workflow will refuse it. Delete the local tag, then release the hotfix
as a normal PATCH from `main` once `main` is releasable.

## Verifying a release zip

Each GitHub Release has `popshield-X.Y.Z.zip` and
`popshield-X.Y.Z.zip.sha256`. Download both into the same folder, then:

```sh
# Linux
sha256sum -c popshield-X.Y.Z.zip.sha256
# macOS
shasum -a 256 -c popshield-X.Y.Z.zip.sha256
```

```powershell
# Windows (PowerShell): compare with the hash in the .sha256 file
(Get-FileHash popshield-X.Y.Z.zip -Algorithm SHA256).Hash.ToLower()
```

It should print `popshield-X.Y.Z.zip: OK` (or matching hashes on Windows).

To check what is inside:

```sh
unzip -l popshield-X.Y.Z.zip      # only manifest.json, src/ and icons/
unzip -p popshield-X.Y.Z.zip manifest.json | grep '"version"'
```

The zip stores file modification times, so building it yourself from the same
commit gives the same contents but usually a different checksum. Compare file
contents (for example, unzip both and run `diff -r`) rather than zip hashes if
you rebuild locally.

## Branch and tag protection (recommended GitHub settings)

Under **Settings > Rules > Rulesets**:

- **`main` branch ruleset**
  - Require a pull request before merging (at least 1 approval once there is
    more than one maintainer).
  - Require status checks to pass: the CI jobs from `.github/workflows/ci.yml`
    (`Manifest and no-network policy`, `E2E and popup UI tests`).
  - Require branches to be up to date before merging.
  - Block force pushes and deletions.
  - Optionally require linear history and signed commits.
- **Tag ruleset for `v*`**
  - Restrict creation to maintainers (bypass list), so only they can trigger a
    release.
  - Block updates and deletions, so a published tag can never be moved.

Under **Settings > Actions > General**, keep the default workflow permissions
at **read** (the release workflow asks for `contents: write` itself).

Optionally, add a `release` environment with required reviewers and set
`environment: release` on the release job if you want a manual approval before
each GitHub Release is published.
