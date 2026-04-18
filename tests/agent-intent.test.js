import test from "node:test";
import assert from "node:assert/strict";
import { classifyAgentIntent, normalizeAgentWithAliases } from "../src/ai/agentUtils.js";

test("normalizeAgentWithAliases maps N35EA mentions to internal aircraft", () => {
  const normalized = normalizeAgentWithAliases(
    { action: "query_schedule", payload: { ac: null } },
    "Muéstrame la agenda de N35EA este mes"
  );
  assert.equal(normalized.payload.ac, "N35EA");
  assert.equal(normalized.intent_category, "internal_ops_query");
});

test("classifyAgentIntent treats scheduling commands as internal actions", () => {
  const intent = classifyAgentIntent("programa un vuelo mañana para N540JL", {
    action: "create_flight",
    payload: { ac: "N540JL" },
  });
  assert.equal(intent, "internal_schedule_action");
});

test("classifyAgentIntent marks explicit external aviation requests", () => {
  const intent = classifyAgentIntent("Busca en FlightAware el tráfico aéreo de hoy", {
    action: "query_schedule",
    payload: { ac: null },
  });
  assert.equal(intent, "external_aviation_query");
});
