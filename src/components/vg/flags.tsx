import { useId, type ReactNode } from "react";

/** Small flags in their real proportions. Stripes follow the hoist, not a generic column. */
function Flag({ box, children }: { box: string; children: ReactNode }) {
  const [, , w, h] = box.split(" ").map(Number);
  return (
    <svg viewBox={box} width={w} height={h} className="inline-block h-4 w-auto shrink-0 overflow-hidden border border-white/20 align-middle" aria-hidden="true">
      {children}
    </svg>
  );
}

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const len = i % 2 === 0 ? r : r * 0.38;
    pts.push(`${(cx + Math.cos(angle) * len).toFixed(2)},${(cy + Math.sin(angle) * len).toFixed(2)}`);
  }
  return pts.join(" ");
}

function H({ colors, box }: { colors: string[]; box: string }) {
  const h = Number(box.split(" ")[3]);
  const band = h / colors.length;
  return (
    <Flag box={box}>
      {colors.map((color, i) => (
        <rect key={color} y={i * band} width="100%" height={band} fill={color} />
      ))}
    </Flag>
  );
}

function V({ colors, box, widths }: { colors: string[]; box: string; widths?: number[] }) {
  const w = Number(box.split(" ")[2]);
  const parts = widths ?? colors.map(() => w / colors.length);
  let x = 0;
  return (
    <Flag box={box}>
      {colors.map((color, i) => {
        const width = parts[i] ?? 0;
        const node = <rect key={color + i} x={x} width={width} height="100%" fill={color} />;
        x += width;
        return node;
      })}
    </Flag>
  );
}

function Czech() {
  return (
    <Flag box="0 0 6 4">
      <rect width="6" height="2" fill="#ffffff" />
      <rect y="2" width="6" height="2" fill="#d7141a" />
      <polygon points="0,0 3,2 0,4" fill="#11457e" />
    </Flag>
  );
}

function Slovakia() {
  return (
    <Flag box="0 0 90 60">
      <rect width="90" height="20" fill="#ffffff" />
      <rect y="20" width="90" height="20" fill="#0b4ea2" />
      <rect y="40" width="90" height="20" fill="#ee1c25" />
      <path d="M18 8 h18 v24 c0 8 -9 14 -9 14 s-9 -6 -9 -14 z" fill="#ee1c25" stroke="#ffffff" strokeWidth="1.2" />
      <path d="M19 34 c3.5 -5 7 -5 8 0 c1.5 -5 4.5 -5 8 0 v7 c0 4 -8 8 -8 8 s-8 -4 -8 -8 z" fill="#0b4ea2" />
      <rect x="25.6" y="13" width="2.2" height="16" fill="#ffffff" />
      <rect x="22.2" y="15.4" width="9" height="2" fill="#ffffff" />
      <rect x="23.4" y="19.2" width="6.6" height="1.6" fill="#ffffff" />
    </Flag>
  );
}

function Norway() {
  return (
    <Flag box="0 0 22 16">
      <rect width="22" height="16" fill="#ba0c2f" />
      <rect x="6" width="4" height="16" fill="#ffffff" />
      <rect y="6" width="22" height="4" fill="#ffffff" />
      <rect x="7" width="2" height="16" fill="#00205b" />
      <rect y="7" width="22" height="2" fill="#00205b" />
    </Flag>
  );
}

function Portugal() {
  return (
    <Flag box="0 0 90 60">
      <rect width="36" height="60" fill="#006600" />
      <rect x="36" width="54" height="60" fill="#ff0000" />
      <circle cx="36" cy="30" r="13" fill="none" stroke="#ffcc00" strokeWidth="4" />
      <circle cx="36" cy="30" r="6.5" fill="#ffcc00" />
      <circle cx="36" cy="30" r="3.4" fill="#003399" />
      <path d="M36 25.2 v9.6 M31.2 30 h9.6" stroke="#ffffff" strokeWidth="1.2" />
    </Flag>
  );
}

function Canada() {
  return (
    <Flag box="0 0 64 32">
      <rect width="16" height="32" fill="#ff0000" />
      <rect x="16" width="32" height="32" fill="#ffffff" />
      <rect x="48" width="16" height="32" fill="#ff0000" />
      <path
        fill="#ff0000"
        transform="translate(32 16)"
        d="M0 -11 L2.1 -5.4 L7.6 -6.6 L4.8 -2 L10 -0.4 L4.4 1.6 L6.4 6.4 L1.8 3.6 L1.3 9 L0 5.2 L-1.3 9 L-1.8 3.6 L-6.4 6.4 L-4.4 1.6 L-10 -0.4 L-4.8 -2 L-7.6 -6.6 L-2.1 -5.4 Z M-0.7 5.2 H0.7 V10.4 H-0.7 Z"
      />
    </Flag>
  );
}

function NewZealand({ clipId }: { clipId: string }) {
  const marks: [number, number, number][] = [
    [166, 22, 7],
    [206, 54, 6],
    [174, 102, 7],
    [142, 70, 4.5],
  ];
  return (
    <Flag box="0 0 240 120">
      <rect width="240" height="120" fill="#00247d" />
      <defs>
        <clipPath id={clipId}>
          <rect width="120" height="60" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="120" height="60" fill="#012169" />
        <path d="M0 0 L120 60 M120 0 L0 60" stroke="#ffffff" strokeWidth="16" />
        <path d="M0 0 L120 60 M120 0 L0 60" stroke="#c8102e" strokeWidth="6" />
        <path d="M60 0 V60 M0 30 H120" stroke="#ffffff" strokeWidth="20" />
        <path d="M60 0 V60 M0 30 H120" stroke="#c8102e" strokeWidth="10" />
      </g>
      {marks.map(([x, y, r]) => (
        <g key={`${x}-${y}`}>
          <polygon points={star(x, y, r + 2)} fill="#ffffff" />
          <polygon points={star(x, y, r)} fill="#cc142b" />
        </g>
      ))}
    </Flag>
  );
}

function Belarus() {
  const bits = Array.from({ length: 6 }, (_, i) => 3 + i * 14);
  return (
    <Flag box="0 0 180 90">
      <rect width="180" height="60" fill="#c8313e" />
      <rect y="60" width="180" height="30" fill="#4aa35a" />
      <rect width="18" height="90" fill="#c8313e" />
      {bits.map((y) => (
        <g key={y} fill="#ffffff">
          <rect x="3" y={y} width="12" height="2" />
          <polygon points={`9,${y + 3} 14,${y + 7} 9,${y + 11} 4,${y + 7}`} />
        </g>
      ))}
    </Flag>
  );
}

const FLAGS: Record<string, (clipId: string) => ReactNode> = {
  Slovakia: () => <Slovakia />,
  "Czech Republic": () => <Czech />,
  Poland: () => <H colors={["#ffffff", "#dc143c"]} box="0 0 8 5" />,
  Germany: () => <H colors={["#000000", "#dd0000", "#ffce00"]} box="0 0 5 3" />,
  Hungary: () => <H colors={["#ce2939", "#ffffff", "#477050"]} box="0 0 6 3" />,
  Portugal: () => <Portugal />,
  Italy: () => <V colors={["#009246", "#ffffff", "#ce2b37"]} box="0 0 3 2" />,
  Bulgaria: () => <H colors={["#ffffff", "#00966e", "#d62612"]} box="0 0 5 3" />,
  Norway: () => <Norway />,
  Serbia: () => <H colors={["#c6363c", "#0c4076", "#ffffff"]} box="0 0 6 4" />,
  Canada: () => <Canada />,
  "New Zealand": (clipId) => <NewZealand clipId={clipId} />,
  Belarus: () => <Belarus />,
};

export function MiniFlag({ country }: { country: string }) {
  const clipId = `flag-${useId().replace(/:/g, "")}`;
  const draw = FLAGS[country];
  if (!draw) {
    return (
      <Flag box="0 0 5 3">
        <rect width="5" height="1.5" fill="#c6b39a" />
        <rect y="1.5" width="5" height="1.5" fill="#1a1a1a" />
      </Flag>
    );
  }
  return draw(clipId);
}
