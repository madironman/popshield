See AGENTS.md.

Non-negotiables (details in [AGENTS.md](AGENTS.md)):

- No network requests from `src/` (no `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`).
- No telemetry, analytics or tracking of any kind.
- No remote code or remote configuration; all decisions are local.
- No new `manifest.json` permissions without discussion and a stated reason.
- Plain JavaScript, Manifest V3, no build step, no runtime dependencies.
