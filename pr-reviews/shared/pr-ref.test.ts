import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePrRef } from "./pr-ref.ts";

test("parses PR links and short references", () => {
  assert.deepEqual(parsePrRef("https://github.com/acme/app/pull/12/files"), { repo: "acme/app", number: 12 });
  assert.deepEqual(parsePrRef(" acme/app#7 "), { repo: "acme/app", number: 7 });
  assert.equal(parsePrRef("acme/app"), null);
});
