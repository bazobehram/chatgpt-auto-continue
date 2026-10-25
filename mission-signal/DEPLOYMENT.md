# Mission Signal v0.1.0 deployment

## Actual deployment

- Verified target: Ubuntu24.04 x86_64 hostname `homeserver`, CommandCore immutable device `171c2145-7fb1-4263-bf5d-a266b3f24123`.
- Directory `/opt/mission-signal`, Compose project `mission-signal`.
- Containers `mission-signal-api-1` and `mission-signal-tunnel-1`.
- HTTPS `https://mission-signal.synovaq.org`, independent Cloudflare tunnel `8b117f4d-236e-4d51-937c-1c812fe543a5`.
- API listens on host loopback `127.0.0.1:18865`; no public origin port.
- SQLite and mission-specific CLI capabilities persist under `/opt/mission-signal/data`.
- Enrollment and independent tunnel credentials are private files under `/opt/mission-signal/secrets`, excluded from source/build context.
- CLI `/usr/local/bin/mission-signal`, Python standard library only.

The Cloudflare account certificate was used to create only the separate named tunnel and its previously unused CNAME. The existing CommandCore tunnel, deployment, credentials, containers, volumes and OAuth configuration were not changed. There is no new CommandCore tool or source patch.

## Authentication

Creation requires an enrollment key. Chrome generates a separate read token and random mission ID, persists them before registration, and retries registration idempotently. The API stores token hashes. Completion uses a different per-mission capability, written with private permissions on homeserver and never returned to Chrome.

The existing authorized homeserver OS identity runs:

```sh
mission-signal complete <MISSION_ID>
```

The CLI reads the local private capability and submits to loopback. Knowing a Mission ID, a different mission's credential, or the read token cannot authorize completion. Repeated authenticated completion preserves the first completion timestamp.

## Operations

Use explicit project and file selectors so production projects cannot be affected:

```sh
docker compose -p mission-signal -f /opt/mission-signal/compose.yaml ps
docker compose -p mission-signal -f /opt/mission-signal/compose.yaml logs --tail 50 api
docker compose -p mission-signal -f /opt/mission-signal/compose.yaml restart api
curl --fail https://mission-signal.synovaq.org/health
```

Both containers use restart unless-stopped, bounded memory/CPU/logging, dropped capabilities and read-only root filesystems. API health checks run every30 seconds. SQLite uses WAL and bounded busy waits. Back up the data directory and private credentials together; do not publish either. Do not remove data/secrets when updating the image.

## Verified live service checks

Public HTTPS health and authenticated creation succeeded. Creation is idempotent and bound to both conversation ID and read token. Missing credentials/read-only credentials cannot complete. CommandCore shell execution successfully invoked the installed CLI. Repeated completion was idempotent. Restarting only the API container preserved the COMPLETED state and timestamp over HTTPS. Production container identity/start/restart metadata matched the saved baseline after these operations.

At the later final audit, CommandCore was still healthy but its container had been replaced at2026-10-25T16:40:16 UTC during concurrent work. This replacement was not an operation performed by the Mission Signal deployment commands. Original/final metadata are retained on homeserver. Do not interpret the earlier successful baseline comparison as a claim that unrelated production work stopped for this session.

One probe using Python's default User-Agent received Cloudflare403; using an explicit application User-Agent succeeded. No Cloudflare security setting was weakened. The Chrome worker uses the normal browser User-Agent.

## Browser acceptance scope

The existing Chrome installation was reloaded as v0.5.0 with the same extension ID and the dedicated HTTPS host permission. Its actual popup and new icon were observed. The enrollment key was provisioned via the popup password field, verified saved/cleared, and its private temporary transfer file removed. Local Only remains the default for existing conversations.

After renewed live-test authorization, the full authenticated sequence passed on 2026-10-25: one automatic extension instruction, ChatGPT invoking the existing CommandCore shell.exec, homeserver CLI completion, authoritative COMPLETED state, and automatic extension stop. Mission `83067ead-6cdf-48c5-b997-5d89bb741dd7` matched QA conversation `6ade545e-fcf4-83eb-892c-d7186accd82e`. A separate read-only SQLite audit confirmed completion. The embedded CommandCore card had a display failure, but execution and completion succeeded.

The existing extension was reloaded with final v0.5.0 source before that test. Refresh and QA tab closure/reopening retained Completed/paused with one setup message and no continuations. Created QA tabs were closed; zero active backend missions remained. Worker restart and concurrent-sender fault tests are reported separately as isolated Chromium checks.
