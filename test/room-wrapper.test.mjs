// Unit tests for the wrapper's pure private-surface helpers (issue 07):
// the revision-string formula, catalog resolution, the credential cipher,
// and defensive final-report extraction. These pin the formulas the
// entitlement crack documented; the formulas' ground truth is the live
// doctor run, not these tests.

import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptCredential } from "./helpers.mjs";
import {
  credentialSecret,
  decryptCredential,
  findActiveCatalog,
  loadCodingPlanApiKey,
  platformDir,
  readAppVersion,
  revisionString,
} from "../plugins/room/cli/pins.mjs";
import { extractFinalReport } from "../plugins/room/cli/lead.mjs";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "room-wrapper-test-"));
}

function writeCatalog(dir, revision) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "zcode-builtin.json"), `${JSON.stringify({ schemaVersion: 1, revision, config: {} })}\n`);
}

test("revisionString hashes the resolved path, not the content, and reads the revision from the catalog", () => {
  const root = tempDir();
  const catalogDir = join(root, "endpoint-abc123");
  writeCatalog(catalogDir, 31);
  // Rewrite the content afterward: the revision string must not move.
  writeFileSync(join(catalogDir, "zcode-builtin.json"), `${JSON.stringify({ schemaVersion: 1, revision: 31, config: { changed: true } })}\n`);

  const result = revisionString(join(catalogDir, "zcode-builtin.json"));
  const expectedHash = createHash("sha256").update(join(realpathSync(catalogDir), "zcode-builtin.json")).digest("hex");
  assert.equal(result.revisionString, `zcode-builtin:31:${expectedHash}`);
  assert.equal(result.revision, 31);
});

test("findActiveCatalog picks the single endpoint dir for the app version and refuses ambiguity", () => {
  const root = tempDir();
  writeCatalog(join(root, platformDir(), "3.15.1", "endpoint-1"), 31);
  assert.equal(findActiveCatalog({ appVersion: "3.15.1", runtimeRoot: root }).revision, 31);

  writeCatalog(join(root, platformDir(), "3.16.0", "endpoint-2"), 32);
  writeCatalog(join(root, platformDir(), "3.16.0", "endpoint-3"), 32);
  assert.throws(
    () => findActiveCatalog({ appVersion: "3.16.0", runtimeRoot: root }),
    /expected exactly one endpoint dir/
  );
  assert.throws(() => findActiveCatalog({ appVersion: "9.9.9", runtimeRoot: root }), /no builtin runtime dir/);
});

test("readAppVersion reads CFBundleShortVersionString from the bundle plist", () => {
  const root = tempDir();
  const macosDir = join(root, "ZCode.app", "Contents", "MacOS");
  mkdirSync(macosDir, { recursive: true });
  writeFileSync(
    join(root, "ZCode.app", "Contents", "Info.plist"),
    `<?xml version="1.0"?>
<plist><dict>
  <key>CFBundleExecutable</key><string>ZCode</string>
  <key>CFBundleShortVersionString</key>
  <string>3.15.1</string>
</dict></plist>`
  );
  assert.equal(readAppVersion(join(macosDir, "ZCode")), "3.15.1");
});

test("decryptCredential round-trips the enc:v1 cipher and fails closed on tampering", () => {
  const secret = "test-secret";
  const raw = encryptCredential("the-api-key", secret);
  assert.equal(decryptCredential(raw, secret), "the-api-key");
  assert.throws(() => decryptCredential(raw, "wrong-secret"), /Unsupported state/);
  const parts = raw.split(":");
  const [iv, tag, ct] = parts[2].split(".");
  assert.throws(() => decryptCredential(`enc:v1:${iv}.${tag}.${ct.slice(0, -2)}x`, secret));
  assert.throws(() => decryptCredential("plaintext", secret), /not enc:v1/);
});

test("credentialSecret prefers the env override, else the deterministic fallback", () => {
  assert.equal(credentialSecret({ ZCODE_CREDENTIAL_SECRET: "env-secret" }), "env-secret");
  assert.equal(credentialSecret({}), credentialSecret({}));
});

test("loadCodingPlanApiKey finds the field, parses the providerId, and decrypts", () => {
  const root = tempDir();
  const storePath = join(root, "credentials.json");
  const secret = "test-secret";
  writeFileSync(
    storePath,
    JSON.stringify({
      "oauth:zai:access_token": encryptCredential("oauth-token", secret),
      "account-provider:coding-plan:account:zai-individual-coding-plan:account:b66d-uuid:api-key": encryptCredential("sk-live-key", secret),
    })
  );
  const loaded = loadCodingPlanApiKey({ storePath, secret });
  assert.equal(loaded.providerId, "account:zai-individual-coding-plan");
  assert.equal(loaded.apiKey, "sk-live-key");
  assert.throws(() => loadCodingPlanApiKey({ storePath: join(root, "absent.json"), secret }), /ENOENT/);
  const noKey = join(root, "empty.json");
  writeFileSync(noKey, JSON.stringify({ "other:field": encryptCredential("x", secret) }));
  assert.throws(() => loadCodingPlanApiKey({ storePath: noKey, secret }), /no coding-plan api-key field/);
});

test("extractFinalReport takes the last assistant text across observed and defensive shapes", () => {
  assert.equal(extractFinalReport([{ role: "user", content: "q" }, { role: "assistant", content: "final answer" }]), "final answer");
  assert.equal(
    extractFinalReport([
      { role: "assistant", content: "earlier" },
      { role: "assistant", content: [{ type: "text", text: "blocky" }, { type: "thinking", text: "(internal)" }] },
    ]),
    "blocky"
  );
  assert.equal(extractFinalReport([{ role: "user", content: "q" }]), null);
  assert.equal(extractFinalReport([]), null);
  assert.equal(extractFinalReport([{ role: "assistant", content: "   " }]), null);
});
