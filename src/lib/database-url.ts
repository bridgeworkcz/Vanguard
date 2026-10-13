/** Connection string for the office database. The Vercel store is named so its
 * variables arrive with a `database_` prefix. Prefer that store over a generic
 * `DATABASE_URL`, then fall back for local and older deploys. */
export function databaseUrl(): string | undefined {
  if (typeof process === "undefined") return undefined;
  const keys = ["database_DATABASE_URL", "DATABASE_URL", "database_POSTGRES_URL", "POSTGRES_URL"];
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** True when the office Neon store (not the throwaway preview database) is set. */
export function officeDatabase(): boolean {
  if (typeof process === "undefined") return false;
  return Boolean(process.env.database_DATABASE_URL?.trim() || process.env.database_POSTGRES_URL?.trim());
}
