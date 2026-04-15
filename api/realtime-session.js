function send(res, status, payload) {
  return res.status(status).json(payload);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return send(res, 500, { error: "OPENAI_API_KEY is not configured." });

  const model = String(process.env.OPENAI_REALTIME_MODEL || "gpt-4o-realtime-preview");
  const voice = String(process.env.OPENAI_REALTIME_VOICE || "alloy");
  const instructions = String(
    req.body?.instructions ||
      "Eres AI Pilot de operaciones aéreas. Responde en español claro, conciso y profesional."
  );

  try {
    const r = await fetch("https://api.openai.com/v1/realtime/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        voice,
        modalities: ["audio", "text"],
        input_audio_format: "pcm16",
        output_audio_format: "pcm16",
        instructions,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return send(res, 502, { error: data?.error?.message || `Realtime session error HTTP ${r.status}` });
    }

    return send(res, 200, {
      ok: true,
      model,
      voice,
      client_secret: data?.client_secret?.value || null,
      expires_at: data?.expires_at || null,
    });
  } catch (e) {
    return send(res, 502, { error: e?.message || "No se pudo crear la sesión realtime." });
  }
}
