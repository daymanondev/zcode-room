// Registry and ledger over the MCP surface (issue 04): registration
// lifecycle, the advisory one-supervisor rule, the closed ledger vocabulary,
// and append-only proven both structurally (earlier bytes never change) and
// detectably (the hash chain catches out-of-band tampering).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { startServer, tempWorkspace } from "./helpers.mjs";

// Every test's server is torn down even when an assertion fails mid-test —
// a leaked child would keep the whole file alive past its timeout.
async function openServer(ws, t) {
  const server = startServer({ cwd: ws.root, stateDir: ws.stateDir });
  t.after(() => server.close());
  await server.initialize();
  return server;
}

test("first registration opens the room; role events land in the ledger", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);

  const supervisor = await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  assert.equal(supervisor.isError, false);
  assert.equal(supervisor.parsed.already, false);
  assert.deepEqual(
    supervisor.parsed.ledger.map((event) => event.type),
    ["room_opened"]
  );

  const lead = await server.callTool("register_seat", { seat: "lead", role: "lead" });
  assert.deepEqual(
    lead.parsed.ledger.map((event) => event.type),
    ["lead_registered"]
  );

  const peer = await server.callTool("register_seat", { seat: "peer-engineer", role: "peer" });
  assert.deepEqual(
    peer.parsed.ledger.map((event) => event.type),
    ["peer_spawned"]
  );

  const ledger = await server.callTool("read_ledger", {});
  assert.equal(ledger.parsed.verified, true);
  assert.deepEqual(
    ledger.parsed.events.map((event) => [event.seq, event.type, event.seat]),
    [
      [1, "room_opened", "supervisor"],
      [2, "lead_registered", "lead"],
      [3, "peer_spawned", "peer-engineer"],
    ]
  );
  assert.equal(existsSync(join(ws.stateDir, "registry.json")), true, "registry lands on disk");
  await server.close();
});

test("re-register is idempotent: no new ledger line, identity preserved", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);
  const first = await server.callTool("register_seat", { seat: "lead", role: "lead" });
  const firstAt = first.parsed.registered.registered_at;
  const before = await server.callTool("read_ledger", {});

  const again = await server.callTool("register_seat", { seat: "lead", role: "lead" });
  assert.equal(again.isError, false);
  assert.equal(again.parsed.already, true);
  assert.equal(again.parsed.registered.registered_at, firstAt, "identity keeps its original registration time");

  const after = await server.callTool("read_ledger", {});
  assert.equal(after.parsed.events.length, before.parsed.events.length, "idempotent re-register mints no line");

  const roleChange = await server.callTool("register_seat", { seat: "lead", role: "peer" });
  assert.equal(roleChange.isError, true);
  assert.match(roleChange.text, /already registered with role 'lead'/);
  await server.close();
});

test("the one-supervisor rule is recorded and advisory: second supervisor warns, not refuses", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });

  const second = await server.callTool("register_seat", { seat: "supervisor-2", role: "supervisor" });
  assert.equal(second.isError, false, "advisory means the registration still lands");
  assert.match(second.parsed.warning, /one-supervisor rule \(advisory until M2 \(issue 11\)\)/);
  assert.match(second.parsed.warning, /seat 'supervisor' is already the live supervisor/);

  const lookup = await server.callTool("lookup_seats", { role: "supervisor" });
  assert.equal(lookup.isError, false);
  assert.deepEqual(lookup.parsed.seats.map((seat) => seat.seat), ["supervisor", "supervisor-2"]);
  const rule = lookup.parsed.rules.find((entry) => entry.id === "one-supervisor");
  assert.ok(rule, "the rule itself is recorded in the registry");
  assert.equal(rule.status, "advisory");

  const onDisk = JSON.parse(readFileSync(join(ws.stateDir, "registry.json"), "utf8"));
  assert.equal(onDisk.rules[0].id, "one-supervisor", "rule is on disk, not just in responses");
  await server.close();
});

test("lookup answers who holds which seat, filtered by role and state", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "lead", role: "lead" });
  await server.callTool("register_seat", { seat: "peer-engineer", role: "peer" });
  await server.callTool("register_seat", { seat: "peer-reviewer", role: "peer" });
  await server.callTool("retire_seat", { seat: "peer-reviewer" });

  const peers = await server.callTool("lookup_seats", { role: "peer" });
  assert.deepEqual(
    peers.parsed.seats.map((seat) => [seat.seat, seat.state]),
    [
      ["peer-engineer", "live"],
      ["peer-reviewer", "retired"],
    ]
  );
  const live = await server.callTool("lookup_seats", { state: "live" });
  assert.deepEqual(
    live.parsed.seats.map((seat) => seat.seat),
    ["lead", "peer-engineer", "supervisor"]
  );
  const badRole = await server.callTool("lookup_seats", { role: "chief" });
  assert.equal(badRole.isError, true);
  await server.close();
});

test("retirement is an explicit, terminal registry act", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);
  await server.callTool("register_seat", { seat: "lead", role: "lead" });

  const retired = await server.callTool("retire_seat", { seat: "lead" });
  assert.equal(retired.isError, false);
  assert.deepEqual(retired.parsed.ledger.map((event) => event.type), ["retired"]);
  assert.equal(retired.parsed.retired.retired_at !== null, true);

  const again = await server.callTool("retire_seat", { seat: "lead" });
  assert.equal(again.isError, false);
  assert.equal(again.parsed.already, true);

  const revival = await server.callTool("register_seat", { seat: "lead", role: "lead" });
  assert.equal(revival.isError, true);
  assert.match(revival.text, /retirement is terminal/);

  const ghost = await server.callTool("retire_seat", { seat: "peer-ghost" });
  assert.equal(ghost.isError, true);
  assert.match(ghost.text, /no seat 'peer-ghost'/);
  await server.close();
});

test("record_event takes the four loop events and refuses everything else", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);

  const brief = await server.callTool("record_event", {
    type: "brief_sent",
    seat: "peer-engineer",
    detail: "brief: review ledger chain (ticket 04)",
  });
  assert.equal(brief.isError, false);
  assert.equal(brief.parsed.recorded.type, "brief_sent");
  assert.equal(brief.parsed.recorded.seat, "peer-engineer");
  assert.ok(brief.parsed.recorded.hash, "recorded line carries its hash");

  for (const type of ["handoff_received", "disposition", "needs_human"]) {
    const ok = await server.callTool("record_event", { type, detail: `${type} note` });
    assert.equal(ok.isError, false, `${type} is a legal loop event`);
  }

  const unknown = await server.callTool("record_event", { type: "incident" });
  assert.equal(unknown.isError, true);
  assert.match(unknown.text, /vocabulary is closed/);

  const lifecycle = await server.callTool("record_event", { type: "lead_registered" });
  assert.equal(lifecycle.isError, true);
  assert.match(lifecycle.text, /minted by a registry act/);

  const emptyDetail = await server.callTool("record_event", { type: "disposition", detail: "" });
  assert.equal(emptyDetail.isError, true);
  await server.close();
});

test("append-only, structurally: retire and more events never rewrite earlier bytes", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("register_seat", { seat: "peer-engineer", role: "peer" });
  await server.callTool("record_event", { type: "brief_sent", seat: "peer-engineer", detail: "brief one" });
  const ledgerFile = join(ws.stateDir, "ledger.jsonl");
  const frozen = readFileSync(ledgerFile);

  // The tempting rewrite cases: retirement (updates the registry) and
  // continued activity must both leave the recorded prefix byte-identical.
  await server.callTool("retire_seat", { seat: "peer-engineer" });
  await server.callTool("record_event", { type: "handoff_received", seat: "peer-engineer", detail: "handoff" });
  await server.callTool("record_event", { type: "disposition", seat: "peer-engineer", detail: "ACCEPT: chain verified" });

  const grown = readFileSync(ledgerFile);
  assert.equal(grown.subarray(0, frozen.length).equals(frozen), true, "earlier ledger bytes are frozen");
  assert.ok(grown.length > frozen.length, "new events append after the frozen prefix");

  const ledger = await server.callTool("read_ledger", {});
  assert.equal(ledger.parsed.verified, true);
  assert.deepEqual(
    ledger.parsed.events.map((event) => [event.seq, event.type]),
    [
      [1, "room_opened"],
      [2, "peer_spawned"],
      [3, "brief_sent"],
      [4, "retired"],
      [5, "handoff_received"],
      [6, "disposition"],
    ]
  );
  await server.close();
});

test("append-only, detectably: out-of-band tampering breaks the chain where it happened", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);
  await server.callTool("register_seat", { seat: "supervisor", role: "supervisor" });
  await server.callTool("record_event", { type: "brief_sent", seat: "peer-engineer", detail: "brief one" });
  await server.callTool("record_event", { type: "handoff_received", seat: "peer-engineer", detail: "handoff one" });
  await server.close();

  // Edit line 2's detail out-of-band, exactly the rewrite the server never
  // performs. The chain must catch it: line 2's hash no longer matches its
  // content, and the trusted prefix stops at seq 1.
  const ledgerFile = join(ws.stateDir, "ledger.jsonl");
  const lines = readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean);
  const edited = JSON.parse(lines[1]);
  edited.detail = "brief one (retconned)";
  lines[1] = JSON.stringify(edited);
  writeFileSync(ledgerFile, `${lines.join("\n")}\n`);

  const checker = await openServer(ws, t);
  const ledger = await checker.callTool("read_ledger", {});
  assert.equal(ledger.parsed.verified, false);
  assert.equal(ledger.parsed.break_at, 2);
  assert.deepEqual(
    ledger.parsed.events.map((event) => event.seq),
    [1],
    "events after the break are not presented as trusted"
  );

  // Deletion is caught the same way: removing a line breaks the seq/prev chain.
  const lines2 = readFileSync(ledgerFile, "utf8").split("\n").filter(Boolean);
  lines2.splice(1, 1);
  writeFileSync(ledgerFile, `${lines2.join("\n")}\n`);
  const deleted = await checker.callTool("read_ledger", {});
  assert.equal(deleted.parsed.verified, false);
  assert.equal(deleted.parsed.break_at, 2);
  await checker.close();
});

test("read_ledger paging and the empty room", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);

  const empty = await server.callTool("read_ledger", {});
  assert.equal(empty.isError, false);
  assert.equal(empty.parsed.verified, true);
  assert.deepEqual(empty.parsed.events, []);

  await server.callTool("record_event", { type: "brief_sent", detail: "one" });
  await server.callTool("record_event", { type: "handoff_received", detail: "two" });
  const paged = await server.callTool("read_ledger", { since_seq: 1 });
  assert.deepEqual(
    paged.parsed.events.map((event) => event.seq),
    [2]
  );
  const badSince = await server.callTool("read_ledger", { since_seq: -1 });
  assert.equal(badSince.isError, true);
  await server.close();
});

test("registry and ledger refusals write nothing", async (t) => {
  const ws = tempWorkspace();
  const server = await openServer(ws, t);

  const badRole = await server.callTool("register_seat", { seat: "lead", role: "chief" });
  assert.equal(badRole.isError, true);
  const badSeat = await server.callTool("register_seat", { seat: "Not A Seat", role: "lead" });
  assert.equal(badSeat.isError, true);
  const badEvent = await server.callTool("record_event", { type: "birthday" });
  assert.equal(badEvent.isError, true);

  assert.equal(existsSync(ws.stateDir), false, "refused calls must not create any state");
  await server.close();
});
