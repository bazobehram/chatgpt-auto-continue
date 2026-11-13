# Mission Signal — optional self-hosted service

Mission Signal v0.2.0 is an **advanced, separate server** for explicitly verified mission completion. Most Auto-Continue users do **not** need it. **Local Only works without a server.**

No free shared Mission Signal service or enrollment credential is provided by this repository. Do not use someone else's server or publish enrollment secrets.

## Requirements

- Linux host with Docker and Docker Compose
- A dedicated HTTPS origin you control, e.g. `https://missions.example.org`
- A Chrome extension installation with a stable ID (find it at `chrome://extensions`)
- An enrollment key with at least 32 unpredictable characters
- Optional Cloudflare Tunnel or another appropriately secured HTTPS reverse proxy

## Configure

1. Copy this `mission-signal/` folder to a directory you administer.
2. Create private `data/` and `secrets/` directories. Do not commit them to Git.
3. Generate a new random enrollment key and store it **only** in `secrets/enrollment` with restricted filesystem permissions. Never put it in a screenshot, command log, issue, ChatGPT prompt, or repository.
4. Copy `.env.example` to `.env` and replace the sample extension origin with `chrome-extension://YOUR_EXTENSION_ID`.
5. If using Cloudflare Tunnel, copy `tunnel.example.yml` to `tunnel.yml`, supply your own tunnel ID and hostname, and place its credentials in `secrets/tunnel.json`. Or deploy **only** the API service and publish it with your own reverse proxy.
6. Run `docker compose up -d --build` from this folder, after verifying the paths, exposure, and port mappings.
7. Verify `https://YOUR_DOMAIN/health` and that unauthorized API requests are rejected.
8. In the extension popup, expand **Mission Signal connection**, enter your own HTTPS URL and enrollment key, approve the browser permission for that host, then **Save connection**.

The Docker Compose sample publishes the API only on `127.0.0.1:18865`; it does not expose a general public port. The API does not provide browser enrollment key provisioning. Configure HTTPS separately.

**Extension origin allowlist:** The API rejects requests with an Origin other than `MISSION_EXTENSION_ORIGIN`. Each separately installed unpacked extension may have a different ID. Your API must be configured for the Chrome extension origin you intend to authorize; do not set a wildcard origin. A server with an unconfigured origin is not ready for browser access.

## Completion

Mission IDs, read capabilities and completion credentials are different. The extension can register or read its own missions but cannot mark them complete. A completion credential remains on the self-hosted service.

With the optional CommandCore integration, an authorized agent may execute:

```sh
mission-signal complete YOUR_MISSION_ID
```

The CLI must be installed and configured on your own controlled host. **The extension's current mission setup message assumes a CommandCore device named `homeserver`**; users without that environment should select **Local Only**. Do not copy commands from this document into arbitrary remote hosts.

## Important security notes

- Keep `secrets/`, `data/`, `.env`, and `tunnel.yml` out of source control.
- Use a new enrollment key for your deployment. Rotate it if accidentally exposed.
- Use HTTPS and restrict access to the API. Avoid unrestricted public registration.
- Back up the SQLite database and private completion credentials together.
- Update the extension and service independently. Confirm `/v1/missions/{id}/cancel` support before using Cancel.
- Do not paste session logs or credentials into GitHub issues.

This is a reference deployment, not a managed service. Review the API's security posture for your network before exposing it.
