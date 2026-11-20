import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text } from "react-native";

type Variant = "primary" | "secondary" | "danger";

export function Button({
  theme,
  label,
  variant = "secondary",
  disabled = false,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  variant?: Variant;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = theme;
  const primary = variant === "primary";
  const textColor = primary ? colors.accentForeground : variant === "danger" ? colors.statusDanger : colors.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.accent : pressed ? colors.surface2 : "transparent",
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Text style={{ color: textColor, fontSize: 13, fontWeight: "500" }}>{label}</Text>
    </Pressable>
  );
}
