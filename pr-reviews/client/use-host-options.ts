import { usePaseo } from "@getpaseo/plugin/client";
import { useQuery } from "@tanstack/react-query";
import { githubProjects, type GitHubProject } from "../shared/github-projects";

interface Choice {
  id: string;
  label: string;
}

export interface AgentProviderOption extends Choice {
  models: Choice[];
  modes: Choice[];
}

export function useGitHubProjects(): GitHubProject[] | undefined {
  const paseo = usePaseo();
  const { data } = useQuery({
    queryKey: ["pr-reviews", "projects"],
    queryFn: async () => (await githubProjects(paseo)).sort((a, b) => a.repo.localeCompare(b.repo)),
  });
  return data;
}

export function useAgentProviders(): AgentProviderOption[] | undefined {
  const paseo = usePaseo();
  const { data } = useQuery({
    queryKey: ["pr-reviews", "providers"],
    queryFn: async () => {
      const { entries } = await paseo.providers.snapshot();
      return entries
        .filter((entry) => entry.enabled && entry.status === "ready")
        .map((entry) => ({
          id: entry.provider,
          label: entry.label ?? entry.provider,
          models: (entry.models ?? []).filter((model) => model.isSelectable !== false).map(({ id, label }) => ({ id, label })),
          modes: (entry.modes ?? []).map(({ id, label }) => ({ id, label })),
        }));
    },
  });
  return data;
}
