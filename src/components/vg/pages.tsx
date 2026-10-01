import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { listPublicFilings } from "@/lib/vanguard/api";
import { useI18n } from "@/lib/vanguard/i18n";
import { Shell } from "./chrome";

function Article({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <Shell>
      <article className="mx-auto max-w-3xl px-4 py-14">
        <p className="kicker ember">{kicker}</p>
        <h1 className="display mt-3 text-5xl">{title}</h1>
        <div className="mt-8 grid gap-6 text-base leading-relaxed">{children}</div>
      </article>
    </Shell>
  );
}

export function ProcessPage() {
  const { t } = useI18n();
  const steps = [
    [t("process_1t"), t("process_1b")],
    [t("process_2t"), t("process_2b")],
    [t("process_3t"), t("process_3b")],
    [t("process_4t"), t("process_4b")],
  ];
  return (
    <Article kicker={t("process_kicker")} title={t("process_title")}>
      <ol className="grid gap-4">
        {steps.map(([title, body], index) => (
          <li key={title} className="glass p-5">
            <p className="ember text-sm">0{index + 1}</p>
            <h2 className="display mt-1 text-3xl">{title}</h2>
            <p className="mt-2 text-mist">{body}</p>
          </li>
        ))}
      </ol>
    </Article>
  );
}

export function PapersPage() {
  const { t } = useI18n();
  return (
    <Article kicker={t("papers_kicker")} title={t("papers_title")}>
      <p className="text-mist">{t("papers_intro")}</p>
      <ul className="grid gap-3">
        {[t("papers_1"), t("papers_2"), t("papers_3"), t("papers_4"), t("papers_5")].map((line) => (
          <li key={line} className="border-t border-white/10 pt-3">
            {line}
          </li>
        ))}
      </ul>
    </Article>
  );
}

export function QuestionsPage() {
  const { t } = useI18n();
  const items = [
    [t("faq_q1"), t("faq_a1")],
    [t("faq_q2"), t("faq_a2")],
    [t("faq_q3"), t("faq_a3")],
    [t("faq_q4"), t("faq_a4")],
  ];
  return (
    <Article kicker={t("faq_kicker")} title={t("faq_title")}>
      {items.map(([q, a]) => (
        <section key={q}>
          <h2 className="display text-2xl">{q}</h2>
          <p className="mt-2 text-mist">{a}</p>
        </section>
      ))}
    </Article>
  );
}

export function AgentsPage() {
  const { t } = useI18n();
  return (
    <Article kicker={t("agents_kicker")} title={t("agents_title")}>
      <p>{t("agents_body")}</p>
      <ul className="grid gap-3">
        {[t("agents_1"), t("agents_2"), t("agents_3")].map((line) => (
          <li key={line} className="border-t border-white/10 pt-3">
            {line}
          </li>
        ))}
      </ul>
      <p>
        <Link to="/contact" className="btn-solid">
          {t("agents_write")}
        </Link>
      </p>
    </Article>
  );
}

const PAGE = 15;

export function FilingsPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listPublicFilings>>>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  useEffect(() => {
    listPublicFilings()
      .then(setRows)
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
  }, []);
  const filtered = rows.filter((row) => !query.trim() || row.id.toLowerCase().includes(query.trim().toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const current = Math.min(page, pages);
  const slice = filtered.slice((current - 1) * PAGE, current * PAGE);
  function status(row: (typeof rows)[number]) {
    if (row.status === "CANCELLED") return t("status_cancelled");
    if (row.status === "REJECTED") return t("status_rejected");
    return t(`stage_${row.stage}` as "stage_1");
  }
  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-14">
        <p className="kicker ember">{t("filings_kicker")}</p>
        <h1 className="display mt-3 text-5xl">{t("filings_title")}</h1>
        <p className="mt-3 max-w-2xl text-mist">{t("filings_hint")}</p>
        <input
          className="field mt-6 max-w-sm"
          value={query}
          placeholder={t("filings_search")}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
        />
        {err ? <p className="mt-4 text-metal">{err}</p> : null}
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-mist">
              <tr>
                <th className="py-2 font-medium">{t("filings_id")}</th>
                <th className="py-2 font-medium">{t("filings_from")}</th>
                <th className="py-2 font-medium">{t("filings_to")}</th>
                <th className="py-2 font-medium">{t("filings_date")}</th>
                <th className="py-2 font-medium">{t("filings_status")}</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.id} className="border-t border-white/10">
                  <td className="py-3">{row.id}</td>
                  <td>{row.citizenship || "—"}</td>
                  <td>{row.country || "—"}</td>
                  <td>{row.createdAt?.slice(0, 10) || "—"}</td>
                  <td className="ember">{status(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 ? <p className="mt-4 text-mist">{query.trim() ? t("filings_empty") : t("filings_none")}</p> : null}
        <Pager page={current} pages={pages} onPage={setPage} />
      </div>
    </Shell>
  );
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (n: number) => void }) {
  const { t } = useI18n();
  if (pages < 2) return null;
  const windowStart = Math.max(1, page - 2);
  const nums = Array.from({ length: Math.min(5, pages - windowStart + 1) }, (_, i) => windowStart + i);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t("filings_prev")}
      </button>
      {nums.map((n) => (
        <button key={n} type="button" className={n === page ? "btn-solid" : "btn"} onClick={() => onPage(n)}>
          {n}
        </button>
      ))}
      <button type="button" className="btn" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t("filings_next")}
      </button>
      <label className="flex items-center gap-2 text-mist">
        {t("filings_page")}
        <input
          className="field w-16"
          inputMode="numeric"
          defaultValue={page}
          key={page}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (n >= 1 && n <= pages) onPage(n);
          }}
        />
        <span>/ {pages}</span>
      </label>
    </div>
  );
}
