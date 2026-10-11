# zcode-room

Build SLP — the codex-room shape (Supervisor → Leads → Peers) — **on ZCode**.

Split out of [research-slp](../research-slp) on 2026-10-11: that repo builds
the Paseo plugin (paseo-factory) and stays Paseo-only; every ZCode-substrate
question, and later the ZCode build itself, lives here.

## The shape we are building

Andrew chats with the **Supervisor**; the Supervisor dispatches **Leads** as
separate main-agent sessions; each Lead spawns its own **Peers** as
sub-agents. This is codex-room's own canon (Supervisor "faithfully routes
Human intent", sends Lead messages with `background + notifyOnFinish`) —
verbatim contracts in [research/slp/codex-room-setup-notes.md](research/slp/codex-room-setup-notes.md).

## What is already proven (live, 2026-10-10/11)

Full account in [research/zcode-slp-feasibility.md](research/zcode-slp-feasibility.md):

1. **Sub-agents never spawn or message peers** — star topology per session,
   proven live + docs + binary. Constraint becomes feature: it enforces
   codex-room's "one owner of the topology" per session.
2. **Main sessions CAN be spawned externally** — the app bundle hides
   `zcode.cjs` (`--prompt`, `--resume`, `--json`, `--mode`, `--disallowed-tools`)
   and an `app-server --stdio` JSON-RPC protocol (`session/create|send|setModel|subscribe|fork|subagents|usage`).
   Sessions were minted both ways on this machine.
3. **Sub-agents receive the full MCP surface** (90/90) — a plugin's MCP
   server is the out-of-band peer↔peer bus.

## The one remaining wall

Standalone spawns cannot resolve a model: the provider registry stays empty
(`model.available: []`) after any provider switch — the `--prompt`
default-model bug (report-worthy), and the app-server path lacks the
desktop's auth wiring. Next lead: the `v4/connection` handshake
([research/zcode-slp-feasibility.md](research/zcode-slp-feasibility.md) §9.4).

## Repo map

- [research/zcode-slp-feasibility.md](research/zcode-slp-feasibility.md) —
  the substrate evidence base (9 sections, graded A/B/C)
- [research/substrate-scout.md](research/substrate-scout.md) — the
  Paseo-vs-ZCode substrate comparison (copied from research-slp's v0.0.9
  scout; Paseo won that round for the *factory* — this repo bets ZCode is
  still worth building for the room itself)
- [research/slp/](research/slp/) — the SLP contracts copied from
  research-slp: the four-role model, LEAD.md / PEER.md source contracts,
  codex-room notes (canon), the Lead-fidelity evidence base

## Conventions

English for all docs/commits/comments. Claims carry evidence grades
(A = verbatim primary/live, B = interpreted primary, C = inferred). ZCode's
private surface (hidden CLI, internal protocol) is version-fragile: every
use pins the observed version (zcode 0.16.9) and a re-verify command.
