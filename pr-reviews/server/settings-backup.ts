import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { reviewSettings, type ReviewSettings } from "../shared/settings.ts";
import { pluginDataFile } from "./plugin-data.ts";

// Paseo deletes plugin settings when the plugin is removed, but keeps plugin data.
// Settings without reviewers do not replace the backup, so a reinstall can restore them.
export class SettingsBackup {
  private readonly file: string;

  constructor(file = pluginDataFile("settings-backup.json")) {
    this.file = file;
  }

  save(values: ReviewSettings) {
    if (values.reviewers.length === 0) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(values, null, 2));
      renameSync(temp, this.file);
    } catch {
      // A failed backup must not stop the settings from applying.
    }
  }

  load(): ReviewSettings | null {
    try {
      const parsed = reviewSettings.schema.safeParse(JSON.parse(readFileSync(this.file, "utf8")));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
}
