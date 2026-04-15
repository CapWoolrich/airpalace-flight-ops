import crypto from "crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    const out = {};
    Object.keys(value)
      .sort()
      .forEach((k) => {
        out[k] = stable(value[k]);
      });
    return out;
  }
  return value ?? null;
}

function getSecret() {
  return String(
    process.env.AI_CONFIRMATION_SECRET ||
      process.env.API_INTERNAL_SECRET ||
      process.env.OPENAI_API_KEY ||
      ""
  ).trim();
}

function buildSnapshot(action, payload) {
  return {
    action: String(action || ""),
    payload: stable(payload || {}),
  };
}

export function signAiConfirmation(action, payload) {
  const secret = getSecret();
  if (!secret) return null;
  const snapshot = buildSnapshot(action, payload);
  const body = Buffer.from(JSON.stringify(snapshot), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyAiConfirmation(token, action, payload) {
  const secret = getSecret();
  if (!secret) return false;
  const raw = String(token || "");
  const [body, providedSig] = raw.split(".");
  if (!body || !providedSig) return false;
  const expectedSig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  if (providedSig !== expectedSig) return false;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    const expected = buildSnapshot(action, payload);
    return JSON.stringify(parsed) === JSON.stringify(expected);
  } catch {
    return false;
  }
}
