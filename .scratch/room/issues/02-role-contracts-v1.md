# 02: Role contracts v1 — English, canon-traceable

**What to build:** The room's three contracts plus the shared protocol: the
workspace protocol section in the workspace instructions (every seat reads
it), the PEER contract, and the LEAD contract in its M0 main-session form —
English rewrites of the canon where every law is either kept (with source)
or mechanics-swapped (with reason). A smoke dispatch in-session runs one
peer on one brief and receives a six-field handoff through native channels
alone.

**Blocked by:** None (can start immediately).

**Status:** done (2026-10-12)

- [x] Workspace instructions carry the shared protocol; a fresh session
      answers a closure-law question correctly from them alone
- [x] Traceability table maps every law in each contract to its
      `research/slp/` source (kept / swapped-with-reason)
- [x] Smoke dispatch: one peer, one ten-field brief, six-field handoff with
      a frozen SHA — no mailbox involved

## Comments

**2026-10-12 — implemented; all three boxes live-proven in this session.**

Deliverables:

- `AGENTS.md` § "SLP room protocol" — the shared protocol in the workspace
  instructions (authority split, topology + M0 note, closure loop,
  escalation + NEEDS-HUMAN, evidence vs acceptance, six-field handoff
  standard, native-first channels, audit). Droppable copy for target repos:
  `plugins/room/contracts/WORKSPACE-PROTOCOL.md` (sync note in its header).
- `plugins/room/contracts/PEER.md` — full English rewrite of
  `research/slp/PEER.md`; adds one ZCode-room section (Channels — native
  first, mailbox only sibling↔sibling + upward).
- `plugins/room/contracts/LEAD.md` — English rewrite of
  `research/slp/LEAD.md` in M0 main-session form (Agent tool is the only
  spawn vehicle; no per-spawn dials; Human plays Supervisor).
- `docs/role-contracts-traceability.md` — law-by-law tables: 13 protocol
  rows, 44 PEER rows, 40 LEAD rows, plus 8 canon items deliberately not
  carried in v1 with reasons (INCIDENT lines, full Supervisor contract,
  heartbeat, provider trap, counter script, DECISIONS.md pointers, effort
  dial, paseo-supervision). Also two GLOSSARY additions (Seat, LEAD-WROTE
  marker) and the plugin README component list.

Box 1 — closure-law probe (grade A): a fresh general-purpose sub-agent,
prompted only with a neutral scenario ("peer reports DONE — tests pass,
Lead says nothing and dispatches the next task — has the work been properly
closed out?"), read `AGENTS.md` and answered: No; quoted the deciding line
verbatim ("**Silence, DONE, or passing tests are not a disposition.**");
named the missing piece as the Lead's explicit ACCEPT/REJECT with a
technical reason, citing "the Lead decides technical acceptance". The probe
prompt contained none of the answer.

Box 3 — smoke dispatch (grade A, all evidence captured in this session):

- Rig: `/tmp/room-smoke-02`, git repo, seed commit `bc4704c` —
  `stats.mjs` with `median()` violating its README-documented even-length
  contract (`node --test stats.test.mjs`: 4 pass / 1 fail before dispatch).
- Dispatch: one general-purpose sub-agent via the Agent tool; spawn prompt =
  PEER contract (verbatim from `plugins/room/contracts/PEER.md`) + ten-field
  brief (all ten canon fields; objective stated the failing behavior and
  left the mechanism open — the peer's diagnosis differed from the Lead's
  first guess, which is the neutrality law working).
- Handoff: returned as the final report (native channel), six fields in
  order, Snapshot SHA `08204e4cb4dbfbbabbe91d20e92cc5a2ac9ea37b` on `main`.
- Lead acceptance per the LEAD contract checklist: `git cat-file -e
  "$sha^{commit}"` OK; `git show --stat` = exactly `stats.mjs` (matches
  declared list); real diff read (one line, standard even-median fix);
  verification re-run by the Lead at the artifact (detached checkout at the
  SHA): 5/5 pass; no new public symbol; no unresolved findings; nothing
  scheduled. Disposition: ACCEPT.
- No mailbox involved: `.room/mailbox/` byte-identical before and after
  (only issue-01's `peer-reviewer` box, cursor 1); the brief assigned no
  seat and named the mailbox out of the dispatch.

Box 2 — the traceability doc is the deliverable; review pass = every law
row cites a `research/slp/` source (or spec/ADR for added rows) with
kept/swapped/added status and swap reason.

`npm test` after all changes: 10/10 pass, 0 fail (grade A). No new
mechanical tests — this issue ships contracts + live proofs; the MCP seam
is untouched.

Note for M2: the LEAD contract's M0 header (main session, sub-agents only)
is the scoped part — strike it when session dispatch lands. The installed
plugin cache (0.1.0) predates the contracts dir; it ships to target repos
on the next plugin version bump, meanwhile the build-repo path is
authoritative.
