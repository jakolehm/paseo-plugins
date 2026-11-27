import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { Icon, Loading, ScrollView, SettingsCard, SettingsRow, SettingsSection } from "@getpaseo/plugin/client/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { formatTokens } from "../shared/tokens";
import { checkNowRpc, dismissRpc, restoreAgentRpc, type Dashboard, type PrRow, type QualityCounts, type ReviewerStatus } from "../shared/dashboard";
import { Button } from "./button";
import { NextCheck } from "./next-check";
import { ReviewNowDialog, type PrRef } from "./review-now-dialog";
import { StatusIcons } from "./status-icons";
import { DASHBOARD_QUERY_KEY, useDashboard } from "./use-dashboard";
import { useReviewerManager } from "./use-reviewer-manager";

type ReviewerManager = ReturnType<typeof useReviewerManager>;

type OpenAgent = (agentId: string) => void;
type Styles = ReturnType<typeof createStyles>;
type StartReview = (target: PrRef | null) => void;
interface Screen {
  theme: PluginTheme;
  styles: Styles;
  openAgent?: OpenAgent;
  startReview: StartReview;
  reviewerColors: Map<string, string>;
  twoColumns: boolean;
}

const ScreenContext = createContext<Screen | null>(null);

function useScreen() {
  const value = useContext(ScreenContext);
  if (!value) throw new Error("ReviewsScreen context is missing");
  return value;
}

const TWO_COLUMNS_MIN_WIDTH = 1100;

export function ReviewsScreen({ theme, layout, navigation }: PluginScreenProps) {
  const [reviewTarget, setReviewTarget] = useState<{ target: PrRef | null } | null>(null);
  const [width, setWidth] = useState(0);
  const twoColumns = !layout.compact && width >= TWO_COLUMNS_MIN_WIDTH;
  const dashboard = useDashboard();
  const reviewers = dashboard?.reviewers;
  const value = useMemo(
    () => ({
      theme,
      styles: createStyles(theme, layout.compact, twoColumns),
      openAgent: navigation ? (agentId: string) => navigation.openAgent({ agentId }) : undefined,
      startReview: (target: PrRef | null) => setReviewTarget({ target }),
      reviewerColors: new Map((reviewers ?? []).map((reviewer) => [reviewer.id, reviewer.color])),
      twoColumns,
    }),
    [theme, layout.compact, twoColumns, navigation, reviewers],
  );
  const queryClient = useQueryClient();
  const manager = useReviewerManager(theme, () => void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }));
  if (!dashboard) return <Loading />;

  return (
    <ScreenContext.Provider value={value}>
      <ScrollView
        style={value.styles.screen}
        contentContainerStyle={value.styles.content}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      >
        <View style={value.styles.columns}>
          <View style={value.styles.side}>
            <AutomationStatus
              reviewers={dashboard.reviewers}
              usageHold={dashboard.usageHold}
              reviewAccounts={dashboard.reviewAccounts}
              syncedAt={dashboard.syncedAt}
              nextCheck={dashboard.nextCheck}
            />
            {dashboard.error && <Text style={value.styles.error}>GitHub sync failed: {dashboard.error}</Text>}
            <RecentStats stats={dashboard.recentStats} />
            <ReviewQuality quality={dashboard.quality} />
            {twoColumns && <Reviewers reviewers={dashboard.reviewers} manager={manager} />}
          </View>
          <View style={value.styles.main}>
            <ActionNeeded groups={dashboard.actionNeeded} />
            <PrSection title="In progress" rows={dashboard.inProgress} />
            <PrSection title="Waiting on others" rows={dashboard.waitingOnOthers} />
            <PrSection title="Reviewed in the last 24 hours" rows={dashboard.recentlyDone} />
            {!twoColumns && <Reviewers reviewers={dashboard.reviewers} manager={manager} />}
          </View>
        </View>
      </ScrollView>
      {manager.editor}
      {reviewTarget && (
        <ReviewNowDialog
          theme={theme}
          reviewers={dashboard.reviewers}
          target={reviewTarget.target}
          onStarted={() => void queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY })}
          onClose={() => setReviewTarget(null)}
        />
      )}
    </ScreenContext.Provider>
  );
}

function AutomationStatus({
  reviewers,
  usageHold,
  reviewAccounts,
  syncedAt,
  nextCheck,
}: {
  reviewers: ReviewerStatus[];
  usageHold: string | null;
  reviewAccounts: string[];
  syncedAt: string | null;
  nextCheck: Dashboard["nextCheck"];
}) {
  const { theme, styles } = useScreen();
  const checkNow = useDashboardMutation(useRpc(checkNowRpc));
  const active = reviewers.filter((reviewer) => reviewer.enabled && reviewer.repos.length > 0);
  const holding = active.length > 0 && usageHold;
  const headline =
    active.length === 0
      ? "Automatic reviews are off. Add or resume a reviewer below. This page still shows what waits on you on GitHub."
      : holding
        ? `New automatic reviews wait: ${usageHold}. Running and manual reviews continue.`
        : "Automatic reviews are on.";
  return (
    <View style={styles.status}>
      <Icon
        name={active.length === 0 ? "CirclePause" : holding ? "Gauge" : "CirclePlay"}
        size={16}
        color={active.length === 0 ? theme.colors.foregroundMuted : holding ? theme.colors.statusWarning : theme.colors.statusSuccess}
      />
      <View style={styles.statusBody}>
        <Text style={styles.statusText}>{headline}</Text>
        {active.length > 0 && nextCheck && <NextCheck theme={theme} from={nextCheck.from} at={nextCheck.at} />}
        {active.length > 0 && reviewAccounts.length > 0 && (
          <Text style={styles.statusHint}>New reviews use {reviewAccounts.join(", ")} (ZeroSub).</Text>
        )}
        <Text style={styles.statusHint}>{syncedAt ? `GitHub synced ${age(syncedAt)} ago.` : "GitHub not synced yet."}</Text>
      </View>
      <IconButton icon="RefreshCw" label="Check GitHub now" onPress={() => checkNow.mutate({})} />
    </View>
  );
}

function ActionNeeded({ groups }: { groups: Dashboard["actionNeeded"] }) {
  const { styles } = useScreen();
  const count = groups.agents.length + groups.reviews.length + groups.ownPullRequests.length;
  const parts = [
    { title: "Review agents", rows: groups.agents },
    { title: "Your review", rows: groups.reviews },
    { title: "Your PRs", rows: groups.ownPullRequests },
  ].filter((part) => part.rows.length > 0);
  if (count === 0) return <PrSection title="Action needed" rows={[]} empty="Nothing waits on you." />;
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>Action needed ({count})</Text>
      {parts.map((part) => (
        <PrSection key={part.title} title={part.title} rows={part.rows} highlight />
      ))}
    </View>
  );
}

function count(value: number, noun: string) {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}

function RecentStats({ stats }: { stats: Dashboard["recentStats"] }) {
  const { styles } = useScreen();
  const totals = [count(stats.reviews, "review"), count(stats.pullRequests, "PR"), `${stats.approved} approved`, count(stats.findings, "finding")];
  return (
    <View style={styles.stats}>
      <Text style={styles.statusText}>Last 24 hours</Text>
      <BarChart
        title="Reviews"
        summary={totals.join(" · ")}
        values={stats.hourly}
        describe={(index) => `${hourLabel(stats.hourly.length - 1 - index)}: ${count(stats.hourly[index], "review")}`}
      />
      <BarChart
        title="Tokens"
        summary={`${formatTokens(stats.tokens)} tokens`}
        values={stats.hourlyTokens}
        describe={(index) => `${hourLabel(stats.hourlyTokens.length - 1 - index)}: ${formatTokens(stats.hourlyTokens[index])} tokens`}
      />
      <View style={styles.chartAxis}>
        <Text style={styles.statusHint}>24 h ago</Text>
        <Text style={styles.statusHint}>Now</Text>
      </View>
    </View>
  );
}

const RELIABLE_FIRST_REVIEWS = 5;

function findingsPerPr({ findings, firstReviews }: QualityCounts) {
  return findings / firstReviews;
}

function percent(value: number, total: number) {
  return `${Math.round((100 * value) / total)}%`;
}

// Only a first review sees the whole PR, so only first reviews compare PRs with each other.
function ReviewQuality({ quality }: { quality: Dashboard["quality"] }) {
  const { styles } = useScreen();
  const { total, repos } = quality;
  if (total.firstReviews === 0) return null;
  const worst = Math.max(...repos.map(findingsPerPr));
  return (
    <View style={styles.stats}>
      <Text style={styles.statusText}>PR quality · first reviews</Text>
      <Text style={styles.statusHint}>Last 24 hours</Text>
      <View style={styles.qualityHeadline}>
        <Text style={styles.qualityNumber}>{findingsPerPr(total).toFixed(1)}</Text>
        <Text style={styles.statusHint}>findings per PR (lower is better)</Text>
      </View>
      <Text style={styles.statusHint}>
        {percent(total.approved, total.firstReviews)} approved at once · {percent(total.clean, total.firstReviews)} with no findings · {count(total.firstReviews, "PR")}
      </Text>
      {total.firstReviews < RELIABLE_FIRST_REVIEWS && <Text style={styles.statusHint}>Too few PRs for a reliable number.</Text>}
      <DailyQuality daily={quality.daily} />
      {repos.length > 1 && (
        <View style={styles.chartBlock}>
          <Text style={styles.statusHint}>Findings per PR, by repo</Text>
          {repos.map((repo) => (
            <View key={repo.repo} style={styles.qualityRow}>
              <Text style={styles.qualityRepo} numberOfLines={1}>
                {repo.repo.split("/")[1]}
              </Text>
              <View style={styles.qualityTrack}>
                <View style={[styles.qualityBar, { width: `${worst > 0 ? (findingsPerPr(repo) / worst) * 100 : 0}%` as const }]} />
              </View>
              <Text style={styles.qualityValue}>
                {findingsPerPr(repo).toFixed(1)} · {count(repo.firstReviews, "PR")}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function hourLabel(hoursAgo: number) {
  return hoursAgo === 0 ? "Last hour" : `${hoursAgo} h ago`;
}

function DailyQuality({ daily }: { daily: Dashboard["quality"]["daily"] }) {
  const { styles } = useScreen();
  const describe = (index: number) => {
    const day = daily[index];
    if (day.firstReviews === 0) return `${day.date}: no first reviews`;
    return `${day.date}: ${findingsPerPr(day).toFixed(1)} findings per PR · ${count(day.firstReviews, "PR")} · ${percent(day.approved, day.firstReviews)} approved at once`;
  };
  const values = daily.map((day) => (day.firstReviews > 0 ? findingsPerPr(day) : 0));
  return (
    <>
      <BarChart
        title="Each day (UTC)"
        summary={`max ${Math.max(...values).toFixed(1)} · pale = fewer than ${RELIABLE_FIRST_REVIEWS} PRs`}
        values={values}
        describe={describe}
        faded={(index) => daily[index].firstReviews < RELIABLE_FIRST_REVIEWS}
      />
      <View style={styles.chartAxis}>
        <Text style={styles.statusHint}>{daily[0].date}</Text>
        <Text style={styles.statusHint}>Today</Text>
      </View>
    </>
  );
}

// One bar for each value, oldest at the left. Hovering a bar shows its description instead of the summary.
function BarChart({
  title,
  summary,
  values,
  describe,
  faded = () => false,
}: {
  title: string;
  summary: string;
  values: number[];
  describe: (index: number) => string;
  faded?: (index: number) => boolean;
}) {
  const { styles } = useScreen();
  const [hovered, setHovered] = useState<number | null>(null);
  const highest = Math.max(1, ...values);
  const label = hovered === null ? summary : describe(hovered);
  return (
    <View style={styles.chartBlock}>
      <Text style={styles.statusHint}>
        {title}: {label}
      </Text>
      <View style={styles.chart} accessibilityLabel={`${title}, oldest first: ${values.map((_, index) => describe(index)).join(", ")}`}>
        {values.map((value, index) => (
          <Pressable
            key={index}
            style={styles.chartSlot}
            onHoverIn={() => setHovered(index)}
            onHoverOut={() => setHovered(null)}
            onPressIn={() => setHovered(index)}
            onPressOut={() => setHovered(null)}
          >
            <View
              style={[
                value > 0 ? styles.chartBar : styles.chartEmpty,
                value > 0 && { height: `${(value / highest) * 100}%` as const },
                faded(index) && styles.chartFaded,
                hovered === index && styles.chartHover,
              ]}
            />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function PrSection({
  title,
  rows,
  empty,
  highlight = false,
}: {
  title: string;
  rows: PrRow[];
  empty?: string;
  highlight?: boolean;
}) {
  const { styles } = useScreen();
  if (rows.length === 0 && !empty) return null;
  const mostTokens = Math.max(0, ...rows.map((row) => row.tokens ?? 0));
  return (
    <SettingsSection title={title}>
      <View style={highlight && rows.length > 0 ? styles.highlight : undefined}>
        <SettingsCard>
          {rows.length === 0 && empty && <SettingsRow label={empty} />}
          {rows.map((row, index) => (
            <PullRequestRow key={row.key} row={row} first={index === 0} mostTokens={mostTokens} />
          ))}
        </SettingsCard>
      </View>
    </SettingsSection>
  );
}

function PullRequestRow({ row, first, mostTokens }: { row: PrRow; first: boolean; mostTokens: number }) {
  const { theme, styles, openAgent } = useScreen();
  const restore = useDashboardMutation(useRpc(restoreAgentRpc));
  const opensAgent = Boolean(row.agentId && openAgent);
  const open = async () => {
    if (!opensAgent) return void openExternalUrl(row.url);
    if (row.archived) await restore.mutateAsync({ agentId: row.agentId! }).catch(() => undefined);
    openAgent!(row.agentId!);
  };
  return (
    <View style={[styles.row, !first && styles.rowDivider]}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={opensAgent ? `Open the review agent for ${row.repo}#${row.number}` : `Open ${row.repo}#${row.number} on GitHub`}
        onPress={open}
        style={({ pressed }) => [styles.rowMain, pressed && styles.rowPressed]}
      >
        <View style={styles.rowTitleLine}>
          {row.status && <StatusIcons theme={theme} status={row.status} />}
          <Text style={styles.rowTitle}>{row.title}</Text>
        </View>
        <Text style={styles.rowHint}>{describe(row)}</Text>
      </Pressable>
      <View style={styles.actions}>
        {row.tokens ? <TokenMeter tokens={row.tokens} most={mostTokens} /> : <View style={styles.tokenMeter} />}
        <ReviewerBadge name={row.reviewer} reviewerId={row.reviewerId} />
        <RowActions row={row} />
      </View>
    </View>
  );
}

// The bar compares the review with the largest one in the same list.
function TokenMeter({ tokens, most }: { tokens: number; most: number }) {
  const { styles } = useScreen();
  return (
    <View style={styles.tokenMeter} accessibilityLabel={`${formatTokens(tokens)} tokens`}>
      <Text style={styles.tokenText}>{formatTokens(tokens)}</Text>
      <View style={styles.tokenTrack}>
        <View style={[styles.tokenFill, { width: `${Math.max(4, (tokens / Math.max(most, 1)) * 100)}%` as const }]} />
      </View>
    </View>
  );
}

function ReviewerBadge({ name, reviewerId }: { name: string | null; reviewerId: string | null }) {
  const { theme, styles, reviewerColors } = useScreen();
  const color = (reviewerId && reviewerColors.get(reviewerId)) || theme.colors.accent;
  return (
    <View style={[styles.badge, name ? { borderColor: color, backgroundColor: `${color}22` } : { borderColor: theme.colors.border }]}>
      <Icon name={name ? "Bot" : "BotOff"} size={12} color={name ? color : theme.colors.foregroundMuted} />
      <Text style={[styles.badgeText, { color: name ? theme.colors.foreground : theme.colors.foregroundMuted }]}>
        {name ?? "No reviewer"}
      </Text>
    </View>
  );
}

function RowActions({ row }: { row: PrRow }) {
  const { startReview } = useScreen();
  const dismiss = useDashboardMutation(useRpc(dismissRpc));
  return (
    <>
      <IconButton icon="Play" label="Review now" onPress={() => startReview({ repo: row.repo, number: row.number, reviewerId: row.reviewerId })} />
      <IconButton icon="ExternalLink" label="Open on GitHub" onPress={() => openExternalUrl(row.url)} />
      {row.dismissible && <IconButton icon="X" label="Dismiss" onPress={() => dismiss.mutate({ key: row.key })} />}
    </>
  );
}

function Reviewers({ reviewers, manager }: { reviewers: ReviewerStatus[]; manager: ReviewerManager }) {
  const { theme, startReview, twoColumns } = useScreen();
  return (
    <SettingsSection
      title="Reviewers"
      trailing={
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button theme={theme} label="Review a PR" onPress={() => startReview(null)} />
          <Button theme={theme} label="Add reviewer" onPress={manager.addReviewer} />
        </View>
      }
    >
      <SettingsCard>
        {reviewers.length === 0 && <SettingsRow label="No reviewers" hint="Add a reviewer to start automatic reviews." />}
        {reviewers.map((reviewer) => (
          <SettingsRow
            key={reviewer.id}
            label={reviewer.enabled ? reviewer.name : `${reviewer.name} (paused)`}
            hint={describeReviewer(reviewer, twoColumns)}
            error={reviewer.error}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Icon name="Bot" size={16} color={reviewer.color} />
              <IconButton
                icon={reviewer.enabled ? "Pause" : "Play"}
                label={reviewer.enabled ? `Pause ${reviewer.name}` : `Resume ${reviewer.name}`}
                onPress={() => manager.setEnabled(reviewer.id, !reviewer.enabled)}
              />
              <IconButton icon="Pencil" label={`Edit ${reviewer.name}`} onPress={() => manager.editReviewer(reviewer.id)} />
            </View>
          </SettingsRow>
        ))}
      </SettingsCard>
    </SettingsSection>
  );
}

function IconButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const { theme, styles } = useScreen();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
    >
      <Icon name={icon} size={16} color={theme.colors.foregroundMuted} />
    </Pressable>
  );
}

function useDashboardMutation<Input>(call: (input: Input) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSettled: () => queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEY }),
  });
}

function describe(row: PrRow) {
  return [`${row.repo}#${row.number}`, row.reason, row.author && `by ${row.author}`, `${age(row.at)} ago`].filter(Boolean).join(" · ");
}

function describeReviewer(reviewer: ReviewerStatus, showSkipped: boolean) {
  const repos = reviewer.repos
    .map(({ repo, checkout }) => {
      const name = repo.split("/")[1] ?? repo;
      return checkout ? name : `${name} (no local project)`;
    })
    .join(", ");
  const skipped = showSkipped && reviewer.skipped ? ` ${reviewer.skipped}` : "";
  const check = reviewer.lastPollAt ? `${reviewer.lastResult} · checked ${age(reviewer.lastPollAt)} ago.${skipped}` : "Not checked yet.";
  return `${repos || "No repos"} · ${reviewer.enabled ? check : "Paused."}`;
}

function age(iso: string) {
  const minutes = Math.round(Math.abs(Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "less than 1 min";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function createStyles(theme: PluginTheme, compact: boolean, twoColumns: boolean) {
  const { colors } = theme;
  return {
    screen: { flex: 1, backgroundColor: colors.surface0 },
    content: { padding: compact ? 16 : 32, alignItems: twoColumns ? ("flex-start" as const) : ("center" as const) },
    columns: {
      width: "100%" as const,
      maxWidth: twoColumns ? 1800 : 840,
      flexDirection: twoColumns ? ("row-reverse" as const) : ("column" as const),
      alignItems: "flex-start" as const,
      gap: twoColumns ? 32 : 24,
    },
    side: { width: twoColumns ? 380 : ("100%" as const), gap: 24 },
    main: { flex: twoColumns ? 1 : undefined, width: twoColumns ? undefined : ("100%" as const), minWidth: 0, gap: 24 },
    actions: { flexDirection: "row" as const, alignItems: "center" as const, alignSelf: "flex-end" as const, gap: 4 },
    highlight: { borderLeftWidth: 3, borderLeftColor: colors.statusWarning, borderRadius: 8, paddingLeft: 4 },
    error: { color: colors.statusDanger, fontSize: 13 },
    group: { gap: 12 },
    row: {
      flexDirection: compact ? ("column" as const) : ("row" as const),
      alignItems: compact ? ("stretch" as const) : ("center" as const),
      gap: compact ? 8 : 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
    rowMain: { flex: 1, gap: 4, borderRadius: 6 },
    rowPressed: { opacity: 0.6 },
    rowTitleLine: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    rowTitle: { color: colors.foreground, fontSize: 14, flexShrink: 1 },
    rowHint: { color: colors.foregroundMuted, fontSize: 13 },
    groupTitle: { color: colors.foreground, fontSize: 15, fontWeight: "600" as const },
    badge: {
      flexDirection: "row" as const,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      minWidth: 88,
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      marginRight: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    badgeText: { fontSize: 12 },
    tokenMeter: { width: 56, gap: 3, marginRight: 12, alignItems: "flex-end" as const },
    tokenText: { color: colors.foregroundMuted, fontSize: 12, fontVariant: ["tabular-nums" as const] },
    tokenTrack: { width: "100%" as const, height: 4, borderRadius: 2, backgroundColor: colors.border, overflow: "hidden" as const },
    tokenFill: { height: "100%" as const, borderRadius: 2, backgroundColor: colors.accent },
    status: {
      flexDirection: "row" as const,
      alignItems: "flex-start" as const,
      gap: 8,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface1,
    },
    statusBody: { flex: 1, gap: 4 },
    statusText: { color: colors.foreground, fontSize: 13 },
    statusHint: { color: colors.foregroundMuted, fontSize: 12 },
    stats: { gap: 6, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface1 },
    chartBlock: { gap: 4, marginTop: 4 },
    chart: { flexDirection: "row" as const, alignItems: "flex-end" as const, height: 48, gap: 2 },
    chartSlot: { flex: 1, height: "100%" as const, justifyContent: "flex-end" as const },
    chartBar: { backgroundColor: colors.accent, borderTopLeftRadius: 2, borderTopRightRadius: 2, minHeight: 2 },
    chartEmpty: { backgroundColor: colors.border, height: 1 },
    chartHover: { opacity: 0.6 },
    chartFaded: { opacity: 0.35 },
    chartAxis: { flexDirection: "row" as const, justifyContent: "space-between" as const },
    qualityHeadline: { flexDirection: "row" as const, alignItems: "baseline" as const, gap: 8 },
    qualityNumber: { color: colors.foreground, fontSize: 28, fontWeight: "600" as const },
    qualityRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
    qualityRepo: { color: colors.foregroundMuted, fontSize: 12, width: 120 },
    qualityTrack: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
    qualityBar: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
    qualityValue: { color: colors.foregroundMuted, fontSize: 12, width: 80, textAlign: "right" as const },
    iconButton: { padding: 6, borderRadius: 6 },
    iconButtonPressed: { backgroundColor: colors.surface2 },
  };
}
