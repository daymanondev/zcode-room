# room plugin

The ZCode plugin for the SLP room: an MCP mailbox (`post_message` /
`read_mailbox`, addressed by seat name) backed by the workspace room-state
directory. Issue 01 delivers the skeleton + mailbox; registry, ledger, and
the wrapper CLI arrive with issues 04+.

## Components

- `server/mcp-server.mjs` — stdio MCP server, zero dependencies (node:
  builtins only). Tools: `post_message`, `read_mailbox`.
- `skills/room/SKILL.md` — the mailbox contract every seat reads
  (native-first law, addressing, read-consumes semantics).

## State layout

Room state lives inside the workspace, nothing global (spec: state layout):

```
<workspace>/.room/            room-state directory (gitignored runtime state)
  mailbox/<seat>.jsonl        append-only, one JSON line per message
  mailbox/<seat>.cursor       consumed-message count, advanced by reads
```

The server resolves the state dir from `ROOM_STATE_DIR` when set, else
`<cwd>/.room` — the manifest launches it with `cwd = ${ZCODE_PROJECT_DIR}`.

## Private-surface dependency (AGENTS.md rule)

The MCP launch uses ZCode's bundled plugin-host mechanism, the same form
every official plugin's manifest uses (grade A: observed across all cached
official manifests on this machine, 2026-10-12):

- **Observed app version:** ZCode.app 3.14.5, `zcode.cjs` CLI 0.16.9
  (2026-10-12).
- **Exact invocation:** `command` =
  `/Applications/ZCode.app/Contents/Frameworks/ZCode Helper.app/Contents/MacOS/ZCode Helper`,
  `args` = `<Resources>/glm/zcode.cjs __zcode-plugin-host
  ${ZCODE_PLUGIN_ROOT}/server/mcp-server.mjs`, `env.ELECTRON_RUN_AS_NODE=1`.
- **Host contract:** `__zcode-plugin-host` imports the script and calls its
  exported `main()` (bundle 0.16.9: `if(typeof l.main!="function")throw new
  Error("Plugin server does not export main().")`), rewriting `process.argv`
  only *after* import — so the server exports `main` and auto-runs it only
  when spawned directly (tests). Grade A: live round-trip through this exact
  launch on 2026-10-11/12 (probe + `test/host-launch.test.mjs`); the host
  mechanism itself is grade B (bundle-read, `zcode.cjs` `BCe`/`tGe`), not
  gated on official marketplaces.
- **Re-verify after any app update:**
  `ELECTRON_RUN_AS_NODE=1 /Applications/ZCode.app/Contents/MacOS/ZCode
  /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs --version` still
  prints a version, and `grep -c __zcode-plugin-host
  /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` is non-zero;
  then re-run `npm test`.

## Tests

`npm test` (repo root) drives the server over stdio exactly as the harness
would — initialize handshake, `tools/list`, `tools/call` — against temporary
state directories: addressing, read-consumes, missing-box error, validation
refusals, durability across server restart, write containment, default
state-dir resolution, and the plugin-host launch path itself
(`test/host-launch.test.mjs`, skipped where the pinned bundle is absent).
