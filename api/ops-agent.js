import OpenAI from "openai";
import { signAiConfirmation } from "../src/server/_aiConfirmation.js";
import { requireRouteAccess } from "../src/server/_routeProtection.js";
import { normalizeAgentWithAliases } from "../src/ai/agentUtils.js";
import { validateOpsAgentPayload } from "../src/server/_validation.js";

const MODEL = "gpt-4.1-mini";
const OPS_AGENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    action: { type: ["string", "null"] },
    intent_category: { type: "string", enum: ["internal_ops_query", "internal_schedule_action", "external_aviation_query", "unknown"] },
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
        airport_code: { type: ["string", "null"] },
        query_scope: { type: ["string", "null"] },
        maintenance_start_date: { type: ["string", "null"] },
        maintenance_end_date: { type: ["string", "null"] },
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
        "airport_code",
        "query_scope",
        "maintenance_start_date",
        "maintenance_end_date",
      ],
    },
    missing_fields: { type: "array", items: { type: "string" } },
    warnings: { type: "array", items: { type: "string" } },
    errors: { type: "array", items: { type: "string" } },
  },
  required: [
    "action",
    "intent_category",
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
  intent_category: "internal_schedule_action",
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
    airport_code: null,
    query_scope: null,
    maintenance_start_date: null,
    maintenance_end_date: null,
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

function readContext(req) {
  if (req?.body && typeof req.body === "object" && Array.isArray(req.body.context)) {
    return req.body.context.slice(-8).map((x) => String(x || "")).filter(Boolean);
  }
  return [];
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

function normalizeOpsResult(raw, instruction) {
  const result = normalizeAgentWithAliases(mergeWithTemplate(raw), instruction);
  const writeActions = new Set(["create_flight", "edit_flight", "cancel_flight", "change_aircraft_status", "duplicate_flight"]);

  if (writeActions.has(String(result.action || ""))) {
    result.requires_confirmation = true;
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
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 20, windowSeconds: 60 } });
  if (!access.ok) return sendJsonError(res, access.status, access.error);

  if (!process.env.OPENAI_API_KEY) {
    return sendJsonError(res, 500, "OPENAI_API_KEY is not configured on the server.");
  }

  const instruction = await readInstruction(req);
  const context = readContext(req);
  const payloadValidation = validateOpsAgentPayload({ instruction, context });
  if (!payloadValidation.ok) {
    return sendJsonError(res, 400, payloadValidation.error);
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
            "Allowed actions: create_flight, edit_flight, cancel_flight, change_aircraft_status, duplicate_flight, query_schedule, query_notam. " +
            "Allowed aircraft: N35EA, N540JL. Allowed aircraft statuses: disponible, mantenimiento, aog. Allowed flight statuses: prog, enc, comp, canc. " +
            "Critical create_flight fields: date, ac, orig, dest, time, rb. " +
            "Default behavior: treat user requests as INTERNAL AirPalace operations unless user explicitly requests external sources (FlightAware, weather, NOTAM, traffic, or third-party flights). " +
            "When user mentions N35EA or N540JL, always assume internal fleet context by default. " +
            "Use intent_category: internal_ops_query for read-only internal ops questions, internal_schedule_action for create/edit/cancel/status internal operations, external_aviation_query only for explicit external aviation data requests, unknown otherwise. " +
            "For queries, prioritize read-only actions and provide concise human_summary in Spanish. " +
            "Before any write action, prepare confirmation-only output first; do not claim completion before explicit confirmation. " +
            "If critical fields are missing or ambiguous, set requires_confirmation=true and list them in missing_fields.",
        },
        {
          role: "user",
          content: `${context.length ? `Recent conversation context:\\n- ${context.join("\\n- ")}\\n\\n` : ""}Instruction: ${instruction}`,
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

    const normalized = normalizeOpsResult(parsed, instruction);
    const isWrite = ["create_flight", "edit_flight", "cancel_flight", "change_aircraft_status", "duplicate_flight"].includes(String(normalized?.action || ""));
    const serverToken = isWrite ? signAiConfirmation(normalized.action, normalized.payload) : null;
    return res.status(200).json({
      ...normalized,
      server_confirmation_token: serverToken,
    });
  } catch (error) {
    const status = Number(error?.status) || Number(error?.code) || 500;
    const safeStatus = [400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504].includes(status)
      ? status
      : 500;
    const message = error?.message || "OpenAI request failed.";
    return sendJsonError(res, safeStatus, message);
  }
}
