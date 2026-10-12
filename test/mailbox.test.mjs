// The mechanical test seam (spec: Testing Decisions): drive the plugin's
// MCP server over stdio the way the harness would — initialize handshake,
// notifications/initialized, tools/list, tools/call — against temporary
// state directories, and assert both tool responses and resulting files.
// No internals are imported; the MCP surface is the only contract here.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, tempWorkspace } from "./helpers.mjs";

function walkFiles(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walkFiles(full, `${prefix}${entry}/`));
    } else {
      out.push(`${prefix}${entry}`);
    }
  }
  return out.sort();
}

test("initialize handshake and tool surface", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  const init = await server.initialize();
  assert.equal(init.serverInfo.name, "room");
  assert.equal(init.protocolVersion, "2025-06-18");
  assert.ok(init.capabilities.tools, "tools capability must be declared");
  const tools = await server.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name),
    [
      "post_message",
      "read_mailbox",
      "register_seat",
      "retire_seat",
      "lookup_seats",
      "record_event",
      "read_ledger",
    ]
  );
  await server.close();
});

test("addressing: post to a seat, the seat reads it, read consumes", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await server.initialize();

  const posted = await server.callTool("post_message", {
    to: "peer-reviewer",
    from: "peer-engineer",
    body: "handoff staged at commit abc123; please review the frozen SHA",
  });
  assert.equal(posted.isError, false);
  assert.equal(posted.parsed.posted.to, "peer-reviewer");
  assert.equal(posted.parsed.posted.from, "peer-engineer");
  assert.ok(posted.parsed.posted.id, "posted message carries an id");
  assert.ok(posted.parsed.posted.posted_at, "posted message carries a timestamp");

  const first = await server.callTool("read_mailbox", { seat: "peer-reviewer" });
  assert.equal(first.isError, false);
  assert.equal(first.parsed.messages.length, 1);
  assert.equal(first.parsed.messages[0].body.startsWith("handoff staged"), true);
  assert.equal(first.parsed.messages[0].from, "peer-engineer");

  const second = await server.callTool("read_mailbox", { seat: "peer-reviewer" });
  assert.equal(second.isError, false, "empty box is not an error");
  assert.deepEqual(second.parsed.messages, [], "read consumes: second read returns nothing");

  // Message files exist only for the posted-to seat, as JSONL plus cursor.
  assert.deepEqual(walkFiles(ws.stateDir), [
    "mailbox/peer-reviewer.cursor",
    "mailbox/peer-reviewer.jsonl",
  ]);
  await server.close();
});

test("missing box: reading a seat nobody posted to is a tool error", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await server.initialize();
  const result = await server.callTool("read_mailbox", { seat: "peer-ghost" });
  assert.equal(result.isError, true);
  assert.match(result.text, /no mailbox for seat 'peer-ghost'/);
  await server.close();
});

test("validation refusals write nothing", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await server.initialize();

  const badSeat = await server.callTool("post_message", {
    to: "Peer_Reviewer",
    from: "peer-engineer",
    body: "hi",
  });
  assert.equal(badSeat.isError, true);
  assert.match(badSeat.text, /invalid seat name/);

  const emptyBody = await server.callTool("post_message", {
    to: "peer-reviewer",
    from: "peer-engineer",
    body: "",
  });
  assert.equal(emptyBody.isError, true);

  const missingFrom = await server.callTool("post_message", {
    to: "peer-reviewer",
    body: "hi",
  });
  assert.equal(missingFrom.isError, true);

  const badReadSeat = await server.callTool("read_mailbox", { seat: "not a seat" });
  assert.equal(badReadSeat.isError, true);

  assert.equal(existsSync(ws.stateDir), false, "refused calls must not create any state");
  await server.close();
});

test("durability: messages and consumption survive a server restart", async () => {
  const ws = tempWorkspace();

  const first = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await first.initialize();
  await first.callTool("post_message", { to: "lead", from: "peer-scout", body: "finding one" });
  await first.callTool("post_message", { to: "lead", from: "peer-scout", body: "finding two" });
  const consumedBatch = await first.callTool("read_mailbox", { seat: "lead" });
  assert.deepEqual(
    consumedBatch.parsed.messages.map((message) => message.body),
    ["finding one", "finding two"],
    "one read consumes the whole unread batch, in post order"
  );
  await first.close();

  const second = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await second.initialize();
  await second.callTool("post_message", { to: "lead", from: "peer-engineer", body: "finding three" });
  const afterRestart = await second.callTool("read_mailbox", { seat: "lead" });
  assert.deepEqual(
    afterRestart.parsed.messages.map((message) => message.body),
    ["finding three"],
    "restart preserves the consumption cursor; only the new message arrives"
  );
  await second.close();
});

test("containment: no writes outside the room-state dir", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await server.initialize();
  await server.callTool("post_message", { to: "supervisor", from: "lead", body: "escalation" });
  await server.callTool("read_mailbox", { seat: "supervisor" });
  await server.close();

  // Every file anywhere under the temp workspace must live under .room/.
  const outside = walkFiles(ws.root).filter((file) => !file.startsWith(".room/"));
  assert.deepEqual(outside, [], "the server must not write outside the room-state dir");
});

test("default state dir resolves to <cwd>/.room", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root });
  await server.initialize();
  await server.callTool("post_message", { to: "peer-engineer", from: "lead", body: "brief echo" });
  await server.close();
  assert.ok(existsSync(join(ws.root, ".room", "mailbox", "peer-engineer.jsonl")));
});

test("unknown tool and unknown method are protocol errors", async () => {
  const ws = tempWorkspace();
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  await server.initialize();
  const unknownTool = await server.request("tools/call", { name: "nope", arguments: {} });
  assert.equal(unknownTool.error.code, -32602);
  const unknownMethod = await server.request("resources/list", {});
  assert.equal(unknownMethod.error.code, -32601);
  await server.close();
});
