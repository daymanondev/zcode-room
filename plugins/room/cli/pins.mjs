// pins.mjs — everything the wrapper hardcodes about the private ZCode
// surface, plus the pure helpers that derive the values the entitlement
// push needs. Kept separate from the client so tests can inject a world
// (fake binary, fake catalog, synthetic credential store) without
// touching this machine's real state.
//
// AGENTS.md rule: every private-surface dependency records the observed
// app version, the exact invocation, and a re-verify step. The pin block
// below is that record; `room doctor` re-verifies it without model calls.
//
// Re-verify on any build where zcode.cjs sha256 ≠ the pin (README pins
// section): shasum the bundle, run --version, then doctor's live path
// (baseline create empty → push received → create populated).

import { createDecipheriv, createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { resolve } from "node:path";

// Observed 2026-10-12 (re-verified live, grade A): ZCode.app 3.15.1,
// zcode.cjs CLI string still "0.16.9" but bundle bytes moved off the
// 3.14.5 pin fad4c35c… — the entitlement crack (issue 14) was re-proven
// on this exact hash: baseline wall → push received → create resolves
// GLM-5.3, zero model calls.
export const PINS = {
  appPath: process.env.ROOM_ZCODE_APP ?? "/Applications/ZCode.app/Contents/MacOS/ZCode",
  zcodeCjs: process.env.ROOM_ZCODE_CJS ?? "/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs",
  zcodeCjsSha256: "b816e38656e70fb585fe2ab1ea010da89cda928dac1ccb5d83255fd18796da6e",
  cliVersion: "0.16.9",
};

// The app-server launch the wrapper performs: the Electron binary as a
// plain node runtime running the bundled CLI. ELECTRON_RUN_AS_NODE is
// load-bearing — without it the app boots as a GUI.
export function launchAppServer({ appPath = PINS.appPath, zcodeCjs = PINS.zcodeCjs, env: envExtra } = {}) {
  return {
    command: appPath,
    args: [zcodeCjs, "app-server", "--stdio"],
    env: { ELECTRON_RUN_AS_NODE: "1", ...envExtra },
  };
}

export function launchVersionCheck({ appPath = PINS.appPath, zcodeCjs = PINS.zcodeCjs } = {}) {
  return {
    command: appPath,
    args: [zcodeCjs, "--version"],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  };
}

// ---- Builtin catalog → the push's revision gate ----
//
// provider/updateAccountConfig silently refuses while
// basedOnZCodeBuiltinRevision ≠ the registry's active revision, and that
// revision is `zcode-builtin:<catalog revision>:<sha256 of the RESOLVED
// active catalog PATH>` — the path string, not the file content (crack
// doc §3.2, verified: this formula reproduces the recorded 3.14.5 value
// 32241904… exactly).

// The runtime dir names arch "aarch64" where process.arch says "arm64"
// (observed layout ~/.zcode/v2/runtime/provider/darwin-aarch64/<app
// version>/endpoint-<hex>/zcode-builtin.json; only darwin-arm64 observed,
// grade A — other platforms will fail here loudly, which is correct).
export function platformDir() {
  const arch = process.arch === "arm64" ? "aarch64" : process.arch;
  return `${process.platform}-${arch}`;
}

export function runtimeProviderRoot() {
  return resolve(homedir(), ".zcode/v2/runtime/provider");
}

// App version from the bundle's Info.plist (XML). The catalog lives under
// a per-app-version dir, so this is how the active catalog is located
// without spawning anything.
export function readAppVersion(appPath) {
  const plist = resolve(appPath, "../../Info.plist");
  const text = readFileSync(plist, "utf8");
  const match = text.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
  if (!match) throw new Error(`no CFBundleShortVersionString in ${plist}`);
  return match[1].trim();
}

// Find the active builtin catalog for an app version and compute the
// revision string the push must carry. Exactly one endpoint dir is
// expected (observed); ambiguity means the layout moved — refuse rather
// than guess which catalog is live.
export function findActiveCatalog({ appVersion, runtimeRoot = runtimeProviderRoot() } = {}) {
  const versionDir = resolve(runtimeRoot, platformDir(), appVersion);
  if (!existsSync(versionDir)) {
    throw new Error(`no builtin runtime dir for app ${appVersion} at ${versionDir}`);
  }
  const endpoints = readdirSync(versionDir)
    .filter((entry) => entry.startsWith("endpoint-"))
    .sort();
  if (endpoints.length !== 1) {
    throw new Error(
      `expected exactly one endpoint dir under ${versionDir}, found ${endpoints.length} — the catalog layout moved; re-read the resolver in the new bundle`
    );
  }
  return revisionString(resolve(versionDir, endpoints[0], "zcode-builtin.json"));
}

export function revisionString(catalogPath) {
  const resolved = realpathSync(catalogPath);
  const catalog = JSON.parse(readFileSync(resolved, "utf8"));
  if (!Number.isInteger(catalog.revision)) {
    throw new Error(`catalog ${resolved} has no integer revision field`);
  }
  const pathHash = createHash("sha256").update(resolved).digest("hex");
  return { catalogPath: resolved, revision: catalog.revision, revisionString: `zcode-builtin:${catalog.revision}:${pathHash}` };
}

// ---- Credential store → the per-request header reply ----
//
// The coding-plan api-key lives in ~/.zcode/v2/credentials.json as a flat
// map of field → `enc:v1:<iv>.<tag>.<ct>` (base64url), AES-256-GCM with
// key sha256(secret); secret is ZCODE_CREDENTIAL_SECRET or the
// deterministic fallback below (crack doc §3.4, verified live: decrypts
// in a plain node process, no Keychain). Plaintext never leaves this
// module's callers' memory and is never printed.

export function credentialSecret(env = process.env) {
  if (env.ZCODE_CREDENTIAL_SECRET && env.ZCODE_CREDENTIAL_SECRET.length > 0) return env.ZCODE_CREDENTIAL_SECRET;
  return `zcode-credential-fallback:${process.platform}:${homedir()}:${userInfo().username}`;
}

export function decryptCredential(raw, secret) {
  const parts = String(raw).split(":");
  if (parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("credential is not enc:v1 format");
  }
  const [iv, tag, ciphertext] = parts[2].split(".");
  const key = createHash("sha256").update(secret).digest();
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}

export function credentialStorePath() {
  // ROOM_CREDENTIAL_STORE is a test seam (synthetic stores); the real
  // wrapper always reads the shared desktop-maintained store.
  return process.env.ROOM_CREDENTIAL_STORE ?? resolve(homedir(), ".zcode/v2/credentials.json");
}

// Load and decrypt the coding-plan api-key. Field shape (observed):
// account-provider:coding-plan:account:<providerId-body>:account:<identity>:api-key.
// The returned providerId is the FULL catalog id (`account:<body>`) — the
// entitlement push and the header replies key on it, and a bare body is
// accepted-but-never-published by the registry (caught live by doctor's
// create-after-push check, 2026-10-12).
export function loadCodingPlanApiKey({ storePath = credentialStorePath(), secret = credentialSecret() } = {}) {
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  const field = Object.keys(store).find(
    (key) => key.startsWith("account-provider:coding-plan:account:") && key.endsWith(":api-key")
  );
  if (!field) {
    throw new Error(`no coding-plan api-key field in ${storePath} (looked for account-provider:coding-plan:account:*:api-key)`);
  }
  const segments = field.split(":");
  return { providerId: `account:${segments[3]}`, apiKey: decryptCredential(store[field], secret) };
}
