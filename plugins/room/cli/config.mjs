// config.mjs — the committed room config (issue 09): role-level model
// defaults, the codex-room catalog shape adapted to one file inside the
// room-state directory (<state-dir>/room.json, allow-listed in .gitignore
// while the rest of the state dir stays ignored).
//
// Shape:
//   {
//     "version": 1,
//     "roles": {
//       "lead": {
//         "default": "account:zai-individual-coding-plan/GLM-5.3-Flash",
//         "menu": ["account:zai-individual-coding-plan/GLM-5.3-Flash",
//                  "account:zai-individual-coding-plan/GLM-5.3"]
//       }
//     }
//   }
//
// - Model strings are "<providerId>/<modelId>" (providerId keeps its
//   colons; the first "/" separates), with an optional reasoning-effort
//   suffix "$<level>" — the host's own model-picker syntax (B: bundle
//   `formatModelPickerValue`, separator "$"; the setModel wire shape
//   `model.options.reasoningLevel` observed live, A, 2026-10-13). They
//   name registry refs exactly as the control plane shapes them
//   ({providerId, modelId}).
// - `default` is the lane a spawn of that role takes when no per-dispatch
//   override is given; null means "leave the registry default".
// - `menu` is the role's declared lanes: a per-dispatch override must be
//   on it (dispatching outside the declared lanes is a config change, by
//   design), and the default must be on it too. Menu matching is by
//   provider/model — the $level suffix is free.
// - Roles without an entry, or a missing config file, select nothing:
//   the spawn keeps whatever session/create resolved (the registry
//   default) — pre-09 behavior.
//
// Validation is strict (unknown keys rejected) so a typo in a committed
// file fails the dispatch loudly instead of silently routing lanes.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOM_CONFIG_VERSION = 1;
const ROLE_PATTERN = /^[a-z][a-z0-9-]{0,31}$/;

function roomConfigPath(stateDir) {
  return join(stateDir, "room.json");
}

// "<providerId>/<modelId>[$<level>]" → {providerId, modelId,
// reasoningLevel?}, or throw. Split on the first "/": provider ids carry
// colons but no slash has been observed in either half; both parts must
// be non-empty. The $level suffix (picker syntax, optional) picks the
// reasoning effort; without it the spawn uses the model's own
// defaultLevel from the registry.
export function parseModelString(value, where = "model string") {
  if (typeof value !== "string") throw new Error(`${where}: expected a "providerId/modelId" string`);
  let working = value;
  let reasoningLevel;
  const dollar = working.indexOf("$");
  if (dollar !== -1) {
    reasoningLevel = working.slice(dollar + 1);
    working = working.slice(0, dollar);
    if (!/^[a-z]+$/.test(reasoningLevel)) throw new Error(`${where}: '${value}' has a malformed $level suffix (expected e.g. $low, $high, $max)`);
  }
  const slash = working.indexOf("/");
  if (slash <= 0 || slash === working.length - 1 || working.indexOf("/", slash + 1) !== -1) {
    throw new Error(`${where}: '${value}' is not a "providerId/modelId" string`);
  }
  return { providerId: working.slice(0, slash), modelId: working.slice(slash + 1), ...(reasoningLevel ? { reasoningLevel } : {}) };
}

export function formatModelRef({ providerId, modelId }) {
  return `${providerId}/${modelId}`;
}

// Display form: the lane plus its effective level ("…/GLM-5.3-Flash$max"),
// "(none)" for no model — the shape the wrapper prints and records.
export function formatModelWithLevel(model) {
  if (!model) return "(none)";
  return `${formatModelRef(model)}${model.reasoningLevel ? `$${model.reasoningLevel}` : ""}`;
}

// The setModel wire model for a selection, given the create result's
// available list (A live + B bundle, 2026-10-13): a strict
// {providerId, modelId, options?: {reasoningLevel}} — a bare ref is
// refused with "Reasoning level is required". The level is the explicit
// $level when given, else the model's own defaultLevel from the registry
// (the vendor's default, not ours). Returns the wire model plus the
// effective level, for the caller's record.
export function wireModelFor(model, available = []) {
  const entry = (available ?? []).find(
    (candidate) => candidate?.ref?.providerId === model.providerId && candidate?.ref?.modelId === model.modelId
  );
  const reasoningLevel = model.reasoningLevel ?? entry?.reasoning?.defaultLevel ?? undefined;
  return {
    wireModel: { providerId: model.providerId, modelId: model.modelId, ...(reasoningLevel ? { options: { reasoningLevel } } : {}) },
    reasoningLevel,
  };
}

// Load and validate the room config. A missing file is NOT an error: it
// returns null (no defaults declared). Anything present but malformed is.
export function loadRoomConfig(stateDir) {
  const file = roomConfigPath(stateDir);
  if (!existsSync(file)) return null;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`room config ${file} is not valid JSON: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`room config ${file}: expected a JSON object`);
  }
  const unknownTop = Object.keys(parsed).filter((key) => key !== "version" && key !== "roles");
  if (unknownTop.length > 0) {
    throw new Error(`room config ${file}: unknown top-level key(s) ${unknownTop.join(", ")} — allowed: version, roles`);
  }
  if (parsed.version !== ROOM_CONFIG_VERSION) {
    throw new Error(`room config ${file}: version must be ${ROOM_CONFIG_VERSION} (found ${JSON.stringify(parsed.version)})`);
  }
  const roles = {};
  for (const [role, entry] of Object.entries(parsed.roles ?? {})) {
    if (!ROLE_PATTERN.test(role)) {
      throw new Error(`room config ${file}: role name '${role}' must be 1-32 chars of lowercase alphanumerics and dashes`);
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`room config ${file}: roles.${role} must be an object`);
    }
    const unknown = Object.keys(entry).filter((key) => key !== "default" && key !== "menu");
    if (unknown.length > 0) {
      throw new Error(`room config ${file}: unknown key(s) in roles.${role}: ${unknown.join(", ")} — allowed: default, menu`);
    }
    let defaultModel = null;
    if (entry.default !== null && entry.default !== undefined) {
      defaultModel = parseModelString(entry.default, `room config ${file}: roles.${role}.default`);
    }
    let menu = null;
    if (entry.menu !== undefined && entry.menu !== null) {
      if (!Array.isArray(entry.menu) || entry.menu.length === 0) {
        throw new Error(`room config ${file}: roles.${role}.menu must be a non-empty array of "providerId/modelId" strings`);
      }
      menu = entry.menu.map((item, index) => parseModelString(item, `room config ${file}: roles.${role}.menu[${index}]`));
      if (new Set(menu.map(formatModelRef)).size !== menu.length) {
        throw new Error(`room config ${file}: roles.${role}.menu has duplicate entries`);
      }
      if (defaultModel && !menu.some((ref) => formatModelRef(ref) === formatModelRef(defaultModel))) {
        throw new Error(
          `room config ${file}: roles.${role}.default ${formatModelRef(defaultModel)} is not on roles.${role}.menu — the default must be a declared lane`
        );
      }
    }
    roles[role] = { default: defaultModel, menu };
  }
  return { version: ROOM_CONFIG_VERSION, roles, path: file };
}

// The spawn-time selection for one role: the per-dispatch override if
// given (validated against the menu), else the role's configured default.
// Returns {model: {providerId, modelId} | null, source: "override" | "config" | null}.
export function resolveModelSelection({ config, role, override }) {
  const entry = config?.roles?.[role] ?? null;
  if (override !== undefined && override !== null) {
    const model = parseModelString(override, "--model");
    if (entry?.menu && !entry.menu.some((ref) => formatModelRef(ref) === formatModelRef(model))) {
      throw new Error(
        `--model ${override} is not on the ${role} menu in ${config.path} ` +
          `(${entry.menu.map(formatModelRef).join(", ")}) — dispatching outside the declared lanes is a config change`
      );
    }
    return { model, source: "override" };
  }
  if (entry?.default) return { model: entry.default, source: "config" };
  return { model: null, source: null };
}
