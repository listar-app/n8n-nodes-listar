# n8n-nodes-listar

This is an n8n community node for [Listar](https://listar.fr). It finds the phone numbers and emails of professionals, and the decision makers of companies, inside your n8n workflows.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

- [Installation](#installation)
- [Operations](#operations)
- [Credentials](#credentials)
- [Usage](#usage)
- [Pricing](#pricing)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. In short: **Settings > Community Nodes > Install**, then enter `n8n-nodes-listar`.

## Operations

| Resource | Operation        | What it does                                                                                                                         |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Person   | Enrich           | Finds the phone number and/or email of a person from their name, company, LinkedIn profile, city...                                  |
| Person   | Get Result       | Fetches the result of a person enrichment launched earlier                                                                           |
| Company  | Enrich           | Returns the company info (register data, domain, industry, headcount...) and its decision makers (name, job title, LinkedIn profile) |
| Company  | Get Result       | Fetches the result of a company enrichment launched earlier                                                                          |
| Email    | Verify           | Checks whether an email address can receive mail                                                                                     |
| Phone    | Verify Ownership | Checks whether a phone number belongs to a given person                                                                              |
| Phone    | Check WhatsApp   | Checks whether a phone number has a WhatsApp account                                                                                 |
| Credit   | Get Balance      | Returns the remaining Listar credit                                                                                                  |

The node can also be used as a tool by n8n AI agents.

## Credentials

1. Create a Listar account at [listar.fr](https://listar.fr).
2. Open **Settings > API keys** ([direct link](https://listar.fr/en/settings/api-keys)) and create a key. It is shown only once.
3. In n8n, create a **Listar API** credential and paste the key. The connection test reads your credit balance.

## Usage

### Enrich a list of people

Read your list (Google Sheets, CSV, CRM...), then add a Listar node with **Person > Enrich**. Map the first name, last name and company of each row, and the LinkedIn profile whenever you have it: it is the strongest identifier. A bare name is often not enough to deliver anything.

**Data to Find** limits the search to the phone or the email: only the requested channel is delivered and billed.

### Waiting for results

Most searches complete within a minute, some take a few minutes. By default the node waits for each result, up to **Max Wait (Seconds)**. A search still running when the wait runs out is not lost: the item comes out with `status: "pending"` and the search `id`, and the **Get Result** operation fetches it later. It is billed once, when it completes.

For large lists, turn **Wait for Result** off: every search is launched at once and returns its ID. Then add a Wait node (a few minutes) followed by a Listar node with **Get Result** on `{{ $json.id }}`. At most 20 company searches can run at the same time per account: a launch beyond that is retried automatically after the delay the API asks for, then fails if the limit is still reached.

### From a company to its contacts

**Company > Enrich** returns the decision makers of a company, without their phone or email. Split the `contacts` array (Split Out node), then run **Person > Enrich** on each contact with its first name, last name, the company name and its `linkedinUrl`.

### Output

With **Simplify** on (default), a person result is one flat item: `phone`, `phoneType`, `phoneUsage` (professional / personal), `email`, `emailStatus`, and so on. Turn it off to get the full API response.

### Errors

When the Listar credit does not cover a request, nothing is delivered and the node stops with a clear message that gives the search ID. Top up in the app: a result already found is settled automatically and can then be fetched with **Get Result** and that ID. With **Continue** on error, the error item keeps the search `id` too. Turn on **Settings > On Error > Continue** to keep processing the other items.

Do not turn on **Retry On Fail** for the Enrich operations: a retried launch is a new search, billed again.

## Pricing

Every operation is billed to the Listar credit of the organization that owns the API key, at the same prices as the [Listar API](https://listar.fr/en/pricing). An enrichment that finds nothing is not billed. Verifications are billed per checked number or email, as described in the [API reference](https://api.listar.fr/docs).

## Compatibility

Tested with n8n 2.x.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Listar API reference](https://api.listar.fr/docs)
- [Listar](https://listar.fr)
