# Security policy

Auto-Continue controls message submission in a logged-in ChatGPT browser tab. It is intentionally conservative but **not** a security boundary for ChatGPT, your operating system, or external tools.

## Reporting vulnerabilities

Please use GitHub's **Report a vulnerability** / private security advisory feature for this repository if available. Do **not** publish working exploits, access tokens, personal conversation transcripts, private URLs, or secret configuration in a public issue.

Include a minimal reproduction with dummy data, the affected version, and the expected vs. actual safety behavior.

## Scope

Security-relevant behavior includes duplicate sends, unexpected activation, unauthorized optional-host access, exposed enrollment credentials, forged Mission Signal status, and bypassing human approval, uncertain-send, or completion safeguards.

## Disclosure and response

Maintainers will review reports as available; there is no guaranteed response SLA. Treat automated replies as untrusted until reviewed, especially for privileged or irreversible operations.

## Privacy and safety

- Local Only has no dedicated remote telemetry service.
- Mission Signal is opt-in and self-hosted; users control the endpoint and their keys.
- Do not submit private logs or secrets with bug reports.
- Browser extensions have access to the matching ChatGPT pages. Install only code you trust and inspect permissions before granting them.
