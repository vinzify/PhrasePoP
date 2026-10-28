# Release checklist

## Packaging details

Preview MSI versions must be numeric: the workflow maps `X.Y.Z-beta.N` to
`X.Y.Z.N` and stable `X.Y.Z` to `X.Y.Z.65535` through an installer-only WiX
override. App/updater semantic versions remain unchanged. Use the same override
when bundling an MSI directly from a beta source checkout.

Platform jobs upload packages and signatures only. A single final job requires
all four builds and creates the complete `latest.json`, avoiding parallel
metadata writers. Verify every signature, upload SHA256SUMS, and copy this
manifest to `preview.json` on main before publishing the draft as a prerelease
with `--latest=false`. The old stable channel must remain untouched.

This tree is the 1.2.0-beta.1 cross-platform preview. Existing 1.1.x stable assets
remain Windows builds, on their original update channel. Preview builds use a
separate `preview.json` channel and a rotated public signing key.

Historical encrypted private-key material was found in this repository's history.
It is not used for new builds. Versioned GitHub secrets `TAURI_SIGNING_PRIVATE_KEY_V2`
and `TAURI_SIGNING_PRIVATE_KEY_V2_PASSWORD` sign the preview artifacts. Older clients
must install this preview manually; no old-key bridge is published.

Before publication:

- Pass domain/stream tests, browser flows, lint/format, Rust tests, Clippy, and
  production builds. Confirm dev fixtures and fake credentials are not bundled.
- Run the configured Windows/macOS/Linux CI matrix; manually check each target
  desktop, clipboard ownership, shortcuts, tray fallback, autostart, and relaunch.
- Test live local/cloud providers with authorized accounts, including cancellation
  and connection errors. Unit/browser mocks do not prove live provider behaviour.
- Verify dark default, Light preference persistence, and readable native controls.
- Review signing keys/secrets and update metadata. Never commit private keys.
  Updater signatures are separate from Windows signing and Apple notarization.
- Build from a matching version tag and dispatch the manual release workflow only
  after review. It produces a draft prerelease, not an automatic public release.
- Check all artifacts, signatures, platform entries, and upgrade behaviour before
  manually publishing. Do not replace the stable updater manifest prematurely.

The old config's private-key path was removed; private keys belong outside the
repository. A local unsigned build uses `createUpdaterArtifacts: false` as shown
in README. Do not recommend bypassing OS security warnings to install untrusted files.
