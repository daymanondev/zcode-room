// doctor.mjs — `room doctor` (issue 07): re-verify everything the wrapper
// hardcodes about the private ZCode surface, spending zero model calls,
// and report go/no-go.
//
// Ticket 03 settled that the registry env pair is refuted — entitlement
// is the wall — so the doctor verifies the entitlement path the crack
// (issue 14) established: binary pin, CLI version, the builtin-catalog
// revision gate, the credential api-key, and live over stdio the exact
// create → push → create sequence the wrapper performs. The live check
// mints no persisted sessions: zero-turn sessions never reach the store
// (observed 2026-10-12, grade A).

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppServerClient } from "./appserver.mjs";
import { wireModelFor } from "./config.mjs";
import {
  PINS,
  findActiveCatalog,
  launchAppServer,
  launchVersionCheck,
  loadCodingPlanApiKey,
  readAppVersion,
} from "./pins.mjs";

const VERSION_TIMEOUT_MS = 15000;

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function runVersionCheck(launch) {
  return new Promise((resolve) => {
    const child = spawn(launch.command, launch.args, { env: { ...process.env, ...launch.env } });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), VERSION_TIMEOUT_MS);
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, error: error.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { ok: true, version: out.trim() } : { ok: false, error: `exit ${code}: ${out.trim().slice(0, 120)}` });
    });
  });
}

// Every check reports one line; a FAIL stops the GO verdict. Live checks
// are skipped when statics fail — a passing live path on a mismatched
// binary would be actively misleading.
export async function runDoctor({
  pins = PINS,
  versionLaunch = launchVersionCheck(pins),
  serverLaunch = launchAppServer(pins),
  resolveRevision,
  loadKey = loadCodingPlanApiKey,
  write = (line) => process.stdout.write(`${line}\n`),
} = {}) {
  const resolve = resolveRevision ?? (() => findActiveCatalog({ appVersion: readAppVersion(pins.appPath) }));
  const check = (ok, label, failMessage) => {
    write(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — ${failMessage}`}`);
    return ok;
  };

  write(`room doctor — re-verifying the pinned private surface (zero model calls)`);
  write(`  binary:   ${pins.appPath}`);
  write(`  bundle:   ${pins.zcodeCjs}`);

  const staticsOk = [
    check(existsSync(pins.zcodeCjs), "zcode.cjs exists", "bundle file not found"),
    (() => {
      if (!existsSync(pins.zcodeCjs)) return false;
      const observed = sha256File(pins.zcodeCjs);
      return check(
        observed === pins.zcodeCjsSha256,
        `sha256 matches pin (${pins.zcodeCjsSha256.slice(0, 16)}…)`,
        `observed ${observed} — the app updated; re-verify the crack before use and update the pin`
      );
    })(),
    await (async () => {
      const version = await runVersionCheck(versionLaunch);
      return check(version.ok && version.version === pins.cliVersion, `--version prints ${pins.cliVersion}`, version.ok ? `observed "${version.version}"` : version.error);
    })(),
    (() => {
      try {
        const catalog = resolve();
        return check(true, `active catalog revision gate (${catalog.revisionString.slice(0, 34)}…)`, "");
      } catch (error) {
        return check(false, "active catalog revision gate", error.message);
      }
    })(),
    (() => {
      try {
        const key = loadKey();
        return check(true, `coding-plan api-key decrypts (provider ${key.providerId})`, "");
      } catch (error) {
        return check(false, "coding-plan api-key decrypts", error.message);
      }
    })(),
  ].every(Boolean);

  let liveOk = true;
  if (!staticsOk) {
    write(`       live entitlement check skipped — static checks failed`);
    liveOk = false;
  } else {
    const catalog = resolve();
    const key = loadKey();
    const client = new AppServerClient({ launch: serverLaunch, apiKey: "<doctor-placeholder>" });
    const workspace = mkdtempSync(join(tmpdir(), "room-doctor-"));
    try {
      await client.start();
      const probe = { workspace: { workspacePath: workspace, workspaceKey: workspace } };
      const baseline = await client.request("session/create", probe);
      const baselineAvailable = baseline?.settings?.model?.available ?? null;
      if (baselineAvailable === null) {
        liveOk = check(false, "live: baseline session/create", `no settings.model.available in result (keys: ${Object.keys(baseline ?? {}).join(",")})`) && liveOk;
      } else if (baselineAvailable.length > 0) {
        write(`WARN  live: baseline create already resolves models (${baselineAvailable[0]?.ref ? `${baselineAvailable[0].ref.providerId}/${baselineAvailable[0].ref.modelId}` : "?"}) — the wall is absent upstream; the push may be redundant but must still be accepted`);
      } else {
        check(true, "live: baseline create shows the entitlement wall (model.available: [])", "");
      }

      const push = await client.pushEntitlement({ revisionString: catalog.revisionString, providerId: key.providerId });
      liveOk =
        check(
          push?.status === "received" && (push?.providerCount ?? 0) >= 1,
          `live: entitlement push received (providerCount: ${push?.providerCount})`,
          `push result ${JSON.stringify(push)} — the revision gate moved or the push shape changed; re-read the crack doc §3.2 against the new bundle`
        ) && liveOk;

      const after = await client.request("session/create", probe);
      const available = after?.settings?.model?.available ?? [];
      const resolved = available[0]?.ref;
      liveOk =
        check(
          available.length > 0,
          `live: model resolves after push (${resolved ? `${resolved.providerId}/${resolved.modelId}` : "none"})`,
          "model.available still empty after an accepted push — basedOnZCodeBuiltinRevision is stale; recompute the revision"
        ) && liveOk;

      // setModel is the per-session lane selection the room config rides
      // (issue 09) — pin it here too. It is a registry operation: no
      // session/send happens, so still zero model calls and zero persisted
      // sessions. Wire shape (A live + B bundle-read, 2026-10-13): strict
      // {sessionId, model: {providerId, modelId, options:
      // {reasoningLevel}}, persistAsWorkspaceLastUsed} — a bare ref is
      // refused with "Reasoning level is required", and a registry that
      // does not hold the model refuses with 「Provider Registry 中不存在
      // Model」 ("Model not found in the Provider Registry") — exactly the
      // failures this check must catch when the shape moves. The level
      // sent is the model's own defaultLevel from the available list, and
      // persistence as the workspace's last-used model is refused (false)
      // — doctor must not touch UI state.
      const createdId = after?.session?.sessionId;
      const alternate = available.find((entry) => entry?.ref && (entry.ref.providerId !== resolved?.providerId || entry.ref.modelId !== resolved?.modelId));
      if (!createdId || !alternate) {
        write(`WARN  live: setModel probe skipped — ${!createdId ? "no sessionId in create result" : "only one model in the registry"}`);
      } else {
        try {
          const { wireModel } = wireModelFor(alternate.ref, available);
          await client.request("session/setModel", { sessionId: createdId, model: wireModel, persistAsWorkspaceLastUsed: false });
          liveOk = check(true, `live: setModel selects ${alternate.ref.providerId}/${alternate.ref.modelId} (zero model calls)`, "") && liveOk;
        } catch (error) {
          liveOk = check(false, "live: setModel selects a catalog model", `${error.message} — the setModel shape moved; re-read the control-plane surface`) && liveOk;
        }
      }
    } catch (error) {
      liveOk = false;
      check(false, "live: entitlement path over app-server stdio", `${error.message}${client.crashReport() ? `\n       child stderr tail:\n${client.crashReport()
        .split("\n")
        .slice(-5)
        .map((line) => `       ${line}`)
        .join("\n")}` : ""}`);
    } finally {
      await client.close().catch(() => {});
      rmSync(workspace, { recursive: true, force: true });
    }
  }

  const go = staticsOk && liveOk;
  write(go ? "GO — the wrapper may spawn Leads on this build" : "NO-GO — fix the failures above before dispatching Leads");
  return go;
}
