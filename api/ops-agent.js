import OpenAI from "openai";

const MODEL = "gpt-4.1-mini";
const AIRCRAFT_ALIASES = {
  n540jl: "N540JL",
  m2: "N540JL",
  n35ea: "N35EA",
  phenom: "N35EA",
  p300e: "N35EA",
};
const REQUESTER_ALIASES = {
  "jabib chapur": "Jabib C",
  "j chapur": "Jabib C",
  jabib: "Jabib C",
  omar: "Omar C",
  gibran: "Gibran C",
  jose: "Jose C",
  anuar: "Anuar C",
};
const AIRPORT_ALIASES = {
  kopf: "Opa-Locka Exec",
  opf: "Opa-Locka Exec",
  merida: "Merida",
  mid: "Merida",
  mmmd: "Merida",
};
const OPS_AGENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: ["string", "null"] },
    confidence: { type: "number" },
    requires_confirmation: { type: "boolean" },
    human_summary: { type: "string" },
    payload: {
      type: "object",
      additionalProperties: false,
      properties: {
        flight_id: { type: ["string", "number", "null"] },
        date: { type: ["string", "null"] },
        ac: { type: ["string", "null"] },
        orig: { type: ["string", "null"] },
        dest: { type: ["string", "null"] },
        time: { type: ["string", "null"] },
        rb: { type: ["string", "null"] },
        nt: { type: "string" },
        pm: { type: "number" },
        pw: { type: "number" },
        pc: { type: "number" },
        bg: { type: "number" },
        st: { type: "string" },
        status_change: { type: ["string", "null"] },
      },
      required: [
        "flight_id",
        "date",
        "ac",
        "orig",
        "dest",
        "time",
        "rb",
        "nt",
        "pm",
        "pw",
        "pc",
        "bg",
        "st",
        "status_change",
      ],
    },
    missing_fields: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    errors: { type: "array", items: { type: "string" } },
  },
  required: [
    "action",
    "confidence",
    "requires_confirmation",
    "human_summary",
    "payload",
    "missing_fields",
    "warnings",
    "errors",
  ],
};

const RESPONSE_TEMPLATE = {
  action: "create_flight",
  confidence: 0,
  requires_confirmation: true,
  human_summary: "",
  payload: {
    flight_id: null,
    date: null,
    ac: null,
    orig: null,
    dest: null,
    time: null,
    rb: null,
    nt: "",
    pm: 0,
    pw: 0,
    pc: 0,
    bg: 0,
    st: "prog",
    status_change: null,
  },
  missing_fields: [],
  warnings: [],
  errors: [],
};

function mergeWithTemplate(raw) {
  return {
    ...RESPONSE_TEMPLATE,
    ...(raw || {}),
    payload: {
      ...RESPONSE_TEMPLATE.payload,
      ...((raw && raw.payload) || {}),
    },
    missing_fields: Array.isArray(raw?.missing_fields) ? raw.missing_fields : [],
    warnings: Array.isArray(raw?.warnings) ? raw.warnings : [],
    errors: Array.isArray(raw?.errors) ? raw.errors : [],
  };
}

function sendJsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

async function readInstruction(req) {
  // Vercel can provide req.body as object, string, or undefined depending on headers/runtime.
  if (req?.body && typeof req.body === "object") {
    return String(req.body.instruction || "").trim();
  }

  if (typeof req?.body === "string") {
    try {
      const parsed = JSON.parse(req.body);
      return String(parsed?.instruction || "").trim();
    } catch {
      return "";
    }
  }

  // Fallback for edge cases where the raw body needs to be read as a stream.
  if (req && typeof req.on === "function") {
    const rawBody = await new Promise((resolve) => {
      let data = "";
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => resolve(data));
      req.on("error", () => resolve(""));
    });

    if (!rawBody) return "";
    try {
      const parsed = JSON.parse(rawBody);
      return String(parsed?.instruction || "").trim();
    } catch {
      return "";
    }
  }

  return "";
}

function getOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }

  const textFromOutput = (response?.output || [])
    .flatMap((item) => item?.content || [])
    .find((content) => content?.type === "output_text" && typeof content?.text === "string");

  return textFromOutput?.text || "";
}

function normalizeText(v) {
  return String(v || "").trim().toLowerCase();
}

function aliasMatch(aliases, text) {
  const haystack = normalizeText(text);
  const ordered = Object.keys(aliases).sort((a, b) => b.length - a.length);
  const hit = ordered.find((alias) => haystack.includes(alias));
  return hit ? aliases[hit] : null;
}

function aliasExact(aliases, value) {
  return aliases[normalizeText(value)] || null;
}

function normalizeOpsResult(raw, instruction) {
  const result = mergeWithTemplate(raw);
  const payload = result.payload;
  const text = normalizeText(instruction);

  payload.ac = aliasExact(AIRCRAFT_ALIASES, payload.ac) || payload.ac || aliasMatch(AIRCRAFT_ALIASES, text);
  payload.rb = aliasExact(REQUESTER_ALIASES, payload.rb) || payload.rb || aliasMatch(REQUESTER_ALIASES, text);
  payload.orig = aliasExact(AIRPORT_ALIASES, payload.orig) || payload.orig;
  payload.dest = aliasExact(AIRPORT_ALIASES, payload.dest) || payload.dest;

  if (!payload.orig && /\b(merida|mid|mmmd)\b/.test(text)) payload.orig = "Merida";
  if (!payload.dest && /\b(kopf|opf)\b/.test(text)) payload.dest = "Opa-Locka Exec";

  if (result.action === "change_aircraft_status") {
    const stAsStatus = normalizeText(payload.st);
    if (!payload.status_change && ["aog", "mantenimiento", "disponible"].includes(stAsStatus)) {
      payload.status_change = stAsStatus;
    }
    if (!payload.status_change) {
      payload.status_change = aliasMatch(
        { aog: "aog", mantenimiento: "mantenimiento", disponible: "disponible" },
        text
      );
    }
    payload.st = null;
  }

  if (
    result.action === "create_flight" &&
    Number(payload.pm || 0) + Number(payload.pw || 0) + Number(payload.pc || 0) === 0
  ) {
    const paxMatch = text.match(/(\d+)\s*(personas|pasajeros|pax)/);
    if (paxMatch) {
      const paxNote = `PAX total: ${Number(paxMatch[1])} (sin desglose)`;
      payload.nt = payload.nt ? `${payload.nt} | ${paxNote}` : paxNote;
    }
  }

  return result;
}

function validateSchemaForStructuredOutputs(schema, path = "root") {
  if (!schema || typeof schema !== "object") return null;

  if (schema.type === "object") {
    if (schema.additionalProperties !== false) {
      return `${path}: additionalProperties must be false`;
    }

    const keys = Object.keys(schema.properties || {});
    const required = Array.isArray(schema.required) ? schema.required : [];
    if (keys.length !== required.length || keys.some((k) => !required.includes(k))) {
      return `${path}: required must list every property key`;
    }
  }

  if (schema.type === "object" && schema.properties) {
    for (const [key, child] of Object.entries(schema.properties)) {
      const nestedError = validateSchemaForStructuredOutputs(child, `${path}.properties.${key}`);
      if (nestedError) return nestedError;
    }
  }

  if (schema.items && typeof schema.items === "object") {
    const nestedError = validateSchemaForStructuredOutputs(schema.items, `${path}.items`);
    if (nestedError) return nestedError;
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJsonError(res, 405, "Method not allowed. Use POST /api/ops-agent.");
  }

  if (!process.env.OPENAI_API_KEY) {
    return sendJsonError(res, 500, "OPENAI_API_KEY is not configured on the server.");
  }

  const instruction = await readInstruction(req);
  if (!instruction) {
    return sendJsonError(res, 400, "instruction is required");
  }

  try {
    const schemaValidationError = validateSchemaForStructuredOutputs(OPS_AGENT_JSON_SCHEMA);
    if (schemaValidationError) {
      return sendJsonError(res, 500, `Invalid Structured Output schema: ${schemaValidationError}`);
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await client.responses.create({
      model: MODEL,
      input: [
        {
          role: "system",
          content:
            "You are an ops parser for an aviation dispatch app. Return JSON only. Never fabricate critical values. " +
            "Allowed actions: create_flight, edit_flight, cancel_flight, change_aircraft_status, duplicate_flight, query_schedule. " +
            "Allowed aircraft: N35EA, N540JL. Allowed aircraft statuses: disponible, mantenimiento, aog. Allowed flight statuses: prog, enc, comp, canc. " +
            "Critical create_flight fields: date, ac, orig, dest, time, rb. " +
            "If critical fields are missing or ambiguous, set requires_confirmation=true and list them in missing_fields.",
        },
        {
          role: "user",
          content: `Instruction: ${instruction}`,
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ops_agent_result",
          strict: true,
          schema: OPS_AGENT_JSON_SCHEMA,
        },
      },
    });

    const outputText = getOutputText(response);
    if (!outputText) {
      return sendJsonError(
        res,
        502,
        "OpenAI response did not include parseable text output."
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      return sendJsonError(res, 502, "Model returned invalid JSON.");
    }

    return res.status(200).json(normalizeOpsResult(parsed, instruction));
  } catch (error) {
    const status = Number(error?.status) || Number(error?.code) || 500;
    const safeStatus = [400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504].includes(status)
      ? status
      : 500;
    const message = error?.message || "OpenAI request failed.";
    return sendJsonError(res, safeStatus, message);
  }
}
