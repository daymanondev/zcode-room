// heartbeat.mjs — `room heartbeat` (issue 10): the mechanical wake gate
// the Supervisor's */2 automation runs at every fire. Zero model calls,
// zero judgment: it reads the room state the MCP server and the lead
// wrapper write, and prints exactly one verdict for the woken Supervisor
// to act on (the procedure lives in the /slp skill).
//
// Verdicts (first word of the output):
//   orphaned — no live supervisor seat: the automation is a leftover; the
//              wake removes it where the host offers a delete tool and
//              otherwise self-flags (NEEDS-HUMAN, once per session).
//   quiet    — supervisor live, no unread escalations, no stalled leads.
//   action   — one section per finding, in this order: a ledger chain
//              break (audit alarm; stall math skipped — untrusted lines
//              must not drive a re-poke), unread escalations (peeked, NOT
//              consumed — the mailbox is consumed by read_mailbox only
//              after the relay has landed in chat, so a crashed wake turn
//              cannot lose an escalation), and stalled Leads.
//
// A Lead is stalled when its loop is open — briefs recorded since its last
// handoff_received — and the newest brief is older than the stall
// threshold (default: the wrapper's 30-min turn timeout plus margin; the
// completion notification for a real timeout arrives through the native
// path long before). Exactly one re-poke is eligible: the re-poke itself
// is a brief_sent whose detail begins "re-poke" (the string the /slp
// skill prescribes), so a second stall reads "already re-poked, needs
// Human" mechanically — the once-guarantee is the ledger, not a promise,
// and an answer-routing brief never spends the budget.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Mirrors the server's / tail's chain verification (mcp-server.mjs,
// room.mjs); duplicated to keep the CLI standalone — it must run from a
// plain shell, without the plugin host. Returns null while the chain
// holds and the seq of the first untrusted line once it breaks.
function chainBreakAt(events) {
  let prevHash = null;
  let expectedSeq = 1;
  for (const event of events) {
    const { hash, ...signed } = event;
    const recomputed = createHash("sha256").update(JSON.stringify(signed)).digest("hex");
    if (event.seq !== expectedSeq || event.prev !== prevHash || hash !== recomputed) {
      return expectedSeq;
    }
    prevHash = hash;
    expectedSeq += 1;
  }
  return null;
}

function parseJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

// Mirrors tail's preview (room.mjs, shorter cap here); duplicated for
// the same standalone-CLI reason as the chain check above.
function preview(text, max = 100) {
  const flat = String(text).replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

// Unread messages for a seat without advancing its cursor: the consuming
// read (read_mailbox) belongs to the wake, after the relay. A missing box
// or cursor reads as empty; a cursor past the box clamps (corrupt state
// surfaces no phantom escalations).
function peekMailbox(stateDir, seat) {
  const box = join(stateDir, "mailbox", `${seat}.jsonl`);
  if (!existsSync(box)) return [];
  const messages = parseJsonl(box);
  const cursor = join(stateDir, "mailbox", `${seat}.cursor`);
  const consumed = existsSync(cursor) ? parseInt(readFileSync(cursor, "utf8"), 10) : 0;
  const offset = Number.isInteger(consumed) && consumed >= 0 ? Math.min(consumed, messages.length) : 0;
  return messages.slice(offset);
}

// Briefs recorded for the seat since its newest handoff_received — the
// open loop. Empty means closed (or never dispatched): not stalled.
// Returns the briefs plus whether any of them is a re-poke (detail
// begins "re-poke", the string the /slp skill prescribes for re-poke
// briefs) — only a re-poke spends the once-budget: an answer-routing
// brief is a different resume and must not read as "already re-poked".
function openLoop(events, seat) {
  const briefs = [];
  for (const event of events) {
    if (event.seat !== seat) continue;
    if (event.type === "handoff_received") briefs.length = 0;
    else if (event.type === "brief_sent") briefs.push(event);
  }
  const rePoked = briefs.some((brief) => String(brief.detail ?? "").trim().startsWith("re-poke"));
  return { briefs, rePoked };
}

export function runHeartbeatCheck({
  stateDir,
  stallAfterMs = 35 * 60 * 1000,
  now = () => Date.now(),
  write = (line) => process.stdout.write(`${line}\n`),
}) {
  if (!existsSync(stateDir)) {
    write(`orphaned: no room state at ${stateDir}`);
    return "orphaned";
  }
  const registryFile = join(stateDir, "registry.json");
  if (!existsSync(registryFile)) {
    write(`orphaned: no registry at ${registryFile}`);
    return "orphaned";
  }
  const registry = JSON.parse(readFileSync(registryFile, "utf8"));
  const seats = Object.values(registry.seats ?? {});
  const supervisors = seats.filter((seat) => seat.role === "supervisor" && seat.state === "live");
  if (supervisors.length !== 1) {
    write(
      `orphaned: no live supervisor seat in ${stateDir}` +
        (supervisors.length > 1 ? " (registry shows more than one — tampered?)" : "")
    );
    return "orphaned";
  }
  const supervisor = supervisors[0].seat;

  // Ledger: verified events only. A break is itself a finding (audit
  // alarm) and disqualifies the stall math that depends on the lines.
  let breakAt = null;
  let events = [];
  const ledgerFile = join(stateDir, "ledger.jsonl");
  if (existsSync(ledgerFile)) {
    events = parseJsonl(ledgerFile);
    breakAt = chainBreakAt(events);
  }
  const trusted = breakAt === null ? events : events.slice(0, breakAt - 1);

  const escalations = peekMailbox(stateDir, supervisor);

  const stalled = [];
  if (breakAt === null) {
    const leadsFile = join(stateDir, "leads.json");
    const leads = existsSync(leadsFile) ? JSON.parse(readFileSync(leadsFile, "utf8")) : {};
    for (const seat of seats) {
      if (seat.role !== "lead" || seat.state !== "live") continue;
      const { briefs, rePoked } = openLoop(trusted, seat.seat);
      if (briefs.length === 0) continue;
      const newest = briefs[briefs.length - 1];
      const ageMs = now() - Date.parse(newest.at);
      if (!(ageMs >= stallAfterMs)) continue;
      const session = leads[seat.seat]?.sessionId ?? null;
      stalled.push({
        seat: seat.seat,
        seq: newest.seq,
        ageMin: Math.max(0, Math.floor(ageMs / 60000)),
        briefCount: briefs.length,
        rePoked,
        session,
      });
    }
  }

  if (escalations.length === 0 && stalled.length === 0 && breakAt === null) {
    write(`quiet: supervisor ${supervisor} live, no unread escalations, no stalled leads`);
    return "quiet";
  }

  write(`action: supervisor ${supervisor}`);
  if (breakAt !== null) {
    write(`ledger: chain break at #${breakAt} — stall math skipped (read_ledger confirms)`);
  }
  for (const message of escalations) {
    write(`escalation ${message.id} from ${message.from} posted ${message.posted_at}: ${preview(message.body)}`);
  }
  for (const lead of stalled) {
    const base =
      `stalled ${lead.seat}: brief #${lead.seq} open ${lead.ageMin}m, ` +
      `${plural(lead.briefCount, "brief")} since last handoff, session ${lead.session ?? "none"}`;
    if (!lead.session) {
      write(`${base} → needs Human, no session to resume`);
    } else if (!lead.rePoked) {
      write(`${base} → re-poke eligible`);
    } else {
      write(`${base} → already re-poked, needs Human`);
    }
  }
  return "action";
}
