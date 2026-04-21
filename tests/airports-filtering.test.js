import test from "node:test";
import assert from "node:assert/strict";

import { isOperationalAirportType, registerAirport } from "../src/lib/airports.js";

test("isOperationalAirportType rejects non-operational airport types", () => {
  assert.equal(isOperationalAirportType("heliport"), false);
  assert.equal(isOperationalAirportType("seaplane_base"), false);
  assert.equal(isOperationalAirportType("balloonport"), false);
  assert.equal(isOperationalAirportType("closed"), false);
  assert.equal(isOperationalAirportType("medium_airport"), true);
  assert.equal(isOperationalAirportType(""), true);
});

test("registerAirport ignores excluded airport types", () => {
  const map = new Map();
  const blocked = registerAirport({
    name: "Sample Heliport",
    iata_code: "SH1",
    icao_code: "KSH1",
    airport_type: "heliport",
    country_code: "US",
  }, map);
  assert.equal(blocked, null);
  assert.equal(map.size, 0);

  const allowed = registerAirport({
    name: "Sample International",
    iata_code: "SMP",
    icao_code: "KSMP",
    airport_type: "large_airport",
    country_code: "US",
  }, map);
  assert.ok(allowed);
  assert.ok(map.size > 0);
});
