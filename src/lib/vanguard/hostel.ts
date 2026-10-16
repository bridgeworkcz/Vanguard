/** First-month hostel, only where the employer does not house the worker.
 * The euro band is a shared room, 10–40 minutes from the plant. The local figure
 * uses a fixed rate so the pair on the card does not move every day. */
const BAND: Record<string, [number, number, string, number, number]> = {
  "Czech Republic": [380, 560, "CZK", 25, 100],
  Poland: [280, 480, "PLN", 4.3, 50],
  Germany: [450, 720, "EUR", 1, 10],
  Slovakia: [340, 480, "EUR", 1, 10],
  Hungary: [280, 420, "HUF", 400, 1000],
  Serbia: [200, 320, "RSD", 117, 500],
  Italy: [420, 650, "EUR", 1, 10],
  Portugal: [380, 560, "EUR", 1, 10],
  Bulgaria: [220, 360, "EUR", 1, 10],
  Norway: [520, 780, "NOK", 11.5, 100],
  Canada: [480, 740, "CAD", 1.5, 10],
  "New Zealand": [460, 720, "NZD", 1.8, 10],
};

export function hostelQuote(id: string, country: string): { eur: number; local: number; currency: string } {
  const band = BAND[country] || [350, 550, "EUR", 1, 10];
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (Math.imul(hash, 33) + id.charCodeAt(i)) >>> 0;
  const steps = Math.max(1, Math.round((band[1] - band[0]) / 10));
  const eur = band[0] + (hash % (steps + 1)) * 10;
  const currency = band[2];
  if (currency === "EUR") return { eur, local: eur, currency };
  const local = Math.round((eur * band[3]) / band[4]) * band[4];
  return { eur, local, currency };
}

export function hostelPriceText(eur: number, local: number, currency: string): string {
  if (!eur) return "";
  if (!currency || currency === "EUR" || !local || local === eur) return `${eur} EUR`;
  return `${local.toLocaleString("en-GB")} ${currency} · ${eur} EUR`;
}
