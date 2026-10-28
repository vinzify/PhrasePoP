# Validation — 1.2.0-beta.1 development preview

Recorded on 2026-10-28. Host: Ubuntu 26.04.1 LTS, KDE Wayland, x86_64; Rust
1.94.1, WebKitGTK 2.52.6. Frontend checks use isolated Node.js 22 tooling;
browser-flow checks use the local Brave executable through Playwright.

## Passed locally

- 4 Rust tests: Wayland detection, text-size/empty clipboard validation, native
  shortcut parsing, and HTTP capability matching for default/custom ports,
  localhost IPv4/IPv6, and HTTPS. No real clipboard content is used in unit tests.
- 11 domain/stream tests: legacy/corrupt preferences, dark default and saved Light,
  exclusion of API keys from storage, persona scope, URL validation, configured
  provider/model, one-byte UTF-8/SSE/NDJSON chunking, EOF, malformed/truncated/empty
  responses, cancellation, and size limits.
- 7 browser flows: explicit copying only, LM Studio/model preservation,
  session-only keys, cancellation, provider errors, late clipboard imports,
  minimum-size layout, and dark/light persistence. Tauri IPC/network are mocked.
- TypeScript/Vite production builds, ESLint, Prettier, Rust formatting, and Clippy
  with warnings denied. Fixture markers are checked separately in the final bundle.
- An unsigned Linux release binary and Debian package built locally without
  updater-signing artifacts. Local binaries target this host, not every distro.

Native startup was checked with isolated XDG config/data/cache directories and no
clipboard launch flag. The window remains open on KDE Wayland; Settings and its
desktop guidance are accessible. The optional AT-SPI smoke helper checks the
default Dark choice and opens/closes Settings.

A deeper WebKitWebDriver check exercised the actual native UI and Tauri Rust HTTP
backend against a synthetic localhost server on a dynamically chosen port. NDJSON
generation returned Unicode text to the result pane; stopping a second streaming
request preserved both the source and partial result. This caught and fixed a
capability pattern that incorrectly rejected non-default provider ports.

Reproduce on a Linux desktop with a matching `WebKitWebDriver` installed:

```sh
node scripts/native-provider.mjs
# Or set WEBKIT_WEBDRIVER to the matching driver executable.
```

This is a transport fixture, not a live model-quality or paid-provider test. The
AT-SPI helper separately checks read-only startup/settings behaviour because this
WebKit implementation does not expose EditableText for form controls.

The host also emitted a libayatana-appindicator deprecation warning from the tray
dependency. Startup/settings remained usable; the warning is not suppressed.

No user settings, actual clipboard values, or paid API calls were used. Temporary
test settings were removed after each native smoke run.

## Still requires validation

- Live local/cloud generation and cancellation through a native installed build.
- Actual clipboard import/copy ownership on each compositor and OS, including
  pasting after the window closes; no blanket Wayland compositor claim is made.
- X11, Windows, and macOS desktop behaviour. CI is configured but has not run for
  this unpublished local change.
- Native shortcut registration/conflict recovery, tray/desktop integration,
  autostart, updater installation/relaunch, signing/notarization, and upgrades.

See [RELEASING.md](RELEASING.md). This is not a public release or a claim that
every Linux desktop has been exercised.
