# room plugin

The ZCode plugin for the SLP room: an MCP mailbox (`post_message` /
`read_mailbox`, addressed by seat name), the seat registry, the append-only
ledger, the room's role contracts, and the `/slp` Supervisor-arming skill —
all backed by the workspace room-state directory. Issue 01 delivered the
skeleton + mailbox; issue 02 the contracts; issue 04 the registry, the
ledger, and the first wrapper command (`room tail`); issue 07 the wrapper's
`doctor` and `lead` verbs (private surface re-verification, and headless
Lead dispatch over the control plane); issue 08 the `/slp` skill and the
enforced one-supervisor arming; issue 09 per-role model defaults in the
committed room config, applied per spawn through `session/setModel`;
issue 10 the heartbeat wake machinery — the zero-judgment gate the wake
runs (`room heartbeat`) plus the wake/re-poke/answer-routing procedures
in the `/slp` skill; auto-arming is parked on the Human's cost decision
(the live probe showed why: below).

## Components

- `server/mcp-server.mjs` — stdio MCP server, zero dependencies (node:
  builtins only). Tools:
  - `post_message` / `read_mailbox` — the out-of-band mailbox bus.
  - `register_seat` / `retire_seat` / `lookup_seats` — the registry.
    Registering the same seat with the same role is idempotent; the first
    registration in a workspace opens the room (ledger `room_opened`);
    lead/peer registration and retirement mint their own ledger lines. The
    one-supervisor rule is enforced at the arming act (issue 08): the
    registry records which server instance (one per session's MCP
    connection, grade B — pinned below as dependency 3) armed the live
    supervisor, and any other session's arming — re-arming the same seat
    or a new supervisor seat — is refused citing the live seat. Recovery
    is explicit: the Human retires the seat, then a successor name arms.
    A supervisor record with no arming marker (pre-08 state) refuses the
    same way. Retirement is terminal for a seat name.
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
    received → model resolves → `setModel` selects another catalog model,
    pinning the lane-selection surface issue 09 rides). The live check
    mints no persisted sessions (zero-turn sessions never reach the
    store). Exit 0 = GO.
  - `lead new <seat> --workspace <dir> --brief <file|->
    [--model <providerId/modelId>]` — dispatch a headless Lead: spawns
    `app-server --stdio`, plays the host role (entitlement push +
    per-request header replies), sets the session to yolo (headless runs
    have no human to approve prompts; a permission request reaching the
    host is denied loudly — fail closed; the LEAD contract prepended
    verbatim to the brief is the real guardrail), runs exactly one turn,
    prints the Lead's final message as the report, and records the
    session id under `<state-dir>/leads.json` before the turn starts
    (durable even if the turn hangs). The lane is selected at spawn
    (issue 09): the lead role's default from the committed room config
    (`<state-dir>/room.json`), overridable per dispatch with `--model`
    (which must be on the role's menu when one is declared); selection
    is applied with `session/setModel` right after create and recorded
    in `leads.json` with its source (`config` | `override`). With
    neither, the spawn keeps whatever the registry resolved. A bad
    config or a bad `--model` fails the dispatch before anything is
    spent; a registry-unknown lane fails at setModel, before the turn —
    the zero-turn create under it never persists. Selection is
    per-session: `persistAsWorkspaceLastUsed` is forced false (the
    surface defaults it true) — a headless dispatch never writes its
    lane into the workspace's last-used-model state, which belongs to
    the Human's own sessions.
  - `lead send <seat> --message <file|->` — re-poke: resume the recorded
    session in a fresh process with full context. Sessions persist only
    after their first completed turn; a never-completed first turn is
    gone and the wrapper says so. Resume keeps the spawn-time lane —
    `--model` is spawn-time only and refused here.
  - `lead list` — show recorded Lead sessions.
  - `heartbeat [--stall-after-ms <n>]` — the wake gate a Supervisor
    heartbeat automation runs at every fire (issue 10). Zero model
    calls,
    zero judgment: one verdict over the registry (no live supervisor →
    `orphaned` — the automation is a leftover; the wake removes it where
    the host offers a delete tool and otherwise self-flags once
    (NEEDS-HUMAN naming title and id — removal is the Human's click in
    the app's Automations page; observed live 2026-10-13, app 3.15.1:
    the session surface carries CronCreate and CronList but no delete), the supervisor's mailbox (unread escalations, **peeked not
    consumed** — the consuming `read_mailbox` belongs to the wake after
    the relay has landed in chat, so a crashed wake turn cannot lose an
    escalation), and open Lead loops (`stalled` when briefs sit recorded
    since the seat's last `handoff_received` and the newest is older than
    the threshold — default 35 min, the wrapper's 30-min turn timeout
    plus margin; `--stall-after-ms` overrides). A stall is
    `re-poke eligible` exactly once: the re-poke itself is a
    `brief_sent` whose detail begins `re-poke` (the string the skill
    prescribes — an answer-routing brief never spends the budget), so
    the gate's next verdict reads `already re-poked, needs Human`
    mechanically — the once-guarantee is the ledger, not a promise. A
    tampered ledger surfaces as a chain-break alarm and skips the stall
    math (untrusted lines must not drive a re-poke). Everything else is
    `quiet`. The acting procedure (relay, record, consume, re-poke,
    answer routing) lives in the `/slp` skill; the gate only reports.
  - Turn-end detection: this surface delivers no `turn.*` notifications
    to subscribers (crack doc §7.2), so the wrapper polls
    `session/messages` for the turn's final assistant entry
    (`info.finish === "stop"`; mid-turn entries complete with
    `finish:"tool-calls"` and are not the report). That same entry's
    `info.tokens` is the per-turn usage `leads.json` records
    (`lastTurnTokens`) — verbatim what the surface reports.
  - Env seams (tests and non-standard installs): `ROOM_ZCODE_APP`,
    `ROOM_ZCODE_CJS`, `ROOM_BUILTIN_REVISION`, `ROOM_CREDENTIAL_STORE`,
    plus `ZCODE_CREDENTIAL_SECRET` (the credential cipher's own var).
- `skills/room/SKILL.md` — the seat-facing contract every seat reads:
  native-first law, mailbox addressing, registry duties, ledger duties.
- `skills/slp/SKILL.md` — the Supervisor arming skill (`/slp`): arms the
  chat session as the room's Supervisor (register_seat) and carries the
  Supervisor contract in full — loop auditor (relay quotes ledger facts,
  never only a Lead's summary), privacy firewall on Lead-facing messages,
  advice-to-the-Lead, the append-only notebook — plus the dispatch,
  relay-on-notification, and explicit-retire procedures for Leads run
  through the wrapper, and (issue 10) the heartbeat wake machinery: the
  gate, the wake procedure, the once-only re-poke, and the answer
  routing — with auto-arming parked on the Human's cost decision
  (2026-10-13): a heartbeat automation is created only on the Human's
  explicit instruction, with CronList dedup (title
  `SLP supervisor heartbeat …`), its removal surfaced at retire (by
  CronDelete where offered; else NEEDS-HUMAN naming it for the
  Automations page), and an orphaned wake self-flagging once per
  session.
- `contracts/WORKSPACE-PROTOCOL.md` — the shared protocol block, carried in
  the build repo's AGENTS.md and droppable into a target repo's workspace
  instructions.
- `contracts/PEER.md` — the peer contract; the Lead prepends it verbatim to
  every peer spawn prompt.
- `contracts/LEAD.md` — the Lead contract (both run forms since issue 08:
  main session, or headless session dispatched by the wrapper, which
  prepends it verbatim to the dispatch payload).
  Law-by-law traceability for all four contracts:
  `docs/role-contracts-traceability.md` in the build repo.

## State layout

Room state lives inside the workspace, nothing global (spec: state layout):

```
<workspace>/.room/            room-state directory (runtime state gitignored;
                              the committed config is allow-listed through)
  room.json                   COMMITTED room config (issue 09): role model
                              defaults + menus — the only file here that is
                              version-controlled
  mailbox/<seat>.jsonl        append-only, one JSON line per message
  mailbox/<seat>.cursor       consumed-message count, advanced by reads
  registry.json               seats + the recorded room rules
  ledger.jsonl                append-only, hash-chained closure-loop record
  leads.json                  wrapper-owned: seat → live Lead session ids
                              (+ each session's selected model, its source,
                              and lastTurnTokens since issue 09)
  leads.lock/                 transient mkdir lock serializing leads.json
                              updates across concurrent dispatches (issue 09)
```

The server resolves the state dir from `ROOM_STATE_DIR` when set, else
`<cwd>/.room` — the manifest launches it with `cwd = ${ZCODE_PROJECT_DIR}`;
the CLI resolves identically (`--state-dir` flag, else env, else `<cwd>/.room`).
`leads.json` is written atomically by the wrapper alone; the MCP server
never reads it. `room.json` is validated strictly (unknown keys, version,
menu/default consistency) by `cli/config.mjs` — a typo in the committed
file fails dispatches loudly instead of silently routing lanes.

Locking split: the registry's read-modify-write stays unlocked (its writers
are registry acts, one at a time by construction), while `leads.json`
updates run under the `leads.lock` dir since issue 09 — the ticket's live
run caught two concurrent `room lead new` processes clobbering each other's
records when each held its copy of the map for a whole turn. A stale lock
(crashed holder) is broken after ten minutes. The registry itself is a
small JSON document written via write-and-rename; the ledger is one
append per line under `O_APPEND`; `room tail` observes both without ever
writing.

## Private-surface dependency (AGENTS.md rule)

Four dependencies. 1 and 2 are pinned in `plugins/room/cli/pins.mjs` and
re-verified by `room doctor` without model calls; 3 and 4 are behavioral
assumptions pinned here with their failure modes.

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
create/resume/send/setMode/setModel/subscribe. Observed shapes and the
two that moved on 3.15.1: [research/entitlement-crack-2026-10-12.md](../../research/entitlement-crack-2026-10-12.md)
§3 (the crack) and §7 (the 3.15.1 re-verify); the setModel
per-session selection (issue 09) is verified live in
[research/model-per-role-2026-10-13.md](../../research/model-per-role-2026-10-13.md).

- **Re-verify after any app update:** `npm run room -- doctor` — GO means
  the binary pin, the catalog revision gate, the credential cipher, and
  the live create→push→create→setModel ladder all still hold; a moved
  sha or a silently-refused push is exactly what it exists to catch (it
  caught a real one during issue 07: a provider id missing its `account:`
  prefix pushes "successfully" but never publishes).

**3. The arming-instance assumption** (issue 08): the enforced
one-supervisor arming keys "same session" to the MCP server process —
`INSTANCE_ID` in the server module — which assumes the host launches one
server process per session's connection and keeps it for the session's
life (grade B: the launch form is pinned above; process-per-session is
the standard stdio-MCP shape, the no-mid-session-restart half is
inferred, not observed). Failure mode, if the assumption breaks: a
mid-session restart mints a new id and the same session's next arming is
refused "armed by another session" — safe direction (the rule fails
closed, never two commanders); recovery is the explicit retire +
successor name. Re-verify: the next live `/slp` in a fresh session after
the 0.4.0 UI reinstall (arming in-app, then re-invoking `/slp` in the
same session must return `already: true`, not a refusal).

**4. The host scheduling surface** (issue 10): the heartbeat rides the
host's session-level automations — not the hidden CLI. Pinned behavior
(grade A: feasibility §8 probes, observed 2026-10-10; re-observed live
in this build 2026-10-13, issue 10): root-side `CronCreate` with a
5-field cron (`*/2 * * * *` works as every-2-minutes) queues future
**main-level wakes** into the creating session that survive app
restarts; a fire arriving mid-turn is delivered at the next turn
boundary (observed: three wakes queued behind one long turn, each
delivered and handled in order). The session surface on this host
(app 3.15.1) carries `CronCreate` and `CronList` but **no delete** —
removal is the Human's click in the app's Automations page, so the
retire step and the orphaned wake surface the exact title and id as
NEEDS-HUMAN instead of pretending a delete happened; sub-agents do not
see these tools (absent from their enumerated surface), so only the
Supervisor session can arm the heartbeat — which is the topology
working as designed. The wake prompt is self-contained by contract
(the automated run may carry none of the arming session's context) and
bakes an absolute plugin-cache path, which moves on plugin **version**
updates — failure mode: a stale automation wakes with a dead gate path;
the wake must then say so (and re-arming `/slp` refreshes the
automation with the current path). The live probe's cost finding
(2026-10-13, grade A): a `*/2` recurring wake is one model turn + one
UI card per fire — 12 orphaned fires piled up in ~25 minutes after the
probe room retired, with no session-side off-switch — so auto-arming is
**parked on the Human's cost decision**; the skill creates an
automation only on explicit instruction (the Human's lean: a
dispatch-scoped lease — created at dispatch, slower cadence,
`maxRuns`-bounded so orphans self-extinguish). Re-verify: `CronList`
shows the automation while one is instructed; after retire, the removal
request names it and the Automations page shows it gone.

## Versioning note

0.1.0 shipped the mailbox; 0.2.0 adds registry, ledger, and `room tail`;
0.3.0 adds `room doctor` and `room lead` (the wrapper grows; the MCP tool
surface is unchanged); 0.4.0 adds the `/slp` skill and enforces the
one-supervisor arming in `register_seat` (the first MCP behavior change —
a second live supervisor is now refused, not warned); 0.5.0 adds
per-role model routing (issue 09): the committed room config, spawn-time
`setModel`, the `--model` override, and per-turn usage in `leads.json`
(wrapper-side only — the MCP tool surface is again unchanged); 0.6.0 adds
the heartbeat fallback (issue 10): the `room heartbeat` gate and the
wake/automation procedures in the `/slp` skill (again wrapper- and
skill-side only — the MCP tool surface is unchanged). A ZCode
session sees
only the tools of the plugin
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
Issue 08 rewrote the one-supervisor coverage for the enforced arming:
same-session re-arm idempotent, a second session's arming (same seat or
new seat) refused citing the live seat with nothing written, legacy
records without the arming marker refused the same way, explicit recovery
(retire, then a successor name), and the gate's scope (lead/peer seats
stay idempotent across sessions).
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
`room doctor`'s live check to catch. Issue 09 added: the config's pure
surface (`test/room-config.test.mjs` — model-string parsing, strict
validation, menu/default consistency, selection precedence) and the model
routing through the full CLI (`test/room-lead.test.mjs` — config default
applied via setModel between create and send, `--model` override recorded
without touching the config, menu enforcement on both override and
default, usage errors for malformed/`send` `--model`, loud config
failures before anything is spent, lastTurnTokens recorded, no selection
issued without config) plus the doctor setModel PASS line; the fake's
registry mirrors what the plan actually serves (GLM-5.3 and
GLM-5.3-Flash only — observed live 2026-10-13) with the observed
refusals: not-in-registry, "Reasoning level is required", and
zod-shaped unrecognized keys. Issue 10 added: `room heartbeat` as real
state driven through the server over stdio, asserted as both a plain
function and a CLI subprocess (`test/room-heartbeat.test.mjs` — orphaned
shapes, quiet, peek-not-consume proven by the cursor staying unborn and
a later `read_mailbox` still delivering, the once-only re-poke verdict
from brief counting, handoff closes the loop, retired leads skip stall
math, no-session stalls hand off to the Human, the tampered-ledger alarm
with escalations still peeked, and verb wiring/usage exits).
