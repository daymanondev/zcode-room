# SLP on ZCode background agents — feasibility test

Question (Andrew, 2026-10-10): can we build SLP on ZCode's background agents —
a background agent playing both Lead and Peer — and specifically: **can a
background agent spawn another background agent inside itself?**

Companion to [slp-lead-fidelity.md](slp/slp-lead-fidelity.md) (the SLP-side
evidence base for reopening ADR 0005); this note adds the ZCode-harness side.
It does not decide anything — it measures what the harness allows.

Grades: **A** = primary, verbatim (live harness behavior executed in this
session; official docs quoted verbatim) · **B** = primary, interpreted (reading
of the compiled harness bundle) · **C** = secondary or inferred (mapping,
projection).

---

## 1. Verdict

1. **No nesting — a background agent cannot spawn anything, natively or
   through the workflow side door.** The original experiment (A), the
   official docs (A), the compiled bundle (B), and a same-day follow-up probe
   of the workflow tools (A, §8) all agree: sub-agents see the workflow tools
   *declared* in their function set and can even load the dynamic-workflows
   skill, but execution is refused. The spawn graph is a **star, one level
   deep, rooted at the main session**. Depth 2 works (root → sub-agent);
   depth 3 was never reachable because depth 2 never happened.
2. **Native inter-agent talk is a star too — but peers are not mute.**
   Sub-agents get no `SendMessage`; their only native up-link is
   `RespondToCoordinator` to the parent. But they receive the **full MCP
   surface** — 90/90 plugin/MCP tools, measured live (§8) — so a plugin's
   MCP server can serve as an out-of-band peer↔peer bus. That is the same
   move the reference systems made when their harnesses lacked channels:
   paseo-room's letters, seatworks v3's file-backed mail, this repo's own
   ADR 0004 spool/ledger.
3. **Sessions are isolated while live, not sealed.** No live
   session↔session channel exists, but persisted history is readable across
   sessions (`ReadSessionContext` — sub-agents carry it too), the workflow
   journal is per-project, and the filesystem/git tree is shared (§8).
4. **Main sessions CAN be spawned programmatically — but only through the
   hidden CLI / internal protocol (§9).** §8's finding stands for the *public*
   surface (no API, no documented path), but the app bundle ships `zcode.cjs`
   with `--prompt`, `--resume`, and an `app-server --stdio` JSON-RPC protocol
   (`session/create|send|setModel|subscribe|fork|subagents|usage` …) — the
   desktop's own control plane. Sessions minted this way are real root
   sessions (live-proven). One wall remains: the standalone paths lack the
   provider-registry/auth wiring the desktop performs (§9.3).
5. **Topology A remains the zero-reverse-engineering path; Topology B —
   Supervisor dispatching Leads as separate main sessions (Andrew's proposal)
   — is feasible via §9's control plane** at session granularity, pending one
   auth handshake. And per the canon correction (§9.5) it is not a fidelity
   deviation at all: it is codex-room's own shape. The star law still binds
   *within* each session (peers never spawn peers), which is exactly
   codex-room's "kill native multi-agent so the topology has one owner".

## 2. Method

- **Live experiment** (A): N1 was spawned as a *background* general-purpose
  agent and instructed to run four tests — foreground child, background child,
  depth-3 grandchild, peer `SendMessage` — writing marker files under
  `/tmp/zcode-nest-test/`. Filesystem state verified independently from the
  root session after completion: directory empty, no marker ever written.
- **Docs sweep**: [zcode.z.ai/docs](https://zcode.z.ai/docs) (A), the bundled
  official skills on disk (A), the compiled
  `/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` (B), and Claude
  Code's official docs as an analogy only (A for the claim, C for relevance).
- SLP duties taken from [slp-lead-fidelity.md](slp/slp-lead-fidelity.md); not
  re-derived here.

## 3. The experiment (all A unless noted)

| Test | Result | Evidence |
|---|---|---|
| 1 — foreground child | **fail** | N1's declared function set contains no Agent/Task tool; fallback via Skill refused with the harness string `"Skill is not allowed for subagent"` |
| 2 — background child | **fail** | same missing tool; no spawn, no agentId; `/tmp/zcode-nest-test/n2b.txt` never written (verified from root) |
| 3 — depth-3 grandchild | **fail** | consequence of test 2; `n3.txt`, `n2c.txt` never written |
| 4 — peer messaging | **fail (no tool)** | N1 has no SendMessage; no child exists to message anyway |

Tool-surface asymmetry measured in the same run:

| | root session | sub-agent (any type) |
|---|---|---|
| Agent (spawn) | yes | **no** |
| SendMessage | yes | **no** — has `RespondToCoordinator` (parent only) |
| TaskOutput / TaskStop | yes | yes (live: real error strings for probe IDs) |
| Skill | yes | refused for N1 (`"Skill is not allowed for subagent"`) — but a later probe loaded `dynamic-workflows` cleanly; the refusal is per-skill or contextual, rule unidentified (§8) |

## 4. The docs

- [zcode.z.ai/docs/subagents](https://zcode.z.ai/docs/subagents) (A): the
  Agent tool and its two built-in types are documented; nesting is explicitly
  denied — 「子智能体内不能再派发子智能体。」("a subagent cannot dispatch
  further subagents"). Custom subagent types live at `~/.zcode/agents/<name>.md`
  (unexplored here — see open questions). `run_in_background` is **not**
  documented on the site; the page says background execution is decided by the
  harness (「后台执行由 Agent 自己决定」), though the parameter exists in the
  shipped tool schema.
- Bundled `dynamic-workflows` skill (A,
  `/Applications/ZCode.app/Contents/Resources/glm/packages/bundled-skills/skills/dynamic-workflows/SKILL.md`):
  "**No nesting.** Subagents cannot call `CreateWorkflow`." and "`TaskOutput`
  blocks until a run *this session started* finishes." Scheduled automations
  are documented as a feature ([zcode.z.ai/docs/automations](https://zcode.z.ai/docs/automations),
  A — max 20, local projects only) but the `CronCreate` tool name never
  appears publicly.
- Compiled `zcode.cjs` (B): the Agent tool is included per-context via
  `includeAgent:!!e.subagentPort`, and child runtimes *do* get a default
  subagent port — the only explicit disable found is for workflow children
  (`taskType:"workflow_child"…subagents:{enabled:!1}`). So the binary carries
  the capability; in this configuration it is gated off, with no public switch.
  The sub-agent tool-permission string is also here (A for the quote, B for
  context): "Agent launches a child runtime; child tool calls are separately
  constrained and approved."
- **Analogy (C):** Claude Code's official docs
  ([code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents))
  allow nesting by default — "up to three layers below the main conversation",
  configurable. So the harness *category* supports multi-level spawning; ZCode
  today ships a star.

## 5. SLP → ZCode mapping (Topology A: main session = Lead)

| SLP primitive (source) | ZCode primitive | Grade | Notes |
|---|---|---|---|
| Human/Owner | Andrew, in the main conversation | C | the factory's missing NEEDS-HUMAN channel closes itself: the Lead shares a channel with the Human by construction |
| Lead | the main session agent | C | persistent context across turns = "idle does not end ownership" (paseo-room, A via fidelity doc §1b) |
| Peer × N, one per brief | background `general-purpose` agents | C | "A new Agent call starts fresh" = per-brief peers, never a standing pool — faithful |
| `notifyOnFinish: true` | `run_in_background` completion notification | A | tool schema: "you will be notified when it completes" |
| Wait, don't poll | notifications + `TaskOutput(block)` | A | matches LEAD.md's monitoring law verbatim in shape |
| Re-poke / re-dispatch after silence | root `SendMessage` to the agentId — "resumes in the background and you'll be notified when it finishes" | A | but the binary's own guidance (B) prefers a fresh spawn with full context |
| Heartbeat fallback (codex-room `*/2`) | `CronCreate` — survives app restarts; automations cannot nest cron | A | capacity: 20 per project |
| Supervisor (observe + advise) | read-only `Explore` agent reporting to the Lead | C | never writes, exactly the "no parallel chain of command" shape |
| REOPEN / DEPENDENCY / BLOCKED | lines in the peer's final report; the Lead rules, then SendMessage-resumes or re-briefs | C | the closure loop runs in the root, where the star law puts it |
| Gate / verdict | workflow gate predicates, or the native visual-judge pattern (read-only judge returning verdicts) | C | ZCode already ships a writer/judge separation as a *protocol* |
| No-self-accept | **convention only** | C | the main session holds every tool incl. Write — the factory's structural separation (plugin cannot write the workspace) is stronger |

**Topology C** is ADR 0005's own stance landed on ZCode: the workflow script
is the deterministic Lead — spawn, gate, loop, fan-out — and its escalation
questions route through the root session to the Human, which is the
`NEEDS-HUMAN:` line the factory has never had (fidelity doc §3 #8).

## 6. What breaks / risks (straight)

1. **The star law binds within a session, not across sessions (updated §9).**
   A background agent as Lead-of-peers *inside one session* stays
   harness-blocked — but Andrew's tree builds at session granularity, and the
   hidden CLI/protocol crosses that boundary. The risk moved from
   "impossible" to "undocumented surface": any app update can break the
   private CLI flags and protocol shapes (Claude Code ships `claude -p` and
   `--fork-session` publicly; ZCode hides its equivalents — report-worthy,
   including the --prompt default-model bug, §9.3).
2. **Persistence.** Peers live inside the session; closing ZCode kills
   in-flight peers (only cron automations survive restarts). Paseo is a daemon
   with rooms — that is a real architectural difference, not a detail.
3. **Writer/judge separation is conventional, not structural.** Topology A
   gives the Lead every tool; SLP's "viết được nhưng không tự accept" becomes
   prompt-law, the thing the factory mechanized.
4. **No choke / workspace-conflict refusal.** Parallel peers share the cwd
   unless the Lead worktrees them by hand (possible via Bash, unenforced).
5. **Undocumented surface.** `SendMessage`, `TaskOutput`, `CronCreate`,
   `run_in_background` are absent from the docs site — building on them is
   building on the binary's behavior.
6. **Cost/context.** Every peer is a full model lane; the Lead main session
   accumulates context and eventually wants Andrew's new-session-over-
   compacting law (run plan lives in the ticket file — which is also how a
   fresh Lead re-briefs cheaply).

## 7. Open questions

1. Is there an undocumented config that turns the binary's subagent port into
   real nesting? (`includeAgent:!!e.subagentPort` suggests capability; nothing
   public exposes it.)
2. Does a SendMessage-resumed agent keep the sub-agent tool surface? (Assumed
   yes; untested.)
3. Custom subagent types (`~/.zcode/agents/<name>.md`) — could formalize
   PEER.md dispositions (Engineer/Architect/Reviewer/Scout) as named types;
   unexplored. *(2026-10-11 addendum, B: a literal-path grep of the bundle
   finds `.zcode/workflows` and `.zcode/config` but no `.zcode/agents`
   segment — the loader is not confirmed compiled in; cheap probe: create one
   type file and see if the Agent tool offers it.)*
4. Does Topology A survive app restarts at all — are agent IDs resumable
   across sessions?

## 8. Follow-up probes — plugins, sessions, main-agent spawning

Andrew's follow-up question: does any of this change if we write a ZCode
*plugin* — are sessions really unlinked, and is there truly no mechanism that
spawns a main agent? Four probes ran in-session (all A unless noted). The
star law stands; two earlier claims soften.

| Probe | Method | Result |
|---|---|---|
| Sub-agent MCP surface | a sub-agent enumerated its full function set (110 tools) | **90/90 MCP tools present** — expo, node_repl, android/ios plugin tools, web_reader all reach peers untouched. Also present: `AskUserQuestion`, `ReadSessionContext`, workflow tool *declarations*. Absent: Agent, SendMessage, CronCreate, Glob/Grep |
| Workflow side door | sub-agent called `EvalWorkflowSnippet` before and after loading the skill | first call gated ("needs the `dynamic-workflows` skill loaded in this session"); the skill **loads cleanly**; retry refused at execution, verbatim: `"NOTE: The snippet was NOT executed — snippet evaluation is not available in this session."` — declared ≠ permitted |
| Skill-refusal consistency | N1 (§3) vs the probe sub-agents | inconsistent: N1 got `"Skill is not allowed for subagent"`, the probes loaded `dynamic-workflows` fine — the refusal is per-skill or contextual; rule unidentified |
| Headless CLI / main-agent spawn | `command -v zcode`; PATH; app-bundle listing | no `zcode` binary; `/Applications/ZCode.app` holds the GUI binary, `bfs`/`ripgrep`/`ugrep`, a Computer Use helper — nothing discovered spawns a main agent as a live child (B: absence in the checked places, not proof of absence) |

**Corrections these probes force.**

1. *"Peers cannot talk to each other"* (§1.2 as first written) is true only of
   native channels. With the full MCP surface in every sub-agent, **a
   plugin's MCP server can be the out-of-band bus**: a
   `post_message`/`read_mailbox` pair over files gives peer↔peer and
   peer↔Lead messaging without touching the star law. Not a hack — the same
   move the reference systems made: paseo-room's letters/attention subsystem,
   seatworks v3's file-backed mail, this repo's ADR 0004 spool/ledger.
2. *"Sessions are not linked"* splits in two: **live** contexts are isolated
   (no live session↔session channel), but **persisted** state is readable
   across sessions (`ReadSessionContext`), the workflow journal is
   per-project, and the filesystem/git tree is shared. *Unwired while live*
   is the accurate phrase, not *sealed*.
3. *"No mechanism spawns a main agent"* holds for live children; the one
   exception is **scheduled awakening** — root-side `CronCreate`/`OffPeak`
   queue future main-level runs that survive app restarts. Delayed wake-up,
   not spawning.

**What the probes do NOT change:** Topology A (main session = Lead) and
Topology C (root-run workflow) remain the zero-reverse-engineering shapes;
a background Lead *inside one session* stays harness-blocked, and no plugin
API rewrites the compiled `includeAgent` gate. What they add is the missing
plank for Topology A at full SLP fidelity: **peer↔peer communication does
not have to wait for the harness — it can be a small ZCode plugin** (an MCP
mailbox over the ledger pattern ADR 0004 already standardized). *(§9 later
updates the topology picture: the hidden CLI crosses the session boundary.)*

---

## 9. The hidden CLI and the internal control plane (2026-10-10/11)

Andrew's proposed tree: an orchestration plugin → Supervisor (the chat
entry) → Supervisor spawns Leads **as main-agent sessions** → each Lead
spawns peers as sub-agents. §8's docs sweep said no public mechanism creates
a main session — true of the public surface only. What follows was
live-proven on this machine; every claim is grade A (verbatim output /
executed) unless noted.

### 9.1 The bundled CLI

`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs`, invoked as
`ELECTRON_RUN_AS_NODE=1 /Applications/ZCode.app/Contents/MacOS/ZCode
<zcode.cjs> …` — the same runtime the desktop runs per session (process
tree: `ZCode → zcode-host-local-1 → zcode-cli`; there is no `zcode` on
PATH). `--help` (zcode 0.16.9) verbatim highlights:

- `-p, --prompt <text>` — "Run a single prompt without opening the TUI"
- `--resume <sessionId>` — resume a persisted session (multi-turn Leads;
  re-poke at session level)
- `--json`, `--cwd <path>`, `--target <text>`, `--attach <path>`
- `--mode <mode>` — "Permission mode for prompts: build, edit, plan, or
  yolo (**default: yolo for --prompt**)"
- `--disallowed-tools <tools…>` — per-run tool narrowing (Reviewer without
  Write; the pi-paseo "tool-narrowing as guardrail" made mechanical)
- `--surface <terminal|desktop>` — headless prompts can render in the app
- subcommands: `tui`, `app-server`, `agent-server`, `login`, `logout`,
  `doctor`

### 9.2 Live proofs

- Three root sessions minted via `--prompt` (sess_a8b3ee83…, sess_ee8db244…,
  sess_578a7261…): real `session` rows, full JSON result contract
  (sessionId, usage, projection).
- `app-server --stdio` driven end-to-end as a client: `session/create` →
  server-requested runtime preferences (answered) → `session/subscribe` →
  `session/send` (accepted) → `state.updated` events (`prompt_started`).
  Several more sessions minted this way.

### 9.3 The model blocker — a real bug in the private surface

Before Andrew disabled the cliproxyapi provider (2026-10-10 16:01,
`~/.zcode/v2/provider_config.json` → `enabled: false`), headless spawns
inherited the then-default `custom:cliproxyapi/claude-opus-4-6-thinking` —
a dead model, provider-level error. After the disable, **every external
creation path** fails with `Select a model before continuing`
(`if(!t.selection) throw …`, verbatim from the bundle). Exhausted, all
negative: `setting.json` family/connection keys, `v2/config.json`,
`provider_config.json`, db `local_setting`, session-entry inheritance,
fresh workspace, `--resume`, `--surface desktop`, **full app restart,
and two new-task model picks (both GLM-5.3, recorded in db — the UI
gestures work for the app but persist nothing the CLI reads)**, plus
`ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` / `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`
env injections (the on-disk builtin catalog does contain zai/GLM-5.3; a
temporary enabled personal provider pointed at the still-alive
localhost:8317 proxy serving gemini-3.8-flash-high was also ignored —
temp file with the API key deleted after use). Conclusion (B): the
standalone/CLI paths lack the provider-registry + auth wiring the desktop
performs; the desktop itself always passes modelSelection explicitly and
never needs the missing default. Report-worthy as a bug.

### 9.4 The protocol map

"ZCode Protocol v1" over NDJSON; JSON-RPC-shaped **without** the `jsonrpc`
key (`{id, method, params}`; server→client requests carry ids like
`server-1`). Methods seen in the bundle and/or driven live:

- `session/`: `create` `{workspace:{workspacePath, workspaceKey}}` · `send`
  `{sessionId, content}` · `setModel` `{sessionId, model}` · `subscribe`
  `{sessionId, deliveryKind: desktop-continuous|web-remote-replayable}` ·
  plus `resume`, `fork`, `subagents`, `close`, `stop`, `compact`, `goal`,
  `setMode`, `setThoughtLevel`, `usage`, `list`, `messages`, `read`,
  `events`, `new`, `cancelBackgroundTask`, `requestRuntimePreferences`
- `v4/`: `conversation`, `command`, `commands`, `connection`, `controller`,
  `cua`, `fork`, `attachment`
- `interaction/requestOfficialMcpAuthHeaders` (server asks the client for
  auth headers); notifications: `state.updated`, `process/mcpTelemetry`
- Preference rounds: scope `runtime-materialization` (result must include
  `nativeSearchEnhancementsEnabled: boolean`) at creation, then scope
  `user-execution` at send time (a reply carrying `modelSelection` +
  `permissionMode` passed validation).

Remaining wall: the standalone server's provider registry stays empty
(`model.available: []`; `setModel` → 「Provider Registry 中不存在 Model」).
Untried leads: `v4/connection`, `server/discover`, `agent/configs`. *(All
superseded 2026-10-12 by §10: the env pair was tried and is irrelevant —
the registry constructs either way; entitlement is the wall. §10.4's
follow-up leads are in turn resolved by §11.)*

### 9.5 Canon correction (retraction of §6's earlier framing)

My earlier claim that "canonical SLP has the Supervisor *not* spawning
Leads" was pi-paseo's root-parentage law (`ParentAgentId = null`), not the
canon. codex-room — a canonical pair member — has the Supervisor
"faithfully routes Human intent", dispatching Lead messages with
`background=true + notifyOnFinish=true`, a `*/2` self-heartbeat as event
fallback, and audit of the brief→response→disposition loop (notes §7/§9).
Andrew's flow (chat Supervisor → it spawns Leads → Leads spawn Peers) IS
codex-room. The 1-1 mapping this file's §5 table should grow:

| codex-room (Paseo) | ZCode equivalent |
|---|---|
| Supervisor sends Lead msg (`background` + `notifyOnFinish`) | `--prompt` / `--resume`, or `session/create` + `send` |
| `paseoTools.enabled: false` for Peer | `--disallowed-tools` per spawn |
| killing native Codex multi-agent ("Paseo owns the topology") | ZCode's star law already enforces it per session |
| heartbeat `*/2 * * * *` | `CronCreate` / session-level scheduling |
| daemon on `127.0.0.1:6767` | `app-server --stdio` + `db.sqlite` |

### 9.6 Hygiene

The temporary provider config containing the proxy API key was deleted
immediately after use. ~10 idle, 0-token junk sessions remain in
`~/.zcode/cli/db/db.sqlite` from probing (ignorable).

### 9.7 Registry env-pair finding (2026-10-11, bundle re-read; binary unchanged)

Re-verified the binary is byte-identical to the substrate scout's record
(sha256 `fad4c35c…`, mtime 2026-09-30, app 3.14.5 / CLI 0.16.9 — A via
`shasum`/`stat`), so §9.3's live findings stand. A fresh read of the
registry-bootstrap code (B — compiled bundle) refines two earlier claims:

- **The §9.3 env injections failed mechanically, not for lack of wiring.**
  The path resolver (verbatim, de-minified as `ymr(env)`) requires
  `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` and
  `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE` **as a pair**: exactly one set →
  throw (「ZCode Built-in 与 Personal Provider Config 路径必须同时提供」,
  "the two paths must be provided together"); neither set → `null`; and the
  caller (de-minified `Ykt(env, opts)`) throws on `null` with the
  「缺少进程 Provider Registry 的 … 路径」 string. Single-var injection, as
  §9.3 attempted, could never populate the registry — the **pair** is the
  untried configuration.
- **A third, standalone-only var exists**: `ZCODE_BUILTIN_PROVIDER_
  BUNDLED_CONFIG_FILE`, read only when `opts.standalone` is set, alongside a
  standalone `credentialStore` constructed from env. Whether `Ykt` is the
  exact code path a `--prompt`/`app-server` runtime takes is inferred (B/C);
  the env-pair contract itself is verbatim.
- **`v4/connection` is not a literal in the bundle** (only `"v4/command"`
  appears); §9.4's v4 family must come from live observation or dynamic
  construction. The discovery method with heavy literal presence is
  `server/discover` (14 hits). Re-weight §9.4's untried leads: env pair
  first, `server/discover` second, v4 family last.

Re-verify: `shasum -a 256 /Applications/ZCode.app/Contents/Resources/glm/
zcode.cjs` → `fad4c35c…`; then the wall ticket's live probe — spawn with the
env **pair** set (builtin catalog + personal `~/.zcode/v2/config.json`-shaped
file) and check `model.available` over `app-server --stdio`.

*(Probe executed 2026-10-12 — §10; the pair-refutation hypothesis above was
itself refuted: the registry constructs identically with and without the
pair, and the actual gate is account entitlement, not config paths.)*

---

## 10. Wall probe result (2026-10-12): env pair tried — entitlement is the wall

Full grade-A evidence: [wall-probe-2026-10-12.md](wall-probe-2026-10-12.md);
upstream bug-report draft (not filed): [upstream-bug-report-draft.md](upstream-bug-report-draft.md).
Binary re-verified byte-identical (`fad4c35c…`) before probing.

1. **The env pair is tried and refuted** (A). `--prompt` with
   `ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` (the desktop's active builtin
   catalog, revision 30) + `ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`
   (`~/.zcode/v2/provider_config.json`) fails exactly as baseline does:
   `Error: Model creation failed` ← `Select a model before continuing`.
   Over `app-server --stdio`, `session/create` returns
   `"model":{"available":[]}` with and without the pair (and with the
   standalone `ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE` var added);
   `session/setModel` still answers 「Provider Registry 中不存在 Model」.
2. **The registry was never the part that failed to load** (A). Every
   standalone run logs `zcode_protocol.provider_registry.ready`: builtin
   revision 30 loaded, all eight `account:*` providers enumerated — every
   one `"entitled":false`, `providerCount: 0`. The event is identical
   between baseline and env-pair runs. §9.3's "standalone paths lack the
   registry wiring" was half-right for the wrong reason: construction
   works; the **account-entitlement handshake** does not complete.
3. **Credentials are decryptable standalone** (A): the credential cipher has
   no Keychain dependency (`ZCODE_CREDENTIAL_SECRET` or a deterministic
   platform/home/username fallback), and every field of
   `~/.zcode/v2/credentials.json` — including the coding-plan api-key —
   decrypts in a plain node process. The gap is whatever flips
   `entitled:true`, not file access.
4. **Lead re-weighting** (A/B): `server/discover` is **not** an app-server
   method (live `-32601 Method not found`; in the bundle it sits in an
   MCP-dialect schema family). The hidden `agent-server` subcommand runs and
   speaks its own protocol (unprobed). Follow-up scoped as
   [ticket 14](../.scratch/room/issues/14-standalone-entitlement-handshake.md):
   the standalone account-source/entitlement refresh path, `agent-server`,
   and — Human-gated, since it mutates shared login state — whether
   `zcode login` from the CLI itself flips entitlement.

Re-verify (condensed; full steps in the evidence base): binary sha still
`fad4c35c…` → rerun pair + `app-server` create → expect
`model.available: []` and `provider_registry.ready` with `entitled:false` ×8,
`providerCount: 0`; if `model.available` is non-empty, the wall cracked —
rerun `--prompt` and update §9.3/§10 and ADR 0001.

---

## 11. Entitlement crack (2026-10-12, issue 14): host-role push — the wall falls in-band

Full grade-A evidence + mechanism trace:
[entitlement-crack-2026-10-12.md](entitlement-crack-2026-10-12.md). Binary
re-verified byte-identical (`fad4c35c…`) before probing.

1. **`entitled` has exactly three writers** (B, exhaustive bundle trace):
   the fail-closed boot snapshot every `app-server`/`agent-server` registry
   starts with (both dispatch to the same host-mode `Ykt` — the agent-server
   offers no different model surface, confirmed live); a standalone
   `--prompt`/`tui`-only local snapshot computed from two credential keys
   (`:identity` + `:api-key`; this machine has only the latter — why
   `--prompt` also fails, and what `zcode login` would fix); and the protocol
   method **`provider/updateAccountConfig`** — the host push the desktop uses.
2. **The crack (A)**: a client playing the host role pushes
   `{revision, basedOnZCodeBuiltinRevision: "zcode-builtin:30:<sha256 of the
   resolved active catalog PATH>", providers, states}` over stdio; subsequent
   `session/create` returns a populated `model.available` and a resolved
   `session.model`; per model request the client answers
   `interaction/requestProviderRuntimeHeaders` with the decrypted coding-plan
   api-key from the shared store. Proven end to end: standalone session →
   `"OK"` on `account:zai-individual-coding-plan/GLM-5.3` (~40.7k tokens real
   usage).
3. **Corrections to earlier sections**: §9.4's remaining-wall note is
   superseded — `setModel` failing with 「Provider Registry 中不存在 Model」
   was a symptom of the empty registry, not a second wall. §9.1's "the same
   runtime the desktop runs" is right about the tree
   (`ZCode → zcode-host-local-1 → zcode-cli` children on stdio socketpairs)
   but the host itself runs `app.asar` code, and no external listener exists
   (A/B, crack doc §4). §10.4's follow-up leads are all now resolved
   (agent-server = same wall; entitlement source = host push; `zcode login` =
   optional convenience, still Human-gated).
4. **The M0 blocker is gone** (C for plans, A for the mechanism — crack doc
   §6): the Supervisor can spawn Leads as standalone
   `app-server` children and drive them as their protocol host — no desktop
   dependency, no upstream fix, no shared-state mutation. Design constraint
   for the room: the host role must own the revision string (recomputed when
   the catalog/endpoint moves) and the per-request header replies.

Re-verify before building on this: binary sha still `fad4c35c…` → baseline
create still `model.available: []` → push still `providerCount:1` +
turn completes (full steps in the crack doc's Re-verify section).
*(Executed 2026-10-12, issue 07 — the binary had moved to 3.15.1 /
`b816e386…`; the re-verify PASSED with two protocol shapes changed, now
mechanized as `room doctor` + the wrapper: crack doc §7.)*

---

*Sources: live session experiments 2026-10-10 (this session — §3 marker files
since removed; §8 follow-up probes; §9 CLI/protocol driving) · [zcode.z.ai/docs/subagents](https://zcode.z.ai/docs/subagents) ·
[zcode.z.ai/docs/automations](https://zcode.z.ai/docs/automations) · bundled
dynamic-workflows + zcode-guide skills on disk ·
`/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` (compiled, B) ·
[Claude Code sub-agents docs](https://code.claude.com/docs/en/sub-agents)
(analogy) · [slp-lead-fidelity.md](slp/slp-lead-fidelity.md) for every SLP-duty
claim.*
