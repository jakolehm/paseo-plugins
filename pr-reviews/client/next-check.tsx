import type { PluginTheme } from "@getpaseo/plugin";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

interface Props {
  theme: PluginTheme;
  from: string;
  at: string;
}

export function NextCheck({ theme, from, at }: Props) {
  const now = useNow();
  const next = Date.parse(at);
  const start = Date.parse(from);
  const remaining = next - now;
  const left = remaining <= 0 || next === start ? 0 : remaining / (next - start);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {remaining > 0 ? `Next check in ${countdown(remaining)}` : "Checking GitHub now…"}
      </Text>
      <View style={{ height: 3, borderRadius: 2, backgroundColor: theme.colors.surface2, overflow: "hidden" }}>
        <View
          style={{
            height: 3,
            width: `${Math.round(Math.min(1, Math.max(0, left)) * 100)}%`,
            backgroundColor: theme.colors.statusSuccess,
          }}
        />
      </View>
    </View>
  );
}

function useNow() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function countdown(ms: number) {
  const seconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min ${String(seconds % 60).padStart(2, "0")} s` : `${seconds} s`;
}
