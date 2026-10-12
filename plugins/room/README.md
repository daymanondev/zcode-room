# room plugin

The ZCode plugin for the SLP room: an MCP mailbox (`post_message` /
`read_mailbox`, addressed by seat name), the seat registry, the append-only
ledger, and the room's role contracts — all backed by the workspace
room-state directory. Issue 01 delivered the skeleton + mailbox; issue 02 the
contracts; issue 04 the registry, the ledger, and the first wrapper command
(`room tail`); issue 07 the wrapper's `doctor` and `lead` verbs (private
surface re-verification, and headless Lead dispatch over the control plane).

## Components

- `server/mcp-server.mjs` — stdio MCP server, zero dependencies (node:
  builtins only). Tools:
  - `post_message` / `read_mailbox` — the out-of-band mailbox bus.
  - `register_seat` / `retire_seat` / `lookup_seats` — the registry.
    Registering the same seat with the same role is idempotent; the first
    registration in a workspace opens the room (ledger `room_opened`);
    lead/peer registration and retirement mint their own ledger lines. The
    one-supervisor rule is carried in the registry (`status: advisory`,
    enforcement M2 / issue 11): a second live supervisor registers but is
    warned, not refused. Retirement is terminal for a seat name.
  - `record_event` / `read_ledger` — the closure-loop ledger.
    `record_event` takes exactly the four loop events (`brief_sent`,
    `handoff_received`, `disposition`, `needs_human`); lifecycle lines are
    minted only by registry acts — the closed vocabulary (spec) is enforced.
    Every line is hash-chained (`prev` + sha256 over the line as written);
    `read_ledger` verifies the chain and returns only the trusted prefix,
    with `break_at` naming the first untrusted sequence number. The chain
    detects out-of-band edits, deletions, and reorderings that do not
    recompute every subsequent hash; a wholesale rewrite that recomputes the
    whole tail is beyond a keyless local chain (anchoring the head hash
    arrives only if an audit question demands it). `room tail` verifies the
    same chain as it renders, marking lines after any break with `!!`.
- `cli/room.mjs` — the terminal wrapper (`node plugins/room/cli/room.mjs`
  or `npm run room -- …` from the build repo); the host-role machinery
  lives in `cli/pins.mjs` (pins + pure helpers) and `cli/appserver.mjs`
  (the ZCode Protocol client). Subcommands:
  - `tail [--state-dir <dir>]` — print existing ledger + mailbox history,
    then stream new events live while the room runs. Strictly read-only;
    Ctrl-C to stop; waits (with a notice) if no room state exists yet.
  - `doctor` — re-verify the pinned private surface and report go/no-go,
    spending zero model calls: binary sha256 + `--version`, the builtin
    catalog revision gate (path-hash formula), the coding-plan api-key
    (decrypts, never printed), and live over stdio the exact entitlement
    ladder the wrapper performs (baseline create shows the wall → push
    received → model resolves). The live check mints no persisted
    sessions (zero-turn sessions never reach the store). Exit 0 = GO.
  - `lead new <seat> --workspace <dir> --brief <file|->` — dispatch a
    headless Lead: spawns `app-server --stdio`, plays the host role
    (entitlement push + per-request header replies), sets the session to
    yolo (headless runs have no human to approve prompts; a permission
    request reaching the host is denied loudly — fail closed; the LEAD
    contract prepended verbatim to the brief is the real guardrail),
    runs exactly one turn, prints the Lead's final message as the report,
    and records the session id under `<state-dir>/leads.json` before the
    turn starts (durable even if the turn hangs).
  - `lead send <seat> --message <file|->` — re-poke: resume the recorded
    session in a fresh process with full context. Sessions persist only
    after their first completed turn; a never-completed first turn is
    gone and the wrapper says so.
  - `lead list` — show recorded Lead sessions.
  - Turn-end detection: this surface delivers no `turn.*` notifications
    to subscribers (crack doc §7.2), so the wrapper polls
    `session/messages` for the turn's final assistant entry
    (`info.finish === "stop"`; mid-turn entries complete with
    `finish:"tool-calls"` and are not the report).
  - Env seams (tests and non-standard installs): `ROOM_ZCODE_APP`,
    `ROOM_ZCODE_CJS`, `ROOM_BUILTIN_REVISION`, `ROOM_CREDENTIAL_STORE`,
    plus `ZCODE_CREDENTIAL_SECRET` (the credential cipher's own var).
- `skills/room/SKILL.md` — the seat-facing contract every seat reads:
  native-first law, mailbox addressing, registry duties, ledger duties.
- `contracts/WORKSPACE-PROTOCOL.md` — the shared protocol block, carried in
  the build repo's AGENTS.md and droppable into a target repo's workspace
  instructions.
- `contracts/PEER.md` — the peer contract; the Lead prepends it verbatim to
  every peer spawn prompt.
- `contracts/LEAD.md` — the Lead contract in its M0 main-session form.
  Law-by-law traceability for all three: `docs/role-contracts-traceability.md`
  in the build repo.

## State layout

Room state lives inside the workspace, nothing global (spec: state layout):

```
<workspace>/.room/            room-state directory (gitignored runtime state)
  mailbox/<seat>.jsonl        append-only, one JSON line per message
  mailbox/<seat>.cursor       consumed-message count, advanced by reads
  registry.json               seats + the recorded room rules
  ledger.jsonl                append-only, hash-chained closure-loop record
  leads.json                  wrapper-owned: seat → live Lead session ids
```

The server resolves the state dir from `ROOM_STATE_DIR` when set, else
`<cwd>/.room` — the manifest launches it with `cwd = ${ZCODE_PROJECT_DIR}`;
the CLI resolves identically (`--state-dir` flag, else env, else `<cwd>/.room`).
`leads.json` is written atomically by the wrapper alone; the MCP server
never reads it.

The registry is a small JSON document written via write-and-rename;
read-modify-write is not locked — M0 has one writer (the Lead). The ledger is
one append per line under `O_APPEND`; `room tail` observes both without ever
writing.

## Private-surface dependency (AGENTS.md rule)

Two dependencies, both pinned in `plugins/room/cli/pins.mjs` and
re-verified by `room doctor` without model calls.

**1. The MCP launch** uses ZCode's bundled plugin-host mechanism, the same
form every official plugin's manifest uses (grade A: observed across all
cached official manifests on this machine, 2026-10-12):

- **Observed app version:** ZCode.app 3.15.1, `zcode.cjs` sha256
  `b816e38656e70fb585fe2ab1ea010da89cda928dac1ccb5d83255fd18796da6e`,
  CLI string 0.16.9 (2026-10-12; the 3.14.5/`fad4c35c…` pin it replaced
  is preserved in the research docs).
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

**2. The app-server control plane** (`room doctor` / `room lead`): the
wrapper spawns `ELECTRON_RUN_AS_NODE=1 <MacOS/ZCode> <zcode.cjs>
app-server --stdio` and plays the host role — the entitlement push and
per-request header replies of the crack (issue 14), plus
create/resume/send/setMode/subscribe. Observed shapes and the two that
moved on 3.15.1: [research/entitlement-crack-2026-10-12.md](../../research/entitlement-crack-2026-10-12.md)
§3 (the crack) and §7 (the 3.15.1 re-verify).

- **Re-verify after any app update:** `npm run room -- doctor` — GO means
  the binary pin, the catalog revision gate, the credential cipher, and
  the live create→push→create ladder all still hold; a moved sha or a
  silently-refused push is exactly what it exists to catch (it caught a
  real one during issue 07: a provider id missing its `account:` prefix
  pushes "successfully" but never publishes).

## Versioning note

0.1.0 shipped the mailbox; 0.2.0 adds registry, ledger, and `room tail`;
0.3.0 adds `room doctor` and `room lead` (the wrapper grows; the MCP tool
surface is unchanged). A ZCode session sees only the tools of the plugin
version it loaded at start (grade A: observed 2026-10-12, issue 01 — a
sub-agent in a pre-install session enumerated its full tool list and had no
`mcp__room__*`; matches the plugin-creator doc's "old tasks retain an
earlier capability catalog") — after updating the plugin in the UI, the new
tools appear in sessions started after the update, not in already-running
ones.

## Tests

`npm test` (repo root) drives the server over stdio exactly as the harness
would — initialize handshake, `tools/list`, `tools/call` — against temporary
state directories: addressing, read-consumes, missing-box error, validation
refusals, durability across server restart, write containment, default
state-dir resolution, and the plugin-host launch path itself
(`test/host-launch.test.mjs`, skipped where the pinned bundle is absent).
Issue 04 added: registration lifecycle and idempotency, the advisory
one-supervisor rule, the closed ledger vocabulary, append-only proven both
structurally (earlier bytes frozen across retire/record) and detectably
(out-of-band tampering breaks the chain at the exact line), read paging, and
`room tail` as a live subprocess (history + follow + read-only + waiting
mode) in `test/registry-ledger.test.mjs` and `test/room-tail.test.mjs`.
Issue 07 added: the wrapper's pure private-surface helpers
(`test/room-wrapper.test.mjs` — revision path-hash formula against an
independently computed hash, catalog resolution + ambiguity refusal, the
`enc:v1` cipher round-trip + fail-closed tampering, defensive report
extraction), `room doctor` green/red against an injected fake world
(`test/room-doctor.test.mjs` — healthy GO, tampered hash, moved version,
missing credentials, the silent revision-gate refusal, unspawnable binary),
and `room lead` as full CLI subprocesses against a fake app-server double
(`test/fakes/app-server.mjs`, which encodes the observed contract:
preference rounds per scope, header requests, turn-gated persistence,
resume, mid-turn tool-calls entries) in `test/room-lead.test.mjs` —
contract-prepended payload, durable session id, resume with context,
duplicate/unknown seats, the never-persisted-session explanation, hung-turn
timeout, and the preamble-is-not-the-report regression. The double pins the
wrapper's behavior against the observed world; drift in the real surface is
`room doctor`'s live check to catch.
