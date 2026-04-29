const CONTROL_CHARS_REGEX = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_OR_STBY_REGEX = /^(?:([01]\d|2[0-3]):([0-5]\d)|STBY)$/;
const BASE64_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const VALID_AIRCRAFT = new Set(["N35EA", "N540JL"]);
const VALID_AIRCRAFT_STATUSES = new Set(["disponible", "mantenimiento", "aog"]);
const VALID_FLIGHT_STATUSES = new Set(["prog", "enc", "comp", "canc"]);
const WRITE_ACTIONS = new Set(["create_flight", "edit_flight", "cancel_flight", "duplicate_flight", "change_aircraft_status"]);
const OPS_WRITE_ACTIONS = new Set([...WRITE_ACTIONS, "restore_demo", "create_itinerary", "create-itinerary"]);
const ACTION_ALIASES = { "create-itinerary": "create_itinerary" };

function hasControlChars(value) {
  return CONTROL_CHARS_REGEX.test(String(value || ""));
}

function fail(message) {
  return { ok: false, error: message };
}

function pass(value = null) {
  return { ok: true, value };
}

function ensureString(value, { field, required = false, max = 300, allowEmpty = false } = {}) {
  if ((value === undefined || value === null) && !required) return pass("");
  if (typeof value !== "string") return fail(`${field} must be a string`);
  const v = value.trim();
  if (!allowEmpty && required && !v) return fail(`${field} is required`);
  if (v.length > max) return fail(`${field} exceeds max length ${max}`);
  if (hasControlChars(v)) return fail(`${field} contains invalid control characters`);
  return pass(v);
}

function ensureInteger(value, { field, min = 0, max = 100000 } = {}) {
  if (value === undefined || value === null || value === "") return pass(null);
  if (!Number.isInteger(value)) return fail(`${field} must be an integer`);
  if (value < min || value > max) return fail(`${field} must be between ${min} and ${max}`);
  return pass(value);
}

function ensureDate(value, field) {
  const s = ensureString(value, { field, required: true, max: 10 });
  if (!s.ok) return s;
  if (!DATE_REGEX.test(s.value)) return fail(`${field} must be YYYY-MM-DD`);
  const dt = new Date(`${s.value}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== s.value) return fail(`${field} is not a valid date`);
  return pass(s.value);
}

function ensureOptionalDate(value, field) {
  if (value === undefined || value === null || value === "") return pass(null);
  return ensureDate(value, field);
}

function ensureTimeOrStby(value, field, { required = true } = {}) {
  if (!required && (value === undefined || value === null || value === "")) return pass(null);
  const s = ensureString(value, { field, required, max: 5 });
  if (!s.ok) return s;
  if (!TIME_OR_STBY_REGEX.test(s.value)) return fail(`${field} must be HH:MM or STBY`);
  return pass(s.value);
}

function ensureUuid(value, field, { required = false } = {}) {
  if (!required && (value === undefined || value === null || value === "")) return pass(null);
  const s = ensureString(value, { field, required, max: 36 });
  if (!s.ok) return s;
  if (!UUID_REGEX.test(s.value)) return fail(`${field} must be a valid UUID`);
  return pass(s.value);
}

function validateCommonFlightPayload(payload, { requireCoreFields = false } = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("payload inválido");

  if (payload.ac !== undefined && payload.ac !== null && payload.ac !== "") {
    const ac = ensureString(payload.ac, { field: "ac", required: true, max: 10 });
    if (!ac.ok) return ac;
    if (!VALID_AIRCRAFT.has(ac.value)) return fail("Aeronave inválida");
  }

  if (payload.st !== undefined && payload.st !== null && payload.st !== "") {
    const st = ensureString(payload.st, { field: "st", required: true, max: 8 });
    if (!st.ok) return st;
    if (!VALID_FLIGHT_STATUSES.has(st.value)) return fail("Estatus de vuelo inválido");
  }

  if (payload.date !== undefined && payload.date !== null && payload.date !== "") {
    const d = ensureDate(payload.date, "date");
    if (!d.ok) return d;
  }

  if (payload.time !== undefined && payload.time !== null && payload.time !== "") {
    const t = ensureTimeOrStby(payload.time, "time");
    if (!t.ok) return t;
  }

  for (const strField of ["orig", "dest", "rb", "nt"]) {
    if (payload[strField] !== undefined && payload[strField] !== null) {
      const max = strField === "nt" ? 500 : 120;
      const fieldValid = ensureString(payload[strField], { field: strField, required: false, allowEmpty: true, max });
      if (!fieldValid.ok) return fieldValid;
    }
  }

  for (const intField of ["pm", "pw", "pc", "bg"]) {
    const intValid = ensureInteger(payload[intField], { field: intField, min: 0, max: 10000 });
    if (!intValid.ok) return intValid;
  }

  const flightId = ensureUuid(payload.flight_id, "flight_id", { required: false });
  if (!flightId.ok) return flightId;

  if (requireCoreFields) {
    for (const f of ["date", "ac", "orig", "dest", "time", "rb"]) {
      if (!payload[f]) return fail(`${f} es requerido`);
    }
    const date = ensureDate(payload.date, "date");
    if (!date.ok) return date;
    const time = ensureTimeOrStby(payload.time, "time");
    if (!time.ok) return time;
  }

  return pass();
}

export function validateOpsWritePayload(action, payload = {}) {
  const normalizedAction = ACTION_ALIASES[String(action || "")] || String(action || "");
  if (!OPS_WRITE_ACTIONS.has(String(action || "")) && !OPS_WRITE_ACTIONS.has(normalizedAction)) return fail("Acción no permitida");
  if (normalizedAction === "restore_demo") return pass();

  if (normalizedAction === "create_itinerary") return pass();

  const common = validateCommonFlightPayload(payload, { requireCoreFields: normalizedAction === "create_flight" });
  if (!common.ok) return common;

  if (normalizedAction === "change_aircraft_status") {
    const ac = ensureString(payload.ac, { field: "ac", required: true, max: 10 });
    if (!ac.ok) return ac;
    if (!VALID_AIRCRAFT.has(ac.value)) return fail("Aeronave inválida");

    const statusChange = ensureString(payload.status_change, { field: "status_change", required: true, max: 20 });
    if (!statusChange.ok) return statusChange;
    if (!VALID_AIRCRAFT_STATUSES.has(statusChange.value)) return fail("status_change inválido");

    const startDate = ensureOptionalDate(payload.maintenance_start_date, "maintenance_start_date");
    if (!startDate.ok) return startDate;
    const endDate = ensureOptionalDate(payload.maintenance_end_date, "maintenance_end_date");
    if (!endDate.ok) return endDate;
  }

  return pass();
}

export function validateAiWritePayload(body = {}) {
  const action = String(body?.action || "");
  if (!WRITE_ACTIONS.has(action)) return fail("Acción no permitida");
  if (body?.confirmed !== true) return fail("Debes confirmar antes de ejecutar");
  const token = ensureString(body?.confirmation_token, { field: "confirmation_token", required: true, max: 1000 });
  if (!token.ok) return token;

  return validateOpsWritePayload(action, body?.payload || {});
}

export function validateOpsAgentPayload(body = {}) {
  const instruction = ensureString(body?.instruction, { field: "instruction", required: true, max: 3000 });
  if (!instruction.ok) return instruction;

  if (body?.context !== undefined) {
    if (!Array.isArray(body.context)) return fail("context must be an array");
    if (body.context.length > 8) return fail("context supports at most 8 items");
    for (const [index, item] of body.context.entries()) {
      const v = ensureString(item, { field: `context[${index}]`, required: true, max: 1000 });
      if (!v.ok) return v;
    }
  }

  return pass({ instruction: instruction.value, context: Array.isArray(body.context) ? body.context : [] });
}

export function validateRealtimeSessionPayload(body = {}) {
  const instructions = ensureString(body?.instructions || "", { field: "instructions", required: false, allowEmpty: true, max: 4000 });
  if (!instructions.ok) return instructions;
  return pass({ instructions: instructions.value });
}

export function validateTranscribeAudioPayload(body = {}) {
  const mimeType = ensureString(body?.mime_type || "audio/webm", { field: "mime_type", required: true, max: 60 });
  if (!mimeType.ok) return mimeType;

  const audio = ensureString(body?.audio_base64, { field: "audio_base64", required: true, max: 8_000_000 });
  if (!audio.ok) return audio;

  if (!BASE64_REGEX.test(audio.value)) return fail("audio_base64 inválido");

  const approxBytes = Math.floor((audio.value.length * 3) / 4);
  if (approxBytes <= 0 || approxBytes > 5 * 1024 * 1024) {
    return fail("audio_base64 excede tamaño máximo (5MB)");
  }

  return pass({ audio_base64: audio.value, mime_type: mimeType.value });
}
