export type PortRange = readonly [min: number, max: number];

export const PORT_RANGES_HINT = 'Use ports and ranges, for example "3000-3999, 5173"';

export function parsePortRanges(text: string): PortRange[] | null {
  const ranges: PortRange[] = [];
  for (const part of text.split(",").map((value) => value.trim()).filter(Boolean)) {
    const bounds = part.split("-").map((value) => Number(value.trim()));
    const [min, max = min] = bounds;
    if (bounds.length > 2 || !isPort(min) || !isPort(max) || min > max) return null;
    ranges.push([min, max]);
  }
  return ranges;
}

export function inPortRanges(ranges: readonly PortRange[], port: number) {
  return ranges.some(([min, max]) => port >= min && port <= max);
}

export function isPort(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}
