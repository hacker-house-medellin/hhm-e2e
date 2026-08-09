# Repository agent instructions

Follow the organization-wide branching, semantic-conflict, security, and evidence rules in `hacker-house-medellin/.github`.

- Preserve the canonical repository identity `hacker-house-medellin/hhm-e2e`; never create a long-name duplicate.
- Publish and certify `hacker-house-medellin-test/hhm-e2e` before any production repository creation or monorepo promotion.
- Treat `.zpkg.toml` as dependency intent and generate `.zpkg.lock` only through a real resolver.
- Keep browser tests deterministic and safe against the local fixture server by default.
- Keep the Rust HTTP/WebSocket runner complementary to the browser matrix; do not replace one test surface with the other.
- Generate `package-lock.json` and `rust-smoke/Cargo.lock` only with their real resolvers, commit them in the target repository, and run target CI with frozen/locked modes.
- Live endpoint, account, payment, identity, or legal-document tests require isolated test tenants and explicit secrets; never record credentials, cookies, prompts, responses, customer data, or legal records.
- Do not modify DNS, custom domains, WAF rules, R2 routing, or Worker routes from this repository without an explicit hostname/origin map and independently reviewed infrastructure change.
- Add a relative `hhm-monorepo` gitlink only after the exact test-repository head is green. Never point a production monorepo at a local-only or unverified commit.
- Use feature branches and draft pull requests. Do not reset, clean, stash, rebase, force-push, or discard unfamiliar work.
