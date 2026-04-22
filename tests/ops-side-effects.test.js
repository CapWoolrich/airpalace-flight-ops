import test from "node:test";
import assert from "node:assert/strict";
import {
  emitFlightSideEffects,
  mapFlightEmailEventType,
  mapFlightWhatsAppLabel,
  shouldEmitFlightEmail,
  shouldEmitFlightWhatsApp,
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

test("shouldEmitFlightWhatsApp only enables create/duplicate/cancel", () => {
  assert.equal(shouldEmitFlightWhatsApp("create"), true);
  assert.equal(shouldEmitFlightWhatsApp("duplicate"), true);
  assert.equal(shouldEmitFlightWhatsApp("cancel"), true);
  assert.equal(shouldEmitFlightWhatsApp("edit"), false);
});

test("mapFlightWhatsAppLabel returns expected values", () => {
  assert.equal(mapFlightWhatsAppLabel("create"), "PROGRAMADO");
  assert.equal(mapFlightWhatsAppLabel("duplicate"), "PROGRAMADO");
  assert.equal(mapFlightWhatsAppLabel("cancel"), "CANCELADO");
  assert.equal(mapFlightWhatsAppLabel("edit"), null);
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

test("ops/ai write flows do not hardcode WhatsApp only for cancel_flight", async () => {
  const { readFile } = await import("node:fs/promises");
  const [opsWrite, aiWrite] = await Promise.all([
    readFile(new URL("../api/ops-write.js", import.meta.url), "utf8"),
    readFile(new URL("../api/ai-write.js", import.meta.url), "utf8"),
  ]);

  assert.equal(opsWrite.includes('sendWhatsapp: action === "cancel_flight"'), false);
  assert.equal(aiWrite.includes('sendWhatsapp: action === "cancel_flight"'), false);
});
