import type { PaseoApi } from "@getpaseo/client";

const GITHUB_PROJECT_KEY = /^remote:github\.com\/([\w.-]+\/[\w.-]+?)(?:\.git)?$/i;

export interface GitHubProject {
  repo: string;
  path: string;
}

export async function githubProjects(paseo: PaseoApi): Promise<GitHubProject[]> {
  const { projects } = await paseo.projects.list();
  return projects.flatMap((project) => {
    const repo = GITHUB_PROJECT_KEY.exec(project.projectKey ?? "")?.[1];
    return repo && project.projectKind === "git" ? [{ repo, path: project.projectRootPath }] : [];
  });
}
