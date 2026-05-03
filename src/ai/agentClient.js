import { normalizeAgentResult, normalizeAgentWithAliases } from "./agentUtils.js";
import { normalizeAviationInstruction } from "./aviationLanguage.js";
import { supabase } from "../supabase.js";

export async function analyzeOpsInstruction(instruction, conversationContext = []) {
  const normalizedInstruction = normalizeAviationInstruction(instruction);
  const { data: authData } = await supabase.auth.getSession();
  const token = authData?.session?.access_token;
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ action: "ops-agent", instruction: normalizedInstruction, context: conversationContext }),
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error("Respuesta inválida del servidor de agente.");
  }

  if (!response.ok) {
    const backendMessage =
      data?.error ||
      (Array.isArray(data?.errors) ? data.errors.join(" | ") : "") ||
      `Error ${response.status}`;
    throw new Error(backendMessage);
  }

  return normalizeAgentWithAliases(normalizeAgentResult(data), normalizedInstruction);
}
