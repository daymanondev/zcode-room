---
name: room
description: Use when working inside an SLP room on ZCode - posting to or reading from the room's out-of-band mailbox (the post_message/read_mailbox MCP tools) for peer-to-peer coordination or escalation upward, registering or looking up room seats (registry), recording closure-loop events to the append-only ledger, or auditing the room. Also covers the room's native-first rule for when the mailbox may be used.
---

# The room machinery

You are one seat in an SLP room (Supervisor, Lead, or Peer). The room gives
you three things: an out-of-band mailbox, a registry of seats, and an
append-only audit ledger.

## Native first

Use native channels before the mailbox, always:

- Briefs arrive in your spawn prompt; reports return as your final report.
- Your parent (the seat that spawned you) is reached natively through your
  final report — do not mailbox it.

The mailbox exists only for the links the harness lacks:

- peer ↔ sibling peer (you have no native channel to your siblings)
- escalation upward past your parent, when the brief is contradicted by
  evidence and the parent channel failed or is inappropriate

The mailbox must not become the primary channel. If you are exchanging many
messages to accomplish the work itself, stop and reconsider.

## Addressing

Seats are named with lowercase alphanumerics and dashes, for example
`supervisor`, `lead`, `peer-engineer`, `peer-reviewer`. Your own seat name
arrives in your brief.

- `post_message` with `{to, from, body}` — post one message to a seat.
- `read_mailbox` with `{seat}` — read and consume the unread messages
  addressed to a seat. Reading is consuming: a message read once does not
  come back.

Check your own mailbox when a brief tells you to expect peer mail, and before
you finish, so a sibling's coordination request cannot strand silently.

## Registry

The registry answers "who holds which seat". Register your seat when your
work in the room starts (`register_seat` with your seat name and role —
`supervisor`, `lead`, or `peer`); the first registration in a workspace opens
the room. Re-registering is idempotent — for a supervisor, within the arming
session. The one-supervisor rule is enforced at the arming act: a second
live supervisor (another session re-arming the seat, or a new supervisor
seat) is refused citing the live seat; recovery is the Human's explicit
`retire_seat`, after which a successor name arms. Retirement is terminal
for a seat name. `lookup_seats` lists seats and the room's recorded rules.

## Ledger

The ledger is the room's append-only audit trail: every brief → response →
disposition is recorded. Lifecycle lines (room_opened, lead_registered,
peer_spawned, retired) are minted by registry acts — do not record them
yourself. The four loop lines are recorded by the seat that observes the
event, via `record_event`:

- `brief_sent` — when a brief is dispatched (the dispatcher records it)
- `handoff_received` — when a six-field handoff report arrives (the parent
  records it)
- `disposition` — when a candidate is explicitly ACCEPTED or REJECTED, with
  the technical reason
- `needs_human` — when a NEEDS-HUMAN line is emitted

Silence, DONE, and passing tests are not a disposition; if it is not in the
ledger with a reason, it did not happen. Audit with `read_ledger` (it
verifies the hash chain and refuses to trust lines after any tampering);
watch the room live from a terminal with `room tail`.
