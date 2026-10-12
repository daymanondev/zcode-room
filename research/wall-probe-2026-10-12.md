# Wall probe — the registry env pair (2026-10-12)

Issue [03](../.scratch/room/issues/03-wall-probe-env-pair.md). Question: does
the provider-registry **env pair** (`ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` +
`ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`, feasibility §9.7), plus the standalone
bundled-config var, make a standalone (`--prompt` / `app-server --stdio`)
session populate its provider registry and resolve a model?

**Verdict: no — tried and refuted, and the wall moved.** The registry
constructs in every standalone run regardless of the env pair; what fails is
the **account-entitlement handshake**: all eight `account:*` providers load
with `entitled:false` → `providerCount: 0` → `model.available: []` →
`"Select a model before continuing"`. Config-file discovery was never the
failing step. The follow-up lead is no longer `server/discover` on the
app-server (live: `-32601 Method not found`); it is the entitlement/account
source and the hidden `agent-server` surface — scoped in
[ticket 14](../.scratch/room/issues/14-standalone-entitlement-handshake.md).

Grades: **A** = live, verbatim (executed this session; transcripts under
`/tmp/zcode-env-pair-probe/` — ephemeral, key lines inlined below) · **B** =
compiled-bundle reading (de-minified) · **C** = inference.

## 0. Environment pin (A)

- Binary unchanged from §9.7's record:
  `shasum -a 256 /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` →
  `fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f`
  (mtime Sep 30 16:03:28 2026, app 3.14.5 / CLI `0.16.9`, node v24.14.0 per
  `doctor`).
- Builtin catalog used for the pair:
  `~/.zcode/v2/runtime/provider/darwin-aarch64/3.14.5/endpoint-78d7c3bef4024722642626fe3669a799/zcode-builtin.json`
  — revision 30, endpoint `https://zcode.z.ai`, file sha256
  `a0689124803e673d7c54e248e1175ed91e2dcf0033d6b7897b42697ede3fe59e` (A).
  This is the desktop-maintained **active** copy; `zcode-builtin-refresh.json`
  sits beside it (`failureCount: 0`).
- Personal config: `~/.zcode/v2/provider_config.json` (schema v1; one
  `custom:cliproxyapi` rule, `enabled: false` since 2026-10-10) (A).

## 1. Exhaustion matrix (all A)

Invocation shape for every row (A, from the wrapper's verbatim log header):

```
env ELECTRON_RUN_AS_NODE=1 \
  [/Applications/ZCode.app/Contents/MacOS/ZCode] \
  [/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs] <args>
```

| # | Variant | Surface | Outcome (verbatim key line) |
|---|---|---|---|
| 1 | no env | `--prompt … --json` | exit 1, stderr: `Error: Model creation failed (traceId: 59bdee16-…)`. CLI log cause chain: `"Model creation failed"` ← `"Select a model before continuing"` (`CONFIGURATION_ERROR`) at `turnPhase: model_creation`, session `sess_332ecb26` |
| 2 | env **pair** | `--prompt … --json` | identical: `Error: Model creation failed (traceId: 680e87cf-…)`, same cause chain, `sess_…` |
| 3 | no env | `app-server --stdio` → `session/create` | create result settings verbatim: `"settings":{"mode":{"current":"build"},"model":{"available":[]},"permission":{"mode":"build"},"thoughtLevel":{"available":[],"enabled":false}}` |
| 4 | env **pair** | `app-server` → create + `session/setModel {model:{providerId:"account:zai-individual-coding-plan",modelId:"GLM-5.3"}}` | create: `model.available: []` (identical to #3); setModel error verbatim: `Provider Registry 中不存在 Model: [object Object]` (code `-32603`, stack at `zcode.cjs:14806:11229`); `session/send` accepted (`"accepted":true`) but no turn completes |
| 5 | pair + `ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE` | `app-server` → create | `model.available: []` — the standalone bundled var changes nothing |
| 6 | pair | `app-server` → `server/discover {}` and `{workspace:…}` | both: `-32601 Method not found: server/discover` — not an app-server method |
| 7 | pair | `agent-server --stdio` (hidden subcommand) | starts, emits `startup/storageState` ready lines, speaks its own protocol — not probed further (ticket 14) |

Negative observations are confirmed twice per surface: `--prompt` (#1 vs #2),
`app-server` create (#3/#4 vs #5). Every probe died **before any model
request** — zero token spend.

## 2. What the registry actually does (the mechanism)

- Every standalone run — baseline **and** pair — logs (A, from
  `~/.zcode/cli/log/zcode-2026-10-12.jsonl`):

  ```
  event: zcode_protocol.provider_registry.ready
  context: {
    "entrypoint": "zcode_protocol",
    "accountRevision": "account:[\"zcode-builtin:30:3224…\",[
      {\"providerId\":\"account:zai-individual-coding-plan\",\"config\":{\"access\":{\"type\":\"zhipu-account\",\"entitled\":false}}},
      {\"providerId\":\"account:zai-team-coding-plan\", …entitled:false},
      {\"providerId\":\"account:zai-start-plan\", …}, {\"providerId\":\"account:bigmodel-individual-coding-plan\", …},
      {\"providerId\":\"account:bigmodel-team-coding-plan\", …}, {\"providerId\":\"account:bigmodel-start-plan\", …},
      {\"providerId\":\"account:zai-offpeak-idle-plan\", …}, {\"providerId\":\"account:bigmodel-offpeak-idle-plan\", …}
    ], null]",
    "configRevision": "[\"zcode-builtin:30:3224…\",\"71047931171a…\"]",
    "providerCount": 0
  }
  ```

  All eight account providers enumerate from builtin revision 30 — then all
  sit `entitled:false` and the registry counts zero providers. The env pair
  is invisible in this event: baseline and pair rows are byte-identical in
  shape. Same for the CLI-log events from 2026-10-10/11 (§9-era probes).
- Bundle reading (B), refining §9.7's `Ykt`/`ymr` picture:
  `main()` calls `prepareCliProviderRuntimeEnv(argv, env)` before `run()`;
  `requiresProviderRuntime` matches `--prompt`, `--target`, `tui`,
  `app-server`, `agent-server`, `login`, `logout`; when the pair is **not**
  set it self-resolves builtin = `<entrypoint-dir>/provider/zcode-builtin.json`
  (absent next to `zcode.cjs`; the SEA-asset and `../../../config/provider`
  fallbacks also don't exist here) and personal =
  `<dataBaseDir>/.zcode/v2/provider_config.json`, then returns
  `{builtin: <active copy under ~/.zcode/v2/runtime/provider/…>, bundled, personal}`.
  No 「无法定位 CLI ZCode Built-in Provider Config」 or 「缺少进程 Provider
  Registry 的…路径」 error ever appeared live, and the registry-ready event
  references builtin r30 even at baseline — so the loading path that ran is
  not the one §9.7 pinned (which exact loader entrypoint executed is C,
  unresolved; the env pair demonstrably changes nothing observable, which is
  the fact that matters).
- `server/discover` in the bundle (B) belongs to an MCP-dialect schema family
  (`tools/list`, `prompts/get`, `resources/read`, `notifications/initialized`,
  `subscriptions/listen`) — a different server surface, consistent with the
  live `-32601` on the app-server. §9.4's "untried leads" re-weighting: env
  pair is now **tried (negative)**; `server/discover` is **not an app-server
  method**; the entitlement handshake and `agent-server` are the live leads.

## 3. Credentials are not the blocker (A)

The credential cipher (`createZCodeCredentialCipher`, B) keys off
`ZCODE_CREDENTIAL_SECRET` or the deterministic fallback
`zcode-credential-fallback:<platform>:<homedir>:<username>` — no Keychain/Electron
dependency. Decrypting `~/.zcode/v2/credentials.json` with the fallback key in
a plain node process succeeds for **every** field (names only, values never
printed): `oauth:zai:access_token`, `zcodejwttoken`,
`oauth:zai:user_info`, `oauth:active_provider`, and critically
`account-provider:coding-plan:account:zai-individual-coding-plan:account:b66d…:api-key`.
The standalone process can read valid, decryptable credentials — the missing
step is whatever flips `entitled:true` (an entitlement/refresh handshake the
desktop performs, or a standalone account-source that never runs it; B/C).

## 4. Consequences

1. §9.3's "standalone paths lack the provider-registry/auth wiring" is
   half-right for the wrong reason: registry **construction** works
   standalone; the **entitlement/account** layer does not complete. The
   user-visible wall (`Select a model before continuing`, empty
   `model.available`) is unchanged by any env-var configuration tried here.
2. The upstream bug report (drafted at
   [upstream-bug-report-draft.md](upstream-bug-report-draft.md), **not filed**
   — the Human files it) now states the entitlement finding, which is a
   better report than the original default-model framing.
3. M0 shape is unaffected (C — inference from ADR 0001's phasing): the
   Supervisor-dispatches-Leads design stays blocked only on the wall; M0's
   public-surface slice never needed it.

## 5. Hygiene (A)

- ~6 zero-token junk sessions minted into `~/.zcode/cli/db/db.sqlite`
  (`sess_332ecb26…`, `sess_2db1cc0e…`, `sess_68b02f00…`, `sess_73dcfe5a…`,
  plus the pair-bundled and agent-server runs) — same precedent as §9.6,
  ignorable.
- No secrets copied anywhere; the decryption check printed field names and
  success flags only. Probe scratch lives in `/tmp/zcode-env-pair-probe/`
  (ephemeral). Shared configs (`provider_config.json`, `credentials.json`)
  were only read.

## Re-verify (for any future re-run)

1. `shasum -a 256 …/glm/zcode.cjs` → still `fad4c35c…`? If not, re-read the
   registry bootstrap before trusting anything above.
2. Rerun row 4 (pair + app-server): create → settings → expect
   `model.available: []`; confirm `provider_registry.ready` still shows
   `entitled:false` ×8, `providerCount: 0` in `~/.zcode/cli/log/`.
3. If `model.available` is non-empty on some future build: the wall cracked —
   re-run rows 1–2 (`--prompt`) and update feasibility §9.3/§10 and ADR 0001.

Transcript verbatim sources (this session): `/tmp/zcode-env-pair-probe/*.log`,
`*.ndjson` (probe0-baseline, probe1-envpair, appserver-baseline,
appserver-pair, pair-bundled), `~/.zcode/cli/log/zcode-2026-10-12.jsonl`.
