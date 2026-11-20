import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { HandledReview } from "./selection";
import type { ReviewOutcome } from "./review-outcome";

const MAX_RECORDS = 300;

type ReviewStatus = "queued" | "running" | "permission" | "done" | "failed";

export interface ReviewRecord {
  id: string;
  key: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  head: string;
  since: string | null;
  reason: string;
  reviewerId: string;
  reviewerName: string;
  agentId: string | null;
  status: ReviewStatus;
  queuedAt: string;
  finishedAt: string | null;
  outcome: ReviewOutcome | null;
  error: string | null;
  archived?: boolean;
  restoredAt?: string;
  agentConfig?: string;
  round?: number;
}

interface State {
  handled: Record<string, HandledReview>;
  records: ReviewRecord[];
  dismissed: string[];
}

// A plugin reload runs a new instance while the old one stops. Both can write, so read the file again when it changed.
export class ReviewStore {
  private readonly file: string;
  private loaded: State;
  private loadedMtime = -1;

  constructor(file = defaultStateFile()) {
    this.file = file;
    this.loaded = load(file);
    this.loadedMtime = mtime(file);
  }

  private get state(): State {
    const current = mtime(this.file);
    if (current !== this.loadedMtime) {
      this.loaded = load(this.file);
      this.loadedMtime = current;
    }
    return this.loaded;
  }

  handled(key: string): HandledReview | undefined {
    return this.state.handled[key];
  }

  records(): readonly ReviewRecord[] {
    return this.state.records;
  }

  latest(key: string): ReviewRecord | undefined {
    return this.state.records.find((record) => record.key === key);
  }

  isDismissed(id: string) {
    return this.state.dismissed.includes(id);
  }

  add(record: ReviewRecord) {
    this.state.records = [record, ...this.state.records].slice(0, MAX_RECORDS);
    this.save();
  }

  update(id: string, changes: Partial<ReviewRecord>) {
    const record = this.state.records.find((candidate) => candidate.id === id);
    if (!record) return;
    Object.assign(record, changes);
    if (record.status === "done" && record.finishedAt) {
      this.state.handled[record.key] = { head: record.head, at: record.finishedAt };
    }
    this.save();
  }

  dismiss(id: string) {
    if (this.isDismissed(id)) return;
    const known = new Set(this.state.records.map((record) => record.id));
    this.state.dismissed = [...this.state.dismissed.filter((entry) => known.has(entry)), id];
    this.save();
  }

  private save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.loaded, null, 2));
    renameSync(temp, this.file);
    this.loadedMtime = mtime(this.file);
  }
}

function load(file: string): State {
  try {
    return { handled: {}, records: [], dismissed: [], ...JSON.parse(readFileSync(file, "utf8")) };
  } catch {
    return { handled: {}, records: [], dismissed: [] };
  }
}

function mtime(file: string) {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return -1;
  }
}

function defaultStateFile() {
  const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  return join(home, "plugin-data", "pr-reviews", "state.json");
}
