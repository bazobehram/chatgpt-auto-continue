# v0.4.2 acceptance report

Date: 2026-10-25. Existing installed extension: `nieinjacjejclbomhndjaabjnpjnbapf`.
Source: `D:\Projects\chatgpt-auto-continue-v0.3.1\chatgpt-auto-continue-v0.3.1`.

## Result

Engineering and available acceptance checks completed in place. The existing Chrome installation was reloaded as v0.4.2, including the final detached-renderer error fix. No ZIP, additional installation, dependency installation, or separate project was created.

Live acceptance: **25 PASS, 0 FAIL** within the explicit scopes below. The final long-tool run closed the two initially unverified cases: two actual sequential Python calls measured 45 seconds each, the controller remained Generating in the background at78 seconds against a temporary60-second stall threshold, then stopped Completed0/1 without sending. Original stall180 was restored and saved. Passing these bounded cases is not a universal production guarantee.

Automated acceptance: **40/40 unit tests**, smoke checks, **10/10 browser groups**, **8/8 lifecycle/cleanup groups**, and **10/10 limits/runtime groups** pass. Browser groups use real Chromium and the unpacked extension with intercepted local ChatGPT fixtures; they do not constitute authenticated ChatGPT verification. The worker restart test actually stops and restarts the Chromium extension worker through CDP. The tool test holds the busy indicator for 65 seconds against a 60-second stall timeout; the unit clock also covers 30 minutes of unchanged generation/tool activity.

Machine-readable results: `tests/full-test-results.json`, `tests/acceptance-results.json`, `tests/limits-results.json`, and `tests/live-acceptance-results.json`. Final live popup evidence: `tests/live-popup-v0.4.2-paused.png` and `tests/live-long-tool-completed.png`.

## Root causes and changes

- Runtime state and ownership are reconciled by stable conversation ID and explicit owning tab, independently of active Chrome focus and popup lifetime. Per-chat messages, mode, limit, counter and journal remain separate.
- A saved enabled flag did not establish runtime reachability. The popup now probes the actual owner before reporting Running; unreachable controllers show Needs attention and can still be paused through a bounded request.
- Silence-based generation expiry could misclassify long tools/background throttling. Visible generation/tool evidence remains busy without an automatic stall pause or refresh. Healthy progress clears resolved errors.
- Modern ChatGPT markup includes temporary fallback IDs, speaker-only placeholders, and profile-menu busy state. Completion now requires durable message identity, actual response content and final structural evidence; busy scope is confined to conversation controls.
- Live QA found a failed renderer outside the assistant message body. The final fix matches visible `data-dil-render-failed` to the latest durable `data-dil-message-id`, pauses immediately, and ignores unrelated historical failures. A real Chromium regression covers both cases.
- Submission uses a persisted claim before clicking and validates its generation/token again before submission. A matching new user message is required for acknowledgment, with a bounded ten-second render allowance and no second click. Ambiguous sends stop for review.
- Refresh and owner loss pause safely; worker suspension retains the journal. Ownership is never silently transferred after an uncertain send.
- Main popup now contains Continuation limit with Limited/Unlimited and progress. Changing mode preserves count/journal. Overview groups duplicate conversations and separates title focus from Start/Pause. Actual titles, including GX10 Yetki Doğrulaması, are preserved. Advanced remains collapsed; warning text wraps.

## Live authenticated Chrome matrix

PASS means directly observed behavior within the stated scope. Live observations are recorded separately from isolated fixture coverage.

| # | Criterion | Live result | Evidence / scope |
|---|---|---|---|
| 1 | Existing extension reload and popup | PASS | Same installed ID; details and actual popup show v0.4.2. Final renderer-specific warning proves final source loaded. |
| 2 | Correct conversation titles | PASS | QA A/B/C match their actual chats; GX10 Yetki Doğrulaması preserved in overview. |
| 3 | Default go | PASS | B submitted a unique acknowledged go user message. |
| 4 | Custom conversation message | PASS | A submitted QA custom, independently of B. |
| 5 | Global default fallback | PASS | B/C show Using global default; go was submitted. Global settings were preserved. |
| 6 | Start and Pause | PASS | Operational Running after Start; manual overview Pause produced Paused and disabled sending. |
| 7 | Limited mode | PASS | A stopped at2, B/C at1; actual Paused controls verified. |
| 8 | Unlimited selection/persistence | PASS | B selected Unlimited while Off with existing count5 preserved; later Running Unlimited persisted across popup/tab changes. Unlimited beyond a numeric threshold is additionally fixture-tested. |
| 9 | Continuation counting | PASS | Unique user IDs agree with A2/B1 counters; mode changes preserve counts. Explicit new Start establishes a new session count. |
| 10 | Switch tabs during generation | PASS | Visible Stop/streaming observed, switched away; background owner completed and continued without Start. |
| 11 | Switch tabs while idle | PASS | A remained operational Running0/2 through tab/diagnostic changes. |
| 12 | Multiple conversations running | PASS | A/B simultaneously Running with different per-chat modes/limits. |
| 13 | Independent messages | PASS | A custom vs B global go, separate acknowledged IDs. |
| 14 | Independent counters | PASS | A2 and B1; starting/changing B did not reset A. |
| 15 | Pause one while another continues | PASS | B overview paused A0/2; B remained Running0/1, then sent exactly one go. |
| 16 | Duplicate same-conversation tabs | PASS | Owner344 and duplicate367; duplicate Other tab, cannot send, Start/Send once/settings disabled. One logical row. |
| 17 | Popup close/reopen | PASS | Running/mode/count survive popup closure and reopening. |
| 18 | Background operation | PASS | A continued with duplicate foreground; C continued after switching to B. |
| 19 | Refresh safety | PASS | During-generation and completed-response refresh checks paused with Page refreshed and no replay. Reopening also retains disabled state. |
| 20 | Service-worker restart | PASS | Exact extension worker Stop activated in chrome://serviceworker-internals; process30148 replaced by31100. A remained Running0/2 with same custom/limit, then submitted only two bounded continuations. |
| 21 | Genuine completion detection | PASS | Real All tasks are complete reply plus continuation request produced Completed0/1; no go was submitted. |
| 22 | Long-running tool activity | PASS | Actual Python execution ran two sequential45-second calls. At78 seconds the background C row remained Generating0/1, with one Analyzed and another Analyzing tool and Stop present, against temporary stall60. Both returned45, final total90. |
| 23 | No duplicate sends | PASS | Unique transcript IDs: exactly two custom messages after restart with duplicate open, one go in B, no replay on tested refresh/reopen paths. This establishes the tested cases, not transactional exactly-once delivery under every possible failure. |
| 24 | Accurate stalled-generation warnings | PASS | No premature stall pause during real background tool work beyond60 seconds; final state Completed0/1 with only Roadmap completion detected. Resolved renderer warning cleared on healthy reply. Original stall180 restored and saved. |
| 25 | Stop/limit and safe recovery | PASS | Limits disable sends; renderer failure pauses0/1 immediately; successful reply clears stale warning; active owner close/reopen returns Paused with Owner tab closed. No automatic ownership transfer. |

## Original lifecycle acceptance criteria

All seven isolated criteria PASS: duplicate ownership; independent conversations; refresh during generation; refresh after completed response; closure/reopen restoration; actual worker restart; accurate popup state. Cleanup also PASS. Corresponding live checks passed within the matrix scope above.

## Cleanup

- A (user-opened tab344) remains open and **Paused**, with Start and disabled Send once visibly verified. Its continuation limit alone was not used as evidence of disarming.
- B was visibly Paused before closure. C was explicitly tested Running0/1, then its owner closed; reopening showed **Paused0/1, Owner tab closed**, saved go/Limited1, disabled Send once.
- Only agent-created QA B/C, duplicate and worker-diagnostic tabs were closed. Final browser metadata confirmed only the user-opened QA A remains among these QA tab IDs.
- A final long-tool check reopened C in tab385. It finished Completed0/1 with disabled Send once, then tab385 was closed. The original stall180, settle6, watchdog30 and unchecked recovery setting were restored and saved. All known disposable QA controllers are disabled. No QA scheduler or background test process is left intentionally running; isolated profiles clean up all stored sessions/tabs in finally blocks.
- Important development conversations received no test messages or activation changes.
- Full automated suite rerun after live QA cleanup; see the timestamped full-test-results.json for final output.

## Remaining limitations

Authenticated ChatGPT sometimes rendered historical/fresh replies as This response couldn’t load, especially after reload. The extension now pauses on the latest matching failure; it cannot repair the service renderer. English approval/completion phrases are conservative heuristics. ChatGPT DOM changes, localization and virtualized transcripts can require manual review. An indefinitely stuck busy spinner cannot be reliably distinguished from a legitimate long-running tool; no blind resend or refresh is permitted by that ambiguity. Unlimited retains these safeguards.

All25 requested live criteria passed within the table scopes. Not exhaustively tested: arbitrary-length or every type of external tool, every localization/model/layout, browser crashes at every instruction boundary, and every network failure timing. Completion detection remains heuristic. No blanket failure-free production guarantee is made.
