/** Address the browser can request. Never a Google host. */
export function siteFileUrl(kind: "team" | "gallery", id: string, stored: string): string {
  if (!stored) return "";
  if (stored.startsWith("/") || stored.startsWith("data:")) return stored;
  return `/files/${kind}/${encodeURIComponent(id)}`;
}

export function storedDriveId(stored: string): string {
  if (!stored || stored.startsWith("/") || stored.startsWith("data:")) return "";
  if (stored.startsWith("file:")) return stored.slice(5);
  const fromQuery = stored.match(/[?&]id=([^&]+)/);
  if (fromQuery?.[1]) return decodeURIComponent(fromQuery[1]);
  if (!stored.includes("/") && !stored.includes(" ")) return stored;
  return "";
}
