import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon, SidebarRow, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef } from "react";
import type { Forward } from "../shared/forwards";
import { hasPortConflict, useForwards } from "./use-forwards";

export function ForwardsSidebarItem({ theme, currentScreen, openScreen }: PluginSidebarItemProps) {
  const conflicts = (useForwards() ?? []).filter(hasPortConflict);
  useConflictToasts(conflicts);
  return (
    <SidebarRow
      icon="Cable"
      active={currentScreen?.screenId === "forwards"}
      onPress={() => openScreen({ screenId: "forwards" })}
      trailing={
        conflicts.length > 0 && (
          <Icon name="TriangleAlert" size={14} color={theme.colors.statusWarning} />
        )
      }
    />
  );
}

function useConflictToasts(conflicts: Forward[]) {
  const toast = useToast();
  const announced = useRef(new Set<string>());
  useEffect(() => {
    for (const conflict of conflicts) {
      if (announced.current.has(conflict.id)) continue;
      announced.current.add(conflict.id);
      toast.show(
        `Local port ${conflict.remotePort} is in use. ${conflict.hostLabel}:${conflict.remotePort} is on localhost:${conflict.localPort}.`,
        { variant: "warning" },
      );
    }
  }, [conflicts, toast]);
}
