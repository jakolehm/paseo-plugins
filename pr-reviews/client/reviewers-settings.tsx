import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { Loading, SettingsCard, SettingsRow, SettingsSection, SettingsSelect, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { Button } from "./button";
import { summarize } from "./labels";
import { RestoreBackupRow } from "./restore-backup-row";
import { useReviewerManager } from "./use-reviewer-manager";

const POLL_OPTIONS = [2, 5, 10, 15, 30, 60].map((minutes) => ({ value: String(minutes), label: `${minutes} min` }));
const PARALLEL_OPTIONS = [1, 2, 3, 4].map((count) => ({ value: String(count), label: String(count) }));
const ARCHIVE_OPTIONS = [
  { value: "15", label: "15 minutes" },
  { value: "60", label: "1 hour" },
  { value: "240", label: "4 hours" },
  { value: "1440", label: "24 hours" },
  { value: "0", label: "Never" },
];
const USAGE_LIMIT_OPTIONS = [50, 60, 70, 80, 90, 100].map((pct) => ({ value: String(pct), label: pct === 100 ? "No limit" : `${pct}%` }));

export function ReviewersSettings({ theme }: PluginSurfaceProps) {
  const manager = useReviewerManager(theme);
  const { values } = manager;
  if (!values) return <Loading />;

  return (
    <>
      <SettingsSection title="PR reviews">
        <SettingsCard>
          <SettingsSelect
            label="Check GitHub every"
            hint="The check uses gh, not an agent. An agent starts only for a PR that needs a review."
            value={String(values.pollMinutes)}
            options={POLL_OPTIONS}
            onValueChange={(minutes) => void manager.save({ ...values, pollMinutes: Number(minutes) })}
          />
          <SettingsSelect
            label="Parallel review agents"
            value={String(values.maxParallelReviews)}
            options={PARALLEL_OPTIONS}
            onValueChange={(count) => void manager.save({ ...values, maxParallelReviews: Number(count) })}
          />
          <SettingsSelect
            label="Archive finished reviews after"
            hint="Reviews that need nothing from you. A re-review restores the workspace and continues the same agent."
            value={String(values.archiveAfterMinutes)}
            options={ARCHIVE_OPTIONS}
            onValueChange={(minutes) => void manager.save({ ...values, archiveAfterMinutes: Number(minutes) })}
          />
          <SettingsSelect
            label="Hold new reviews above"
            hint="Claude, Codex, and other providers report session and weekly usage. New automatic reviews wait while a window of the reviewer's provider is above this value."
            value={String(values.usageLimitPct)}
            options={USAGE_LIMIT_OPTIONS}
            onValueChange={(pct) => void manager.save({ ...values, usageLimitPct: Number(pct) })}
          />
          <SettingsSwitch
            label="Keep pace with the week"
            hint="New automatic reviews also wait while the weekly usage runs more than 10% ahead of the time that has passed in the week."
            value={values.usagePacing}
            onValueChange={(usagePacing) => void manager.save({ ...values, usagePacing })}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Reviewers" trailing={<Button theme={theme} label="Add reviewer" onPress={manager.addReviewer} />}>
        <SettingsCard>
          {values.reviewers.length === 0 && (
            <>
              <SettingsRow label="No reviewers" hint="Add a reviewer to start automatic reviews." />
              <RestoreBackupRow theme={theme} onRestore={(backup) => void manager.save(backup)} />
            </>
          )}
          {values.reviewers.map((reviewer) => (
            <SettingsRow
              key={reviewer.id}
              label={reviewer.enabled ? reviewer.name : `${reviewer.name} (paused)`}
              hint={summarize(reviewer)}
            >
              <Button theme={theme} label="Edit" onPress={() => manager.editReviewer(reviewer.id)} />
            </SettingsRow>
          ))}
        </SettingsCard>
      </SettingsSection>

      {manager.editor}
    </>
  );
}
