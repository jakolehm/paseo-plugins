import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { Pressable, Text, View } from "react-native";
import type { Reviewer } from "../shared/settings";
import { useGitHubProjects } from "./use-host-options";

interface Props {
  theme: PluginTheme;
  selected: string[];
  others: Reviewer[];
  onChange(repos: string[]): void;
}

type ChipState = "selected" | "free" | "taken" | "missing";

export function RepoPicker({ theme, selected, others, onChange }: Props) {
  const projects = useGitHubProjects();
  const owners = new Map(others.flatMap((other) => other.repos.map((repo) => [repo.toLowerCase(), other.name] as const)));
  const known = new Set((projects ?? []).map((project) => project.repo.toLowerCase()));
  const missing = selected.filter((repo) => !known.has(repo.toLowerCase()));
  const isSelected = (repo: string) => selected.some((candidate) => candidate.toLowerCase() === repo.toLowerCase());
  const toggle = (repo: string) =>
    onChange(isSelected(repo) ? selected.filter((candidate) => candidate.toLowerCase() !== repo.toLowerCase()) : [...selected, repo]);

  if (projects?.length === 0 && missing.length === 0) {
    return (
      <SettingsSection title="Repos">
        <SettingsCard>
          <SettingsRow label="No GitHub projects" hint="Add a local checkout as a Paseo project first." />
        </SettingsCard>
      </SettingsSection>
    );
  }

  const stateOf = (repo: string): ChipState => (isSelected(repo) ? "selected" : owners.has(repo.toLowerCase()) ? "taken" : "free");
  return (
    <SettingsSection title="Repos">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {projects?.map(({ repo, path }) => (
          <RepoChip
            key={repo}
            theme={theme}
            repo={repo}
            note={owners.get(repo.toLowerCase()) ?? null}
            state={stateOf(repo)}
            hint={path}
            onPress={() => toggle(repo)}
          />
        ))}
        {missing.map((repo) => (
          <RepoChip
            key={repo}
            theme={theme}
            repo={repo}
            note="no Paseo project"
            state="missing"
            hint="This repo cannot be reviewed. Press to remove it."
            onPress={() => toggle(repo)}
          />
        ))}
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 8 }}>
        A repo has one reviewer. Dimmed repos belong to another reviewer.
      </Text>
    </SettingsSection>
  );
}

function RepoChip({
  theme,
  repo,
  note,
  state,
  hint,
  onPress,
}: {
  theme: PluginTheme;
  repo: string;
  note: string | null;
  state: ChipState;
  hint: string;
  onPress(): void;
}) {
  const { colors } = theme;
  const border = { selected: colors.accent, free: colors.border, taken: colors.border, missing: colors.statusDanger }[state];
  const text = state === "taken" ? colors.foregroundMuted : colors.foreground;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: state === "selected" || state === "missing", disabled: state === "taken" }}
      accessibilityLabel={repo}
      accessibilityHint={hint}
      disabled={state === "taken"}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: state === "selected" ? colors.surface2 : "transparent",
        opacity: state === "taken" ? 0.5 : pressed ? 0.7 : 1,
      })}
    >
      {state === "selected" && <Icon name="Check" size={14} color={colors.accent} />}
      {state === "missing" && <Icon name="TriangleAlert" size={14} color={colors.statusDanger} />}
      <Text style={{ color: text, fontSize: 13 }}>{repo.split("/")[1] ?? repo}</Text>
      {note && <Text style={{ color: colors.foregroundMuted, fontSize: 12 }}>· {note}</Text>}
    </Pressable>
  );
}
