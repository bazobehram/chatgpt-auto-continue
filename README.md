# ChatGPT Auto-Continue

A community-driven, open-source Chrome extension that helps continue long ChatGPT conversations while respecting human review, message drafts, and safety limits.

**Status:** Public release candidate preparation. This is not an official OpenAI extension.

## What it does

- Continues eligible completed ChatGPT replies with a configurable follow-up prompt.
- Uses a conservative watchdog and persistent send journal to avoid blindly repeating messages.
- Supports per-conversation settings and a global default.
- Stops or pauses for human approval, unfinished tool activity, login problems, draft messages, uncertain submissions, or configured limits.
- Offers optional **Mission Signal** integration for workflows with a separately verified completion signal.
- Provides diagnostic events to help troubleshoot unexpected pauses without intentionally recording conversation bodies.

The extension **cannot guarantee exactly-once message delivery**. It does not bypass ChatGPT's usage limits, approvals, or safety controls.

## Quick start (Local Only)

1. Download the source from a trusted release or clone this repository.
2. In Chrome, open `chrome://extensions`, enable **Developer mode**, then choose **Load unpacked** and select the folder containing `manifest.json`.
3. Sign in to ChatGPT normally at `https://chatgpt.com`.
4. Open a conversation, click the extension icon and choose **Local Only**.
5. Set a continuation limit and your follow-up message, then click **Start**. Follow the extension's controls for sending the first continuation when needed.
6. Review any warning or approval request yourself. Pause or disable the extension whenever you want.

Local Only needs no separate server or API key. An installed extension does not automatically start sending messages.

## Modes

**Local Only:** Uses the configured count limit and safety checks. Recommended for new users.

**Mission Signal (advanced):** Connects to an *independently hosted* compatible Mission Signal service over HTTPS. Set the service URL and enrollment key in the extension settings and approve browser access for that server. The service authoritatively marks a mission complete. The extension never installs a server automatically. A disconnected service allows at most five persisted offline continuation claims before pausing. This mode requires separate infrastructure and is not necessary for ordinary use.

## Privacy and permissions

The extension runs on `chatgpt.com` and stores preferences, session state, mission credentials when configured, and diagnostic metadata in browser-local extension storage. It must inspect ChatGPT page elements, including conversation text and editor state, to decide whether a continuation is safe. Diagnostics are not intended to include complete message bodies; **review exported diagnostics before sharing them publicly**.

It has no built-in advertising or analytics service. In Local Only mode it does not intentionally forward conversations to an extension developer's server. Mission Signal mode contacts only the server the user explicitly configures and authorizes; that operator controls the server's data handling. This is **not** a guarantee of absolute data privacy or anonymity.

Permissions: `storage` for settings and journals; `alarms` for watchdog wakeups; `tabs` for conversation ownership and navigation; `chatgpt.com` host access for the content script; and optional host access for a user-specified Mission Signal server.

See [PRIVACY.md](PRIVACY.md) for more details.

## Safety and limitations

- A send journal minimizes retries but does not make web UI submissions transactional.
- Human review and unknown page states should pause automation; never use this extension to circumvent approvals.
- ChatGPT UI changes or localization may break detection.
- Reloads, startup, navigation, or a pending draft may require manual intervention.
- Mission completion should be issued only after independent verification.
- Use a dedicated test conversation before trusting a new version.

## Development

Requires Node.js and Python for the full test suite.

```bash
npm install
npm test
npm run test:all
python tests/smoke.py
```

Browser tests may require a Playwright Chromium executable. Fixtures do not prove behavior in a real authenticated account. See the GitHub Actions acceptance workflow; live authenticated browser verification is required before public release.

## Support and contribute

Found a bug or have an idea? Open a GitHub issue with reproduction steps, extension version, browser version, and **sanitized** diagnostics. Do not publish conversations, email addresses, credentials, tokens, machine names, or account identifiers.

Pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md) first. Features should preserve the fail-closed safeguards and avoid adding unnecessary permissions or third-party network dependencies.

## Project status

This source is currently being prepared for public review. Chrome Web Store availability is **not yet claimed**. Check repository releases and security notes before installing. This project is independently developed and is not affiliated with or endorsed by OpenAI.
