# Entitlement handshake — cracked in-band (2026-10-12)

Issue [14](../.scratch/room/issues/14-standalone-entitlement-handshake.md).
Question: what flips `entitled:false` in a standalone process — or what route
runs around the desktop handshake?

**Verdict: the wall is cracked, in-band, with no upstream fix and no login
mutation.** A standalone `app-server --stdio` becomes model-capable when a
client plays the **host role**: push `provider/updateAccountConfig` once
(entitlement snapshot), then answer `interaction/requestProviderRuntimeHeaders`
per model request (the coding-plan api-key from the shared credential store).
Proven end to end (A): a standalone session answered `"Reply with exactly: OK"`
→ `"OK"` on `account:zai-individual-coding-plan/GLM-5.3` (40,429 + 242 tokens
real plan usage, `finish=stop`).

Grades: **A** = live, verbatim this session (transcripts/redacted scripts under
`/tmp/entitlement-probe/`, ephemeral; key lines inlined) · **B** = bundle
reading (de-minified `zcode.cjs`; the exhaustive trace ran as a read-only peer
session whose offsets are cited inline below) · **C** = inference.

## 0. Environment pin (A)

- `zcode.cjs` byte-identical to the §9/§10 pin:
  `shasum -a 256 /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs` →
  `fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f`
  (app 3.14.5 / CLI 0.16.9, macOS darwin-arm64).
- Active builtin catalog (registry self-resolves this at baseline):
  `~/.zcode/v2/runtime/provider/darwin-aarch64/3.14.5/endpoint-78d7c3bef4024722642626fe3669a799/zcode-builtin.json`,
  revision 30.
- Everything below rides the shared, desktop-maintained `~/.zcode/v2/` state;
  nothing in it was mutated by these probes.

## 1. The mechanism — who writes `entitled` (B)

`entitled` is a zod-validated field of `zhipu-account` access configs
(`{type:"zhipu-account", accountType:"zai"|"bigmodel", mode, entitled}`). It
has exactly **three writers** in `zcode.cjs`:

1. **Fail-closed boot snapshot** (`HKe`,
   `createFailClosedAccountProviderConfigSnapshot`, ~555.6k): every
   `zhipu-account` provider in the builtin catalog → `entitled:false`. This is
   the **only** snapshot host-mode registries get at boot: `app-server` and
   `agent-server` both dispatch to `xoc` (protocol-server runner) → `NXo`
   (`runZCodeProtocolAgent`) → `Ykt(z)` **with no `standalone` option**
   (~14680.4k, byte-exact `create:r(()=>Ykt(z),"create")`),
   so `pZe.start()` seeds `initial-fail-closed` and the registry publishes
   `providerCount: 0` — the observed log event
   (`account:["zcode-builtin:30:…",[…8 providers…],null]`) is byte-shaped
   exactly like `pAe`'s serialization of this snapshot.
2. **Standalone local snapshot** (`oPn`,
   `readStandaloneAccountProviderConfigSnapshot`, ~14113.6k): **no network**;
   only `mode:"individual-coding-plan"` providers (2 of 8), each requiring BOTH
   credential keys — `account-provider:<providerId>:identity` (Yie) AND
   `account-provider:coding-plan:<providerId>:account:<identity>:api-key`
   (t3e). This machine's store has the api-key but **no `:identity` key** —
   which is why `--prompt`/`tui` (the only `standalone:{…}` callers, ~14784.5k
   / ~14756.8k) also fail today. `zcode login` writes both keys
   (`persistStandaloneCodingPlanConnection`).
3. **Host push** — protocol method `provider/updateAccountConfig`
   (`XZo`/`updateAccountProviderConfig`, ~14549.5k): parses
   `{revision, basedOnZCodeBuiltinRevision, providers, states}` (schema `CGt`
   ~766.1k), requires `states[p].current:boolean` whenever a builtin coding-plan
   provider is pushed `entitled:true` (`FHo` ~14127.4k), then
   `syncAccountProviderConfig` → `yee.replace(T,"host-account-config")` (yee
   = the host-mode account config source) + registry refresh. Host-mode
   accepts; the standalone branch refuses host pushes (「Standalone Account
   由本进程管理，不接收 Host 覆盖」 — "standalone accounts are managed by this
   process and do not accept host overrides").

The **desktop** host computes entitlement itself (app.asar `out/host`, B:
`createAccountProviderConnectionResolver` → per-family availability validators
→ `api.z.ai` calls such as `/api/biz/customer/getCustomerInfo`;
`entitled: status === "available"`) and pushes the snapshot to its session
children — same protocol role the crack below plays. Desktop sessions also
boot with an explicit model hand-down (A, log:
`bootstrap.app.startup.runtime_config.completed` with
`"startupKind":"zcode_app"`, `"model":"account:zai-individual-coding-plan/GLM-5.3"`,
whereas every standalone probe session logged `model: None`).

No env var / flag / config file forces entitlement (B): the full census is
154 `ZCODE_*` literals (`/tmp/entitlement-trace/zcode_envs.txt`, ephemeral),
none of them an entitlement override. `ZCODE_AGENT_PROVIDER`/
`ZCODE_ENABLED_AGENT_PROVIDERS` are constants (`"glm"`, `["glm"]`) for the
chat-bot agent backend — unrelated. Entitlement is not persisted by the CLI;
`coding-plan-cache.json` is desktop-only (B: not referenced anywhere in
`zcode.cjs`).

## 2. Probe A — hidden `agent-server` (A)

Driven live over stdio (envelope `{id, method, params}`; a `jsonrpc` key is
rejected −32600 「Invalid ZCode Protocol message」):

- Startup emits `startup/storageState` ready lines; `session/create` →
  `session/requestRuntimePreferences` (scope `runtime-materialization`) →
  result with `"settings":{"model":{"available":[]}}` — identical to
  `app-server`. Also observed server→client
  `interaction/requestOfficialMcpAuthHeaders` (declined harmlessly).
- Bundle (B): `case"agent-server":case"app-server": return await xoc(...)` —
  same dispatch, same host-mode registry. **The agent-server surface offers no
  different model path.**

## 3. The crack — host-role push, end to end (A)

Invocation: `ELECTRON_RUN_AS_NODE=1 /Applications/ZCode.app/Contents/MacOS/ZCode
/Applications/ZCode.app/Contents/Resources/glm/zcode.cjs app-server --stdio`,
driven from python over stdio (script shape: `push-probe3.py` below).

1. `session/create` (workspace `/tmp/entitlement-probe`) → settings
   `"model":{"available":[]}` — the wall, reproduced.
2. Push (verbatim shape that worked):

   ```json
   {"id":2,"method":"provider/updateAccountConfig","params":{
     "revision":"probe-push-3",
     "basedOnZCodeBuiltinRevision":"zcode-builtin:30:322419047477d0a36f8a88542eb6ef77dd58e6596b82190dc4886127441ea6e2",
     "providers":{"account:zai-individual-coding-plan":
       {"access":{"type":"zhipu-account","entitled":true}}},
     "states":{"account:zai-individual-coding-plan":
       {"availability":"available","entitled":true,"current":true}}}}
   ```

   → `{"receivedRevision":"probe-push-3","providerCount":1,"status":"received"}`.

   **The revision string is the gate**: it must equal
   `zcode-builtin:<catalog-revision>:<sha256-of-RESOLVED-active-file-PATH>`
   (B: `T3i`/`NodeZCodeBuiltinProviderConfigSource` hashes
   `resolve(activeFilePath)`, not file content). Verified (A):
   `sha256("…/endpoint-78d7c3…/zcode-builtin.json")` = `32241904…`, matching
   the logged `configRevision[0]` prefix `zcode-builtin:30:3224…`. A mismatched
   string is silently never published (registry refuses while
   `account.basedOnZCodeBuiltinRevision !== config.zcodeBuiltinRevision`).
3. Second `session/create` → `settings.model.available[0]`:

   ```json
   {"ref":{"providerId":"account:zai-individual-coding-plan","modelId":"GLM-5.3"},
    "label":"GLM-5.3","providerLabel":"Z.AI Individual Coding Plan",
    "contextWindow":1000000,"maxOutputTokens":128000,
    "reasoning":{"levels":["low","high","max"],"defaultLevel":"max"},…}
   ```

   and `session.model = {providerId, modelId}` — the desktop's boot shape.
4. `session/send` ("Reply with exactly: OK") → turn starts → server→client
   `interaction/requestProviderRuntimeHeaders` (twice: pre-refresh + at
   request). Host reply (schema `DGt` ~769.1k):

   ```json
   {"headersApplied":true,"requestAuth":{"apiKey":"<coding-plan api-key>"}}
   ```

   The api-key is the existing credential field
   `account-provider:coding-plan:account:zai-individual-coding-plan:account:b66d…:api-key`,
   decrypted in-process (cipher B/A: AES-256-GCM, key `sha256(secret)`,
   `enc:v1:<iv>.<tag>.<ct>` base64url, secret env `ZCODE_CREDENTIAL_SECRET`
   or `zcode-credential-fallback:<platform>:<homedir>:<userInfo().username>`).
   The value went to a 0600 temp file and was never printed; deleted after.
5. Result (A, from `~/.zcode/cli/rollout/model-io-sess_0a5c6b2f….jsonl`):

   ```
   model=GLM-5.3 providerId=account:zai-individual-coding-plan finish=stop
   text='OK' usage={"inputTokens":40426,"outputTokens":3,…}
   ```

   plus the automatic title request (231 in / 11 out). `turn.completed`
   5.1s. Zero configuration of the shared state; nothing left the machine.

**Minimal driver** (reconstruction; the originals were
`/tmp/entitlement-probe/push-probe{,2,3}.py` + `decrypt-key.cjs`, ephemeral):
spawn → answer `session/requestRuntimePreferences` → push → create → send →
answer `interaction/requestProviderRuntimeHeaders` from the decrypted key.

## 4. Probe C — desktop-as-daemon (A/B; superseded by §3)

Mapped the desktop's internal control path (the route the ticket pointed at):

- Process tree (A, `ps`/`lsof`): `ZCode` (Electron main) → utility process
  `zcode-host-local-1` (code: `app.asar` `out/host`, **not** `zcode.cjs`; its
  stdio is /dev/null — it talks Mojo/parentPort to main) → per-session
  `zcode-cli` children whose fds 0/1/2 are **anonymous socketpairs into the
  host** (child fd0 `0x942a…` ↔ host fd38). No TCP listener; no named unix
  socket for external clients (the one socket path found,
  `/var/folders/…/znr-….sock`, is the node-repl MCP). `zcode://` deep links
  only cover `workspace/open` (B, main bundle).
- The host speaks ZCode Protocol to its children: storage prep spawns
  (`t0` = `prepareSessionStorage`) `app-server --stdio --prepare-storage`
  workers and answers their `startup/storagePath` with `storagePathReady`
  (B); session creation hands the model down; per model request the **host
  answers `interaction/requestProviderRuntimeHeaders`** — seen live (A) in
  the desktop's own consolidated log: `[zcode-agent-service] 收到 ZCode
  provider runtime headers 请求 / 已应用 {"modelId":"GLM-5.3","providerId":
  "account:…}` ("received/applied ZCode provider runtime headers request").
- **Self-minted host**: `out/host/index.js` runs standalone under
  `ELECTRON_RUN_AS_NODE` with a preloaded `process.parentPort` shim (a
  `worker_threads` MessageChannel end adapted to the Electron event shape).
  Live (A): `init-local` payload accepted (zod requires
  `zcodeBuiltinProviderConfigFilePath`), tasks-index prep reaches ready —
  then it stalls in `preparing_host_storage` before the session-storage
  worker conversation (likely contention with the live desktop's tasks-index
  WAL; C). Left un-pursued: the §3 push makes minting a host unnecessary —
  the *protocol role* is the valuable part, not the host binary.

Consequence: the room's Supervisor does not need the desktop app, the web
relay, or a patched binary — it needs to be a **ZCode Protocol host client**
to its own spawned `app-server` children.

## 5. Hygiene (A)

- Probe sessions minted into `~/.zcode/cli/db/db.sqlite` (same precedent as
  §9.6/§10; ignorable): `sess_e4f5817e…`, `sess_240262ad…` (agent-server A),
  `sess_dd14375a…`, `sess_462d0b7e…`, `sess_0a5c6b2f…` (push probes).
- Deliberate real usage: one 40.7k-token turn + one title request (~40.7k
  total) — the price of the end-to-end proof; no other model traffic.
- Secrets: credential values were decrypted only in-process to a 0600 file,
  never printed, deleted after; the sandbox-home copies of v2 state were
  deleted; shared configs only read; no `zcode login`/`logout` executed
  (probe B stays Human-gated, now optional — see §6).
- The shim host (`local-probe3`) was killed; the desktop app was untouched
  throughout (its log kept its own traffic).

## 6. Consequences

1. **The M0 blocker is gone** (C for plans, A for the mechanism): a controller
   session can spawn Leads as `app-server --stdio` children, push entitlement
   once per child, answer header requests, and drive turns — Supervisor
   dispatches Leads is buildable on the shipped binary.
2. The upstream bug stands but reframed: standalone processes **cannot
   self-entitle** (host-mode has no local path; `--prompt`/`tui` need a
   `:identity` credential key that only `zcode login` writes; neither surface
   exposes a model flag). The in-band host push is the workaround the report
   can now cite precisely.
3. Probe B (`zcode login`) is now **optional**, still Human-gated: it would
   write the missing `:identity` key and likely make `--prompt` work without a
   host — a convenience (`--prompt` is one-shot) not a blocker.
4. Re-verify discipline: all of this rides the private protocol surface; on
   any app build where `zcode.cjs` sha256 ≠ `fad4c35c…`, re-verify §3 before
   building on it.

## Re-verify (condensed)

1. `shasum -a 256 …/glm/zcode.cjs` → still `fad4c35c…`? (app 3.14.5 / CLI
   0.16.9; also confirm the active builtin path still hashes to
   `32241904…`.)
2. Spawn `app-server --stdio` → `session/create` → expect
   `model.available: []` (wall still present at baseline).
3. Push `provider/updateAccountConfig` (§3.2 shape, fresh
   `basedOnZCodeBuiltinRevision` if the catalog/endpoint moved) → expect
   `providerCount:1, status:"received"`; second create → `model.available`
   populated; `session/send` → answer `interaction/requestProviderRuntimeHeaders`
   → expect a completed turn on the account provider.
4. If step 3 fails on a future build: re-read `CGt`/`FHo`/`XZo` and the
   revision computation (`T3i` + path hash) in the new bundle — the gate most
   likely to move is the revision string.
