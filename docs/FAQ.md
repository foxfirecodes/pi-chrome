# pi-chrome FAQ

## Does this work with Brave / Arc / Edge / Vivaldi?

Yes. Any Chromium-based browser that supports unpacked extensions and the `chrome.debugger` API will work. The extension is named "Pi Chrome Connector" but the source is browser-agnostic. Firefox / WebKit are out of scope (different extension models).

## Will it slow my browser down?

The companion extension is idle when no Pi command is in flight. It uses Manifest V3 service worker activation, so it wakes for a request and goes back to sleep. No content script is injected globally.

## Does it work in Chrome incognito?

By default no — extensions need explicit "Allow in incognito" permission. Toggle it on `chrome://extensions` if you want pi-chrome to see incognito tabs. We don't recommend it for sensitive work.

## Will sites detect that I'm automating?

Interactive controls use Chrome's real input layer via CDP, so normal user-activation gates are satisfied and input is closer to real browser use than DOM-dispatched events. pi-chrome also shapes pointer/keyboard/scroll behavior, but this is not a guarantee of undetectability. Some detectors check for the `chrome.debugger` API attached, and Chrome will show the "Chrome is being debugged" banner.

The [`test-suite/`](../test-suite) grades browser-control behavior against common detection signals. Its `quality` bucket is adversarial signal, not a blanket promise that every site will treat automation as human.

## Why do I see a banner saying "Pi Chrome Connector started debugging this browser"?

That's Chrome's built-in warning when an extension uses `chrome.debugger`. pi-chrome uses Chrome's input layer for interactive controls, so the banner appears while attached.

## Can a malicious page escape and access my other tabs?

No — pages cannot directly talk to extensions. Commands flow agent → authenticated local bridge (`127.0.0.1:17318`) → paired extension → tab. The bridge defaults to off, binds to loopback only, rejects browser-origin command requests, requires a control capability for `/command`, and requires a paired extension session token for `/next` and `/result`.

Chrome control is also locked per Pi session until you run `/chrome authorize`; `/chrome revoke` locks it again. The remaining risk surface is **local malware running as you** that can tamper with Pi, the Chrome profile, process memory, or extension files. If that's in your threat model, run pi-chrome in a separate OS user account.

## Can multiple Pi sessions use it at once?

No. This hardened fork targets one active bridge server and one paired companion extension instance. The bridge server is off by default; use `/chrome server start` to turn it on and `/chrome server stop` to turn it off.

## Why ship as an unpacked extension?

pi-chrome ships as an unpacked extension so the source and broad browser permissions are easy to inspect and update with the npm package. The downside: you load it manually from `chrome://extensions` and reload it after package updates.

## What happens when I update pi-chrome?

`/chrome doctor` will warn you if the loaded extension is older than the installed `pi-chrome`. Reload it from `chrome://extensions` to pick up the new version. Updates that add Chrome permissions may require re-approval once.

## What's the install footprint?

- Pi side: one extension that registers 21 tools and a few slash commands.
- Chrome side: one unpacked extension, ~3000 LOC of plain JavaScript, no dependencies.

## Can I script it without Pi?

The Pi-facing tools are thin wrappers around an authenticated HTTP bridge at `127.0.0.1:17318`. Direct scripting is not currently supported because `/command` requires an in-memory control capability and the extension endpoints require pairing/session authentication. If you need a stable scripting interface, file an issue and we'll consider stabilizing.

## What can humans do that pi-chrome cannot?

pi-chrome controls web pages through Chrome extension APIs, page inspection, screenshots, and browser input. It is not full OS-level human control. Known gaps include native Chrome/OS dialogs (print/save-as, some permission bubbles, password-manager prompts), arbitrary OS app interaction, visual CAPTCHA challenges, hardware-backed auth (passkeys/security keys/biometrics), rich multi-touch/pinch/stylus gestures, and DOM inspection inside cross-origin iframes. Some of these can still be handled with screenshot + coordinate input or user assistance, but they are not first-class deterministic workflows.

## Does `chrome_evaluate` work on strict-CSP pages?

Not always. `chrome_evaluate` compiles caller-provided code in the page's MAIN world, so pages whose CSP blocks `'unsafe-eval'` can reject it. `chrome_snapshot` is injected as a packaged extension script and should still work on strict-CSP pages. `chrome_screenshot`, `chrome_navigate`, tab tools, and real Chrome input also work because they use extension/browser APIs rather than page JavaScript.

## How do I tell whether a click or type worked?

Use `includeSnapshot=true` on `chrome_click`, `chrome_type`, `chrome_fill`, or `chrome_key`. The tool returns the Chrome-input result plus a fresh concise snapshot, so the agent can verify text, URL, visible elements, or form values before continuing.

If the page did not change, take `chrome_snapshot({ mode: "changes" })` or a screenshot and check for overlays, disabled controls, stale element uids, or app-side validation. Use `query` or modes like `forms`, `interactive`, `pageMap`, and `text` to avoid huge truncated dumps.

## How do I attach a file to a React file input?

`chrome_upload_file` — uses Chrome DevTools file-input control and fires `input` + `change` events. It does **not** open the native file picker. Works with React/Vue/Angular controlled inputs.

## Can it record videos?

Not yet. Screenshots only. Video recording is on the roadmap.

## How do I file a good bug report?

Include `/chrome doctor` output, the exact tool call, and the result envelope. If the page is public, link to it; if private, distill it into a benchmark page under `test-suite/challenges/`. See [CONTRIBUTING.md](../CONTRIBUTING.md).
