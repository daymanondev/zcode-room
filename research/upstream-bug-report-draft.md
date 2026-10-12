# Draft: upstream bug report — headless sessions cannot resolve any model

**Status: DRAFT — do not file without the Human.** Channel TBD (no public
issue tracker for ZCode is known to us; the Human picks where/how to report).

Evidence base: [wall-probe-2026-10-12.md](wall-probe-2026-10-12.md) (grade-A
transcripts) + feasibility §9.3. Everything under Summary / Repro / Evidence
is live-observed (grade A) on:

- ZCode.app 3.14.5, CLI 0.16.9, macOS darwin-arm64
- `zcode.cjs` sha256 `fad4c35c4c36ec210d8a06d3fa0e77de23c8545e2eb6ff90aea1eb38d1e6275f`
- A logged-in Z.ai coding-plan account (desktop app chats normally on
  `account:zai-individual-coding-plan` / GLM-5.3)

---

## Suggested title

Headless `--prompt` / `app-server` sessions can never resolve a model:
account providers stay `entitled:false`, `model.available` is always `[]`,
and there is no `--model` flag or default to set one

## Summary

Any session created outside the desktop app — via the bundled CLI's
`--prompt` or the `app-server --stdio` JSON-RPC surface — fails at model
creation with `Select a model before continuing`. The provider registry
itself constructs fine (builtin catalog revision 30 loads, all eight
`account:*` providers enumerate), but every one is marked
`entitled:false`, so the registry ends with `providerCount: 0` and
`model.available: []`. The desktop app, sharing the same
`~/.zcode/v2/` config and credentials, resolves the same account fine.

There is no CLI flag to pass a model selection, and neither
`session/setModel` (fails: `Provider Registry 中不存在 Model`) nor the
documented-in-binary env vars (`ZCODE_BUILTIN_PROVIDER_CONFIG_FILE` +
`ZCODE_PERSONAL_PROVIDER_CONFIG_FILE`, optionally
`ZCODE_BUILTIN_PROVIDER_BUNDLED_CONFIG_FILE`) change the outcome — the
registry-ready log event is byte-identical with and without them.

## Repro

```sh
ELECTRON_RUN_AS_NODE=1 /Applications/ZCode.app/Contents/MacOS/ZCode \
  /Applications/ZCode.app/Contents/Resources/glm/zcode.cjs \
  --prompt 'Reply with exactly: OK' --json
# → Error: Model creation failed (traceId: 59bdee16-… — one observed run)
# CLI log: turn.failed → cause "Select a model before continuing" (CONFIGURATION_ERROR)
```

Expected: the run uses the logged-in account's default model (or exposes a
`--model` / preference to pick one). Actual: every external creation path
fails at `model_creation`.

## Evidence to attach

1. `turn.failed` log line with the cause chain (verbatim in the evidence
   base, §1 rows 1–2).
2. `session/create` result settings: `"model":{"available":[]}` — with and
   without the env pair (§1 rows 3–5).
3. `zcode_protocol.provider_registry.ready` log event: 8 providers, all
   `"access":{"type":"zhipu-account","entitled":false}`, ending
   `providerCount: 0` (§2).
4. Credential decryption check: every field of
   `~/.zcode/v2/credentials.json` decrypts with the documented fallback
   cipher key in a plain node process — the standalone process demonstrably
   holds valid credentials (§3). So the gap is the entitlement/account
   handshake, not file access.

## Diagnosis hint (grade B — from reading the shipped bundle, de-minified; not live-observed)

`prepareCliProviderRuntimeEnv` intends `--prompt`/`--target`/`tui`/
`app-server`/`agent-server`/`login`/`logout` to self-populate the provider
env (builtin from `<entrypoint-dir>/provider/zcode-builtin.json` or the
SEA asset; personal from `<dataBaseDir>/.zcode/v2/provider_config.json`),
yet the registry still reports builtin r30 loaded at baseline with no env
set — and entitlement never flips. Whatever the desktop drives to mark the
account entitled (an entitlement/refresh call, or an account source only the
app constructs) is missing from the standalone boot.

## Ask

Either (a) standalone sessions should complete the account-entitlement
handshake using the shared `~/.zcode/v2/` state the desktop already
maintains, or (b) headless surfaces should expose an explicit model
selection (flag / protocol field) that bypasses the entitlement-derived
`available` list. Today headless ZCode is unusable for any account-plan
user, which blocks scripted/automation workflows built on the shipped CLI.
