import { useRpc } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { forwardsListRpc, type Forward } from "../shared/forwards";

export const FORWARDS_QUERY_KEY = ["port-forward", "forwards"];
const FORWARDS_REFRESH_MS = 3000;

export function useForwards(): Forward[] | undefined {
  const listForwards = useRpc(forwardsListRpc);
  const { data } = useQuery({
    queryKey: FORWARDS_QUERY_KEY,
    queryFn: () => listForwards({}),
    refetchInterval: FORWARDS_REFRESH_MS,
  });
  return data?.forwards;
}

export function hasPortConflict(forward: Forward) {
  return forward.localPort !== forward.remotePort;
}
