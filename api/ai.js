import aiWriteHandler from "../src/server/apiHandlers/aiWriteHandler.js";
import opsAgentHandler from "../src/server/apiHandlers/opsAgentHandler.js";
import realtimeSessionHandler from "../src/server/apiHandlers/realtimeSessionHandler.js";
import transcribeAudioHandler from "../src/server/apiHandlers/transcribeAudioHandler.js";

const MAP = {
  "ai-write": aiWriteHandler,
  "ops-agent": opsAgentHandler,
  "realtime-session": realtimeSessionHandler,
  "transcribe-audio": transcribeAudioHandler,
};

export default async function handler(req, res) {
  const action = String(req.query?.action || req.body?.action || "").trim();
  if (action === "ai-write" && req.body?.payload_action) {
    req.body = { ...req.body, action: req.body.payload_action };
  }
  const target = MAP[action];
  if (!target) return res.status(400).json({ ok: false, error: "action inválida", allowed: Object.keys(MAP) });
  return target(req, res);
}
