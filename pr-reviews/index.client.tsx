import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReviewersSettings } from "./client/reviewers-settings";
import { ReviewsScreen } from "./client/reviews-screen";
import { ReviewsSidebarItem } from "./client/reviews-sidebar-item";

export default function contribute(client: PluginClientContext) {
  client.addScreen({ id: "reviews", title: "Reviews", Component: ReviewsScreen });
  client.addSidebarHeaderItem({ id: "reviews", title: "Reviews", Component: ReviewsSidebarItem });
  client.addSettingsScreen({ id: "reviewers", title: "PR reviews", icon: "GitPullRequest", Component: ReviewersSettings });
  return () => {};
}
