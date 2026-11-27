import assert from "node:assert/strict";
import { test } from "node:test";
import { newReviewer } from "../shared/settings.ts";
import { sandboxOptions } from "./sandbox.ts";

const reviewer = newReviewer("a");

test("the nested mode turns on the weaker nested sandbox", () => {
  const { options } = sandboxOptions(reviewer, { mode: "nested", error: null });
  assert.equal(options?.sandbox.enableWeakerNestedSandbox, true);
});

test("the native mode keeps the full sandbox", () => {
  const { options } = sandboxOptions(reviewer, { mode: "native", error: null });
  assert.equal(options?.sandbox.enabled, true);
  assert.equal(options?.sandbox.enableWeakerNestedSandbox, false);
});

test("a reviewer with the sandbox off gets no sandbox options", () => {
  assert.deepEqual(sandboxOptions({ ...reviewer, sandbox: false }, { mode: "native", error: null }), {});
});
