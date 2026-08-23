import { describe, it, expect } from "vitest";

import { registryError } from "./errors";

/**
 * The FR-78 message below is the one observed live on Supabase project
 * `onpvolboecjpdkvurjaf` before this mapping was written:
 *
 *   ERROR 23514: delivery_ledger: engagement.db_project_ref refuses a
 *   secret-shaped value (FR-78)
 *   HINT: These columns hold identifiers, never credentials. [...]
 *
 * It is reproduced here as a string rather than re-provoked, because a unit test
 * has no database — and the live refusal is recorded separately in the report.
 */
const FR78 = {
  code: "23514",
  message:
    "delivery_ledger: engagement.db_project_ref refuses a secret-shaped value (FR-78)",
};

describe("registryError", () => {
  it("FR-78 reports the refusal and names the column", () => {
    const error = registryError(FR78, "Registering the engagement");
    expect(error.code).toBe("invalid_request");
    expect(error.status).toBe(400);
    expect(error.message).toContain("db_project_ref");
    expect(error.message).toContain("looks like a credential");
  });

  it("FR-78 says nothing was saved, because nothing was", () => {
    // Observed: the trigger is BEFORE INSERT and the refused row count was 0.
    // A message implying a partial write would send Erik looking for a row that
    // does not exist.
    expect(registryError(FR78, "x").message).toContain("nothing was saved");
  });

  it("FR-78 never forwards the raw database message", () => {
    const message = registryError(FR78, "x").message;
    expect(message).not.toContain("delivery_ledger:");
    expect(message).not.toContain("23514");
  });

  it("names a column from this build's own allowlist, not from the message text", () => {
    // A reworded trigger must not be able to make this report a column that
    // does not exist on the table.
    const reworded = {
      code: "23514",
      message: "engagement.some_future_column refuses a secret-shaped value (FR-78)",
    };
    expect(registryError(reworded, "x").message).toContain("an identifier");
    expect(registryError(reworded, "x").message).not.toContain("some_future_column");
  });

  it("maps a unique violation to something actionable", () => {
    const error = registryError({ code: "23505", message: "duplicate key" }, "x");
    expect(error.status).toBe(400);
    expect(error.message).toContain("already exists");
  });

  it("maps the append-only refusal without offering an escape hatch", () => {
    const error = registryError(
      { code: "23001", message: "is refused — this table is append-only (FR-59)" },
      "x",
    );
    expect(error.message).toContain("append-only");
    expect(error.message).toContain("no override");
  });

  it("anything unrecognised is a 500 carrying no database message", () => {
    const error = registryError(
      { code: "42P01", message: 'relation "secret_table" does not exist' },
      "Listing engagements",
    );
    expect(error.status).toBe(500);
    expect(error.message).not.toContain("secret_table");
    expect(error.message).toContain("Listing engagements");
  });

  it("survives a thrown value that is not a Postgres error at all", () => {
    expect(registryError(new Error("boom"), "x").status).toBe(500);
    expect(registryError(null, "x").status).toBe(500);
    expect(registryError(undefined, "x").status).toBe(500);
  });
});
