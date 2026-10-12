// Shared harness for driving the room MCP server over stdio the way the
// ZCode host would: newline-delimited JSON-RPC 2.0, initialize handshake,
// tools/list, tools/call.

import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PLUGIN_ROOT = new URL("../plugins/room", import.meta.url).pathname;
export const SERVER_PATH = new URL("../plugins/room/server/mcp-server.mjs", import.meta.url)
  .pathname;

// Build the launch the host would perform from the shipped manifest itself,
// so the tested invocation cannot drift from plugins/room/.zcode-plugin/plugin.json
// (private surface, pinned in plugins/room/README.md): the app's helper
// binary runs zcode.cjs's __zcode-plugin-host entry, which imports the
// server script and calls main().
export function manifestLaunch() {
  const manifest = JSON.parse(
    readFileSync(join(PLUGIN_ROOT, ".zcode-plugin/plugin.json"), "utf8")
  );
  const server = manifest.mcpServers.room;
  const expand = (value) =>
    value.replaceAll("${ZCODE_PLUGIN_ROOT}", PLUGIN_ROOT);
  return {
    command: server.command,
    args: server.args.map(expand),
    env: server.env ?? {},
  };
}

export class McpClient {
  constructor(child) {
    this.child = child;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      let newline;
      while ((newline = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, newline).trim();
        this.buffer = this.buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        const resolver = this.pending.get(message.id);
        if (resolver) {
          this.pending.delete(message.id);
          resolver(message);
        }
      }
    });
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          rejectRequest(new Error(`timeout waiting for ${method} response`));
        }
      }, 5000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        resolveRequest(message);
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async initialize() {
    const response = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "zcode-room-test", version: "0.0.0" },
    });
    assert.equal(response.error, undefined, "initialize must not error");
    this.notify("notifications/initialized", {});
    return response.result;
  }

  // Resolves {isError, text, parsed} for a completed tools/call; tool-level
  // failures come back as results (isError: true) per MCP, not as protocol
  // errors.
  async callTool(name, args) {
    const response = await this.request("tools/call", { name, arguments: args });
    assert.equal(response.error, undefined, `tools/call ${name} must not be a protocol error`);
    const text = response.result.content[0].text;
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = undefined;
    }
    return { isError: response.result.isError === true, text, parsed };
  }

  async listTools() {
    const response = await this.request("tools/list", {});
    assert.equal(response.error, undefined, "tools/list must not error");
    return response.result.tools;
  }

  async close() {
    if (this.closed) return { code: this.child.exitCode };
    this.closed = true;
    this.child.stdin.end();
    await new Promise((resolveExit) =>
      this.child.once("exit", (code, signal) => resolveExit({ code, signal }))
    );
  }
}

export function startServer({
  cwd,
  stateDir,
  command = process.execPath,
  serverArgs = [SERVER_PATH],
  env: envExtra,
}) {
  const env = { ...process.env };
  if (stateDir) env.ROOM_STATE_DIR = stateDir;
  else delete env.ROOM_STATE_DIR;
  const child = spawn(command, serverArgs, { cwd, env: { ...env, ...envExtra } });
  return new McpClient(child);
}

export function tempWorkspace() {
  const root = mkdtempSync(join(tmpdir(), "zcode-room-test-"));
  return { root, stateDir: join(root, ".room") };
}
