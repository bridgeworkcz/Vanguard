import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Shell, storyKey, useDesk, useSite } from "./chrome";
import { createApplication, joinWaitlist } from "@/lib/vanguard/api";
import { CITIZENSHIPS, countrySlug, priceFor, productionWeeks, sameCountry, whatsAppHref, type Processing } from "@/lib/vanguard/domain";
import { VISA_PRODUCTS } from "@/lib/vanguard/seed";
import { citizenshipBlocked } from "@/lib/vanguard/ops";
import { useI18n, softenError } from "@/lib/vanguard/i18n";
import { CountryStill, CountLine, LogoStrip, LicenseWall, StepRail, VacancyShots } from "./media";

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
  const [agentNote, setAgentNote] = useState(false);
  useEffect(() => {
    setAgentNote(Boolean(sessionStorage.getItem("vg-agent")));
    const raw = window.localStorage.getItem("vg-last-calc");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { citizenship?: string; country?: string; productId?: string; speed?: Processing | "" };
      setCitizenship(saved.citizenship || "");
      setCountry(saved.country || "");
      setProductId(saved.productId || "");
      setSpeed(saved.speed || "");
      if (saved.citizenship && saved.country && saved.productId && saved.speed) setRestored(true);
    } catch {
      /* ignore a broken local note */
    }
  }, []);
  const catalog = data ? data.products : VISA_PRODUCTS;
  const products = catalog.filter((p) => p.active && p.country === country);
  const product = products.find((p) => p.id === productId);
  const countries = useMemo(() => {
    return Array.from(new Set(catalog.filter((p) => p.active && p.country).map((p) => p.country))).sort((a, b) => a.localeCompare(b));
  }, [catalog]);
  const settings = data?.settings ?? {};
  const title = settings[storyKey(lang, "hero_title")] || settings.hero_title_en;
  const body = settings[storyKey(lang, "hero_body")] || settings.hero_body_en;

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
    window.localStorage.setItem("vg-last-calc", JSON.stringify({ citizenship, country, productId: product.id, speed }));
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
            <p className="kicker ember">{t("hero_kicker")}</p>
            <h1 className="display mt-4 max-w-xl text-4xl sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-paper/80">{body}</p>
            {restored && product && speed ? (
              <button type="button" className="btn-solid mt-6" onClick={() => search()}>
                {t("calc_continue")}
              </button>
            ) : null}
            {agentNote ? <p className="mt-3 text-sm text-mist">{t("agent_kept")}</p> : null}
          </div>
          <form
            className="glass lg:col-span-6 p-5 sm:p-7"
            onSubmit={(e) => {
              e.preventDefault();
              search();
            }}
          >
            <p className="kicker">{t("calc_kicker")}</p>
            <h2 className="display mt-3 text-3xl">{t("calc_title")}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
                <select
                  className="field min-w-0"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setProductId("");
                    setSpeed("");
                  }}
                >
                  <option value="">{t("calc_pick")}</option>
                  {countries.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {country ? (
                  <Link to="/country/$code" params={{ code: countrySlug(country) }} className="text-xs text-mist underline-offset-4 hover:underline">
                    {t("country_openings")}
                  </Link>
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
              {product && speed ? (
                <p className="display ember text-5xl sm:col-span-2">{priceFor(product.basePrice, speed)} <span className="text-2xl text-mist">EUR</span></p>
              ) : null}
              {msg ? <p className="text-sm text-metal">{msg}</p> : null}
              {error ? <p className="text-sm text-metal">{error}</p> : null}
              <button className="btn-solid" type="submit" disabled={!data}>
                {data ? t("calc_search") : t("loading")}
              </button>
            </div>
          </form>
        </div>
      </section>
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
      <StepRail />
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
  const visa = data?.products.find((p) => p.id === product);
  const pace = speed === "PRIORITY" || speed === "EXPRESS" || speed === "STANDARD" ? speed : null;
  const ok = visa && pace && visa.allowedProcessing.includes(pace) && !sameCountry(citizenship, visa.country);
  const weeks = visa && pace ? productionWeeks(visa.productionMinWeeks, visa.productionMaxWeeks, pace) : 0;
  const fee = visa && pace ? priceFor(visa.basePrice, pace) : 0;
  const jobs = data?.vacancies.filter((v) => v.active && v.visaProductId === product && v.quota > 0 && !citizenshipBlocked(v.blockedCitizenships, citizenship)) ?? [];
  const full = data?.vacancies.filter((v) => v.active && v.visaProductId === product && v.quota < 1 && !citizenshipBlocked(v.blockedCitizenships, citizenship)) ?? [];
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
                <p className="kicker ember">{t("search_fee")}</p>
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
            {compared.length === 2 ? (
              <div className="mt-8">
                <h2 className="display text-3xl">{t("compare_title")}</h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {compared.map((job) => (
                    <article key={job.id} className="glass p-5">
                      <h3 className="display text-2xl">{job.title}</h3>
                      <p className="mt-1 text-sm text-mist">{job.employer}</p>
                      <dl className="mt-4 grid gap-2 text-sm">
                        <div><dt className="text-mist">{t("field_salary")}</dt><dd className="ember">{job.salaryNet}</dd></div>
                        <div><dt className="text-mist">{t("field_hours")}</dt><dd>{job.workingHours}</dd></div>
                        <div><dt className="text-mist">{t("field_housing")}</dt><dd>{job.accommodation}</dd></div>
                      </dl>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-8 grid gap-4">
              {jobs.length === 0 ? <p className="text-mist">{t("search_empty")}</p> : null}
              {full.map((job) => (
                <div key={job.id} className="glass grid gap-3 p-5 md:grid-cols-4">
                  <div className="md:col-span-2">
                    <h2 className="display text-3xl">{job.title}</h2>
                    <p className="mt-1 text-sm text-mist">{job.employer}</p>
                    <p className="mt-2 text-sm text-mist">{t("search_wait")}</p>
                  </div>
                  <p className="text-sm ember">{job.salaryNet}</p>
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
              {jobs.map((job) => (
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
                  </div>
                  <p className="text-sm ember">{job.salaryNet}</p>
                  <p className="text-sm text-metal">
                    {job.quota} {t("search_quota")}
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
  const { t } = useI18n();
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
      const res = await createApplication({ data: { vacancyId: job.id, citizenship, processing: pace, agentCode: agentCode.trim() } });
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
      <article className="mx-auto max-w-3xl px-4 py-12">
        <button type="button" className="text-sm text-mist" onClick={() => history.back()}>
          {t("search_back")}
        </button>
        <p className="kicker ember mt-6">{job.country}</p>
        <h1 className="display mt-3 text-5xl">{job.title}</h1>
        <p className="mt-3 text-lg text-metal">{job.employer}</p>
        <VacancyShots vacancyId={job.id} />
        <p className="mt-6 leading-relaxed text-paper/85">{job.description}</p>
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            [t("field_salary"), job.salaryNet],
            [t("field_hours"), job.workingHours],
            [t("field_housing"), job.accommodation],
            [t("field_requirements"), job.requirements],
            [t("permit"), `${visa.name}, ${visa.duration}`],
            [t("fee"), visa && pace ? `${priceFor(visa.basePrice, pace)} EUR` : ""],
          ].map(([k, v]) => (
            <div key={k} className="border-t border-white/15 pt-3">
              <dt className="text-xs uppercase tracking-widest text-mist">{k}</dt>
              <dd className={`mt-1 ${k === t("fee") ? "ember" : ""}`}>{v}</dd>
            </div>
          ))}
        </dl>
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
        <button type="button" className="btn-solid mt-6" disabled={busy || !citizenship} onClick={() => void apply()}>
          {busy ? t("applying") : t("search_apply")}
        </button>
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
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="kicker ember">{t("nav_about")}</p>
        <h1 className="display mt-4 text-5xl sm:text-6xl">{lead}</h1>
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
        <div className="overflow-hidden border border-white/15">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <p className="text-sm">{s.legal_address}</p>
            <a
              className="ember text-sm"
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.legal_address || "Rybná 716/24, Praha 1")}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("map_open")}
            </a>
          </div>
          <iframe
            title={s.legal_address || "Praha"}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(s.legal_address || "Rybná 716/24, Staré Město, 110 00 Praha 1")}&z=16&output=embed`}
            className="h-[440px] w-full"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data?.team.map((m) => (
            <li key={m.id}>
              {m.photoData ? (
                <img src={m.photoData} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-ivory text-4xl">{m.fullName.slice(0, 1)}</div>
              )}
              <p className="mt-3">{m.fullName}</p>
              <p className="text-sm text-mist">{m.position}</p>
              <p className="text-sm">
                {m.phone ? (
                  <a href={whatsAppHref(m.phone)} target="_blank" rel="noopener noreferrer" className="ember">
                    {m.phone}
                  </a>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      </section>
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
                    <span>{c}</span>
                    <span className="ember text-[11px] tracking-[0.14em] uppercase">{open ? "–" : "+"} {list.length}</span>
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
  return (
    <Shell>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
        <div>
          <p className="kicker ember">{t("contact_kicker")}</p>
          <h1 className="display mt-4 text-5xl">{t("contact_title")}</h1>
          {s?.support_phone ? (
            <a className="btn-solid mt-8 inline-flex w-fit" href={whatsAppHref(s.support_phone)} target="_blank" rel="noopener noreferrer">
              WhatsApp · {s.support_phone}
            </a>
          ) : null}
        </div>
        <dl className="grid gap-6 text-lg">
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_address")}</dt>
            <dd className="mt-2">{s?.legal_address}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_phone")}</dt>
            <dd className="mt-2 ember">
              {s?.support_phone ? (
                <a href={whatsAppHref(s.support_phone)} target="_blank" rel="noopener noreferrer">
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
          {s?.usdt_wallet ? (
            <div>
              <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_wallet")}</dt>
              <dd className="mt-2 break-all">
                {s.usdt_wallet}
                {s.usdt_network ? <span className="mt-1 block text-sm text-mist">{s.usdt_network}</span> : null}
              </dd>
            </div>
          ) : null}
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
  return (
    <Shell>
      <article className="mx-auto max-w-5xl px-4 py-14">
        <p className="kicker ember">{t("country_kicker")}</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">{country || t("country_empty")}</h1>
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
              <p className="mt-2 text-sm ember">{job.salaryNet}</p>
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
            const raw = window.localStorage.getItem("vg-last-calc");
            let prev: Record<string, string> = {};
            try {
              prev = raw ? (JSON.parse(raw) as Record<string, string>) : {};
            } catch {
              prev = {};
            }
            window.localStorage.setItem("vg-last-calc", JSON.stringify({ ...prev, country, productId: "", speed: "" }));
          }}
        >
          {t("country_file")}
        </Link>
      </article>
    </Shell>
  );
}
