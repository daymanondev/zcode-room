# Role contracts v1 — traceability

Every law in the v1 contracts — the shared workspace protocol, the PEER
contract, the LEAD contract, and the SUPERVISOR contract (shipped with the
`/slp` skill, issue 08) — maps to its source, with
status:

- **kept** — same law, English wording, no mechanics change.
- **swapped** — law kept, mechanics replaced for ZCode; reason in the row.
- **added** — ZCode-room addition with no canon counterpart; source is the
  spec/ADR/skill that decided it.

Sources are the canon copies in `research/slp/` (grade A: verbatim files in
this repo; `slp-lead-fidelity.md` grades its own live fetches) plus the
spec (`.scratch/room/spec.md`, a decision record, not evidence) and the
substrate facts in `research/zcode-slp-feasibility.md` (grades as marked
there: star law and sub-agent MCP surface are grade A, live-proven
2026-10-10/11).

Contracts: `plugins/room/contracts/WORKSPACE-PROTOCOL.md` (carried in
`AGENTS.md` § SLP room protocol), `plugins/room/contracts/PEER.md`,
`plugins/room/contracts/LEAD.md`, and
`plugins/room/skills/slp/SKILL.md` (the Supervisor contract rides the
arming skill — re-invoking `/slp` reloads it, so no separate file).

The contracts are self-contained by design: each rides alone in a spawn
prompt, so shared blocks (the six-field handoff, the three reports, the
closure law) repeat between protocol and contracts deliberately — the canon
distributes the same laws the same way. The criterion's kept/swapped pair
covers canon laws; rows marked **added** are ZCode-room additions with no
canon counterpart, listed so the table stays exhaustive.

## 1. Shared workspace protocol

| Law | Source | Status | Note |
| --- | --- | --- | --- |
| Authority split: Human / Supervisor / Lead / Peer domains | codex-room `WORKSPACE_PROTOCOL.md`, quoted verbatim in `research/slp/codex-room-setup-notes.md` §9(a) | kept | Near-verbatim translation, plus the role glosses of `research/slp/02-bon-vai-supervisor-lead-peer.md` |
| Local commits are the writer's; off-machine effects are the Human's; line is reversibility, not the git verb | `research/slp/02-bon-vai-supervisor-lead-peer.md` §Human/Owner; `research/slp/PEER.md` §Ranh giới | kept | |
| Topology: Supervisor = main chat session, Leads = dispatched sessions, Peers = sub-agents | ADR 0001; spec §Implementation Decisions (Topology) | added | ZCode shape; codex-room's equivalent is its provider/runtime layout (`codex-room-setup-notes.md` §8) |
| Topology note: Supervisor armed explicitly via `/slp` (before M2 the Human played Supervisor, main session ran as Lead) | spec §Implementation Decisions (Topology, Milestones); issue 08 | added | |
| One session owns its topology; peer non-aggression (no spawn/manage/coordinate, no topology inference, no self-accept) | codex-room peer overlay, §9(f) of the notes; star law `research/zcode-slp-feasibility.md` §1 (A) | swapped | Same law; on ZCode the star law enforces it mechanically (sub-agents have no spawn tool), the text is the tripwire |
| Closure loop: brief → response → disposition; silence/DONE/tests are not a disposition; no dependent dispatch | codex-room lead overlay, §9(c) of the notes (verbatim quote) | kept | |
| Escalation: three reports, each with evidence, consequence, decision/dependency needed | codex-room `WORKSPACE_PROTOCOL.md`, §9(b) of the notes (verbatim quote) | kept | |
| REOPEN names one of six layers | `research/slp/LEAD.md` §Delegation; `research/slp/PEER.md` §Phán đoán độc lập | kept | |
| NEEDS-HUMAN: line format (choice + consequences) | paseo-room lead contract via `research/slp/slp-lead-fidelity.md` §1b (A) | kept | Vehicle swapped: M0 speaks it in chat; later the mailbox/ledger |
| Evidence vs acceptance; Human alone decides scope/cost/external/irreversible | codex-room `WORKSPACE_PROTOCOL.md`, §9(g) of the notes (verbatim quote) | kept | SHA-from-objects wording from `research/slp/LEAD.md` §Ownership |
| Handoff standard: six fields, order fixed; read-only omits Snapshot; SHA frozen | `research/slp/PEER.md` §Handoff (six-field form); codex-room §9(h) (coarser five-item form) | kept | Seatworks' finer form wins; both cited |
| Channels: native first; mailbox only for harness-absent links, never primary | spec §Implementation Decisions (Native-first bus policy); room skill `plugins/room/skills/room/SKILL.md` | added | ZCode-room decision; codex-room has no peer mailbox to restrict |
| Audit: every brief → response → disposition recorded, append-only | spec §Implementation Decisions (Ledger vocabulary) | added | Mechanics landed with issue 04: hash-chained ledger (`record_event`/`read_ledger`), registry acts mint lifecycle lines, `room tail` streams |

## 2. PEER contract (`plugins/room/contracts/PEER.md`)

| Law (section) | Source | Status | Note |
| --- | --- | --- | --- |
| One bounded outcome; colleague, not order-taker (intro) | `research/slp/PEER.md` intro | kept | |
| Disposition in task prompt; profile invariant (intro) | `research/slp/PEER.md` intro; `02-bon-vai…` §Peer | kept | |
| Authority ladder: profile → repo instructions → brief; brief cannot widen hard bounds (Bootstrap) | `research/slp/PEER.md` §Bootstrap | swapped | `CLAUDE.md` → `AGENTS.md` (ZCode's workspace-instructions file) |
| Resolve real repo root; read contract boundary; ask-before-guess (Bootstrap) | `research/slp/PEER.md` §Bootstrap 1–3 | kept | |
| Capability ≠ authority (Bootstrap) | `research/slp/PEER.md` §Bootstrap | kept | |
| Stay in repo/workspace/scope/authority; preserve unrelated changes (Boundaries) | `research/slp/PEER.md` §Ranh giới | kept | |
| Out-of-scope work → propose in handoff (Boundaries) | same | kept | |
| Commit own work; never push/deploy/external/global; reversibility line (Boundaries) | same | kept | |
| Topology is the Lead's; orchestration surface in reach = wrong environment (Boundaries) | same | swapped | Paseo orchestration tools → spawn tool / session control / foreign-seat channels; on ZCode sub-agents lack these (star law, feasibility §1 A) — law kept as tripwire |
| One moving scope, one writer; worktrees for parallel writers (Boundaries) | same | kept | |
| Rigs in `/tmp` (Boundaries) | same | kept | |
| Repo outranks seat; unvetted skill list; skill beats prompt; vanishing tools = permission deny (Boundaries) | `research/slp/PEER.md` §Ranh giới (settings paragraph) | swapped | `<repo>/.claude/` → the target repo's agent configuration (hooks, env, MCP servers, permissions deny-list) |
| Report repo-level hooks/env/MCP/permissions in handoff; gate is Human-before-spawn (Boundaries) | same; DECISIONS.md pointer dropped | swapped | Pointer to seatworks `DECISIONS.md` has no counterpart here; law stands alone |
| Channels: native first; mailbox only sibling↔sibling + upward; check before finishing (Channels) | room skill; spec (Native-first bus policy) | added | Canon PEER.md has no mailbox (seatworks routed everything through Paseo); the ZCode room adds the bus and its restriction |
| Independent judgment; plan/file list provisional; disagreement-with-evidence = data (Independent judgment) | `research/slp/PEER.md` §Phán đoán độc lập | kept | |
| Three reports + evidence + ≥1 alternative (Independent judgment) | same | kept | |
| REOPEN must name one of six layers (Independent judgment) | same | kept | |
| Finish the unblocked part before returning any report (Independent judgment) | same | kept | |
| Contract-before-test ladder: brief ruling → spec → code; else BLOCKED; ruling fails → REOPEN (foundation/API) (Contract before test) | `research/slp/PEER.md` §Contract trước, test sau | kept | |
| RED may explore implementation, never invent contract; stable-for-slice is enough (Contract before test) | same | kept | |
| Compile failure may be the undecided-contract signal; missing-symbol reflex named (Contract before test) | same | kept | |
| True vs false RED; "who decided?" one-question check (Contract before test) | same | kept | |
| Symbol-semantics hole list; loosening assertions = contract change; internal symbols free (Contract before test) | same | kept | |
| Right order: boundary → RED → minimal GREEN → refactor (Contract before test) | same | kept | |
| Own the proof; risk-proportional; real command, real output; artifact + reproducible evidence beat notification/silence/confidence (Verification) | `research/slp/PEER.md` §Verification | kept | |
| Never self-accept; no difficulty threshold; vanishing-behavior proof test; failure shapes (Verification) | same | kept | |
| Red defaults to code error; env attribution only after serial single re-run with both outputs (Verification) | same | kept | |
| No parallel test lanes on shared resources; contention → BLOCKED; silent brief ≠ alone (Verification) | same | kept | |
| Nobody at your machine; manual-only repro → BLOCKED with steps; hitl-script trap (Verification) | same | swapped | Seatworks' `diagnosing-bugs`/`hitl-loop.template.sh` reference generalized to "a script that prints instructions and exits" — the law is the trap shape, not the skill |
| Unknown is legitimate; Scout points, doesn't conclude (Verification) | same | kept | |
| Read-only dispositions: no commit, omit Snapshot (Handoff) | `research/slp/PEER.md` §Handoff | kept | |
| Writing dispositions commit their own work; SHA = immutable review target (Handoff) | same | kept | |
| Commit procedure block incl. unmerged gate, no `-A`, `COMMIT FAILED` sentinel, rc-gated `rev-parse` (Handoff) | same | kept | `COMMIT HỎNG` → `COMMIT FAILED` |
| Gate 1: unmerged index / merge states → BLOCKED; `ls-files --unmerged` unique catcher; marker-less commands listed (Handoff) | same | kept | |
| Gate 2: check commit's exit code, not SHA existence; stale-HEAD mechanism (Handoff) | same | kept | |
| Gate 3: inspect hooks before first commit in unfamiliar repo; unclear → BLOCKED (Handoff) | same | kept | |
| Gate 4: SHA frozen after handoff; fix-forward, never amend (Handoff) | same | kept | |
| Pre-handover checks: `show --stat` matches declared paths; owned-path porcelain empty; quote `"$sha"` (Handoff) | same | kept | |
| Owned-path adds only; never clean the tree; dirty raw status is normal (Handoff) | same | kept | |
| Six-field handback, exact order (Handoff) | same | kept | |
| "Done"-before-done worse than BLOCKED (Handoff) | same | kept | |
| Turn economics: batch independent calls; no mid-turn narration; writes/read-before-decide travel alone (Turn economics) | `research/slp/PEER.md` §Nhịp lượt | kept | |
| Conclusion first; MECE; Feynman (Writing) | `research/slp/PEER.md` §Diễn đạt | kept | |
| Anti-patterns: whack-a-mole, architecture fog, edge-case overbuild, wrapper-avoiding-decision, same-call retry (Anti-patterns) | `research/slp/PEER.md` §Anti-pattern tự soi | kept | |

## 3. LEAD contract (`plugins/room/contracts/LEAD.md`, both run forms since issue 08)

| Law (section) | Source | Status | Note |
| --- | --- | --- |---|
| Lead of exactly one project; final technical arbiter at project tier; owns framing → … → acceptance (intro) | `research/slp/LEAD.md` intro | kept | |
| Run forms: main session (Human plays Supervisor) or headless session dispatched by the wrapper; peers stay sub-agents on both (intro) | spec §Milestones (M0→M2); issue 08 | added | The M0-scoped header was struck when session dispatch landed (issue 08), per this row's original note; the "never design around spawning sessions" line died with the wall (issue 14) |
| Bootstrap: repo root; read AGENTS.md, contract boundary first; propose one if missing (Bootstrap) | `research/slp/LEAD.md` §Bootstrap | swapped | `CLAUDE.md` → `AGENTS.md`; seatworks `templates/CLAUDE_MD_SNIPPET.md` pointer → "propose the Human build one" |
| Confirm checkout has no uncommitted user work to overwrite (Bootstrap) | same | kept | |
| Every identity from the surface, never guessed (repo root, spawn-returned agentId) (Bootstrap) | `research/slp/LEAD.md` §Bootstrap 3 ("Inspect provider, model, workspace, agent via Paseo — mọi ID lấy từ đó") | swapped | Paseo's provider/agent inspection has no M0 counterpart; the law survives as: identities come from the resolved root and the Agent tool's returned `agentId`, never recall |
| Read protocol + PEER contract fresh, never from memory (Bootstrap) | `research/slp/LEAD.md` §Bootstrap (skill-list law) + spec (Role contracts) | swapped | The "list doesn't survive compression — look it up" law applied to the contract files themselves |
| Skills list lookup vs recall (Bootstrap) | `research/slp/LEAD.md` §Bootstrap | kept | |
| Capability ≠ authority; repo outranks seat (Bootstrap) | same | kept | |
| Control plane: every peer via the native Agent tool; PEER contract prepended verbatim; star law enforcement free (Control plane) | `research/slp/LEAD.md` §Control plane; ADR 0001; feasibility §1 (A) | swapped | "Every agent goes through Paseo" → "every peer goes through the Agent tool"; prompt = contract + brief per spec (Role contracts). Since issue 08 the Lead itself may be the dispatched one — the vehicle for peers is unchanged |
| No per-spawn mode/thinking dial; mode from session; effort rides in the brief (Control plane) | `research/slp/LEAD.md` §Control plane (`modeId`/`thinkingOptionId`) | swapped | ZCode public surface exposes no per-spawn dials (grade B: absence read from the observed Agent-tool surface and `research/zcode-slp-feasibility.md` §2/§8 — the app-server carries model selection, the public spawn path does not); per-role defaults arrive with the room config (issue 09) |
| Human decides: product direction, portfolio priority, irreversible trade-offs, off-machine effects (Human decides) | `research/slp/LEAD.md` §Human quyết | kept | |
| NEEDS-HUMAN line: own line, choice + what follows from each answer; chat in the main-session form, final report when dispatched (Human decides) | paseo-room via `slp-lead-fidelity.md` §1b (A) | kept | Both vehicles stated since issue 08 (the Supervisor relays the dispatched form) |
| Never self-accept; `LEAD-WROTE: <sha> — needs Human accept` marker; no third path; reasonable-sounding excuse (Never self-accept) | `research/slp/LEAD.md` §Bạn implement được… | kept | Marker translated; seatworks' counter script (`bin/measure-lead-writes.py`) not carried — rebuild when an audit demands it |
| Diff-too-big-to-read is the signal to hand to a peer (Never self-accept) | same | kept | |
| Trade = framing/splitting/briefs/diff-reading/ruling/accepting; rigs in `/tmp`; split the front; isolation not throughput (Never self-accept) | same | kept | |
| Ten-field brief, exact fields (Delegation) | `research/slp/LEAD.md` §Delegation | kept | Effort field's mechanics note swapped (below) |
| Neutral, non-pre-solving brief; plan = one-turn provisional map, say so; no must-compile slicing; intra-turn scope (Delegation) | same | kept | |
| Engineer effort default medium; high for Architect/Reviewer/new-boundary; latency lever; ~120K context ceiling (Delegation) | same | swapped | `create_agent` effort dial → advisory brief field until per-role routing (M2/M3); the 2–17% waiting share kept as the rationale |
| writing-for-agents discipline; done-criteria; hard guardrails verbatim + affirmative alongside (Delegation) | same | kept | |
| New-boundary tests: brief states the contract or declares it undecided (peer BLOCKs); spec/code conflict is your architecture decision; or Architect first (Delegation) | same | kept | |
| Three reports per canon; disagreement = data (Delegation) | same | kept | |
| REOPEN: layer first, six layers, ask-back, two-layer burn (Delegation) | same | kept | |
| Blind design lanes: conditions, blindness, one ruling, lane-count ≠ authority, one rebuttal turn, escalation order, ask Human one question first (Blind lanes) | `research/slp/LEAD.md` §Lane thiết kế mù | swapped | `templates/DESIGN_LANE_BRIEF.md` → two ten-field briefs with identical neutral framing (template file is seatworks tooling) |
| One writer per moving scope; worktrees (Ownership) | `research/slp/LEAD.md` §Ownership | kept | |
| Read from objects, never disk; quote `"$sha"`; fix-forward, never amend (Ownership) | same | kept | |
| One test lane at a time; resource claims declared in briefs when >1 agent (Ownership) | same | kept | |
| Handback + integration owners named; accept ≠ push/deploy/external (Ownership) | same | kept | |
| Independent Reviewer default NO; five triggers; else read the diff yourself — that is the review (Reviewer) | `research/slp/LEAD.md` §Reviewer độc lập | kept | |
| Reviewer brief: object-read, read-only, no repo-wide exploration, reuse worktree; forbid the `code-review` skill — two exist, both HEAD-based, neither targets the peer's SHA (Reviewer) | same | swapped | The law transfers verbatim in spirit; on this machine the two `code-review` skills are ZCode-bundled + user-installed (observed, grade A); `templates/REVIEWER_BRIEF.md` → ten-field Reviewer brief |
| Monitoring: confirm start, wait for completion notification, no polling, two identical failures → prerequisites (Monitoring) | `research/slp/LEAD.md` §Monitoring | swapped | Paseo events/`notifyOnFinish` → ZCode sub-agent completion return; the no-polling law and the two-failure rule unchanged |
| Lifecycle signals are bells, not acceptance; artifact + reproducible evidence win (Acceptance) | `research/slp/LEAD.md` §Acceptance | kept | |
| Closure loop: close every actionable response against its brief; silence/DONE/tests ≠ disposition; no dependent dispatch; continue ready work (Acceptance) | codex-room lead overlay, §9(c) of the notes (verbatim) | kept | Placed in both the shared protocol and the Lead contract, as canon places it in both protocol and overlay |
| Six fields required; ask for missing fields, don't fill in (Acceptance) | `research/slp/LEAD.md` §Acceptance | kept | |
| Unknown stays unknown; not-found ≠ absent (Acceptance) | same | kept | |
| Checklist: SHA exists (`cat-file -e`), `show --stat` matches, real diff read, verification re-run with output, reviewer trigger check, new public symbols decided, unresolved findings each a line (Acceptance) | same | kept | |
| Checklist: no forgotten schedules — `CronList` before closing; creation-time `id` is the only handle (Acceptance) | same (`list_schedules`) | swapped | Paseo `list_schedules` → ZCode `CronList` (the host's schedule surface); lost-id → BLOCKED unchanged |
| Record the disposition against the brief; run notes until the ledger lands (Acceptance) | spec (Ledger vocabulary); codex-room closure doctrine | added | Audit law now, mechanics with issue 04 |
| Nothing to archive; SHA is the anchor; don't plan on re-reading transcripts; fewer spawned agents (Acceptance) | `research/slp/LEAD.md` §Acceptance (`archive_agent`) | swapped | ZCode has no agent registry to archive; the durable-artifact and cost laws kept, the archive act has no target |
| Conclusion first; MECE; Feynman (Writing) | `research/slp/LEAD.md` §Diễn đạt | kept | |
| Anti-patterns: whack-a-mole, architecture fog, framing capture (Anti-patterns) | `research/slp/LEAD.md` §Anti-pattern tự soi | kept | |

## 4. SUPERVISOR contract (`plugins/room/skills/slp/SKILL.md`, issue 08)

| Law (section) | Source | Status | Note |
| --- | --- | --- | --- |
| Supervisor = the seat the Human chats with; observes, faithfully routes Human intent, performs bounded room recovery; not another project Lead (intro) | codex-room `WORKSPACE_PROTOCOL.md` §9(a) of the notes; `research/slp/02-bon-vai-supervisor-lead-peer.md` §Supervisor | kept | |
| No code pen, no acceptance pen; protects process quality, not product quality (intro) | `02-bon-vai…` §Supervisor ("không code, không chạy validation của project, không quyết kết quả kỹ thuật") | kept | |
| Human owns product goals, priority, material cost, external effects, irreversible risk (intro) | §9(a) of the notes | kept | Restated from the shared protocol; the Supervisor is bound by both |
| Arming is explicit and cheap to repeat; `/slp` reloads the contract (Arming) | spec user stories 1–2; spec §Role contracts ("Supervisor contract loads via the skill") | added | ZCode mechanics: skill + `register_seat` |
| One live supervisor; a second arming — same seat from another session, or a new seat — is refused citing the live seat; recovery is the Human's explicit retire, then a successor name (Arming) | spec user story 2; lifecycle follows canon | swapped | Canon's one-supervisor is Paseo tool gating; here `register_seat` refuses, keyed on the arming server instance (one per session's MCP connection, grade B) |
| Loop auditor: enforce brief → response → disposition from the ledger; the Lead's summary alone is not proof a loop closed; name ledger gaps in the relay (Supervisor law) | codex-room supervisor overlay, §9(d) of the notes (verbatim) | kept | Audit source swapped to the room ledger (spec user story 15) |
| Privacy firewall: no verbatim Human quotes, labels, attribution, private agent IDs, or who-spoke-to-whom in Lead-facing messages or artifacts; authorized decisions expressed as direct instructions (Supervisor law) | §9(e) of the notes (verbatim) | kept | Clarified: relaying up to the Human is the endpoint — full fidelity there |
| Advise the Lead, never command the worker; no parallel chain of command (Supervisor law) | `02-bon-vai…` §Supervisor | kept | |
| Intervene only when advice improves the Lead's next action; the bad-signs list — micro-scoped orders, pre-solving, template staffing, reviews without real uncertainty, polling, permission loops, decisions bounced to the Human (Supervisor law) | `02-bon-vai…` §Supervisor | kept | Condensed to one line each |
| Notebook: append-only supervisory learnings, synthesized by pattern; never mutate the protocol while merely supervising (Supervisor law) | `02-bon-vai…` §Supervisor (`SUPERVISOR_NOTEBOOK.md`) | swapped | Cross-workspace file → per-room `<state-dir>/supervisor-notebook.md` (one room per workspace, spec) |
| Dispatch: brief framed faithfully and neutrally from Human intent, not pre-solved; report shape required (NEEDS-HUMAN inside, LEAD-WROTE for Lead-written code); brief saved for the audit; Lead seat registered by the dispatcher; `brief_sent` recorded; background dispatch, wait for the notification, never poll (Dispatching) | spec user stories 11–12, 15; codex-room notes §7 (`background=true` + `notifyOnFinish=true`) | swapped | Paseo notifyOnFinish → ZCode background Bash; the wrapper (`room lead new`, issue 07) is the vehicle; off-room dispatch warning added (one room per workspace) |
| Relay: ledger facts first (loop lines with seq and details), never only the Lead's summary; outcome compressed honestly; every NEEDS-HUMAN line surfaced verbatim and recorded (`needs_human`); LEAD-WROTE waits for the Human; audit gaps named; mailbox checked before relaying; the Human's answer (accept/reject of LEAD-WROTE, NEEDS-HUMAN ruling) recorded as `disposition` before dependent dispatch (Relay) | spec user stories 3, 15; §9(d) of the notes | added | The relay is the in-app observability surface (spec §Observability); the disposition step closes the loop the Supervisor itself opened — the room skill's "the seat that observes the event records it" duty applied to the dispatch link |
| Retire is explicit, never by silence: only `retire_seat` ends ownership (registry cleared + `retired` ledger line); one re-poke first, then the Human's decision; the wrapper's session map is not ownership (Retiring) | spec user story 7; spec §Lifecycle follows canon | kept | |
| Scope fence: per-role models, heartbeat automation, further seat enforcement, board, teardown are their own tickets (Not yours) | spec §Milestones (M2/M3 split) | added | Staging law: the Supervisor does not improvise unreached machinery |

## 5. Deliberately not carried in v1

| Canon item | Source | Reason |
| --- | --- | --- |
| `INCIDENT:` lines for out-of-scope effects | paseo-room via `slp-lead-fidelity.md` §1b (A) | v1 folds out-of-scope effects into `BLOCKED` (needs-Human branch) and the handoff's Unknown/risk field; the Supervisor contract (issue 08, §4) folds the relay into NEEDS-HUMAN lines. Spec user stories demand only NEEDS-HUMAN |
| Supervisor heartbeat fallback (`*/2` cron, dedup via `list_schedules`) | codex-room notes §7 (A) | Issue 10 (heartbeat / re-poke), after session dispatch exists (M2) |
| `claude-peer` provider hardcoding + the look-alike provider trap | `research/slp/LEAD.md` §Control plane | Paseo-specific; M0 has exactly one spawn vehicle so the trap cannot occur. Re-examine when M2 adds session dispatch |
| LEAD-WROTE counter script | seatworks `bin/measure-lead-writes.py` (cited in LEAD.md) | Marker law kept; the counter is tooling — rebuild when an audit question demands it |
| `DECISIONS.md` cross-references (config layers, effort table, heartbeat law) | `research/slp/PEER.md`, `LEAD.md` | No DECISIONS.md in this repo; the laws stand alone, vocabulary lives in `GLOSSARY.md` |
| Per-spawn effort dial (`create_agent` effort) | `research/slp/LEAD.md` §Delegation | No ZCode public-surface dial; per-role model routing is M2/M3 (spec). Brief field is advisory meanwhile |
| paseo-supervision passive judge | `research/slp/02-bon-vai…` §Supervisor | Paseo-only; out of scope for this repo |
