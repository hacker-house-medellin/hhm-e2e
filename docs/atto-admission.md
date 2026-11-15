# AttoLang source-contract admission

This gate compares checked-out `hhm-clients` and `hhm-interfaces` AttoLang `.atto` files with their machine-readable SDK matrix, visitor OpenAPI operations and reservation JSON Schema vocabulary.

Use it after Zed or a separate trusted process has materialized exact revisions of both repositories:

```sh
npm run check:atto -- /path/to/hhm-clients /path/to/hhm-interfaces
npm run test:contracts
```

The command is deliberately offline: it does **not** download repositories, use credentials, discover live endpoints, grant door access, execute Atto code or claim compiler/backend support. Missing files, unsupported additional code, duplicate declarations, route drift, removed schema entries and malformed manifests fail closed.

`tests/contracts/atto-admission.test.mjs` exercises self-contained synthetic positive and negative fixtures. To claim actual guest support, separate jobs must pin a real compiler source/head, compile the `.atto` files and run guest tests for the chosen target. A passing static source-contract check does not substitute for this.

## CI cross-repository provenance

The `atto-cross-repo-contracts` job anonymously clones public `hhm-clients` and `hhm-interfaces` draft branches, verifies their **exact pinned PR commit SHA**, Git tree, and security-relevant Git blob hashes, and then runs the offline admission CLI against **actual source trees**. It persists no checkout credentials and requires no cross-organization token. Source updates require a reviewed SHA/blob pin update; mismatched heads fail closed rather than silently checking newer source. This is distinct from the synthetic local fixture suite. If either repository becomes private, this anonymous job must fail and must not be bypassed by supplying secrets.
