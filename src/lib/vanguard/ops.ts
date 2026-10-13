import { normalizeScheme, tranches, type FeeScheme } from "./domain";

export function trancheSplit(total: number, scheme: FeeScheme = "legacy30") {
  const parts = tranches(total, scheme);
  const percent = scheme === "entry160" ? [0, 60, 0] : [30, 40, 30];
  return [
    { key: "T1" as const, percent: percent[0]!, amount: parts.first },
    { key: "T2" as const, percent: percent[1]!, amount: parts.second },
    { key: "T3" as const, percent: percent[2]!, amount: parts.final },
  ];
}

export function hoursUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return (at - now) / 36e5;
}

export function dueWithinHours(iso: string | null | undefined, hours: number, now = Date.now()): boolean {
  const left = hoursUntil(iso, now);
  return left !== null && left > 0 && left <= hours;
}

export function remindBand(iso: string | null | undefined, now = Date.now()): "12" | "48" | null {
  const left = hoursUntil(iso, now);
  if (left === null || left <= 0) return null;
  if (left <= 12) return "12";
  if (left <= 48) return "48";
  return null;
}

export function isOverdue(iso: string | null | undefined, now = Date.now()): boolean {
  const left = hoursUntil(iso, now);
  return left !== null && left <= 0;
}

export function citizenshipBlocked(list: string | undefined, citizenship: string): boolean {
  const want = citizenship.trim().toLowerCase();
  if (!want) return false;
  return (list ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(want);
}

export function kyivMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Kyiv", year: "numeric", month: "2-digit" }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}-${month}`;
}

export function sameMonth(iso: string | null | undefined, now = new Date()): boolean {
  if (!iso) return false;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return false;
  return kyivMonth(at) === kyivMonth(now);
}

export type CommissionCase = {
  status: string;
  totalCost: number;
  stage: number;
  stage2At: string | null;
  stage3At: string | null;
  stage4At: string | null;
  feeScheme?: string;
};

/** 10% (or the published rate) of the parts marked paid this calendar month, Kyiv time. */
export function monthCommission(cases: CommissionCase[], ratePct: number, now = new Date()): number {
  const rate = Math.min(100, Math.max(0, Number(ratePct) || 0)) / 100;
  let base = 0;
  for (const app of cases) {
    if (app.status === "CANCELLED") continue;
    const parts = trancheSplit(app.totalCost, normalizeScheme(app.feeScheme));
    if (app.stage >= 2 && sameMonth(app.stage2At, now)) base += parts[0]!.amount;
    if (app.stage >= 3 && sameMonth(app.stage3At, now)) base += parts[1]!.amount;
    if (app.stage >= 4 && sameMonth(app.stage4At, now)) base += parts[2]!.amount;
  }
  return Math.round(base * rate);
}

export function canCancel(status: string, stage: number, deadline: string | null, hasProof: boolean, now = Date.now()): boolean {
  if (status !== "OPEN" || stage !== 2 || hasProof || !deadline) return false;
  const left = hoursUntil(deadline, now);
  return left !== null && left > 0;
}

export function stageTone(status: string, stage: number) {
  if (status === "CANCELLED") return "stage-off";
  if (status === "REJECTED") return "stage-no";
  if (status === "ISSUED" || stage >= 4) return "stage-go";
  if (stage === 3) return "stage-move";
  if (stage === 2) return "stage-pay";
  return "stage-wait";
}
