import type { PluginTheme } from "@getpaseo/plugin";
import {
  Modal,
  SettingsCard,
  SettingsInput,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
  TextInput,
} from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import type { Reviewer } from "../shared/settings";
import { Button } from "./button";
import { ColorPicker } from "./color-picker";
import { APPROVAL_LABELS, BOT_LABELS, SELECTION_LABELS, selectOptions } from "./labels";
import { RepoPicker } from "./repo-picker";
import { SandboxSwitch } from "./sandbox-switch";
import { useAgentProviders } from "./use-host-options";

const MAX_AGE_OPTIONS = [0, 7, 14, 30, 60, 90].map((days) => ({ value: String(days), label: days === 0 ? "No limit" : `${days} days` }));

const DEFAULT_CHOICE = { value: "", label: "Default" };

interface Props {
  theme: PluginTheme;
  reviewer: Reviewer;
  isNew: boolean;
  others: Reviewer[];
  error: string | null;
  onSave(reviewer: Reviewer): void;
  onRemove(): void;
  onClose(): void;
}

export function ReviewerEditor({ theme, reviewer, isNew, others, error, onSave, onRemove, onClose }: Props) {
  const [draft, setDraft] = useState(reviewer);
  const change = (changes: Partial<Reviewer>) => setDraft((current) => ({ ...current, ...changes }));

  return (
    <Modal title={isNew ? "New reviewer" : draft.name} open onOpenChange={(open) => !open && onClose()}>
      <Modal.Content contentContainerStyle={{ padding: 24, gap: 24 }}>
        <SettingsSection title="Reviewer">
          <SettingsCard>
            <SettingsInput label="Name" initialValue={draft.name} onChangeText={(name) => change({ name })} />
            <ColorPicker theme={theme} value={draft.color} onChange={(color) => change({ color })} />
            <SettingsSwitch
              label="Active"
              hint="A paused reviewer starts no agents."
              value={draft.enabled}
              onValueChange={(enabled) => change({ enabled })}
            />
          </SettingsCard>
        </SettingsSection>

        <RepoPicker theme={theme} selected={draft.repos} others={others} onChange={(repos) => change({ repos })} />

        <SettingsSection title="Pull requests">
          <SettingsCard>
            <SettingsSelect
              label="Review"
              value={draft.selection}
              options={selectOptions(SELECTION_LABELS)}
              onValueChange={(selection) => change({ selection })}
            />
            <SettingsSelect
              label="Bot PRs"
              hint="PRs from GitHub Apps and other bot accounts."
              value={draft.bots}
              options={selectOptions(BOT_LABELS)}
              onValueChange={(bots) => change({ bots })}
            />
            <SettingsInput
              label="Never review PRs from"
              hint="GitHub logins, separated by commas. The [bot] suffix is not necessary."
              placeholder="dependabot, release-please"
              initialValue={draft.skipAuthors.join(", ")}
              onChangeText={(text) => change({ skipAuthors: text.split(/[\s,]+/).filter(Boolean) })}
            />
            <SettingsSelect
              label="Skip PRs older than"
              hint="Automatic reviews only. The age counts from when the PR was opened."
              value={String(draft.maxAgeDays)}
              options={MAX_AGE_OPTIONS}
              onValueChange={(days) => change({ maxAgeDays: Number(days) })}
            />
            <SettingsSelect
              label="Approval"
              value={draft.approval}
              options={selectOptions(APPROVAL_LABELS)}
              onValueChange={(approval) => change({ approval })}
            />
            <SettingsSwitch
              label="Second opinion from Codex"
              hint="The agent checks its findings with codex review before it posts."
              value={draft.secondOpinion}
              onValueChange={(secondOpinion) => change({ secondOpinion })}
            />
          </SettingsCard>
        </SettingsSection>

        <AgentSection draft={draft} onChange={change} />

        <SettingsSection title="Focus">
          <SettingsCard>
            <View style={{ padding: 16, gap: 8 }}>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
                What this reviewer looks for. The plugin adds this text to the shared review rules.
              </Text>
              <TextInput
                multiline
                defaultValue={draft.focus}
                onChangeText={(focus) => change({ focus })}
                placeholder="Security, auth, and data loss. Ignore style."
                placeholderTextColor={theme.colors.foregroundMuted}
                textAlignVertical="top"
                style={{
                  minHeight: 220,
                  color: theme.colors.foreground,
                  backgroundColor: theme.colors.surface0,
                  borderColor: theme.colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                  lineHeight: 20,
                }}
              />
            </View>
          </SettingsCard>
        </SettingsSection>

        {error && <Text style={{ color: theme.colors.statusDanger, fontSize: 13 }}>{error}</Text>}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {!isNew && <Button theme={theme} label="Remove" variant="danger" onPress={onRemove} />}
          <View style={{ flex: 1 }} />
          <Button theme={theme} label="Cancel" onPress={onClose} />
          <Button theme={theme} label="Save" variant="primary" onPress={() => onSave(draft)} />
        </View>
      </Modal.Content>
    </Modal>
  );
}

function AgentSection({ draft, onChange }: { draft: Reviewer; onChange(changes: Partial<Reviewer>): void }) {
  const providers = useAgentProviders() ?? [];
  const provider = providers.find((candidate) => candidate.id === draft.provider);
  const providerOptions = providers.map(({ id, label }) => ({ value: id, label }));
  if (!provider) providerOptions.push({ value: draft.provider, label: `${draft.provider} (not available)` });

  return (
    <SettingsSection title="Agent">
      <SettingsCard>
        <SettingsSelect
          label="Provider"
          value={draft.provider}
          options={providerOptions}
          onValueChange={(next) => onChange({ provider: next, model: "", modeId: "" })}
        />
        <SettingsSelect
          label="Model"
          value={draft.model}
          options={[DEFAULT_CHOICE, ...(provider?.models ?? []).map(({ id, label }) => ({ value: id, label }))]}
          onValueChange={(model) => onChange({ model })}
        />
        <SettingsSelect
          label="Mode"
          hint="Use a mode that does not ask for permissions. Else the agent waits for you."
          value={draft.modeId}
          options={[DEFAULT_CHOICE, ...(provider?.modes ?? []).map(({ id, label }) => ({ value: id, label }))]}
          onValueChange={(modeId) => onChange({ modeId })}
        />
        {draft.provider === "claude" && (
          <SandboxSwitch value={draft.sandbox} onValueChange={(sandbox) => onChange({ sandbox })} />
        )}
      </SettingsCard>
    </SettingsSection>
  );
}
