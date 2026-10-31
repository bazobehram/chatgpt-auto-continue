# Mission Signal — self-hosted deployment

Mission Signal is an **optional**, separately deployed completion-state service. Local Only mode does not require it.

## Deployment requirements

- A server you control, Python runtime or Docker, and a stable HTTPS origin
- A strong, separately generated enrollment credential (never committed)
- Persistent private storage for SQLite state and completion capabilities
- A configured extension origin accepted by the server
- TLS termination and an appropriate backup strategy

Use `mission-signal/compose.yaml` as a starting point and review every bind mount, secret path and ingress setting before deploying. Replace all example hosts, paths, and credentials with your own values. Do not expose an unauthenticated completion capability.

## Extension origins and CORS

Each unpacked extension may have a different `chrome-extension://<extension-id>` origin. The service currently checks a single origin from `MISSION_EXTENSION_ORIGIN`. Configure this variable to **your own** installed extension origin. There is no universal published extension ID yet. If changing this behavior to support multiple origin IDs, validate every origin and retain credential authentication; do not use an unconditional allow-all origin policy.

## Configuration

Configure the extension's **Mission Signal connection** settings with your own HTTPS origin and enrollment key; approve the additional browser host permission. Never reuse a third-party enrollment key or connect to an unknown server.

The service stores hashed authentication capabilities. The extension receives a mission read capability, not the completion capability. An authorized operator can mark independently verified work complete with the service CLI:

```bash
mission-signal complete <MISSION_ID>
```

A model running without authorized access to that CLI cannot independently signal completion. Users should complete their own missions after checking the work.

## Important

The old internal deployment notes, infrastructure IDs and live QA records are not part of the public deployment recipe. Do not publish previous repository history or historical artifacts until they have been reviewed and, if necessary, excluded from a fresh public-history repository.
