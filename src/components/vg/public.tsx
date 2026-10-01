import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Shell, storyKey, useSite } from "./chrome";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { createApplication } from "@/lib/vanguard/api";
import {
  CITIZENSHIPS,
  priceFor,
  productionWeeks,
  sameCountry,
  type Processing,
} from "@/lib/vanguard/domain";
import { useI18n } from "@/lib/vanguard/i18n";

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
  const products = data?.products.filter((p) => p.active && p.country === country) ?? [];
  const product = products.find((p) => p.id === productId);
  const countries = useMemo(() => Array.from(new Set(data?.products.filter((p) => p.active).map((p) => p.country) ?? [])), [data]);
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
    void navigate({
      to: "/search",
      search: { citizenship, country, product: product.id, speed },
    });
  }

  return (
    <Shell>
      <section className="min-h-[78vh]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 lg:grid-cols-12 lg:py-24">
          <div className="lg:col-span-6">
            <p className="kicker">{t("hero_kicker")}</p>
            <h1 className="display mt-4 max-w-xl text-5xl sm:text-6xl">{title}</h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-paper/80">{body}</p>
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
            <div className="mt-6 grid gap-4">
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_citizenship")}
                <select className="field" value={citizenship} onChange={(e) => setCitizenship(e.target.value)}>
                  <option value="">{t("calc_pick")}</option>
                  {CITIZENSHIPS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_country")}
                <select
                  className="field"
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
              </label>
              <label className="grid gap-1 text-sm text-mist">
                {t("calc_visa")}
                <select
                  className="field"
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
                <select className="field" value={speed} disabled={!product} onChange={(e) => setSpeed(e.target.value as Processing)}>
                  <option value="">{t("calc_pick")}</option>
                  {product?.allowedProcessing.map((p) => (
                    <option key={p} value={p}>
                      {speedLabel(t, p, product.productionMinWeeks, product.productionMaxWeeks)}
                    </option>
                  ))}
                </select>
              </label>
              {product && speed ? (
                <p className="text-sm text-mist">{t(`speed_hint_${speed}`)}</p>
              ) : (
                <p className="text-sm text-mist">{t("speed_hint_STANDARD")}</p>
              )}
              {msg ? <p className="text-sm text-metal">{msg}</p> : null}
              {error ? <p className="text-sm text-metal">{error}</p> : null}
              <button className="btn-solid" type="submit" disabled={!data}>
                {data ? t("calc_search") : t("loading")}
              </button>
            </div>
          </form>
        </div>
      </section>
      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 md:grid-cols-3">
        <p className="kicker md:col-span-3">{t("steps_kicker")}</p>
        {[
          [t("step1_t"), t("step1_b")],
          [t("step2_t"), t("step2_b")],
          [t("step3_t"), t("step3_b")],
        ].map(([h, b], i) => (
          <article key={h} className="border-t border-white/15 pt-4">
            <p className="text-metal">0{i + 1}</p>
            <h3 className="display mt-3 text-3xl">{h}</h3>
            <p className="mt-3 text-sm leading-relaxed text-mist">{b}</p>
          </article>
        ))}
      </section>
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
  const { data } = useSite();
  const visa = data?.products.find((p) => p.id === product);
  const pace = speed === "PRIORITY" || speed === "EXPRESS" || speed === "STANDARD" ? speed : null;
  const ok = visa && pace && visa.allowedProcessing.includes(pace) && !sameCountry(citizenship, visa.country);
  const weeks = visa && pace ? productionWeeks(visa.productionMinWeeks, visa.productionMaxWeeks, pace) : 0;
  const fee = visa && pace ? priceFor(visa.basePrice, pace) : 0;
  const jobs = data?.vacancies.filter((v) => v.active && v.visaProductId === product && v.quota > 0) ?? [];
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
                <p className="display mt-2 text-5xl">{fee}</p>
                <p className="text-mist">EUR</p>
              </div>
              <div>
                <p className="kicker">{t("search_window")}</p>
                <p className="display mt-2 text-5xl">{weeks}</p>
                <p className="text-mist">{t("weeks")}</p>
              </div>
              <div>
                <p className="kicker">{visa.country}</p>
                <p className="mt-2 text-lg">
                  {visa.name}
                  <span className="block text-mist">{visa.duration}</span>
                </p>
                <p className="mt-2 text-sm text-metal">{t(`speed_${pace}`)}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-4">
              {jobs.length === 0 ? <p className="text-mist">{t("search_empty")}</p> : null}
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  to="/vacancies/$id"
                  params={{ id: job.id }}
                  search={{ citizenship, product, speed: pace }}
                  className="glass grid gap-3 p-5 transition hover:bg-white/10 md:grid-cols-4"
                >
                  <div className="md:col-span-2">
                    <h2 className="display text-3xl">{job.title}</h2>
                    <p className="mt-1 text-sm text-mist">{job.employer}</p>
                  </div>
                  <p className="text-sm">{job.salaryNet}</p>
                  <p className="text-sm text-metal">
                    {job.quota} {t("search_quota")}
                  </p>
                </Link>
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
  const { user } = useCurrentUserState();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const job = data?.vacancies.find((v) => v.id === id);
  const visa = data?.products.find((p) => p.id === (product || job?.visaProductId));
  const pace = speed === "PRIORITY" || speed === "EXPRESS" || speed === "STANDARD" ? speed : "STANDARD";
  async function apply() {
    if (!job) return;
    if (!user) {
      sessionStorage.setItem("vg-intent", JSON.stringify({ vacancyId: job.id, citizenship, processing: pace }));
      void navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await createApplication({ data: { vacancyId: job.id, citizenship, processing: pace } });
      void navigate({ to: "/portal", search: { id: res.id } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
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
        <p className="kicker mt-6">{job.country}</p>
        <h1 className="display mt-3 text-5xl">{job.title}</h1>
        <p className="mt-3 text-lg text-metal">{job.employer}</p>
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
              <dd className="mt-1">{v}</dd>
            </div>
          ))}
        </dl>
        {err ? <p className="mt-4 text-sm text-metal">{err}</p> : null}
        {!user ? <p className="mt-4 text-sm text-mist">{t("need_account")}</p> : null}
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
  const office = data?.media.filter((m) => m.kind === "office") ?? [];
  const licenses = data?.media.filter((m) => m.kind === "license") ?? [];
  const partners = data?.partners ?? [];
  const countries = Array.from(new Set(partners.map((p) => p.country)));
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-16">
        <p className="kicker">{t("nav_about")}</p>
        <h1 className="display mt-4 text-5xl sm:text-6xl">{lead}</h1>
        <div className="mt-8 space-y-4 text-base leading-relaxed whitespace-pre-line">{story}</div>
      </article>
      <section className="mx-auto max-w-6xl px-4 pb-16">
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
            {licenses.length === 0 ? <p className="mt-6 text-mist">{t("about_license_empty")}</p> : null}
            <div className="mt-4 grid gap-3">
              {licenses.map((m) => (
                <img key={m.id} src={m.imageData} alt={m.title || t("about_license")} className="w-full border border-white/15" />
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="display text-4xl">{t("about_team")}</h2>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {data?.team.map((m) => (
            <li key={m.id}>
              {m.photoData ? (
                <img src={m.photoData} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-square w-full place-items-center bg-ivory text-4xl">{m.fullName.slice(0, 1)}</div>
              )}
              <p className="mt-3">{m.fullName}</p>
              <p className="text-sm text-mist">{m.position}</p>
              <p className="text-sm">{m.phone}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="border-t border-white/10 px-4 py-12">
        <div className="mx-auto max-w-6xl">
          <h2 className="display text-3xl">{t("about_partners")}</h2>
          <div className="mt-8 grid gap-8">
            {countries.map((c) => (
              <div key={c}>
                <p className="text-xs uppercase tracking-widest text-mist">{c}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {partners
                    .filter((p) => p.country === c)
                    .map((p) => (
                      <span key={p.id} className="wordmark">
                        {p.name}
                      </span>
                    ))}
                </div>
              </div>
            ))}
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
          <p className="kicker">{t("contact_kicker")}</p>
          <h1 className="display mt-4 text-5xl">{t("contact_title")}</h1>
        </div>
        <dl className="grid gap-6 text-lg">
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_address")}</dt>
            <dd className="mt-2">{s?.legal_address}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-widest text-mist">{t("contact_phone")}</dt>
            <dd className="mt-2">
              <a href={`tel:${s?.support_phone ?? ""}`}>{s?.support_phone}</a>
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
