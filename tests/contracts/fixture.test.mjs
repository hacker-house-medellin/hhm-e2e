import assert from "node:assert/strict";
import test from "node:test";
import { startFixtureServer } from "../support/fixture-server.mjs";

test("offline fixture exposes bounded health and contract surfaces", async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.close());
  const health = await fetch(`${fixture.baseURL}/healthz`).then((response) => response.json());
  assert.equal(health.ok, true);
  const contracts = await fetch(`${fixture.baseURL}/contracts`).then((response) => response.json());
  assert.equal(contracts.mode, "offline-fixture");
});

test("offline scenarios are discoverable without credentials or cache", async (t) => {
  const fixture = await startFixtureServer();
  t.after(() => fixture.close());
  const response = await fetch(`${fixture.baseURL}/scenarios`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const contract = await response.json();
  assert.equal(contract.suite, "hhm-e2e");
  assert.equal(contract.default_mode, "offline-fixture");
  assert.ok(contract.scenarios.length >= 4);
  assert.ok(contract.scenarios.every((entry) => entry.live_credentials_required === false));

  const denied = await fetch(`${fixture.baseURL}/scenarios`, { method: "POST" });
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get("allow"), "GET");
});
