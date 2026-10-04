# Changelog

## 0.1.3

- Action names say what each operation returns, so AI agents pick the right tool with the automatic tool description.
- A search is never lost while waiting: polls that hit a rate limit, a server error or a network error are retried, and every error raised after a launch gives the search ID (also kept in the error item with Continue on Fail).
- A launch rejected by the rate limit is retried after the delay the API asks for.
- LinkedIn input: profile URLs in any form are reduced to their slug, other LinkedIn links are refused instead of launching a search.
- Get Result trims the search ID and refuses an empty one; text fields are trimmed before being sent.
- Simplified company output adds the legal representatives (directors) and the matched establishment; simplified person output flags emails to check before prospecting.

## 0.1.2

- Node category and action wording aligned with the n8n verification checks.

## 0.1.1

- Published from GitHub Actions with npm provenance.

## 0.1.0

- First release: Person (Enrich, Get Result), Company (Enrich, Get Result), Email (Verify), Phone (Verify Ownership, Check WhatsApp) and Credit (Get Balance) operations.
