# 14: Standalone entitlement handshake — flip `entitled:false`, or route around it

**What to build:** The wall probe (issue 03,
[evidence](../../research/wall-probe-2026-10-12.md)) moved the blocker: the
standalone registry constructs fine and all eight `account:*` providers
enumerate with `entitled:false` → `providerCount: 0` → `model.available: []`.
This ticket finds what flips entitlement in a standalone process — or
demonstrates a working route around the desktop handshake.

**Blocked by:** None (issue 03 closed 2026-10-12).

**Status:** closed 2026-10-12 — **the wall is cracked in-band.** Evidence:
[entitlement-crack-2026-10-12.md](../../research/entitlement-crack-2026-10-12.md);
feasibility §11. A client playing the host role pushes
`provider/updateAccountConfig` (entitlement snapshot; the revision string is
sha256 of the resolved active-catalog **path**) and answers
`interaction/requestProviderRuntimeHeaders` (coding-plan api-key from the
shared store) — standalone sessions then resolve models and complete turns on
the account plan (proven end to end, ~40.7k tokens real usage).

- [x] Bundle trace (grade B): pin the standalone account source — `Ykt`'s
      `standalone.credentialStore` (`jM`) + `oPn`/`GKe` refresh path
      (de-minified bundle symbols, see wall-probe §2) — and find where
      `entitled` is computed/refreshed and what triggers it in the desktop
      (vs. what is skipped standalone)
      → exactly three writers of `entitled` (fail-closed boot / standalone
      local keys / host push); `oPn` needs a `:identity` credential key this
      machine lacks; no env/config override exists (154 `ZCODE_*` census).
      Offsets inlined in the evidence doc §1.
- [x] Live probe A: drive the hidden `agent-server --stdio` (speaks its own
      protocol; `server/discover` sits in its MCP-dialect family per bundle
      reading (B) — live `-32601` on app-server) and check whether its
      registry/model surface behaves differently
      → same ZCode Protocol envelope, same dispatch (`case"agent-server":
      case"app-server"`), same wall: `model.available: []`. No different
      model path.
- [ ] Live probe B (Human-gated): `zcode login` from the CLI, then re-run
      the pair/baseline probes — does a CLI-own login flip entitlement?
      Gated because it mutates shared `~/.zcode/v2/credentials.json`
      → **not run; now optional** (the host-push route needs no login).
      If run, expect it to write the missing `account-provider:…:identity`
      key (`persistStandaloneCodingPlanConnection`) and make `--prompt`
      self-entitle — a convenience, not a blocker.
- [x] Live probe C — desktop-as-daemon (route-around; needs nothing from
      upstream) **— delivered by substitution, see the arrow note below**: the
      web remote proves an external client can drive the running, entitled
      desktop app to create sessions (B — relay
      `wss://zcode.chatglm.site/ws`, pairing commands, `web-remote-replayable`
      delivery kind; bundle read 2026-10-12). The wall only affects
      standalone processes we mint ourselves. Find the desktop's internal
      control path — no TCP listener exists (A, `lsof` 2026-10-12); the
      desktop spawns entitled `zcode-cli` children per session (A,
      feasibility §9.1 process tree) — likely stdio children or a unix
      socket; read the bundle for the launch/IPC surface, then drive one
      session creation through it and check `model.available`
      → path fully mapped (host = `app.asar` utility process; children on
      stdio socketpairs; model handed down at boot; host answers the headers
      interaction — seen in the desktop's own log). **Substitution
      disclosed**: the literal "drive one session creation through the
      desktop's IPC" was not performed (no external entry exists; the
      self-minted host stalls in storage prep). The drive-through landed one
      step better than the ticket's shape: instead
      of borrowing the desktop's host, we **replicated its protocol role**
      against our own standalone `app-server` child (the §3 crack). The
      self-minted-host route (`out/host/index.js` + parentPort shim) also
      boots standalone (init-local accepted) but stalls in storage prep —
      left un-pursued as superseded.
- [x] Outcome recorded in the evidence base with a re-verify step; feasibility
      §10 and the bug-report draft updated if the picture moves
      → crack doc §Re-verify; feasibility §11 (with corrections to §9.1/
      §9.4/§10.4); bug-report draft reframed (self-entitlement gap +
      host-push workaround).

**Notes (scoping from issue 03):**

- Probe C differs in kind from A/B and the bundle trace: those try to make
  standalone processes pass the entitlement check; C never mints a
  standalone process at all — it asks the already-entitled desktop app to
  host the session (the Paseo-daemon role, played by the app). If C works,
  the wall stops mattering for the room.
  *(Resolution: the wall stopped mattering via neither minting nor borrowing —
  the Supervisor-to-be plays the host role itself.)*

- Already tried and negative (do not retry on this binary): env pair,
  bundled-config var, `server/discover` on app-server, `setModel`,
  `session/send` with `modelSelection`. Credentials decrypt standalone.
  *(Superseded nuance: `setModel` only failed because the registry was
  empty — after the push, sessions resolve a default model without it.)*
- `ZCODE_AGENT_PROVIDER` / `ZCODE_ENABLED_AGENT_PROVIDERS` literals sit near
  the agent-server code — likely its provider selection surface.
  *(Resolved: constants for the chat-bot agent backend, unrelated.)*
- If a future app build changes `zcode.cjs` (sha256 ≠ `fad4c35c…`), re-verify
  from issue 03's re-verify step before building on any of this.
