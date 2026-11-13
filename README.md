# ChatGPT Auto-Continue 🐙

Keep a ChatGPT conversation moving when a response finishes—without repeatedly typing “go” or “continue”.

**Free and open source · GPL-3.0 · Chrome/Chromium extension · v0.7.5**

> Community project. Not made, supported, or endorsed by OpenAI. You use your own ChatGPT account, and ChatGPT limits still apply.

## What does it do?

Auto-Continue watches a saved ChatGPT conversation and sends your chosen follow-up message when an eligible assistant reply finishes. For example, if ChatGPT is working through a long coding task, you can set the message to **“Continue with the next step”**.

It is not an autonomous agent, a bypass for ChatGPT limits, or a guarantee that work finishes correctly. **Review important actions yourself.**

### Features

- **Per-conversation controls:** Run one chat while others remain paused. Different chats can use different messages and limits.
- **Local Only (recommended):** No extra server, enrollment key, or account is required.
- **Custom follow-up:** Set one message for a chat or use your global default.
- **Limited or unlimited counter:** Limit the number of follow-up attempts or disable only the numeric cap.
- **Safety first:** Pauses for human approvals, uncertain sends, unfinished drafts, failures, navigation, and other situations that need attention. It avoids blindly retrying ambiguous submissions.
- **Recovery:** View status, inspect privacy-conscious diagnostics, dismiss outdated approval warnings, or explicitly continue after reviewing the situation.
- **Optional Mission Signal:** Advanced users can self-host a separate completion service. This is **not required** for ordinary use.

## Install (unpacked extension)

1. Download the [latest source code](https://github.com/bazobehram/chatgpt-auto-continue) using **Code → Download ZIP**, or clone this repository.
2. Extract the ZIP into a permanent folder. You should see `manifest.json` in that folder.
3. Open `chrome://extensions` (Chromium-based browsers with compatible extension support).
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the folder containing `manifest.json`.
6. Open a **saved ChatGPT conversation** at `https://chatgpt.com/c/...`, then open the Auto-Continue extension.

No Node.js, Python, CommandCore, Docker, or Mission Signal service is needed to run **Local Only**.

### Your first continuation

1. Keep **Local Only** selected.
2. Enter a message, such as `Continue with the next step.`
3. Leave the default limit at **2** for your first test.
4. Click **Start** to watch for a **new completed reply**.
5. To continue the reply that was already finished when you pressed Start, click **Send once** while it is available.
6. The extension continues subsequent eligible replies until it pauses or reaches your limit. Use **Pause** to stop.

**Why doesn't Start immediately send?** It starts monitoring from the current conversation baseline to avoid duplicating old messages. **Send once** is the explicit option for an existing finished reply.

**How does Resume work?** Resume Mission resumes observing; it does not automatically resend the previously handled reply. After a human-approval warning, use **Continue after review** only after handling the requested action, or **Dismiss approval warning** when the warning was false or outdated. Neither button grants an external approval.

## Optional: self-hosted Mission Signal

Mission Signal is a separate API designed for users who want an external completion condition rather than just a continuation count. **It is advanced and optional.** This project does not provide a shared public server or an enrollment key. Users must deploy and administer their own server.

See [Mission Signal deployment](mission-signal/DEPLOYMENT.md) for setup. Then, in the extension's **Mission Signal connection** panel, enter **your own HTTPS server origin**, such as `https://missions.example.org`, and your own enrollment key. Chrome asks for access to **that specific server**; it is not an automatic connection to the developer's server.

Changing a server requires entering its enrollment key again; saved credentials are not sent to another host. Existing private installations retain their stored server URL, although upgrading may require granting host permission again.

**Important:** The default Mission Signal completion instruction assumes you have the separate CommandCore integration and an appropriately named `homeserver` with the Mission Signal CLI. Without that integration, use Local Only. Mission Signal is not currently a general-purpose standalone task-completion system for arbitrary AI agents.

## Privacy and permissions

- The extension runs against ChatGPT conversations in your existing browser session.
- There is **no extension telemetry or analytics service** and no remotely loaded extension code.
- Chat continuation messages and session information remain in Chrome's local extension storage and the ChatGPT conversation itself.
- **Local Only** does not contact a Mission Signal server.
- The extension has `storage`, `alarms` and `tabs` permissions, plus ChatGPT host access.
- Optional Mission Signal access is requested only when you explicitly configure an HTTPS server. The broad *optional permission pattern* allows you to choose your own host; Chrome asks for permission to the specific origin.
- If you use Mission Signal, that self-hosted service receives the mission registration, identifiers, and authenticated status requests. Do not reuse secrets from other services.

See [SECURITY.md](SECURITY.md) for vulnerability reporting and [CONTRIBUTING.md](CONTRIBUTING.md) for contributing.

## Safety and limitations

This extension interacts with a website UI that can change without notice. It may miss a completed answer, pause too soon, or need a manual restart after navigation or refresh. It is deliberately conservative: **a detected approval, ambiguous send, active generation, or draft should not be silently bypassed**.

“Unlimited” only removes the numeric follow-up cap; it does **not** remove safety stops, usage limits, or ChatGPT policies. The extension cannot prove transactional exactly-once delivery through a browser interface. Some tests use simulated ChatGPT pages rather than an authenticated browser session.

Do not rely on automatic continuation for irreversible operations, financial transfers, privileged access, or tasks that need manual approval. Verify outputs before using or executing them.

## Update

Pull the latest changes (or download and extract the updated ZIP into your existing source folder). In `chrome://extensions`, click **Reload** on the same extension, then refresh ChatGPT tabs. If you use a self-hosted server, review its permissions and configuration after upgrading.

## Development and tests

Requires Node.js, Python, and Playwright/Chromium for the full browser suites:

```bash
npm install
npm test
npm run test:all
```

API tests: `python -m pytest mission-signal/tests -q`. The full test runner executes additional checks and may require Playwright's Chromium install. These are QA fixtures; no live ChatGPT account is needed for automated browser tests.

## Contribute ❤️

Bug reports, accessibility improvements, safer recovery flows, translations, documentation fixes, and patches are welcome. Please open an issue describing the behavior and reproduction steps (without credentials or private conversations), or submit a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[GNU General Public License v3.0](LICENSE) (GPL-3.0). You may use, study, share, and modify this free software under the license's terms.

---
*Auto-Continue is a community browser extension, not an official OpenAI product.*
