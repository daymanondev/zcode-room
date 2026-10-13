// `room doctor` (issue 07): every check is driven against a fake world
// (fake binary file, fake version launcher, fake app-server double,
// synthetic key loader) so green/red is deterministic and no model calls
// can ever be spent. The fake double encodes the observed contract,
// including the silent revision-gate refusal that the stale-revision
// test exercises.

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runDoctor } from "../plugins/room/cli/doctor.mjs";

const FAKE_SERVER = new URL("./fakes/app-server.mjs", import.meta.url).pathname;

function fakeWorld({ expectedRevision = "zcode-builtin:31:" + "a".repeat(64), version = "0.16.9" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "room-doctor-test-"));
  const zcodeCjs = join(root, "zcode.cjs");
  writeFileSync(zcodeCjs, "// fake bundle\n");
  const env = {
    FAKE_VERSION: version,
    FAKE_EXPECTED_REVISION: expectedRevision,
  };
  return {
    root,
    pins: {
      appPath: process.execPath,
      zcodeCjs,
      zcodeCjsSha256: createHash("sha256").update(readFileSync(zcodeCjs)).digest("hex"),
      cliVersion: "0.16.9",
    },
    versionLaunch: { command: process.execPath, args: [FAKE_SERVER, "--version"], env: { FAKE_VERSION: version } },
    serverLaunch: { command: process.execPath, args: [FAKE_SERVER], env },
    resolveRevision: () => ({ revisionString: expectedRevision, revision: 31 }),
    loadKey: () => ({ providerId: "zai-individual-coding-plan", apiKey: "test-key" }),
  };
}

async function doctorOutput(world) {
  const lines = [];
  const go = await runDoctor({ ...world, write: (line) => lines.push(line) });
  return { go, text: lines.join("\n") };
}

test("doctor reports GO on a healthy world, proving the entitlement path live", async () => {
  const world = fakeWorld();
  const { go, text } = await doctorOutput(world);
  assert.equal(go, true);
  assert.match(text, /PASS  sha256 matches pin/);
  assert.match(text, /PASS  --version prints 0\.16\.9/);
  assert.match(text, /PASS  active catalog revision gate/);
  assert.match(text, /PASS  coding-plan api-key decrypts/);
  assert.match(text, /PASS  live: baseline create shows the entitlement wall/);
  assert.match(text, /PASS  live: entitlement push received \(providerCount: 1\)/);
  assert.match(text, /PASS  live: model resolves after push/);
  assert.match(text, /PASS  live: setModel selects account:zai-individual-coding-plan\/GLM-5\.3-Flash \(zero model calls\)/);
  assert.match(text, /GO — the wrapper may spawn Leads on this build/);
});

test("doctor reports NO-GO on a tampered hash and skips the live check", async () => {
  const world = fakeWorld();
  world.pins = { ...world.pins, zcodeCjsSha256: "f".repeat(64) };
  const { go, text } = await doctorOutput(world);
  assert.equal(go, false);
  assert.match(text, /FAIL  sha256 matches pin .*observed/);
  assert.match(text, /live entitlement check skipped — static checks failed/);
  assert.match(text, /NO-GO/);
});

test("doctor reports NO-GO when the version moved", async () => {
  const world = fakeWorld({ version: "0.17.0" });
  const { go, text } = await doctorOutput(world);
  assert.equal(go, false);
  assert.match(text, /FAIL  --version prints 0\.16\.9 — observed "0\.17\.0"/);
});

test("doctor reports NO-GO when credentials cannot be loaded", async () => {
  const world = fakeWorld();
  world.loadKey = () => {
    throw new Error("no coding-plan api-key field");
  };
  const { go, text } = await doctorOutput(world);
  assert.equal(go, false);
  assert.match(text, /FAIL  coding-plan api-key decrypts — no coding-plan api-key field/);
});

test("doctor catches the silent revision-gate refusal: nothing publishes after a stale push", async () => {
  // The registry ACKNOWLEDGES a push whose basedOnZCodeBuiltinRevision is
  // stale (status received, providerCount 0) but never publishes it — the
  // model stays unavailable. That is exactly the drift doctor must catch,
  // because nothing else fails.
  const world = fakeWorld({ expectedRevision: "zcode-builtin:31:" + "b".repeat(64) });
  world.resolveRevision = () => ({ revisionString: "zcode-builtin:31:" + "a".repeat(64), revision: 31 });
  const { go, text } = await doctorOutput(world);
  assert.equal(go, false);
  assert.match(text, /FAIL  live: entitlement push received \(providerCount: 0\)/);
  assert.match(text, /FAIL  live: model resolves after push \(none\)/);
  assert.match(text, /NO-GO/);
});

test("doctor reports NO-GO when the app-server child cannot be spawned", async () => {
  const world = fakeWorld();
  world.serverLaunch = { command: "/nonexistent/room-doctor-missing-binary", args: [], env: {} };
  const { go, text } = await doctorOutput(world);
  assert.equal(go, false);
  assert.match(text, /FAIL  live: entitlement path over app-server stdio/);
});
