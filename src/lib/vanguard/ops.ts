export function trancheSplit(total: number) {
  const first = Math.round(total * 0.3);
  const second = Math.round(total * 0.4);
  const final = Math.max(0, total - first - second);
  return [
    { key: "T1", percent: 30, amount: first },
    { key: "T2", percent: 40, amount: second },
    { key: "T3", percent: 30, amount: final },
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

export function canCancel(status: string, stage: number, deadline: string | null, hasProof: boolean, now = Date.now()): boolean {
  if (status !== "OPEN" || stage !== 2 || hasProof || !deadline) return false;
  const left = hoursUntil(deadline, now);
  return left !== null && left > 0;
}
