import test from "node:test";
import assert from "node:assert/strict";
import {
  emitFlightSideEffects,
  mapFlightEmailEventType,
  shouldEmitFlightEmail,
} from "../src/server/_opsSideEffects.js";

test("mapFlightEmailEventType maps operational flight actions correctly", () => {
  assert.equal(mapFlightEmailEventType("create"), "flight_created");
  assert.equal(mapFlightEmailEventType("edit"), "flight_updated");
  assert.equal(mapFlightEmailEventType("cancel"), "flight_cancelled");
  assert.equal(mapFlightEmailEventType("duplicate"), "flight_created");
  assert.equal(mapFlightEmailEventType("in_progress"), null);
  assert.equal(mapFlightEmailEventType("completed"), null);
});

test("shouldEmitFlightEmail only enables create/edit/cancel/duplicate", () => {
  assert.equal(shouldEmitFlightEmail("create"), true);
  assert.equal(shouldEmitFlightEmail("edit"), true);
  assert.equal(shouldEmitFlightEmail("cancel"), true);
  assert.equal(shouldEmitFlightEmail("duplicate"), true);
  assert.equal(shouldEmitFlightEmail("in_progress"), false);
  assert.equal(shouldEmitFlightEmail("completed"), false);
});

test("emitFlightSideEffects triggers email warning for edit when email env is missing", async () => {
  const beforeResend = process.env.RESEND_API_KEY;
  const beforeFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;

  const supabase = {
    from() {
      return {
        select: async () => ({ data: [], error: null }),
      };
    },
  };

  const result = await emitFlightSideEffects({
    supabase,
    eventType: "edit",
    actorName: "QA Ops",
    flight: { id: "f-1", ac: "N35EA", date: "2026-04-18", orig: "MID", dest: "CUN", time: "10:00" },
  });

  assert.equal(result.warnings.some((w) => w.startsWith("email:")), true);

  if (beforeResend) process.env.RESEND_API_KEY = beforeResend;
  else delete process.env.RESEND_API_KEY;
  if (beforeFrom) process.env.EMAIL_FROM = beforeFrom;
  else delete process.env.EMAIL_FROM;
});
