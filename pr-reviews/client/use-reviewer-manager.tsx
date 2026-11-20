import type { PluginTheme } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { newReviewer, reviewSettings, type Reviewer, type ReviewSettings } from "../shared/settings";
import { ReviewerEditor } from "./reviewer-editor";

export function useReviewerManager(theme: PluginTheme, onSaved: () => void = () => undefined) {
  const settings = useSettings(reviewSettings);
  const [editing, setEditing] = useState<{ reviewer: Reviewer; isNew: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingEditId, setPendingEditId] = useState<string | null>(null);
  const values = settings.status === "ready" ? settings.values : null;

  // A reviewer that was saved outside this window is missing until the settings reload.
  useEffect(() => {
    const reviewer = pendingEditId ? values?.reviewers.find((candidate) => candidate.id === pendingEditId) : undefined;
    if (!reviewer) return;
    setPendingEditId(null);
    open(reviewer, false);
  }, [pendingEditId, values]);

  const save = async (next: ReviewSettings) => {
    if (settings.status !== "ready") return false;
    const parsed = reviewSettings.schema.safeParse(next);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(". "));
      return false;
    }
    setError(null);
    const saved = await settings.save(parsed.data, settings.revision);
    if (saved) onSaved();
    return saved;
  };

  const replaceReviewers = (reviewers: Reviewer[]) => (values ? save({ ...values, reviewers }) : Promise.resolve(false));

  const saveReviewer = async (reviewer: Reviewer) => {
    if (!values) return;
    const exists = values.reviewers.some((candidate) => candidate.id === reviewer.id);
    const reviewers = exists
      ? values.reviewers.map((candidate) => (candidate.id === reviewer.id ? reviewer : candidate))
      : [...values.reviewers, reviewer];
    if (await replaceReviewers(reviewers)) setEditing(null);
  };

  const removeReviewer = async (id: string) => {
    if (!values) return;
    if (await replaceReviewers(values.reviewers.filter((reviewer) => reviewer.id !== id))) setEditing(null);
  };

  const open = (reviewer: Reviewer, isNew: boolean) => {
    setError(null);
    setEditing({ reviewer, isNew });
  };

  const editor =
    editing && values ? (
      <ReviewerEditor
        theme={theme}
        reviewer={editing.reviewer}
        isNew={editing.isNew}
        others={values.reviewers.filter((reviewer) => reviewer.id !== editing.reviewer.id)}
        error={error ?? settings.saveError}
        onSave={(reviewer) => void saveReviewer(reviewer)}
        onRemove={() => void removeReviewer(editing.reviewer.id)}
        onClose={() => setEditing(null)}
      />
    ) : null;

  return {
    values,
    save,
    editor,
    addReviewer: () => open(newReviewer(randomId()), true),
    editReviewer: (id: string) => {
      const reviewer = values?.reviewers.find((candidate) => candidate.id === id);
      if (reviewer) return open(reviewer, false);
      setPendingEditId(id);
      void settings.reload();
    },
    setEnabled: (id: string, enabled: boolean) =>
      values &&
      void replaceReviewers(values.reviewers.map((reviewer) => (reviewer.id === id ? { ...reviewer, enabled } : reviewer))),
  };
}

function randomId() {
  return Math.random().toString(36).slice(2, 10);
}
