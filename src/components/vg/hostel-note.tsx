import { hostelPriceText } from "@/lib/vanguard/hostel";
import { seatHasHouse } from "@/lib/vanguard/round";
import type { Vacancy } from "@/lib/vanguard/domain";
import { useI18n } from "@/lib/vanguard/i18n";

export function hasHostelOffer(job: Pick<Vacancy, "hostelEur" | "housingKind" | "accommodation"> | null | undefined): boolean {
  if (!job || !(Number(job.hostelEur) > 0)) return false;
  return !seatHasHouse(job.housingKind || "", job.accommodation);
}

export function HostelLine({ job }: { job: Vacancy }) {
  const { t } = useI18n();
  if (!hasHostelOffer(job)) return null;
  return (
    <p className="mt-1 text-sm text-paper">
      {t("hostel_short")} {hostelPriceText(Number(job.hostelEur), Number(job.hostelLocal) || 0, job.hostelCurrency || "")}.
    </p>
  );
}

export function HostelBox({
  eur,
  local,
  currency,
  on,
  locked,
  busy,
  onToggle,
}: {
  eur: number;
  local: number;
  currency: string;
  on: boolean;
  locked?: boolean;
  busy?: boolean;
  onToggle?: (next: boolean) => void;
}) {
  const { t } = useI18n();
  if (!eur) return null;
  return (
    <div className="mt-4 grid gap-2 border-t border-white/15 pt-4 text-sm">
      <p>{t("hostel_note")}</p>
      <p className="text-lg text-paper">{hostelPriceText(eur, local, currency)}</p>
      <p className="text-mist">{t("hostel_pay")}</p>
      {on ? <p>{t("hostel_on")}</p> : null}
      {locked ? <p className="text-mist">{t("hostel_locked")}</p> : null}
      {!locked && onToggle ? (
        <button type="button" className="btn w-fit" disabled={busy} onClick={() => onToggle(!on)}>
          {on ? t("hostel_remove") : t("hostel_add")}
        </button>
      ) : null}
    </div>
  );
}
