## What this changes

<!-- One or two sentences. Link the issue: "Fixes #123". -->

## Why

<!-- The site / ad technique / bug this addresses. For a new blocking rule, name the trick (e.g. "popunder hooked on pointerup at window"). -->

## How it was tested

<!-- e.g. new case `doc-foo-popunder` in test/run.mjs; `npm run test:live -- https://example.com` before/after. -->

## Checklist

- [ ] `npm test` passes locally (baseline + PopShield runs, and the popup UI test).
- [ ] New blocking behaviour has an attack case in `test/run.mjs` whose **baseline** proves the attack works in plain Chrome.
- [ ] Anything that could block legitimate pages has a matching `legit-*` case that must keep working.
- [ ] No network calls, remote code, remote lists or telemetry (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, `eval` of downloaded code, ...).
- [ ] No new permissions in `manifest.json`, or the reason for each one is explained above.
- [ ] Plain JavaScript, no build step, no new runtime dependencies.
- [ ] README / CHANGELOG updated if behaviour visible to users changed.
