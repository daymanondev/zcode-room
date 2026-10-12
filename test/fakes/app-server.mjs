// Fake ZCode app-server for wrapper tests: a node double of the private
// stdio surface, encoding exactly what the real binary was observed doing
// (grade A probes, 2026-10-12, bundle b816e386). If the real surface
// drifts, `room doctor`'s live check catches it — this double pins OUR
// client's behavior, not the world's.
//
// Observed contract mirrored here:
// - NDJSON, {id, method, params}; no jsonrpc key.
// - session/create first issues a server->client request
//   session/requestRuntimePreferences {scope:"runtime-materialization"}
//   whose reply must carry a boolean nativeSearchEnhancementsEnabled.
// - provider/updateAccountConfig is ACKNOWLEDGED even when the revision
//   gate refuses it — the refusal is silent (providerCount stays 0 and
//   the model stays unavailable), which is exactly the trap doctor exists
//   to catch.
// - session/send {sessionId, content:string} issues the send-time
//   user-execution preference round (reply must carry permissionMode),
//   then turn.started … turn.completed notifications; send returns fast.
// - Sessions persist only after a completed turn: create mints nothing,
//   the first turn.completed writes the session (with its messages) to
//   the db file; session/resume reads that file and fails with "Session
//   not found" otherwise.
//
// Env knobs (all optional):
//   FAKE_VERSION            --version output (default 0.16.9)
//   FAKE_EXPECTED_REVISION  the revision string the gate demands
//   FAKE_DB                 json file standing in for the session store
//   FAKE_LOG                jsonl of every request received (assertions)
//   FAKE_REQUIRE_HEADERS=1  ask interaction/requestProviderRuntimeHeaders
//                           per send; reply must carry a non-empty apiKey
//   FAKE_HANG=1             start the turn but never complete it
//   FAKE_TURN_DELAY_MS      completion delay (default 25)

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MODEL_REF = { providerId: "account:zai-individual-coding-plan", modelId: "GLM-5.3" };
const MODES = ["plan", "build", "edit", "yolo", "guarded", "auto"];
const DELIVERY_KINDS = ["desktop-continuous", "web-remote-replayable"];

if (process.argv.includes("--version")) {
  process.stdout.write(`${process.env.FAKE_VERSION ?? "0.16.9"}\n`);
  process.exit(0);
}

const dbFile = process.env.FAKE_DB;
const logFile = process.env.FAKE_LOG;

const loadDb = () => (dbFile && existsSync(dbFile) ? JSON.parse(readFileSync(dbFile, "utf8")) : { sessions: {} });
const saveDb = (db) => {
  if (!dbFile) return;
  mkdirSync(dirname(dbFile), { recursive: true });
  writeFileSync(dbFile, `${JSON.stringify(db, null, 2)}\n`);
};
const note = (method, params) => {
  if (logFile) appendFileSync(logFile, `${JSON.stringify({ method, params })}\n`);
};

const send = (message) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};
// Block body on purpose: stdout.write returns a boolean, and returning it
// from handle() would be mistaken for a result and double-replied.
const replyError = (id, message) => {
  send({ id, error: { code: -32000, message } });
};

let entitled = false;
let nextSession = 1;
let nextServerId = 1;
const serverReplies = new Map(); // server request id -> validate(result)
// In-memory live sessions; the db file is the persisted mirror.
const memory = new Map();

function serverRequest(method, params, validate) {
  return new Promise((resolve, reject) => {
    const id = `server-${nextServerId++}`;
    serverReplies.set(id, {
      handle: (result) => {
        try {
          validate(result);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      },
    });
    note(method, params); // server->client requests are logged like inbound ones
    send({ id, method, params });
  });
}

async function handle(id, method, params) {
  note(method, params);
  switch (method) {
    case "provider/updateAccountConfig": {
      const expected = process.env.FAKE_EXPECTED_REVISION;
      const accepted = expected === undefined || params?.basedOnZCodeBuiltinRevision === expected;
      if (accepted) entitled = true;
      // The real registry acknowledges even a refused push — the caller
      // detects the refusal by the model staying unavailable.
      return { receivedRevision: params?.revision, providerCount: entitled ? 1 : 0, status: "received" };
    }
    case "session/create": {
      const sessionId = `sess_fake_${String(nextSession++).padStart(4, "0")}`;
      const prefs = await serverRequest(
        "session/requestRuntimePreferences",
        { sessionId, scope: "runtime-materialization" },
        (result) => {
          if (typeof result?.nativeSearchEnhancementsEnabled !== "boolean") {
            throw new Error("runtime-materialization reply must carry boolean nativeSearchEnhancementsEnabled");
          }
        }
      ).catch((error) => error);
      if (prefs instanceof Error) return replyError(id, prefs.message);
      memory.set(sessionId, { sessionId, workspace: params?.workspace?.workspacePath, mode: "build", messages: [], resumed: false });
      return {
        session: {
          sessionId,
          mode: "build",
          model: entitled ? MODEL_REF : null,
          workspace: params?.workspace,
          status: "idle",
        },
        settings: { model: { available: entitled ? [{ ref: MODEL_REF, label: "GLM-5.3" }] : [] } },
        messages: [],
      };
    }
    case "session/setMode": {
      if (typeof params?.sessionId !== "string" || !MODES.includes(params?.mode)) {
        return replyError(id, `Invalid params — mode: Invalid option: expected one of ${MODES.map((m) => `"${m}"`).join("|")}`);
      }
      const session = memory.get(params.sessionId) ?? loadDb().sessions[params.sessionId];
      if (!session) return replyError(id, `Session not found: ${params.sessionId}`);
      session.mode = params.mode;
      return { messages: [], projection: { mode: params.mode, sessionId: params.sessionId } };
    }
    case "session/subscribe": {
      if (typeof params?.sessionId !== "string" || !DELIVERY_KINDS.includes(params?.deliveryKind)) {
        return replyError(id, `Invalid params — deliveryKind: Invalid option: expected one of ${DELIVERY_KINDS.map((k) => `"${k}"`).join("|")}`);
      }
      return {};
    }
    case "session/send": {
      if (typeof params?.sessionId !== "string" || typeof params?.content !== "string") {
        return replyError(id, "Invalid params — sessionId: expected string; content: expected string");
      }
      const session = memory.get(params.sessionId);
      if (!session) return replyError(id, `Session not found: ${params.sessionId}`);
      const prefs = await serverRequest(
        "session/requestRuntimePreferences",
        { sessionId: params.sessionId, scope: "user-execution" },
        (result) => {
          // Both scopes demand exactly nativeSearchEnhancementsEnabled on
          // the pinned build; extra keys are zod-rejected (observed live,
          // 2026-10-12: modelSelection/permissionMode → turn fails with no
          // client notification).
          if (typeof result?.nativeSearchEnhancementsEnabled !== "boolean") {
            throw new Error("user-execution reply must carry boolean nativeSearchEnhancementsEnabled");
          }
          if (result.modelSelection !== undefined || result.permissionMode !== undefined) {
            throw new Error("user-execution reply carries unrecognized keys (modelSelection/permissionMode)");
          }
        }
      ).catch((error) => error);
      if (prefs instanceof Error) return replyError(id, prefs.message);
      if (process.env.FAKE_REQUIRE_HEADERS === "1") {
        const headers = await serverRequest(
          "interaction/requestProviderRuntimeHeaders",
          { sessionId: params.sessionId, modelId: MODEL_REF.modelId },
          (result) => {
            if (typeof result?.requestAuth?.apiKey !== "string" || result.requestAuth.apiKey.length === 0) {
              throw new Error("provider runtime headers reply must carry requestAuth.apiKey");
            }
          }
        ).catch((error) => error);
        if (headers instanceof Error) return replyError(id, headers.message);
      }
      send({ method: "turn.started", params: { sessionId: params.sessionId } });
      if (process.env.FAKE_HANG !== "1") {
        const delay = Number(process.env.FAKE_TURN_DELAY_MS ?? 25);
        // FAKE_PREAMBLE=1 reproduces the real mid-turn shape: an
        // assistant entry that completes with finish "tool-calls" (its
        // read-preamble text) well before the turn's final entry. A
        // wrapper that treats any completed entry as turn-end reports
        // the preamble, not the report.
        if (process.env.FAKE_PREAMBLE === "1") {
          setTimeout(() => {
            session.messages.push({
              info: { role: "assistant", time: { created: Date.now(), completed: Date.now() }, finish: "tool-calls" },
              parts: [{ type: "text", text: "Reading it now (preamble before tool calls)." }],
            });
          }, Math.max(5, delay / 2));
        }
        setTimeout(() => {
          const prior = session.messages.length;
          const turnCount = prior / 2 + 1;
          const created = Date.now();
          // Entry shape mirrors the real surface (observed 2026-10-12):
          // {info: {role, time: {created, completed}, finish}, parts: [{type:"text", text}]}.
          session.messages.push({
            info: { role: "user", time: { created } },
            parts: [{ type: "text", text: params.content }],
          });
          session.messages.push({
            info: { role: "assistant", time: { created, completed: created + delay }, finish: "stop", tokens: { total: 1, input: 1, output: 1 } },
            parts: [
              {
                type: "text",
                text:
                  `FAKE-REPORT resumed=${session.resumed} turnCount=${turnCount} ` +
                  `priorMessages=${prior} payloadHead=${JSON.stringify(params.content.slice(0, 80))}`,
              },
            ],
          });
          const db = loadDb();
          db.sessions[params.sessionId] = session; // persistence is turn-gated
          saveDb(db);
          send({ method: "turn.completed", params: { sessionId: params.sessionId } });
        }, delay);
      }
      return {};
    }
    case "session/resume": {
      if (typeof params?.sessionId !== "string") {
        return replyError(id, "Invalid params — sessionId: Invalid input: expected string, received undefined");
      }
      const db = loadDb();
      const session = db.sessions[params.sessionId];
      if (!session) return replyError(id, `Session not found: ${params.sessionId}`);
      const live = { ...session, resumed: true };
      memory.set(params.sessionId, live);
      return { session: { sessionId: live.sessionId, mode: live.mode, model: MODEL_REF, workspace: { workspacePath: live.workspace } }, messages: live.messages };
    }
    case "session/messages": {
      if (typeof params?.sessionId !== "string") {
        return replyError(id, "Invalid params — sessionId: Invalid input: expected string, received undefined");
      }
      const session = memory.get(params.sessionId) ?? loadDb().sessions[params.sessionId];
      return { messages: session ? session.messages : [] };
    }
    default:
      return replyError(id, `Method not found: ${method}`);
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined && serverReplies.has(message.id)) {
      serverReplies.get(message.id).handle(message.result ?? message.error);
      serverReplies.delete(message.id);
      continue;
    }
    handle(message.id, message.method, message.params)
      .then((result) => {
        if (result !== undefined) send({ id: message.id, result });
      })
      .catch((error) => replyError(message.id, error.message));
  }
});
process.stdin.on("end", () => process.exit(0));
