// `room tail` (issue 04): the CLI is a read-only observer of the state dir
// the MCP server writes. These tests run it as a real subprocess against a
// temp workspace, drive the server over stdio while it watches, and assert
// both what it printed and what it did not touch.

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, tempWorkspace } from "./helpers.mjs";

const CLI_PATH = new URL("../plugins/room/cli/room.mjs", import.meta.url).pathname;

function startTail({ cwd, stateDir }) {
  const child = spawn(process.execPath, [CLI_PATH, "tail"], {
    cwd,
    env: { ...process.env, ROOM_STATE_DIR: stateDir },
  });
  let out = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    out += chunk;
  });
  return {
    child,
    output: () => out,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill("SIGINT");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

async function waitFor(tail, substring, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (tail.output().includes(substring)) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`timed out waiting for tail to print ${JSON.stringify(substring)}; output so far:\n${tail.output()}`);
}

function snapshot(root) {
  const files = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(full, createHash("sha256").update(readFileSync(full)).digest("hex"));
    }
  };
  if (existsSync(root)) walk(root);
  return files;
}

test("tail prints history, then streams new ledger and mail events live", async (t) => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => server.close());
  await server.initialize();
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "peer-engineer", role: "peer" });
  await server.callTool("record_event", {
    type: "brief_sent",
    seat: "peer-engineer",
    detail: "brief: verify the hash chain (ticket 04)",
  });

  const tail = startTail({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => tail.stop());
  await waitFor(tail, "room_opened");
  await waitFor(tail, "peer_spawned");
  await waitFor(tail, "brief_sent");
  await waitFor(tail, "verify the hash chain");

  // The room keeps running with tail open: new events must appear live.
  await server.callTool("post_message", {
    to: "peer-engineer",
    from: "lead",
    body: "coordination while tail watches",
  });
  await server.callTool("record_event", {
    type: "handoff_received",
    seat: "peer-engineer",
    detail: "six-field report, SHA frozen",
  });
  await waitFor(tail, "lead → peer-engineer");
  await waitFor(tail, "coordination while tail watches");
  await waitFor(tail, "handoff_received");
  await waitFor(tail, "SHA frozen");
  await server.close();

  // Strictly read-only: nothing the server wrote changed by tail observing.
  const before = snapshot(ws.root);
  await new Promise((resolve) => setTimeout(resolve, 600)); // two+ poll cycles
  assert.deepEqual([...before.entries()].sort(), [...snapshot(ws.root).entries()].sort());

  await tail.stop();
  assert.equal(tail.child.exitCode, 0, "Ctrl-C exits cleanly");
});

test("tail waits when no room exists yet, then follows the room opening", async (t) => {
  const ws = tempWorkspace();
  const tail = startTail({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => tail.stop());
  await waitFor(tail, `no room state at ${ws.stateDir} yet`);

  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => server.close());
  await server.initialize();
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await waitFor(tail, "room_opened");
  await server.close();
  await tail.stop();
});

test("tail marks ledger lines untrusted when the chain is broken out-of-band", async (t) => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => server.close());
  await server.initialize();
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("record_event", { type: "brief_sent", seat: "peer-engineer", detail: "brief one" });
  await server.close();

  // Retcon line 2 on disk; tail must say so and mark everything after.
  const ledgerFile = join(ws.stateDir, "ledger.jsonl");
  const lines = readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean);
  const edited = JSON.parse(lines[1]);
  edited.detail = "brief one (retconned)";
  lines[1] = JSON.stringify(edited);
  writeFileSync(ledgerFile, `${lines.join("\n")}\n`);

  const tail = startTail({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => tail.stop());
  await waitFor(tail, "ledger chain break at #2");
  await waitFor(tail, "!! ledger");
});

test("unknown subcommand prints usage and exits non-zero", async () => {
  const ws = tempWorkspace();
  const child = spawn(process.execPath, [CLI_PATH, "warp"], {
    cwd: ws.root,
    env: { ...process.env, ROOM_STATE_DIR: ws.stateDir },
  });
  const { code } = await new Promise((resolve) => child.once("exit", (exitCode) => resolve({ code: exitCode })));
  assert.equal(code, 2);
  assert.equal(existsSync(ws.stateDir), false, "usage failures write nothing");
});
