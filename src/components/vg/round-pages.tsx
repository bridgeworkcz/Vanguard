import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, useDesk, usePageMeta, useSite } from "./chrome";
import { readEmployerLink, wallBoard } from "@/lib/vanguard/api";
import { CITIZENSHIPS, countrySlug } from "@/lib/vanguard/domain";
import { resolveCampaign } from "@/lib/vanguard/round";
import { useI18n } from "@/lib/vanguard/i18n";

function nameFromSlug(slug: string) {
  const key = slug.trim().toLowerCase();
  return CITIZENSHIPS.find((item) => countrySlug(item) === key) || "";
}

export function LimitsPage() {
  const { t } = useI18n();
  usePageMeta("limits_title", "limits_guarantee");
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="kicker">Vanguard</p>
        <h1 className="display mt-3 text-5xl">{t("limits_title")}</h1>
        <ul className="mt-8 grid gap-4 text-lg">
          <li className="border-t border-white/15 pt-4">{t("limits_tourist")}</li>
          <li className="border-t border-white/15 pt-4">{t("limits_asylum")}</li>
          <li className="border-t border-white/15 pt-4">{t("limits_job")}</li>
          <li className="border-t border-white/15 pt-4">{t("limits_guarantee")}</li>
        </ul>
        <h2 className="display mt-12 text-3xl">{t("after_nav")}</h2>
        <p className="mt-3 text-mist">{t("after_pick")}</p>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {CITIZENSHIPS.map((name) => (
            <li key={name}>
              <Link to="/after/$citizenship" params={{ citizenship: countrySlug(name) }} className="underline-offset-4 hover:underline">
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </article>
    </Shell>
  );
}

export function AfterPage({ citizenship }: { citizenship: string }) {
  const { t } = useI18n();
  const name = nameFromSlug(citizenship);
  usePageMeta("after_title", "after_not_visa");
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <Link to="/limits" className="text-sm text-mist underline-offset-4 hover:underline">{t("limits_nav")}</Link>
        <p className="kicker mt-6">{name || t("after_pick")}</p>
        <h1 className="display mt-3 text-5xl">{t("after_title")}</h1>
        <ul className="mt-8 grid gap-4 text-lg">
          <li className="border-t border-white/15 pt-4">{t("after_not_visa")}</li>
          <li className="border-t border-white/15 pt-4">{t("after_where")}</li>
          <li className="border-t border-white/15 pt-4">{t("after_pay")}</li>
        </ul>
      </article>
    </Shell>
  );
}

export function GoPage({ slug }: { slug: string }) {
  const { t } = useI18n();
  const { data } = useSite();
  useEffect(() => {
    if (!data) return;
    const countries = Array.from(new Set(data.products.map((item) => item.country).filter(Boolean)));
    const hit = resolveCampaign(slug, countries);
    if (hit) sessionStorage.setItem("vg-campaign", hit.slug);
    else sessionStorage.removeItem("vg-campaign");
    window.location.replace(hit ? `/?country=${encodeURIComponent(hit.name)}#calc` : "/");
  }, [data, slug]);
  return (
    <Shell>
      <p className="px-4 py-16 text-mist">{t("loading")}</p>
    </Shell>
  );
}

export function EmployerPage({ token }: { token: string }) {
  const { t } = useI18n();
  const [row, setRow] = useState<Awaited<ReturnType<typeof readEmployerLink>>>(null);
  const [miss, setMiss] = useState(false);
  useEffect(() => {
    readEmployerLink({ data: token })
      .then((next) => {
        setRow(next);
        setMiss(!next);
      })
      .catch(() => setMiss(true));
  }, [token]);
  const house = row?.housing === "room" || row?.housing === "hostel";
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="kicker">{t("employer_kicker")}</p>
        {miss ? <p className="mt-6 text-mist">{t("employer_miss")}</p> : null}
        {row ? (
          <>
            <h1 className="display mt-3 text-5xl">{row.name}</h1>
            <p className="mt-3 text-lg text-metal">{row.job}</p>
            <p className="mt-1 text-mist">{[row.employer, row.country].filter(Boolean).join(" · ")}</p>
            <h2 className="display mt-10 text-3xl">{t("employer_papers")}</h2>
            <ul className="mt-4 grid gap-3 text-lg">
              <li className="border-t border-white/15 pt-3">{t("employer_contract")}</li>
              {house ? <li className="border-t border-white/15 pt-3">{t("employer_room")}</li> : null}
            </ul>
            <p className="mt-6 text-mist">{t("employer_sign")}</p>
          </>
        ) : null}
      </article>
    </Shell>
  );
}

export function WallPage() {
  const { t } = useI18n();
  const { signedIn } = useDesk();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof wallBoard>>>([]);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    let stop = false;
    const pull = () => {
      wallBoard()
        .then((next) => {
          if (!stop) {
            setRows(next);
            setDenied(false);
          }
        })
        .catch(() => {
          if (!stop) setDenied(true);
        });
    };
    pull();
    const id = window.setInterval(pull, 30_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [signedIn]);
  return (
    <main className="min-h-screen bg-[#090909] px-6 py-8 text-[#f6f4f0]">
      <p className="text-xs uppercase tracking-[0.22em] text-[#c6b39a]">Vanguard · {t("wall_title")}</p>
      {!signedIn || denied ? (
        <p className="mt-10 text-2xl">
          <Link to="/login" className="underline">{t("nav_sign_in")}</Link>
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-16 text-4xl text-[#c6b39a]">{t("wall_empty")}</p>
      ) : (
        <ul className="mt-8 grid gap-8">
          {rows.map((row) => (
            <li key={row.id} className="border-t border-white/15 pt-4">
              <p className={`text-sm uppercase tracking-[0.18em] ${row.mark === "late" ? "text-[#ff6a1a]" : "text-[#c6b39a]"}`}>
                {row.mark === "late" ? t("wall_late") : t("wall_soon")} · {row.country}
              </p>
              <p className="display mt-2 text-5xl sm:text-7xl">{row.name}</p>
              <p className="mt-2 text-xl text-[#c6b39a]">
                {row.id}
                {row.hour ? ` · ${t("write_after")} ${row.hour}:00` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
