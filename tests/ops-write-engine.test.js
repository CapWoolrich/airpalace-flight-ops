import test from "node:test";
import assert from "node:assert/strict";
import { applyOpsMutation, isMissingFlightAuditFieldError } from "../src/lib/opsWriteEngine.js";

function makeFlightInsertDb({ firstError = null, secondData = null, secondError = null } = {}) {
  const insertRows = [];
  let insertCallCount = 0;

  return {
    insertRows,
    insertCallCount: () => insertCallCount,
    from(table) {
      assert.equal(table, "flights");
      return {
        insert(rows) {
          insertRows.push(rows[0]);
          insertCallCount += 1;
          return {
            select() {
              return {
                single: async () => {
                  if (insertCallCount === 1 && firstError) return { data: null, error: firstError };
                  return { data: secondData, error: secondError };
                },
              };
            },
          };
        },
      };
    },
  };
}

test("isMissingFlightAuditFieldError only matches known audit-column schema errors", () => {
  const schemaCacheError = {
    message: "Could not find the 'created_by_user_name' column of 'flights' in the schema cache",
  };
  const missingColumnError = {
    message: 'column "updated_by_name" of relation "flights" does not exist',
  };
  const unrelatedColumnError = {
    message: 'column "non_audit_field" of relation "flights" does not exist',
  };

  assert.equal(isMissingFlightAuditFieldError(schemaCacheError), true);
  assert.equal(isMissingFlightAuditFieldError(missingColumnError), true);
  assert.equal(isMissingFlightAuditFieldError(unrelatedColumnError), false);
  assert.equal(isMissingFlightAuditFieldError(new Error("timeout")), false);
});

test("create_flight retries without audit fields on missing audit column error", async () => {
  const db = makeFlightInsertDb({
    firstError: {
      message: "Could not find the 'created_by_user_id' column of 'flights' in the schema cache",
    },
    secondData: { id: "f-1", ac: "N35EA", rb: "Jabib C" },
  });

  const result = await applyOpsMutation({
    db,
    action: "create_flight",
    payload: {
      date: "2026-04-25",
      ac: "N35EA",
      orig: "MID",
      dest: "CUN",
      time: "10:30",
      rb: "Jabib C",
    },
    audit: {
      created_by_user_id: "user-1",
      created_by_user_email: "ops@example.com",
      created_by_user_name: "Ops",
      created_by_email: "ops@example.com",
      created_by_name: "Ops",
      updated_by_email: "ops@example.com",
      updated_by_name: "Ops",
      creation_source: "ai",
    },
  });

  assert.equal(db.insertCallCount(), 2);
  assert.ok(db.insertRows[0].created_by_user_id);
  assert.equal(db.insertRows[1].created_by_user_id, undefined);
  assert.equal(db.insertRows[1].creation_source, undefined);
  assert.deepEqual(result.warnings, ["compat:audit_fields_missing_schema_cache"]);
  assert.equal(result.flight.id, "f-1");
});

test("create_flight does not swallow unrelated database errors", async () => {
  const error = { message: 'column "ac_typo" of relation "flights" does not exist' };
  const db = makeFlightInsertDb({ firstError: error });

  await assert.rejects(
    applyOpsMutation({
      db,
      action: "create_flight",
      payload: {
        date: "2026-04-25",
        ac: "N35EA",
        orig: "MID",
        dest: "CUN",
        time: "10:30",
        rb: "Jabib C",
      },
      audit: { creation_source: "ai" },
    }),
    (thrown) => {
      assert.equal(thrown, error);
      return true;
    },
  );
  assert.equal(db.insertCallCount(), 1);
});
