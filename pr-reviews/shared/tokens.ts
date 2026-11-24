export function formatTokens(tokens: number) {
  if (tokens < 1_000) return `${tokens}`;
  // Up from 999,500, the thousands round to 1000k, so those show as millions.
  if (tokens < 999_500) return `${round(tokens / 1_000)}k`;
  return `${round(tokens / 1_000_000)}M`;
}

function round(value: number) {
  return value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value).toString();
}
