// `room heartbeat` (issue 10): the mechanical wake gate the Supervisor's
// */2 automation runs — zero model calls, zero judgment: it reads the room
// state the MCP server writes and prints one verdict. These tests build
// real state by driving the server over stdio, then run the check as a
// plain function (logic) and once as a CLI subprocess (verb wiring), and
// assert both what it reported and what it did not touch: the gate peeks
// at the mailbox without consuming it — the consuming act belongs to the
// wake after the relay has landed in chat.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, tempWorkspace } from "./helpers.mjs";
import { runHeartbeatCheck } from "../plugins/room/cli/heartbeat.mjs";

const CLI_PATH = new URL("../plugins/room/cli/room.mjs", import.meta.url).pathname;

function lines(output) {
  return output.split("\n").filter(Boolean);
}

// The gate's clock starts at the newest ledger timestamp, so a brief just
// recorded reads as young without sleeping.
function check({ stateDir, stallAfterMs }) {
  let out = "";
  const verdict = runHeartbeatCheck({
    stateDir,
    stallAfterMs,
    write: (line) => {
      out += `${line}\n`;
    },
  });
  return { verdict, output: out, lines: lines(out) };
}

async function buildRoom(stateDir, { cwd } = {}) {
  const server = startServer({ cwd: cwd ?? process.cwd(), stateDir });
  await server.initialize();
  return server;
}

test("orphaned when no room state exists at all", () => {
  const { verdict, output } = check({ stateDir: "/nonexistent-room-state" });
  assert.equal(verdict, "orphaned");
  assert.match(output, /^orphaned: no room state at /);
});

test("orphaned when the supervisor seat is retired or absent", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("retire_seat", { seat: "supervisor" });

  const { verdict, output } = check({ stateDir: ws.stateDir });
  assert.equal(verdict, "orphaned");
  assert.match(output, /^orphaned: no live supervisor seat/);
  assert.match(output, /supervisor/);
});

test("quiet when the supervisor is live and nothing waits", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor-2", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });

  const { verdict, output } = check({ stateDir: ws.stateDir });
  assert.equal(verdict, "quiet");
  assert.match(output, /^quiet: supervisor supervisor-2 live/);
});

test("unread escalations surface without consuming the mailbox", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("post_message", {
    to: "supervisor",
    from: "peer-engineer",
    body: "NEEDS-HUMAN: keep the compat shim or break the API? Shim = slower, break = migration.",
  });

  // Peek, not consume: no cursor exists yet (only a real read mints one),
  // and the gate must not create it — a later read still sees the message.
  const cursor = join(ws.stateDir, "mailbox", "supervisor.cursor");
  assert.equal(existsSync(cursor), false);
  const { verdict, output } = check({ stateDir: ws.stateDir });
  assert.equal(verdict, "action");
  assert.match(output, /^action: supervisor supervisor$/m);
  assert.match(output, /escalation .* from peer-engineer/);
  assert.match(output, /NEEDS-HUMAN: keep the compat shim/);
  assert.equal(existsSync(cursor), false, "the gate must not mint a mailbox cursor");
  // And the message is still unread through the server's own read.
  const reread = await server.callTool("read_mailbox", { seat: "supervisor" });
  assert.equal(reread.parsed.messages.length, 1);
});

test("escalations already consumed read quiet", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("post_message", { to: "supervisor", from: "peer-scout", body: "NEEDS-HUMAN: pick A or B." });
  await server.callTool("read_mailbox", { seat: "supervisor" });

  const { verdict } = check({ stateDir: ws.stateDir });
  assert.equal(verdict, "quiet");
});

test("a young open brief is not stalled", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "briefs/lead-01.md" });

  const { verdict, output } = check({ stateDir: ws.stateDir, stallAfterMs: 60 * 60 * 1000 });
  assert.equal(verdict, "quiet");
  assert.match(output, /no stalled leads/);
});

test("an old open brief is stalled and re-poke eligible exactly once", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "briefs/lead-01.md" });
  writeFileSync(join(ws.stateDir, "leads.json"), `${JSON.stringify({ lead: { sessionId: "sess_abc123" } }, null, 2)}\n`);

  const eligible = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(eligible.verdict, "action");
  assert.match(eligible.output, /stalled lead: brief #\d+ open .*, 1 briefs? since last handoff, session sess_abc123 → re-poke eligible/);

  // The re-poke lands as another brief_sent with no handoff between: the
  // gate must refuse a second re-poke and hand the decision to the Human.
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "re-poke 1/1 — heartbeat stall recovery" });
  const spent = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(spent.verdict, "action");
  assert.match(spent.output, /2 briefs since last handoff, session sess_abc123 → already re-poked, needs Human/);
});

test("an answer-routing brief does not spend the re-poke budget", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "briefs/lead-01.md" });
  await server.callTool("record_event", { type: "handoff_received", seat: "lead", detail: "complete" });
  // A routed answer is also a brief_sent (the skill prescribes the
  // "answer routing:" detail): if its report never lands, the Lead is
  // stalled but has NOT been re-poked — the budget counts only briefs
  // whose detail begins "re-poke".
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "answer routing: ruling on peer escalation" });
  writeFileSync(join(ws.stateDir, "leads.json"), `${JSON.stringify({ lead: { sessionId: "sess_abc123" } }, null, 2)}\n`);

  const { verdict, output } = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(verdict, "action");
  assert.match(output, /1 brief since last handoff, session sess_abc123 → re-poke eligible/);
  assert.doesNotMatch(output, /already re-poked/);
});

test("a handoff closes the loop: no stall even at threshold zero", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "briefs/lead-01.md" });
  await server.callTool("record_event", { type: "handoff_received", seat: "lead", detail: "complete" });
  await server.callTool("record_event", { type: "disposition", seat: "lead", detail: "ACCEPT — verified" });

  const { verdict } = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(verdict, "quiet");
});

test("a retired lead with an open brief is not stalled", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "briefs/lead-01.md" });
  await server.callTool("retire_seat", { seat: "lead" });

  const { verdict } = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(verdict, "quiet");
});

test("an open brief with no recorded session is stalled but not re-pokable", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead-main", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead-main", detail: "briefs/lead-main-01.md" });

  const { verdict, output } = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(verdict, "action");
  assert.match(output, /stalled lead-main: .* session none → needs Human, no session to resume/);
});

test("a tampered ledger surfaces an alarm and skips stall math, mailbox still peeked", async (t) => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  t.after(() => server.close());

  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("record_event", { type: "brief_sent", seat: "lead", detail: "briefs/lead-01.md" });
  await server.callTool("post_message", { to: "supervisor", from: "peer-engineer", body: "NEEDS-HUMAN: x or y?" });

  // Out-of-band edit: flip one byte inside the newest line's detail.
  const ledgerFile = join(ws.stateDir, "ledger.jsonl");
  const raw = readFileSync(ledgerFile, "utf8");
  writeFileSync(ledgerFile, raw.replace("briefs/lead-01.md", "briefs/lead-XX.md"));

  const { verdict, output } = check({ stateDir: ws.stateDir, stallAfterMs: 0 });
  assert.equal(verdict, "action");
  assert.match(output, /ledger: chain break at #\d+ — stall math skipped/);
  assert.doesNotMatch(output, /stalled/);
  assert.match(output, /escalation .* from peer-engineer/);
});

test("the CLI verb prints the verdict and exits zero", async () => {
  const ws = tempWorkspace();
  const server = await buildRoom(ws.stateDir);
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.close();

  const child = spawn(process.execPath, [CLI_PATH, "heartbeat", "--state-dir", ws.stateDir], {
    env: { ...process.env },
  });
  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
  });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(code, 0);
  assert.match(out, /^quiet: supervisor supervisor live/);
});

test("the CLI verb refuses a bad stall threshold", async () => {
  const child = spawn(process.execPath, [CLI_PATH, "heartbeat", "--stall-after-ms", "nope"], {
    env: { ...process.env },
  });
  let err = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    err += chunk;
  });
  const code = await new Promise((resolve) => child.once("exit", resolve));
  assert.equal(code, 2);
  assert.match(err, /--stall-after-ms/);
});
