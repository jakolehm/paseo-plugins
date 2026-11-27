import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { QualityCounts } from "../shared/dashboard";
import { pluginDataFile } from "./plugin-data.ts";
import { reviewQuality } from "./review-quality.ts";
import type { ReviewRecord } from "./review-store";

const DAY_MS = 24 * 60 * 60_000;
const KEEP_DAYS = 365;

// The store keeps review records for 48 hours only, so the quality of each day is saved here.
export class QualityHistory {
  private readonly file: string;
  private readonly days: Record<string, QualityCounts>;

  constructor(file = pluginDataFile("quality-history.json")) {
    this.file = file;
    this.days = load(file);
  }

  // Today and yesterday are still complete in the store, so they are counted again. Older days do not change.
  record(records: readonly ReviewRecord[], now = Date.now()) {
    const done = records.filter((record) => record.status === "done" && record.outcome && record.finishedAt);
    for (const date of [dayOf(now - DAY_MS), dayOf(now)]) {
      const ofDay = done.filter((record) => dayOf(Date.parse(record.finishedAt!)) === date);
      if (ofDay.length > 0) this.days[date] = reviewQuality(ofDay).total;
    }
    const oldest = dayOf(now - KEEP_DAYS * DAY_MS);
    for (const date of Object.keys(this.days)) if (date < oldest) delete this.days[date];
    this.save();
  }

  // One entry for each day, oldest first. A day without first reviews has zero counts.
  daily(count: number, now = Date.now()) {
    return Array.from({ length: count }, (_, index) => {
      const date = dayOf(now - (count - 1 - index) * DAY_MS);
      return { date, ...(this.days[date] ?? { firstReviews: 0, findings: 0, approved: 0, clean: 0 }) };
    });
  }

  private save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const temp = `${this.file}.tmp`;
      writeFileSync(temp, JSON.stringify(this.days));
      renameSync(temp, this.file);
    } catch {
      // The next finished review saves again.
    }
  }
}

function dayOf(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

function load(file: string): Record<string, QualityCounts> {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}
