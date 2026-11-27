import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyProbeFailure, probeSandbox } from "./sandbox-probe.ts";

test("a host that is not Linux uses the native sandbox", async () => {
  assert.deepEqual(await probeSandbox("darwin"), { mode: "native", error: null });
});

test("a container that hides /proc needs the nested sandbox", () => {
  const error = { stderr: "bwrap: Can't mount proc on /newroot/proc: Operation not permitted\n" };
  assert.deepEqual(classifyProbeFailure(error), { mode: "nested", error: null });
});

test("a missing bwrap makes the sandbox unavailable", () => {
  const error = Object.assign(new Error("spawn bwrap ENOENT"), { stderr: "" });
  assert.deepEqual(classifyProbeFailure(error), { mode: "unavailable", error: "spawn bwrap ENOENT" });
});

test("other bwrap errors make the sandbox unavailable", () => {
  const error = { stderr: "bwrap: No permissions to creating new namespace\nmore" };
  assert.deepEqual(classifyProbeFailure(error), { mode: "unavailable", error: "bwrap: No permissions to creating new namespace" });
});
