export function speechPatch(previous: string, next: string): { from: number; delta: string } | null {
  let from = 0;
  while (from < previous.length && from < next.length && previous[from] === next[from]) from++;
  return from === previous.length && from === next.length ? null : { from, delta: next.slice(from) };
}
