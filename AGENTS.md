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
- The one open blocker is the standalone model-resolution wall — see
  [research/zcode-slp-feasibility.md](research/zcode-slp-feasibility.md) §9.3/§9.4
  before designing around spawning.
