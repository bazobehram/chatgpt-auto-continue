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
