---
name: room
description: Use when working inside an SLP room on ZCode - posting to or reading from the room's out-of-band mailbox (the post_message/read_mailbox MCP tools) for peer-to-peer coordination or escalation upward. Also covers the room's native-first rule for when the mailbox may be used.
---

# The room mailbox

You are one seat in an SLP room (Supervisor, Lead, or Peer). The room gives
you an out-of-band mailbox to reach seats the harness cannot route you to.

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
