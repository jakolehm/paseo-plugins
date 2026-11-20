import type { PluginTheme } from "@getpaseo/plugin";
import { Icon, SettingsRow } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { REVIEWER_COLORS, type ReviewerColor } from "../shared/reviewer-colors";

interface Props {
  theme: PluginTheme;
  value: string;
  onChange(color: string): void;
}

const NAMES = Object.keys(REVIEWER_COLORS) as ReviewerColor[];

export function ColorPicker({ theme, value, onChange }: Props) {
  return (
    <SettingsRow label="Color" hint="Automatic gives a color that no other reviewer uses.">
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Swatch theme={theme} label="Automatic" selected={value === ""} onPress={() => onChange("")}>
          <Icon name="Sparkles" size={12} color={theme.colors.foregroundMuted} />
        </Swatch>
        {NAMES.map((name) => (
          <Swatch key={name} theme={theme} label={name} color={REVIEWER_COLORS[name]} selected={value === name} onPress={() => onChange(name)} />
        ))}
      </View>
    </SettingsRow>
  );
}

interface SwatchProps {
  theme: PluginTheme;
  label: string;
  color?: string;
  selected: boolean;
  onPress(): void;
  children?: ReactNode;
}

function Swatch({ theme, label, color, selected, onPress, children }: SwatchProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: color ?? theme.colors.surface2,
        borderWidth: 2,
        borderColor: selected ? theme.colors.foreground : "transparent",
      }}
    >
      {children}
    </Pressable>
  );
}
