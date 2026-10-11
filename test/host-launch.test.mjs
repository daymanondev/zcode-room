// The production launch path, exercised end to end: spawn the server the
// way the plugin manifest declares it — the app's helper binary running
// zcode.cjs's __zcode-plugin-host entry, which imports the script and calls
// main(). The invocation is read from the shipped manifest (helpers:
// manifestLaunch), so drift between manifest and test fails here. Skips on
// machines without the pinned bundle; pins + re-verify live in
// plugins/room/README.md.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestLaunch, startServer, tempWorkspace } from "./helpers.mjs";

const launch = manifestLaunch();
const hostAvailable = existsSync(launch.command) && existsSync(launch.args[0]);

test(
  "plugin-host launch: round-trip through the app's bundled runtime",
  { skip: !hostAvailable && "ZCode.app bundle not present" },
  async () => {
    const ws = tempWorkspace();
    const server = startServer({
      cwd: ws.root,
      stateDir: ws.stateDir,
      command: launch.command,
      serverArgs: launch.args,
      env: launch.env,
    });

    const init = await server.initialize();
    assert.equal(init.serverInfo.name, "room");

    const posted = await server.callTool("post_message", {
      to: "peer-reviewer",
      from: "peer-engineer",
      body: "host-launch proof",
    });
    assert.equal(posted.isError, false);

    const read = await server.callTool("read_mailbox", { seat: "peer-reviewer" });
    assert.deepEqual(
      read.parsed.messages.map((message) => message.body),
      ["host-launch proof"]
    );
    await server.close();

    assert.ok(
      existsSync(join(ws.stateDir, "mailbox", "peer-reviewer.jsonl")),
      "state lands under the room-state dir in the host path too"
    );
  }
);

// Smoke check of the re-verify step's first half (README): the pinned CLI
// still answers --version under the helper runtime. Exact-version pinning
// is the doctor command's job (issue 07), not this suite's.
test(
  "zcode.cjs --version answers under the helper runtime",
  { skip: !hostAvailable && "ZCode.app bundle not present" },
  async () => {
    const { execFileSync } = await import("node:child_process");
    const version = execFileSync(launch.command, [launch.args[0], "--version"], {
      env: { ...process.env, ...launch.env },
    })
      .toString()
      .trim();
    assert.match(version, /^\d+\.\d+\.\d+$/, "zcode.cjs --version must answer");
  }
);
