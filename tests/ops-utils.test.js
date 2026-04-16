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
    { id: "1", ac: "N35EA", st: "prog", date: "2026-04-20", time: "10:00", orig: "MMUN", dest: "MMMD" },
    { id: "2", ac: "N35EA", st: "enc", date: "2026-04-20", time: "10:40", orig: "MMUN", dest: "MMMD" },
    { id: "3", ac: "N540JL", st: "prog", date: "2026-04-20", time: "10:45", orig: "MMUN", dest: "MMMD" },
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

test("detectFlightConflicts does not flag aircraft overlap across Cancun/Merida local-time conversion when ETA is valid", () => {
  const flights = [
    { id: "TZ-A", ac: "N35EA", st: "prog", date: "2026-04-20", time: "7:00 PM", arrival_time: "6:46 PM", orig: "CUN", dest: "MID" },
    { id: "TZ-B", ac: "N35EA", st: "prog", date: "2026-04-20", time: "8:00 PM", arrival_time: "9:10 PM", orig: "MID", dest: "CUN" },
  ];

  const conflicts = detectFlightConflicts(flights, { occupancyMinutes: 90 });
  const aircraftOverlaps = conflicts.filter((c) => c.type === "aircraft_overlap");
  assert.equal(aircraftOverlaps.length, 0);
});

test("detectFlightConflicts reports insufficient turnaround", () => {
  const flights = [
    { id: "10", ac: "N35EA", rb: "Bernard Woolrich", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "10:00", orig: "MMMX", dest: "MMMD" },
    { id: "11", ac: "N35EA", rb: "Bernard Woolrich", st: "prog", date: "2026-04-20", time: "10:10", arrival_time: "11:15", orig: "MMCZ", dest: "MMMX" },
    { id: "12", ac: "N35EA", rb: "Otro Piloto", st: "prog", date: "2026-04-20", time: "11:00", arrival_time: "12:00", orig: "MMCZ", dest: "MMMX" },
  ];
  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.ok(conflicts.some((c) => c.type === "turnaround_insufficient"));
});

test("detectFlightConflicts does not create pilot_overlap from requester rb", () => {
  const flights = [
    { id: "RB-1", ac: "N35EA", rb: "Gibran C", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "11:00", orig: "CUN", dest: "MID" },
    { id: "RB-2", ac: "N540JL", rb: "Gibran C", st: "prog", date: "2026-04-20", time: "09:30", arrival_time: "11:30", orig: "MID", dest: "CUN" },
  ];
  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "pilot_overlap").length, 0);
});

test("detectFlightConflicts normalizes Merida to Punta Cana without timezone_mismatch when schedule is valid", () => {
  const flights = [
    { id: "TZ-OK-1", ac: "N35EA", st: "prog", date: "2026-05-30", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "PUJ" },
  ];
  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "timezone_mismatch").length, 0);
});

test("detectFlightConflicts accepts DD/MM/YYYY and DD-MM-YYYY date formats for MID to PUJ normalization", () => {
  const flights = [
    { id: "DATE-FMT-1", ac: "N35EA", st: "prog", date: "30/05/2026", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "PUJ" },
    { id: "DATE-FMT-2", ac: "N35EA", st: "prog", date: "30-05-2026", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "PUJ" },
  ];
  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "timezone_mismatch").length, 0);
});

test("detectFlightConflicts normalizes Spanish/English PM time variants reliably", () => {
  const variants = ["9:30 PM", "9:30 p.m.", "9:30 p. m.", "21:30"];
  variants.forEach((timeValue, idx) => {
    const flights = [
      { id: `TIME-${idx}`, ac: "N35EA", st: "prog", date: "2026-05-30", time: timeValue, arrival_time: "11:30 PM", orig: "MID", dest: "PUJ" },
    ];
    const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
    assert.equal(conflicts.filter((c) => c.type === "timezone_mismatch").length, 0);
  });
});

test("detectFlightConflicts resolves Punta Cana aliases to America/Santo_Domingo", () => {
  const flights = [
    { id: "ALIAS-PUJ", ac: "N35EA", st: "prog", date: "2026-05-30", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "PUJ" },
    { id: "ALIAS-MDPC", ac: "N35EA", st: "prog", date: "2026-06-01", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "MDPC" },
    { id: "ALIAS-PUNTA", ac: "N35EA", st: "prog", date: "2026-06-02", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "Punta Cana" },
  ];
  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "timezone_mismatch").length, 0);
});

test("detectFlightConflicts does not flag location mismatch when immediate next leg repositions correctly", () => {
  const flights = [
    { id: "A", ac: "N35EA", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "10:00", orig: "CUN", dest: "MID" },
    { id: "B", ac: "N35EA", st: "prog", date: "2026-04-20", time: "11:00", arrival_time: "12:00", orig: "MID", dest: "CUN" },
  ];

  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "location_mismatch").length, 0);
});

test("detectFlightConflicts only evaluates immediate chronological pairings per aircraft sequence", () => {
  const flights = [
    { id: "A", ac: "N35EA", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "10:00", orig: "CUN", dest: "MID" },
    { id: "B", ac: "N35EA", st: "prog", date: "2026-04-20", time: "11:00", arrival_time: "12:00", orig: "MID", dest: "CUN" },
    { id: "C", ac: "N35EA", st: "prog", date: "2026-04-20", time: "13:00", arrival_time: "14:00", orig: "CUN", dest: "MIA" },
  ];

  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  const mismatches = conflicts.filter((c) => c.type === "location_mismatch");
  assert.equal(mismatches.length, 0);
});

test("detectFlightConflicts flags location mismatch when immediate next chronological flight departs elsewhere", () => {
  const flights = [
    { id: "A", ac: "N35EA", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "10:00", orig: "CUN", dest: "MID" },
    { id: "B", ac: "N35EA", st: "prog", date: "2026-04-20", time: "13:00", arrival_time: "15:00", orig: "MIA", dest: "CUN" },
  ];

  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  const mismatches = conflicts.filter((c) => c.type === "location_mismatch");
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].flightId, "A");
  assert.equal(mismatches[0].conflictingFlightId, "B");
});

test("detectFlightConflicts does not duplicate location mismatch alerts for the same sequential pair", () => {
  const flights = [
    { id: "A", ac: "N35EA", st: "prog", date: "2026-04-20", time: "09:00", arrival_time: "10:00", orig: "CUN", dest: "MID" },
    { id: "B", ac: "N35EA", st: "prog", date: "2026-04-20", time: "13:00", arrival_time: "15:00", orig: "MIA", dest: "CUN" },
  ];

  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  const mismatches = conflicts.filter((c) => c.type === "location_mismatch" && c.flightId === "A" && c.conflictingFlightId === "B");
  assert.equal(mismatches.length, 1);
});

test("detectFlightConflicts does not flag location mismatch when Punta Cana intermediate leg normalizes correctly", () => {
  const flights = [
    { id: "PC-1", ac: "N35EA", st: "prog", date: "2026-05-05", time: "10:00", arrival_time: "13:00", orig: "PUJ", dest: "MID" },
    { id: "PC-2", ac: "N35EA", st: "prog", date: "2026-05-30", time: "09:00", arrival_time: "13:00", orig: "MID", dest: "PUJ" },
    { id: "PC-3", ac: "N35EA", st: "prog", date: "2026-06-02", time: "10:00", arrival_time: "12:00", orig: "PUJ", dest: "CZM" },
  ];

  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "location_mismatch").length, 0);
});

test("detectFlightConflicts warns about uncertain sequence when intermediate connector exists but is unparseable", () => {
  const flights = [
    { id: "PCU-1", ac: "N35EA", st: "prog", date: "2026-05-05", time: "09:00", arrival_time: "10:00", orig: "CUN", dest: "MID" },
    { id: "PCU-2", ac: "N35EA", st: "prog", date: "2026-05-30", time: "", arrival_time: "13:00", orig: "MID", dest: "PUJ" },
    { id: "PCU-3", ac: "N35EA", st: "prog", date: "2026-06-02", time: "10:00", arrival_time: "12:00", orig: "PUJ", dest: "CZM" },
  ];

  const conflicts = detectFlightConflicts(flights, { minTurnaroundMinutes: 30 });
  assert.equal(conflicts.filter((c) => c.type === "location_mismatch").length, 0);
  const uncertaintyWarnings = conflicts.filter((c) => c.type === "sequence_uncertain_due_to_unparseable_intermediate_leg");
  assert.equal(uncertaintyWarnings.length, 1);
  assert.equal(uncertaintyWarnings[0].severity, "warning");
});

test("detectFlightConflicts uses route-duration estimate before 90-minute fallback", () => {
  const flights = [
    { id: "RTE-1", ac: "N35EA", st: "prog", date: "2026-06-10", time: "10:00", orig: "MMUN", dest: "MMMD" },
  ];
  const conflicts = detectFlightConflicts(flights, { occupancyMinutes: 90 });
  assert.equal(conflicts.filter((c) => c.type === "sequence_uncertain_due_to_low_confidence_duration").length, 0);
  assert.equal(conflicts.filter((c) => c.type === "timezone_mismatch").length, 0);
});
