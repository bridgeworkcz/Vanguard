import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Shell, storyKey, useDesk, useSite } from "./chrome";
import { createApplication, joinWaitlist, noteFunnel } from "@/lib/vanguard/api";
import { CITIZENSHIPS, countrySlug, hasHousing, isNightShift, netMark, priceFor, productionWeeks, salaryNumber, sameCountry, termMonths, whatsAppHref, type Processing } from "@/lib/vanguard/domain";
import { VISA_PRODUCTS, DEFAULT_SETTINGS } from "@/lib/vanguard/seed";
import { citizenshipBlocked } from "@/lib/vanguard/ops";
import { useI18n, softenError } from "@/lib/vanguard/i18n";
import { CountryStill, CountLine, EmployerMark, LogoStrip, LicenseWall, StepRail, VacancyShots } from "./media";
import { MiniFlag } from "./flags";

function Reviews({ settings }: { settings: Record<string, string> }) {
  const { t } = useI18n();
  const rows = [1, 2]
    .map((n) => ({
      name: settings[`review_${n}_name`] || "",
      country: settings[`review_${n}_country`] || "",
      date: settings[`review_${n}_date`] || "",
      text: settings[`review_${n}_text`] || "",
    }))
    .filter((row) => row.name && row.country && row.date && row.text);
  if (!rows.length) return null;
  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="display text-3xl">{t("review_t")}</h2>
      <ul className="mt-4 grid gap-3">
        {rows.map((row) => (
          <li key={`${row.name}-${row.date}`} className="border-t border-white/10 py-3">
            <p>{row.text}</p>
            <p className="mt-2 text-sm text-mist">{row.name} · {row.country} · {row.date}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function speedLabel(t: (k: "speed_STANDARD" | "speed_PRIORITY" | "speed_EXPRESS" | "weeks" | "week") => string, p: Processing, min: number, max: number) {
  const n = productionWeeks(min, max, p);
  return `${t(`speed_${p}`)} · ${n} ${n === 1 ? t("week") : t("weeks")}`;
}

export function HomePage() {
  const { t, lang } = useI18n();
  const { data, error } = useSite();
  const navigate = useNavigate();
  const [citizenship, setCitizenship] = useState("");
  const [country, setCountry] = useState("");
  const [productId, setProductId] = useState("");
  const [speed, setSpeed] = useState<Processing | "">("");
  const [msg, setMsg] = useState("");
  const [restored, setRestored] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [agentNote, setAgentNote] = useState(false);
  useEffect(() => {
    setAgentNote(Boolean(sessionStorage.getItem("vg-agent")));
    const raw = window.sessionStorage.getItem("vg-last-calc");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { citizenship?: string; country?: string; productId?: string; speed?: Processing | "" };
      setCitizenship(saved.citizenship || "");
      setCountry(saved.country || "");
      setProductId(saved.productId || "");
      setSpeed(saved.speed || "");
      if (saved.citizenship && saved.country && saved.productId && saved.speed) setRestored(true);
    } catch {
      /* ignore a broken note from this session */
    }
  }, []);
  useEffect(() => {
    if (!citizenship && !country && !productId && !speed) return;
    window.sessionStorage.setItem("vg-last-calc", JSON.stringify({ citizenship, country, productId, speed }));
    if (citizenship || country) sessionStorage.setItem("vg-route", [citizenship, country].filter(Boolean).join(" → "));
  }, [citizenship, country, productId, speed]);
  useEffect(() => {
    if (sessionStorage.getItem("vg-funnel-calc")) return;
    sessionStorage.setItem("vg-funnel-calc", "1");
    void noteFunnel({ data: { kind: "calc" } }).catch(() => undefined);
  }, []);
  const catalog = data ? data.products : VISA_PRODUCTS;
  const products = catalog.filter((p) => p.active && p.country === country);
  const product = products.find((p) => p.id === productId);
  const countries = useMemo(() => {
    return Array.from(new Set(catalog.filter((p) => p.active && p.country).map((p) => p.country))).sort((a, b) => a.localeCompare(b));
  }, [catalog]);
  const settings = data?.settings ?? {};
  const fromPrice = catalog.filter((p) => p.active).reduce((min, p) => Math.min(min, p.basePrice), Number.POSITIVE_INFINITY);
  const title =
    settings[storyKey(lang, "hero_title")] ||
    settings.hero_title_en ||
    DEFAULT_SETTINGS[storyKey(lang, "hero_title")] ||
    DEFAULT_SETTINGS.hero_title_en;
  const heroSteps = [
    ["hero_1t", "hero_1b"],
    ["hero_2t", "hero_2b"],
    ["hero_4t", "hero_4b"],
  ] as const;

  function search() {
    if (!citizenship || !country || !product || !speed) {
      setMsg(t("calc_need"));
      return;
    }
    if (sameCountry(citizenship, country)) {
      setMsg(t("calc_national"));
      return;
    }
    if (!product.allowedProcessing.includes(speed)) {
      setMsg(t("calc_speed_unavailable"));
      return;
    }
    window.sessionStorage.setItem("vg-last-calc", JSON.stringify({ citizenship, country, productId: product.id, speed }));
    void navigate({
      to: "/search",
      search: { citizenship, country, product: product.id, speed },
    });
  }

  return (
    <Shell>
      <section>
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 lg:grid-cols-12 lg:py-14">
          <div className="lg:col-span-6">
            <p className="kicker">{t("hero_kicker")}</p>
            <h1 className="display mt-4 max-w-xl text-4xl sm:text-6xl">{title}</h1>
            <ol className="hero-chain" dir={lang === "ur" ? "rtl" : undefined}>
              {heroSteps.map(([head, line], index) => (
                <li key={head} className="hero-step">
                  <span className="hero-tick" aria-hidden="true" />
                  <p>
                    <span className="hero-no latin">0{index + 1}</span>
                    <b>{t(head)}</b>
                    <span>{t(line)}</span>
                  </p>
                </li>
              ))}
            </ol>
            {restored && product && speed ? (
              <button type="button" className="btn-solid mt-6" onClick={() => search()}>
                {t("calc_continue")}
              </button>
            ) : null}
            {agentNote ? <p className="mt-3 text-sm text-mist">{t("agent_kept")}</p> : null}
          </div>
          <form
            id="calc"
            className="glass lg:col-span-6 p-5 sm:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <p className="kicker">{t("calc_kicker")}</p>
            <h2 className="display mt-3 text-3xl">{t("calc_title")}</h2>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_citizenship")}
                <select className="field min-w-0" value={citizenship} onChange={(e) => setCitizenship(e.target.value)}>
                  <option value="">{t("calc_pick")}</option>
                  {CITIZENSHIPS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_country")}
                <button type="button" className="field flex min-h-11 items-center gap-2 text-left" onClick={() => setCountryOpen((open) => !open)}>
                  {country ? <MiniFlag country={country} /> : null}
                  <span>{country || t("calc_pick")}</span>
                </button>
                {countryOpen ? (
                  <ul className="max-h-60 overflow-auto border border-white/15 bg-[#101114]">
                    {countries.map((c) => (
                      <li key={c}>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-paper"
                          onClick={() => {
                            setCountry(c);
                            setProductId("");
                            setSpeed("");
                            setCountryOpen(false);
                          }}
                        >
                          <MiniFlag country={c} />
                          {c}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </label>
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_visa")}
                <select
                  className="field min-w-0"
                  value={productId}
                  disabled={!country}
                  onChange={(e) => {
                    setProductId(e.target.value);
                    setSpeed("");
                  }}
                >
                  <option value="">{t("calc_pick")}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.duration}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_speed")}
                <select className="field min-w-0" value={speed} disabled={!product} onChange={(e) => setSpeed(e.target.value as Processing)}>
                  <option value="">{t("calc_pick")}</option>
                  {product?.allowedProcessing.map((p) => (
                    <option key={p} value={p}>
                      {speedLabel(t, p, product.productionMinWeeks, product.productionMaxWeeks)}
                    </option>
                  ))}
                </select>
              </label>
              {msg ? <p className="text-sm text-metal">{msg}</p> : null}
              {error ? <p className="text-sm text-metal">{error}</p> : null}
              <article className="glass p-4 md:col-span-2">
                <h2 className="display text-2xl">{t("fee_includes_t")}</h2>
                <p className="mt-2 text-sm leading-relaxed text-mist">{t("fee_includes_b")}</p>
              </article>
              <article className="md:col-span-2">
                <h2 className="display text-2xl">{t("speed_table_t")}</h2>
                <table className="mt-3 w-full table-fixed text-left text-sm">
                  <thead className="text-mist">
                    <tr>
                      <th className="w-[34%] py-1 font-medium">{t("speed_col_pace")}</th>
                      <th className="w-[33%] py-1 font-medium">{t("speed_col_weeks")}</th>
                      <th className="py-1 font-medium">{t("speed_col_fee")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["STANDARD", "PRIORITY", "EXPRESS"] as const)
                      .filter((pace) => !product || product.allowedProcessing.includes(pace))
                      .map((pace) => (
                        <tr key={pace} className="border-t border-white/10 align-top">
                          <td className="py-2 pr-2">{t(`speed_${pace}`)}</td>
                          <td className="py-2 pr-2">
                            {product
                              ? `${productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, pace)} ${t("weeks")}`
                              : t(`speed_weeks_${pace}` as "speed_weeks_STANDARD")}
                          </td>
                          <td className="py-2">
                            {product ? `${priceFor(product.basePrice, pace)} EUR` : t(`speed_fee_${pace}` as "speed_fee_STANDARD")}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </article>
              <div className="grid gap-3 border-t border-white/10 py-3 md:sticky md:bottom-0 md:z-20 md:col-span-2 md:bg-[#090909]/95">
                <p className="display ember min-h-14 text-5xl">
                  {product && speed ? (
                    <>
                      {priceFor(product.basePrice, speed)} <span className="text-2xl text-mist">EUR</span>
                    </>
                  ) : Number.isFinite(fromPrice) ? (
                    <>
                      {t("fee_from")} {fromPrice} <span className="text-2xl text-mist">EUR</span>
                    </>
                  ) : (
                    <span className="text-lg text-mist">{t("calc_hold")}</span>
                  )}
                </p>
                <button className="btn-solid" type="submit" disabled={!data}>
                  {data ? t("calc_search") : t("loading")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>
      <StepRail />
      <section className="banner-row">
        <article className="banner banner-orange">
          <span>01</span>
          <b>{t("banner_fee")}</b>
        </article>
        <article className="banner banner-paper">
          <span>02</span>
          <b>{t("banner_split")}</b>
        </article>
        <article className="banner banner-blue">
          <span>03</span>
          <b>{t("banner_ministry")}</b>
        </article>
      </section>
      <CountLine />
    </Shell>
  );
}

export function SearchPage({
  citizenship,
  country,
  product,
  speed,
}: {
  citizenship: string;
  country: string;
  product: string;
  speed: string;
}) {
  const { t } = useI18n();
  const { signedIn } = useDesk();
  const { data } = useSite();
  const [waitNote, setWaitNote] = useState("");
  const [pick, setPick] = useState<string[]>([]);
  const [sort, setSort] = useState<"salary" | "seats" | "term">("salary");
  const [houseOnly, setHouseOnly] = useState(false);
  const [dayOnly, setDayOnly] = useState(false);
  const visa = data?.products.find((p) => p.id === product);
  const pace = speed === "PRIORITY" || speed === "EXPRESS" || speed === "STANDARD" ? speed : null;
  const ok = visa && pace && visa.allowedProcessing.includes(pace) && !sameCountry(citizenship, visa.country);
  const weeks = visa && pace ? productionWeeks(visa.productionMinWeeks, visa.productionMaxWeeks, pace) : 0;
  const fee = visa && pace ? priceFor(visa.basePrice, pace) : 0;
  const openSeat = (v: { active: boolean; pauseUntil?: string }) => {
    if (v.pauseUntil && Date.parse(v.pauseUntil) > Date.now()) return false;
    return v.active || Boolean(v.pauseUntil);
  };
  const jobs = data?.vacancies.filter((v) => openSeat(v) && v.visaProductId === product && v.quota > 0 && !citizenshipBlocked(v.blockedCitizenships, citizenship)) ?? [];
  const full = data?.vacancies.filter((v) => openSeat(v) && v.visaProductId === product && v.quota < 1 && !citizenshipBlocked(v.blockedCitizenships, citizenship)) ?? [];
  const houseN = jobs.filter((job) => hasHousing(job.accommodation)).length;
  const dayN = jobs.filter((job) => !isNightShift(job.workingHours)).length;
  const shown = [...jobs]
    .filter((job) => (!houseOnly || hasHousing(job.accommodation)) && (!dayOnly || !isNightShift(job.workingHours)))
    .sort((a, b) => {
      if (sort === "seats") return b.quota - a.quota;
      if (sort === "term") return termMonths(visa?.duration || "") - termMonths(visa?.duration || "");
      return salaryNumber(b.salaryNet) - salaryNumber(a.salaryNet);
    });
  let waits: Record<string, number> = {};
  try {
    waits = JSON.parse(data?.settings.waitlist_counts || "{}") as Record<string, number>;
  } catch {
    waits = {};
  }
  function payLine(text: string) {
    const mark = netMark(text);
    return mark === "net" ? t("pay_net") : mark === "gross" ? t("pay_gross") : "";
  }
  const compared = jobs.filter((job) => pick.includes(job.id));
  function toggleCompare(id: string) {
    setPick((cur) => (cur.includes(id) ? cur.filter((item) => item !== id) : cur.length >= 2 ? [cur[1]!, id] : [...cur, id]));
  }
  return (
    <Shell>
      <div className="mx-auto max-w-6xl px-4 py-12">
        <Link to="/" className="text-sm text-mist underline-offset-4 hover:underline">
          {t("search_back")}
        </Link>
        {!ok || !visa || !pace ? (
          <p className="mt-8 text-metal">{t("calc_speed_unavailable")}</p>
        ) : (
          <>
            <div className="glass mt-6 grid gap-6 p-6 md:grid-cols-3">
              <div>
                <p className="kicker">{t("search_fee")}</p>
                <p className="display ember mt-2 text-5xl">{fee}</p>
                <p className="text-mist">EUR</p>
              </div>
              <div>
                <p className="kicker">{t("search_window")}</p>
                <p className="display mt-2 text-5xl">{weeks}</p>
                <p className="text-mist">{t("weeks")}</p>
              </div>
              <div>
                <p className="kicker">{visa.country}</p>
                <CountryStill country={visa.country} compact />
                <p className="mt-2 text-lg">
                  {visa.name}
                  <span className="block text-mist">{visa.duration}</span>
                </p>
                <p className="mt-2 text-sm text-metal">{t(`speed_${pace}`)}</p>
                <Link to="/country/$code" params={{ code: countrySlug(visa.country) }} className="mt-3 inline-block text-sm text-mist underline-offset-4 hover:underline">
                  {t("country_openings")}
                </Link>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className={sort === "salary" ? "btn-solid" : "btn"} onClick={() => setSort("salary")}>{t("sort_salary")}</button>
              <button type="button" className={sort === "seats" ? "btn-solid" : "btn"} onClick={() => setSort("seats")}>{t("sort_seats")}</button>
              <button type="button" className={sort === "term" ? "btn-solid" : "btn"} onClick={() => setSort("term")}>{t("sort_term")} · {visa.duration}</button>
              {houseN > 0 ? (
                <button type="button" className={houseOnly ? "btn-solid" : "btn"} onClick={() => setHouseOnly((v) => !v)}>
                  {t("filter_house")} · {houseN}
                </button>
              ) : null}
              {dayN > 0 ? (
                <button type="button" className={dayOnly ? "btn-solid" : "btn"} onClick={() => setDayOnly((v) => !v)}>
                  {t("filter_day")} · {dayN}
                </button>
              ) : null}
              {houseOnly || dayOnly ? (
                <button type="button" className="btn" onClick={() => { setHouseOnly(false); setDayOnly(false); }}>{t("filter_all")} · {jobs.length}</button>
              ) : null}
            </div>
            {compared.length === 2 ? (
              <div className="mt-8 overflow-x-auto">
                <h2 className="display text-3xl">{t("compare_title")}</h2>
                <table className="mt-4 w-full min-w-[520px] text-left text-sm">
                  <thead className="text-mist">
                    <tr>
                      <th className="py-2 font-medium" />
                      {compared.map((job) => (
                        <th key={job.id} className="py-2 font-medium">{job.title}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [t("field_salary"), (job: (typeof compared)[number]) => job.salaryNet],
                        [t("field_hours"), (job: (typeof compared)[number]) => job.workingHours],
                        [t("field_housing"), (job: (typeof compared)[number]) => job.accommodation],
                        [t("search_quota"), (job: (typeof compared)[number]) => String(job.quota)],
                      ] as const
                    ).map(([label, read]) => (
                      <tr key={label} className="border-t border-white/10">
                        <th className="py-2 pr-3 font-medium text-mist">{label}</th>
                        {compared.map((job) => (
                          <td key={job.id} className="py-2">{read(job)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="mt-8 grid gap-4">
              {shown.length === 0 ? (
                <div className="grid gap-2">
                  <p className="text-mist">{t("search_empty")}</p>
                  {jobs.length === 0 ? <Link to="/" className="btn w-fit">{t("search_empty_next")}</Link> : null}
                </div>
              ) : null}
              {full.length ? <h2 className="display text-3xl">{t("search_queue")}</h2> : null}
              {full.map((job) => (
                <div key={job.id} className="glass grid gap-3 p-5 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <h2 className="display text-3xl">{job.title}</h2>
                    <p className="mt-1 text-sm text-mist">{job.employer}</p>
                    <p className="mt-2 text-sm text-mist">{visa.country} · {visa.duration}</p>
                    <p className="mt-1 text-sm">{job.workingHours}</p>
                    <p className="text-sm text-mist">{job.accommodation}</p>
                    <p className="mt-1 text-sm text-mist">{t("search_wait")}</p>
                    {Number(waits[job.id]) > 0 ? <p className="mt-1 text-sm text-mist">{waits[job.id]} {t("wait_n")}</p> : null}
                  </div>
                  <p className="text-sm text-paper">{job.salaryNet}{payLine(job.salaryNet) ? ` · ${payLine(job.salaryNet)}` : ""}</p>
                  <div>
                    {signedIn ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          void joinWaitlist({ data: { vacancyId: job.id, citizenship } })
                            .then(() => setWaitNote(t("search_wait_done")))
                            .catch(() => setWaitNote(t("search_wait_in")))
                        }
                      >
                        {t("search_wait_btn")}
                      </button>
                    ) : (
                      <Link to="/login" className="btn">{t("search_wait_in")}</Link>
                    )}
                  </div>
                </div>
              ))}
              {waitNote ? <p className="text-sm text-metal">{waitNote}</p> : null}
              {jobs.length === 0 && visa ? (
                <div className="grid gap-3">
                  <h2 className="display text-3xl">{t("similar_openings")}</h2>
                  {(data?.vacancies ?? [])
                    .filter((v) => openSeat(v) && v.country === visa.country && v.quota > 0 && v.visaProductId !== product && !citizenshipBlocked(v.blockedCitizenships, citizenship))
                    .slice(0, 4)
                    .map((job) => (
                      <article key={job.id} className="glass p-4">
                        <p className="inline-flex items-center gap-2 text-sm text-mist"><MiniFlag country={job.country} /> {job.country}</p>
                        <h3 className="display mt-1 text-2xl">{job.title}</h3>
                        <p className="text-sm text-mist">{job.employer}</p>
                        <p className="mt-1 text-sm">{job.workingHours}</p>
                        <p className="text-sm text-mist">{job.accommodation}</p>
                        <p className="mt-1 text-sm text-metal">{job.quota} {t("search_quota")}</p>
                      </article>
                    ))}
                </div>
              ) : null}
              {shown.length ? <h2 className="display text-3xl">{t("search_open")}</h2> : null}
              {shown.map((job) => (
                <article key={job.id} className="glass grid gap-3 p-5 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <label className="mb-2 flex items-center gap-2 text-sm text-mist">
                      <input type="checkbox" checked={pick.includes(job.id)} onChange={() => toggleCompare(job.id)} />
                      {t("compare_add")}
                    </label>
                    <Link to="/vacancies/$id" params={{ id: job.id }} search={{ citizenship, product, speed: pace }} className="display text-3xl">
                      {job.title}
                    </Link>
                    <p className="mt-1 text-sm text-mist">{job.employer}</p>
                    <p className="mt-2 inline-flex items-center gap-2 text-sm"><MiniFlag country={visa.country} /> {visa.country} · {visa.duration}</p>
                    <p className="mt-1 text-sm">{job.workingHours}</p>
                    <p className="text-sm text-mist">{job.accommodation}</p>
                    {Number(waits[job.id]) > 0 ? <p className="mt-1 text-sm text-mist">{waits[job.id]} {t("wait_n")}</p> : null}
                  </div>
                  <p className="text-sm text-paper">
                    <span className="block">{job.salaryNet}</span>
                    <span className="mt-1 block text-mist">{job.accommodation}</span>
                    {payLine(job.salaryNet) ? <span className="mt-1 block text-xs text-mist">{payLine(job.salaryNet)}</span> : null}
                  </p>
                  <p className="text-sm text-metal">
                    {job.quota} {t("search_quota")}
                    <span className="mt-1 block text-xs text-mist">{t("search_quota_help")}</span>
                  </p>
                </article>
              ))}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

export function VacancyPage({
  id,
  citizenship,
  product,
  speed,
}: {
  id: string;
  citizenship: string;
  product: string;
  speed: string;
}) {
  const { t, lang } = useI18n();
  const { data } = useSite();
  const { signedIn } = useDesk();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [agentCode, setAgentCode] = useState("");
  useEffect(() => {
    setAgentCode(sessionStorage.getItem("vg-agent") || "");
  }, []);
  const job = data?.vacancies.find((v) => v.id === id);
  const visa = data?.products.find((p) => p.id === (product || job?.visaProductId));
  const pace = speed === "PRIORITY" || speed === "EXPRESS" || speed === "STANDARD" ? speed : "STANDARD";
  async function apply() {
    if (!job) return;
    if (!signedIn) {
      sessionStorage.setItem("vg-agent", agentCode.trim());
      sessionStorage.setItem("vg-intent", JSON.stringify({ vacancyId: job.id, citizenship, processing: pace, agentCode: agentCode.trim() }));
      void navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    setErr("");
    try {
      void noteFunnel({ data: { kind: "apply" } }).catch(() => undefined);
      const res = await createApplication({ data: { vacancyId: job.id, citizenship, processing: pace, agentCode: agentCode.trim(), lang } });
      void navigate({ to: "/portal", search: { id: res.id } });
    } catch (e) {
      setErr(softenError(e instanceof Error ? e.message : "Error", t("sheets_busy")));
      setBusy(false);
    }
  }
  if (!job || !visa) {
    return (
      <Shell>
        <p className="px-4 py-16 text-mist">{t("loading")}</p>
      </Shell>
    );
  }
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-12 pb-28 md:pb-12">
        <button type="button" className="text-sm text-mist" onClick={() => history.back()}>
          {t("search_back")}
        </button>
        <p className="kicker mt-6">{job.country}</p>
        <h1 className="display mt-3 text-5xl">{job.title}</h1>
        <EmployerMark name={job.employer} />
        <p className="mt-3 text-lg text-metal">{job.employer}</p>
        <VacancyShots vacancyId={job.id} />
        <p className="mt-6 leading-relaxed text-paper/85">{job.description}</p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            [t("field_salary"), job.salaryNet],
            [t("field_hours"), job.workingHours],
            [t("field_housing"), job.accommodation],
            [t("permit"), `${visa.name}, ${visa.duration}`],
            [t("fee"), visa && pace ? `${priceFor(visa.basePrice, pace)} EUR` : ""],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-white/15 pt-3">
              <dt className="text-xs uppercase tracking-widest text-mist">{k}</dt>
              <dd className={`mt-1 ${k === t("fee") ? "ember" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
        {job.requirements ? (
          <div className="mt-8">
            <h2 className="text-xs uppercase tracking-widest text-mist">{t("field_requirements")}</h2>
            <ul className="mt-3 grid gap-2 text-sm">
              {job.requirements
                .split(/\n+|(?<=\.)\s+/)
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => (
                  <li key={line} className="border-t border-white/10 pt-2">{line}</li>
                ))}
            </ul>
          </div>
        ) : null}
        {err ? <p className="mt-4 text-sm text-metal">{err}</p> : null}
        <label className="mt-6 grid max-w-sm gap-1 text-sm text-mist">
          {t("agent_code")}
          <input
            className="field"
            value={agentCode}
            onChange={(e) => {
              setAgentCode(e.target.value);
              sessionStorage.setItem("vg-agent", e.target.value.trim());
            }}
          />
        </label>
        {!signedIn ? <p className="mt-4 text-sm text-mist">{t("need_account")}</p> : null}
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-[#090909]/95 p-3 md:static md:mt-6 md:border-0 md:bg-transparent md:p-0">
          <button type="button" className="btn-solid w-full md:w-fit" disabled={busy || !citizenship} onClick={() => void apply()}>
            {busy ? t("applying") : t("search_apply")}
          </button>
        </div>
      </article>
    </Shell>
  );
}

export function AboutPage() {
  const { t, lang } = useI18n();
  const { data } = useSite();
  const s = data?.settings ?? {};
  const lead = s[storyKey(lang, "about_lead")] || s.about_lead_en;
  const story = s[storyKey(lang, "about_story")] || s.about_story_en;
  const office = data?.media.filter((m) => m.kind === "office" && m.active !== false) ?? [];
  const licenses = data?.media.filter((m) => m.kind === "license") ?? [];
  const partners = data?.partners ?? [];
  const countries = Array.from(new Set(partners.map((p) => p.country)));
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [openMember, setOpenMember] = useState<string | null>(null);
  const team = data?.team ?? [];
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="kicker">{t("nav_about")}</p>
        <h1 className="display mt-4 text-5xl sm:text-6xl">{lead}</h1>
        <div className="mt-6 border border-white/15 p-4 text-sm">
          <p>{s.legal_address}</p>
          <p className="mt-2 text-mist">{s.desk_hours || t("desk_hours")}</p>
          <p className="mt-2">{s.legal_entity}</p>
          <p className="mt-1 text-mist">{t("legal_id")} {s.registration_number}</p>
        </div>
        <div className="mt-6">
          <h2 className="display text-3xl">{t("about_license")}</h2>
          <LicenseWall items={licenses} />
        </div>
        <div className="mt-8 space-y-4 text-base leading-relaxed whitespace-pre-line">{story}</div>
      </article>
      <section className="banner banner-orange">
        <span>30 · 40 · 30</span>
        <b>{t("banner_split")}</b>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="display text-4xl">{t("about_office")}</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {office.map((m) => (
            <figure key={m.id}>
              <img src={m.imageData} alt={m.title} className="aspect-[4/3] w-full object-cover" />
              <figcaption className="mt-2 text-sm text-mist">
                {m.title}. {m.caption}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section className="border-y border-white/10 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 md:grid-cols-2">
          <div>
            <h2 className="display text-4xl">{t("about_legal")}</h2>
            <dl className="mt-6 grid gap-3 text-sm">
              <div>
                <dt className="text-mist">{s.legal_entity}</dt>
                <dd className="mt-1">{s.legal_address}</dd>
              </div>
              <div>
                {t("legal_id")} {s.registration_number} · {t("legal_vat")} {s.vat_number}
              </div>
              <div>
                <a className="underline-offset-4 hover:underline" href={`https://or.justice.cz/ias/ui/rejstrik-firma.vysledky?ic=${encodeURIComponent(s.registration_number || "")}`} target="_blank" rel="noopener noreferrer">
                  {t("registry")}
                </a>
              </div>
              <div>{s.court_record}</div>
              <div>
                {t("legal_trade")}: {s.regulator}
              </div>
            </dl>
          </div>
          <div>
            <h2 className="display text-4xl">{t("about_license")}</h2>
            <LicenseWall items={licenses} />
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="overflow-hidden border border-white/15 bg-[#101114]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-sm">{s.legal_address}</p>
              <p className="text-sm text-mist">{s.desk_hours || t("desk_hours")}</p>
            </div>
            <a
              className="text-sm"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.legal_address || "Rybná 716/24, Praha 1")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("map_open")}
            </a>
          </div>
          <div className="map-night">
            <iframe
              title={s.legal_address || "Praha"}
              src={`https://maps.google.com/maps?q=${encodeURIComponent(s.legal_address || "Rybná 716/24, Staré Město, 110 00 Praha 1")}&z=16&output=embed`}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>
      {team.length ? (
        <section className="border-t border-white/10 px-4 py-12">
          <div className="mx-auto max-w-6xl">
            <h2 className="display text-3xl">{t("about_team")}</h2>
            <p className="mt-3 text-sm text-mist">{t("team_hint")}</p>
            <div className="mt-6 border-t border-white/10">
              {team.map((m) => {
                const open = openMember === m.id;
                return (
                  <div key={m.id} className="border-b border-white/10">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-4 py-2 text-left text-sm"
                      aria-expanded={open}
                      onClick={() => setOpenMember(open ? null : m.id)}
                    >
                      <span>{m.fullName}</span>
                      <span className="text-[11px] tracking-[0.14em] text-mist uppercase">{open ? "–" : "+"}</span>
                    </button>
                    {open ? (
                      <figure className="shot mb-4">
                        {m.photoData ? (
                          <img src={m.photoData} alt="" className="shot-img" />
                        ) : (
                          <div className="shot-img grid place-items-center text-4xl">{(m.fullName || " ").trim().slice(0, 1)}</div>
                        )}
                        <figcaption className="shot-name">
                          {m.fullName}
                          {m.position ? <span className="mt-1 block text-sm normal-case tracking-normal text-white/70">{m.position}</span> : null}
                        </figcaption>
                      </figure>
                    ) : null}
                    {open && m.phone ? (
                      <a href={whatsAppHref(m.phone)} target="_blank" rel="noopener noreferrer" className="mb-4 inline-block text-sm">
                        {m.phone}
                      </a>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}
      <Reviews settings={s} />
      <LogoStrip />
      <section className="border-t border-white/10 px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="display text-3xl">{t("about_partners")}</h2>
          <p className="mt-3 text-sm text-mist">{t("partners_hint")}</p>
          <div className="mt-6 border-t border-white/10">
            {countries.map((c) => {
              const list = partners.filter((p) => p.country === c).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
              const open = openCountry === c;
              return (
                <div key={c} className="border-b border-white/10">
                  <button
                    type="button"
                    className="flex min-h-11 w-full items-center justify-between gap-4 py-2 text-left text-sm"
                    aria-expanded={open}
                    onClick={() => setOpenCountry(open ? null : c)}
                  >
                    <span className="inline-flex items-center gap-2">{c ? <MiniFlag country={c} /> : null}{c}</span>
                    <span className="text-[11px] tracking-[0.14em] text-mist uppercase">{open ? "–" : "+"} {list.length}</span>
                  </button>
                  {open ? (
                    <ul className="grid gap-x-6 gap-y-1 pb-4 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((p) => (
                        <li key={p.id} className="text-[12px] leading-snug text-mist">
                          {p.name}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </Shell>
  );
}

export function ContactPage() {
  const { t } = useI18n();
  const { data } = useSite();
  const s = data?.settings;
  const [caseNote, setCaseNote] = useState("");
  useEffect(() => {
    const id = window.sessionStorage.getItem("vg-case") || "";
    setCaseNote(id ? `${id}.` : "");
  }, []);
  return (
    <Shell>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
        <div>
          <p className="kicker">{t("contact_kicker")}</p>
          <h1 className="display mt-4 text-5xl">{t("contact_title")}</h1>
          <p className="mt-4 text-mist">{s?.desk_hours || t("desk_hours")}</p>
          {s?.support_phone ? (
            <a className="btn-solid mt-8 inline-flex w-fit" href={whatsAppHref(s.support_phone, caseNote)} target="_blank" rel="noopener noreferrer">
              WhatsApp · {s.support_phone}
            </a>
          ) : null}
        </div>
        <dl className="grid gap-6 text-lg">
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_address")}</dt>
            <dd className="mt-2">{s?.legal_address}</dd>
            <p className="mt-2 text-sm">{s?.door_hint || t("door_hint")}</p>
            <a
              className="mt-2 inline-block text-sm"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s?.legal_address || "Rybná 716/24, Praha 1")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("map_open")}
            </a>
            <div className="map-night mt-4 overflow-hidden border border-white/15">
              <iframe
                title={s?.legal_address || "Praha"}
                src={`https://maps.google.com/maps?q=${encodeURIComponent(s?.legal_address || "Rybná 716/24, Staré Město, 110 00 Praha 1")}&z=16&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_phone")}</dt>
            <dd className="mt-2">
              {s?.support_phone ? (
                <a href={whatsAppHref(s.support_phone, caseNote)} target="_blank" rel="noopener noreferrer">
                  {s.support_phone}
                </a>
              ) : null}
              <span className="mt-1 block text-sm text-mist">{t("contact_whatsapp")}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_email")}</dt>
            <dd className="mt-2">
              <a href={`mailto:${s?.support_email ?? ""}`}>{s?.support_email}</a>
            </dd>
          </div>
        </dl>
      </div>
    </Shell>
  );
}

export function CountryPage({ code }: { code: string }) {
  const { t } = useI18n();
  const { data } = useSite();
  const products = (data?.products ?? VISA_PRODUCTS).filter((item) => item.active && countrySlug(item.country) === code);
  const country = products[0]?.country ?? "";
  const ids = new Set(products.map((item) => item.id));
  const jobs = (data?.vacancies ?? []).filter((item) => item.active && ids.has(item.visaProductId));
  const blocked = Array.from(
    new Set(
      jobs
        .flatMap((job) => (job.blockedCitizenships || "").split(/[,;\n]/))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).join(", ");
  return (
    <Shell>
      <article className="mx-auto max-w-5xl px-4 py-14">
        <p className="kicker">{t("country_kicker")}</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">{country || t("country_empty")}</h1>
        {products.length ? (
          <p className="mt-3 text-sm text-mist">
            {t("country_fee_range")} {Math.min(...products.map((item) => item.basePrice))}–{Math.max(...products.map((item) => item.basePrice))} EUR
          </p>
        ) : null}
        {blocked ? <p className="mt-3 text-sm text-mist">{t("country_blocked")}: {blocked}</p> : null}
        {country ? <CountryStill country={country} /> : null}
        {products.length === 0 ? <p className="mt-6 text-mist">{t("country_empty")}</p> : null}
        <div className="mt-8 grid gap-4">
          {products.map((item) => (
            <section key={item.id} className="glass p-5">
              <h2 className="display text-3xl">{item.name}</h2>
              <p className="mt-2 text-mist">{item.duration}</p>
              <p className="display ember mt-3 text-4xl">{item.basePrice} <span className="text-xl text-mist">EUR</span></p>
              <p className="mt-3 text-sm text-mist">{t("country_pace")}</p>
              <ul className="mt-2 grid gap-1 text-sm">
                {item.allowedProcessing.map((pace) => (
                  <li key={pace}>
                    {t(`speed_${pace}`)} · {productionWeeks(item.productionMinWeeks, item.productionMaxWeeks, pace)} {t("weeks")} · {priceFor(item.basePrice, pace)} EUR
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <h2 className="display mt-10 text-3xl">{t("country_openings")}</h2>
        {jobs.length === 0 ? <p className="mt-3 text-mist">{t("search_empty")}</p> : null}
        <ul className="mt-4 grid gap-3">
          {jobs.map((job) => (
            <li key={job.id} className="border-t border-white/10 py-3">
              <p className="display text-2xl">{job.title}</p>
              <p className="text-sm text-mist">{job.employer}</p>
              <p className="mt-2 text-sm">{country} · {products.find((item) => item.id === job.visaProductId)?.duration}</p>
              <p className="mt-1 text-sm text-paper">{job.salaryNet}</p>
              <p className="text-sm">{job.workingHours}</p>
              <p className="text-sm text-mist">{job.accommodation}</p>
              <p className="mt-1 text-sm text-mist">{job.quota > 0 ? `${job.quota} ${t("search_quota")}` : t("search_wait")}</p>
            </li>
          ))}
        </ul>
        <Link
          to="/"
          className="btn-solid mt-8 inline-flex items-center"
          onClick={() => {
            if (!country) return;
            const raw = window.sessionStorage.getItem("vg-last-calc");
            let prev: Record<string, string> = {};
            try {
              prev = raw ? (JSON.parse(raw) as Record<string, string>) : {};
            } catch {
              prev = {};
            }
            window.sessionStorage.setItem("vg-last-calc", JSON.stringify({ ...prev, country, productId: "", speed: "" }));
          }}
        >
          {t("country_file")}
        </Link>
      </article>
    </Shell>
  );
}
