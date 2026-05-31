# Security policy

## Reporting a vulnerability

Open a GitHub issue prefixed with `[security]` at https://github.com/tianrendong/pi-chrome/issues, or contact the maintainer directly if the issue is sensitive. Please do **not** include exploit details in a public issue without coordinating first.

## Threat model

`pi-chrome` is a developer tool you install knowingly. It is **not** designed to defend against:

- Hostile pages running in your Chrome trying to detect or escape automation. (Standard browser security boundaries still apply, but a hostile page that already runs in your tab can do anything that page can already do.)
- Fully compromised local user accounts. The bridge binds to `127.0.0.1:17318` (loopback only), defaults to off, and authenticates bridge endpoints, but malware running as you can still tamper with your Chrome profile, extension files, process memory, or Pi runtime. If your threat model includes hostile local processes running as you, run pi-chrome on a separate user account.

`pi-chrome` **is** designed to:

- Never exfiltrate page state to the network. All communication is loopback (`127.0.0.1`).
- Surface every action with an honest result envelope so the agent can't silently do the wrong thing.
- Keep the local bridge server off until the user runs `/chrome server start` or `/chrome pair`.
- Pair to one exact companion extension origin/ID using a one-time code and a WebCrypto public key.
- Require authenticated capabilities for `/command`, `/next`, and `/result`.
- Keep Chrome control locked until the user explicitly runs `/chrome authorize` in the current Pi session.
- Reject browser-origin command requests to the loopback bridge so ordinary web pages cannot use CORS to drive Chrome.

## The companion extension

The Chrome extension under `extensions/chrome-profile-bridge/browser-extension/` runs with broad permissions: `tabs`, `scripting`, `debugger`, `webNavigation`, etc. **Only install it from a package source you trust.** Read the source before loading. Pin a known-good commit if you're security-sensitive.

## Defaults

- Loopback bridge only. No remote port. No telemetry.
- Bridge server off by default; `/chrome server start` turns it on and `/chrome server stop` turns it off.
- Extension pairing required; `/chrome pair` shows a short-lived code, and `/chrome unpair` forgets the paired extension.
- Chrome real input layer for interactive controls.
- Chrome control locked by default; `/chrome authorize` unlocks current Pi session after terminal confirmation, `/chrome revoke` locks it again.
- Run-in-background optional; tab/window focus is observable by default (the user can see Pi acting).

## Custom ports

The bundled Chrome extension currently polls `127.0.0.1:17318`. Custom bridge ports are not supported without editing the extension source and reloading it.

## Supported versions

The latest minor on npm is supported. Security patches will be released as soon as practical.
