import { normalizeAgentResult, normalizeAgentWithAliases } from "./agentUtils";

export async function analyzeOpsInstruction(instruction) {
  const response = await fetch("/api/ops-agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction }),
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

  return normalizeAgentWithAliases(normalizeAgentResult(data), instruction);
}
