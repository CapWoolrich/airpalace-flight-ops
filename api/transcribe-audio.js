import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { requireRouteAccess } from "../src/server/_routeProtection.js";
import { validateTranscribeAudioPayload } from "../src/server/_validation.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const access = await requireRouteAccess(req, { requireAuth: true, rateLimit: { max: 20, windowSeconds: 60 } });
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: "OPENAI_API_KEY missing" });

  const bodyValidation = validateTranscribeAudioPayload(req.body || {});
  if (!bodyValidation.ok) return res.status(400).json({ error: bodyValidation.error });

  const base64 = bodyValidation.value.audio_base64;
  const mimeType = bodyValidation.value.mime_type || "audio/webm";
  const extMap = {
    "audio/webm": "webm",
    "audio/webm;codecs=opus": "webm",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/ogg;codecs=opus": "ogg",
    "audio/wav": "wav",
  };
  if (!base64) return res.status(400).json({ error: "audio_base64 is required" });

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const buffer = Buffer.from(base64, "base64");
    const ext = extMap[mimeType] || "webm";
    const file = await toFile(buffer, `voice.${ext}`, { type: mimeType });

    const transcript = await client.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      language: "es",
    });

    return res.status(200).json({ text: transcript?.text || "" });
  } catch (e) {
    return res.status(500).json({ error: e?.message || `transcription failed (${mimeType})` });
  }
}
