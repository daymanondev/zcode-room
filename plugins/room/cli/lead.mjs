// lead.mjs — `room lead new|send|list` (issue 07): spawn and re-poke
// headless Lead sessions through the app-server control plane, playing
// the host role (entitlement push + per-request header replies).
//
// `new` prepends the LEAD contract verbatim to the brief, runs exactly
// one turn, prints the Lead's final message as the report, and records
// the session id under the room state dir for resume. `send` re-pokes
// the same session in a fresh process — sessions persist only after
// their first completed turn (observed, grade A), so resume is the
// context-full path for a stalled or continuing Lead.
//
// Model selection (issue 09): the committed room config
// (<state-dir>/room.json) declares the lead role's default lane; the
// spawn applies it with session/setModel right after create — spawn-time
// selection only, resume keeps the session's lane. `--model` overrides
// the default for one dispatch without touching the config (validated
// against the role's declared menu). With neither, the spawn keeps
// whatever the registry resolved at create.
//
// Permission posture: the session is set to yolo — headless runs have no
// human to approve prompts, and a permission request reaching the host
// is denied loudly by the client (fail closed). The contract is the real
// guardrail; seat enforcement lands with M2 (issue 11).

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { AppServerClient, ProtocolError } from "./appserver.mjs";
import { formatModelWithLevel, loadRoomConfig, resolveModelSelection, wireModelFor } from "./config.mjs";
import { PINS, findActiveCatalog, launchAppServer, loadCodingPlanApiKey, readAppVersion } from "./pins.mjs";

// The default revision resolver: an explicit ROOM_BUILTIN_REVISION
// override (test/escape-hatch seam, same family as ROOM_ZCODE_APP), else
// locate the active builtin catalog for the installed app and hash its
// resolved path (pins.mjs formula).
function defaultResolveRevision() {
  if (process.env.ROOM_BUILTIN_REVISION) return { revisionString: process.env.ROOM_BUILTIN_REVISION };
  return findActiveCatalog({ appVersion: readAppVersion(PINS.appPath) });
}

const LEAD_CONTRACT = new URL("../contracts/LEAD.md", import.meta.url).pathname;
// Mirrors the server's seat pattern (mcp-server.mjs); duplicated to keep
// the CLI standalone.
const SEAT_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const DEFAULT_TURN_TIMEOUT_MS = 30 * 60 * 1000;

// Usage-class failures (bad invocation) exit 2 through room.mjs, matching
// the tail verb's convention; runtime failures exit 1.
export class LeadUsageError extends Error {}

export const LEAD_USAGE = `room lead — dispatch and re-poke headless Lead sessions

Usage:
  room lead new <seat> --workspace <dir> --brief <file|->
      [--model <providerId/modelId>] [--timeout-ms <n>] [--state-dir <dir>]
      Spawn a fresh Lead: LEAD contract + brief in, final report out,
      session id recorded for resume. The lane comes from the lead role's
      default in <state-dir>/room.json; --model overrides it for this one
      dispatch (must be on the role's menu, when one is declared).
  room lead send <seat> --message <file|-> [--timeout-ms <n>] [--state-dir <dir>]
      Re-poke a recorded Lead: resumes its session with full context
      (and its spawn-time lane).
  room lead list [--state-dir <dir>]
      Show recorded Lead sessions.
`;

function leadsFile(stateDir) {
  return join(stateDir, "leads.json");
}

function loadLeads(stateDir) {
  const file = leadsFile(stateDir);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
}

// Wrapper-owned room state, written atomically like the registry. The
// MCP server does not read this file; it is the wrapper's durable map
// from seat to live session id.
function saveLeads(stateDir, leads) {
  mkdirSync(stateDir, { recursive: true });
  writeFileSync(`${leadsFile(stateDir)}.tmp`, `${JSON.stringify(leads, null, 2)}\n`);
  renameSync(`${leadsFile(stateDir)}.tmp`, leadsFile(stateDir));
}

// leads.json updates are read-modify-write, and the M2 shape runs
// parallel Lead dispatches against one state dir — the issue 09 live
// run caught two concurrent `room lead new` processes clobbering each
// other's records (each held its copy for the whole turn). The fix:
// serialize every RMW through a lock dir (mkdir is atomic), with a
// stale breakout for a crashed holder. The window shrinks from
// minutes to milliseconds and the outcome becomes correct at any
// interleaving.
const LEADS_LOCK_NAME = "leads.lock";
const LEADS_LOCK_RETRY_MS = 25;
const LEADS_LOCK_TIMEOUT_MS = 15000;
const LEADS_LOCK_STALE_MS = 10 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function updateLeads(stateDir, mutate) {
  const lockPath = join(stateDir, LEADS_LOCK_NAME);
  mkdirSync(stateDir, { recursive: true });
  const deadline = Date.now() + LEADS_LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      mkdirSync(lockPath);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let stale = false;
      try {
        stale = Date.now() - statSync(lockPath).mtimeMs > LEADS_LOCK_STALE_MS;
      } catch {
        stale = false; // vanished between mkdir and stat — retry
      }
      if (stale) {
        rmSync(lockPath, { recursive: true, force: true });
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(`timeout (${LEADS_LOCK_TIMEOUT_MS}ms) waiting for the ${LEADS_LOCK_NAME} lock — another wrapper may be stuck; see ${lockPath}`);
      }
      await sleep(LEADS_LOCK_RETRY_MS);
    }
  }
  try {
    const leads = loadLeads(stateDir);
    mutate(leads);
    saveLeads(stateDir, leads);
  } finally {
    rmSync(lockPath, { recursive: true, force: true });
  }
}

function readInput(path) {
  if (path === "-") {
    return readFileSync(0, "utf8");
  }
  const file = isAbsolute(path) ? path : resolve(process.cwd(), path);
  return readFileSync(file, "utf8");
}

function parseLeadArgs(argv) {
  const [verb, ...rest] = argv;
  const options = { verb };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = () => {
      if (i + 1 >= rest.length) throw new Error(`${arg} needs a value`);
      i += 1;
      return rest[i];
    };
    if (arg === "--workspace") options.workspace = next();
    else if (arg === "--brief") options.brief = next();
    else if (arg === "--message") options.message = next();
    else if (arg === "--model") options.model = next();
    else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(next());
      if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error("--timeout-ms must be a positive integer");
    } else if (arg === "--state-dir") options.stateDir = next();
    else if (arg.startsWith("--")) throw new Error(`unknown option: ${arg}`);
    else if (!options.seat) options.seat = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  return options;
}

function composePayload({ contract, seat, workspace, brief }) {
  return `${contract}

---

# Dispatch (room wrapper)

Seat: ${seat}
Workspace: ${workspace}
Turn: 1 (fresh session)

You are running headless, spawned by \`room lead new\`. The contract above
governs you; the additions below describe this dispatch surface only:

- Your input this turn is the brief at the bottom; your final message
  this turn is the report the dispatcher reads back. Close it against the
  brief's handoff contract.
- NEEDS-HUMAN lines travel inside that final report; the dispatcher
  relays them to the Human.
- The room's mailbox and ledger MCP tools are available if this workspace
  carries the room plugin; native channels remain the first choice.

# Brief

${brief}
`;
}

// Observed entry shape (live, 2026-10-12, 3.15.1): {info: {role, time:
// {created, completed}, finish, tokens, …}, parts: [{type: "text", text},
// {type: "step-start"}, …]}. The wrapper keeps the older flat shapes as
// defensive fallbacks and never loses the report: an unrecognized shape
// falls back to the raw tail.
function entryRole(entry) {
  return entry?.info?.role ?? entry?.role ?? entry?.author;
}

function entryText(entry) {
  const parts = entry?.parts ?? entry?.content ?? entry?.text;
  if (typeof parts === "string") return parts;
  if (Array.isArray(parts)) {
    return parts
      .map((part) => (typeof part === "string" ? part : part?.type === "text" && typeof part.text === "string" ? part.text : null))
      .filter(Boolean)
      .join("\n");
  }
  return null;
}

export function extractFinalReport(messages) {
  const entry = finalAssistantEntry(messages);
  return entry ? entryText(entry)?.trim() ?? null : null;
}

// The turn-end signal on this surface: sessions deliver streaming
// session/event notifications but NO turn.* methods to subscribers
// (observed live — the turn completes, the report persists, nothing
// arrives). The durable end state is the turn's final assistant entry in
// session/messages — final meaning finish "stop": mid-turn entries also
// carry time.completed once they yield to tool calls (observed: the
// read-preamble completes with finish "tool-calls" long before the turn
// ends). A turn.* notification, if one ever arrives, only accelerates
// the same verdict.
const TURN_POLL_MS = 2000;
// The created timestamp comes from the child's clock; same machine, but
// allow a little skew so a just-started turn's entry is not missed.
const CLOCK_GRACE_MS = 2000;

function completedAssistantSince(messages, sinceMs) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i];
    if (entryRole(entry) !== "assistant") continue;
    const time = entry?.info?.time ?? {};
    if (time.created !== undefined && time.created < sinceMs - CLOCK_GRACE_MS) break; // older turn — stop scanning
    if (entry?.info?.finish === "stop") return entry; // the turn's final reply
    if (entry?.info?.finish === "error") return entry; // failed turn — caller reports it
  }
  return null;
}

async function driveTurn({ client, sessionId, content, timeoutMs, write }) {
  const sendStartedAt = Date.now();
  let notified = null;
  const turnEnd = client.waitForTurnEnd(sessionId, timeoutMs + TURN_POLL_MS);
  turnEnd.then(
    (outcome) => {
      notified = outcome;
    },
    () => {} // the poll loop owns the deadline; never let this reject unhandled
  );
  await client.request("session/send", { sessionId, content });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await Promise.race([sleep(TURN_POLL_MS), turnEnd.catch(() => {})]);
    if (notified) {
      write(compactNotification({ method: notified.method, params: notified.params }));
      if (notified.method === "turn.failed") {
        throw new Error(`turn failed on ${sessionId}${notified.params?.error ? `: ${JSON.stringify(notified.params.error).slice(0, 300)}` : ""}`);
      }
      return { method: notified.method, params: notified.params };
    }
    const { messages } = await client.request("session/messages", { sessionId }).catch(() => ({ messages: [] }));
    const entry = completedAssistantSince(messages ?? [], sendStartedAt);
    if (entry) {
      if (entry?.info?.finish === "error") {
        throw new Error(`turn failed on ${sessionId} (assistant entry finish=error)`);
      }
      return {
        method: "turn.completed",
        params: { sessionId, via: "messages", finish: entry?.info?.finish ?? null, tokens: entry?.info?.tokens ?? null },
      };
    }
  }
  throw new Error(
    `timeout (${timeoutMs}ms) waiting for turn end on ${sessionId}. No completed assistant reply either — ` +
      `the server usually names the cause in its consolidated log: grep ${sessionId} ~/.zcode/cli/log/zcode-$(date +%F).jsonl`
  );
}

function compactNotification(notification) {
  const detail = notification.params ? JSON.stringify(notification.params) : "";
  const flat = detail.replace(/\s+/g, " ");
  return `[event] ${notification.method}${flat ? ` ${flat.slice(0, 120)}` : ""}`;
}

// Per-token telemetry floods a live turn (observed: 2000+ v4/telemetry
// events for one short turn) — drop it from the progress stream.
const BORING_NOTIFICATIONS = [
  /^v4\/telemetry/,
  /^process\//,
  /^computer-use\//,
  /^startup\/storageState$/,
];

// The final assistant entry, searched from the newest: the same entry
// that yields the report also carries the turn's token usage
// (info.tokens) — the usage evidence leads.json records.
function finalAssistantEntry(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const entry = messages[i];
    if (entryRole(entry) !== "assistant") continue;
    const body = entryText(entry);
    if (body && body.trim()) return entry;
  }
  return null;
}

async function printReport({ client, sessionId, write }) {
  const { messages } = await client.request("session/messages", { sessionId });
  const entry = finalAssistantEntry(messages ?? []);
  const report = entry ? entryText(entry)?.trim() ?? null : null;
  if (report === null) {
    write(`!! could not extract the final assistant message; raw tail of session/messages:`);
    write(JSON.stringify((messages ?? []).slice(-4), null, 2));
    return { report, messages, tokens: null };
  }
  return { report, messages, tokens: entry?.info?.tokens ?? null };
}

function notFoundHint(error, sessionId) {
  if (error instanceof ProtocolError && /Session not found/i.test(error.payload?.message ?? error.message)) {
    return `session ${sessionId} is not in the store — sessions persist only after their first completed turn. If the first turn never completed, the session is gone: dispatch a new seat.`;
  }
  return null;
}

// One shared host-role session setup: entitlement push, then create-or-
// resume, then spawn-time model selection (issue 09: session/setModel,
// create path only — resume keeps the session's lane), then yolo +
// subscribe. Returns the client and session row.
async function openSession({ launch, loadKey, resolveRevision, kind, workspace, sessionId, model }) {
  const key = loadKey();
  const client = new AppServerClient({
    launch: launch ?? launchAppServer(),
    apiKey: key.apiKey,
    notify: (notification) => {
      if (BORING_NOTIFICATIONS.some((pattern) => pattern.test(notification.method ?? ""))) return;
      process.stderr.write(`${compactNotification(notification)}\n`);
    },
  });
  await client.start();
  try {
    const catalog = resolveRevision();
    await client.pushEntitlement({ revisionString: catalog.revisionString, providerId: key.providerId });
    let session;
    if (kind === "resume") {
      const result = await client.request("session/resume", { sessionId });
      session = result?.session;
    } else {
      const result = await client.request("session/create", { workspace: { workspacePath: workspace, workspaceKey: workspace } });
      session = result?.session;
      if (model) {
        // Wire shape (A live + B bundle-read, 2026-10-13): strict
        // {providerId, modelId, options: {reasoningLevel}} — a bare ref is
        // refused with "Reasoning level is required". Without an explicit
        // $level in the config, the level is the model's own defaultLevel
        // from the registry's available list. A lane the registry does not
        // hold fails here, before any turn spends tokens.
        const { wireModel, reasoningLevel } = wireModelFor(model, result?.settings?.model?.available);
        // persistAsWorkspaceLastUsed defaults true on the surface; a
        // headless dispatch must not write its lane into the workspace's
        // last-used-model state — that belongs to the Human's own
        // sessions in this workspace.
        await client.request("session/setModel", { sessionId: session.sessionId, model: wireModel, persistAsWorkspaceLastUsed: false });
        session = { ...session, model: reasoningLevel ? { ...model, reasoningLevel } : model };
      }
    }
    if (!session?.sessionId) throw new Error(`no sessionId in ${kind} result: ${JSON.stringify(session ?? {}).slice(0, 200)}`);
    await client.request("session/setMode", { sessionId: session.sessionId, mode: "yolo" });
    await client.request("session/subscribe", { sessionId: session.sessionId, deliveryKind: "desktop-continuous" });
    return { client, session };
  } catch (error) {
    await client.close().catch(() => {});
    throw error;
  }
}

function duplicateSeatMessage(seat, sessionId) {
  return `seat '${seat}' already has session ${sessionId} recorded — re-poke it with 'room lead send ${seat}', or dispatch a new seat`;
}

// The post-turn record update, shared by new and send: bump the turn
// count, stamp activity, and land the turn's usage and report preview.
function completeTurn(map, seat, { tokens, report }) {
  Object.assign(map[seat], {
    turns: map[seat].turns + 1,
    lastActivityAt: new Date().toISOString(),
    lastTurnTokens: tokens,
    lastReport: report ? report.slice(0, 200) : null,
  });
}

export async function runLeadNew(options) {
  const {
    seat,
    workspace: workspaceArg,
    brief,
    stateDir,
    timeoutMs = DEFAULT_TURN_TIMEOUT_MS,
    launch,
    loadKey = loadCodingPlanApiKey,
    resolveRevision = defaultResolveRevision,
    contractPath = LEAD_CONTRACT,
  } = options;
  if (!seat || !SEAT_PATTERN.test(seat)) {
    throw new LeadUsageError(`invalid seat '${seat}': must be 1-64 chars of lowercase alphanumerics and dashes, starting alphanumeric`);
  }
  const workspace = resolve(workspaceArg);
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
    throw new Error(`workspace ${workspace} is not an existing directory — the dispatcher prepares worktrees, the wrapper does not create them`);
  }
  const briefText = readInput(brief);
  if (!briefText.trim()) throw new Error("brief is empty");
  const contract = readFileSync(contractPath, "utf8");
  const leads = loadLeads(stateDir);
  if (leads[seat]) {
    throw new Error(duplicateSeatMessage(seat, leads[seat].sessionId));
  }
  // Lane selection happens before anything is spent: a bad config or a
  // bad override fails the dispatch with no session minted. A bad
  // --model is a bad invocation (usage, exit 2); a bad config file is a
  // runtime failure (exit 1).
  const config = loadRoomConfig(stateDir);
  let selection;
  try {
    selection = resolveModelSelection({ config, role: "lead", override: options.model });
  } catch (error) {
    throw new LeadUsageError(error.message);
  }
  const { model, source } = selection;

  const payload = composePayload({ contract, seat, workspace, brief: briefText.trim() });
  const { client, session } = await openSession({ launch, loadKey, resolveRevision, kind: "create", workspace, model });
  const write = (line) => process.stdout.write(`${line}\n`);
  try {
    const record = {
      seat,
      sessionId: session.sessionId,
      workspace,
      model: session.model ?? null,
      modelSource: source,
      createdAt: new Date().toISOString(),
      turns: 0,
      lastActivityAt: new Date().toISOString(),
      lastTurnTokens: null,
      lastReport: null,
    };
    // Durable before the turn: even a hung first turn leaves the operator
    // the session id (though only a completed turn makes it resumable).
    // Under the lock — a concurrent dispatch to another seat must not be
    // clobbered by this one's copy of the map.
    await updateLeads(stateDir, (map) => {
      if (map[seat]) throw new Error(duplicateSeatMessage(seat, map[seat].sessionId));
      map[seat] = record;
    });

    write(
      `session ${session.sessionId} — model ${session.model ? formatModelWithLevel(session.model) : "(none resolved)"}` +
        `${source === "config" ? " (config default)" : source === "override" ? " (--model override)" : ""}, turn 1 running`
    );
    const outcome = await driveTurn({ client, sessionId: session.sessionId, content: payload, timeoutMs, write });
    const { report, tokens } = await printReport({ client, sessionId: session.sessionId, write });

    await updateLeads(stateDir, (map) => completeTurn(map, seat, { tokens, report }));

    write(`--- report (session ${session.sessionId}, ${outcome.method})`);
    if (report) write(report);
    return { sessionId: session.sessionId, report };
  } finally {
    await client.close().catch(() => {});
  }
}

export async function runLeadSend(options) {
  const {
    seat,
    message,
    stateDir,
    timeoutMs = DEFAULT_TURN_TIMEOUT_MS,
    launch,
    loadKey = loadCodingPlanApiKey,
    resolveRevision = defaultResolveRevision,
  } = options;
  if (!seat) throw new Error("seat is required");
  const leads = loadLeads(stateDir);
  const record = leads[seat];
  if (!record) {
    throw new Error(`no Lead recorded under seat '${seat}' — 'room lead list' shows recorded seats; sessions are recorded by 'room lead new'`);
  }
  const messageText = readInput(message);
  if (!messageText.trim()) throw new Error("message is empty");

  const write = (line) => process.stdout.write(`${line}\n`);
  let client;
  try {
    client = (await openSession({ launch, loadKey, resolveRevision, kind: "resume", workspace: record.workspace, sessionId: record.sessionId })).client;
    write(`session ${record.sessionId} resumed — turn ${record.turns + 1} running`);
    const outcome = await driveTurn({ client, sessionId: record.sessionId, content: messageText.trim(), timeoutMs, write });
    const { report, tokens } = await printReport({ client, sessionId: record.sessionId, write });

    await updateLeads(stateDir, (map) => completeTurn(map, seat, { tokens, report }));

    write(`--- report (session ${record.sessionId}, ${outcome.method})`);
    if (report) write(report);
    return { sessionId: record.sessionId, report };
  } catch (error) {
    const hint = notFoundHint(error, record.sessionId);
    if (hint) throw new Error(hint, { cause: error });
    throw error;
  } finally {
    if (client) await client.close().catch(() => {});
  }
}

export function runLeadList({ stateDir, write = (line) => process.stdout.write(`${line}\n`) } = {}) {
  const leads = loadLeads(stateDir);
  const seats = Object.values(leads).sort((a, b) => (a.seat < b.seat ? -1 : 1));
  if (seats.length === 0) {
    write("no Lead sessions recorded — 'room lead new <seat> …' dispatches one");
    return seats;
  }
  for (const record of seats) {
    const model = formatModelWithLevel(record.model);
    write(`${record.seat}  ${record.sessionId}  turns=${record.turns}  ${model}  ${record.workspace}`);
    if (record.lastReport) write(`    last: ${record.lastReport.replace(/\s+/g, " ").slice(0, 140)}`);
  }
  return seats;
}

export async function runLeadCommand(argv, { resolveStateDir } = {}) {
  let options;
  try {
    options = parseLeadArgs(argv);
  } catch (error) {
    throw new LeadUsageError(error.message);
  }
  const stateDir = resolveStateDir(options.stateDir);
  if (options.verb === "new") {
    if (!options.seat) throw new LeadUsageError("seat is required: room lead new <seat> …");
    if (!options.workspace) throw new LeadUsageError("--workspace is required");
    if (!options.brief) throw new LeadUsageError("--brief is required (file path or - for stdin)");
    return runLeadNew({ ...options, stateDir });
  }
  if (options.verb === "send") {
    if (!options.seat) throw new LeadUsageError("seat is required: room lead send <seat> …");
    if (!options.message) throw new LeadUsageError("--message is required (file path or - for stdin)");
    if (options.model) throw new LeadUsageError("--model is spawn-time only (room lead new); a resumed Lead keeps its spawn-time lane");
    return runLeadSend({ ...options, stateDir });
  }
  if (options.verb === "list" || options.verb === undefined) {
    return runLeadList({ stateDir });
  }
  throw new LeadUsageError(`unknown lead verb: '${options.verb}'`);
}
