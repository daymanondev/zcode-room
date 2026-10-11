> Copied 2026-10-11 from research-slp `.scratch/factory-v0.0.9/research/substrate-scout.md`
> (that ticket's decision history stays there; this copy is reference for the
> ZCode-side facts in its section 2).

# Substrate and conversation scout — where the Supervisor can actually sit

Ticket 01 of the v0.0.9 map, resolved 2026-10-10. ADR 0006 §6 leaves the
Supervisor's substrate a design choice (ticket 02): a **Paseo daemon agent**
(paseo-room's way) or a **ZCode session tree** (the hidden-CLI feasibility).
This scout pins the code-level facts both candidates rest on, every claim
graded **A** (read from source / measured live, no model calls), **B**
(documented, second-hand), or **C** (inferred).

Method: the installed daemon source was read by resolving
`~/.local/bin/paseo` → `/Applications/Paseo.app/Contents/Resources/bin/paseo`
(a shell script exec'ing the Electron Helper) and extracting
`node_modules/@getpaseo/server` and `node_modules/@getpaseo/cli` from
`/Applications/Paseo.app/Contents/Resources/app.asar` (the same tree the
v0.0.8 cost scout read `AgentUsageSchema` from). The trial home
`~/.paseo-factory` was only read (config, pid, process list, read-only
`paseo daemon status` / `provider ls` / `agent ls` queries); nothing was
written there, `~/.paseo` (prod, pid 10606) was never touched. paseo-room
v0.19.0 files were live-fetched from `raw.githubusercontent.com` today.

---

## 1. The Paseo daemon side

### 1.1 The installed tree (all A)

- `~/.local/bin/paseo` is a symlink to
  `/Applications/Paseo.app/Contents/Resources/bin/paseo`, a POSIX sh script
  that routes macOS CLI invocations through the Electron "Paseo Helper" so
  daemon supervision does not inherit app UI lifecycle.
- App version **0.11.1** (`CFBundleShortVersionString`, Info.plist); the
  daemon ships as compiled JS inside `app.asar`:
  `node_modules/@getpaseo/server` (package.json version 0.11.1) and
  `node_modules/@getpaseo/cli`. Local extraction copies were made to
  `/tmp/paseo-server-src` and `/tmp/paseo-cli-src` for this scout only.
- The trial daemon is **live and is 0.11.1**: `~/.paseo-factory/paseo.pid`
  records pid 81222 / `127.0.0.1:6799`; `lsof` shows pid 6443 ("Paseo
  Daemon") listening on 6799; `paseo daemon status --home ~/.paseo-factory`
  answers `daemonVersion: 0.11.1`, `localDaemon: running`, and a plugin
  child process (`plugins/plugin-process.js`) is running — the
  `paseo-factory` plugin is loaded (`config.json`: `pluginsEnabled: true`,
  plugin `paseo-factory` from this repo's `plugin/` directory).
- Providers available on the trial daemon today (`paseo provider ls`, live
  read-only): **claude** (available; modes "Plan Mode, Always Ask, Accept
  File Edits, Auto mode, Bypass") and **copilot** (available; ACP session
  modes "Agent, Plan, Allow All"); codex / opencode / pi unavailable,
  antigravity / muse in error.

### 1.2 Conversational surfaces — what an Owner can type into (A unless noted)

1. **The Paseo app chat** (desktop window or the daemon-served web UI —
   `dist/server/server/web-ui.js` serves the bundled renderer; the desktop
   app at pid 9967 is the GUI front of the same daemon). Chat sends arrive
   over the daemon's WS session as `send_agent_message_request` and are
   handled by `handleSendAgentMessageRequest` (`dist/server/server/session.js`
   ~line 6142): it builds the prompt (text + images + attachments) and calls
   the universal `sendPromptToAgent` with `activeTurnBehavior ?? "interrupt"`
   and `clearPendingPermissions: true`, then waits for run start.
2. **The CLI, turn-based**: `paseo agent send <id> [prompt]` with
   `--prompt`, `--prompt-file`, `--image`, and `--no-wait`
   (`@getpaseo/cli/dist/commands/agent/send.js`) — by default it waits for
   finish (10-minute internal timeout) and reports status "completed" /
   "permission" (the agent is waiting for a permit answer) / "error".
   `paseo agent run <prompt>` creates and starts a fresh agent headless
   (provider/model/mode/worktree/env/labels options; `--output-schema` for
   structured output) — this is the Driver's spawn primitive.
   `paseo agent attach <id>` streams an agent's timeline to the terminal
   (assistant text, tool calls, permission asks) but is **read-only — no
   stdin**, so a terminal "conversation" is `send` + `attach` side by side,
   not a REPL.
3. **Agent-to-agent**: the daemon exposes a full agent-facing MCP tool
   catalog (`dist/server/server/agent/tools/paseo-tools.js`):
   `create_agent`, `send_agent_prompt`, `get_agent_status`, `list_agents`,
   `cancel_agent`, `archive_agent`, `kill_agent`, `update_agent`,
   workspace/worktree tools, terminal tools (`create_terminal`,
   `send_terminal_keys`, `capture_terminal`…), schedule tools including
   `create_heartbeat` / `list_schedules`, `list_pending_permissions`, and
   `respond_to_permission`. It is served (a) natively to providers that
   support it (opencode declares `supportsNativePaseoTools`;
   `mcpInjectIntoAgents` defaults on) and (b) to any agent as a **stateless
   HTTP MCP endpoint `/mcp/agents`** on the daemon port, authenticated by
   capability token or daemon password (`dist/server/server/bootstrap.js`
   ~line 1073). `send_agent_prompt` from an agent-scoped caller defaults
   `background: true` + `notifyOnFinish: true`.
4. **Schedules**: `paseo schedule …` CLI commands and `create_heartbeat` —
   cron-shaped wake sources that prompt an agent on a cadence.

**Answer to "can a daemon agent hold an Owner conversation TODAY":** the
machinery is fully present and live on the installed trial daemon — an
agent, once created, is conversable from the app chat and from the CLI the
same moment (A). Creating the Supervisor agent itself writes daemon state
and was deliberately **not** done under this scout's read-only constraint;
it is the build ticket's first act (C, constraint note).

### 1.3 How a daemon agent is woken (A)

Every prompt path funnels through one function,
`sendPromptToAgent` in `dist/server/server/agent/agent-prompt.js`, whose
header states the law: *"Every surface that sends a prompt to an agent
(Session/WS, MCP, CLI-through-MCP, chat mentions, notify-on-finish) MUST go
through this so behavior can never drift between them."* The sequence:

- **unarchive** (a send to an archived agent unarchives it; with
  `unarchive: false` it is a silent no-op) → **load** (`ensureAgentLoaded`
  rehydrates a stored agent into a live session on demand) → optional
  **mode set** → **start run** with `replaceRunning: true`.
- If the agent has a turn running, `activeTurnBehavior: "steer"` steers the
  message into the running turn (the finish-notifier uses this); the app
  chat defaults to `"interrupt"` (cancel and replace), and clears pending
  permissions of the recipient.
- System-injected prompts are wrapped `<paseo-system>…</paseo-system>`
  (`formatSystemNotificationPrompt`) — "Used by chat mentions, schedule
  fires, and notify-on-finish".
- **Finish notifications** (`setupFinishNotification`): the caller arms a
  subscription on the child's lifecycle; on finish / error / needs-permission
  it sends the caller a `<paseo-system>` envelope with the child's last
  assistant message (truncated at 4000 chars), steering into the caller's
  running turn. One notification per arming; re-arming replaces.
- **Plugin lifecycle hooks** (`dist/server/server/plugins/lifecycle/index.js`,
  verbatim lists): events `agent.created`, `agent.closed`,
  `agent.turn_started`, `agent.turn_ended`, `agent.permission_requested`,
  `agent.permission_resolved`, `agent.archived`, `workspace.created`,
  `workspace.archived`; before-hooks `agent.create` (config + env mutable,
  cwd immutable), `agent.session_open` (**env-only** mutable),
  `workspace.create`. Fire-and-forget; a failing event handler is logged,
  never fatal.

### 1.4 Identity and permissions — what the seat can actually do (A)

- **OS identity**: an agent is a provider session process spawned by the
  daemon, which runs as the desktop user (andrewpham). The trial daemon's
  copilot provider config pins `HOME`/`USER`/`PATH` env explicitly. So a
  daemon agent's shell commands run **as the user, with the user's
  filesystem powers** — same as any local CLI. (A for the process/env
  facts; "full user powers" as a consequence is A-adjacent trivially true.)
- **Injected identity**: every agent session's env gets `PASEO_AGENT_ID`
  and `PASEO_AGENT_CWD` (`buildLaunchContext`, agent-manager.js) — this is
  what makes `factory-claim`'s agent stamp and `paseo run`'s caller
  resolution work inside agent shells.
- **Permission asks**: a provider session surfaces asks as
  `pendingPermissions` on the snapshot. They are answerable by: the app UI,
  the CLI (`paseo permit allow|deny|ls <agent>`), **any agent-scoped MCP
  session** (`respond_to_permission` tool — i.e. another agent can answer a
  seat's ask), and **plugins** via the `agent.permission_requested`
  lifecycle hook. A permission response may trigger a follow-up turn
  (`respondToAgentPermission` restarts the run).
- **Modes gate asking**: mode is per-provider ("default" / "Always Ask" /
  "Bypass" / "Allow All" etc. as listed above); the factory choke pins
  contracted agents to mode `"default"` at create (`PINNED_MODE_ID` in
  `plugin/server/choke.ts`) so asks always surface.
- **The choke is scoped to contracted agents only**: `onPermissionAsked`
  returns early when `factory.liveContractFor(agent.cwd)` is undefined —
  "not a contracted agent — not our ask to answer" (`plugin/server/choke.ts`,
  verbatim). A **Supervisor seat — by definition uncontracted — is not
  judged by the choke today**; its asks (if its mode asks at all) surface to
  the Owner through the normal daemon permission UI.
- **The factory spool** (`plugin/server/spool.ts` + `index.server.ts`):
  request/reply/processed files under
  `~/.paseo-factory/plugin-state/paseo-factory/spool/`. The Owner CLIs are
  `node plugin/bin/factory.mjs --home ~/.paseo-factory contract|run|accept`
  (runbook), and `factory-claim` + the git shim are put on **every agent's
  PATH** by the `agent.session_open` env injection, while `factory.mjs`
  is *"never on an agent PATH"* (index.server.ts header — convention, not
  enforcement).
- **Attribution gap, code-level**: `ContractRequest` and `AcceptRequest`
  carry **no submitter field at all** (only `ClaimRequest` optionally
  carries `agent`, stamped from the env by `factory-claim`); the ledger's
  `AttemptAccepted` event is `{seq, ts, event, task, attempt}` — **no
  accepter identity** (`plugin/server/core/events.ts`). The spool validates
  request *shape*, never *who* dropped the file; any process running as the
  OS user can submit a contract or an accept (A for the absence of any auth
  check; C for the exploitation implication). ADR 0006's "the Ledger always
  records who accepted" therefore has **no plumbing today** on either
  substrate.
- **Metering**: agent snapshots carry `lastUsage` =
  `AgentUsageSchema {inputTokens, cachedInputTokens, outputTokens,
  totalCostUsd, contextWindowMaxTokens, contextWindowUsedTokens}`
  (`@getpaseo/protocol/dist/messages.js` line 251 in app.asar) — the exact
  source the v0.0.8 Meter reads; a daemon-lane Supervisor is meterable by
  the existing machinery.

### 1.5 What paseo-room v0.19.0's Supervisor actually uses (fetched today)

- **It is a plain Paseo daemon agent.** `startSupervisor`
  (`src/runtime-plugin/server/attention/seat-starter.ts`, v0.19.0): the
  operator starts it **from the panel** in "an existing non-Git directory"
  (refusal `path_in_repository`: "a Supervisor stands outside the projects
  it supervises"); "Paseo creates both; the runtime chooses no model and
  creates no directory"; created with no parent and no prompt,
  idempotency-keyed. (A.)
- **Its conversation with the Human is the Paseo app chat with that agent**
  — the Supervisor relays in its own turns: "When Lead's message is a
  question for Human, relay it without answering it. When Human answers a
  question Lead asked, send that answer to Lead with `message_lead` at
  once" (`src/room/prompts/contract/supervisor.md`, "Momentum and Attention
  Letters" — A). Waking the Supervisor is the runtime's deterministic
  attention letters (page/now/digest) — B, fully mapped in
  `research/lead-seat-wake-machinery.md` §1, re-verified key files today.
- **Its tool surface**: Paseo's own (`list_agents`, `get_agent_status`,
  resuming/creating Lead children with `create_agent`) plus the room
  runtime's injected MCP tools `room_status`, `runtime_findings`,
  `message_lead`, `attention_feedback` (README — A); it "cannot change an
  assignment". Peers get exactly `ask`/`handoff` (`mcp__paseo_room__*`).
- **Permissions posture of the reference**: paseo-room runs Codex seats
  with `sandbox_mode: danger-full-access` and `approval_policy: never` —
  "A seat that stops to ask for permission cannot be driven headless"
  (README config table — A) — and "the runtime never answers a permission
  for a seat" (Claude Peers' first `ask`/`handoff` call is approved by the
  Human in Paseo). I.e. the canonical system **removed the permission
  surface for seats** rather than mechanizing it — the opposite trade from
  the factory's choke.

---

## 2. The ZCode side

### 2.1 Re-verification of `research/zcode-slp-feasibility.md`'s load-bearing facts

- **Binary unchanged since the 2026-10-10 measurement**:
  `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`, mtime
  **2026-09-30 16:03** (predates the measurement; the file has not been
  modified since — A via `stat`), size 14,820,968 B, sha256
  `fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f`
  (recorded now as the reference hash — the feasibility doc recorded no
  hash, so "unchanged" rests on mtime; A). App bundle version 3.14.5; the
  CLI component reports **0.16.9**.
- **Star law still compiled in**: `includeAgent:!!e.subagentPort` present
  (grep of the current binary — A); sub-agents carry `RespondToCoordinator`
  only, no spawn/SendMessage (re-confirmed in this scout's own tool
  surface — the Skill tool refused with "Skill is not allowed for
  subagent" and no Agent tool exists here — A, live).
- **Headless main-session spawn**: the hidden CLI is real and measured
  today **without any model call** — `node zcode.cjs --help` and
  `zcode doctor` both run (A). Help text, verbatim where load-bearing:
  - `-p, --prompt <text>` — "Run a single prompt without opening the TUI"
  - `--surface <surface>` — "terminal or desktop" for headless prompts
  - `--mode <mode>` — "build, edit, plan, or yolo (**default: yolo for
    --prompt**)"
  - `--resume <sessionId>` — "Resume a persisted session by sessionId
    (`sess_...`)" and `-c, --continue` — "Resume the latest session for the
    current directory"
  - `--cwd <path>`, `--json`, `--disallowed-tools`, `--target`
  - commands: `app-server` (ZCode Protocol stdio server), `tui`,
    `plugins`, `skills`, `doctor`, `login/logout`, `version`
  A live `-p` round-trip was **not** re-run (no-live-model-call constraint);
  that it works end-to-end is B — the prior same-day measurement ADR 0006
  cites. Note a citation nuance for ticket 02: the feasibility doc's §8
  says "no `zcode` binary" *in PATH*; the hidden CLI is the app-bundle
  `zcode.cjs` driven by node — the ADR's "the hidden CLI spawns headless
  main sessions" is true of that artifact, not of anything on PATH.

### 2.2 The Supervisor's needs on the ZCode side

- **Owner's conversation surface**: the **TUI in a terminal** — "With no
  command, zcode opens the full-screen TUI" (A, help). The seat *is* the
  main session Andrew types into; background agents are its Peers and the
  harness's star law puts every spawn in that session (A, feasibility §1).
  A headless `-p --resume` turn is the scripted variant — machine-driven,
  not Owner-typed.
- **Session persistence / resume for a long-lived seat**: persisted
  sessions live in `~/.zcode/cli/db/db.sqlite` — `session` table keyed by
  `sess_*` id with `project_id`, `parent_id`, `directory`, `title`,
  timestamps (A, schema read read-only); `--resume <id>` / `-c` rehydrate
  by id or latest-in-cwd (A, help). Persisted history is readable across
  sessions (`ReadSessionContext` — measured in feasibility §8; the tool is
  present in this subagent's surface today). So a seat session survives
  process restarts as a resumable conversation, at the cost of a process
  per turn when driven headless (C).
- **How a seat runs factory CLI commands**: through its Bash tool — the
  same runbook vocabulary (`node plugin/bin/factory.mjs --home
  ~/.paseo-factory contract|run|accept`) the Owner uses (A, runbook +
  trivially the session's shell). Headless default `--mode yolo` means
  **no harness permission gate** on those commands (A, help text); in the
  TUI, build/edit/plan/yolo modes apply interactively. There is no daemon
  permission-hook equivalent — nothing like `agent.permission_requested`
  exists for a plugin to judge a ZCode session's shell (A for the absence
  in the measured surface; the harness has permission modes, not an
  ask-and-external-answer pipe).
- **Model lane + metering**: the session spends on the ZCode subscription
  (Z.AI OAuth login; this GLM lane). Per-request token truth exists in the
  same SQLite DB — `model_usage` / `turn_usage` tables keyed by
  `session_id` / `turn_id` (19,992 model_usage rows present; A schema +
  count). No dollar column observed (B); the v0.0.8 Meter's
  dollars-where-laned / tokens-where-counted posture would record tokens
  here.

---

## 3. The gap table

| | **Paseo daemon agent** (paseo-room's way) | **ZCode session tree** (feasibility way) |
|---|---|---|
| **Where Andrew types** | The Paseo app chat window (daemon-served UI / desktop app); CLI `paseo agent send` as the terminal fallback; `attach` for read-only watching (A) | The terminal TUI (`zcode` in the repo) — the seat is the main session (A) |
| **What wakes the seat** | Any inbound message via `sendPromptToAgent`: app chat, CLI send, agent MCP `send_agent_prompt`, `<paseo-system>` envelopes (mentions, schedule fires, finish notifications — steered into a running turn), heartbeat/schedule cron; an archived seat unarchives on send (A) | Andrew's typed turn; `SendMessage`-resume of background agents; `CronCreate`/automations can queue future main-level wakes that survive restarts — the only external wake of a closed session (A/B per feasibility §8); no daemon, no inbound message machinery (A) |
| **How the seat's acts reach the Ledger** | The seat runs shell (`factory.mjs contract/run/accept`, `factory-claim`) through its provider exec tool; `factory-claim` + git shim are already injected on every agent PATH via `agent.session_open`; spool replies land as ledger lines through the existing one-writer plugin (A). **Gaps:** `factory.mjs` is off agent PATHs by convention only; contract/accept spool requests carry no submitter; the choke does not judge uncontracted seats (A) | The seat's Bash runs the same `factory.mjs` commands; ledger lines arrive through the same spool (A). **Gaps:** identical submitter/attribution gap; headless default mode is yolo — no permission gate at all, and no hook surface for a choke equivalent; nothing injects PATH, so the seat calls CLIs by explicit path (A/C) |
| **Revocation** | Archive the agent (`paseo agent archive` / MCP `archive_agent`) — `agent.archived` event; a further send unarchives, so revocation also means ignoring the seat; acts fall back to the human CLI path; no factory-side seat state exists to clear (the Ledger is the only state) (A/C) | Stop typing / close the session; nothing delegated exists to revoke — but the session remains resumable by id (`--resume`), so revocation is social, not mechanical; same absence of factory-side seat state (C) |
| **Model lane it spends on** | A daemon provider lane (claude / copilot available on the trial today); per-agent `lastUsage` snapshot (tokens + `totalCostUsd` where the lane meters) — the existing Meter reads exactly this (A) | The ZCode subscription lane (Z.AI OAuth); token truth per turn in `model_usage`/`turn_usage` SQLite; no dollars observed (A/B) |
| **Honest "cannot do this today"** | No submitter identity on contract/accept, no accepter on `attempt_accepted`; the choke ignores uncontracted seats (a Supervisor seat is ungated unless its mode asks and someone answers — and paseo-room's own answer was to remove asking entirely); no NEEDS-HUMAN/INCIDENT ledger kinds yet (0.0.10); no seat-shaped wake grammar — the factory plugin has no attention/letter machinery, so wake sources are only Andrew's messages and daemon schedules; the trial daemon has no Supervisor agent created yet (this scout created nothing) | The star law: a seat that is a *background* agent cannot spawn its Driver-side agents — the seat must be the main session; in-flight background agents die with app close (only cron automations survive); no external wake of a closed session except cron (max 20, local-only); no permission-hook surface to judge the seat's shell; sub-agents have no native peer messaging (out-of-band MCP bus would be needed); dollar metering absent |

---

## 4. Load-bearing facts for ticket 02 (graded summary)

1. **Both substrates give Andrew a real conversation surface today**: the
   Paseo app chat / CLI send against a daemon agent (machinery live and
   measured, A), or the ZCode TUI main session (A). Neither requires new
   harness code to *talk*; both require build work to make the seat's acts
   *attributable and gated*.
2. **The two hard gaps are substrate-independent** (A, code-level): the
   spool carries no submitter identity for `contract`/`accept`, and
   `attempt_accepted` records no accepter — "who accepted" is unrecordable
   today on either substrate. Ticket 03 needs a submitter stamp regardless
   of the ticket-02 choice.
3. **The ungated-seat problem inverts between the substrates**: on Paseo
   the choke explicitly ignores uncontracted agents, so a Supervisor seat's
   shell is ungated *unless* the design pins a mode that asks and routes
   the answers (the hook surface exists — `agent.permission_requested` is
   plugin-visible, A); on ZCode headless the default is yolo and there is
   no hook surface at all, so gating would have to be prompt/convention
   (A). paseo-room resolved the same tension by removing permission asks
   for seats entirely (`danger-full-access`, `approval_policy: never`, A).
4. **Wake grammar**: Paseo already has inbound-message wake machinery for
   an idle/archived agent (send → load → steer/replace, `<paseo-system>`
   envelopes, schedules) — a Supervisor seat is woken by Andrew's message
   with zero new code (A). ZCode has typed-turn wake plus cron-only
   external wake (A/B). Neither has the NEEDS-HUMAN relay (that is 0.0.10's
   ledger kinds, by design).
5. **Metering asymmetry**: a Paseo-lane Supervisor is meterable by the
   shipped Meter verbatim (`lastUsage` snapshot, A); a ZCode-lane
   Supervisor has token truth in SQLite but no dollar lane (A/B).
6. **paseo-room precedent**: the Supervisor is exactly "a plain Paseo
   agent the Human chats with, woken by deterministic letters, holding
   routing tools but no assignment authority" (A, v0.19.0 sources) — i.e.
   the daemon-agent substrate is the canonical system's own shape, while
   the ZCode tree is the factory's measured alternative whose star law
   matches codex-room's "Paseo owns the topology" doctrine (A/B).

*Sources: extracted copies of `@getpaseo/server` 0.11.1 and `@getpaseo/cli`
from `/Applications/Paseo.app/Contents/Resources/app.asar` (files cited
inline: `session.js`, `agent-prompt.js`, `agent-manager.js`,
`tools/paseo-tools.js`, `plugins/lifecycle/index.js`, `bootstrap.js`,
`web-ui.js`, protocol `messages.js`; CLI `commands/agent/{send,run,attach}.js`,
`commands/permit/allow.js`); live read-only daemon queries
(`daemon status`, `provider ls`, `agent ls`, `lsof`, `ps`); trial-home reads
(`config.json`, `paseo.pid`); this repo's `plugin/` sources
(`index.server.ts`, `server/{spool,choke,paths}.ts`,
`server/core/events.ts`) and `docs/runbooks/live-run.md`;
`research/zcode-slp-feasibility.md` + live re-probes of
`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` (`--help`,
`doctor`, grep) and `~/.zcode/cli/db/db.sqlite` schema (read-only);
paseo-room v0.19.0 fetched 2026-10-10 from raw.githubusercontent.com
(`seat-starter.ts`, `supervisor.md`, `lead.md`, `README.md`,
`package.json`); `research/lead-seat-wake-machinery.md` as the prior
canonical map.*
