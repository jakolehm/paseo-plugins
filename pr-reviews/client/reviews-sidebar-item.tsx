import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon, SidebarRow } from "@getpaseo/plugin/client/ui";
import { Text, View } from "react-native";
import { useDashboard } from "./use-dashboard";

interface Count {
  icon: string;
  count: number;
  color: string;
  label: string;
}

export function ReviewsSidebarItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const dashboard = useDashboard();
  const { colors } = theme;
  const counts: Count[] = dashboard
    ? [
        { icon: "Bot", count: dashboard.actionNeeded.agents.length, color: colors.statusDanger, label: "review agents need you" },
        { icon: "Eye", count: dashboard.actionNeeded.reviews.length, color: colors.statusWarning, label: "PRs wait for your review" },
        { icon: "GitPullRequest", count: dashboard.actionNeeded.ownPullRequests.length, color: colors.accent, label: "of your PRs need action" },
        { icon: "LoaderCircle", count: dashboard.inProgress.length, color: colors.foregroundMuted, label: "reviews run now" },
      ].filter((entry) => entry.count > 0)
    : [];
  return (
    <SidebarRow
      icon="GitPullRequest"
      active={currentScreen?.screenId === "reviews"}
      onPress={() => openScreen({ screenId: "reviews" })}
      trailing={
        counts.length > 0 && (
          <View style={{ flexDirection: "row", gap: 4 }}>
            {counts.map((entry) => (
              <CountBadge key={entry.icon} theme={theme} entry={entry} />
            ))}
          </View>
        )
      }
    />
  );
}

function CountBadge({ theme, entry }: { theme: PluginTheme; entry: Count }) {
  return (
    <View
      accessible
      accessibilityLabel={`${entry.count} ${entry.label}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: entry.color,
      }}
    >
      <Icon name={entry.icon} size={10} color={entry.color} />
      <Text style={{ color: theme.colors.foreground, fontSize: 11, fontWeight: "600" }}>{entry.count}</Text>
    </View>
  );
}
