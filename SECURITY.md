# Security Policy

## Reporting vulnerabilities

Please **do not open a public issue** containing exploitable details, access tokens, private conversations or sensitive account data. Use GitHub's private vulnerability reporting feature if enabled for this repository. If it is unavailable, open a non-sensitive issue asking maintainers to enable a private reporting channel, without revealing the vulnerability itself.

## Security model

The extension operates with access to the user's ChatGPT page. It reads limited DOM state to detect completed replies, pending work and approval signals and may submit a continuation only when the controller's safety checks permit it. Browser-local state contains per-conversation journals. Optional Mission Signal integration stores server credentials locally and makes authenticated requests to the user's configured endpoint.

**Trust boundaries:** ChatGPT page content is untrusted; server responses are not authority to bypass local safety checks; stored state can be stale; and UI clicks cannot guarantee exactly-once delivery.

Avoid running unknown forks, sharing raw diagnostic dumps, or granting Mission Signal access to a server you do not trust. The project is not a tool for circumventing ChatGPT rate limits, moderation or approval steps.

## Supported versions

Security fixes are intended for the latest maintained release. Older builds may not receive patches. Public support/version policy will be finalized before the first release.
