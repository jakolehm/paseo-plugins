import assert from "node:assert/strict";
import { test } from "node:test";
import { inPortRanges, parsePortRanges } from "./port-ranges.ts";

test("parses single ports and ranges", () => {
  assert.deepEqual(parsePortRanges("3000-3999, 5173"), [
    [3000, 3999],
    [5173, 5173],
  ]);
});

test("accepts an empty list", () => {
  assert.deepEqual(parsePortRanges(" "), []);
});

test("rejects invalid text", () => {
  for (const text of ["abc", "0", "65536", "4000-3000", "1-2-3", "3000-"]) {
    assert.equal(parsePortRanges(text), null, text);
  }
});

test("matches ports inside the ranges only", () => {
  const ranges = parsePortRanges("3000-3999, 5173") ?? [];
  assert.equal(inPortRanges(ranges, 3456), true);
  assert.equal(inPortRanges(ranges, 5173), true);
  assert.equal(inPortRanges(ranges, 6767), false);
});
