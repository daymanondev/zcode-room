// The committed room config's pure surface (issue 09): parse and validate
// <state-dir>/room.json — model string parsing, strict keys, version gate,
// menu/default consistency, and the spawn-time selection precedence
// (override → default → none), all without spawning anything.

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatModelRef, loadRoomConfig, parseModelString, resolveModelSelection } from "../plugins/room/cli/config.mjs";

const PROVIDER = "account:zai-individual-coding-plan";
const FLASH = `${PROVIDER}/GLM-5.3-Flash`;
const MAX = `${PROVIDER}/GLM-5.3`;

function stateDirWith(content) {
  const stateDir = mkdtempSync(join(tmpdir(), "room-config-test-"));
  writeFileSync(join(stateDir, "room.json"), content);
  return stateDir;
}

test("a missing config file is not an error: null, no defaults", () => {
  const stateDir = mkdtempSync(join(tmpdir(), "room-config-test-"));
  assert.equal(loadRoomConfig(stateDir), null);
  assert.deepEqual(resolveModelSelection({ config: null, role: "lead", override: undefined }), { model: null, source: null });
});

test("model strings split on the first slash; provider ids keep their colons", () => {
  assert.deepEqual(parseModelString(FLASH), { providerId: PROVIDER, modelId: "GLM-5.3-Flash" });
  assert.equal(formatModelRef({ providerId: PROVIDER, modelId: "GLM-5.3-Flash" }), FLASH);
  // The $level suffix is the host's own picker syntax (bundle separator
  // "$"); formatModelRef keeps lane identity, level excluded.
  assert.deepEqual(parseModelString(`${MAX}$low`), { providerId: PROVIDER, modelId: "GLM-5.3", reasoningLevel: "low" });
  assert.equal(formatModelRef(parseModelString(`${MAX}$low`)), MAX);
  for (const bad of ["GLM-5.3", "/GLM-5.3", `${PROVIDER}/`, "a/b/c", ""]) {
    assert.throws(() => parseModelString(bad), /is not a "providerId\/modelId" string/, `${bad}`);
  }
  for (const bad of [null, 42]) {
    assert.throws(() => parseModelString(bad), /expected a "providerId\/modelId" string/, `${bad}`);
  }
  for (const bad of [`${MAX}$Max`, `${MAX}$`, `${MAX}$low-high`]) {
    assert.throws(() => parseModelString(bad), /malformed \$level suffix/, `${bad}`);
  }
});

test("a well-formed config loads with defaults and menu parsed", () => {
  const stateDir = stateDirWith(`${JSON.stringify({ version: 1, roles: { lead: { default: FLASH, menu: [FLASH, MAX] } } })}\n`);
  const config = loadRoomConfig(stateDir);
  assert.deepEqual(config.roles.lead.default, { providerId: PROVIDER, modelId: "GLM-5.3-Flash" });
  assert.deepEqual(config.roles.lead.menu?.map(formatModelRef), [FLASH, MAX]);
});

test("roles are optional and per-role null default means registry default", () => {
  const stateDir = stateDirWith(`${JSON.stringify({ version: 1, roles: { lead: { default: null } } })}\n`);
  const config = loadRoomConfig(stateDir);
  assert.deepEqual(resolveModelSelection({ config, role: "lead", override: undefined }), { model: null, source: null });
});

test("strict validation: unknown keys, wrong version, bad shapes all refuse", () => {
  for (const [content, pattern] of [
    ['{"version":1,"roles":{"lead":{"defualt":"x/y"}}}', /unknown key\(s\) in roles\.lead: defualt/],
    ['{"version":2}', /version must be 1/],
    ['{"roles":{}}', /version must be 1/], // version missing is not 1
    ['{"version":1,"name":"room"}', /unknown top-level key\(s\) name/],
    ["not json", /is not valid JSON/],
    ['{"version":1,"roles":{"lead":{"menu":[]}}}', /menu must be a non-empty array/],
    ['{"version":1,"roles":{"lead":{"menu":["a/b","a/b"]}}}', /duplicate entries/],
  ]) {
    assert.throws(() => loadRoomConfig(stateDirWith(content)), pattern, content);
  }
});

test("the default must sit on the menu when one is declared", () => {
  const stateDir = stateDirWith(`${JSON.stringify({ version: 1, roles: { lead: { default: `${PROVIDER}/GLM-5.2`, menu: [FLASH, MAX] } } })}\n`);
  assert.throws(() => loadRoomConfig(stateDir), /default .*GLM-5\.2 is not on roles\.lead\.menu/);
});

test("selection precedence: override over config default, menu-gated; default when no override", () => {
  const config = { version: 1, path: "/x/.room/room.json", roles: { lead: { default: parseModelString(FLASH), menu: [FLASH, MAX].map((m) => parseModelString(m)) } } };
  assert.deepEqual(resolveModelSelection({ config, role: "lead", override: MAX }), { model: { providerId: PROVIDER, modelId: "GLM-5.3" }, source: "override" });
  assert.deepEqual(resolveModelSelection({ config, role: "lead", override: undefined }), { model: { providerId: PROVIDER, modelId: "GLM-5.3-Flash" }, source: "config" });
  assert.deepEqual(resolveModelSelection({ config, role: "peer", override: undefined }), { model: null, source: null });
  // Without a menu, an override to any well-formed ref passes to the
  // registry — the registry is the real gate.
  const menuless = { version: 1, path: "/x/.room/room.json", roles: { lead: { default: parseModelString(FLASH), menu: null } } };
  assert.deepEqual(resolveModelSelection({ config: menuless, role: "lead", override: `${PROVIDER}/GLM-5.2` }), {
    model: { providerId: PROVIDER, modelId: "GLM-5.2" },
    source: "override",
  });
  assert.throws(() => resolveModelSelection({ config, role: "lead", override: `${PROVIDER}/GLM-5.2` }), /is not on the lead menu/);
});
