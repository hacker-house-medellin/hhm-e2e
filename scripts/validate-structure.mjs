import { readFileSync } from "node:fs";
import { access } from "node:fs/promises";

const prefix = "hhm";
const org = "hacker-house-medellin";
const repo = "hhm-e2e";
const requiredPaths = [
  ".env.example",
  ".zedignore",
  ".zpkg.toml",
  "SECURITY.md",
  "package.json",
  "contracts/scenarios.json",
  "rust-smoke/Cargo.toml",
  "rust-smoke/src/main.rs",
  "tests/browser/playwright/smoke.spec.mjs",
  "tests/browser/puppeteer/smoke.test.mjs",
  "tests/browser/selenium/smoke.test.mjs",
];

await Promise.all(requiredPaths.map((path) => access(path)));

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.name !== `@${org}/${repo}`) throw new Error("package identity drift");
for (const [name, version] of Object.entries({
  "@playwright/test": "1.62.0",
  puppeteer: "25.3.0",
  "selenium-webdriver": "4.46.0",
})) {
  if (packageJson.devDependencies?.[name] !== version) {
    throw new Error(`unreviewed ${name} version`);
  }
}

const manifest = readFileSync(".zpkg.toml", "utf8");
for (const suffix of ["clients", "interfaces", "libs", "cli"]) {
  const identity = `"${org}/${prefix}-${suffix}"`;
  if (!manifest.includes(identity)) throw new Error(`missing Zed dependency ${identity}`);
}
if (manifest.includes(`${org}-${repo}`)) throw new Error("long-name duplicate identity detected");

const scenarios = JSON.parse(readFileSync("contracts/scenarios.json", "utf8"));
if (scenarios.suite !== repo || scenarios.scenarios.length < 4) {
  throw new Error("scenario contract drift");
}
if (scenarios.scenarios.some((entry) => entry.live_credentials_required !== false)) {
  throw new Error("offline defaults weakened");
}

const cargoManifest = readFileSync("rust-smoke/Cargo.toml", "utf8");
if (!cargoManifest.includes('name = "hhm-e2e-smoke"')) {
  throw new Error("Rust package identity drift");
}
if (!cargoManifest.includes("publish = false")) {
  throw new Error("Rust smoke package must remain private");
}

const rustSource = readFileSync("rust-smoke/src/main.rs", "utf8");
if (rustSource.trimStart().startsWith("\\")) {
  throw new Error("invalid leading backslash in Rust source");
}
for (const envName of ["HHM_MASH_URL", "HHM_LEPTOS_URL", "HHM_DIOXUS_URL", "HHM_API_URL"]) {
  if (!rustSource.includes(envName)) throw new Error(`missing Rust endpoint contract ${envName}`);
}
for (const requiredToken of ["Message::Ping", "connect_async", "Duration::from_secs"]) {
  if (!rustSource.includes(requiredToken)) throw new Error(`missing Rust smoke behavior ${requiredToken}`);
}

console.log(`validated ${org}/${repo} browser, contract, and Rust smoke structure`);
