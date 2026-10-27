import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const REPOSITORY = "qxryz/zztodo";
export const MAC_PLATFORM = "darwin-aarch64";
export const MAC_TARGET = "aarch64-apple-darwin";

export function macBuildPlan(projectRoot, inheritedEnv = process.env) {
  const targetDirectory = join(resolve(projectRoot), "src-tauri/target");
  const env = { ...inheritedEnv, CARGO_TARGET_DIR: targetDirectory };
  for (const name of Object.keys(env)) {
    if (name.startsWith("TAURI_SIGNING_") || name.startsWith("APPLE_") || name === "CARGO_BUILD_TARGET") delete env[name];
  }
  return {
    env,
    args: ["build", "--ci", "--target", MAC_TARGET, "--bundles", "app", "--config", "src-tauri/tauri.release.conf.json", "--", "--locked"],
    app: join(targetDirectory, MAC_TARGET, "release/bundle/macos/zztodo.app"),
  };
}

export function parseReleaseLookup(response, version) {
  if (response.error) throw new Error("GitHub CLI is unavailable; install it or provide --manifest");
  if (response.status !== 0) {
    if (/\(HTTP 404\)/.test(response.stderr)) return null;
    throw new Error("Cannot read the same-version GitHub Release; check network/authentication or provide --manifest");
  }
  let release;
  try { release = JSON.parse(response.stdout); } catch { throw new Error("GitHub returned invalid Release metadata"); }
  if (release.tag_name !== `v${version}` || !Array.isArray(release.assets)) throw new Error("GitHub returned unexpected Release metadata");
  return release;
}

export function hasWindowsAssets(release) {
  return release.assets.some((asset) => /windows|\.(?:exe|msi|msix|msixbundle)(?:\.sig)?$/i.test(asset.name));
}

export function releaseVersion(root) {
  const values = {
    "package.json": JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
    "src-tauri/tauri.conf.json": JSON.parse(readFileSync(join(root, "src-tauri/tauri.conf.json"), "utf8")).version,
    "src-tauri/Cargo.toml": readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8").match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  };
  if (new Set(Object.values(values)).size !== 1 || !Object.values(values).every(Boolean)) {
    throw new Error(`Release versions disagree: ${JSON.stringify(values)}`);
  }
  const version = values["package.json"];
  if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version)) {
    throw new Error("The release version must be a valid semantic version");
  }
  return version;
}

export function validateBaseManifest(manifest, version) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest) || manifest.version !== version) {
    throw new Error("The base update manifest must belong to the same release version");
  }
  if (!manifest.platforms || typeof manifest.platforms !== "object" || Array.isArray(manifest.platforms)) {
    throw new Error("The base update manifest has no valid platforms object");
  }
  for (const [platform, entry] of Object.entries(manifest.platforms)) {
    if (!entry || typeof entry.signature !== "string" || !entry.signature.trim() || typeof entry.url !== "string") {
      throw new Error(`Incomplete update entry: ${platform}`);
    }
    let url;
    try { url = new URL(entry.url); } catch { throw new Error(`Invalid update URL: ${platform}`); }
    if (url.protocol !== "https:") throw new Error(`Update URL must use HTTPS: ${platform}`);
    if (url.hostname === "github.com" && url.pathname.includes("/releases/download/")) {
      const tag = url.pathname.split("/releases/download/")[1].split("/")[0];
      if (decodeURIComponent(tag) !== `v${version}`) throw new Error(`Update entry points to another release version: ${platform}`);
    }
  }
  return structuredClone(manifest);
}

export function mergeManifest({ base, version, notes, signature, publishedAt = new Date().toISOString() }) {
  if (typeof signature !== "string" || !signature.trim()) throw new Error("The Mac update signature is missing");
  const result = base ? validateBaseManifest(base, version) : { version, notes, pub_date: publishedAt, platforms: {} };
  if (typeof notes === "string" && notes.trim()) result.notes = notes.trim();
  result.platforms[MAC_PLATFORM] = {
    ...(result.platforms[MAC_PLATFORM] ?? {}),
    signature: signature.trim(),
    url: `https://github.com/${REPOSITORY}/releases/download/v${version}/zztodo.app.tar.gz`,
  };
  return result;
}

export function publicationPolicy(manifest) {
  const hasWindows = Boolean(manifest.platforms?.["windows-x86_64"]);
  return {
    status: hasWindows ? "SAME_VERSION_PLATFORMS_MERGED" : "MAC_ONLY_CANDIDATE",
    canSetGlobalLatest: hasWindows,
    requiresSameVersionWindowsBeforeLatest: !hasWindows,
    remotePublicationPerformed: false,
  };
}

export function verifyUpdateSignature(file, signatureBase64, publicKeyBase64) {
  const decode = (value) => Buffer.from(value.trim(), "base64");
  const keyLines = decode(publicKeyBase64).toString("utf8").split(/\r?\n/);
  const lines = decode(signatureBase64).toString("utf8").split(/\r?\n/);
  if (keyLines.length < 2 || lines.length < 4 || !lines[2].startsWith("trusted comment: ")) {
    throw new Error("Invalid update signature structure");
  }
  const key = decode(keyLines[1]);
  const signature = decode(lines[1]);
  const globalSignature = decode(lines[3]);
  if (key.length !== 42 || signature.length !== 74 || globalSignature.length !== 64 || !key.subarray(2, 10).equals(signature.subarray(2, 10))) {
    throw new Error("The update signature does not match the configured public key");
  }
  const algorithm = signature.subarray(0, 2).toString();
  if (!["Ed", "ED"].includes(algorithm)) throw new Error("Unsupported update signature algorithm");
  const publicKey = createPublicKey({
    key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), key.subarray(10)]),
    format: "der", type: "spki",
  });
  const bytes = readFileSync(file);
  const message = algorithm === "ED" ? createHash("blake2b512").update(bytes).digest() : bytes;
  const rawSignature = signature.subarray(10);
  if (!verify(null, message, publicKey, rawSignature)) throw new Error("The update archive signature is invalid");
  const trusted = lines[2].slice("trusted comment: ".length);
  if (!verify(null, Buffer.concat([rawSignature, Buffer.from(trusted)]), publicKey, globalSignature)) {
    throw new Error("The update signature trusted comment is invalid");
  }
}
