import test from "node:test";
import assert from "node:assert/strict";
import { detectFlightConflicts, uniqueFlightsFromConflicts } from "../src/ai/conflictUtils.js";
import { getOperationalDateOffsetISO, parseOperationalDateFromText } from "../src/ai/operationalDate.js";
import { normalizeRequesterValue } from "../src/ai/agentUtils.js";

test("normalizeRequesterValue maps Habib alias to Jabib C", () => {
  assert.equal(normalizeRequesterValue("Habib"), "Jabib C");
  assert.equal(normalizeRequesterValue("habib chapur"), "Jabib C");
});

test("parseOperationalDateFromText resolves relative operational dates", () => {
  const baseDate = new Date("2026-04-15T12:00:00Z");
  const tomorrow = parseOperationalDateFromText("mañana", { baseDate });
  const nextDay = getOperationalDateOffsetISO(1, baseDate);
  assert.equal(tomorrow?.date, nextDay);
});

test("detectFlightConflicts catches overlapping flights on same aircraft", () => {
  const flights = [
    { id: "1", ac: "N35EA", st: "prog", date: "2026-04-20", time: "10:00" },
    { id: "2", ac: "N35EA", st: "enc", date: "2026-04-20", time: "10:40" },
    { id: "3", ac: "N540JL", st: "prog", date: "2026-04-20", time: "10:45" },
  ];
  const conflicts = detectFlightConflicts(flights, { occupancyMinutes: 90 });
  assert.equal(conflicts.length, 1);
  const unique = uniqueFlightsFromConflicts(conflicts);
  assert.equal(unique.length, 2);
});
