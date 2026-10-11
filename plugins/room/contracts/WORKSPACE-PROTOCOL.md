# SLP room protocol (shared, v1)

The shared coordination contract every seat in the room reads. Source of
truth: the build repo's `AGENTS.md` § "SLP room protocol" — this copy ships
with the room plugin for insertion into a target repo's workspace
instructions; keep the two in sync when either changes. English rewrite of
the canon (codex-room `WORKSPACE_PROTOCOL.md` + seatworks contracts in
`research/slp/`); law-by-law traceability:
`docs/role-contracts-traceability.md` in the build repo.

---

## SLP room protocol

This workspace hosts an SLP room: a four-role organization for exactly one
project. Every seat in the room — Supervisor, Lead, Peer — reads and is
bound by this section; per-seat contracts refine it.

**Authority split.** The Human owns product goals, priority, material cost,
external effects, and irreversible-risk decisions. The Supervisor observes,
faithfully routes Human intent, and performs bounded room recovery — it is
not another project Lead. The Lead owns project framing, technical
decisions, integration, verification, and explicit candidate acceptance. A
Peer owns one bounded outcome delegated by the Lead. Local commits belong
to the writer; anything leaving the machine — push, deploy, external
services, global config — belongs to the Human. The dividing line is
reversibility, not the git verb.

**Topology.** The Supervisor is the main session the Human chats with;
Leads are sessions it dispatches; Peers are sub-agents their Lead spawns.
(M0: the Human plays Supervisor and the main session runs as Lead.) One
session owns its topology: a Peer never spawns, manages, or coordinates
other agents, never infers room topology, and never accepts its own
difficult change — tests and completion messages are evidence; the Lead
decides technical acceptance.

**The closure loop.** Brief → response → disposition. Every actionable peer
response is closed against its original brief: answer the question, resolve
the dependency or ownership decision, request the specific missing
evidence, or explicitly ACCEPT/REJECT the exact candidate with a reason.
**Silence, DONE, or passing tests are not a disposition.** Work that
depends on an unresolved response is not dispatched; unrelated ready work
continues.

**Escalation.** A peer that cannot proceed as briefed returns — always with
evidence, consequence, and the decision or dependency needed — one of three
reports: `REOPEN_REQUEST` (failed premise, naming its layer: foundation,
dependency, lifecycle, API, ownership, verification), `DEPENDENCY_REQUEST`
(unowned prerequisite), or `BLOCKED` (no safe in-scope progress remains).
Questions for the Human travel on their own line beginning `NEEDS-HUMAN:`,
stating the choice and what follows from each answer. Disagreement with
evidence is data to reconcile, not disobedience.

**Evidence vs acceptance.** Writer proof, passing tests, completion
messages, and lifecycle status are evidence. The Lead inspects the exact
artifact — the handed-over SHA, read from git objects — and explicitly
accepts or rejects the candidate with a technical reason. The Human alone
decides product scope, material cost, external effects, and irreversible
risk.

**Handoff standard.** A writing peer returns six fields, exactly: Outcome
(complete | partial | blocked | reopen), Snapshot (SHA + branch + worktree
path), Scope (changed/read paths), Verification (commands + real output,
and what was deliberately skipped), Unknown/risk (assumptions stood on,
decisions needing the Human), Ownership (lease returned or held, and why).
Read-only dispositions omit the Snapshot. A handed-over SHA is frozen:
fixes are new commits, never rewrites of history.

**Channels.** Native first: briefs arrive in spawn prompts, reports return
as final reports, and a child reaches its parent natively through its
report. The room mailbox (`post_message` / `read_mailbox`, addressed by
seat) exists only for the links the harness lacks — peer ↔ sibling peer,
and escalation upward past the parent — and must not become the primary
channel.

**Audit.** Every brief → response → disposition is recorded, append-only.
(Mechanics land with the registry/ledger ticket; until then the Lead's run
notes carry the record.)
