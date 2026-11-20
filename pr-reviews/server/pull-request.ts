export interface Activity {
  author: string;
  isBot: boolean;
  at: string;
}

interface Review extends Activity {
  commit: string | null;
}

interface ReviewThread {
  resolved: boolean;
  starter: string | null;
  last: Activity | null;
}

export interface PullRequest {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  authorIsBot: boolean;
  isDraft: boolean;
  createdAt: string;
  updatedAt: string;
  reviewDecision: string | null;
  mergeable: string | null;
  mergeState: string | null;
  checks: string | null;
  head: string;
  requestedReviewers: string[];
  requestedAt: string | null;
  reviews: Review[];
  comments: Activity[];
  threads: ReviewThread[];
}

export function prKey(repo: string, number: number) {
  return `${repo}#${number}`;
}
