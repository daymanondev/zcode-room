# Research notes: hoangnb24/codex-room-setup

Researched 2026-09-29 against the live repository (default branch `main`). All file references link to `https://github.com/hoangnb24/codex-room-setup/blob/main/<path>`. Every quote below was fetched verbatim from that branch.

## 1. Repo meta

| Field | Value |
| --- | --- |
| Full name | `hoangnb24/codex-room-setup` |
| Description | "Reproducible Codex Room roles, isolated runtimes, and Paseo fork setup." |
| Created / pushed | 2026-08-15 / 2026-09-21 (repo metadata updated 2026-09-29) |
| Default branch | `main` |
| Language / size | Python, 454 KB |
| Stars / forks / open issues | 16 / 2 / 3 |
| License | none |
| Homepage / topics / wiki / pages | none |
| Latest tree SHA | `348129092cb1bf92176f062bca0ca0ddda3cfbfe` |

### Recent commits (last 10)

| sha | date | message |
| --- | --- | --- |
| `34812909` | 2026-09-21 | Allow transactional Paseo tag restoration |
| `db4e4d70` | 2026-09-18 | Add workspace protocol and response closure rules |
| `c75b5b72` | 2026-09-18 | Refine supervisor handoff and overlay sync guidance |
| `4fb9df7a` | 2026-09-18 | Migrate Paseo setup to stable release |
| `a38c5cea` | 2026-09-05 | Merge pull request #8 from hoangnb24/core-minimum — Publish minimum three-role Codex Room core |
| `724ad906` | 2026-09-05 | fix: build and verify Paseo CLI and daemon during install |
| `6ca3b874` | 2026-09-05 | fix: disable native agent tables in Room runtimes |
| `512ac614` | 2026-09-05 | docs: mark shared hooks as optional throughout guides |
| `95d4e905` | 2026-09-05 | fix: allow installation without optional Codex hooks |
| `8312c9ea` | 2026-09-05 | docs: record final minimum-core acceptance evidence |

Activity pattern: a burst on 2026-09-05 (the "minimum three-role core" release, merged via PR #8), then a September 18–21 wave that migrated Paseo from a personal fork to the official stable release and hardened the coordination doctrine (workspace protocol, "response closure rules"). 68 blobs total, tree not truncated.

## 2. What it actually is

A reproducible setup kit that stands up a three-role "Codex Room" — **Supervisor, Lead, Peer** — of Codex CLI agents orchestrated through [Paseo](https://github.com/getpaseo/paseo). Each role is a Paseo *derived provider* (`extends: "codex"`) whose command launches a small bash wrapper that materializes an isolated per-role `CODEX_HOME` at `~/.codex-runtime/<role>` and then execs `codex`. The generated runtime is a merge of the *operator's own* `~/.codex/config.toml` (never rewritten) with a tiny allowlisted TOML overlay carrying the role's model, reasoning effort, sandbox policy, and a long `developer_instructions` doctrine block. Paseo MCP orchestration tools are injected into Supervisor and Lead only; Peer gets none. The README's control-flow diagram:

```text
Paseo provider
  -> codex-room <supervisor|lead|peer>
  -> codex-room-sync
  -> isolated ~/.codex-runtime/<role>
  -> Codex app-server
```

The repo deliberately does **not** own `~/.codex`; the operator installs and authenticates Codex independently, and auth/skills/plugins/AGENTS.md are *symlinked* into each runtime ([README.md](https://github.com/hoangnb24/codex-room-setup/blob/main/README.md)).

## 3. Tree map (full)

```
.gitignore
Makefile                        # doctor/test/test-container/verify/install/sync/snapshots targets
README.md                       # main doc (7.8 KB)
install                         # 8-line bash -> python3 scripts/install-room "$@"
docs/
  acceptance/core4.md           # 15 KB acceptance evidence record (release handoff)
  architecture.md               # control flow, ownership table, runtime merge steps
  huong-dan-codex-room-setup.md # Vietnamese setup guide
  operations.md                 # role change / handoff / provider catalog runbooks
  paseo-release.md              # stable-release selection, fork migration, tool policy
  paths-and-ownership.md        # tracked canonical files vs generated vs private state
  profiles-and-overlays.md      # the three meanings of "profile"
  runtime-generation.md         # how codex-room-sync builds a runtime
  troubleshooting.md
home/                           # mirror of $HOME, installed by the kit
  .config/codex-room/
    model-instructions.md       # 17.7 KB shared base prompt (fork of Codex personality prompt)
    overlays/supervisor.config.toml
    overlays/lead.config.toml
    overlays/peer.config.toml
    workflow/WORKSPACE_PROTOCOL.md   # shared coordination contract (6.4 KB)
  .local/bin/
    codex-room                  # launcher: role arg -> sync -> CODEX_HOME exec codex
    codex-room-sync             # Python runtime generator (~250 lines)
    paseo-local-update          # macOS Desktop updater
  .paseo/config.json.template   # Paseo daemon + provider catalog (rendered with @@HOME@@)
paseo/
  README.md  source.toml  versions.toml
  legacy/paseo.phase2-coexist.candidate.json.template
  legacy/paseo.phase2-hard-cut.candidate.json.template
  migration/README.md           # Vietnamese fork-vs-upstream survey (2026-09-15)
  notes/{desktop-build,mcp-injection,model-catalog,provider-profiles,release-compatibility}.md
runtime/
  README.md  layout.md  snapshots/.gitkeep
scripts/
  install-room                  # 1238-line Python transactional installer (the big one)
  install-paseo                 # lower-level Paseo checkout/build helper
  install                       # maintenance HOME-mirror installer (9 files + retire legacy)
  sync-all  verify  doctor  uninstall  update-paseo
  export-current  export-runtime-snapshots
  lib/common.sh  lib/paseo-tools.jq
secrets/README.md
tests/
  test_setup.py                 # 84 KB (!) of unit tests
  test_paseo_release.py  test_container_interface.py
  fixtures/model-catalog.json
  container/{Dockerfile,run,accept,smoke-daemon.py}
```

Key links: [install](https://github.com/hoangnb24/codex-room-setup/blob/main/install), [scripts/install-room](https://github.com/hoangnb24/codex-room-setup/blob/main/scripts/install-room), [home/.local/bin/codex-room](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.local/bin/codex-room), [home/.local/bin/codex-room-sync](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.local/bin/codex-room-sync), [home/.paseo/config.json.template](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.paseo/config.json.template), [home/.config/codex-room/workflow/WORKSPACE_PROTOCOL.md](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.config/codex-room/workflow/WORKSPACE_PROTOCOL.md), [docs/architecture.md](https://github.com/hoangnb24/codex-room-setup/blob/main/docs/architecture.md), [paseo/source.toml](https://github.com/hoangnb24/codex-room-setup/blob/main/paseo/source.toml), [scripts/lib/paseo-tools.jq](https://github.com/hoangnb24/codex-room-setup/blob/main/scripts/lib/paseo-tools.jq), [docs/acceptance/core4.md](https://github.com/hoangnb24/codex-room-setup/blob/main/docs/acceptance/core4.md).

## 4. Setup flow walkthrough (exact)

Prerequisites (README): macOS or Unix-like with Bash, Python 3.11+, Git, Node 22, npm, jq; Codex CLI installed **and authenticated** with an existing `~/.codex/config.toml`, `auth.json`, `AGENTS.md`, `skills/`, `plugins/` (`hooks.json` optional — shared if present, skipped if absent); `~/.local/bin` on `PATH`.

1. **Clone**: `git clone https://github.com/hoangnb24/codex-room-setup.git && cd codex-room-setup`.
2. **Plan**: `./install` — read-only; runs `python3 scripts/install-room` in dry-run mode. Prints `PREFLIGHT Paseo stable v0.8.0 (<commit>)`, the PASEO checkout/CLI-link targets, and per-file `CREATE|REPLACE|UNCHANGED` states for the nine managed HOME files, plus any `RETIRE` lines for recognized legacy artifacts. Also executes the safety checks (`check_configured_path_safety`, `check_managed_obstacles`, `check_operator_codex`, `check_runtime_obstacles`, `check_paseo_obstacles`, `validate_existing_paseo`).
3. **Apply**: `./install --apply` — one transaction: preflight the pinned Paseo checkout in a disposable staging directory (`npm ci`, `npm run build:server:clean`, require CLI+daemon bundles, smoke `paseo --help`), render the managed HOME files (`@@HOME@@` → `$HOME`), stage all three role runtimes, then publish with rollback on dependency/build/generation/final-verification failure. Every replaced file and the Paseo checkout are backed up under `~/.codex-room-backups/core3-<UTC>-<pid>-<nanoseconds>/` with owner-only modes (0700 dirs; the acceptance record verifies 136,175 backup files at 0600). Ctrl-C/SIGTERM trigger rollback; SIGKILL/power loss is acknowledged as an OS durability limit.
4. **Start the daemon yourself**: `paseo daemon start; paseo daemon status` — the installer never restarts a daemon (to avoid interrupting running agents).
5. **Verify**: `./install --verify` — read-only installed-state checks **plus live provider inventory**; fails if the daemon is unreachable. `scripts/verify` is the installed-only variant that works with the daemon stopped.
6. **Optional container acceptance**: `make test-container` — runs the public installer twice in a digest-pinned Node 22 / Debian Python 3.11 container against a fresh fake operator home, using [tests/fixtures/model-catalog.json](https://github.com/hoangnb24/codex-room-setup/blob/main/tests/fixtures/model-catalog.json) so no Codex auth is needed; prints `ROLE_INVENTORY`, `MCP_RECIPIENTS`, and `CONTAINER_ACCEPTANCE_OK`.
7. **Optional Desktop update**: `paseo-local-update` (macOS) — validates tag/commit/remotes/hooks/lock, fast-forward-only to the pinned commit, `npm ci`, build, ad-hoc sign, backup + replace `/Applications/Paseo.app`, restart.
8. **Change loop** (docs/operations.md): edit an overlay or the config template → `make test` + `./scripts/verify --source` → `./install` (plan) → `./install --apply` → restart Paseo when no agent turn is active → `./install --verify`.

The managed file set (from `MANAGED_FILES` in install-room and [scripts/install](https://github.com/hoangnb24/codex-room-setup/blob/main/scripts/install)): model-instructions.md (0644), the three overlays (0600), WORKSPACE_PROTOCOL.md (0644), `codex-room`/`codex-room-sync`/`paseo-local-update` (0755), `.paseo/config.json` rendered from template (0600). Legacy five-role artifacts (`review.config.toml`, `harness.config.toml`, phase2 candidate JSONs, `codex-room-hard-cut`, `codex-review-apply`) are backed up and retired only if byte-identical to known shapes.

Per-role generation ([home/.local/bin/codex-room-sync](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.local/bin/codex-room-sync)): read base `~/.codex/config.toml`; apply only `OVERRIDE_KEYS = {model, model_instructions_file, model_reasoning_effort, sandbox_mode, approval_policy, approvals_reviewer}` from the overlay; splice the overlay's `developer_instructions` block; point `model_catalog_json` at a generated catalog from `codex debug models` with every `multi_agent_version` nulled; force `[agents].enabled = false`, `features.multi_agent = false`, and `features.multi_agent_v2` disabled (boolean or table form — a bug fix recorded in core4.md); symlink shared resources (`auth.json`, `AGENTS.md`, `skills`, `plugins`, optional `hooks.json`, plus room-shared `model-instructions.md`); atomically write `config.toml`; chmod 0700 on runtime dirs; print diagnostics to stderr only because "App-server reserves stdout for its JSONL protocol."

## 5. Model menu (exact, from config.json.template)

Three derived providers, each `extends: "codex"`, each with `params: {sandbox_mode: "danger-full-access", approval_policy: "never"}` and a replacement `models` catalog:

**codex-supervisor** — `paseoTools.enabled: true`
- `gpt-5.6-sol` — label **"Sol Medium"** — default — thinkingOptions: `medium` (default)

**codex-lead** — `paseoTools.enabled: true`
- `gpt-6-astra` — label **"Astra Medium"** — default — thinkingOptions: `medium` (default)
- `gpt-5.6-sol` — label **"Sol Medium"** — thinkingOptions: `medium` (default)

**codex-peer** — `paseoTools.enabled: false`
- `gpt-6-astra` — label **"Astra Low"** — default — thinkingOptions: `low` (default)
- `gpt-5.6-sol` — label **"Sol Medium"** — thinkingOptions: `medium` (default)
- `gpt-5.6-luna` — label **"Luna Max"** — thinkingOptions: `max` (default)

So "Astra Low / Sol / Luna Max" is exactly the **Peer** picker; Lead gets Astra Medium + Sol Medium; Supervisor gets only Sol Medium. All other providers (claude, codex, copilot, opencode, pi, omp, grok, hermes) carry explicit `paseoTools.enabled: false`.

Known wrinkle: all three *overlays* set `model = "gpt-5.6-sol"` / `model_reasoning_effort = "medium"`, while the Paseo picker defaults for Lead and Peer are `gpt-6-astra`. This mismatch is disclosed, not hidden — [docs/paseo-release.md](https://github.com/hoangnb24/codex-room-setup/blob/main/docs/paseo-release.md) records `test_role_defaults_are_aligned` failing (63/64) with "the pre-existing working config selects Astra for Lead/Peer while their overlays still select Sol," and core4.md lists reconciling it as next work. The README's roles table says defaults are `gpt-5.6-sol` medium for all three.

## 6. Permissions and safety stance

Blunt at the sandbox level, elaborate at the doctrine level:

- Every overlay: `sandbox_mode = "danger-full-access"`, `approval_policy = "never"`; same values repeated in each provider's `params`. README: "All role overlays currently request `danger-full-access` with `approval_policy = "never"`."
- The actual safety architecture is (1) **tool gating** — `paseoTools.enabled` restricts Paseo MCP + native orchestration tools to Supervisor/Lead; Peer "receives neither catalog"; (2) **isolation** — per-role `CODEX_HOME`, sessions/SQLite/logs never shared; (3) **authority doctrine** — Human retains "product, cost, external-effect, and irreversible-risk decisions"; (4) **operational hygiene** — loopback-only daemon (`127.0.0.1:6767`), browserTools/voice/dictation disabled, owner-only backups, no secrets ever in Git, refusal to replace non-symlink runtime paths, uninstall is dry-run by default.
- The docs are honest about the limit: "`paseoTools` … This controls tool delivery, not what an agent with shell access can discover" (paseo-release.md).
- The launcher refuses symlinked role directories (anti-confusion guard), and `codex-room-sync` refuses to clobber non-symlink shared paths.

## 7. Paseo integration details

- Pin: [paseo/source.toml](https://github.com/hoangnb24/codex-room-setup/blob/main/paseo/source.toml) — official `https://github.com/getpaseo/paseo.git`, release `v0.8.0` (published 2026-09-10), commit `b8e24677e12b226c7c38c1c3a40649daa9f1152f`, checkout `~/projects/supervisors/paseo`, branch `main`, CLI at `packages/cli/bin/paseo`, symlinked to `~/.local/bin/paseo`. Tag is fetched and its peeled commit verified (annotated and lightweight tags both supported; beta/prerelease/moved tags refused).
- Daemon config: `daemon.mcp.enabled: true`, `daemon.mcp.injectIntoAgents: true`, `injectIntoProviders` (a fork-only field) explicitly removed. The old `hoangnb24/paseo` fork at `8511089e…` (which used a per-provider MCP allowlist patch) is migrated once, inside the backed-up install transaction; the migration survey in [paseo/migration/README.md](https://github.com/hoangnb24/codex-room-setup/blob/main/paseo/migration/README.md) cites the upstream feature commit `53c96074` (merged 2026-09-03) that introduced `paseoTools`.
- The fork also carried a loopback bearer-token bypass (`c81cb8473`) that upstream removed — another documented reason to move off the fork.
- Policy enforcement: [scripts/lib/paseo-tools.jq](https://github.com/hoangnb24/codex-room-setup/blob/main/scripts/lib/paseo-tools.jq) is a jq predicate requiring MCP enabled, no `injectIntoProviders`, all nine known provider IDs present, and `paseoTools.enabled == (.key == "codex-supervisor" or .key == "codex-lead")` — used by `scripts/verify` and `scripts/export-current`. Notes repeatedly warn that upstream defaults to *enabled* for unspecified providers and `extends` does not inherit the policy, so every new provider must opt out explicitly.
- Supervisor runtime behavior: one self-targeted `create_heartbeat` with cron `*/2 * * * *` as a *fallback* for event-coverage gaps; `background=true` + `notifyOnFinish=true` for necessary Lead messages; heartbeats deduplicated via `list_schedules` and removed when supervision ends.

## 8. "Rooms" vs worktrees vs seats

- A **seat** is a Paseo agent slot driven by one of the three derived providers (`codex-supervisor`, `codex-lead`, `codex-peer`). Provider = profile + command + model catalog; seat = running agent instance with its own session.
- The **room** is the whole three-role organization plus its contracts (WORKSPACE_PROTOCOL.md, overlays, tool policy). "Room" appears in `CODEX_ROOM_*` env vars, `~/.config/codex-room/`, `codex-room` binary.
- A role runtime is *not* a git worktree; it's an isolated `CODEX_HOME` directory (`~/.codex-runtime/<role>`) with generated config, generated model catalog, private sessions/SQLite, and symlinks into `~/.codex`. Worktrees and branches appear only as a Lead-level tactic for parallelism: "Use separate branches or worktrees when needed" (Lead overlay, WORKSPACE_PROTOCOL.md). Paseo itself owns "agents, projects, worktrees, logs and identity" under `~/.paseo` (architecture.md ownership table).
- Native Codex multi-agent features are deliberately killed in every runtime (`agents.enabled = false`, `multi_agent*` off, catalog `multi_agent_version: null`) so that "Paseo therefore owns exactly the supervisor/lead/peer topology."

## 9. Prompt gold (verbatim, with sources)

**(a) Authority split** — [WORKSPACE_PROTOCOL.md](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.config/codex-room/workflow/WORKSPACE_PROTOCOL.md):

```
- Human owns product goals, priority, material cost, external effects, and
  irreversible risk decisions.
- Supervisor observes, faithfully routes Human intent, and performs bounded
  room recovery. It is not another project Lead.
- Lead owns project framing, technical decisions, integration, verification,
  and explicit candidate acceptance.
- Peer owns one bounded outcome delegated by Lead.
```

**(b) Escalation vocabulary** — same file:

```
Peer may return `REOPEN_REQUEST` for a failed premise,
`DEPENDENCY_REQUEST` for an unowned prerequisite, or `BLOCKED` when no safe
in-scope progress remains. Each signal includes evidence, consequence, and the
decision or dependency needed.
```

**(c) Closure loop (Lead)** — [overlays/lead.config.toml](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.config/codex-room/overlays/lead.config.toml):

```
Close every actionable Peer response against its original brief. Answer the
question, resolve the dependency or ownership decision, request specific
missing evidence, or explicitly ACCEPT/REJECT the exact candidate with a
reason. ... Silence, DONE, or passing tests are not a disposition. Do not dispatch work
that depends on an unresolved response; continue unrelated ready work.
```

**(d) Supervisor as loop auditor** — [overlays/supervisor.config.toml](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.config/codex-room/overlays/supervisor.config.toml):

```
Enforce the complete communication loop: original Lead brief -> actual Peer
response -> explicit Lead disposition. Inspect both Lead and Peer activity;
Lead's summary alone is not proof that the loop closed.
```

**(e) Privacy firewall (Supervisor)** — same file:

```
Keep the private communication path out of every Lead-facing message and any
project artifact: no verbatim quotes or transcripts, Human/Supervisor labels,
source attribution, private agent IDs, or explanation of who spoke to whom.
Express authorized decisions directly as project instructions ...
```

**(f) Peer's non-aggression clause** — [overlays/peer.config.toml](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.config/codex-room/overlays/peer.config.toml):

```
Do not spawn, manage, or coordinate other agents, infer room topology, or
accept your own difficult change. Tests and completion messages are evidence;
Lead decides technical acceptance.
```

**(g) Evidence vs acceptance** — WORKSPACE_PROTOCOL.md:

```
Writer proof, passing tests, completion messages, and lifecycle status are
evidence. Lead inspects the exact artifact and explicitly accepts or rejects
the candidate with a technical reason. Human alone decides product scope,
material cost, external effects, and irreversible risk.
```

**(h) Handoff standard (Peer candidate)** — WORKSPACE_PROTOCOL.md:

```
A writable Peer returns an immutable candidate or deterministic snapshot,
original base, complete changed paths, verification, and residual risk.
```

Note: [model-instructions.md](https://github.com/hoangnb24/codex-room-setup/blob/main/home/.config/codex-room/model-instructions.md) is *not* room doctrine — it is a 17.7 KB fork of Codex's base personality/behavior prompt (commentary/final channels, apply_patch rules, destructive-action caution, skills system), symlinked into every runtime as `model_instructions_file`. The room-specific behavior lives entirely in the three `developer_instructions` blocks and the protocol doc.

## 10. Analysis

### Strengths

1. **Genuinely transactional installer.** [scripts/install-room](https://github.com/hoangnb24/codex-room-setup/blob/main/scripts/install-room) (1,238 lines of Python) implements a real `Transaction` class: staged publication, per-entry backups with recorded modes, created-dir and mode-change journals, Paseo checkout + CLI-link snapshot/restore, a cancellation token wired to SIGINT/SIGTERM that settles owned child process groups before rollback, and obstacle checks that refuse symlinks/unexpected shapes. For a personal dotfiles-style kit this is far above par, and it is backed by an 84 KB test file plus a repeatable Docker acceptance harness.
2. **Non-invasive layered configuration.** The operator's `~/.codex` is treated as read-only base state; role differences enter through a six-key allowlist (`OVERRIDE_KEYS`) and merge out into disposable runtimes with symlinked shared resources. This cleanly separates "who the operator is" (auth, skills, plugins) from "what the role may do" (overlay + tool policy), and the docs explain Codex's own precedence chain (CLI flags > project `.codex/config.toml` > generated user config).
3. **Coherent, self-aware doctrine.** The authority model (Human/Supervisor/Lead/Peer), the closure rules ("Silence, DONE, or passing tests are not a disposition"), the escalation vocabulary (REOPEN_REQUEST / DEPENDENCY_REQUEST / BLOCKED), immutable-candidate handoffs, and event-driven waiting instead of polling are stated consistently across overlays, protocol, README, and both language guides. The acceptance record even quotes SHA-256 fingerprints of inspected candidates and discloses its own failing test — evidence discipline matching its own doctrine.

### Weaknesses

1. **`danger-full-access` + `approval_policy = "never"` on every seat.** All defense is prompt-level and tool-delivery-level; any prompt drift or confused deputy inside a full-access shell seat has no mechanical brake. The repo admits the boundary ("This controls tool delivery, not what an agent with shell access can discover"). For a book chapter this is the sharpest tension: the most elaborately governed room runs on the least sandboxed setting, justified only by the human-owns-irreversible-risk doctrine.
2. **Regex TOML surgery.** `codex-room-sync` merges config by string slicing and regex (`top_level_table_offset`, `developer_block`, `set_table_scalar`) rather than a TOML round-trip via `tomllib` — the v2 multi-agent table collision was exactly the class of bug this invites, fixed reactively (documented in core4.md). It also requires Python ≥3.11 for `tomllib` in verify paths while the generator itself avoids the dependency — a subtle split.
3. **Known unresolved model-default mismatch.** Paseo picker defaults (Astra for Lead/Peer) disagree with overlay defaults (Sol everywhere); one test ships failing and reconciliation is "next work." Combined with no license, no CI workflows in-tree (tests are run manually — logs cited under `/tmp/`), macOS-centric Desktop flow, and partially Vietnamese docs, the kit is reproducible-but-personal: an excellent pattern reference, not a turnkey product.

### Extra observations

- The "fork-to-upstream" arc is a good case study: a custom MCP-allowlist fork replaced by official `paseoTools` once upstream shipped per-provider policy, with a dated migration survey retaining both candidate configs under `paseo/legacy/`.
- Docs repeatedly model *behavioral* acceptance as distinct from source verification: "Prompt and runtime checks alone do not establish this behavioral acceptance" (operations.md) — a rare, honest stance on prompt-based coordination.
- `codex-room` launcher is 30 lines; the whole runtime-generation core is ~250 lines of Python; the mass is in the installer (1,238 lines) and tests — the complexity budget went to safe installation, not to the runtime trick itself.
