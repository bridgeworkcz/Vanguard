const buckets = new Map<string, { n: number; reset: number }>();

/** True when this key has already been used `limit` times in the window. */
export function limited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const row = buckets.get(key);
  if (!row || row.reset <= now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 4000) {
      for (const [name, item] of buckets) {
        if (item.reset <= now) buckets.delete(name);
      }
    }
    return false;
  }
  row.n += 1;
  return row.n > limit;
}
