import { normalizeAgentResult } from "./agentUtils";

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
    throw new Error(data?.error || "No se pudo analizar la instrucción.");
  }

  return normalizeAgentResult(data);
}
