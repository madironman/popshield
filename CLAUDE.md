See AGENTS.md.

Non-negotiables (details in [AGENTS.md](AGENTS.md)):

- No network requests from `src/` (no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`).
- No telemetry, analytics or tracking of any kind.
- No remote code or remote configuration; all decisions are local.
- No new `manifest.json` permissions without discussion and a stated reason.
- Plain JavaScript, Manifest V3, no build step, no runtime dependencies.
- Never decide security in the MAIN world: `src/inject.js` only hooks, asks and hints; verdicts and guards live in `src/bridge.js`.
- Never mint allow tokens outside `src/bridge.js`.
- Capture every built-in up front in `src/inject.js` and call it through `R_apply`; never call a live prototype method there.
- Never record which sites the user visits: persistent storage holds only the user's mode settings and anonymous counts (total / day / kind).
- No share or social features, no per-site stats.

Mental model: `inject.js` (MAIN world, hooks) -> synchronous ask over a nonce channel -> `bridge.js` (isolated world, decides, mints URL-bound tokens, redirect/frame/form guards) -> `background.js` (validates bridge messages, closes un-tokened new tabs, per-tab session log, anonymous stats).
