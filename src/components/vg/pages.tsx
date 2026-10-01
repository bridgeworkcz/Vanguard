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
        <h1 className="display mt-3 text-4xl sm:text-5xl">{title}</h1>
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
  const [find, setFind] = useState("");
  const needle = find.trim().toLowerCase();
  const groups: { title: string; items: [string, string][] }[] = [
    {
      title: t("faq_g_pages"),
      items: [
        [t("faq_q5"), t("faq_a5")],
        [t("faq_q6"), t("faq_a6")],
        [t("faq_q7"), t("faq_a7")],
        [t("faq_q8"), t("faq_a8")],
        [t("faq_q9"), t("faq_a9")],
        [t("faq_q10"), t("faq_a10")],
        [t("faq_q11"), t("faq_a11")],
        [t("faq_q12"), t("faq_a12")],
      ],
    },
    {
      title: t("faq_g_order"),
      items: [
        [t("faq_q13"), t("faq_a13")],
        [t("faq_q14"), t("faq_a14")],
        [t("faq_q15"), t("faq_a15")],
        [t("faq_q4"), t("faq_a4")],
      ],
    },
    {
      title: t("faq_g_money"),
      items: [
        [t("faq_q1"), t("faq_a1")],
        [t("faq_q2"), t("faq_a2")],
        [t("faq_q16"), t("faq_a16")],
        [t("faq_q17"), t("faq_a17")],
        [t("faq_q3"), t("faq_a3")],
      ],
    },
    {
      title: t("faq_g_cabinet"),
      items: [
        [t("faq_q18"), t("faq_a18")],
        [t("faq_q19"), t("faq_a19")],
      ],
    },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item): item is [string, string] => !needle || `${item[0]} ${item[1]}`.toLowerCase().includes(needle)),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <Article kicker={t("faq_kicker")} title={t("faq_title")}>
      <p className="text-mist">{t("faq_intro")}</p>
      <input className="field max-w-sm" value={find} placeholder={t("faq_find")} onChange={(e) => setFind(e.target.value)} />
      {groups.length === 0 ? <p className="text-mist">{t("faq_none")}</p> : null}
      {groups.map((group) => (
        <section key={group.title} className="grid gap-5 border-t border-white/10 pt-8">
          <h2 className="display text-3xl">{group.title}</h2>
          {group.items.map(([q, a]) => (
            <div key={q}>
              <h3 className="display text-2xl">{q}</h3>
              <p className="mt-2 whitespace-pre-line text-mist">{a}</p>
            </div>
          ))}
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
  function hint(row: (typeof rows)[number]) {
    if (row.status === "CANCELLED") return t("status_help_cancelled");
    if (row.status === "REJECTED") return t("status_help_rejected");
    const stage = row.stage >= 1 && row.stage <= 4 ? row.stage : 1;
    return t(`stage_help_${stage}` as "stage_help_1");
  }
  function status(row: (typeof rows)[number]) {
    if (row.status === "CANCELLED") return t("status_cancelled");
    if (row.status === "REJECTED") return t("status_rejected");
    return t(`stage_${row.stage}` as "stage_1");
  }
  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-14">
        <p className="kicker ember">{t("filings_kicker")}</p>
        <h1 className="display mt-3 text-4xl sm:text-5xl">{t("filings_title")}</h1>
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
        <div className="sheet-wrap mt-6">
          <table className="sheet w-full min-w-[640px] text-left text-sm">
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
                  <td className="latin py-3" data-label={t("filings_id")}>{row.id}</td>
                  <td data-label={t("filings_from")}>{row.citizenship || "—"}</td>
                  <td data-label={t("filings_to")}>{row.country || "—"}</td>
                  <td className="latin" data-label={t("filings_date")}>{row.createdAt?.slice(0, 10) || "—"}</td>
                  <td data-label={t("filings_status")}>
                    <span>
                      <span className="ember block">{status(row)}</span>
                      <span className="mt-1 block text-xs text-mist">{hint(row)}</span>
                    </span>
                  </td>
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
