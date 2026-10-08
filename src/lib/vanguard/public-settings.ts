import { DEFAULT_SETTINGS } from "./seed";

/** Never leave the server on the public site payload. */
const PRIVATE = new Set([
  "telegram_owner_chat",
  "telegram_staff_chat",
  "usdt_wallet",
  "subagent_rate",
]);

/** Counts only. Not identities. */
const PUBLIC_EXTRA = ["waitlist_counts"] as const;

export function toPublicSettings(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (PRIVATE.has(key)) continue;
    out[key] = map[key] ?? DEFAULT_SETTINGS[key] ?? "";
  }
  for (const key of PUBLIC_EXTRA) {
    const value = map[key];
    if (value) out[key] = value;
  }
  return out;
}

/** Admin editor. Still no OAuth secrets, tokens, or raw partner blob. */
export function toStaffSettings(map: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) out[key] = map[key] ?? "";
  if (map.price_log) out.price_log = map.price_log.slice(0, 8000);
  if (map.waitlist_counts) out.waitlist_counts = map.waitlist_counts.slice(0, 8000);
  return out;
}
