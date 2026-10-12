// `room lead new|send|list` (issue 07): full CLI subprocess runs against
// the fake app-server double, over a synthetic credential store — the
// real binary and real credentials are never touched. Asserts the
// contract-prepended payload, the durable session id, resume-with-context,
// and the failure modes (duplicate seat, unknown seat, never-persisted
// session, hung turn).

import { createCipheriv, createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { encryptCredential, readJsonl } from "./helpers.mjs";

const CLI_PATH = new URL("../plugins/room/cli/room.mjs", import.meta.url).pathname;
const FAKE_SERVER = new URL("./fakes/app-server.mjs", import.meta.url).pathname;
const LEAD_CONTRACT = readFileSync(new URL("../plugins/room/contracts/LEAD.md", import.meta.url).pathname, "utf8");

const SECRET = "room-lead-test-secret";
const REVISION = "zcode-builtin:31:" + "c".repeat(64);

const encrypt = (plain) => encryptCredential(plain, SECRET);

function world() {
  const root = mkdtempSync(join(tmpdir(), "room-lead-test-"));
  const stateDir = join(root, "state");
  const workspace = join(root, "ws");
  mkdirSync(workspace, { recursive: true });
  const storePath = join(root, "credentials.json");
  writeFileSync(
    storePath,
    JSON.stringify({
      "account-provider:coding-plan:account:zai-individual-coding-plan:account:00000000-0000-0000-0000-000000000000:api-key": encrypt("fake-coding-plan-key"),
    })
  );
  return {
    root,
    stateDir,
    workspace,
    env: {
      ...process.env,
      ROOM_STATE_DIR: stateDir,
      ROOM_ZCODE_APP: process.execPath,
      ROOM_ZCODE_CJS: FAKE_SERVER,
      ROOM_CREDENTIAL_STORE: storePath,
      ZCODE_CREDENTIAL_SECRET: SECRET,
      ROOM_BUILTIN_REVISION: REVISION,
      FAKE_EXPECTED_REVISION: REVISION,
      FAKE_DB: join(root, "sessions-db.json"),
      FAKE_LOG: join(root, "requests.jsonl"),
      FAKE_REQUIRE_HEADERS: "1",
      FAKE_TURN_DELAY_MS: "10",
    },
  };
}

function runRoom(env, args, { stdin } = {}) {
  const child = spawn(process.execPath, [CLI_PATH, ...args], { env });
  if (stdin !== undefined) child.stdin.write(stdin);
  child.stdin.end();
  let out = "";
  let err = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    err += chunk;
  });
  return new Promise((resolve) =>
    child.once("exit", (code, signal) => resolve({ code, signal, out, err }))
  );
}

function leads(stateDir) {
  return JSON.parse(readFileSync(join(stateDir, "leads.json"), "utf8"));
}

test("lead new: contract prepended, one turn, report out, session id durable", async () => {
  const w = world();
  const brief = "Read FORTUNE.txt in the workspace and report its exact contents.";
  const result = await runRoom(w.env, ["lead", "new", "lead-alpha", "--workspace", w.workspace, "--brief", "-"], { stdin: brief });
  assert.equal(result.code, 0, `stdout:\n${result.out}\nstderr:\n${result.err}`);
  assert.match(result.out, /session sess_fake_\d+ — model account:zai-individual-coding-plan\/GLM-5\.3, turn 1 running/);
  assert.match(result.out, /--- report \(session sess_fake_\d+, turn\.completed\)/);
  assert.match(result.out, /FAKE-REPORT resumed=false turnCount=1 priorMessages=0/);

  // The payload the fake received must be the LEAD contract, verbatim,
  // ahead of the dispatch block and the brief.
  const sent = readJsonl(w.env.FAKE_LOG).find((entry) => entry.method === "session/send");
  assert.ok(sent, "a session/send was issued");
  assert.ok(sent.params.content.startsWith(LEAD_CONTRACT), "payload starts with the verbatim LEAD contract");
  assert.match(sent.params.content, /# Brief\n\nRead FORTUNE\.txt/);
  // The header-reply obligation really fired: the fake demanded provider
  // runtime headers and the wrapper answered with the decrypted key.
  const headerRequests = readJsonl(w.env.FAKE_LOG).filter(
    (entry) => entry.method === "interaction/requestProviderRuntimeHeaders"
  );
  assert.equal(headerRequests.length, 1);

  const record = leads(w.stateDir)["lead-alpha"];
  assert.ok(record, "seat recorded");
  assert.match(record.sessionId, /^sess_fake_\d+$/);
  assert.equal(record.turns, 1);
  assert.equal(record.workspace, w.workspace);
  assert.match(record.lastReport, /FAKE-REPORT resumed=false/);
});

test("lead send: resumes the same session with context and bumps the turn count", async () => {
  const w = world();
  await runRoom(w.env, ["lead", "new", "lead-beta", "--workspace", w.workspace, "--brief", "-"], { stdin: "first brief" });
  const firstId = leads(w.stateDir)["lead-beta"].sessionId;

  const result = await runRoom(w.env, ["lead", "send", "lead-beta", "--message", "-"], { stdin: "status?" });
  assert.equal(result.code, 0, `stdout:\n${result.out}\nstderr:\n${result.err}`);
  assert.match(result.out, /FAKE-REPORT resumed=true turnCount=2 priorMessages=2/);

  const record = leads(w.stateDir)["lead-beta"];
  assert.equal(record.sessionId, firstId, "same session id across processes");
  assert.equal(record.turns, 2);

  // Resume really went through session/resume with the recorded id.
  const resumed = readJsonl(w.env.FAKE_LOG).filter((entry) => entry.method === "session/resume");
  assert.equal(resumed.length, 1);
  assert.equal(resumed[0].params.sessionId, firstId);
});

test("lead list shows recorded seats; empty state says so", async () => {
  const w = world();
  const empty = await runRoom(w.env, ["lead", "list"]);
  assert.equal(empty.code, 0);
  assert.match(empty.out, /no Lead sessions recorded/);

  await runRoom(w.env, ["lead", "new", "lead-gamma", "--workspace", w.workspace, "--brief", "-"], { stdin: "b" });
  const listed = await runRoom(w.env, ["lead", "list"]);
  assert.match(listed.out, /lead-gamma  sess_fake_\d+  turns=1  account:zai-individual-coding-plan\/GLM-5\.3/);
  assert.match(listed.out, /last: FAKE-REPORT/);
});

test("lead new refuses a seat that already holds a session", async () => {
  const w = world();
  await runRoom(w.env, ["lead", "new", "lead-dup", "--workspace", w.workspace, "--brief", "-"], { stdin: "b" });
  const result = await runRoom(w.env, ["lead", "new", "lead-dup", "--workspace", w.workspace, "--brief", "-"], { stdin: "b" });
  assert.equal(result.code, 1);
  assert.match(result.err, /seat 'lead-dup' already has session/);
});

test("lead send refuses an unknown seat with guidance", async () => {
  const w = world();
  const result = await runRoom(w.env, ["lead", "send", "lead-nobody", "--message", "-"], { stdin: "m" });
  assert.equal(result.code, 1);
  assert.match(result.err, /no Lead recorded under seat 'lead-nobody'/);
});

test("lead send explains a session that never persisted its first turn", async () => {
  const w = world();
  await runRoom(w.env, ["lead", "new", "lead-ghost", "--workspace", w.workspace, "--brief", "-"], { stdin: "b" });
  // Simulate the never-completed first turn: drop the session from the
  // fake store while keeping the wrapper's leads.json record.
  const dbPath = w.env.FAKE_DB;
  const db = JSON.parse(readFileSync(dbPath, "utf8"));
  const id = leads(w.stateDir)["lead-ghost"].sessionId;
  delete db.sessions[id];
  writeFileSync(dbPath, `${JSON.stringify(db, null, 2)}\n`);

  const result = await runRoom(w.env, ["lead", "send", "lead-ghost", "--message", "-"], { stdin: "m" });
  assert.equal(result.code, 1);
  assert.match(result.err, /sessions persist only after their first completed turn/);
});

test("a hung first turn times out loudly but keeps the session id durable", async () => {
  const w = world();
  w.env.FAKE_HANG = "1";
  const result = await runRoom(w.env, ["lead", "new", "lead-hang", "--workspace", w.workspace, "--brief", "-", "--timeout-ms", "700"], { stdin: "b" });
  assert.equal(result.code, 1);
  assert.match(result.err, /timeout \(700ms\) waiting for turn end/);
  assert.ok(existsSync(join(w.stateDir, "leads.json")), "leads.json written before the turn");
  assert.match(leads(w.stateDir)["lead-hang"].sessionId, /^sess_fake_\d+$/);
});

test("a completed tool-calls preamble is not mistaken for the turn's report", async () => {
  const w = world();
  w.env.FAKE_PREAMBLE = "1";
  w.env.FAKE_TURN_DELAY_MS = "120";
  const result = await runRoom(w.env, ["lead", "new", "lead-preamble", "--workspace", w.workspace, "--brief", "-"], { stdin: "b" });
  assert.equal(result.code, 0, `stdout:\n${result.out}\nstderr:\n${result.err}`);
  assert.doesNotMatch(result.out, /Reading it now \(preamble before tool calls\)/);
  assert.match(result.out, /FAKE-REPORT resumed=false turnCount=1/);
});

test("usage failures: missing flags and bad seats exit 2 with the lead usage", async () => {
  const w = world();
  const noBrief = await runRoom(w.env, ["lead", "new", "lead-x", "--workspace", w.workspace]);
  assert.equal(noBrief.code, 2);
  const badSeat = await runRoom(w.env, ["lead", "new", "Bad_Seat", "--workspace", w.workspace, "--brief", "-"], { stdin: "b" });
  assert.equal(badSeat.code, 2);
  const unknownVerb = await runRoom(w.env, ["lead", "warp"]);
  assert.equal(unknownVerb.code, 2);
});
