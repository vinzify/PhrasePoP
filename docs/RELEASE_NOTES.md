# Your thought. A clearer expression.

The first public preview of PhrasePoP 1.2 brings a portable, clipboard-first writing
workflow to Linux, Windows, and macOS.

## What changed

- New side-by-side writing interface: dark by default, optional saved Light theme
  under Settings → Appearance.
- Explicit clipboard import/copy; results never overwrite the clipboard automatically.
- No simulated Ctrl+C, forced always-on-top, or hide-on-blur behaviour.
- Wayland-aware startup, persistent clipboard ownership, and useful fallback guidance.
- Configurable shortcuts where supported; desktop-assigned `phrasepop --clipboard`
  on Wayland; optional tray/autostart with graceful fallback.
- Fixed LM Studio/model selection and incremental SSE/NDJSON/UTF-8 stream decoding.
- Cancel generation, preserve newer drafts, and keep partial responses visible on errors.
- Session-only API keys, with legacy plaintext removal when settings are saved.
- Refreshed README, screenshots, automated checks, and draft-only release workflow.

## Important upgrade note: install this preview manually

An encrypted private-key file was found in repository history. Updater signing
has been rotated; older 1.1.x clients trust the old key and must not be expected
to update to this preview automatically. Download a fresh installer from this
official release. No old-key-signed bridge is being published.

The existing stable release/update channel is unchanged. This preview uses a
separate `preview.json` channel with the new verification key.

## Downloads and platform notes

- Linux x86_64: `.deb`, `.rpm`, and `.AppImage`; built on Ubuntu 22.04.
- Windows x64: NSIS setup `.exe` or `.msi` (choose one).
- macOS: select the Apple Silicon (`aarch64`) or Intel (`x64`/`x86_64`) `.dmg`.

Updater signatures are not Windows Authenticode or Apple Developer ID/notarization
signatures. OS trust warnings may appear; do not bypass warnings for untrusted
downloads. Verify SHA256SUMS from this release before installing.

Copy text first, then open the app. Automatic selection capture is intentionally
not part of this preview. Wayland clipboard import depends on compositor support;
direct paste/type remains available. Live provider and native clipboard/shortcut
behaviour across all desktops still require field testing. See docs/VALIDATION.md.

No real emails, clipboard values, or paid AI calls were used for test fixtures.
