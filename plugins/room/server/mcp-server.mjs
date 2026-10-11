// Room mailbox MCP server — the room's out-of-band message bus (issue 01).
//
// Speaks MCP over stdio (newline-delimited JSON-RPC 2.0) with two tools:
//   post_message  {to, from, body}  — append one message to <to>'s box
//   read_mailbox  {seat}            — consume unread messages from <seat>'s box
//
// State layout under the room-state dir (default <cwd>/.room, override with
// ROOM_STATE_DIR):
//   mailbox/<seat>.jsonl   one append-only line per message, never rewritten
//   mailbox/<seat>.cursor  count of consumed messages, advanced by reads
// Boxes are created by the first post; reading a seat with no box is a tool
// error. One write per line keeps concurrent posts from interleaving; cursor
// advance assumes the seat itself is the only reader of its box (seat
// enforcement arrives with M2, issue 11).

import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "room";
const SERVER_VERSION = "0.1.0";
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
