# 03: Wall probe — the registry env pair

**What to build:** A live experiment that settles the model-resolution wall:
spawn a standalone session with the provider-registry env pair set together
(builtin + personal config paths, feasibility §9.7), plus the standalone
bundled-config var as needed, and observe whether the registry populates and
a model resolves. The outcome — working invocation, or bounded negative
scoping the next lead (`server/discover`) — is recorded in the evidence
base, and the upstream bug report for the `--prompt` default-model bug is
drafted.

**Blocked by:** None (can start immediately).

**Status:** done (2026-10-12)

- [x] Live run with the env pair set; `model.available` / spawn outcome
      recorded verbatim (grade-A notes)
- [x] Positive path: N/A — the pair is refuted. Negative path: exhaustion
      documented and the follow-up lead scoped (reshaped: `server/discover`
      is not an app-server method; entitlement + `agent-server` are the
      leads — ticket 14)
- [x] Draft bug-report text saved in the repo (not filed without the Human)
- [x] Result appended to the feasibility doc with grades and a re-verify
      step

## Comments

**2026-10-12 — closed on the negative path; the wall moved.** Evidence:
[research/wall-probe-2026-10-12.md](../../research/wall-probe-2026-10-12.md)
(grade A unless noted); feasibility §10 appended.

- Env pair (builtin active catalog r30 + real personal config) tried on both
  `--prompt` and `app-server --stdio`; outcomes identical in shape to
  baseline (traceIds/session ids differ):
  `model.available: []`, `setModel` → 「Provider Registry 中不存在 Model」,
  `--prompt` → `Model creation failed` ← `Select a model before continuing`.
  Adding `ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE` changes nothing.
- Mechanism found (A): every standalone run logs
  `zcode_protocol.provider_registry.ready` with builtin r30 loaded, all 8
  `account:*` providers `entitled:false`, `providerCount: 0` — identical
  with and without the pair. Registry construction works standalone; the
  account-entitlement handshake does not complete. Credentials decrypt
  standalone (A), so it is not file access.
- `server/discover` live on app-server: `-32601 Method not found` — it
  belongs to an MCP-dialect family, and per the bundle reading (B) plausibly
  the hidden `agent-server` (starts, own protocol, unprobed). Follow-up
  scoped as issue 14 (entitlement trace, agent-server, Human-gated
  `zcode login` probe).
- Bug-report draft (entitlement framing, stronger than the original
  default-model framing): [research/upstream-bug-report-draft.md](../../research/upstream-bug-report-draft.md)
  — not filed.
- Hygiene: ~6 zero-token junk sessions in `~/.zcode/cli/db/db.sqlite`
  (§9.6 precedent); no secrets copied; shared configs read-only.
