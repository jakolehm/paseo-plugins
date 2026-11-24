import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal, SettingsCard, SettingsInput, SettingsRow, SettingsSelect, useToast } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import { reviewNowRpc, type ReviewerStatus } from "../shared/dashboard";
import { parsePrRef } from "../shared/pr-ref";
import { Button } from "./button";

export interface PrRef {
  repo: string;
  number: number;
  reviewerId?: string | null;
}

interface Props {
  theme: PluginTheme;
  reviewers: ReviewerStatus[];
  target: PrRef | null;
  onStarted(): void;
  onClose(): void;
}

export function ReviewNowDialog({ theme, reviewers, target, onStarted, onClose }: Props) {
  const reviewNow = useRpc(reviewNowRpc);
  const toast = useToast();
  const [text, setText] = useState("");
  const [reviewerId, setReviewerId] = useState(
    () => target?.reviewerId ?? coveringReviewer(reviewers, target)?.id ?? reviewers[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const ref = target ?? parsePrRef(text);

  const changeText = (next: string) => {
    setText(next);
    const covering = coveringReviewer(reviewers, parsePrRef(next));
    if (covering) setReviewerId(covering.id);
  };

  const start = async () => {
    if (!ref) return setError("Enter a PR link or owner/repo#123");
    setStarting(true);
    try {
      await reviewNow({ repo: ref.repo, number: ref.number, reviewerId });
      toast.show(`Review of ${ref.repo}#${ref.number} started`, { variant: "success" });
      onStarted();
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setStarting(false);
    }
  };

  return (
    <Modal title="Review now" open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ padding: 24, gap: 16 }}>
        <SettingsCard>
          {target ? (
            <SettingsRow label="Pull request" hint={`${target.repo}#${target.number}`} />
          ) : (
            <SettingsInput
              label="Pull request"
              hint="A PR link, or owner/repo#123. The repo must be a Paseo project on this host."
              placeholder="https://github.com/acme/api/pull/123"
              onChangeText={changeText}
            />
          )}
          {reviewers.length === 0 ? (
            <SettingsRow label="Reviewer" hint="Add a reviewer first." />
          ) : (
            <SettingsSelect
              label="Reviewer"
              hint="The review uses this reviewer's focus, agent, and approval policy. It ignores the selection rules."
              value={reviewerId}
              options={reviewers.map(({ id, name }) => ({ value: id, label: name }))}
              onValueChange={setReviewerId}
            />
          )}
        </SettingsCard>
        {error && <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{error}</Text>}
        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Button theme={theme} label="Cancel" onPress={onClose} />
          <Button
            theme={theme}
            label={starting ? "Starting…" : "Start review"}
            variant="primary"
            busy={starting}
            disabled={!ref || !reviewerId}
            onPress={() => void start()}
          />
        </View>
      </Modal.Content>
    </Modal>
  );
}

function coveringReviewer(reviewers: ReviewerStatus[], ref: PrRef | null) {
  if (!ref) return undefined;
  const repo = ref.repo.toLowerCase();
  return reviewers.find((reviewer) =>
    reviewer.repos.some((candidate) => candidate.repo.toLowerCase() === repo || candidate.currentName === repo),
  );
}
