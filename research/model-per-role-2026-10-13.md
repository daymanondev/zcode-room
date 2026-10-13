# Model per role — the config, the setModel shape, and two lanes live (2026-10-13)

Issue [09](../.scratch/room/issues/09-model-per-role.md). Question: can the
room route lanes as configuration — role defaults in a committed config,
applied per spawn through the control plane, with a per-dispatch override —
and can two Leads demonstrably run on two different lanes at the same time?

**Verdict: yes, all three, live.** The committed `.room/room.json` declares
the lead role's default lane; `room lead new` applies it with
`session/setModel` right after create; `--model` overrides per dispatch
without touching the config; two concurrent Lead sessions ran interleaved
model traffic on `GLM-5.3-Flash` and `GLM-5.3` for ~69 overlapping seconds,
with per-request usage on both lanes captured from the rollout logs. Two
surprises surfaced and were handled in-ticket: the setModel wire shape
demands an explicit reasoning level, and concurrent dispatches clobbered
each other's `leads.json` records (fixed with a lock; re-proven live).

Grades: **A** = live, verbatim this session (rollout files, wrapper output,
doctor output) · **B** = bundle reading (`zcode.cjs` de-minified, pin
`b816e386…`, app 3.15.1, CLI 0.16.9) · **C** = inference.

## 1. What the registry actually serves (A)

After the entitlement push, `settings.model.available` holds exactly TWO
models on `account:zai-individual-coding-plan`: **GLM-5.3** and
**GLM-5.3-Flash**. The builtin catalog's enabled rules list four for this
provider (also GLM-5.2, GLM-5-Turbo), but the served registry exposes two —
the config's menu was written against the served set. Each entry carries
`reasoning: {levels: [low, high, max], defaultLevel: "max"}` plus context
window (1M), max output (128k), and format properties.

## 2. The setModel wire shape (A live, B bundle)

`session/setModel` with a bare `{providerId, modelId}` is **refused**:

```
session/setModel: Reasoning level is required for account:zai-individual-coding-plan/GLM-5.3-Flash
```

Doctor caught this on its first live run (its new setModel check — zero
model calls). Six guessed shapes were then refused live with zod
"Unrecognized key" errors (`model.reasoningLevel`, `model.reasoning`,
`model.level`, sibling forms, `model.reasoningLevels`). The bundle's schema
(B, de-minified `Nl` at ~518.2k) is strict:

```js
model: { providerId, modelId,
         options: { reasoningLevel: string }? }?   // .strict() throughout
// params: { sessionId, model, expectedRevision?, persistAsWorkspaceLastUsed (default true) }
```

Accepted live (A, doctor PASS): `{sessionId, model: {providerId, modelId,
options: {reasoningLevel: "max"}}}`. The params schema also carries
`persistAsWorkspaceLastUsed` (defaults **true** — a selection would write
the Lead's lane into the workspace's last-used-model state, which belongs
to the Human's own sessions); the wrapper and doctor both force it
`false`, review-caught before any dispatch depended on it. Adjacent finds
(B): the desktop's own
picker string format is `provider/model$level` (`formatModelPickerValue`,
separator `"$"` — the config's optional `$level` suffix uses the host's own
vocabulary), and `validateSelection` has an `allowMissingReasoning` escape
the protocol path does not take — which is why create resolves a model
implicitly but setModel demands the level.

The wrapper derives the level when the config names none: the selected
model's own `defaultLevel` from the create result's available list — the
vendor's default, not ours. An explicit `$low/$high/$max` suffix beats it.

## 3. The config and the override (A)

Committed `.room/room.json` (allow-listed through the `.room/*` gitignore):

```json
{ "version": 1,
  "roles": { "lead": {
      "default": "account:zai-individual-coding-plan/GLM-5.3-Flash",
      "menu": ["account:zai-individual-coding-plan/GLM-5.3-Flash",
               "account:zai-individual-coding-plan/GLM-5.3"] } } }
```

Validation is strict (unknown keys, version, menu/default consistency,
model-string shape) so a typo in a committed file fails dispatches loudly
before anything is spent. Spawn-time selection only: `room lead send`
refuses `--model` — a resumed Lead keeps its spawn-time lane. Menu
enforcement is codex-room's picker semantics made mechanical: dispatching
outside the declared lanes is a config change, by design.

## 4. Two lanes, concurrent, with usage (A)

Run 1 (05:11:43–05:12:55 UTC), both dispatched the same second, same
workspace, read-only briefs:

| seat | lane (source) | session | model requests | input | output |
|---|---|---|---|---|---|
| lead-09-flash | GLM-5.3-Flash$max (config default) | `sess_ec652d11…` | 3 | 52,718 | 2,329 |
| lead-09-max | GLM-5.3$max (`--model` override) | `sess_29acf15f…` | 4 | 43,547 | 2,915 |

Per-request lane proof: `~/.zcode/cli/rollout/model-io-sess_*.jsonl`, every
entry's `model.modelId` matches its seat's lane (3× Flash, 4× GLM-5.3),
requests interleaved 05:11:44–05:12:54 — **~69 s of overlap**. Usage lives
at `response.providerMetadata.anthropic.usage` (`input_tokens`,
`output_tokens`, `cache_read_input_tokens`); the wrapper's per-turn record
comes from the final assistant entry's `info.tokens`, whose real shape (A,
first observation) is `{total, input, output, reasoning, cache:
{read, write}}` — `input` counts the full context including cache reads
(652 + 52,288 cache = 53,940 recorded; 52,718 sum of per-request
`input_tokens` which exclude cache).

## 5. The concurrent-writer bug the run exposed (A → fixed → A)

Run 1 also caught a real durability bug: `leads.json` updates were
read-modify-write, and two concurrent `room lead new` processes each held
their copy of the map for the whole turn — the last post-turn save erased
the other seat's record (lead-09-max's completed record was clobbered by
lead-09-flash's later save; its facts survive in the rollout log and the
dispatch output). Fix: every `leads.json` update now runs under a lock dir
(`mkdir` is atomic; `leads.lock`, 25 ms retry, 15 s timeout, stale breakout
after 10 min for a crashed holder), and the duplicate-seat re-check moved
inside the lock. Regression tests: two simultaneous dispatches both
survive; a stale lock is broken. Re-proven live by run 2 below.

## 6. Run 2 — acceptance re-run with the fix

Dispatched the same second again, with the locked wrapper (05:16:31–05:18:11 UTC):

| seat | lane (source) | session | model requests | input | output |
|---|---|---|---|---|---|
| lead-09b-flash | GLM-5.3-Flash$max (config default) | `sess_1b008189…` | 2 | 52,322 | 1,955 |
| lead-09b-max | GLM-5.3$max (`--model` override) | `sess_cb11b036…` | 3 | 7,514 (+147,008 cache reads) | 1,245 |

Requests interleaved 05:16:37–05:18:11 (~55 s of overlap), every rollout
entry's `model.modelId` matches its seat's lane. **Both completed records
survived in `leads.json`** — each with its model, `modelSource`
(`config` / `override`), and `lastTurnTokens` (flash `{total: 53,271,
input: 52,596, output: 675, cache.read: 50,944}`; max `{total: 52,426,
input: 51,960, output: 466, cache.read: 51,456}`). The checkpoint
mid-flight already showed the fix holding: flash's completed record and
max's durable pre-turn record coexisted while max's turn was still
running — the exact interleaving that erased a record in run 1. (Note:
the host rotates rollout files quickly — run 1's `model-io-*` files were
already gone hours later; capture evidence at run time.)

## 7. Hygiene

- Four sessions minted into the shared store (`sess_ec652d11…`,
  `sess_29acf15f…`, plus run 2's two) — same precedent as §9.6/§10/crack §5.
- Deliberate real usage: run 1 ≈ 96k input + 5.2k output across both lanes;
  run 2 two minimal read-only turns more. The doctor/probe ladder spent
  zero model calls (registry ops only).
- The probe script was ephemeral (`.scratch/`); the shapes it found live in
  this note, the fake app-server, and doctor's live check.

## Re-verify (condensed)

1. `npm run room -- doctor` — the `live: setModel selects …` line PASSes on
   the pinned build (it caught the reasoning-level requirement on its very
   first run; it exists precisely for the next time the shape moves).
2. On a binary where `zcode.cjs` sha256 ≠ `b816e386…`: re-read the setModel
   schema (`Nl` region) for the options/reasoningLevel key, then re-run
   doctor.
3. If `model.available` grows beyond two models on some plan, the menu in
   `.room/room.json` is a Human edit away — nothing else changes.
