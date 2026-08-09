# Security policy

Report suspected vulnerabilities privately to the repository maintainers. Do not open a public issue containing credentials, resident data, access-control details, cookies, tokens, or a working exploit.

## Test-harness requirements

- Live checks run only against isolated `hacker-house-medellin-test` services until exact-head evidence authorizes a separate production promotion.
- Endpoint URLs and credentials are injected at runtime from environment-scoped secret stores. `.env` files remain untracked.
- HTTP and WebSocket fixtures use synthetic data and must not point at production Postgres, Supabase, R2, payment, identity, or access-control resources.
- Logs must not include authorization headers, cookies, access codes, resident identifiers, payment metadata, prompts, or model responses.
- DNS, custom domains, WAF rules, and Worker routes are outside this repository and remain unchanged without an explicit hostname/origin map and health evidence.
