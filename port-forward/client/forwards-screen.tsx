import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { openExternalUrl, useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  Icon,
  ScrollView,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  TextInput,
} from "@getpaseo/plugin/client/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import {
  forwardStartRpc,
  forwardStopRpc,
  remoteHostsRpc,
  remotePortsRpc,
  type Forward,
  type RemoteHost,
} from "../shared/forwards";
import { inPortRanges, isPort, parsePortRanges } from "../shared/port-ranges";
import { autoForwardSettings } from "../shared/settings";
import { FORWARDS_QUERY_KEY, hasPortConflict, useForwards } from "./use-forwards";

const PORTS_REFRESH_MS = 10_000;

type Styles = ReturnType<typeof createStyles>;
const ThemeContext = createContext<{ theme: PluginTheme; styles: Styles } | null>(null);

function useStyles() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("ForwardsScreen theme is missing");
  return value;
}

export function ForwardsScreen({ theme, layout }: PluginScreenProps) {
  const value = useMemo(
    () => ({ theme, styles: createStyles(theme, layout.compact) }),
    [theme, layout.compact],
  );
  const listHosts = useRpc(remoteHostsRpc);
  const hosts = useQuery({
    queryKey: ["port-forward", "hosts"],
    queryFn: () => listHosts({}),
    refetchInterval: PORTS_REFRESH_MS,
  });
  const forwards = useForwards() ?? [];

  return (
    <ThemeContext.Provider value={value}>
      <ScrollView style={value.styles.screen} contentContainerStyle={value.styles.content}>
        <View style={value.styles.column}>
          <ActiveForwards forwards={forwards} />
          {hosts.data?.hosts.length === 0 && (
            <SettingsSection title="Remote hosts">
              <SettingsCard>
                <SettingsRow
                  label="No connected hosts"
                  hint="Add a host to this daemon with: paseo host add <connection>"
                />
              </SettingsCard>
            </SettingsSection>
          )}
          {hosts.data?.hosts.map((host) => (
            <HostPorts key={host.serverId} host={host} forwards={forwards} />
          ))}
        </View>
      </ScrollView>
    </ThemeContext.Provider>
  );
}

function ActiveForwards({ forwards }: { forwards: Forward[] }) {
  const { styles } = useStyles();
  const stopForward = useRpc(forwardStopRpc);
  const queryClient = useQueryClient();
  const stop = useMutation({
    mutationFn: stopForward,
    onSettled: () => queryClient.invalidateQueries({ queryKey: FORWARDS_QUERY_KEY }),
  });

  return (
    <SettingsSection title="Active forwards">
      <SettingsCard>
        {forwards.length === 0 && (
          <SettingsRow
            label="No active forwards"
            hint="Forward a port below, or turn on auto-forward in Settings → Port forward."
          />
        )}
        {forwards.map((forward) => (
          <SettingsRow
            key={forward.id}
            label={`localhost:${forward.localPort}`}
            hint={describe(forward)}
            error={forward.error}
          >
            <View style={styles.actions}>
              {hasPortConflict(forward) && <ConflictBadge port={forward.remotePort} />}
              <IconButton
                icon="ExternalLink"
                label={`Open localhost:${forward.localPort}`}
                onPress={() => openExternalUrl(`http://localhost:${forward.localPort}`)}
              />
              <IconButton
                icon="X"
                label={`Stop forward to ${forward.hostLabel}:${forward.remotePort}`}
                onPress={() => stop.mutate({ id: forward.id })}
              />
            </View>
          </SettingsRow>
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

function HostPorts({ host, forwards }: { host: RemoteHost; forwards: Forward[] }) {
  const { styles } = useStyles();
  const listPorts = useRpc(remotePortsRpc);
  const startForward = useRpc(forwardStartRpc);
  const queryClient = useQueryClient();
  const ports = useQuery({
    queryKey: ["port-forward", "ports", host.serverId],
    queryFn: () => listPorts({ serverId: host.serverId }),
    enabled: host.online,
    refetchInterval: PORTS_REFRESH_MS,
  });
  const start = useMutation({
    mutationFn: (remotePort: number) => startForward({ serverId: host.serverId, remotePort }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: FORWARDS_QUERY_KEY }),
  });
  const [showAll, setShowAll] = useState(false);
  const isDevPort = useDevPortFilter();
  const forwarded = new Set(
    forwards
      .filter((forward) => forward.serverId === host.serverId)
      .map((forward) => forward.remotePort),
  );
  const available = (ports.data?.ports ?? []).filter(({ port }) => !forwarded.has(port));
  const devPorts = available.filter(({ port }) => isDevPort(port));
  const otherCount = available.length - devPorts.length;
  const shown = showAll ? available : devPorts;

  return (
    <SettingsSection
      title={host.label}
      trailing={
        <Text style={host.online ? styles.online : styles.muted}>
          {host.online ? "Online" : "Offline"}
        </Text>
      }
    >
      <SettingsCard>
        {ports.error && <SettingsRow label="Cannot list ports" error={ports.error.message} />}
        {start.error && <SettingsRow label="Cannot start forward" error={start.error.message} />}
        {ports.data && shown.length === 0 && (
          <SettingsRow
            label="No new dev ports"
            hint="No unforwarded port in the auto-forward list is listening."
          />
        )}
        {shown.map(({ port, process }) => (
          <SettingsRow key={port} label={String(port)} hint={process ?? undefined}>
            <IconButton
              icon="ArrowDownToLine"
              label={`Forward port ${port}`}
              onPress={() => start.mutate(port)}
            />
          </SettingsRow>
        ))}
        {otherCount > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setShowAll(!showAll)}>
            <SettingsRow
              label={showAll ? "Show dev ports only" : `Show ${otherCount} other ports`}
              hint="Ports outside the auto-forward list, such as system services."
            />
          </Pressable>
        )}
        <ManualPortRow onForward={(port) => start.mutate(port)} />
      </SettingsCard>
    </SettingsSection>
  );
}

function useDevPortFilter() {
  const settings = useSettings(autoForwardSettings);
  const ranges = settings.status === "ready" ? parsePortRanges(settings.values.ports) : null;
  return (port: number) => (ranges ? inPortRanges(ranges, port) : true);
}

function ManualPortRow({ onForward }: { onForward: (port: number) => void }) {
  const { theme, styles } = useStyles();
  const [text, setText] = useState("");
  const port = Number(text);
  const valid = isPort(port);

  return (
    <SettingsRow label="Other port" hint="Forward a port that is not in the list.">
      <View style={styles.actions}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="3000"
          placeholderTextColor={theme.colors.foregroundMuted}
          keyboardType="number-pad"
          onSubmitEditing={() => valid && onForward(port)}
        />
        <IconButton
          icon="ArrowDownToLine"
          label="Forward port"
          disabled={!valid}
          onPress={() => onForward(port)}
        />
      </View>
    </SettingsRow>
  );
}

function ConflictBadge({ port }: { port: number }) {
  const { theme, styles } = useStyles();
  return (
    <View style={styles.badge} accessibilityLabel={`Local port ${port} is in use`}>
      <Icon name="TriangleAlert" size={12} color={theme.colors.statusWarning} />
      <Text style={styles.badgeText}>{port} in use</Text>
    </View>
  );
}

function IconButton({
  icon,
  label,
  disabled = false,
  onPress,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme, styles } = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        pressed && styles.iconButtonPressed,
        disabled && styles.disabled,
      ]}
    >
      <Icon name={icon} size={16} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function describe(forward: Forward) {
  const connections =
    forward.connections === 1 ? "1 connection" : `${forward.connections} connections`;
  return [
    `${forward.hostLabel}:${forward.remotePort}`,
    forward.auto ? "auto" : "manual",
    connections,
  ].join(" · ");
}

function createStyles(theme: PluginTheme, compact: boolean) {
  const { colors } = theme;
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 16 : 32, alignItems: "center" as const },
    column: { width: "100%" as const, maxWidth: 720, gap: 24 },
    actions: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4 },
    muted: { color: colors.foregroundMuted, fontSize: 13 },
    online: { color: colors.statusSuccess, fontSize: 13 },
    iconButton: { padding: 6, borderRadius: 6 },
    iconButtonPressed: { backgroundColor: colors.surface2 },
    disabled: { opacity: 0.4 },
    badge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginRight: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.statusWarning,
    },
    badgeText: { color: colors.statusWarning, fontSize: 12 },
    input: {
      color: colors.foreground,
      backgroundColor: colors.surface1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
      width: 80,
      fontSize: 13,
    },
  };
}
