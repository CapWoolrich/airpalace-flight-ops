import test from "node:test";
import assert from "node:assert/strict";
import { signAiConfirmation, verifyAiConfirmation } from "../src/server/aiConfirmation.js";

test("AI confirmation token signs and verifies stable payload", () => {
  const prev = process.env.AI_CONFIRMATION_SECRET;
  process.env.AI_CONFIRMATION_SECRET = "test-secret";

  const action = "create_flight";
  const payload = {
    ac: "N35EA",
    date: "2026-04-22",
    orig: "Merida",
    dest: "Cancun",
    rb: "Jabib C",
    time: "10:00",
    pm: 2,
    pw: 0,
    pc: 0,
    bg: 20,
  };

  const token = signAiConfirmation(action, payload);
  assert.ok(token);
  assert.equal(verifyAiConfirmation(token, action, payload), true);
  assert.equal(verifyAiConfirmation(token, "edit_flight", payload), false);
  assert.equal(verifyAiConfirmation(token, action, { ...payload, rb: "Omar C" }), false);

  if (prev === undefined) delete process.env.AI_CONFIRMATION_SECRET;
  else process.env.AI_CONFIRMATION_SECRET = prev;
});
