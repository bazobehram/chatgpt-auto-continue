# ChatGPT Auto-Continue v0.6.0

Manifest V3 Chrome extension using your existing ChatGPT login, with an optional independent Mission Signal service on your homeserver. Local Only works without that service. No telemetry or remotely loaded extension code.

## Existing installation

Keep the current unpacked source directory and extension ID. Update files here, then click Reload on the existing entry in chrome://extensions. Refresh disposable test tabs to load the content script. No ZIP or second installation is required.

## Use

**Mission Signal:** Selecting Mission Signal makes completion-driven continuation Unlimited by default. An optional numeric safety cap is in Advanced settings and must be enabled explicitly. If the service disconnects, at most five offline continuation attempts are allowed; the controller then pauses. The server's completed state is authoritative.

**Mission lifecycle:** Start registers the mission and sends one setup instruction. If it was manually sent after a UI failure, the controller reconciles the exact instruction from the conversation instead of repeating it. Resume reactivates a confirmed mission while retaining count and journal. Cancel mission requests authenticated cancellation from the homeserver; a network failure never claims success. New mission is allowed only after the preceding mission is completed or cancelled. The popup shows Completed or Cancelled and disables Start for those terminal states. Cancelling is irreversible for that Mission ID. Avoid resetting a mission when an old unsent draft remains in the composer.

**Deployment compatibility:** The Cancel control requires Mission Signal service v0.2.0 with the authenticated `/cancel` route. Updating the extension alone is insufficient; deploy the independent service before enabling this version in real Chrome.


Open a saved ChatGPT conversation, including project conversations. Start acknowledges the current reply and waits for a new completed reply. Send once, available after Start, requests the first continuation for an existing finished reply; subsequent eligible replies continue automatically until paused or the limit is reached.

One editor switches between This chat and Global default. Changes save on leaving the field; saved and unsaved status is explicit. Use global default clears the chat override. Advanced settings and the other-tab overview are collapsed initially.

Defaults: go; settle delay 6 seconds; watchdog 30 seconds; stall timeout 180 seconds; maximum attempts 2; refresh recovery off. Counts include journaled attempts, including uncertain outcomes.

Pause disables automation. Refresh, navigation away, owner closure, browser startup, an uncertain submission, a composer draft, detected errors/approval/completion, or the limit pauses safely. Review before starting again. Explicitly starting a paused Local Only session creates a fresh baseline and resets its attempt count. Resuming the same mission preserves its count and journal.

## Safety

background.js serializes conversation mutations and persists owner tab, activation generation, baseline, last handled response, claim token, attempts and recovery state. Only the owner can claim or confirm a send. A claim is durable before DOM interaction. Cancellation and activation are checked before the final click. Old activations cannot pause newer activations.

content.js observes message structure, final-turn evidence, generation controls and busy/tool indicators. Settling is an extra delay, not completion evidence by itself. Current ChatGPT and legacy markup are supported. Unknown controls fail closed. A document guard prevents duplicate installation; storage events and chrome.alarms wake the controller without a permanent worker.

Worker restart retains journals and ownership. Browser startup pauses enabled sessions. Optional recovery permits one bounded refresh followed by manual review; uncertain messages are never automatically retried. Refresh always pauses rather than replaying messages.

popup.js listens to live storage updates. Non-owner tabs clearly identify the running owner and cannot start, send or change its message. Settings use schema version 2 with normalization and migration.

Permissions: storage, alarms, tabs, and host access to https://chatgpt.com/* and the dedicated https://mission-signal.synovaq.org/* API. Content scripts run only on ChatGPT.

## Tests

Run all seven suites before installing; the GitHub Actions workflow on the feature branch checks the same acceptance runner. Existing production Chrome requires a separate, user-authorized live smoke test. Do not interpret isolated browser fixture success as a real authenticated Chrome result.


- npm test: Node controller/content tests.
- python tests/smoke.py: manifest, permissions, files and JavaScript syntax.
- npm run test:all: all suites, with logs in tests/full-test-results.json.

Playwright suites use disposable Chromium profiles with the real extension. All ChatGPT requests are intercepted with local deterministic fixtures; no authenticated account is contacted. The acceptance suite uses real runtime messages, persistent storage, the popup, and an actual service-worker stop/restart through CDP.

Browser tests require Playwright and Chromium. QA_CHROMIUM selects an existing Chromium executable; QA_PYTHON selects Python. NODE_PATH may point to bundled Playwright. Nothing is installed into the user's normal Chrome profile.

See TEST_REPORT.md for the distinction between isolated results and live authenticated Chrome checks.

## Limits

The controller enforces at most one attempt per eligible reply within an activation, not transactional exactly-once delivery through a browser UI. Explicitly starting again or manually sending can initiate another attempt by user choice.

Roadmap/approval detection uses conservative English patterns and cannot understand arbitrary workflows perfectly. ChatGPT markup, localization, virtualized transcripts, tool output and network behavior can change. Unknown DOM or errors may require manual review. Some historical replies in the tested account fail to render after refresh; the controller pauses on that error.

A partial live acceptance run is not full production verification.

## v0.6.0 conversation limits and runtime status

Continuation limit is in the main view. Limited takes a positive whole number; Unlimited removes the count cap while retaining all submission, ownership, authentication, approval and recovery safeguards. Each conversation saves its own mode and numeric value. Changing the mode or limit preserves the counter and journal; explicitly starting a paused Local Only session establishes a new baseline and resets that session count. Resuming the same registered mission preserves its continuation count and journal; an exhausted Limited mission requires a raised limit or an explicit new mission.

Other ChatGPT tabs groups duplicate tabs into one logical conversation. Its title focuses the corresponding tab; separate Start/Pause buttons manage its controller without changing the active tab. Real titles are preserved, including GX10 Yetki Doğrulaması. The popup probes the owner controller before claiming it is Running. A saved enabled flag with no responding controller is shown as Needs attention.

Switching focus and closing the popup do not pause or reset a conversation. Known generation or tool controls remain evidence of ongoing work even when no text changes or background timers are throttled. Stall timeout applies when a submitted continuation has no identifiable reply and no busy evidence. The controller cannot reliably distinguish an indefinitely stuck spinner from a legitimate long tool call; it never uses that ambiguity as permission to send or refresh during known work.

Completion requires a durable message identity and actual response body, not temporary fallback IDs or a speaker heading. Send acknowledgment waits for matching transcript text for up to ten seconds, without clicking again. The optional recovery refresh is bounded and always pauses for review.

npm run test:limits covers Unlimited, main-view limits, background operation, delayed acknowledgment, a tool indicator held beyond the stall timeout, grouped row controls, and a debugger-paused controller. The full test runner records all seven suites in tests/full-test-results.json.


## Mission Signal v0.1.0

The independent FastAPI/SQLite service runs on Ubuntu homeserver in /opt/mission-signal. Its Compose project is mission-signal, with API loopback18865 and a separate Cloudflare tunnel for https://mission-signal.synovaq.org. No CommandCore source, tool, OAuth setting or production container is changed.

Local Only is the explicit default and never depends on the server. Choose Mission Signal while paused, then Start. The worker persists a generated mission ID/read capability before idempotent registration. Once the composer is idle and safe, it sends one instruction and verifies the matching user transcript. That instruction does not count as a continuation. Claimed or ambiguous instructions are never blindly retried after refresh or restart. A confirmed instruction is not sent again on resume. New mission replaces a reviewed prior mission only while paused.

Mission mode uses the remote state as completion authority, retaining local approval/authentication/draft/usage safeguards. The worker polls every watchdog interval and the content controller checks during observation. Every continuation claim forces a fresh remote check. A response must match both the mission and conversation ID.

On connection loss the popup shows Recovery and Disconnected X/5. Each claimed offline continuation consumes one persisted grace attempt before any DOM click. The fifth acknowledgment pauses the controller. Limited mode may stop earlier; Unlimited still stops at five offline attempts. Counts survive refresh, owner closure, browser restart and manual Pause/Start. A successful remote status synchronization resets the grace counter. If remote completion occurred while offline, reconnection stops that conversation before another continuation.

The service stores hashed read/completion capabilities separately. Chrome has no completion key. The private completion capability is available to the existing authorized homeserver OS identity through `mission-signal complete <MISSION_ID>`. A Mission ID alone or the read token cannot complete a mission. Secrets never belong in ChatGPT prompts. The enrollment key is configured in the popup connection password field and is not returned by STATUS or included in mission instructions.

See mission-signal/DEPLOYMENT.md and TEST_REPORT.md for deployment and acceptance scope. Historical v0.4.2 evidence is retained in TEST_REPORT-v0.4.2.md.
