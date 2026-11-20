import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { dashboardRpc, type Dashboard } from "../shared/dashboard";

export const DASHBOARD_QUERY_KEY = ["pr-reviews", "dashboard"];
const DASHBOARD_REFRESH_MS = 15_000;

export function useDashboard(): Dashboard | undefined {
  const getDashboard = useRpc(dashboardRpc);
  const { data } = useQuery({
    queryKey: DASHBOARD_QUERY_KEY,
    queryFn: () => getDashboard({}),
    refetchInterval: DASHBOARD_REFRESH_MS,
  });
  return data;
}
