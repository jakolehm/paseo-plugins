const PR_URL = /github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/i;
const PR_SHORT = /^([\w.-]+\/[\w.-]+)#(\d+)$/;

export function parsePrRef(text: string): { repo: string; number: number } | null {
  const match = PR_URL.exec(text.trim()) ?? PR_SHORT.exec(text.trim());
  return match ? { repo: match[1], number: Number(match[2]) } : null;
}
