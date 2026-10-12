// appserver.mjs — a ZCode Protocol host client for `app-server --stdio`
// children (issue 07).
//
// The room's Supervisor-role tooling drives Leads exactly the way the
// desktop does: it spawns the bundled CLI's app-server over stdio and
// plays the host side of the protocol. That host role is what carries the
// entitlement crack (issue 14): push provider/updateAccountConfig once
// per child, then answer interaction/requestProviderRuntimeHeaders with
// the coding-plan api-key on every model request.
//
// Wire format (observed, grade A — feasibility §9.4, crack doc §2/§3;
// re-verified on 3.15.1 / b816e386): NDJSON, JSON-RPC-shaped WITHOUT a
// `jsonrpc` key ({id, method, params}); server→client requests carry ids
// like "server-1"; notifications (no id) include state.updated,
// turn.started, turn.completed, turn.failed, turn.terminal.
//
// Every server→client request gets a reply: the three the host role must
// answer, and an explicit -32601 for anything else so the child fails
// loudly at the seam instead of hanging on a silent request.

import { spawn } from "node:child_process";
import { launchAppServer } from "./pins.mjs";

const REQUEST_TIMEOUT_MS = 20000;

export class ProtocolError extends Error {
  constructor(method, payload) {
    super(`${method}: ${payload?.message ?? JSON.stringify(payload)}`);
    this.method = method;
    this.payload = payload;
  }
}

export class AppServerClient {
  // Options:
  //   launch   {command, args, env} — the app-server spawn (defaults to
  //            the pinned ZCode launch from pins.mjs; tests inject a fake)
  //   apiKey   string — the coding-plan api-key answered to
  //            interaction/requestProviderRuntimeHeaders. Doctor passes a
  //            placeholder: it never sends, so no model request happens.
  //   notify   (notification) => void — optional tap for progress display
  //   log      (line) => void — diagnostics sink (defaults to stderr)
  constructor({ launch, apiKey = "", notify, log } = {}) {
    this.launch = launch ?? launchAppServer();
    this.apiKey = apiKey;
    this.notify = notify;
    this.log = log ?? ((line) => process.stderr.write(`${line}\n`));
    this.pending = new Map(); // request id -> resolver
    this.turnWaiters = []; // {sessionId | null, resolve, reject, timer}
    this.nextId = 1;
    this.child = null;
    this.buffer = "";
    this.stderrTail = []; // bounded ring of child stderr for crash reports
    this.closed = false;
  }

  async start() {
    this.child = spawn(this.launch.command, this.launch.args, {
      env: { ...process.env, ...this.launch.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.#ingest(chunk));
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => {
      for (const line of chunk.split("\n")) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 50) this.stderrTail.shift();
      }
    });
    // A failed spawn (ENOENT, permissions) surfaces as an 'error' event —
    // fail everything in flight instead of crashing the host process. A
    // failed spawn never emits 'exit', so the exit promise settles here
    // too or close() would await forever.
    this.exited = new Promise((resolveExit) => {
      this.child.once("exit", (code, signal) => resolveExit({ code, signal }));
      this.child.once("error", (error) => {
        this.spawnError = error;
        for (const waiter of this.turnWaiters.splice(0)) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        for (const entry of this.pending.values()) entry.onClose();
        this.pending.clear();
        resolveExit({ code: null, signal: null });
      });
    });
    return this;
  }

  #ingest(chunk) {
    this.buffer += chunk;
    let newline;
    while ((newline = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        this.log(`!! unparseable line from app-server: ${line.slice(0, 160)}`);
        continue;
      }
      this.#dispatch(message);
    }
  }

  #send(message) {
    if (this.spawnError) throw this.spawnError;
    if (this.closed || !this.child.stdin.writable) throw new Error("app-server connection is closed");
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  #dispatch(message) {
    if (message.id !== undefined && message.id !== null && this.pending.has(message.id)) {
      this.pending.get(message.id).onMessage(message);
      return;
    }
    if (message.id === undefined || message.id === null) {
      this.#onNotification(message);
      return;
    }
    this.#onServerRequest(message);
  }

  #onNotification(notification) {
    if (this.notify) this.notify(notification);
    const method = notification.method ?? "";
    if (method === "turn.completed" || method === "turn.failed" || method === "turn.terminal") {
      const sessionId = notification.params?.sessionId ?? null;
      const waiters = this.turnWaiters.splice(0);
      for (const waiter of waiters) {
        if (waiter.sessionId !== null && sessionId !== null && waiter.sessionId !== sessionId) {
          this.turnWaiters.push(waiter); // another session's turn — keep waiting
          continue;
        }
        clearTimeout(waiter.timer);
        waiter.resolve({ method, params: notification.params ?? {} });
      }
    }
  }

  // The host role. Replies are shaped per the observed zod schemas — a
  // wrong shape comes back as a ZodError on the caller's request, which
  // is how these were pinned in the first place.
  #onServerRequest(request) {
    const method = request.method ?? "";
    // Host-role traffic is diagnostics-worthy: a stalled turn usually
    // means a request this role answered wrongly. Params may embed
    // secrets after our reply — we log only the request we received.
    this.log(`[host] ${method} ${JSON.stringify(request.params ?? {}).replace(/\s+/g, " ").slice(0, 160)}`);
    if (method === "session/requestRuntimePreferences") {
      // One reply shape for both scopes on the pinned build: the send-time
      // user-execution round ALSO wants exactly nativeSearchEnhancementsEnabled
      // — a modelSelection/permissionMode reply (the shape feasibility §9.4
      // observed on 3.14.5) is zod-rejected on 3.15.1, and the turn then
      // fails server-side with no notification to the client (verbatim
      // log evidence, zcode-2026-10-12.jsonl, sess_38002d5b).
      this.#send({ id: request.id, result: { nativeSearchEnhancementsEnabled: false } });
      return;
    }
    if (method === "interaction/requestProviderRuntimeHeaders") {
      this.#send({ id: request.id, result: { headersApplied: true, requestAuth: { apiKey: this.apiKey } } });
      return;
    }
    if (method === "interaction/requestOfficialMcpAuthHeaders") {
      this.#send({ id: request.id, result: { headersApplied: false } });
      return;
    }
    // Fail closed: a permission or input request reaching the host means
    // the yolo posture did not hold — deny and say so loudly rather than
    // approve silently.
    if (method === "interaction/requestPermission" || method === "interaction/requestUserInput") {
      this.log(`!! ${method} arrived despite yolo mode — denying (request: ${JSON.stringify(request.params ?? {}).slice(0, 200)})`);
      this.#send({ id: request.id, error: { code: -32000, message: `room wrapper: ${method} denied (headless run)` } });
      return;
    }
    this.log(`!! unhandled server request ${method} — replying method-not-found`);
    this.#send({ id: request.id, error: { code: -32601, message: `room wrapper has no handler for ${method}` } });
  }

  request(method, params, { timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) {
          rejectRequest(new Error(`timeout (${timeoutMs}ms) waiting for ${method} response`));
        }
      }, timeoutMs);
      this.pending.set(id, {
        onMessage: (message) => {
          clearTimeout(timer);
          if (message.error) rejectRequest(new ProtocolError(method, message.error));
          else resolveRequest(message.result);
        },
        onClose: () => {
          clearTimeout(timer);
          rejectRequest(new Error(`app-server connection closed while ${method} was in flight`));
        },
      });
      this.#send({ id, method, params });
    });
  }

  // Resolve when the session's turn reaches an end state
  // (turn.completed | turn.failed | turn.terminal). Register BEFORE
  // session/send so a fast turn cannot slip between send and wait.
  waitForTurnEnd(sessionId, timeoutMs) {
    return new Promise((resolveWait, rejectWait) => {
      const timer = setTimeout(() => {
        const index = this.turnWaiters.indexOf(waiter);
        if (index !== -1) this.turnWaiters.splice(index, 1);
        rejectWait(new Error(`timeout (${timeoutMs}ms) waiting for turn end on ${sessionId}`));
      }, timeoutMs);
      const waiter = { sessionId, resolve: resolveWait, reject: rejectWait, timer };
      this.turnWaiters.push(waiter);
    });
  }

  // The entitlement push (crack doc §3.2 verbatim shape). A mismatched
  // revision is silently ignored by the registry — callers verify by the
  // create that follows, which is why doctor does exactly that.
  async pushEntitlement({ revisionString, providerId }) {
    return this.request("provider/updateAccountConfig", {
      revision: `room-wrapper-${Date.now()}`,
      basedOnZCodeBuiltinRevision: revisionString,
      providers: { [providerId]: { access: { type: "zhipu-account", entitled: true } } },
      states: { [providerId]: { availability: "available", entitled: true, current: true } },
    });
  }

  crashReport() {
    return this.stderrTail.join("\n");
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.turnWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("app-server connection closed"));
    }
    for (const entry of this.pending.values()) entry.onClose();
    this.pending.clear();
    if (this.child === null) return;
    this.child.stdin.end();
    const killTimer = setTimeout(() => this.child.kill("SIGKILL"), 3000);
    await this.exited.finally(() => clearTimeout(killTimer));
  }
}
