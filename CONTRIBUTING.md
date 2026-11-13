# Contributing to ChatGPT Auto-Continue

Thanks for helping improve this free software! Contributions are welcome.

## Start with an issue

Before a major change, open an issue explaining the problem, expected behavior, and proposed approach. For bugs, include your browser version, extension version, reproduction steps, and relevant **redacted** diagnostics.

**Never include** ChatGPT conversation content, enrollment keys, access tokens, API credentials, device IDs, personal email addresses, or unredacted browser logs in issues or pull requests.

## Development

1. Fork the repository and create a descriptive branch.
2. Install Node.js and dependencies with `npm install`.
3. Run `npm test`, followed by `npm run test:all` where Playwright/Chromium is available.
4. Keep new functionality minimal and fail closed when a send is uncertain.
5. Add regression tests for changes to sending, approvals, mission lifecycle, or browser permissions.
6. Open a pull request describing behavior, risks, and tests.

We particularly welcome documentation, accessibility, translation, regression tests, and improvements to browser compatibility.

## Principles

- No credentials or personal information in source code, screenshots, or test fixtures.
- Do not add telemetry or third-party tracking.
- Never auto-approve external actions or silently replay uncertain sends.
- Local Only must remain functional without a third-party service.
- Avoid broad browser permissions where narrower explicit grants work.

By contributing you agree to license your contribution under the repository's GPL-3.0 license.
