import { homedir } from "node:os";
import { join } from "node:path";

export function pluginDataFile(name: string) {
  const home = process.env.PASEO_HOME ?? join(homedir(), ".paseo");
  return join(home, "plugin-data", "pr-reviews", name);
}
