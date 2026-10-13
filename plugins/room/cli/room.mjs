#!/usr/bin/env node
// room — the SLP room's terminal wrapper (issue 04: `tail`; issue 07:
// `doctor`, `lead`; issue 10: `heartbeat`).
//
// `tail` observes the room-state directory the MCP server writes.
// `doctor` re-verifies the pinned private ZCode surface (zero model
// calls). `lead` spawns and re-pokes headless Lead sessions through the
// app-server control plane, playing the protocol host role. `heartbeat`
// is the mechanical wake gate the Supervisor's */2 automation runs.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { runDoctor } from "./doctor.mjs";
import { runHeartbeatCheck } from "./heartbeat.mjs";
import { LEAD_USAGE, LeadUsageError, runLeadCommand } from "./lead.mjs";

const USAGE = `room — the SLP room's terminal wrapper

Usage:
  room doctor                    Re-verify the pinned private surface
                                  (binary hash + version, catalog revision
                                  gate, credentials, live entitlement path)
                                  and report go/no-go. Zero model calls.
  room heartbeat [--stall-after-ms <n>]
                                  [--state-dir <dir>]
                                  The wake gate the Supervisor's */2
                                  automation runs: one verdict (orphaned |
                                  quiet | action) over the registry, the
                                  verified ledger, the supervisor mailbox
                                  (peeked, not consumed), and open Lead
                                  loops. Zero model calls; the acting
                                  procedure lives in the /slp skill.
  room lead …                    Dispatch and re-poke headless Lead
                                  sessions ("room lead" for details).
  room tail [--state-dir <dir>]  Stream ledger and mailbox events live:
                                  existing history first, then new events
                                  as the room runs. Ctrl-C to stop.

The state dir comes from --state-dir, else ROOM_STATE_DIR, else <cwd>/.room —
the same resolution the MCP server uses. Looking never disturbs: tail and
heartbeat only read.
`;

const POLL_MS = 250;
const PREVIEW_CHARS = 160;

function parseArgs(argv) {
  const [subcommand, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "--state-dir") {
      if (i + 1 >= rest.length) throw new Error("--state-dir needs a value");
      options.stateDir = rest[i + 1];
      i += 1;
    } else if (rest[i] === "--stall-after-ms") {
      if (i + 1 >= rest.length) throw new Error("--stall-after-ms needs a value");
      const n = Number(rest[i + 1]);
      if (!Number.isInteger(n) || n < 0) throw new Error("--stall-after-ms must be a non-negative integer (ms)");
      options.stallAfterMs = n;
      i += 1;
    } else {
      throw new Error(`unknown option: ${rest[i]}`);
    }
  }
  return { subcommand, options };
}

// Mirrors the server's resolution (plugins/room/server/mcp-server.mjs);
// duplicated so the CLI stays standalone — it must run from a plain shell,
// without the plugin host.
function resolveStateDir(override) {
  if (override) return resolve(override);
  const env = process.env.ROOM_STATE_DIR;
  if (env && env.trim()) return resolve(env);
  return join(process.cwd(), ".room");
}

function ledgerFile(stateDir) {
  return join(stateDir, "ledger.jsonl");
}

function mailboxBoxes(stateDir) {
  const dir = join(stateDir, "mailbox");
  return existsSync(dir)
    ? readdirSync(dir)
        .filter((entry) => entry.endsWith(".jsonl"))
        .sort()
    : [];
}

function clock(iso) {
  return `${iso.slice(11, 19)}`;
}

// One scannable line: collapse whitespace, cap length.
function preview(text, max = PREVIEW_CHARS) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

// Incremental ledger-chain verification, mirroring the server's read_ledger:
// an honest tail must not render tampered lines as fact. Lines after a break
// print with a !! marker; read_ledger remains the authoritative verdict.
function makeChain() {
  return { expectedSeq: 1, prevHash: null, brokenAt: null };
}

function checkChain(chain, event) {
  if (chain.brokenAt !== null) return false;
  const { hash, ...signed } = event;
  const recomputed = createHash("sha256").update(JSON.stringify(signed)).digest("hex");
  if (event.seq !== chain.expectedSeq || event.prev !== chain.prevHash || hash !== recomputed) {
    chain.brokenAt = chain.expectedSeq;
    return false;
  }
  chain.prevHash = hash;
  chain.expectedSeq += 1;
  return true;
}

function renderLedger(event, trusted) {
  const parts = [clock(event.at), trusted ? "ledger" : "!! ledger", `#${String(event.seq).padStart(6, "0")}`, event.type];
  if (event.seat) parts.push(`seat=${event.seat}`);
  if (event.detail) parts.push(preview(event.detail));
  return parts.join("  ");
}

function ledgerRenderer(chain) {
  return (event) => {
    const before = chain.brokenAt;
    const trusted = checkChain(chain, event);
    const line = renderLedger(event, trusted);
    if (!trusted && before === null) {
      return `!! ledger chain break at #${event.seq ?? "?"} — this and later ledger lines are untrusted (read_ledger confirms)\n${line}`;
    }
    return line;
  };
}

function renderMail(message) {
  return [clock(message.posted_at), "mail", `${message.from} → ${message.to}`, preview(message.body)].join("  ");
}

// Read every source once, print history in true time order (ledger and
// mailbox are separate files), and hand back the byte offsets each read
// consumed — so the follow loop starts exactly where history ended.
function prime(stateDir, chain) {
  const renderLedgerLine = ledgerRenderer(chain);
  const events = [];
  const offsets = new Map();

  const ingest = (path, isLedger) => {
    if (!existsSync(path)) return;
    const buf = readFileSync(path);
    // Same rule as the follow loop: consume only through the last complete
    // line; a trailing partial line is a write in flight.
    const lastNewline = buf.lastIndexOf(0x0a);
    if (lastNewline === -1) return;
    offsets.set(path, lastNewline + 1);
    for (const line of buf.subarray(0, lastNewline).toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      let parsed;
      try {
        parsed = JSON.parse(line);
      } catch {
        if (isLedger) {
          // An unparseable ledger line cannot verify, so it breaks the chain.
          const seq = chain.brokenAt ?? chain.expectedSeq;
          chain.brokenAt ??= chain.expectedSeq;
          events.push({ ts: 0, render: `!! unparseable ledger line (break at #${seq}): ${preview(line)}` });
        }
        // Unparseable mailbox lines are skipped — no timestamp to place them.
        continue;
      }
      const ts = isLedger ? Date.parse(parsed.at) : Date.parse(parsed.posted_at);
      events.push({ ts: ts || 0, render: isLedger ? renderLedgerLine(parsed) : renderMail(parsed) });
    }
  };

  ingest(ledgerFile(stateDir), true);
  for (const entry of mailboxBoxes(stateDir)) {
    ingest(join(stateDir, "mailbox", entry), false);
  }
  events.sort((a, b) => a.ts - b.ts);
  return { renders: events.map((event) => event.render), offsets };
}

function runTail(stateDir) {
  const chain = makeChain();
  let offsets = new Map(); // file path -> bytes already printed

  const drainFile = (path, render) => {
    if (!existsSync(path)) return;
    const size = statSync(path).size;
    const seen = offsets.get(path) ?? 0;
    if (size <= seen) return;
    const chunk = readFileSync(path).subarray(seen, size);
    // Consume only through the last complete line: the writer appends
    // whole lines, so a prefix without a trailing newline is a write in
    // flight — leave it for the next poll.
    const lastNewline = chunk.lastIndexOf(0x0a);
    if (lastNewline === -1) return;
    for (const line of chunk.subarray(0, lastNewline).toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        process.stdout.write(`${render(JSON.parse(line))}\n`);
      } catch {
        process.stdout.write(`unparseable line in ${path}: ${preview(line)}\n`);
      }
    }
    offsets.set(path, seen + lastNewline + 1);
  };

  const drain = () => {
    drainFile(ledgerFile(stateDir), ledgerRenderer(chain));
    for (const entry of mailboxBoxes(stateDir)) {
      drainFile(join(stateDir, "mailbox", entry), renderMail);
    }
  };

  if (!existsSync(stateDir)) {
    process.stdout.write(`no room state at ${stateDir} yet — waiting for the room to open\n`);
  } else {
    const primed = prime(stateDir, chain);
    offsets = primed.offsets;
    for (const line of primed.renders) process.stdout.write(`${line}\n`);
  }

  const timer = setInterval(() => {
    if (!existsSync(stateDir)) return;
    drain();
  }, POLL_MS);
  process.on("SIGINT", () => {
    clearInterval(timer);
    process.stdout.write("\n");
    process.exit(0);
  });
  // The timer is the loop holder: a tail runs until Ctrl-C. If stdout closed
  // under us (piped to head), die quietly instead of throwing EPIPE.
  process.stdout.on("error", (error) => {
    if (error.code === "EPIPE") process.exit(0);
    throw error;
  });
}

function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  if (subcommand === "doctor") {
    if (rest.length > 0) {
      process.stderr.write(`doctor takes no arguments\n\n${USAGE}`);
      process.exit(2);
    }
    runDoctor()
      .then((go) => process.exit(go ? 0 : 1))
      .catch((error) => {
        process.stderr.write(`doctor failed: ${error.message}\n`);
        process.exit(1);
      });
    return;
  }
  if (subcommand === "lead") {
    runLeadCommand(rest, { resolveStateDir })
      .then(() => process.exit(0))
      .catch((error) => {
        process.stderr.write(`${error.message}\n\n${LEAD_USAGE}`);
        process.exit(error instanceof LeadUsageError ? 2 : 1);
      });
    return;
  }
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    process.exit(2);
  }
  if (parsed.subcommand === "tail") {
    runTail(resolveStateDir(parsed.options.stateDir));
    return;
  }
  if (parsed.subcommand === "heartbeat") {
    try {
      runHeartbeatCheck({
        stateDir: resolveStateDir(parsed.options.stateDir),
        stallAfterMs: parsed.options.stallAfterMs,
      });
    } catch (error) {
      process.stderr.write(`heartbeat failed: ${error.message}\n`);
      process.exit(1);
    }
    return;
  }
  process.stdout.write(USAGE);
  process.exit(subcommand === undefined || ["--help", "-h", "help"].includes(subcommand) ? 0 : 2);
}

main();
