/** Small rectangular flags, drawn as stripes. Not emoji. */
const STRIPES: Record<string, string[]> = {
  Slovakia: ["#ffffff", "#0b4ea2", "#ee1c25"],
  "Czech Republic": ["#ffffff", "#d7141a", "#11457e"],
  Poland: ["#ffffff", "#dc143c"],
  Germany: ["#000000", "#dd0000", "#ffce00"],
  Hungary: ["#ce2939", "#ffffff", "#477050"],
  Portugal: ["#006600", "#ff0000"],
  Italy: ["#009246", "#ffffff", "#ce2b37"],
  Bulgaria: ["#ffffff", "#00966e", "#d62612"],
  Norway: ["#ba0c2f", "#ffffff", "#00205b"],
  Serbia: ["#c6363c", "#0c4076", "#ffffff"],
  Canada: ["#ff0000", "#ffffff", "#ff0000"],
  "New Zealand": ["#00247d", "#ffffff", "#cc142b"],
  Belarus: ["#c8313e", "#4aa35a"],
};

export function MiniFlag({ country }: { country: string }) {
  const bands = STRIPES[country] ?? ["#c6b39a", "#1a1a1a"];
  return (
    <span className="inline-flex h-3 w-5 shrink-0 overflow-hidden border border-white/20 align-middle" aria-hidden="true">
      {bands.map((color) => (
        <span key={color} className="h-full flex-1" style={{ background: color }} />
      ))}
    </span>
  );
}
