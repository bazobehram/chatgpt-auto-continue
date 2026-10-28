## v0.7.4 — Preserve human-attention state across Resume

- Mission Signal **Resume** and ordinary **Start** now refuse unresolved human-review and uncertain-send states instead of creating a fresh monitoring session that silently loses recovery data.
- Repeated Pause preserves the original `NEEDS_USER` warning and its reply identity.
- Paused legacy review state can be dismissed or continued using the explicit existing review controls.
- Resume's activity display distinguishes observation from a new confirmed submission; it does not claim that another continuation was sent.
- Removed the obsolete weaker `START_REVIEW_CONTINUE` command; all reviewed sends use the single verified `REQUEST_REVIEW_CONTINUE` path and existing write-ahead send journal.
- Controller and Chromium regression tests cover blocked Resume, approval identity preservation, and duplicate-send safeguards.

## v0.7.3 — Stale approval recovery and mission-switch safety

- Starting a new Mission Signal mission clears the previous session's approval flag, old review key, stale send journal, and outdated warning without deleting mission history.
- Pending setup instructions are not blocked by approval, completion, or usage-limit words in an older assistant reply. Visible ChatGPT dialogs and login/verification requirements are still respected.
- Changing completion modes while paused clears outdated *human-review* warnings, not uncertain-send safety stops.
- Paused human-approval warnings show **Continue after review** directly, without pressing Start; confirming atomically arms one continuation after checking the current assistant reply and any draft. Ordinary Start is disabled until the warning is resolved.\n- Paused human-approval warnings have **Dismiss approval warning** with a confirmation; dismissing never sends or approves anything. It records the exact assistant reply as handled so Start does not trigger the same old warning again.
- Existing warnings from v0.7.2 are supported through a content-only reply-identity probe (no message text or credentials).
- Tests cover old-approval → new mission, dismissal across restart, mode changes, uncertain-send protection, and isolated Chromium UI.

## v0.7.2 — Explicit recovery after human review

- Preserve a previously confirmed send journal when a `NEEDS_USER` session is restarted; Start alone never replays the last reply.
- Show **Continue after review** only for a session that previously required human intervention; require a direct confirmation that the external action has been completed.
- The reviewed continuation is authorized for one matching assistant reply only, is journaled before sending, and clears its permission on claim. No automatic bypass of actual human approval.
- Added regression coverage for Local Only review recovery without duplicate sends; Mission Signal stays under its existing remote-completion gate.

## v0.7.0 — Local diagnostic journal and stuck-send recovery

- Store a bounded, per-conversation trace of the last 120 state changes and send milestones in Chrome local storage; never upload logs automatically.
- Advanced Settings → Diagnostics supports copying a diagnostic report or clearing it without changing the active session.
- Trace send claim, click-ready, confirmed receipt, and pre/post-click failure using event categories only; no prompts, message text, enrollment keys, tokens, or full URLs.
- A journaled SENDING state older than 45 seconds safely pauses with Needs attention; it never retries an uncertain send.
- The report stays local until the user explicitly copies and shares it.

**Acceptance gate:** unit + isolated Chromium suites and the real popup behavior must pass before merging.

## v0.6.1 — Enrollment verification and actionable connection errors

- Saving a Mission Signal enrollment key now verifies it against the homeserver without registering a mission. Invalid keys are rejected and never replace the previously saved key.
- The password field deliberately stays empty after saving; this is not evidence that the key was lost.
- Registration reports HTTP 401 (incorrect enrollment key), HTTP 403 (extension origin rejected), or other HTTP errors instead of only saying unavailable.
- The service adds a non-mutating authenticated POST /v1/enrollment/verify endpoint. Deploy the server update before reloading the extension.

## v0.6.0 — Mission lifecycle and durable history

- Separate Local Only and Mission Signal numeric-limit preferences. Local Only retains its Limited/Unlimited controls; Mission Signal defaults to remote-completion-driven continuation, with an optional independent cap in Advanced settings.
- Clear Resume, Cancel Mission, and New Mission actions with confirmation and prevention of abandoned active remote missions.
- Mission Signal service v0.2.0 supports authenticated, idempotent cancellation, without modifying CommandCore.
- Completed and cancelled Mission IDs, Local Only completion events, and important error notices remain available in History after reset, refresh, mode switching, and worker restarts.
- Popup displays completed/cancelled terminal status, disables invalid Start actions, and hides irrelevant Local Only limit controls in Mission Signal mode.
- Safer pre-click abort handling, manual instruction reconciliation, bounded composer readiness, preserved journals, serialized status polling, and graceful teardown of invalidated content scripts.
- Expanded controller and Chromium UI coverage for lifecycle transitions, independent settings, offline limits, history persistence, and cancellation.

**Verification:** 59/59 controller tests passed on an isolated homeserver worktree. Complete Chromium/service CI and authenticated user-Chrome acceptance are independently tracked; do not claim release acceptance until both are verified.

## v0.5.1 — Mission instruction recovery

- Wait up to 4.5 seconds for the ChatGPT Send control to become ready after writing the setup instruction, without repeated clicks.
- Reconcile a manually submitted exact Mission Signal instruction against the active mission and its send journal, even when the controller was paused.
- Surface authoritative remote completion in the popup while the controller is paused.
- Add a confirmation and explicit warning for **Discard & new mission** (local detachment does not remotely cancel the old mission).
- Preserve fail-closed behavior when actual submission status is unknown.

**Verification:** JavaScript syntax checks passed. Full Node/Playwright suite and authenticated Chrome acceptance are pending on the user's development computer.

# v0.5.0 — independent Mission Signal

- Independent FastAPI/SQLite Mission Signal v0.1.0 deployed on Ubuntu homeserver with a dedicated Docker Compose project and separate Cloudflare HTTPS tunnel.
- Explicit Local Only/Mission Signal modes, per-conversation mission identity, automatic one-time instruction with verified transcript acknowledgment, and no secrets in chat.
- Forced remote completion check before each continuation; persistent five-attempt offline grace applies to both Limited and Unlimited. Reconnection synchronizes before another send.
- Same-mission resume preserves the continuation count and journal, including after refresh/browser startup. Unknown instruction outcomes require review and are never replayed automatically.
- Mission-specific read/completion capabilities, private local completion CLI, idempotent server completion, persistent storage and automatic container restart.
- New vector-authored extension icon and compact connection/recovery UI. Existing titles, messages, ownership and Local Only behavior retained.
- Existing CommandCore tools, source, OAuth and production deployment were not modified.
- Final source acceptance uses isolated Chromium at the user's request. The earlier installed v0.5.0 reload and enrollment provisioning were verified; final resume safeguard needs another Chrome reload.

# v0.4.2 — conversation persistence and acceptance

- Per-conversation Limited/Unlimited limits in the main popup; mode changes preserve counters and journals. Settings schema 2 migrates old values safely.
- Grouped conversation overview with accurate titles, progress, separate focus and Start/Pause controls, and one owner for duplicate tabs.
- Operational owner probes distinguish reachable execution from a saved enabled flag; unavailable controllers show Needs attention.
- Known generation/tool controls no longer trigger silence-based stalled-generation pauses. Missing-owner state reconciles safely without automatic ownership transfer.
- Durable IDs and actual response bodies exclude fallback/header-only completion placeholders; matching send acknowledgment tolerates delayed rendering without another click.
- Live-discovered detached renderer failures are matched to the latest message and pause immediately; unrelated historical failures do not leak into the active reply.
- Explicit READY transition, semantic approval/completion states, bounded recovery and popup wake requests, and expanded unit/Chromium fault-injection tests.
- Existing installation, permissions and extension identity retained. No ZIP or second installation.

# v0.3.1 — usability release

- Simplified popup with prominent Start/Pause and Send first continuation actions.
- Live message preview and per-chat message editor.
- Collapsible defaults and advanced settings.
- Overview of open ChatGPT conversation tabs and ownership.
- Improved keyboard focus, responsive text, and readable errors.
- No change to the v0.3.0 send state machine.

**Verification:** Automated controller tests and syntax checks; authenticated live ChatGPT validation still required.
