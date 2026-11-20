import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { PrStatus } from "../shared/dashboard";

type Tone = "success" | "warning" | "danger" | "muted";

interface StatusIcon {
  icon: string;
  tone: Tone;
  label: string;
}

const REVIEW: Record<PrStatus["review"], StatusIcon> = {
  approved: { icon: "UserCheck", tone: "success", label: "Approved" },
  changes: { icon: "UserX", tone: "danger", label: "Changes requested" },
  required: { icon: "User", tone: "muted", label: "Review required" },
  draft: { icon: "PencilLine", tone: "muted", label: "Draft" },
};

const CHECKS: Record<PrStatus["checks"], StatusIcon | null> = {
  passing: { icon: "CircleCheck", tone: "success", label: "Checks pass" },
  failing: { icon: "CircleX", tone: "danger", label: "Checks fail" },
  pending: { icon: "Clock", tone: "warning", label: "Checks run" },
  none: null,
};

const MERGE: Record<PrStatus["merge"], StatusIcon | null> = {
  ready: { icon: "GitMerge", tone: "success", label: "Ready to merge" },
  blocked: { icon: "GitMerge", tone: "warning", label: "Merge blocked" },
  behind: { icon: "GitMerge", tone: "warning", label: "Behind the base branch" },
  conflicts: { icon: "GitMerge", tone: "danger", label: "Merge conflicts" },
  unknown: null,
};

export function StatusIcons({ theme, status }: { theme: PluginTheme; status: PrStatus }) {
  const colors: Record<Tone, string> = {
    success: theme.colors.statusSuccess,
    warning: theme.colors.statusWarning,
    danger: theme.colors.statusDanger,
    muted: theme.colors.foregroundMuted,
  };
  const icons = [REVIEW[status.review], CHECKS[status.checks], MERGE[status.merge]].filter(
    (icon): icon is StatusIcon => icon !== null,
  );
  return (
    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
      {icons.map((icon) => (
        <IconWithTooltip key={icon.label} theme={theme} icon={icon} color={colors[icon.tone]} />
      ))}
    </View>
  );
}

function IconWithTooltip({ theme, icon, color }: { theme: PluginTheme; icon: StatusIcon; color: string }) {
  const [shown, setShown] = useState(false);
  return (
    <Pressable
      accessibilityLabel={icon.label}
      onHoverIn={() => setShown(true)}
      onHoverOut={() => setShown(false)}
      onPress={() => setShown((current) => !current)}
      style={{ position: "relative" }}
    >
      <Icon name={icon.icon} size={14} color={color} />
      {shown && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -5,
            left: 20,
            zIndex: 10,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surface2,
          }}
        >
          <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 12, whiteSpace: "nowrap" } as object}>
            {icon.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
