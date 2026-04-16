import test from "node:test";
import assert from "node:assert/strict";
import { applyOpsMutation, __opsWriteCompat } from "../src/lib/opsWriteEngine.js";

test("compat helper detects missing audit column schema-cache errors", () => {
  assert.equal(
    __opsWriteCompat.isSchemaCacheMissingAuditColumnError({
      code: "PGRST204",
      message: "Could not find the 'updated_by_email' column of 'flights' in the schema cache",
    }),
    true
  );

  assert.equal(
    __opsWriteCompat.isSchemaCacheMissingAuditColumnError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
    }),
    false
  );
});

test("create_flight retries without audit fields when schema cache is stale", async () => {
  const calls = [];
  let insertAttempt = 0;

  const db = {
    from(table) {
      assert.equal(table, "flights");
      return {
        insert(rows) {
          calls.push(rows[0]);
          insertAttempt += 1;
          return {
            select() {
              return {
                single: async () => {
                  if (insertAttempt === 1) {
                    return {
                      data: null,
                      error: {
                        code: "PGRST204",
                        message: "Could not find the 'updated_by_email' column of 'flights' in the schema cache",
                      },
                    };
                  }
                  return { data: { id: "f1", ...rows[0] }, error: null };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await applyOpsMutation({
    db,
    action: "create_flight",
    payload: {
      date: "2026-04-25",
      ac: "N35EA",
      orig: "Merida",
      dest: "Cancun",
      time: "09:00",
      rb: "Jabib C",
      nt: "",
    },
    audit: {
      updated_by_email: "ops@airpalace.test",
      updated_by_name: "Ops",
      created_by_email: "ops@airpalace.test",
      created_by_name: "Ops",
      creation_source: "manual",
    },
  });

  assert.equal(calls.length, 2);
  assert.ok(Object.prototype.hasOwnProperty.call(calls[0], "updated_by_email"));
  assert.equal(Object.prototype.hasOwnProperty.call(calls[1], "updated_by_email"), false);
  assert.deepEqual(result.warnings, ["compat:audit_fields_missing_schema_cache"]);
  assert.equal(result.flight.id, "f1");
});
