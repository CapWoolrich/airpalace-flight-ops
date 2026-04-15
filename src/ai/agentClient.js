import { normalizeAgentResult, normalizeAgentWithAliases } from "./agentUtils";
import { normalizeAviationInstruction } from "./aviationLanguage";

export async function analyzeOpsInstruction(instruction, conversationContext = []) {
  const normalizedInstruction = normalizeAviationInstruction(instruction);
  const response = await fetch("/api/ops-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction: normalizedInstruction, context: conversationContext }),
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
