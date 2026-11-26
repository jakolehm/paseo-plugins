import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { newReviewer, reviewSettings } from "../shared/settings.ts";
import { SettingsBackup } from "./settings-backup.ts";

function backupFile() {
  return join(mkdtempSync(join(tmpdir(), "pr-reviews-")), "settings-backup.json");
}

test("settings without reviewers keep the last backup", () => {
  const backup = new SettingsBackup(backupFile());
  const saved = reviewSettings.schema.parse({ reviewers: [newReviewer("a")] });
  backup.save(saved);
  backup.save(reviewSettings.schema.parse({}));
  assert.deepEqual(backup.load(), saved);
});

test("a missing or invalid backup loads as null", () => {
  const file = backupFile();
  assert.equal(new SettingsBackup(file).load(), null);
  writeFileSync(file, "{ not json");
  assert.equal(new SettingsBackup(file).load(), null);
});
