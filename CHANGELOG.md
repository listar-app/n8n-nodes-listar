# Changelog

## 0.2.0

- Required and optional parameters are separated: Person > Enrich, Company > Enrich and Phone > Verify Ownership start with a choice of identifier (Search By, Check Against) whose fields are required, every other detail goes in Additional Fields.
- Phone numbers typed with separators ("+33 6 12 34 56 78") or a "00" prefix are sent in the compact international format the WhatsApp and ownership checks expect.
- An empty required field (an expression resolving to nothing) stops the item with a clear error instead of launching a search.
- Breaking: in existing Person > Enrich nodes, the company and the LinkedIn profile move to Additional Fields (or Search By: LinkedIn Profile); in Company > Enrich nodes, pick the identifier in Search By. Workflows built with 0.1.x need these fields set again.

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
