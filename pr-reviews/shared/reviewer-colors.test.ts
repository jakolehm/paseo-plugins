import assert from "node:assert/strict";
import { test } from "node:test";
import { REVIEWER_COLORS, reviewerColors } from "./reviewer-colors.ts";

test("gives automatic colors that no chosen color uses", () => {
  const colors = reviewerColors([
    { id: "a", color: "" },
    { id: "b", color: "blue" },
    { id: "c", color: "" },
  ]);
  assert.deepEqual([...colors.values()], [REVIEWER_COLORS.violet, REVIEWER_COLORS.blue, REVIEWER_COLORS.pink]);
});
