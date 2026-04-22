import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalEmail } from "../src/server/_emailTemplate.js";
import { makeCalUrl } from "../src/app/helpers.js";
import { executeAgentAction } from "../src/ai/agentExecutor.js";
import { supabase } from "../src/supabase.js";
import { shouldEmitFlightWhatsApp } from "../src/server/_opsSideEffects.js";

test("buildOperationalEmail escapes interpolated html values", () => {
  const email = buildOperationalEmail("flight_created", {
    ac: "N35EA",
    orig: "<Merida>",
    dest: "Cancun",
    notes: '<img src=x onerror="alert(1)">',
    actor: "Ops & Crew",
    date: "2026-04-16",
    time: "08:00",
  });

  assert.match(email.html, /&lt;Merida&gt;/);
  assert.match(email.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(email.html, /Ops &amp; Crew/);
  assert.doesNotMatch(email.html, /<img src=x onerror=/);
});

test("makeCalUrl encodes UTC timestamps for overnight flights", () => {
  const url = makeCalUrl({
    ac: "N35EA",
    orig: "Merida",
    dest: "Miami MIA",
    date: "2026-04-16",
    time: "23:30",
    rb: "Ops",
  });

  const dates = decodeURIComponent(url).match(/dates=(\d{8}T\d{6}Z)\/(\d{8}T\d{6}Z)/);
  assert.ok(dates, "Calendar URL should contain dates range");
  assert.equal(dates[1].slice(0, 8), "20260417");
  assert.ok(dates[2] > dates[1]);
});

test("executeAgentAction answers specific maintenance end-date query before generic branch", async () => {
  const originalFrom = supabase.from;
  supabase.from = (table) => {
    if (table !== "aircraft_status") throw new Error("unexpected table");
    return {
      select: async () => ({
        data: [{ ac: "N35EA", status: "mantenimiento", maintenance_end_date: "2026-04-20" }],
        error: null,
      }),
    };
  };

  try {
    const result = await executeAgentAction(
      {
        action: "query_schedule",
        payload: { query_scope: "aircraft_status", ac: "N35EA" },
      },
      { instruction: "¿Hasta cuándo está N35EA en mantenimiento?" }
    );

    assert.equal(result.ok, true);
    assert.match(result.message, /N35EA está en mantenimiento hasta/i);
  } finally {
    supabase.from = originalFrom;
  }
});

test("flight WhatsApp notifications emit only for create/duplicate/cancel", () => {
  assert.equal(shouldEmitFlightWhatsApp("create"), true);
  assert.equal(shouldEmitFlightWhatsApp("duplicate"), true);
  assert.equal(shouldEmitFlightWhatsApp("cancel"), true);
  assert.equal(shouldEmitFlightWhatsApp("edit"), false);
});
