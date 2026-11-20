export const REVIEWER_COLORS = {
  blue: "#3B82F6",
  violet: "#8B5CF6",
  pink: "#EC4899",
  orange: "#F97316",
  teal: "#14B8A6",
  green: "#84CC16",
  yellow: "#EAB308",
  rose: "#F43F5E",
} as const;

export type ReviewerColor = keyof typeof REVIEWER_COLORS;

const NAMES = Object.keys(REVIEWER_COLORS) as ReviewerColor[];

export function isReviewerColor(value: string): value is ReviewerColor {
  return value in REVIEWER_COLORS;
}

// Reviewers without a chosen color get the first colors that no other reviewer uses.
export function reviewerColors(reviewers: { id: string; color: string }[]): Map<string, string> {
  const taken = new Set(reviewers.map((reviewer) => reviewer.color).filter(isReviewerColor));
  const free = NAMES.filter((name) => !taken.has(name));
  let next = 0;
  return new Map(
    reviewers.map((reviewer) => {
      const name = isReviewerColor(reviewer.color) ? reviewer.color : (free[next++] ?? NAMES[next % NAMES.length]);
      return [reviewer.id, REVIEWER_COLORS[name]];
    }),
  );
}
