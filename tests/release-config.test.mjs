import test from "node:test";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hasWindowsAssets, macBuildPlan, mergeManifest, parseReleaseLookup, publicationPolicy, releaseVersion, validateBaseManifest,
  verifyUpdateSignature,
} from "../scripts/lib/zztodo-release.mjs";

function fixture(operation) {
  const root = mkdtempSync(join(tmpdir(), "zztodo-release-test-"));
  try { return operation(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

const scriptPath = fileURLToPath(new URL("../scripts/package-release.mjs", import.meta.url));
const supportPath = fileURLToPath(new URL("../scripts/lib/zztodo-release.mjs", import.meta.url));

function assertHelpRuns(path) {
  const result = spawnSync(process.execPath, [path, "--help"], {
    encoding: "utf8", env: { ...process.env, NODE_OPTIONS: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: pnpm release:package/);
  assert.match(result.stdout, /pnpm release:check/);
  assert.doesNotMatch(result.stdout + result.stderr, /preflight|password|notarization authorization/i);
}

test("the real release CLI runs help through a symlink without credential access", () => fixture((root) => {
  const alias = join(root, "release-cli-alias.mjs");
  symlinkSync(scriptPath, alias);
  assertHelpRuns(alias);
}));

test("the real release CLI runs help through the macOS var path alias", { skip: process.platform !== "darwin" }, () => fixture((root) => {
  const physical = realpathSync(root);
  assert.ok(physical.startsWith("/private/var/"), "Expected a macOS temporary fixture under /private/var");
  const scripts = join(physical, "scripts");
  mkdirSync(join(scripts, "lib"), { recursive: true });
  copyFileSync(scriptPath, join(scripts, "package-release.mjs"));
  copyFileSync(supportPath, join(scripts, "lib/zztodo-release.mjs"));
  const alias = join(scripts, "package-release.mjs").replace(/^\/private\/var\//, "/var/");
  assert.notEqual(alias, join(scripts, "package-release.mjs"));
  assertHelpRuns(alias);
}));

const windows = {
  signature: "existing-windows-signature",
  url: "https://github.com/qxryz/zztodo/releases/download/v0.3.0/zztodo_0.3.0_x64-setup.exe",
};
const base = {
  version: "0.3.0", notes: "Existing notes", pub_date: "2026-10-28T00:00:00Z",
  custom: { retained: true },
  platforms: {
    "windows-x86_64": windows,
    "darwin-aarch64": { signature: "old-mac", url: "https://github.com/qxryz/zztodo/releases/download/v0.3.0/zztodo.app.tar.gz" },
  },
};

test("release versions must agree before signing or building", () => fixture((root) => {
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "0.3.0" }));
  writeFileSync(join(root, "src-tauri/tauri.conf.json"), JSON.stringify({ version: "0.3.0" }));
  writeFileSync(join(root, "src-tauri/Cargo.toml"), '[package]\nversion = "0.2.0"\n');
  assert.throws(() => releaseVersion(root), /versions disagree/);
  writeFileSync(join(root, "src-tauri/Cargo.toml"), '[package]\nversion = "0.3.0"\n');
  assert.equal(releaseVersion(root), "0.3.0");
}));

test("explicit Apple Silicon build cannot select stale default-target output", () => fixture((root) => {
  mkdirSync(join(root, "src-tauri/.cargo"), { recursive: true });
  writeFileSync(join(root, "src-tauri/.cargo/config.toml"), '[build]\ntarget = "x86_64-apple-darwin"\ntarget-dir = "custom-target"\n');
  const stale = join(root, "src-tauri/target/release/bundle/macos/zztodo.app");
  const expected = join(root, "src-tauri/target/aarch64-apple-darwin/release/bundle/macos/zztodo.app");
  mkdirSync(stale, { recursive: true });
  mkdirSync(expected, { recursive: true });
  writeFileSync(join(stale, "sentinel"), "stale-default");
  writeFileSync(join(expected, "sentinel"), "fresh-arm64");
  const inherited = { CARGO_BUILD_TARGET: "x86_64-apple-darwin", CARGO_TARGET_DIR: "/other/cache", APPLE_PASSWORD: "fixture-only", TAURI_SIGNING_PRIVATE_KEY: "fixture-only", KEEP_THIS: "present" };
  const plan = macBuildPlan(root, inherited);
  assert.equal(plan.args[plan.args.indexOf("--target") + 1], "aarch64-apple-darwin");
  assert.equal(plan.env.CARGO_TARGET_DIR, join(root, "src-tauri/target"));
  assert.equal(plan.env.CARGO_BUILD_TARGET, undefined);
  assert.equal(plan.env.APPLE_PASSWORD, undefined);
  assert.equal(plan.env.TAURI_SIGNING_PRIVATE_KEY, undefined);
  assert.equal(plan.env.KEEP_THIS, "present");
  assert.equal(readFileSync(join(plan.app, "sentinel"), "utf8"), "fresh-arm64");
  assert.notEqual(plan.app, stale);
  assert.equal(inherited.CARGO_BUILD_TARGET, "x86_64-apple-darwin");
}));

test("a Mac update preserves every Windows field and unrelated metadata", () => {
  const result = mergeManifest({ base, version: "0.3.0", signature: "new-mac" });
  assert.deepEqual(result.platforms["windows-x86_64"], windows);
  assert.deepEqual(result.custom, base.custom);
  assert.equal(result.notes, base.notes);
  assert.equal(result.pub_date, base.pub_date);
  assert.equal(result.platforms["darwin-aarch64"].signature, "new-mac");
  assert.equal(base.platforms["darwin-aarch64"].signature, "old-mac");
  assert.equal(publicationPolicy(result).canSetGlobalLatest, true);
});

test("an old Windows version cannot be attached to a new manifest version", () => {
  assert.throws(() => validateBaseManifest(base, "0.4.0"), /same release version/);
  const inconsistent = structuredClone(base);
  inconsistent.platforms["windows-x86_64"].url = windows.url.replaceAll("0.3.0", "0.2.0");
  assert.throws(() => validateBaseManifest(inconsistent, "0.3.0"), /another release version/);
});

test("a new Mac-only candidate is explicitly barred from global latest", () => {
  const result = mergeManifest({ version: "0.4.0", notes: "New Mac build", signature: "new-mac" });
  assert.deepEqual(Object.keys(result.platforms), ["darwin-aarch64"]);
  assert.equal(publicationPolicy(result).status, "MAC_ONLY_CANDIDATE");
  assert.equal(publicationPolicy(result).canSetGlobalLatest, false);
  assert.equal(publicationPolicy(result).requiresSameVersionWindowsBeforeLatest, true);
  assert.equal(publicationPolicy({ platforms: { "windows-aarch64": { signature: "other" } } }).canSetGlobalLatest, false);
});

test("invalid or non-HTTPS platform data is never silently discarded", () => {
  const invalid = structuredClone(base);
  invalid.platforms["windows-x86_64"].url = "http://example.test/setup.exe";
  assert.throws(() => validateBaseManifest(invalid, "0.3.0"), /HTTPS/);
  delete invalid.platforms["windows-x86_64"].signature;
  assert.throws(() => validateBaseManifest(invalid, "0.3.0"), /Incomplete/);
});

test("only an explicit tag 404 can become a missing-release candidate", () => {
  assert.equal(parseReleaseLookup({ status: 1, stderr: "gh: Not Found (HTTP 404)" }, "0.3.0"), null);
  assert.throws(() => parseReleaseLookup({ status: 1, stderr: "gh: Forbidden (HTTP 403)" }, "0.3.0"), /network\/authentication/);
  assert.throws(() => parseReleaseLookup({ status: 1, stderr: "network timeout" }, "0.3.0"), /network\/authentication/);
  assert.throws(() => parseReleaseLookup({ status: 0, stdout: "not json" }, "0.3.0"), /invalid Release metadata/);
  assert.throws(() => parseReleaseLookup({ status: 0, stdout: JSON.stringify({ tag_name: "v0.2.0", assets: [] }) }, "0.3.0"), /unexpected Release metadata/);
});

test("Windows assets are detected even if their update manifest is missing", () => {
  assert.equal(hasWindowsAssets({ assets: [{ name: "zztodo_0.3.0_x64-setup.exe" }] }), true);
  assert.equal(hasWindowsAssets({ assets: [{ name: "zztodo.app.tar.gz" }] }), false);
});

function minisignFixture(file, text) {
  writeFileSync(file, text);
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const keyId = randomBytes(8);
  const key = Buffer.concat([Buffer.from("Ed"), keyId, raw]);
  const message = createHash("blake2b512").update(text).digest();
  const rawSignature = sign(null, message, privateKey);
  const packet = Buffer.concat([Buffer.from("ED"), keyId, rawSignature]);
  const trusted = "timestamp:1 file:fixture.tar.gz app-version:0.3.0";
  const global = sign(null, Buffer.concat([rawSignature, Buffer.from(trusted)]), privateKey);
  return {
    publicKey: Buffer.from(`untrusted comment: fixture\n${key.toString("base64")}\n`).toString("base64"),
    signature: Buffer.from(`untrusted comment: fixture\n${packet.toString("base64")}\ntrusted comment: ${trusted}\n${global.toString("base64")}\n`).toString("base64"),
  };
}

test("updater verifier checks both archive bytes and trusted comment", () => fixture((root) => {
  const file = join(root, "fixture.tar.gz");
  const signed = minisignFixture(file, "archive bytes");
  assert.doesNotThrow(() => verifyUpdateSignature(file, signed.signature, signed.publicKey));
  const changed = Buffer.from(signed.signature, "base64").toString().replace("timestamp:1", "timestamp:2");
  assert.throws(() => verifyUpdateSignature(file, Buffer.from(changed).toString("base64"), signed.publicKey), /trusted comment/);
  writeFileSync(file, "tampered archive");
  assert.throws(() => verifyUpdateSignature(file, signed.signature, signed.publicKey), /archive signature/);
}));
