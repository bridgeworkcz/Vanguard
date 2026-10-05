/** Address the browser can request. Never a Google host. */
export function siteFileUrl(kind: "team" | "gallery", id: string, stored: string): string {
  if (!stored) return "";
  if (stored.startsWith("/") || stored.startsWith("data:") || stored.startsWith("http://") || stored.startsWith("https://")) return stored;
  const drive = storedDriveId(stored);
  const stamp = drive ? drive.slice(-12) : "0";
  return `/files/${kind}/${encodeURIComponent(id)}?v=${encodeURIComponent(stamp)}`;
}

export function storedDriveId(stored: string): string {
  if (!stored || stored.startsWith("/") || stored.startsWith("data:")) return "";
  if (stored.startsWith("file:")) return stored.slice(5);
  const fromQuery = stored.match(/[?&]id=([^&]+)/);
  if (fromQuery?.[1]) return decodeURIComponent(fromQuery[1]);
  const fromPath = stored.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];
  if (!stored.includes("/") && !stored.includes(" ") && !stored.includes("google")) return stored;
  return "";
}
