# Contributing

Thanks for improving ChatGPT Auto-Continue! We welcome bug fixes, documentation, test coverage, translations, accessibility improvements, and thoughtful feature proposals.

## First steps

1. Search existing issues and pull requests.
2. For substantial behavioral changes, open a proposal issue first.
3. Create a focused branch and add tests for new behavior or regressions.
4. Run `npm test`, `npm run test:all`, and `python tests/smoke.py` where dependencies are available.
5. Open a pull request describing the change, risk, test results, and any limitations.

## Engineering principles

- **Fail closed:** uncertain UI state is never permission to send another message.
- **Protect user control:** preserve pauses, drafts, approval gates and explicit stop actions.
- **Keep permissions minimal:** new origins, sensitive APIs, telemetry, and dependencies require justification and review.
- **Never hard-code personal endpoints:** optional integrations must be user-configurable.
- **Make regressions reproducible:** use synthetic fixtures; never commit real conversations or recordings.
- **Accessible UI:** labels, keyboard navigation, and clear operational states matter.
- **Be honest in tests:** mock browser tests do not replace an authenticated live smoke test.

## Bug reports

Include expected behavior, actual behavior, steps to reproduce, Chrome and extension versions, mode, and sanitized event sequence. Before posting, remove all personal identifiers, ChatGPT messages, URLs containing tokens, credentials, internal hostnames, and server addresses.

## Pull request checklist

- [ ] User-facing behavior is documented
- [ ] Appropriate automated tests added or updated
- [ ] No personal information, real session data, credentials, or private network details
- [ ] Permissions and outbound requests reviewed
- [ ] Existing approval, ownership, journal, and recovery behavior remains safe

Be respectful and constructive in discussions. Maintainers may ask for changes to meet the safety bar.

## License for contributions

By submitting a contribution, you agree that your contribution will be licensed under **GPL-3.0-only** as part of this project. Only submit code and assets you have the right to contribute under these terms. Preserve copyright and attribution notices, and disclose third-party licenses in your pull request.
