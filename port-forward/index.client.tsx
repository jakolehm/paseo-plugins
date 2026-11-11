import type { PluginClientContext } from "@getpaseo/plugin/client";
import { AutoForwardSettings } from "./client/auto-forward-settings";
import { ForwardsScreen } from "./client/forwards-screen";
import { ForwardsSidebarItem } from "./client/forwards-sidebar-item";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "forwards", title: "Port forwards", Component: ForwardsScreen });
  client.addSidebarHeaderItem({ id: "forwards", title: "Port forwards", Component: ForwardsSidebarItem });
  client.addSettingsScreen({ id: "auto-forward", title: "Port forward", icon: "Cable", Component: AutoForwardSettings });
  return () => {};
}
