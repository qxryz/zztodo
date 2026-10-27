#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  REPOSITORY, hasWindowsAssets, macBuildPlan, mergeManifest, parseReleaseLookup, publicationPolicy, releaseVersion,
  validateBaseManifest, verifyUpdateSignature,
} from "./lib/zztodo-release.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP_NAME = "zztodo.app";
const CLI = join(ROOT, "node_modules/.bin/tauri");
const KEY = join(ROOT, "src-tauri/updater.key");
const CONFIG = join(ROOT, "src-tauri/tauri.conf.json");

function run(label, command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024,
      ...options,
    });
  } catch {
    // Signer output and environment must never reach terminal logs.
    throw new Error(`${label} failed; no command output or signing material was printed`);
  }
}

function options(args) {
  const result = { check: false };
  for (let index = 0; index < args.length; index++) {
    const name = args[index];
    if (name === "--") continue;
    if (name === "--help" || name === "-h") return { help: true };
    if (name === "--check") { result.check = true; continue; }
    if (name === "--resume") continue; // Matching releases resume by default.
    if (!["--notes", "--out", "--manifest"].includes(name) || !args[index + 1] || args[index + 1].startsWith("--")) {
      throw new Error(`Unknown or incomplete option: ${name}`);
    }
    result[name.slice(2)] = args[++index];
  }
  return result;
}

function help() {
  console.log("Usage: pnpm release:package --notes \"Release notes\" [--out directory] [--manifest same-version-latest.json] [--resume]");
  console.log("       pnpm release:check");
  console.log("Builds local signed, notarized macOS assets. It never creates or uploads a GitHub Release.");
}

function signerArguments(file, version) {
  const args = ["signer", "sign", "--private-key-path", KEY, "--password", ""];
  if (run("Tauri signer capability check", CLI, ["signer", "sign", "--help"], { cwd: ROOT }).includes("--app-version")) {
    args.push("--app-version", version);
  }
  args.push(file);
  return args;
}

function signUpdater(file, version) {
  const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" };
  delete env.TAURI_SIGNING_PRIVATE_KEY;
  delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
  run("Updater signing", CLI, signerArguments(file, version), { cwd: ROOT, env });
  const signature = readFileSync(`${file}.sig`, "utf8").trim();
  verifyUpdateSignature(file, signature, JSON.parse(readFileSync(CONFIG, "utf8")).plugins.updater.pubkey);
  return signature;
}

function checkUpdaterIdentity(version) {
  if (!existsSync(CLI)) throw new Error("The installed Tauri CLI is missing; run pnpm install first");
  if (!existsSync(KEY)) throw new Error("The existing updater.key is missing; restore it, do not generate a replacement key");
  const scratch = mkdtempSync(join(tmpdir(), "zztodo-updater-check-"));
  try {
    const file = join(scratch, "identity-check.txt");
    writeFileSync(file, "zztodo updater identity preflight\n", { mode: 0o600 });
    signUpdater(file, version);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

function remoteManifest(version) {
  const response = spawnSync("gh", ["api", `repos/${REPOSITORY}/releases/tags/v${version}`], {
    encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024,
  });
  const release = parseReleaseLookup(response, version);
  if (!release) {
    // A hidden/inaccessible repository can also return 404. Confirm access
    // before treating this as a new release without Windows metadata.
    const repository = JSON.parse(run("Repository access check", "gh", ["api", `repos/${REPOSITORY}`]));
    if (repository.full_name !== REPOSITORY) throw new Error("Cannot confirm repository access after a missing release response");
    return null;
  }
  if (release.assets.some((asset) => asset.name === "latest.json")) {
    const text = run("Download same-version updater manifest", "gh", ["release", "download", `v${version}`, "--repo", REPOSITORY, "--pattern", "latest.json", "--output", "-"]);
    let manifest;
    try { manifest = JSON.parse(text); } catch { throw new Error("The published same-version update manifest is invalid JSON"); }
    return validateBaseManifest(manifest, version);
  }
  if (hasWindowsAssets(release)) {
    throw new Error("This Release has Windows assets but no update manifest; provide the same-version Windows manifest with --manifest");
  }
  return null;
}

function readBaseManifest(path, version) {
  if (!path) return remoteManifest(version);
  let manifest;
  try { manifest = JSON.parse(readFileSync(resolve(ROOT, path), "utf8")); } catch { throw new Error("Cannot read --manifest as JSON"); }
  return validateBaseManifest(manifest, version);
}

function assertAppVersion(app, version) {
  if (!existsSync(join(app, "Contents/MacOS/zztodo"))) throw new Error("The built zztodo App is missing");
  const actual = run("App version check", "/usr/libexec/PlistBuddy", ["-c", "Print :CFBundleShortVersionString", join(app, "Contents/Info.plist")]).trim();
  if (actual !== version) throw new Error("The built App version does not match the release version");
}

function verifyArchive(archive, kind, signing, core) {
  if (!existsSync(archive)) throw new Error("A final release archive is missing");
  const scratch = mkdtempSync(join(tmpdir(), "zztodo-archive-check-"));
  try {
    if (kind === "zip") run("ZIP round trip", "/usr/bin/ditto", ["-xk", archive, scratch]);
    else {
      const env = { ...process.env };
      delete env.COPYFILE_DISABLE;
      run("Updater round trip", "/usr/bin/tar", ["--mac-metadata", "--xattrs", "-xzf", archive, "-C", scratch], { env });
    }
    core.verifyApplication(join(scratch, APP_NAME), signing, { notarized: true });
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}

async function main() {
  const args = options(process.argv.slice(2));
  if (args.help) { help(); return; }
  const version = releaseVersion(ROOT);
  if (process.platform !== "darwin" || process.arch !== "arm64") throw new Error("This release entry builds macOS Apple Silicon assets on an Apple Silicon Mac");
  if (!args.check && run("Working tree check", "git", ["status", "--porcelain"], { cwd: ROOT }).trim()) {
    throw new Error("The source worktree must be clean for an official release; --check remains available before committing");
  }
  const core = await import("./lib/macos-signing.mjs");
  const signing = core.preflightSigning(core.loadSigningConfig(ROOT));
  checkUpdaterIdentity(version);
  if (args.check) {
    const base = readBaseManifest(args.manifest, version);
    const policy = publicationPolicy(base ?? { platforms: {} });
    console.log(`zztodo ${version}: Developer ID, notarization authorization, and updater identity passed preflight.`);
    if (!policy.canSetGlobalLatest) console.log("The new manifest is a Mac-only candidate; merge same-version Windows metadata before making it the global latest release.");
    return;
  }

  const sourceCommit = run("Source commit read", "git", ["rev-parse", "HEAD"], { cwd: ROOT }).trim();
  const outDir = resolve(ROOT, args.out ?? join("release", `v${version}`));
  const inputsPath = join(outDir, "release-inputs.json");
  const previous = existsSync(inputsPath) ? JSON.parse(readFileSync(inputsPath, "utf8")) : null;
  const notes = (args.notes ?? previous?.notes ?? "").trim();
  if (!notes) throw new Error("Provide --notes for a new release");
  if (previous && (previous.version !== version || previous.sourceCommit !== sourceCommit || previous.notes !== notes)) {
    throw new Error("Existing release inputs differ; choose another --out directory rather than overwriting them");
  }
  const base = previous ? previous.baseManifest : readBaseManifest(args.manifest, version);
  if (previous && args.manifest && !isDeepStrictEqual(base, readBaseManifest(args.manifest, version))) {
    throw new Error("The supplied manifest differs from the saved release inputs");
  }
  const session = core.createReleaseSession({ outDir, version, sourceCommit, resume: true });
  try {
    const inputs = previous ?? { version, sourceCommit, notes, baseManifest: base, publishedAt: new Date().toISOString() };
    if (!previous) writeFileSync(inputsPath, `${JSON.stringify(inputs, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    const app = join(session.workDir, APP_NAME);
    const zip = join(session.assetsDir, "app.zip");
    const updater = join(session.assetsDir, "zztodo.app.tar.gz");
    const dmg = join(session.assetsDir, `zztodo_${version}_aarch64.dmg`);
    const manifestPath = join(session.assetsDir, "latest.json");
    const policyPath = join(outDir, "release-policy.json");

    session.step("build-app", () => {
      console.log("Building the release App…");
      const build = macBuildPlan(ROOT);
      run("Tauri App build", CLI, build.args, { cwd: ROOT, env: build.env });
      const built = build.app;
      assertAppVersion(built, version);
      if (run("App architecture check", "/usr/bin/lipo", ["-archs", join(built, "Contents/MacOS/zztodo")]).trim() !== "arm64") throw new Error("The built App must contain only the configured arm64 architecture");
      rmSync(app, { recursive: true, force: true });
      run("Copy App into release workspace", "/usr/bin/ditto", [built, app]);
    }, () => assertAppVersion(app, version));

    session.step("sign-app", () => core.signApplication(app, signing), () => core.verifyApplication(app, signing));
    session.step("notarize-app", () => core.notarizeAndStaple(app, signing, { stateDir: session.stateDir }), () => core.verifyApplication(app, signing, { notarized: true }));
    session.step("zip-app", () => {
      rmSync(zip, { force: true });
      run("Release ZIP creation", "/usr/bin/ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", app, zip]);
    }, () => verifyArchive(zip, "zip", signing, core));
    session.step("sign-updater", () => {
      const env = { ...process.env };
      delete env.COPYFILE_DISABLE;
      rmSync(updater, { force: true });
      rmSync(`${updater}.sig`, { force: true });
      run("Updater archive creation", "/usr/bin/tar", ["--format", "pax", "--mac-metadata", "--xattrs", "--uid", "0", "--gid", "0", "--uname", "root", "--gname", "wheel", "-czf", updater, "-C", session.workDir, APP_NAME], { env });
      signUpdater(updater, version);
    }, () => {
      verifyUpdateSignature(updater, readFileSync(`${updater}.sig`, "utf8").trim(), JSON.parse(readFileSync(CONFIG, "utf8")).plugins.updater.pubkey);
      verifyArchive(updater, "tar.gz", signing, core);
    });
    session.step("sign-dmg", () => {
      const staging = mkdtempSync(join(session.workDir, "dmg-"));
      try {
        run("DMG App staging", "/usr/bin/ditto", [app, join(staging, APP_NAME)]);
        symlinkSync("/Applications", join(staging, "Applications"));
        rmSync(dmg, { force: true });
        run("DMG creation", "/usr/bin/hdiutil", ["create", "-quiet", "-volname", "zztodo", "-srcfolder", staging, "-format", "UDZO", dmg]);
        core.signDiskImage(dmg, signing);
      } finally { rmSync(staging, { recursive: true, force: true }); }
    }, () => core.verifyDiskImage(dmg, signing));
    session.step("notarize-dmg", () => core.notarizeAndStaple(dmg, signing, { stateDir: session.stateDir }), () => core.verifyDiskImage(dmg, signing, { notarized: true }));

    const makeManifest = () => mergeManifest({ base: inputs.baseManifest, version, notes, signature: readFileSync(`${updater}.sig`, "utf8").trim(), publishedAt: inputs.publishedAt });
    session.step("manifest", () => {
      const manifest = makeManifest();
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(policyPath, `${JSON.stringify(publicationPolicy(manifest), null, 2)}\n`, { mode: 0o600 });
    }, () => {
      if (!isDeepStrictEqual(JSON.parse(readFileSync(manifestPath, "utf8")), makeManifest())) throw new Error("Release update manifest changed unexpectedly");
      if (!isDeepStrictEqual(JSON.parse(readFileSync(policyPath, "utf8")), publicationPolicy(makeManifest()))) throw new Error("Release publication policy changed unexpectedly");
    });

    const finalCommit = run("Final source commit check", "git", ["rev-parse", "HEAD"], { cwd: ROOT }).trim();
    if (finalCommit !== sourceCommit || run("Final working tree check", "git", ["status", "--porcelain"], { cwd: ROOT }).trim()) {
      throw new Error("The source changed while the release was running; no READY manifest was written");
    }
    const ready = session.markReady([zip, updater, `${updater}.sig`, dmg, manifestPath]);
    console.log(`zztodo ${version}: ${ready.status}. Signed and notarized assets: ${session.assetsDir}`);
    const policy = publicationPolicy(makeManifest());
    if (!policy.canSetGlobalLatest) console.log("MAC_ONLY_CANDIDATE: do not publish this manifest as global latest until same-version Windows metadata is merged.");
    console.log("No GitHub Release was created or changed. Upload only the release-assets.json whitelist after explicit publication authorization.");
  } finally {
    session.close();
  }
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch((error) => { console.error(`Release stopped: ${error.message}`); process.exitCode = 1; });
}
