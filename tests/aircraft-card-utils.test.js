import test from "node:test";
import assert from "node:assert/strict";
import { AC } from "../src/app/data.js";
import { buildNextFlightLine, buildRouteStatusLine, deriveOperationalStatus, formatMonthlyHoursLabel, getMonthlyAircraftMetrics, resolveFlightAwareUrl } from "../src/app/aircraftCardUtils.js";

test("resolveFlightAwareUrl returns mapped URL per aircraft", () => {
  assert.equal(resolveFlightAwareUrl(AC.N35EA), "https://es.flightaware.com/live/flight/N35EA");
  assert.equal(resolveFlightAwareUrl(AC.N540JL), "https://es.flightaware.com/live/flight/N540JL");
});

test("deriveOperationalStatus prioritizes in-flight over maintenance states", () => {
  const status = deriveOperationalStatus({ maintenanceStatus: "mantenimiento", isInFlight: true, isStandby: false });
  assert.equal(status.label, "En vuelo");
});

test("buildRouteStatusLine falls back to last leg when not in flight", () => {
  const line = buildRouteStatusLine({ inFlight: null, lastLeg: { orig: "MID", dest: "PUJ" }, isAtBase: false });
  assert.equal(line, "Vuelo anterior: MID → PUJ");
});

test("buildNextFlightLine renders graceful fallback without schedule", () => {
  assert.equal(buildNextFlightLine(null), "No programado");
});

test("getMonthlyAircraftMetrics computes flights, hours, and utilization with real route calculator", () => {
  const fs = [
    { ac: "N35EA", st: "prog", date: "2026-04-01", time: "10:00", orig: "MID", dest: "CUN", pm: 1, pw: 0, pc: 0, bg: 0 },
    { ac: "N35EA", st: "enc", date: "2026-04-10", time: "11:00", orig: "CUN", dest: "MID", pm: 1, pw: 0, pc: 0, bg: 0 },
    { ac: "N35EA", st: "canc", date: "2026-04-15", time: "12:00", orig: "MID", dest: "MIA", pm: 1, pw: 0, pc: 0, bg: 0 },
  ];
  const metrics = getMonthlyAircraftMetrics(fs, "N35EA", "2026-04");
  assert.equal(metrics.flights, 2);
  assert.ok(metrics.hours > 0);
  assert.ok(Number.isFinite(metrics.utilization));
});

test("formatMonthlyHoursLabel keeps hour suffix attached", () => {
  assert.equal(formatMonthlyHoursLabel(23.4), "23.4 h");
  assert.equal(formatMonthlyHoursLabel(null), "-- h");
});
