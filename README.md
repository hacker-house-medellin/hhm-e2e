# hhm-e2e

Canonical end-to-end and cross-repository contract harness for **Hacker House Medellín**.

The repository is offline-safe by default. Playwright, Puppeteer, and Selenium exercise one local fixture contract, while the complementary Rust runner validates HTTP health responses and an API WebSocket upgrade/frame exchange. Live endpoints are opt-in and must belong to isolated `hacker-house-medellin-test` tenants.

## Canonical composition

Zed materializes `hhm-clients`, `hhm-interfaces`, `hhm-libs`, and `hhm-cli` under `.vendor/.zed`. Do not model those same repositories as gitlinks, and do not fabricate `.zpkg.lock`; create the lock only from a successful resolver run.

`hhm-monorepo` may pin this repository as a relative Git submodule only after the test-organization repository exists and its exact `main` SHA has passed GitHub Actions. The same dependency must not be represented simultaneously as a Zed materialization and a gitlink in one composition.

## Browser and contract checks

The browser libraries are exact-pinned in `package.json` and mirrored by `scripts/validate-structure.mjs`. Update both files together, verify that each version is published, and let the real npm resolver generate `package-lock.json`; never hand-author a lockfile.

```bash
npm ci
npm run test:offline
npx playwright install --with-deps chromium
npm run test:playwright
npm run test:puppeteer
npm run test:selenium
```

## Rust HTTP and WebSocket checks

Generate `rust-smoke/Cargo.lock` with Cargo before publication. The publisher commits the resolver-generated lock, and target-repository CI always uses `--locked`.

```bash
cargo generate-lockfile --manifest-path rust-smoke/Cargo.toml
cargo fmt --manifest-path rust-smoke/Cargo.toml --all -- --check
cargo check --manifest-path rust-smoke/Cargo.toml --locked --all-targets
cargo clippy --manifest-path rust-smoke/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path rust-smoke/Cargo.toml --locked
```

To run live test-environment smoke checks:

```bash
cp .env.example .env
set -a; . ./.env; set +a
cargo run --manifest-path rust-smoke/Cargo.toml --locked
```

The recognized variables are `HHM_MASH_URL`, `HHM_LEPTOS_URL`, `HHM_DIOXUS_URL`, and `HHM_API_URL`. With none configured, the runner performs no network request and exits successfully after compile-time and unit-test validation.

## Test-first publication

`publish.sh` is intentionally restricted to `hacker-house-medellin-test/hhm-e2e`. It refuses an existing repository, generates real npm and Cargo locks, runs local quality gates, and only then creates and pushes the test repository. Production repository creation and promotion are separate guarded operations that require the exact test head and successful target GitHub Actions evidence.

## Planning

- Canonical creation and certification issue: https://github.com/hacker-house-medellin/hhm-monorepo/issues/8
- Linear project: https://linear.app/denman/project/githubcomhacker-house-medellin-d4043553c2b4
- GitHub Project: https://github.com/orgs/hacker-house-medellin/projects/1

The Rust runner was recovered from the `hacker-house-medellin-continued.zip` handoff, whose SHA-256 is `93f08a123f38ffdc7a99abee809ccc8348c00442868c14edb79f8bbd669a443b`. The handoff source had an invalid leading backslash in `src/main.rs`; this seed removes that syntax defect and requires hosted Rust checks before publication.
