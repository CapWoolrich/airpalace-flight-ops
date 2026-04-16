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
  assert.ok(conflicts.length >= 1);
  assert.equal(conflicts[0].type, "aircraft_overlap");
  assert.equal(conflicts[0].severity, "critical");
  assert.equal(conflicts[0].resourceType, "aircraft");
  assert.equal(conflicts[0].flightId, "1");
  assert.equal(conflicts[0].conflictingFlightId, "2");
  assert.ok(typeof conflicts[0].message === "string" && conflicts[0].message.length > 10);
  assert.ok(typeof conflicts[0].suggestedFix === "string" && conflicts[0].suggestedFix.length > 10);
  const unique = uniqueFlightsFromConflicts(conflicts);
  assert.equal(unique.length, 2);
});

test("detectFlightConflicts reports location mismatch and insufficient turnaround", () => {
  const flights = [
    { id: "10", ac: "N35EA", rb: "Bernard Woolrich", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "10:00", orig: "MMMX", dest: "MMMD" },
    { id: "11", ac: "N35EA", rb: "Bernard Woolrich", st: "prog", date: "2026-04-20", time: "10:10", arrival_time: "11:15", orig: "MMCZ", dest: "MMMX" },
    { id: "12", ac: "N35EA", rb: "Otro Piloto", st: "prog", date: "2026-04-20", time: "11:00", arrival_time: "12:00", orig: "MMCZ", dest: "MMMX" },
  ];
  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.ok(conflicts.some((c) => c.type === "turnaround_insufficient"));
  assert.ok(conflicts.some((c) => c.type === "location_mismatch"));
});
