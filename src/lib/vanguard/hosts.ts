/** Origins this office actually serves. Stops a forged Host header from steering OAuth. */
export function allowedOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "";
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  const known = host === "vanguardmobility.site" || host === "www.vanguardmobility.site" || host.endsWith(".vercel.app");
  if (!local && !known) return "";
  if (url.protocol !== "https:" && !local) return "";
  return url.origin;
}
