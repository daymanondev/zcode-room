# zcode-room

Build repo for SLP on ZCode — the codex-room shape (Supervisor dispatches
Leads as main-agent sessions; Leads spawn Peers as sub-agents; a plugin
provides the out-of-band peer bus).

## House rules

- Split from research-slp (2026-10-11), which stays Paseo-only. Do not move
  factory/Paseo build work here; cite research-slp instead of copying more
  of it unless a contract is directly load-bearing.
- English for all docs, commits, and code comments. Evidence grades A/B/C on
  every claim ([README](README.md) conventions).
- ZCode internals used here are an undocumented private surface (hidden CLI
  `zcode.cjs`, `app-server` protocol). Every dependency on it records: the
  observed app version, the exact invocation, and a re-verify step.
- The standalone model-resolution wall is cracked in-band (2026-10-12,
  issue 14): a protocol client playing the host role pushes
  `provider/updateAccountConfig` and answers
  `interaction/requestProviderRuntimeHeaders` — see
  [research/entitlement-crack-2026-10-12.md](research/entitlement-crack-2026-10-12.md)
  and feasibility §11 before designing around spawning; re-verify on any
  binary where `zcode.cjs` sha256 ≠ `fad4c35c…`.

## SLP room protocol

The room's shared protocol; every seat in the room reads and is bound by
it. Droppable copy for target repos:
[plugins/room/contracts/WORKSPACE-PROTOCOL.md](plugins/room/contracts/WORKSPACE-PROTOCOL.md);
per-seat contracts: [plugins/room/contracts/LEAD.md](plugins/room/contracts/LEAD.md),
[plugins/room/contracts/PEER.md](plugins/room/contracts/PEER.md);
law-by-law traceability:
[docs/role-contracts-traceability.md](docs/role-contracts-traceability.md).

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

**Audit.** Every brief → response → disposition is recorded, append-only,
in the room ledger. (Mechanics: the plugin's ledger and registry —
`record_event` and `read_ledger` for the loop, `register_seat` /
`retire_seat` / `lookup_seats` for seats; watch live with `room tail`.)

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/<feature>/`. See
[docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).

### Triage labels

The five canonical triage roles are used as-is (`needs-triage`, `needs-info`,
`ready-for-agent`, `ready-for-human`, `wontfix`). See
[docs/agents/triage-labels.md](docs/agents/triage-labels.md).

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root, created
lazily. See [docs/agents/domain.md](docs/agents/domain.md).
