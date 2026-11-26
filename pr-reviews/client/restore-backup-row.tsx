import type { PluginTheme } from "@getpaseo/plugin";
import { useRpc } from "@getpaseo/plugin/client";
import { SettingsRow } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { settingsBackupRpc, type ReviewSettings } from "../shared/settings";
import { Button } from "./button";

interface Props {
  theme: PluginTheme;
  onRestore(backup: ReviewSettings): void;
}

export function RestoreBackupRow({ theme, onRestore }: Props) {
  const getBackup = useRpc(settingsBackupRpc);
  const { data } = useQuery({ queryKey: ["pr-reviews", "settings-backup"], queryFn: () => getBackup({}) });
  const backup = data?.backup;
  if (!backup) return null;

  return (
    <SettingsRow
      label="Restore from backup"
      hint={`The last saved settings: ${backup.reviewers.map((reviewer) => reviewer.name).join(", ")}.`}
    >
      <Button theme={theme} label="Restore" onPress={() => onRestore(backup)} />
    </SettingsRow>
  );
}
