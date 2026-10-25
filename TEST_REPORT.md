# Auto-Continue v0.5.0 + Mission Signal v0.1.0 acceptance

Date: 2026-10-25. Existing extension ID: `nieinjacjejclbomhndjaabjnpjnbapf`.

## Delivery status

Extension source v0.5.0 is implemented in the existing project. Mission Signal v0.1.0 is deployed on the verified Ubuntu homeserver at https://mission-signal.synovaq.org, with its own Compose project and Cloudflare tunnel. No ZIP or duplicate Chrome installation was created. CommandCore source/tools/OAuth/production configuration were not changed by this work.

The user subsequently authorized live testing again. The existing extension was reloaded with the final v0.5.0 source (Chrome displayed Reloaded). On 2026-10-25 at approximately 22:13 Europe/Istanbul, the full authenticated chain passed: extension automatic instruction → ChatGPT → existing CommandCore shell.exec → homeserver CLI → server COMPLETED → extension automatically Completed/paused. No source fix was required during this final live test.

Mission `83067ead-6cdf-48c5-b997-5d89bb741dd7` belongs to disposable conversation `6ade545e-fcf4-83eb-892c-d7186accd82e`. Three manual READY seed/check messages preceded exactly one automatic setup instruction; the setup did not count as a continuation (0/2). A separate read-only server audit confirmed the matching mission/conversation and COMPLETED state. Refresh and tab closure/reopening retained Completed, paused, disabled Send once, and exactly four user messages including one setup. All agent-created QA tabs were then closed; final tab metadata confirmed removal. The original QA A was explicitly observed Paused with disabled Send once. Final backend audit: zero ACTIVE missions and CommandCore healthy.

Evidence: `tests/live-mission-completed.png`, `tests/live-mission-restored.txt`, and `tests/live-mission-v0.5.0-results.json`. The CommandCore embedded result card failed to display in ChatGPT; this presentation issue did not prevent execution, the CLI result, authoritative server completion, or the extension stop. ChatGPT initially showed blank/failed reply renderers; a QA-only refresh restored READY bodies before activation.

## Implemented behavior

- Conversation-ID-based ownership and independent settings/messages/counters retain the existing background-tab and duplicate-tab safeguards.
- Local Only is explicit and the default. Its operation never depends on Mission Signal connectivity.
- Mission Signal mode registers a random persistent mission ID and read capability idempotently, then automatically delivers one instruction when the composer is safe. The matching user transcript must acknowledge it. Claimed/ambiguous instructions are not retried automatically after refresh/restart; confirmed instructions are not repeated on resume.
- The instruction contains the ID and the existing homeserver `mission-signal complete` CLI command, requires the full verified roadmap, and excludes secrets. It does not count as a continuation.
- The remote mission is polled during observation/watchdog activity and checked afresh before every continuation claim. Only the matching mission/conversation can stop that controller.
- Connection failure shows Recovery / Disconnected X/5. Each attempted offline continuation is charged durably before DOM interaction. The fifth acknowledged attempt pauses. Limited may stop earlier; Unlimited also respects five. Reconnection synchronizes remote state before sending and resets grace only after a valid successful status response.
- Same registered mission resume preserves its continuation count and journal across pause/refresh/browser startup. An exhausted Limited mission requires raising the limit or explicitly starting a new mission. Local Only retains its existing explicit-new-session Start semantics.
- Remote mode retains approval, login, CAPTCHA/usage, draft, DOM and ambiguous-submission safeguards; local English completion prose cannot falsely substitute for authoritative remote completion.
- Clean SVG-authored icon with16/32/48/128px assets; prominent limit/completion modes; per-chat connection/mission status; masked enrollment configuration.

## Automated verification

Run `node tests/run-all.cjs` with the existing bundled Playwright/Chromium runtime. It runs seven suites: controller, smoke, FastAPI service, basic browser, lifecycle acceptance, limits/runtime, and mission browser acceptance. Final timestamped results are in `tests/full-test-results.json`; per-suite mission/deployment artifacts are alongside it.

Final confirmed result: **7/7 suites PASS, 0 FAIL** —50/50 controller tests,9/9 service tests, smoke checks, and36/36 Chromium scenario groups (10 basic +8 lifecycle/cleanup +10 limits/runtime +8 mission). Final full-run timestamp: 2026-10-25T19:18:58.472Z. After explicit SQLite connection cleanup, the9 API tests passed again and the redeployed HTTPS creation/CLI completion/status round trip passed. Counts are separated because Chromium groups contain multiple assertions. The final JSON, rather than this inventory, is the authoritative pass/fail result.

The isolated Chromium suites load the real unpacked extension in disposable profiles and intercept all ChatGPT/Mission Signal network traffic. They do not contact the authenticated account. Fault injection covers disconnected requests, five offline attempts, Local Only independence, exact mission completion identity, real extension-worker stop/restart with persisted grace, refresh/no instruction replay, Limited resume persistence, unavailable controller probing, delayed/mismatched acknowledgments, and long tools beyond the stall threshold. Cleanup disables all test controllers and closes the disposable profiles.

The service tests cover authentication, read/completion privilege separation, mission isolation, idempotent registration/completion, persistence, payload validation, untrusted origins, and absence of capabilities from public responses.

## Required acceptance matrix

| # | Requirement | Isolated result | Live result / limit |
|---|---|---|---|
| 1 | Normal automatic continuation | PASS | Historical live continuation passed; final v0.5.0 automatic mission setup passed live (0/2 continuations). |
| 2 | Limited / Unlimited | PASS | v0.5.0 actual popup showed retained Limited setting; earlier live switching/persistence evidence is in the historical report. |
| 3 | Multiple independent conversations | PASS | Historical live A/B test passed; final v0.5.0 scenario unverified live. |
| 4 | Background operation | PASS | Historical live background/tool tests passed; final v0.5.0 scenario unverified live. |
| 5 | Duplicate-tab protection | PASS | Historical live duplicate-owner test passed; final v0.5.0 scenario unverified live. |
| 6 | Correct conversation identification | PASS | Actual v0.5.0 popup showed QA reply instruction for its verified URL. Important conversations received no test messages. |
| 7 | Registration and automatic instruction delivery | PASS | PASS: real authenticated Chrome registered and delivered exactly one automatic instruction. |
| 8 | AI completion through CommandCore to CLI | PASS in components | PASS: ChatGPT automatically invoked existing CommandCore shell.exec and homeserver CLI; matching authoritative server state confirmed separately. |
| 9 | Remote completion stops correct conversation | PASS | PASS: live popup automatically Completed/paused, Remote mission completed, Send once disabled, count0/2. |
| 10 | Restart and persistent mission state | PASS | Actual independent API container restart preserved COMPLETED and its timestamp over HTTPS. Full homeserver reboot intentionally not performed to avoid disrupting production. Docker boot startup enabled and restart policy verified. |
| 11 | Loss / five attempts / reconnection | PASS | Controlled isolated network faults only; no production service was stopped for outage simulation. |
| 12 | Popup / new icon | PASS | PASS: final source reloaded in existing installation; correct title, count, instruction and completion state verified live. |
| 13 | Refresh / worker restart / duplicate suppression | PASS | PASS live completed-response refresh and tab close/reopen: one setup, four user messages, paused state retained. Active-generation refresh and worker restart PASS in isolated Chromium. |

## Actual homeserver deployment

- Verified CommandCore device `171c2145-7fb1-4263-bf5d-a266b3f24123`, hostname homeserver, Ubuntu24.04 x86_64.
- `/opt/mission-signal`, project `mission-signal`; API `127.0.0.1:18865`, persistent SQLite/data and private capability files.
- Separate Cloudflare tunnel `8b117f4d-236e-4d51-937c-1c812fe543a5`, new hostname `mission-signal.synovaq.org`. Existing CommandCore tunnel/routes/credentials were not changed.
- API and tunnel restart unless-stopped; read-only roots, dropped capabilities, resource/log caps. Observed snapshot:35.3MiB API and15.7MiB tunnel memory, low idle CPU.
- HTTPS health, authenticated/idempotent registration, rejected unauthenticated/read-token completion, actual CLI completion and idempotent completion PASS.
- Restarting only the Mission Signal API retained the completed state/timestamp. All three service QA missions are COMPLETED; temporary private QA probe files removed.

## Production audit

CommandCore was healthy before deployment and is healthy at the final audit. Its baseline identity/start/restart metadata matched immediately after Mission Signal deployment and restart checks. A later audit detected a separate CommandCore container replacement at16:40:16 UTC (current restart count0, healthy), during concurrent user work. Our recorded shell operations targeted only the Mission Signal Compose project and CLI. We therefore do not claim the production container remained unchanged for the whole session. The pre-existing release-stage container was already unhealthy at the initial audit; it was not repaired or changed by this work.

## Cleanup and limitations

- The user-opened QA A remains Paused; its actual v0.5.0 popup had Start and disabled Send once. This was verified as state, not inferred solely from its2/2 count.
- The new mission QA tab408 never had its controller armed and was closed when the user chose isolated-only testing. Earlier agent-created QA tabs/diagnostic tabs were closed. Important development chats were not modified.
- No service credentials were put into ChatGPT prompts. The private temporary Windows provisioning file was removed after enrollment was saved and the password field cleared. Service capabilities remain private on homeserver.
- Local service unit tests do not deploy a server on the development PC. The running Docker service is only on homeserver.
- Final Chrome reload and full authenticated end-to-end mission flow passed after renewed user authorization. Concurrency, active-generation refresh, and extension-worker fault injection remain separately identified as isolated Chromium verification for final v0.5.0.
- ChatGPT sometimes rendered replies as This response couldn’t load. The controller pauses on the latest matching renderer failure and excludes historical errors; it cannot repair ChatGPT rendering.
- Unknown future markup, localization, service/network failure timing and arbitrary tool duration cannot be exhaustively guaranteed. Browser UI submission is at-most-once attempts with fail-closed ambiguity, not transactional delivery.
