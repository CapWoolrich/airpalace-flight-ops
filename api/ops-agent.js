import OpenAI from "openai";

const MODEL = "gpt-4.1-mini";

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
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              action: { type: ["string", "null"] },
              confidence: { type: "number" },
              requires_confirmation: { type: "boolean" },
              human_summary: { type: "string" },
              payload: {
                type: "object",
                additionalProperties: true,
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
          },
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

    return res.status(200).json(mergeWithTemplate(parsed));
  } catch (error) {
    const status = Number(error?.status) || Number(error?.code) || 500;
    const safeStatus = [400, 401, 403, 404, 408, 409, 422, 429, 500, 502, 503, 504].includes(status)
      ? status
      : 500;
    const message = error?.message || "OpenAI request failed.";
    return sendJsonError(res, safeStatus, message);
  }
}
