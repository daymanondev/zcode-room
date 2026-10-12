# 14: Standalone entitlement handshake — flip `entitled:false`, or route around it

**What to build:** The wall probe (issue 03,
[evidence](../../research/wall-probe-2026-10-12.md)) moved the blocker: the
standalone registry constructs fine and all eight `account:*` providers
enumerate with `entitled:false` → `providerCount: 0` → `model.available: []`.
This ticket finds what flips entitlement in a standalone process — or
demonstrates a working route around the desktop handshake.

**Blocked by:** None (issue 03 closed 2026-10-12).

**Status:** ready-for-agent

- [ ] Bundle trace (grade B): pin the standalone account source — `Ykt`'s
      `standalone.credentialStore` (`jM`) + `oPn`/`GKe` refresh path
      (de-minified bundle symbols, see wall-probe §2) — and find where
      `entitled` is computed/refreshed and what triggers it in the desktop
      (vs. what is skipped standalone)
- [ ] Live probe A: drive the hidden `agent-server --stdio` (speaks its own
      protocol; `server/discover` sits in its MCP-dialect family per bundle
      reading (B) — live `-32601` on app-server) and check whether its
      registry/model surface behaves differently
- [ ] Live probe B (Human-gated): `zcode login` from the CLI, then re-run
      the pair/baseline probes — does a CLI-own login flip entitlement?
      Gated because it mutates shared `~/.zcode/v2/credentials.json`
- [ ] Outcome recorded in the evidence base with a re-verify step; feasibility
      §10 and the bug-report draft updated if the picture moves

**Notes (scoping from issue 03):**

- Already tried and negative (do not retry on this binary): env pair,
  bundled-config var, `server/discover` on app-server, `setModel`,
  `session/send` with `modelSelection`. Credentials decrypt standalone.
- `ZCODE_AGENT_PROVIDER` / `ZCODE_ENABLED_AGENT_PROVIDERS` literals sit near
  the agent-server code — likely its provider selection surface.
- If a future app build changes `zcode.cjs` (sha256 ≠ `fad4c35c…`), re-verify
  from issue 03's re-verify step before building on any of this.
