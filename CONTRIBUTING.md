# Contributing to PhrasePoP

Install Node.js 22, stable Rust 1.90 or newer, and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your platform.

```sh
npm ci
npm run tauri dev
```

Keep the clipboard-first path usable without a tray, global shortcuts, or
cross-app keyboard simulation. Clipboard reads/writes must be explicit, and an
asynchronous operation must never overwrite a newer draft.

## Project layout

- `src/domain.ts`: settings, appearance, provider types, and prompt construction.
- `src/services/stream.ts`: bounded SSE/NDJSON decoding.
- `src/services/ai.ts`: native HTTP requests and cancellation.
- `src-tauri/src/lib.rs`: persistent clipboard ownership and desktop integration.
- `src/demo.ts`: development-only fictional fixtures, excluded from production.

Run the checks listed in [README.md](README.md) before opening a pull request.
Use `npm run format` and `cargo fmt --manifest-path src-tauri/Cargo.toml` for formatting.
Keep Tauri JavaScript and Rust package minor versions compatible.

Test Unicode, split network chunks, malformed/unfinished streams, cancellation,
provider changes, corrupt settings, and dark/light persistence when changing
generation or preferences. Use fake API keys and synthetic text only.

## Screenshots and native checks

```sh
npx playwright install chromium
node scripts/capture.mjs
node scripts/native-smoke.mjs
node scripts/native-smoke.mjs --a11y
```

The native smoke script is Linux-specific, opens a real window, and isolates XDG
data/config/cache directories. The optional accessibility check requires Python
PyGObject and AT-SPI. It checks startup/settings, not actual clipboard contents or
live provider generation. Do not run it in an inappropriate desktop session.

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/browser` to reuse an existing
Chromium-compatible browser. Documentation screenshots use fictional text and
mocked requests; never capture real emails, credentials, or personal context.

See [validation notes](docs/VALIDATION.md) and [release checklist](docs/RELEASING.md).
