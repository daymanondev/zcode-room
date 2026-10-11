# SLP Lead fidelity — what the sources specify, what the factory built, what 100% would take

Context: Andrew has asked for the factory to follow SLP 100% — including the Lead
seat — superseding or reopening ADR 0005
(`docs/adr/0005-lead-duties-become-mechanisms.md`, accepted 2026-10-07). This note
is the evidence base for that decision; it does not decide the ADR.

Method: read the repo's primary SLP sources (`research/90-sources/original-files/`
— LEAD.md, PEER.md, seatworks.md; the SLP model notes `research/01-slp-model/`),
re-fetched the two external contracts live on 2026-10-10
(`raw.githubusercontent.com/cuongntr/paseo-room/main/src/room/prompts/contract/lead.md`
and `.../hoangnb24/codex-room-setup/main/docs/huong-dan-codex-room-setup.md` —
both reachable), cross-checked against the verbatim quotes recorded verbatim in
`research/notes/paseo-room.md` and `research/notes/codex-room-setup.md` (fetched
2026-09-29), read the factory's own ADRs, CONTEXT.md, runbook, `src/` mechanisms
and the v0.0.1–v0.0.8 maps and tickets. Read-only: no runtime commands, no daemon
contact.

Grades: **A** = primary source, verbatim (quoted text, recorded ledger/ticket
data) · **B** = primary source, interpreted (summary of fetched/read primary
text) · **C** = secondary or inferred (comparison, projection).

---

## 1. What SLP specifies for the Lead

Three primary contracts define the seat. They agree on the skeleton: the Lead is
the **sole durable technical owner of one project**, the final technical arbiter
below the Human.

### 1a. The seatworks-source LEAD.md (Vietnamese original, in-repo)

`research/90-sources/original-files/LEAD.md` — every quote below verbatim (A),
translation mine (A→English is B for wording nuance, A for content):

> "Bạn là **Project Lead** của đúng một project, trọng tài kỹ thuật cuối cùng ở
> tầng project. Human giữ quyền owner. Bạn sở hữu: framing → decomposition →
> routing → ownership → dependency → stable checkpoint → review → integration →
> **acceptance**."
> ("You are the **Project Lead** of exactly one project, the final technical
> arbiter at the project tier. Human keeps owner authority. You own: framing →
> decomposition → routing → ownership → dependency → stable checkpoint → review →
> integration → **acceptance**.")

Duties the file assigns (all A, section names from the file):

- **Bootstrap** — resolve the real repo root, read the repo's `CLAUDE.md`
  (contract boundary), inspect provider/model/workspace/agent through Paseo,
  confirm the checkout has no uncommitted user changes that would be overwritten.
- **Control plane** — every agent goes through Paseo; spawn Peer with the one
  hardcoded provider id; pass `settings.modeId: "bypassPermissions"` **and**
  `thinkingOptionId` on every `create_agent`.
- **Human decides, not you** — "Product direction, portfolio priority, mọi
  trade-off không đảo ngược, external side effect **ra ngoài máy này** → Human"
> ("product direction, portfolio priority, every irreversible trade-off, external
> side effect **off this machine** → Human"). Local commits are the Peer's — the
> dividing line is *reversibility*, not the git verb.
- **Can implement, never self-accept** — "Bạn viết → Human accept" with the
> marker line `LEAD-WROTE: <sha> — cần Human accept` ("needs Human accept"),
> counted by a script; "Peer viết → bạn accept" ("Peer writes → you accept");
> "Không có đường thứ ba" ("there is no third path").
- **Delegation** — the 10-field brief (Project/Task ID, repository root +
  workspace, disposition, objective, owned scope, excluded scope, authority,
  verification, effort, handoff contract); neutral, non-pre-solving briefs;
> "Plan chi tiết tới mức Peer chỉ gõ lại ý Lead là hỏng" ("a plan detailed
> enough that the Peer just types your idea back is broken").
- **Mid-task rulings** — the three Peer interruption reports, always with
> evidence: `REOPEN_REQUEST` (failed premise — Lead must first ask *which of the
> six layers* is being reopened: foundation, dependency, lifecycle, API,
> ownership, verification), `DEPENDENCY_REQUEST` (needs another owner/API/scope),
> `BLOCKED` (lacks authority, prerequisite, external state, **or needs a Human
> decision**). "Bất đồng có evidence là dữ liệu cần reconcile, không phải bất
> tuân." ("Disagreement with evidence is data to reconcile, not disobedience.")
- **Blind design lanes** — only for hard-to-reverse decisions the Lead cannot
  confidently counter-argue; two lanes converge, the Lead issues one ruling;
  "số lane đồng ý không tạo authority" ("the number of agreeing lanes creates no
  authority"); ask the Human one question before spending either lane.
- **Ownership** — one moving scope, one writer; parallel writers get worktrees;
  review reads from git **objects** (`git diff "$sha^" "$sha"`), never disk; one
> test lane at a time; "Accept **không** kéo theo `git push`, deploy hay gọi
> service ngoài" ("Accept does not imply `git push`, deploy, or calling external
> services").
- **Independent Reviewer — default NO** — Lead + Peer already are the separation;
> a third layer only on five named triggers (pre-solved brief, contract seam,
> irreversible change, suspicious proof, withdrawn REOPEN). "Không trúng điều
> kiện nào → tự đọc diff. Đó chính là review." ("No trigger → read the diff
> yourself. That is the review.")
- **Monitoring** — "Event-driven. Xác nhận agent đã start, rồi **chờ
> notification**. Không polling: nó ăn context và bạn mất dependency map. Sau
> **hai** failure giống hệt, kiểm prerequisite/quota/auth thay vì retry."
> ("Event-driven. Confirm the agent started, then **wait for notification**. No
> polling: it eats context and you lose the dependency map. After **two**
> identical failures, check prerequisites/quota/auth instead of retrying.")
- **Acceptance** — lifecycle signals ("finished, idle, exit 0, tests pass") are
> only wake-up bells, never acceptance; the seven-item checklist (sha exists,
> read the real diff, every verification command re-run, reviewer trigger check,
> new public symbols decided, every unresolved finding gets a line, no forgotten
> heartbeats); then `archive_agent`.
- **Self-checks** — whack-a-mole (third same-symptom correction → ask which
> mechanism produces the chain), architecture fog, framing capture.

### 1b. The paseo-room Lead contract (English, live-fetched)

`https://github.com/cuongntr/paseo-room`, `src/room/prompts/contract/lead.md`
(fetched from `raw.githubusercontent.com/.../main/...` 2026-10-10; the `master`
variant carries the same content). Verbatim passages re-verified live (A, quotes
capped by the fetch tool):

- Ownership: "Lead owns project framing, architecture, dependencies,
  integration, verification, and technical acceptance within Human boundaries."
  (A) — and "Lead executes the Human outcome and constraints, escalating
  Human-owned choices to Human." (A)
- **Durability across turns**: "Lead owns one project across turns. A completed
  turn, idle state, or closed but unarchived, resumable session does not end
  that ownership; it ends only when Human closes or reassigns the project, or
  bounded recovery replaces an unhealthy Lead after a stable handoff." (A,
  section "Project Technical Ownership")
- **Acceptance**: "Among agents, Lead alone accepts; Human retains override
  authority." (A) and "Passing tests and completion reports are evidence, not
  acceptance." (A, section "Technical Acceptance")
- **Waiting**: "Set `notifyOnFinish: true` explicitly on every Peer creation and
  every background follow-up." (A) and "Rely on Paseo's completion, error, or
  permission event, and do not poll unchanged state while waiting." (A, section
  "Peer Seat Lifecycle")
- **Escalation lines** (section "Human Questions and Incidents", quoted verbatim
  in `research/notes/paseo-room.md` §7(d), fetched 2026-09-29 — A): questions
  for the Human go "on its own line that begins NEEDS-HUMAN: … with the choice
  and what follows from each answer"; out-of-scope effects go "on its own line
  that begins INCIDENT:, naming what happened, where, and whether it is
  contained."
- One writable Peer project-wide (worktree-isolated dispatches excepted); Lead
  must not edit a scope concurrently with its writer; "Runtime refusals are
  final." (B — structured summary of the fetched file, consistent with §7 of the
  local notes)
- Lead opens only Peer seats, never Supervisor seats; Peers are per-brief, never
  a standing pool, never orchestrate. (B, same fetch)
- The gate law, same words the factory's ADR 0005 quotes: "a candidate whose
  gate was not run is not a candidate." (A via `research/notes/paseo-room.md`
  §7(b) context and ADR 0005's own citation)

### 1c. The codex-room-setup guide (Vietnamese, live-fetched)

`https://github.com/hoangnb24/codex-room-setup`, `docs/huong-dan-codex-room-setup.md`
(fetched 2026-10-10; the same doctrine sits verbatim in the repo's overlays per
`research/notes/codex-room-setup.md` §9, fetched 2026-09-29 — A):

- Authority: "Lead giữ quyết định kỹ thuật của một dự án, dependency order, tích
  hợp, kiểm chứng, và quyết định chấp nhận candidate." ("The Lead holds one
  project's technical decisions, dependency order, integration, verification,
  and the decision to accept a candidate.") (A)
- Concurrency: "Lead chỉ có tối đa một Peer đang ghi vào repository tại một thời
  điểm" ("at most one Peer writing into the repository at a time"). (A)
- Pacing: after dispatching a Peer, the Lead "chờ event finish, error, attention,
  hoặc decision" ("waits for a finish, error, attention, or decision event") and
  must not re-poll unchanged state. (A)
- Acceptance: tests and completion messages "chúng không tự tạo thành
  acceptance" ("do not by themselves constitute acceptance") — the Lead must
  "đưa ra quyết định kỹ thuật rõ ràng: chấp nhận hoặc từ chối, kèm lý do" ("issue
  a clear technical decision: accept or reject, with a reason"). (A)
- **The closure loop** (from `overlays/lead.config.toml`, verbatim in
  `research/notes/codex-room-setup.md` §9(c) — A): "Close every actionable Peer
  response against its original brief. Answer the question, resolve the
  dependency or ownership decision, request specific missing evidence, or
  explicitly ACCEPT/REJECT the exact candidate with a reason. … Silence, DONE,
  or passing tests are not a disposition. Do not dispatch work that depends on
  an unresolved response; continue unrelated ready work."
- Peer-side escalation vocabulary (WORKSPACE_PROTOCOL.md, verbatim in the same
  notes §9(b) — A): `REOPEN_REQUEST` / `DEPENDENCY_REQUEST` / `BLOCKED`, "each
  signal includes evidence, consequence, and the decision or dependency needed."
- No NEEDS-HUMAN marker exists in this system (B, live fetch) — Human-level
  scope is defined by boundary: goals, priorities, cost, external impact,
  "quyết định rủi ro không thể đảo ngược" ("irreversible-risk decisions"). (A)

### 1d. Bounds (all three agree)

The Lead never holds: product direction, portfolio priority, irreversible
trade-offs, anything leaving the machine (push/deploy/external services/global
config), and — in seatworks — acceptance of its own writing. (A across LEAD.md
§"Human quyết", paseo-room "Human boundaries", codex-room WORKSPACE_PROTOCOL §9(a)
of the local notes.)

---

## 2. Who prompts whom — the autonomy question

ADR 0005's premise, verbatim: "The product exists to minimize how often the
Owner must prompt; **a Lead is something the Owner must prompt**."
(`docs/adr/0005-lead-duties-become-mechanisms.md`, A.) The sources support half
of that sentence and contradict the other half.

**What the sources say:**

- The Human types the task once; the Lead then runs the whole loop.
  pi-paseo-orchestration: "Luồng khởi động: Human tạo root Lead → (khi xứng
  đáng) tạo root Supervisor → Lead spawn Peer qua `paseo_create_agent`"
  ("startup flow: Human creates the root Lead → (when warranted) creates the
  root Supervisor → the Lead spawns Peers"); and "Human gõ task đúng một lần"
  ("the Human types the task exactly once"). (`research/04-case-studies/
  01-pi-paseo-orchestration.md`, quoting that repo's README — B, interpreted
  from the note's quotes.)
- The Lead's ownership **persists across turns and idle periods** — an idle Lead
  is still the Lead (paseo-room, "Lead owns one project across turns…", A above).
  It is not prompted per task by anyone; it is *woken* per event.
- The wake sources are machinery, not the Human: peer completion/error/permission
  events via `notifyOnFinish` (paseo-room A; codex-room-setup — its Supervisor
  sends "necessary Lead messages" with `background=true + notifyOnFinish=true`
  and keeps one self-targeted heartbeat `*/2 * * * *` **as a fallback for
  event-coverage gaps**, `research/notes/codex-room-setup.md` §7 — A). When
  events were not enough, paseo-room built an entire **attention subsystem**:
  letters that "wake an idle Supervisor for stuck permissions, unread results,
  repeated failures, concurrent writers, NEEDS-HUMAN:/INCIDENT: lines," plus
  Lead succession on context-rotation marks (`research/notes/paseo-room.md` §4 —
  A). seatworks v3 added file-backed mail whose queue "never sends into a turn
  under way" and a round/"patrol" runtime (`research/notes/seatworks-v3.md`
  §Mail — A).
- Within its turn the Lead acts autonomously over the whole
  brief→handoff→acceptance cycle: spawns Peers, rules on their three report
  types, re-dispatches, accepts, archives. Nothing in any source has the Human
  or Supervisor prompting the Lead per task. (B — synthesis across LEAD.md,
  paseo-room lead.md, codex-room guide.)

**Verdict on the ADR's premise:** the literal claim — a Lead must be prompted by
the Owner per task — is contradicted by all three reference systems (grade B,
synthesis; grade A on each underlying quote). What the sources *do* support: a
Lead never self-schedules; it is always *prompted by events* delivered by
machinery (notifications, letters, mail, heartbeats). SLP's answer to "who
prompts the Lead" is: **the daemon-side machinery does, and it had to be built**
— paseo-room's attention engine and seatworks' mail exist precisely because an
idle judge does not wake itself. ADR 0005 was right that a Lead needs a prompter;
wrong that the prompter must be the Owner.

---

## 3. Duty-by-duty fidelity: SLP wording → factory mechanism today

Mechanism facts cited from the code (A: `src/` read 2026-10-10; `src/` and
`plugin/server/core/` are byte-identical by test): the Factory surface is
`setContract / claim / accept / requestSpawn / meter / liveContractFor /
contractFor / retro` (`src/factory.ts`); the Gate runs the contract command and
folds artifact existence into the verdict (`src/gate.ts`); fresh-eyes is one
direct-API read appending one advisory line, "cannot act by construction"
(`src/fresh-eyes.ts` header, A); the watch "is a passenger, never a judge: no
notification, no escalation, and Verdicts and driver exits are unchanged by its
answers" (`src/watch.ts` header, A); the Retro "proposes, only the Owner
ratifies" (`src/retro.ts` header, A); the choke is "default-allow with a small
deny-list … A deny is choke-and-record: one ledger line, one report line, no
mid-task escalation channel" (CONTEXT.md "Choke policy", A). The driver:
"No respawn, ever: a dead agent is reported (exit 2); retry policy belongs to a
later row" (`docs/runbooks/live-run.md` step 4 and `plugin/bin/driver.mjs:21`,
A). The ledger vocabulary has no escalation/blocked/human event at all
(`src/events.ts` — contract_set, spawn_dispatched/refused, claim_reported,
gate_started/finished, fresh_eyes_written, watch_written, permit_allowed/denied,
git_blocked, report_written, attempt_accepted, meter_written, retro_written — A).

| # | SLP Lead duty (source, grade for the wording) | Factory mechanism today | Fidelity |
|---|---|---|---|
| 1 | Framing and done-criteria (LEAD.md "Bạn sở hữu: framing → …", A) | Contract, set by the Owner before the Agent starts (ADR 0002; `setContract`) | **Faithful, reassigned** — for one bounded Task the Owner-authored Contract carries the same content; SLP gives framing to the Lead, the factory to the Owner, by explicit decision (ADR 0005) |
| 2 | Verification — "a candidate whose gate was not run is not a candidate" (paseo-room, A) | Gate: the plugin itself runs the contract command on the claimed commit, artifact folded in | **Faithful — stronger**: the judge side runs the gate instead of trusting the writer's report |
| 3 | Stable checkpoint — the SHA is the durable artifact (LEAD.md §Ownership, A) | Verdict attests the claimed commit: `rev-parse --verify`, clean tree before and after (ADR 0002, `src/workspace.ts`) | **Faithful** |
| 4 | Brief boundaries — owned scope, exclusions, verification command, effort (LEAD.md §Delegation, A) | Contract `scope` prefixes (red outside scope, ticket 14 / v0.0.1), gate, `--description`; coherence is advisory law (R4) | **Weakened** — narrower vocabulary: no exclusions field, no authority field, no per-brief effort dial; description-scope coherence is prompt-law, not mechanism |
| 5 | Routing — spawn per brief, pick the harness (LEAD.md §Control plane, A) | Spawn: one fresh-context Agent per Task through the spool, harness-agnostic `--provider` (v0.0.5) | **Faithful for the spawn act**; the Lead's mid-task re-seat / re-dispatch has no counterpart (see #7) |
| 6 | One-writer discipline — one moving scope one writer, worktrees, read from objects (LEAD.md §Ownership, A) | Workspace-conflict refusal at contract and spawn time (v0.0.5), branch per task, git-object attestation, choke + git shim | **Faithful — mechanized**: refusal is mechanical where seatworks relies on prompt + worktree convention |
| 7 | Mid-task rulings — REOPEN/DEPENDENCY/BLOCKED, re-prompt, re-route, retry vs escalate ("Close every actionable Peer response… Silence, DONE, or passing tests are not a disposition", codex-room overlay, A) | **Nothing acts.** A blocked Agent simply never Claims; the red Verdict is the record (ADR 0005 "Known gap", A). Driver: no respawn, stall report-only. Live: a denied permission ends the copilot ACP turn and nothing ever re-prompts (v0.0.8 ticket 05 finding 1, A) | **Missing** — the core presiding duty has no actor |
| 8 | Escalation channels — NEEDS-HUMAN / INCIDENT lines (paseo-room, A) | No channel, no ledger event kind; "recorded here, not designed here" (ADR 0005); "Waking/escalation design … standing since v0.0.6" (v0.0.6 map Out of scope, A) | **Missing** — recorded gap since v0.0.6 |
| 9 | Monitoring — confirm start, wait for notification; "after two identical failures, check prerequisites instead of retrying" (LEAD.md §Monitoring, A) | Driver polls ~5 s snapshots to terminal state but never acts on them; **no attempt ceiling exists in the code** (the only `MAX_ATTEMPTS` are the watch/retro retry constants — `src/watch.ts:57`, `src/retro.ts:39`, A); the brief invites unlimited re-claims | **Weakened** — the observe half exists (and the record-only Watch reads stuck-loop at verdict), the act half (prerequisite check, cap, respawn) is absent; ADR 0005's own "Attempt cap per Task" row (0.0.4) never shipped as an enforced cap |
| 10 | Independent review — default OFF, five named triggers (LEAD.md §Reviewer, A) | Fresh-eyes: Contract flag, green-only, one advisory CONCERN/CLEAR line; "cannot act by construction"; concern path has never fired live (v0.0.2 map ticket 06, A) | **Weakened** — record-only where SLP acts: the sources' Lead *decides* from review (send back, accept, spawn Reviewer); in the factory nothing reads the line into any decision except the Owner's eye |
| 11 | Acceptance — "Among agents, Lead alone accepts; Human retains override" (paseo-room, A) | "With no Lead, nothing agent-side accepts: the Owner accepts" (ADR 0005, permanent; ADR 0002) | **Deliberate deviation** — the no-self-accept invariant is kept (writer never accepts; plugin never accepts), the seat moved to the Human; the SLP-100% question lives exactly here |
| 12 | Repeated-failure reflection — "third same-symptom correction: which mechanism produces this chain?" (LEAD.md anti-patterns, A) | Retro: Owner-invoked corpus pass, proposals only, Owner ratifies (v0.0.7) | **Weakened, in kind** — it proposes, never acts, and its two live misses were exactly the Lead-shaped signals (absence/silence — §5 below) |
| 13 | Project ownership across turns — idle does not end ownership (paseo-room, A) | The Driver's loop stops at verdicts; between verdicts nothing owns a task; landing to main is human, PRs manual | **Split** — landing-human is faithful to SLP (external effects are the Human's, A); continuous ownership/integration between verdicts is missing |
| 14 | No-self-accept accounting — LEAD-WROTE marker + counter (LEAD.md, A) | Not needed: the plugin cannot write any workspace at all — the writer is always the Agent, the judge always the plugin+Owner | **Faithful by construction** — the invariant the marker polices is enforced structurally |

**Counts:** faithful (incl. faithful-by-construction, faithful-mechanized):
#2, #3, #6, #14, the landing half of #13 — 5 duties. Weakened (record-only
where SLP acts, or narrower than the source): #4, #9, #10, #12 — 4 duties.
Missing entirely: #7, #8, the ownership half of #13 — 3 duties. Deliberate
reassignment #1/#11: 2 (the ADR's own design, the ones a "100% SLP" stance
would revisit). Factory-native duties with no SLP Lead counterpart: Watch
(record-only, v0.0.6), Meter (v0.0.8), the batteries — these are instruments,
not seat duties (CONTEXT.md, A).

---

## 4. What 100% fidelity would require — the minimal Lead seat

The sources' shape, not the ADR's: **the Lead is an actor woken by machinery,
with enumerated authority and enumerated Human-lines.** On this architecture the
minimal seat is:

**The loop.** A daemon-side actor — plugin loop, driver-resident watcher, or a
headless model lane in the watch/retro style — that subscribes to what the
factory already observes: the driver's ~5 s agent snapshots
(`attentionReason: finished|error|permission` — the v0.0.5 spawn scout proved
this is pollable over the daemon WS RPC, grade A from
`.scratch/factory-v0.0.5/map.md` ticket 01), the ledger lines the plugin already
writes, and the stream counters (`permission_requested → permission_resolved →
turn_completed → idle`, the exact evidence v0.0.8 used). It runs without the
Owner prompting it per task — prompted by events, exactly as `notifyOnFinish`
prompts a paseo-room Lead and mail/letters prompt a seatworks seat. (B — design
projection grounded on cited mechanics.)

**Enumerated authority — what it may DO (C, proposed; each grounded in a source
duty):**

1. **Re-poke** an agent that went idle without a Claim after a denial or an
   ended turn (the driver already speaks the prompt RPC; the v0.0.8 finding
   names "a factory re-poke after a denial (driver/plugin level)" as the 0.0.9
   candidate — A, ticket 05 finding 1).
2. **Re-prompt on red** with the gate note attached — enforcing the brief's own
   claim-again instruction when the agent stops doing it (the brief already
   carries the instruction; A `plugin/bin/driver.mjs` BRIEF_TEMPLATE).
3. **Respawn** a dead agent, idempotency-keyed by task id, within an Owner-set
   attempt ceiling — closing ADR 0005's own unfulfilled unattended-loop
   precondition ("an Owner-set ceiling on Attempts per Task exists" — the row
   the code never shipped).
4. **Route within an Owner-set provider list** per re-attempt (ADR 0005 already
   keeps spawn harness-agnostic, "chosen per Task by the Owner at Contract
   time" — the Lead picks inside that list, never outside it).
5. **Propose-accept**: queue an acceptance recommendation (green + watch + eye
   lines joined) for the Owner — it never accepts itself, mirroring "Lead alone
   accepts **among agents**; Human retains override" read onto the factory's
   seats: with an agent-side Lead, acceptance among agents could pass to it,
   with the Human override kept — that is the one clause where 100% SLP changes
   an ADR-0005 "permanent" line (B).

**Enumerated bounds — what stays Owner (A, the sources' own Human-lines plus
ADR 0005's permanent lines):** set or change a Contract; accept (unless the
Owner delegates the seat per ADR 0005's existing delegation clause, revocably);
land to main; push/deploy/external services; widen scope or budget; anything
irreversible. Notably, ADR 0005 already concedes the biggest step — "the Owner
seat may be delegated later by the human to exactly one agent, revocably,
inheriting only the Owner surface" — a Lead with the five authorities above is
a *smaller* grant than that clause (C, comparison).

**The channel.** NEEDS-HUMAN / INCIDENT as ledger event kinds the Lead writes
when its enumerated acts are exhausted — the gap ADR 0005 itself recorded in
its Consequences and every map since v0.0.6 has kept in Out-of-scope (A). This
is also what finally makes the Watch and fresh-eyes lines *read into a
decision*: today they are record-only (A, CONTEXT.md); a Lead is the consumer
the sources give them.

**What ADR 0005's reasoning gets from the sources:** its "every prompt to a
Lead is Owner work" is contradicted (§2 above) — the reference systems pay the
prompter in machinery, not Owner attention, and built attention engines when
events alone under-delivered. Its other two legs stand: the reference systems
do run open-ended rooms where a Lead's judgment earns its context (the factory
runs single bounded Tasks — the seatworks chat log itself records the friction
of heavy Lead contracts: "Hở tí con Lead nó gọi chục cái tool xong nó nói 'tao
không làm vì tao không có quyền abc xyz'", "any moment the Lead calls a dozen
tools then says 'I won't do it, I lack authority xyz'" — `research/90-sources/chat-log.md`,
A); and "acceptance is judgment; green is evidence" is the sources' own law.

---

## 5. Live evidence (v0.0.1–v0.0.8) that bears on the decision

Ledger-recorded facts from the maps/tickets (all A unless noted):

1. **The denial stall, measured twice.** v0.0.8 ticket 05, run 3 (grade A — the
   daemon's own stream counters, both passes): the mandated `git reset --hard`
   bootstrap was choked (`permit_denied policy:S1-git-vocabulary`, seq
   1377/1381), then `permission_resolved (denied) → turn_completed → idle`,
   "no second turn ever started" — no Claim, no verdict, no watch line. **The
   choke half worked; the presiding half does not exist.** Consequence:
   destructive-writes has never been measured live in either v0.0.6 ("arm1
   not-yet-measurable — agents stalled on the denied tidy step") or v0.0.8.
   A Lead's single cheapest authority — re-poke after denial — closes this
   (`/scratch/factory-v0.0.8/issues/05-live-cost-read.md` findings 1;
   `.scratch/factory-v0.0.6/map.md` ticket 05).
2. **The denied-step stall is the strongest corpus pattern — and the model
   passes cannot read it.** The v0.0.7 corpus-patterns scout (grade A, seq
   445/578/921/1073): "four tasks each blocked once, then silence." The first
   live Retro then hit 7/9 registered patterns but **missed exactly this one
   and spawn-then-silence**: "the pass reads finding text, not silence"
   (`.scratch/factory-v0.0.7/map.md` tickets 02/05). Silence is the Lead's home
   signal — reacting to a peer that stopped talking is duty #7.
3. **Spawn-then-silence at scale:** 36 of 57 tasks in the corpus never got a
   Claim (v0.0.7 corpus scout, grade A). The driver watches every one of them
   to its terminal state and acts on none ("no respawn, ever"; "stall
   report-only" — v0.0.5 ticket 03 design, A).
4. **The loop can heal without a Lead — once, agent-side.** v0.0.1 ticket 09:
   attempt 1 red for an environment reason (daemon PATH lacks npm), the agent
   self-recovered inside the rules, attempt 2 green (A). Counterweight: the
   same run's red-note tail cap hid the root cause, and the permit parade
   (~10 grants, then 19 in v0.0.2, then 20 asks auto-answered in v0.0.4) was
   the pain the choke mechanized — evidence that where a duty could be made
   mechanical, the factory made it work.
5. **Record-only lines no one reads into a decision:** fresh-eyes' concern path
   has never fired live (v0.0.2 map ticket 06, A); the watch is a passenger by
   law (CONTEXT.md, A); the driver's false-death misread now writes premature
   meter lines and printed a green run "NOT green" (v0.0.8 findings 2, A) —
   verdicts live in the ledger, but nothing daemon-side *responds* to any of
   it.

---

## 6. Open questions for the ADR decision

1. **Agent or mechanism?** The sources' Lead is an agent with judgment; the
   factory's winning mechanisms (gate, choke, scope, conflict refusal) are
   deterministic. The live evidence pins exactly one act as enough for the next
   version — a deterministic re-poke after denial. Does 100% SLP start with a
   mechanical Lead (the five enumerated authorities as code) and add judgment
   only where rulings are asked for (REOPEN/DEPENDENCY triage)?
2. **Does acceptance move?** ADR 0005 made Owner-accepts permanent. paseo-room:
   "Among agents, Lead alone accepts; Human retains override." If a Lead seat
   exists, SLP-100% reads as: the Lead accepts among agents, the Human holds
   override — the ADR's own delegation clause is the existing hook for that
   transfer, revocably.
3. **Where does the seat live?** Plugin loop vs driver vs scheduled headless
   lane — ADR 0004's one-writer law says anything that writes the ledger rides
   the spool; a Lead that re-pokes and respawns acts through driver/daemon
   surfaces, but its NEEDS-HUMAN/INCIDENT lines would be new ledger events it
   cannot write itself without a new request kind.
4. **What consumes the passengers?** Watch, fresh-eyes and Meter are record-only
   today by law. A Lead is their missing consumer — is making them read-into-
   decision a change to their CONTEXT.md laws, or only to the reader?
5. **Cost posture.** v0.0.8 measured one real task at $0.87 metered / $0
   marginal. An event-gated Lead spends a model call per *intervention*, not
   per task — but the corpus's 36/57 never-claimed tasks say interventions
   would not be rare. What is the accepted cost of presiding?
6. **Does the Lead replace or join the delegate?** ADR 0005 already permits
   delegating the Owner seat to one agent. SLP keeps Lead and Owner distinct
   (Human overrides the Lead). Building both is two agents where the sources
   have one Human and one Lead — which does Andrew's "SLP 100%" mean?

---

*Sources index: `research/90-sources/original-files/LEAD.md` ·
`research/90-sources/original-files/seatworks.md` · `research/90-sources/chat-log.md` ·
`research/00-overview/02-slp-la-gi.md` · `research/01-slp-model/02-bon-vai-supervisor-lead-peer.md` ·
`research/01-slp-model/03-vong-lam-viec.md` · `research/04-case-studies/01-pi-paseo-orchestration.md` ·
`research/04-case-studies/05-paseo-supervision.md` · `research/notes/paseo-room.md` ·
`research/notes/codex-room-setup.md` · `research/notes/seatworks-v3.md` ·
https://raw.githubusercontent.com/cuongntr/paseo-room/main/src/room/prompts/contract/lead.md (fetched 2026-10-10) ·
https://raw.githubusercontent.com/hoangnb24/codex-room-setup/main/docs/huong-dan-codex-room-setup.md (fetched 2026-10-10) ·
`docs/adr/0002..0005` · `CONTEXT.md` · `docs/runbooks/live-run.md` ·
`src/{factory,gate,watch,fresh-eyes,retro,choke,events}.ts` · `plugin/bin/driver.mjs` ·
`.scratch/factory-v0.0.1..v0.0.8/map.md` (+ v0.0.8 issues/05).*
