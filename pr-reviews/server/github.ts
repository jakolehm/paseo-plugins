import { execCommand } from "@getpaseo/plugin/server";
import { type Activity, prKey, type PullRequest } from "./pull-request";

const LIST_FIELDS = `
  number title url isDraft createdAt updatedAt reviewDecision mergeable mergeStateStatus headRefOid
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
  repository { nameWithOwner }
  author { login __typename }
`;

const ACTIVITY_FIELDS = `
  updatedAt
  reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
  timelineItems(last: 1, itemTypes: [REVIEW_REQUESTED_EVENT]) { nodes { ... on ReviewRequestedEvent { createdAt } } }
  reviews(last: 30) { nodes { author { login __typename } submittedAt commit { oid } } }
  comments(last: 20) { nodes { author { login __typename } createdAt } }
  reviewThreads(first: 50) {
    nodes {
      isResolved
      first: comments(first: 1) { nodes { author { login } } }
      last: comments(last: 1) { nodes { author { login __typename } createdAt } }
    }
  }
`;

const RATE_LIMIT_FIELDS = "rateLimit { remaining resetAt }";
const ACTIVITY_BATCH = 5;

type ListNode = any;
type Activities = Pick<PullRequest, "requestedReviewers" | "requestedAt" | "reviews" | "comments" | "threads">;

export interface RateLimit {
  remaining: number;
  resetAt: string;
}

export interface Snapshot {
  repos: Map<string, PullRequest[] | Error>;
  searches: PullRequest[][];
  rateLimit: RateLimit | null;
}

export class RateLimitError extends Error {}

interface ListPage {
  nodes: ListNode[];
  rateLimit: RateLimit;
}

// Lists all PRs in one request. Reviews, comments, and threads are fetched again only for a PR that changed.
export class GitHub {
  private login: Promise<string> | null = null;
  private readonly names = new Map<string, Promise<string>>();
  private readonly activities = new Map<string, { updatedAt: string; activities: Activities }>();

  viewer(): Promise<string> {
    if (!this.login) {
      this.login = this.gh(["api", "user", "--jq", ".login"]).then((out) => out.trim());
      this.login.catch(() => (this.login = null));
    }
    return this.login;
  }

  // GitHub keeps redirects for a renamed repo. A local remote can still use the old name.
  currentName(repo: string): Promise<string> {
    const key = repo.toLowerCase();
    let name = this.names.get(key);
    if (!name) {
      name = this.gh(["api", `repos/${repo}`, "--jq", ".full_name"]).then((out) => out.trim() || repo);
      name.catch(() => this.names.delete(key));
      this.names.set(key, name);
    }
    return name;
  }

  async isOpen(repo: string, number: number) {
    return (await this.gh(["api", `repos/${repo}/pulls/${number}`, "--jq", ".state"])).trim() === "open";
  }

  // GitHub runs the parts of one query one after the other and stops after 10 seconds, so each list is its own request.
  async snapshot(repos: string[], searches: string[]): Promise<Snapshot> {
    const [repoPages, searchPages] = await Promise.all([
      Promise.all(repos.map((repo) => this.repoPage(repo).catch((error: Error) => error))),
      Promise.all(searches.map((query) => this.searchPage(query))),
    ]);
    const rateLimited = repoPages.find((page) => page instanceof RateLimitError);
    if (rateLimited) throw rateLimited;

    const pages = [...repoPages, ...searchPages].filter((page): page is ListPage => !(page instanceof Error));
    await this.refreshActivities(pages.flatMap((page) => page.nodes));
    const toPullRequests = (page: ListPage) => page.nodes.map((node) => this.toPullRequest(node));
    return {
      repos: new Map(repos.map((repo, index) => {
        const page = repoPages[index];
        return [repo.toLowerCase(), page instanceof Error ? page : toPullRequests(page)];
      })),
      searches: searchPages.map(toPullRequests),
      rateLimit: lowest(pages.map((page) => page.rateLimit)),
    };
  }

  private async repoPage(repo: string): Promise<ListPage> {
    const [owner, name] = repo.split("/");
    const data = await this.graphql(`query {
      repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
        pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) { nodes { ${LIST_FIELDS} } }
      }
      ${RATE_LIMIT_FIELDS}
    }`);
    return { nodes: data.repository.pullRequests.nodes, rateLimit: data.rateLimit };
  }

  private async searchPage(query: string): Promise<ListPage> {
    const data = await this.graphql(`query {
      search(query: ${JSON.stringify(`is:pr is:open archived:false ${query}`)}, type: ISSUE, first: 50) {
        nodes { ... on PullRequest { ${LIST_FIELDS} } }
      }
      ${RATE_LIMIT_FIELDS}
    }`);
    return { nodes: data.search.nodes.filter((node: ListNode) => node && "number" in node), rateLimit: data.rateLimit };
  }

  private async refreshActivities(nodes: ListNode[]) {
    const unique = new Map(nodes.map((node) => [nodeKey(node), node]));
    const stale = [...unique.values()].filter((node) => this.activities.get(nodeKey(node))?.updatedAt !== node.updatedAt);
    for (let start = 0; start < stale.length; start += ACTIVITY_BATCH) {
      const batch = stale.slice(start, start + ACTIVITY_BATCH);
      const fields = batch.map((node, index) => {
        const [owner, name] = node.repository.nameWithOwner.split("/");
        return `p${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          pullRequest(number: ${Number(node.number)}) { ${ACTIVITY_FIELDS} }
        }`;
      });
      const data = await this.graphql(`query { ${fields.join("\n")} }`);
      batch.forEach((node, index) => {
        const detail = data[`p${index}`]?.pullRequest;
        if (!detail) throw new Error(`no reviews and comments for ${nodeKey(node)}`);
        this.activities.set(nodeKey(node), { updatedAt: node.updatedAt, activities: toActivities(detail) });
      });
    }
  }

  private toPullRequest(node: ListNode): PullRequest {
    const { activities } = this.activities.get(nodeKey(node))!;
    return {
      repo: node.repository.nameWithOwner,
      number: node.number,
      title: node.title,
      url: node.url,
      author: node.author?.login ?? "ghost",
      authorIsBot: node.author?.__typename === "Bot",
      isDraft: node.isDraft,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      reviewDecision: node.reviewDecision ?? null,
      mergeable: node.mergeable ?? null,
      mergeState: node.mergeStateStatus ?? null,
      checks: node.commits.nodes[0]?.commit.statusCheckRollup?.state ?? null,
      head: node.headRefOid,
      ...activities,
    };
  }

  private async graphql(query: string): Promise<any> {
    let response: any;
    try {
      response = JSON.parse(await this.gh(["api", "graphql", "-f", `query=${query}`]));
    } catch (error) {
      response = parseResponse((error as { stdout?: string }).stdout);
      if (!response?.errors?.length) throw error;
    }
    const message = response.errors?.[0]?.message;
    if (message) throw /rate limit/i.test(message) ? new RateLimitError(message) : new Error(message);
    return response.data;
  }

  private async gh(args: string[]) {
    try {
      const { stdout } = await execCommand("gh", args, { maxBuffer: 32 * 1024 * 1024, timeout: 60_000 });
      return stdout;
    } catch (error) {
      throw Object.assign(shortError(error), { stdout: (error as { stdout?: string }).stdout });
    }
  }
}

function shortError(error: unknown) {
  const stderr = (error as { stderr?: string }).stderr ?? "";
  const line = stderr.trim().split("\n").filter(Boolean).at(-1)?.replace(/^gh: /, "");
  const message = line || (error instanceof Error ? error.message.split("\n")[0] : String(error));
  return /rate limit/i.test(message) ? new RateLimitError(message) : new Error(message);
}

function lowest(limits: RateLimit[]) {
  return limits.reduce<RateLimit | null>((low, limit) => (low && low.remaining <= limit.remaining ? low : limit), null);
}

function parseResponse(stdout: string | undefined) {
  try {
    return stdout ? JSON.parse(stdout) : null;
  } catch {
    return null;
  }
}

function nodeKey(node: ListNode) {
  return prKey(node.repository.nameWithOwner, node.number);
}

function toActivities(node: any): Activities {
  return {
    requestedReviewers: node.reviewRequests.nodes.flatMap((request: any) =>
      request.requestedReviewer?.login ? [request.requestedReviewer.login] : [],
    ),
    requestedAt: node.timelineItems.nodes[0]?.createdAt ?? null,
    reviews: node.reviews.nodes.flatMap((review: any) =>
      review.submittedAt ? [{ ...toActivity(review.author, review.submittedAt), commit: review.commit?.oid ?? null }] : [],
    ),
    comments: node.comments.nodes.map((comment: any) => toActivity(comment.author, comment.createdAt)),
    threads: node.reviewThreads.nodes.map((thread: any) => {
      const last = thread.last.nodes[0];
      return {
        resolved: thread.isResolved,
        starter: thread.first.nodes[0]?.author?.login ?? null,
        last: last ? toActivity(last.author, last.createdAt) : null,
      };
    }),
  };
}

function toActivity(author: any, at: string): Activity {
  return { author: author?.login ?? "ghost", isBot: author?.__typename === "Bot", at };
}
