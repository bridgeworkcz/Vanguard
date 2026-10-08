/** Address the browser can request. Never a Google host. */
export function siteFileUrl(kind: "team" | "gallery", id: string, stored: string): string {
  if (!stored) return "";
  const version = stored.includes("#") ? stored.slice(stored.lastIndexOf("#") + 1) : "";
  const plain = stored.split("#")[0] || "";
  if (plain.startsWith("/") || plain.startsWith("data:") || plain.startsWith("http://") || plain.startsWith("https://")) {
    if (!version || !plain.startsWith("/")) return plain;
    return `${plain}${plain.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
  }
  const drive = storedDriveId(stored);
  const stamp = version || (drive ? drive.slice(-12) : "0");
  return `/files/${kind}/${encodeURIComponent(id)}?v=${encodeURIComponent(stamp)}`;
}

export function storedDriveId(stored: string): string {
  const clean = (stored.split("#")[0] || "").trim();
  if (!clean || clean.startsWith("/") || clean.startsWith("data:")) return "";
  if (clean.startsWith("file:")) return clean.slice(5);
  const fromQuery = clean.match(/[?&]id=([^&]+)/);
  if (fromQuery?.[1]) return decodeURIComponent(fromQuery[1]);
  const fromPath = clean.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fromPath?.[1]) return fromPath[1];
  if (!clean.includes("/") && !clean.includes(" ") && !clean.includes("google")) return clean;
  return "";
}