import { useEffect, useRef, useState } from "react";
import { useI18n, type Lang } from "@/lib/vanguard/i18n";
import { useSite } from "./chrome";

export type Slot = {
  id: string;
  kind: string;
  title: string;
  caption: string;
  imageData: string;
  sortOrder: number;
  active?: boolean;
  country?: string;
  vacancyId?: string;
  startsAt?: string;
  endsAt?: string;
  cover?: boolean;
};

type StepCopy = Record<string, Record<string, { t?: string; b?: string }>>;

export function readSteps(raw: string): StepCopy {
  try {
    const value = JSON.parse(raw || "{}") as StepCopy;
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

const FALLBACK = ["process_1t", "process_2t", "process_3t", "process_4t"] as const;
const FALLBACK_B = ["process_1b", "process_2b", "process_3b", "process_4b"] as const;

export function StepRail() {
  const { t, lang } = useI18n();
  const { data } = useSite();
  const motion = data?.settings.motion !== "0";
  const ref = useRef<HTMLElement>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    if (!motion) return;
    const node = ref.current;
    if (!node) return;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setPlay(true);
      seen.disconnect();
    }, { threshold: 0.35 });
    seen.observe(node);
    return () => seen.disconnect();
  }, [motion]);
  const copy = readSteps(data?.settings.step_copy || "");
  const steps = FALLBACK.map((key, index) => {
    const custom = copy[lang]?.[String(index + 1)];
    return [custom?.t?.trim() || t(key), custom?.b?.trim() || t(FALLBACK_B[index])] as const;
  });
  return (
    <section ref={ref} className={`step-rail ${motion && play ? "play" : "still"}`}>
      <p className="kicker ember md:col-span-4">{t("steps_kicker")}</p>
      {steps.map(([title, body], index) => (
        <article key={title} className="step-card">
          <p className="ember">0{index + 1}</p>
          <h3 className="display mt-3 text-3xl">{title}</h3>
          <p className="mt-3 text-sm leading-relaxed text-mist">{body}</p>
        </article>
      ))}
    </section>
  );
}

export function CountLine() {
  const { t } = useI18n();
  const { data } = useSite();
  const settings = data?.settings;
  const counts = data?.counts;
  if (!settings || !counts) return null;
  const filed = settings.count_filed !== "0";
  const issued = settings.count_issued !== "0";
  if (!filed && !issued) return null;
  const motion = settings.motion !== "0";
  return (
    <section className="mx-auto flex max-w-6xl flex-wrap gap-10 px-4 pb-4">
      <p className="kicker ember w-full">{t("counts_kicker")}</p>
      {filed ? (
        <p>
          <span className="display ember block text-5xl"><CountUp n={counts.filed} run={motion} /></span>
          <span className="text-sm text-mist">{t("counts_filed")}</span>
        </p>
      ) : null}
      {issued ? (
        <p>
          <span className="display block text-5xl"><CountUp n={counts.issued} run={motion} /></span>
          <span className="text-sm text-mist">{t("counts_issued")}</span>
        </p>
      ) : null}
    </section>
  );
}

function CountUp({ n, run }: { n: number; run: boolean }) {
  const [value, setValue] = useState(run ? 0 : n);
  useEffect(() => {
    if (!run) {
      setValue(n);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 900);
      setValue(Math.round(n * progress));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [n, run]);
  return <>{value.toLocaleString("en-GB")}</>;
}

export function CountryStill({ country, compact = false }: { country: string; compact?: boolean }) {
  const { data } = useSite();
  const shot = (data?.media ?? []).find((item) => item.kind === "country" && item.country === country && item.imageData);
  if (!shot) return null;
  return (
    <figure className={compact ? "mt-3" : "mt-8"}>
      <img src={shot.imageData} alt={shot.title || country} className={`${compact ? "aspect-[16/9]" : "aspect-[16/7]"} w-full object-cover`} />
      {shot.caption ? <figcaption className="mt-2 text-sm text-mist">{shot.caption}</figcaption> : null}
    </figure>
  );
}

export function VacancyShots({ vacancyId }: { vacancyId: string }) {
  const shots = (useSite().data?.media ?? [])
    .filter((item) => item.kind === "vacancy" && item.vacancyId === vacancyId && item.imageData)
    .sort((a, b) => Number(b.cover) - Number(a.cover) || a.sortOrder - b.sortOrder)
    .slice(0, 3);
  if (!shots.length) return null;
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      {shots.map((shot) => (
        <figure key={shot.id}>
          <img src={shot.imageData} alt={shot.caption || shot.title} className="aspect-[4/3] w-full object-cover" />
          {shot.caption ? <figcaption className="mt-2 text-sm text-mist">{shot.caption}</figcaption> : null}
        </figure>
      ))}
    </div>
  );
}

export function LogoStrip() {
  const { t } = useI18n();
  const logos = (useSite().data?.media ?? [])
    .filter((item) => item.kind === "logo" && item.imageData)
    .sort((a, b) => a.sortOrder - b.sortOrder || (a.title || "").localeCompare(b.title || ""));
  if (!logos.length) return null;
  return (
    <section className="border-t border-white/10 px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="kicker ember">{t("logos_kicker")}</p>
        <ul className="mt-4 flex flex-wrap items-center gap-6">
          {logos.map((logo) => (
            <li key={logo.id} className="logo-mark" title={logo.title}>
              <img src={logo.imageData} alt={logo.title} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function LicenseWall({ items }: { items: Slot[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<Slot | null>(null);
  const list = items
    .filter((item) => item.kind === "license")
    .sort((a, b) => Number(b.cover) - Number(a.cover) || a.sortOrder - b.sortOrder);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  if (!list.length) return <p className="mt-6 text-mist">{t("about_license_empty")}</p>;
  return (
    <>
      <div className="mt-4 grid gap-3">
        {list.map((item) => (
          <button key={item.id} type="button" className="text-left" onClick={() => setOpen(item)}>
            <img src={item.imageData} alt={item.title || t("about_license")} className="w-full border border-white/15" />
            <span className="mt-2 block text-sm text-mist">{item.caption || t("license_open")}</span>
          </button>
        ))}
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0" aria-label={t("close")} onClick={() => setOpen(null)} />
          <figure className="relative z-[1] max-h-[90vh] max-w-4xl">
            <img src={open.imageData} alt={open.title || t("about_license")} className="max-h-[80vh] w-full object-contain" />
            {open.caption ? <figcaption className="mt-3 text-sm text-mist">{open.caption}</figcaption> : null}
            <button type="button" className="btn mt-3" onClick={() => setOpen(null)}>{t("close")}</button>
          </figure>
        </div>
      ) : null}
    </>
  );
}

export function stepField(raw: string, lang: Lang, index: number, part: "t" | "b") {
  return readSteps(raw)[lang]?.[String(index)]?.[part] || "";
}

export function writeStep(raw: string, lang: Lang, index: number, part: "t" | "b", value: string) {
  const copy = readSteps(raw);
  const block = { ...(copy[lang] ?? {}) };
  const step = { ...(block[String(index)] ?? {}) };
  step[part] = value;
  block[String(index)] = step;
  return JSON.stringify({ ...copy, [lang]: block });
}
