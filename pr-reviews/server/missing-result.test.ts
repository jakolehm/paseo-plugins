import assert from "node:assert/strict";
import { test } from "node:test";
import { MissingResult } from "./missing-result.ts";

test("a missing result fails only after the grace period", () => {
  const missing = new MissingResult(1_000);
  assert.equal(missing.expired(5_000), false);
  assert.equal(missing.expired(5_999), false);
  assert.equal(missing.expired(6_000), true);
});
