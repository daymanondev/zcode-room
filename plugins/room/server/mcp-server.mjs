// Room MCP server — the room's out-of-band machinery (issues 01, 04).
//
// Speaks MCP over stdio (newline-delimited JSON-RPC 2.0) with seven tools:
//   post_message  {to, from, body}  — append one message to <to>'s box
//   read_mailbox  {seat}            — consume unread messages from <seat>'s box
//   register_seat {seat, role}      — record a seat in the registry
//   retire_seat   {seat}            — explicit retirement (terminal)
//   lookup_seats  {role?, state?}   — who holds which seat, plus room rules
//   record_event  {type, seat?, detail?} — append one closure-loop ledger line
//   read_ledger   {since_seq?}      — verified ledger read
//
// State layout under the room-state dir (default <cwd>/.room, override with
// ROOM_STATE_DIR):
//   mailbox/<seat>.jsonl   one append-only line per message, never rewritten
//   mailbox/<seat>.cursor  count of consumed messages, advanced by reads
//   registry.json          seats + the recorded room rules
//   ledger.jsonl           append-only, hash-chained closure-loop record
// Boxes are created by the first post; reading a seat with no box is a tool
// error. One write per line keeps concurrent posts from interleaving; cursor
// advance assumes the seat itself is the only reader of its box (full seat
// enforcement arrives with issue 11).
//
// The ledger vocabulary is closed (spec: Implementation Decisions): lifecycle
// lines (room_opened, lead_registered, peer_spawned, retired) are minted only
// by registry acts; the four loop lines (brief_sent, handoff_received,
// disposition, needs_human) arrive only through record_event. Append-only is
// structural (no tool rewrites earlier bytes) and detectable: each line's
// sha256 covers the line and its predecessor's hash, and read_ledger verifies
// the whole chain before presenting events.

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "room";
// Tracks the plugin version (plugin.json). 0.4.0 changes the MCP surface
// (issue 08): the one-supervisor arming rule went from advisory to enforced
// (register_seat refuses a second live supervisor, citing the live seat).
const SERVER_VERSION = "0.4.0";
// Latest revision the bundle is known to negotiate — all four 2024-10-07 …
// 2025-06-18 revisions appear in zcode.cjs 0.16.9 (grade B, bundle-read);
// unknown requests fall back to this one.
const LATEST_PROTOCOL_VERSION = "2025-06-18";
const KNOWN_PROTOCOL_VERSIONS = new Set([
  "2024-10-07",
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
]);

const SEAT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_BODY_BYTES = 65536;

// Identifies this server process so the one-supervisor arming can tell the
// arming session's own re-arm (idempotent) from a second session's arming
// attempt (refused). Load-bearing assumption (grade B, not directly
// observed for the restart half): the host launches one server process per
// session's MCP connection and keeps it for the session's life — pinned in
// plugins/room/README.md with the failure mode. That failure mode is safe:
// a mid-session server restart mints a new id and the same session's next
// arming is refused ("armed by another session"), forcing the explicit
// recover (Human retires, successor name arms) — the rule fails closed,
// never open. A record with no marker (pre-08 state) refuses the same way.
const INSTANCE_ID = randomBytes(8).toString("hex");

class ToolError extends Error {}
class ProtocolError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function resolveStateDir() {
  const override = process.env.ROOM_STATE_DIR;
  if (override && override.trim()) return resolve(override);
  // cwd is the workspace root: the manifest launches the server with
  // cwd = ${ZCODE_PROJECT_DIR}.
  return join(process.cwd(), ".room");
}

function mailboxDir(stateDir) {
  return join(stateDir, "mailbox");
}

function boxPath(stateDir, seat) {
  return join(mailboxDir(stateDir), `${seat}.jsonl`);
}

function cursorPath(stateDir, seat) {
  return join(mailboxDir(stateDir), `${seat}.cursor`);
}

function requireSeat(name, value) {
  if (typeof value !== "string" || !SEAT_PATTERN.test(value)) {
    throw new ToolError(
      `invalid seat name for '${name}': must be 1-64 chars of lowercase alphanumerics and dashes, starting alphanumeric`
    );
  }
}

function postMessage(stateDir, { to, from, body }) {
  requireSeat("to", to);
  requireSeat("from", from);
  if (typeof body !== "string" || body.length === 0) {
    throw new ToolError("body must be a non-empty string");
  }
  if (Buffer.byteLength(body, "utf8") > MAX_BODY_BYTES) {
    throw new ToolError(`body exceeds ${MAX_BODY_BYTES} bytes`);
  }
  const box = boxPath(stateDir, to);
  mkdirSync(mailboxDir(stateDir), { recursive: true });
  const existing = existsSync(box) ? readFileSync(box, "utf8") : "";
  const delivered = existing.split("\n").filter(Boolean).length;
  const message = {
    id: `${String(delivered + 1).padStart(6, "0")}-${randomBytes(3).toString("hex")}`,
    to,
    from,
    body,
    posted_at: new Date().toISOString(),
  };
  // O_APPEND keeps a single-line write atomic against concurrent posters.
  const fd = openSync(box, "a");
  try {
    writeFileSync(fd, JSON.stringify(message) + "\n");
  } finally {
    closeSync(fd);
  }
  return { posted: message };
}

function readMailbox(stateDir, { seat }) {
  requireSeat("seat", seat);
  const box = boxPath(stateDir, seat);
  if (!existsSync(box)) {
    throw new ToolError(`no mailbox for seat '${seat}'`);
  }
  const lines = readFileSync(box, "utf8").split("\n").filter(Boolean);
  const cursorFile = cursorPath(stateDir, seat);
  const consumedRaw = existsSync(cursorFile) ? parseInt(readFileSync(cursorFile, "utf8"), 10) : 0;
  const consumed = Number.isInteger(consumedRaw) && consumedRaw >= 0 ? consumedRaw : 0;
  const messages = lines.slice(consumed).map((line) => JSON.parse(line));
  if (messages.length > 0) {
    writeFileSync(cursorFile, String(lines.length));
  }
  return { messages };
}

// ---- Registry and ledger (issue 04) ----

const ROLES = ["supervisor", "lead", "peer"];
const SEAT_STATES = ["live", "retired"];
// Room rules carried in the registry so they are recorded, not folklore.
// The one-Supervisor rule is enforced at the arming act (issue 08):
// register_seat refuses a second live supervisor; refusing wrong-seat
// callers on the other tools is issue 11's.
const ROOM_RULES = [
  {
    id: "one-supervisor",
    text: "At most one live Supervisor per room.",
    status: "enforced",
    enforcement: "register_seat refuses a second arming (issue 08); wrong-seat refusal on other tools is issue 11",
  },
];
// The closed ledger vocabulary (spec). Lifecycle lines are minted only by
// registry acts (register_seat / retire_seat); record_event takes the rest.
const LEDGER_TYPES = [
  "room_opened",
  "lead_registered",
  "brief_sent",
  "peer_spawned",
  "handoff_received",
  "disposition",
  "needs_human",
  "retired",
];
const LOOP_TYPES = ["brief_sent", "handoff_received", "disposition", "needs_human"];
// Which lifecycle line a role's registration mints (supervisor registration
// only opens the room — the closed vocabulary has no supervisor event).
const ROLE_EVENT = { lead: "lead_registered", peer: "peer_spawned" };
const MAX_DETAIL_BYTES = 4096;

function registryPath(stateDir) {
  return join(stateDir, "registry.json");
}

function ledgerPath(stateDir) {
  return join(stateDir, "ledger.jsonl");
}

// Rules are code-owned: loadRegistry always re-derives them from ROOM_RULES.
// The disk copy exists so the record is visible without a tool call —
// editing it there does nothing.
function loadRegistry(stateDir) {
  const file = registryPath(stateDir);
  if (!existsSync(file)) return { rules: ROOM_RULES, seats: {} };
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  return { rules: ROOM_RULES, seats: parsed.seats ?? {} };
}

// Write-via-rename so a crash mid-write can never leave a torn registry.
// Read-modify-write is not locked: one writer at a time has held so far
// (the M0 Lead, then the Supervisor on its own); revisit before seats are
// registered concurrently (M0 retro finding 6).
function saveRegistry(stateDir, registry) {
  mkdirSync(stateDir, { recursive: true });
  const file = registryPath(stateDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(registry, null, 2) + "\n");
  renameSync(tmp, file);
}

function ledgerLines(stateDir) {
  const file = ledgerPath(stateDir);
  return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
}

// Append one event, chaining it to the current tail. The hash covers the
// event as written minus the hash field itself; the writer builds the object
// in a fixed key order and appends the hash last, so a verifier can recompute
// it from the parsed line (JSON.parse preserves key order).
function appendLedger(stateDir, { type, seat = null, detail = null }) {
  if (!LEDGER_TYPES.includes(type)) {
    throw new ToolError(`unknown ledger type '${type}'`);
  }
  mkdirSync(stateDir, { recursive: true });
  const lines = ledgerLines(stateDir);
  const prev = lines.length > 0 ? JSON.parse(lines[lines.length - 1]) : null;
  const event = {
    seq: lines.length + 1,
    type,
    at: new Date().toISOString(),
    seat,
    detail,
    prev: prev ? prev.hash : null,
  };
  event.hash = createHash("sha256").update(JSON.stringify(event)).digest("hex");
  const fd = openSync(ledgerPath(stateDir), "a");
  try {
    writeFileSync(fd, JSON.stringify(event) + "\n");
  } finally {
    closeSync(fd);
  }
  return event;
}

// Verify the chain and return the events that survive verification: seq must
// be contiguous from 1, each line's hash must match its content, and each
// prev must name the previous line's hash. A broken or edited line stops the
// trusted prefix there — everything after it chains from untrusted data.
function readLedger(stateDir) {
  let prevHash = null;
  let expectedSeq = 1;
  const events = [];
  for (const line of ledgerLines(stateDir)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return { events, verified: false, breakAt: expectedSeq };
    }
    const { hash, ...signed } = event;
    const recomputed = createHash("sha256").update(JSON.stringify(signed)).digest("hex");
    if (event.seq !== expectedSeq || event.prev !== prevHash || hash !== recomputed) {
      return { events, verified: false, breakAt: expectedSeq };
    }
    events.push(event);
    prevHash = hash;
    expectedSeq += 1;
  }
  return { events, verified: true, breakAt: null };
}

function registerSeat(stateDir, { seat, role }) {
  requireSeat("seat", seat);
  if (!ROLES.includes(role)) {
    throw new ToolError(`invalid role '${role}': must be one of ${ROLES.join(", ")}`);
  }
  const registry = loadRegistry(stateDir);
  const existing = registry.seats[seat];
  if (existing) {
    if (existing.state === "retired") {
      throw new ToolError(
        `seat '${seat}' is retired; retirement is terminal — a successor registers under a new seat name`
      );
    }
    if (existing.role !== role) {
      throw new ToolError(`seat '${seat}' is already registered with role '${existing.role}'`);
    }
    if (role === "supervisor" && existing.armed_by !== INSTANCE_ID) {
      throw new ToolError(
        `seat '${seat}' is the live supervisor, armed by another session (registered ${existing.registered_at}) — ` +
          `the one-supervisor rule is enforced: re-arming from a new session needs the Human to retire the seat first ` +
          `(retirement is explicit and terminal; a successor arms under a new name after)`
      );
    }
    return { registered: existing, already: true, ledger: [], rules: registry.rules };
  }
  if (role === "supervisor") {
    const liveSupervisor = Object.values(registry.seats).find(
      (candidate) => candidate.role === "supervisor" && candidate.state === "live"
    );
    if (liveSupervisor) {
      throw new ToolError(
        `one-supervisor rule (enforced): seat '${liveSupervisor.seat}' is already the live supervisor in this room ` +
          `(registered ${liveSupervisor.registered_at}). Retiring it is an explicit Human act; only then may a ` +
          `successor seat arm.`
      );
    }
  }
  const roomOpens = Object.keys(registry.seats).length === 0;
  const record = { seat, role, registered_at: new Date().toISOString(), state: "live", retired_at: null };
  if (role === "supervisor") record.armed_by = INSTANCE_ID;
  registry.seats[seat] = record;
  // Two files, no transaction: a crash between these writes leaves the
  // registry and ledger briefly inconsistent. Accepted for M0 (single
  // writer, tiny window); reconcile-on-read only if an audit question
  // demands it.
  saveRegistry(stateDir, registry);
  const ledger = [];
  if (roomOpens) ledger.push(appendLedger(stateDir, { type: "room_opened", seat }));
  if (ROLE_EVENT[role]) ledger.push(appendLedger(stateDir, { type: ROLE_EVENT[role], seat }));
  return { registered: record, already: false, ledger, rules: registry.rules };
}

function retireSeat(stateDir, { seat }) {
  requireSeat("seat", seat);
  const registry = loadRegistry(stateDir);
  const existing = registry.seats[seat];
  if (!existing) {
    throw new ToolError(`no seat '${seat}' in the registry`);
  }
  if (existing.state === "retired") {
    return { retired: existing, already: true, ledger: [] };
  }
  existing.state = "retired";
  existing.retired_at = new Date().toISOString();
  saveRegistry(stateDir, registry);
  return { retired: existing, already: false, ledger: [appendLedger(stateDir, { type: "retired", seat })] };
}

function lookupSeats(stateDir, { role, state } = {}) {
  if (role !== undefined && !ROLES.includes(role)) {
    throw new ToolError(`invalid role '${role}': must be one of ${ROLES.join(", ")}`);
  }
  if (state !== undefined && !SEAT_STATES.includes(state)) {
    throw new ToolError(`invalid state '${state}': must be one of ${SEAT_STATES.join(", ")}`);
  }
  const registry = loadRegistry(stateDir);
  let seats = Object.values(registry.seats);
  if (role !== undefined) seats = seats.filter((record) => record.role === role);
  if (state !== undefined) seats = seats.filter((record) => record.state === state);
  seats.sort((a, b) => (a.seat < b.seat ? -1 : 1));
  return { seats, rules: registry.rules };
}

function recordEvent(stateDir, { type, seat, detail }) {
  if (!LOOP_TYPES.includes(type)) {
    const hint = LEDGER_TYPES.includes(type)
      ? `'${type}' is a lifecycle line, minted by a registry act (register_seat / retire_seat)`
      : "the ledger vocabulary is closed";
    throw new ToolError(
      `cannot record '${type}': ${hint}; record_event takes ${LOOP_TYPES.join(", ")}`
    );
  }
  if (seat !== undefined) requireSeat("seat", seat);
  if (detail !== undefined) {
    if (typeof detail !== "string" || detail.length === 0) {
      throw new ToolError("detail must be a non-empty string when present");
    }
    if (Buffer.byteLength(detail, "utf8") > MAX_DETAIL_BYTES) {
      throw new ToolError(`detail exceeds ${MAX_DETAIL_BYTES} bytes`);
    }
  }
  return { recorded: appendLedger(stateDir, { type, seat: seat ?? null, detail: detail ?? null }) };
}

function readLedgerTool(stateDir, { since_seq } = {}) {
  let since = 0;
  if (since_seq !== undefined) {
    if (!Number.isInteger(since_seq) || since_seq < 0) {
      throw new ToolError("since_seq must be a non-negative integer");
    }
    since = since_seq;
  }
  const { events, verified, breakAt } = readLedger(stateDir);
  return {
    verified,
    ...(breakAt !== null ? { break_at: breakAt } : {}),
    events: events.filter((event) => event.seq > since),
  };
}

// One definition per tool: name, schema, and handler together, so the
// dispatcher and tools/list can never disagree about what exists.
const TOOL_DEFS = [
  {
    name: "post_message",
    description:
      "Post one message to a seat's mailbox (the room's out-of-band bus). " +
      "Use only where the harness offers no native channel: peer-to-peer " +
      "coordination and escalation upward. The box is created on first post.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Seat name of the recipient, e.g. peer-reviewer" },
        from: { type: "string", description: "Seat name of the sender, e.g. peer-engineer" },
        body: { type: "string", description: "Message body (plain text)" },
      },
      required: ["to", "from", "body"],
      additionalProperties: false,
    },
    handler: (stateDir, args) => postMessage(stateDir, args),
  },
  {
    name: "read_mailbox",
    description:
      "Read and consume the unread messages addressed to one seat. Returns " +
      "an error if the seat has no mailbox yet (nothing was ever posted to it).",
    inputSchema: {
      type: "object",
      properties: {
        seat: { type: "string", description: "Seat name whose mailbox to read, e.g. peer-reviewer" },
      },
      required: ["seat"],
      additionalProperties: false,
    },
    handler: (stateDir, args) => readMailbox(stateDir, args),
  },
  {
    name: "register_seat",
    description:
      "Record a seat in the room registry (role: supervisor, lead, or peer). " +
      "The first registration opens the room; registering a lead or peer also " +
      "mints its ledger line (lead_registered / peer_spawned). Re-registering " +
      "the same seat with the same role is an idempotent no-op within the " +
      "arming session. The one-supervisor rule is enforced: a second live " +
      "supervisor — another session re-arming the seat, or a new supervisor " +
      "seat — is refused citing the live seat; the recovery is the Human's " +
      "explicit retire, after which a successor name arms.",
    inputSchema: {
      type: "object",
      properties: {
        seat: { type: "string", description: "Seat name to register, e.g. lead or peer-engineer" },
        role: { type: "string", enum: ROLES, description: "Role the seat holds" },
      },
      required: ["seat", "role"],
      additionalProperties: false,
    },
    handler: (stateDir, args) => registerSeat(stateDir, args),
  },
  {
    name: "retire_seat",
    description:
      "Retire a seat by explicit act: marks it retired and mints the ledger " +
      "retired line. Retirement is terminal for that seat name; a successor " +
      "registers under a new name. Retiring an already-retired seat is a no-op.",
    inputSchema: {
      type: "object",
      properties: {
        seat: { type: "string", description: "Seat name to retire" },
      },
      required: ["seat"],
      additionalProperties: false,
    },
    handler: (stateDir, args) => retireSeat(stateDir, args),
  },
  {
    name: "lookup_seats",
    description:
      "Answer 'who holds which seat': registered seats with role and " +
      "live/retired state, plus the room's recorded rules (the one-supervisor " +
      "rule, enforced at the arming act: a second live supervisor is refused).",
    inputSchema: {
      type: "object",
      properties: {
        role: { type: "string", enum: ROLES, description: "Filter by role" },
        state: { type: "string", enum: SEAT_STATES, description: "Filter by seat state" },
      },
      additionalProperties: false,
    },
    handler: (stateDir, args) => lookupSeats(stateDir, args),
  },
  {
    name: "record_event",
    description:
      "Append one closure-loop line to the ledger: brief_sent, " +
      "handoff_received, disposition, or needs_human. Lifecycle lines " +
      "(room_opened, lead_registered, peer_spawned, retired) are minted only " +
      "by registry acts, never recorded here.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: LOOP_TYPES,
          description: "Which closure-loop event happened",
        },
        seat: { type: "string", description: "Seat the event concerns, e.g. the peer handed off" },
        detail: { type: "string", description: "Short audit note: brief reference, disposition outcome + reason, escalation choice" },
      },
      required: ["type"],
      additionalProperties: false,
    },
    handler: (stateDir, args) => recordEvent(stateDir, args),
  },
  {
    name: "read_ledger",
    description:
      "Read the ledger, verifying the hash chain first. Returns the verified " +
      "event prefix; a tampered or deleted line yields verified: false with " +
      "break_at naming the first untrusted sequence number.",
    inputSchema: {
      type: "object",
      properties: {
        since_seq: { type: "number", description: "Return only events with seq greater than this" },
      },
      additionalProperties: false,
    },
    handler: (stateDir, args) => readLedgerTool(stateDir, args),
  },
];

const TOOLS = TOOL_DEFS.map(({ name, description, inputSchema }) => ({
  name,
  description,
  inputSchema,
}));

function handleRequest(stateDir, request) {
  const { method, params } = request;
  switch (method) {
    case "initialize":
      return {
        protocolVersion: KNOWN_PROTOCOL_VERSIONS.has(params?.protocolVersion)
          ? params.protocolVersion
          : LATEST_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const def = TOOL_DEFS.find((tool) => tool.name === params?.name);
      if (!def) {
        throw new ProtocolError(-32602, `unknown tool: ${params?.name}`);
      }
      try {
        const result = def.handler(stateDir, params?.arguments ?? {});
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      } catch (error) {
        if (error instanceof ToolError) {
          return {
            content: [{ type: "text", text: error.message }],
            isError: true,
          };
        }
        throw error;
      }
    }
    default:
      throw new ProtocolError(-32601, `method not found: ${method}`);
  }
}

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + "\n");
}

// The plugin host (`zcode.cjs __zcode-plugin-host`) imports this module and
// calls the exported main() — the contract every official plugin's server
// follows. Tests spawn the file directly as a plain node script instead;
// at import time the host's argv[1] still points at zcode.cjs, so this
// guard runs main() only on direct spawn.
export function main() {
  const stateDir = resolveStateDir();
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request;
      try {
        request = JSON.parse(line);
      } catch {
        writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
        continue;
      }
      // Notifications (no id) get no response per JSON-RPC 2.0.
      if (request.id === undefined || request.id === null) continue;
      try {
        writeMessage({ jsonrpc: "2.0", id: request.id, result: handleRequest(stateDir, request) });
      } catch (error) {
        const code = error instanceof ProtocolError ? error.code : -32603;
        writeMessage({ jsonrpc: "2.0", id: request.id, error: { code, message: error.message } });
      }
    }
  });
  process.stdin.on("end", () => process.exit(0));
  // Never write anything but JSON-RPC to stdout; diagnostics go to stderr.
  console.error(`[${SERVER_NAME}] mailbox server ready (state dir: ${stateDir})`);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
