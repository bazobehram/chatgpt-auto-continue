# Privacy

ChatGPT Auto-Continue is a browser extension, not a hosted chat service.

## Information accessed

To decide when it can continue safely, it examines the current ChatGPT conversation page, including reply content and status indicators, and the message composer. It also observes tabs and navigation relevant to ownership and recovery.

## Information stored

Browser-local extension storage can contain configuration, a user-written continuation prompt, conversation identifiers, tab/ownership state, activity counters, send journals, bounded diagnostic event metadata, and, when Mission Signal is configured, a server address and authentication capabilities. Do not assume that local storage is encrypted independently of the browser profile.

## Network behavior

Local Only mode does not require an extension-operated backend; messages are submitted within the user's ChatGPT session. Mission Signal mode makes authenticated HTTPS requests to a server expressly entered and authorized by the user. The extension does not bundle advertising or usage analytics.

## Sharing and retention

Data persists locally until cleared by the extension or browser profile according to feature behavior. Removing the extension and its data removes its local state, but not messages already sent to ChatGPT or records held by an independently operated Mission Signal server.

Before filing public bug reports, sanitize diagnostics and screenshots. Do not send passwords, authentication tokens, complete conversations, email addresses, account identifiers, private hostnames or sensitive URLs.

## Scope

These statements describe intended project behavior, not a third-party privacy audit or a promise that the ChatGPT website or user-selected server applies identical policies.
