---
description: Work ticket 14 — crack the standalone entitlement wall (bundle trace, desktop-as-daemon, agent-server)
---

Work ticket 14 in this repo: `.scratch/room/issues/14-standalone-entitlement-handshake.md`.

Read before anything else:

1. The ticket file above (work order + probe list).
2. `research/wall-probe-2026-10-12.md` — the grade-A evidence base from
   issue 03. Know what was already tried and refuted; do not retry the env
   pair, the bundled-config var, `server/discover` on app-server, bare
   `setModel`, or `session/send`-with-modelSelection on this binary.
3. `research/zcode-slp-feasibility.md` §9.3, §9.7, §10 — the wall's history
   and the current mechanism (all 8 `account:*` providers load
   `entitled:false` → `providerCount: 0` → `model.available: []`).

Gate 0 — pin the binary (AGENTS.md rule): `shasum -a 256
/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` must equal
`fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f`.
If it differs, STOP: re-read the registry bootstrap in the new bundle and
re-verify issue 03's re-verify step before probing anything.

Then execute the ticket's probes in this order:

1. **Bundle trace** (safe, cheapest): pin the standalone account source —
   `Ykt`'s `standalone.credentialStore` (`jM`), the `oPn`/`GKe` refresh
   path (de-minified symbols; entry points in wall-probe §2) — and find
   where `entitled` is computed, what triggers it in the desktop, and which
   step a standalone start skips.
2. **Probe C — desktop-as-daemon** (route-around): find the running desktop
   app's internal control path — no TCP listener exists (lsof, A); it
   spawns entitled `zcode-cli` children per session (feasibility §9.1
   process tree) — likely stdio children or a unix socket. Read the bundle
   for the launch/IPC surface, then drive one session creation through it
   and check `model.available`. This probe needs nothing from upstream.
3. **Probe A — `agent-server`** (hidden subcommand, own protocol;
   `ZCODE_AGENT_PROVIDER` literals nearby): drive it and check whether its
   registry/model surface behaves differently than app-server.

**Probe B (`zcode login`) is Human-gated: never run it unless the Human
approves it in this session's chat.** It mutates the shared
`~/.zcode/v2/credentials.json`.

Rules while working: record every live observation verbatim with grade
A/B/C (AGENTS.md conventions); never copy secret material into the repo
(field names and success flags only); junk zero-token sessions in the db
are acceptable — note them for hygiene; commit locally as you go.

Done means: the outcome (any probe that flips `entitled:true`, or bounded
negative exhaustion) is recorded in the evidence base with a re-verify
step; `research/zcode-slp-feasibility.md` §10 and
`research/upstream-bug-report-draft.md` are updated if the picture moved;
the ticket's checkboxes and status are updated; and your final message is
the six-field handoff (outcome, snapshot, scope, verification,
unknown/risk, ownership).
