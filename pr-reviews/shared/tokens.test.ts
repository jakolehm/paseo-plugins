import assert from "node:assert/strict";
import { test } from "node:test";
import { formatTokens } from "./tokens.ts";

test("formats token counts short", () => {
  assert.equal(formatTokens(950), "950");
  assert.equal(formatTokens(5_772), "5.8k");
  assert.equal(formatTokens(40_000), "40k");
  assert.equal(formatTokens(999_700), "1M");
  assert.equal(formatTokens(3_132_621), "3.1M");
  assert.equal(formatTokens(68_400_000), "68M");
});
