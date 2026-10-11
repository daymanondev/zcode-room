# Glossary

Domain terms for the SLP room on ZCode. Sources: the SLP contracts in
`research/slp/`, the codex-room canon, the substrate evidence in
`research/zcode-slp-feasibility.md`.

- **Room** — the four-role organization (Human, Supervisor, Lead, Peers) plus
  its shared contracts, standing for exactly one project. One room per
  workspace.
- **Seat** — a named address in the room (`supervisor`, `lead`,
  `peer-engineer`, …). The mailbox routes by seat name; holding a seat is
  recorded in the registry.
- **Supervisor** — the seat the Human chats with. Faithfully routes Human
  intent, audits the closure loop, holds no code pen and no acceptance pen.
  At most one live per room.
- **Lead** — the technical arbiter of one project: owns framing →
  decomposition → briefs → acceptance. May write, never accepts its own
  writing.
- **Peer** — an independent co-worker holding exactly one bounded outcome per
  turn. The profile carries the invariant part; the per-turn character comes
  from the disposition.
- **Disposition** — the role a peer plays this turn: Engineer, Architect,
  Reviewer, or Scout. Lives in the brief, never in the profile.
- **Brief** — the neutral work order to a peer: outcome, owned/excluded
  scope, authority, verification — stated without pre-solving the answer.
- **Handoff** — the six-field report a peer returns: outcome, snapshot,
  scope, verification, unknown/risk, ownership.
- **Closure loop** — brief → response → explicit disposition. Silence, DONE,
  or passing tests are not a disposition.
- **LEAD-WROTE marker** — the fixed line `LEAD-WROTE: <sha> — needs Human
  accept` opening a Lead-written diff's summary; the only trace separating
  "Lead wrote and waits" from "Lead wrote and moved on".
- **Escalation reports** — the three ways a peer signals it cannot proceed
  as briefed: `REOPEN_REQUEST` (naming the layer), `DEPENDENCY_REQUEST`,
  `BLOCKED`.
- **Mailbox** — the room's out-of-band message channel, used only where the
  harness offers no native channel (peer↔peer, escalation upward).
- **Native-first** — the rule that harness channels are used before the
  mailbox: briefs go in by spawn, reports come out by final report.
- **Ledger** — the append-only record of the closure loop, kept for audit.
- **Registry** — the room's answer to "who holds which seat in this room".
- **The wall** — the standalone model-resolution blocker in ZCode's private
  surface (feasibility §9.3/§9.7).
- **Lane economics** — treating quota cost as a first-class routing
  criterion: cheap lanes for cheap work, the idle lane for off-peak work.
