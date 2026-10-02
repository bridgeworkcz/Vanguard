import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { Shell, useDesk, useSite } from "./chrome";
import {
  cancelMyApplication,
  createApplication,
  downloadDocument,
  getMyApplication,
  getSessionProfile,
  listAgentBook,
  listMyApplications,
  postMessage,
  resubmitApplication,
  saveQuestionnaire,
  takeInvoiceNumber,
  updateMyContact,
  uploadMyDocument,
  type AppRow,
} from "@/lib/vanguard/api";
import {
  DOC_CATEGORIES,
  EMPTY_QUESTIONNAIRE,
  clientName,
  invoice2Unlocked,
  parseQuestionnaire,
  tranches,
  whatsAppHref,
  type DocCategory,
  type Questionnaire,
} from "@/lib/vanguard/domain";
import { useI18n, type CopyKey } from "@/lib/vanguard/i18n";
import { canCancel, stageTone } from "@/lib/vanguard/ops";
import { buildContract, buildInvoice, buildOffer, downloadStamped } from "@/lib/vanguard/pdf";
import { DocScreen } from "./doc-view";

function remain(iso: string | null, now: number) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "0";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, "0")}m`;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function daysLeft(iso: string | null, now: number) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 86400000));
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function sniffMime(file: File): string {
  const raw = (file.type || "").toLowerCase().split(";")[0].trim();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (raw === "image/jpeg" || raw === "image/png" || raw === "image/webp" || raw === "application/pdf") return raw;
  const ext = file.name.toLowerCase().split(".").pop() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return raw;
}

function shrinkImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const max = 1800;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("type"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) reject(new Error("type"));
          else resolve(blob);
        },
        "image/jpeg",
        0.72,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("type"));
    };
    img.src = url;
  });
}

async function packFile(file: File): Promise<{ data: string; mime: string; fileName: string }> {
  const mime = sniffMime(file);
  if (mime.startsWith("image/")) {
    const blob = await shrinkImage(file);
    const data = await readDataUrl(blob);
    if (data.length > 2_400_000) throw new Error("size");
    return { data, mime: "image/jpeg", fileName: file.name.replace(/\.\w+$/, "") + ".jpg" };
  }
  if (mime !== "application/pdf") throw new Error("type");
  const data = await readDataUrl(file);
  if (data.length > 2_400_000) throw new Error("size");
  return { data, mime, fileName: file.name };
}

function statusLabel(app: AppRow, t: (k: CopyKey) => string) {
  if (app.status === "CANCELLED") return t("status_cancelled");
  if (app.status === "REJECTED") return t("status_rejected");
  return t(`stage_${app.stage}` as CopyKey);
}

function nextAction(app: AppRow, hasProof: boolean, rejected: boolean, t: (k: CopyKey) => string) {
  if (app.status !== "OPEN") return t("portal_next_closed");
  if (app.stage === 1 && !app.profileComplete) return t("portal_next_q");
  if (app.stage === 1) return t("portal_next_wait");
  if (app.stage === 2 && !hasProof) return t("portal_next_pay");
  if (rejected) return t("portal_next_docs");
  if (app.stage >= 4) return t("portal_next_final");
  return t("portal_next_docs");
}

function soon(iso: string | null, now: number) {
  if (!iso) return false;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return false;
  return ms <= 3 * 86400000;
}

export function PortalPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { pending, signedIn, deskId } = useDesk();
  const navigate = useNavigate();
  const { data: site } = useSite();
  const [rows, setRows] = useState<AppRow[] | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getMyApplication>> | null>(null);
  const [q, setQ] = useState<Questionnaire>(EMPTY_QUESTIONNAIRE);
  const [msg, setMsg] = useState("");
  const [note, setNote] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [err, setErr] = useState("");
  const [contact, setContact] = useState({ email: "", phone: "" });
  const [contactMsg, setContactMsg] = useState("");
  const [role, setRole] = useState("");
  const [book, setBook] = useState<Awaited<ReturnType<typeof listAgentBook>> | null>(null);
  const [share, setShare] = useState("");
  const [preview, setPreview] = useState<{ url: string; name: string; tranche?: 1 | 2 | 3 } | null>(null);
  const [pendingDocs, setPendingDocs] = useState<Partial<Record<DocCategory, File>>>({});
  const [docNote, setDocNote] = useState("");
  const [docBusy, setDocBusy] = useState(false);
  const [proofNote, setProofNote] = useState("");

  async function refreshList() {
    const list = await listMyApplications();
    setRows(list);
  }
  async function refreshDetail(appId: string) {
    const d = await getMyApplication({ data: appId });
    setDetail(d);
    const parsed = parseQuestionnaire(d.app.questionnaire);
    if (!parsed.firstName && !parsed.lastName) {
      try {
        const raw = localStorage.getItem(`vg-draft-${appId}`);
        setQ(raw ? { ...parsed, ...JSON.parse(raw) } : parsed);
      } catch {
        setQ(parsed);
      }
    } else {
      setQ(parsed);
    }
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!detail) return;
    try {
      const key = "vg-stage-seen";
      const seen = JSON.parse(localStorage.getItem(key) || "{}") as Record<string, string>;
      seen[detail.app.id] = `${detail.app.status}:${detail.app.stage}`;
      localStorage.setItem(key, JSON.stringify(seen));
      window.dispatchEvent(new Event("vg-stage-seen"));
    } catch {
      /* storage unavailable */
    }
  }, [detail]);

  useEffect(() => {
    if (!signedIn) return;
    getSessionProfile()
      .then((p) => {
        setContact({ email: p.email, phone: p.phone });
        setRole(p.role);
        if (p.role === "ADMIN" || p.role === "MANAGER") void navigate({ to: "/admin", search: { tab: "overview", id: "" } });
        if (p.role === "SUBAGENT") return listAgentBook().then(setBook);
        return undefined;
      })
      .catch(() => undefined);
  }, [deskId]);

  useEffect(() => {
    if (!book?.code) {
      setShare("");
      return;
    }
    setShare(`${window.location.origin}/r/${encodeURIComponent(book.code)}`);
  }, [book?.code]);

  useEffect(() => {
    if (!signedIn) return;
    const raw = sessionStorage.getItem("vg-intent");
    if (!raw) {
      void refreshList().catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
      return;
    }
    sessionStorage.removeItem("vg-intent");
    const intent = JSON.parse(raw) as { vacancyId: string; citizenship: string; processing: "STANDARD" | "PRIORITY" | "EXPRESS"; agentCode?: string };
    createApplication({ data: intent })
      .then((res) => navigate({ to: "/portal", search: { id: res.id } }))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
  }, [deskId]);

  useEffect(() => {
    if (!signedIn || !id) {
      setDetail(null);
      return;
    }
    void refreshDetail(id).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
  }, [deskId, id]);

  useEffect(() => {
    const current = detail?.app;
    if (!current || current.profileComplete || current.stage !== 1) return;
    localStorage.setItem(`vg-draft-${current.id}`, JSON.stringify(q));
  }, [q, detail]);

  if (pending) {
    return (
      <Shell>
        <p className="px-4 py-16">{t("loading")}</p>
      </Shell>
    );
  }
  if (!signedIn) return <RedirectToSignIn />;

  const app = detail?.app;
  const visa = site?.products.find((p) => p.id === app?.visaProductId);
  const parts = app ? tranches(app.totalCost) : null;
  const proof = detail?.documents.find((d) => d.category === "PAYMENT_PROOF");
  const finals = detail?.documents.filter((d) => d.category === "FINAL") ?? [];
  const qErrKey = msg ? (`q_err_${msg}` as CopyKey) : null;

  async function saveQ() {
    if (!app) return;
    setMsg("");
    const res = await saveQuestionnaire({ data: { id: app.id, questionnaire: q } });
    if (!res.ok) {
      setMsg(res.error);
      return;
    }
    await refreshDetail(app.id);
    await refreshList();
  }

  function uploadError(err: unknown) {
    const text = err instanceof Error ? err.message : "";
    if (/quota/i.test(text)) return t("docs_quota");
    if (/Drive\s*(403|404)|insufficient|permission/i.test(text)) return t("docs_drive");
    if (/Drive/i.test(text)) {
      const code = text.match(/\b([45]\d{2})\b/)?.[1];
      return code ? `${t("docs_fail")} (${code})` : t("docs_fail");
    }
    if (/size/i.test(text)) return t("docs_big");
    if (/type/i.test(text)) return t("docs_type");
    return t("docs_fail");
  }

  async function sendFile(category: DocCategory, file: File) {
    if (!app) return;
    const packed = await packFile(file);
    await uploadMyDocument({ data: { applicationId: app.id, category, ...packed } });
    await refreshDetail(app.id);
  }

  async function saveDocs() {
    if (!app || docBusy) return;
    const entries = Object.entries(pendingDocs).filter((entry): entry is [DocCategory, File] => Boolean(entry[1]));
    if (!entries.length) {
      setDocNote(t("docs_none"));
      return;
    }
    setDocBusy(true);
    setDocNote(t("docs_wait"));
    const bad: string[] = [];
    const done: DocCategory[] = [];
    for (const [cat, file] of entries) {
      try {
        await sendFile(cat, file);
        done.push(cat);
      } catch (err) {
        bad.push(`${t(`cat_${cat}`)} — ${uploadError(err)}`);
      }
    }
    setPendingDocs((cur) => {
      const next = { ...cur };
      for (const cat of done) delete next[cat];
      return next;
    });
    setDocBusy(false);
    setDocNote(bad.length ? bad.join(" · ") : t("docs_saved"));
  }

  function showPreview(next: { url: string; name: string; tranche?: 1 | 2 | 3 }) {
    setPreview((cur) => {
      if (cur?.url) URL.revokeObjectURL(cur.url);
      return next;
    });
  }

  async function invoice(tranche: 1 | 2 | 3) {
    if (!app || !site || !visa) return;
    const url = await buildInvoice({
      lang,
      tranche,
      settings: site.settings,
      fileId: app.id,
      client: clientName(parseQuestionnaire(app.questionnaire)),
      country: app.country,
      permit: visa.name,
      duration: visa.duration,
      employer: app.employer,
      total: app.totalCost,
      date: new Date().toISOString().slice(0, 10),
      hold: true,
    });
    if (url) showPreview({ url, name: `${app.id}-invoice-${tranche}.pdf`, tranche });
  }

  async function offer() {
    if (!app || !site) return;
    const job = site.vacancies.find((item) => item.id === app.vacancyId);
    const person = parseQuestionnaire(app.questionnaire);
    const url = await buildOffer({
      lang,
      settings: site.settings,
      fileId: app.id,
      client: clientName(person),
      country: app.country,
      title: app.vacancyTitle,
      employer: app.employer,
      salary: job?.salaryNet || "",
      hours: job?.workingHours || "",
      housing: job?.accommodation || "",
      date: new Date().toISOString().slice(0, 10),
      hold: true,
    });
    if (url) showPreview({ url, name: `${app.id}-offer.pdf` });
  }

  async function contract() {
    if (!app || !site || !visa) return;
    const person = parseQuestionnaire(app.questionnaire);
    const url = await buildContract({
      lang,
      settings: site.settings,
      fileId: app.id,
      client: clientName(person),
      q: person,
      country: app.country,
      permit: visa.name,
      duration: visa.duration,
      total: app.totalCost,
      date: new Date().toISOString().slice(0, 10),
      hold: true,
    });
    if (url) showPreview({ url, name: `${app.id}-agreement.pdf` });
  }

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="kicker ember">{t("portal_kicker")}</p>
        <h1 className="display mt-3 text-5xl">{t("portal_title")}</h1>
        {err ? <p className="mt-4 text-metal">{err}</p> : null}
        {!id && role === "SUBAGENT" && book ? (
          <section className="mt-8 grid gap-4">
            <p className="kicker ember">{t("desk_kicker")}</p>
            <h2 className="display text-4xl">{t("desk_title")}</h2>
            <p className="max-w-2xl text-sm text-mist">{t("desk_only")}</p>
            <div className="glass grid gap-4 p-5 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-mist">{t("desk_code")}</p>
                <p className="mt-1 text-lg">{book.code}</p>
                <p className="text-sm text-mist">{book.email}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-mist">{t("desk_month")}</p>
                <p className="mt-1">{book.month}</p>
                <p className="text-sm text-mist">{t("desk_rate")} {book.rate}%</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-mist">{t("desk_commission")}</p>
                <p className="display ember text-4xl">{book.commission}</p>
                <p className="text-mist">EUR</p>
              </div>
            </div>
            <p className="text-sm text-mist">{t("desk_code_help")}</p>
            <div>
              <p className="text-xs uppercase tracking-widest text-mist">{t("desk_link")}</p>
              <p className="latin mt-1 break-all text-sm">{share}</p>
              <p className="mt-1 text-sm text-mist">{t("desk_link_help")}</p>
              <button
                type="button"
                className="btn mt-2"
                onClick={() => {
                  if (share) void navigator.clipboard.writeText(share).catch(() => undefined);
                }}
              >
                {t("desk_copy")}
              </button>
            </div>
            {book.cases.length === 0 ? <p className="text-mist">{t("desk_empty")}</p> : null}
            <div className="sheet-wrap">
              <table className="sheet w-full min-w-[640px] text-left text-sm">
                <thead className="text-mist">
                  <tr>
                    <th className="py-2 font-medium">{t("filings_id")}</th>
                    <th className="py-2 font-medium">{t("name")}</th>
                    <th className="py-2 font-medium">{t("filings_from")}</th>
                    <th className="py-2 font-medium">{t("filings_to")}</th>
                    <th className="py-2 font-medium">{t("filings_date")}</th>
                    <th className="py-2 font-medium">{t("filings_status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {book.cases.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="latin py-3" data-label={t("filings_id")}>{row.id}</td>
                      <td data-label={t("name")}>{row.name}</td>
                      <td data-label={t("filings_from")}>{row.citizenship || "—"}</td>
                      <td data-label={t("filings_to")}>{row.country}</td>
                      <td className="latin" data-label={t("filings_date")}>{row.createdAt?.slice(0, 10)}</td>
                      <td className="ember" data-label={t("filings_status")}>{row.status === "CANCELLED" ? t("status_cancelled") : row.status === "REJECTED" ? t("status_rejected") : t(`stage_${row.stage}` as CopyKey)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {!id ? (
          <div className="mt-8 grid gap-6">
            <form
              className="glass grid gap-3 p-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                setContactMsg("");
                void updateMyContact({ data: contact })
                  .then(() => setContactMsg(t("contact_saved")))
                  .catch((e: unknown) => {
                    const text = e instanceof Error ? e.message : "Error";
                    setContactMsg(text === "Locked" ? t("contact_locked") : text);
                  });
              }}
            >
              <p className="sm:col-span-3 text-sm text-mist">{t("contact_edit")}</p>
              <p className="sm:col-span-3 text-xs text-mist">{t("contact_once")}</p>
              <input className="field" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              <input className="field" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              <button className="btn" type="submit">{t("save")}</button>
              {contactMsg ? <p className="sm:col-span-3 text-sm text-metal">{contactMsg}</p> : null}
            </form>
          <ul className="grid gap-3">
            {rows && rows.length === 0 ? <li className="text-mist">{t("portal_empty")}</li> : null}
            {rows?.map((row) => (
              <li key={row.id}>
                <Link to="/portal" search={{ id: row.id }} className="glass grid gap-2 p-4 sm:grid-cols-4">
                  <span className="display text-2xl sm:col-span-2">{row.vacancyTitle || row.country}</span>
                  <span className="text-sm text-mist">{row.country}</span>
                  <span className={`text-sm ${stageTone(row.status, row.stage)}`}>{statusLabel(row, t)}</span>
                </Link>
              </li>
            ))}
          </ul>
          </div>
        ) : app ? (
          <div className="mt-8 grid gap-6">
            <Link to="/portal" search={{ id: "" }} className="text-sm text-mist">
              {t("portal_back")}
            </Link>
            {rows && rows.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                <span className="self-center text-xs uppercase tracking-widest text-mist">{t("portal_switch")}</span>
                {rows.map((row) => (
                  <Link key={row.id} to="/portal" search={{ id: row.id }} className={row.id === app.id ? "btn-solid" : "btn"}>
                    {row.country}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="glass p-5">
              <p className="kicker">{app.id}</p>
              <h2 className="display mt-2 text-4xl">{app.vacancyTitle}</h2>
              <p className="mt-2 text-mist">
                {app.employer} · {app.country} · {app.totalCost} EUR · {t(`speed_${app.processing}`)}
              </p>
              <p className={`mt-4 text-lg ${stageTone(app.status, app.stage)}`}>{nextAction(app, Boolean(proof), Boolean(detail?.documents.some((d) => d.status === "REJECTED")), t)}</p>
              {(soon(app.cancelDeadlineAt, now) || soon(app.docDeadlineAt, now)) && app.status === "OPEN" ? (
                <p className="mt-2 text-sm ember">
                  {t("portal_remind")}
                  {site?.settings.support_phone ? (
                    <>
                      {" "}
                      <a className="underline" href={whatsAppHref(site.settings.support_phone, `${app.id}. ${t("portal_remind")}`)} target="_blank" rel="noopener noreferrer">
                        {t("wa_remind")}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
              <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[t("track_1"), t("track_2"), t("track_3"), t("track_4")].map((label, index) => {
                  const tone = ["stage-wait", "stage-pay", "stage-move", "stage-go"][index] ?? "text-mist";
                  const on = app.stage >= index + 1;
                  return (
                    <li key={label} className={on ? `border-t-2 pt-2 text-sm ${tone}` : "border-t border-white/20 pt-2 text-sm text-mist"}>
                      <span className={on ? tone : "text-mist"}>0{index + 1}</span>
                      <span className="mt-1 block">{label}</span>
                    </li>
                  );
                })}
              </ol>
              {app.status === "REJECTED" && app.rejectionReason ? <p className="mt-2">{app.rejectionReason}</p> : null}
              {app.status === "REJECTED" ? (
                <button
                  type="button"
                  className="btn-solid mt-3"
                  onClick={() =>
                    void resubmitApplication({ data: app.id }).then((res) => navigate({ to: "/portal", search: { id: res.id } }))
                  }
                >
                  {t("resubmit")}
                </button>
              ) : null}
              {parts ? (
                <p className="mt-3 text-sm text-mist">
                  30% {parts.first} EUR · {app.stage >= 2 ? t("portal_paid") : t("portal_due")}
                  {" · "}40% {parts.second} EUR · {app.stage >= 3 ? t("portal_paid") : t("portal_due")}
                  {" · "}30% {parts.final} EUR · {app.stage >= 4 ? t("portal_paid") : t("portal_due")}
                </p>
              ) : null}
            </div>

            {app.status === "CANCELLED" ? <p>{t("cancel_done")}</p> : null}

            {app.status === "OPEN" && app.stage === 1 && !app.profileComplete ? (
              <form
                className="glass grid gap-3 p-5 sm:p-7"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveQ();
                }}
              >
                <h3 className="display text-3xl">{t("q_title")}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input className="field" placeholder={t("q_first")} value={q.firstName} onChange={(e) => setQ({ ...q, firstName: e.target.value })} />
                  <input className="field" placeholder={t("q_last")} value={q.lastName} onChange={(e) => setQ({ ...q, lastName: e.target.value })} />
                  <input className="field" placeholder={t("q_middle")} disabled={q.middleNameAbsent} value={q.middleName} onChange={(e) => setQ({ ...q, middleName: e.target.value })} />
                  <label className="flex min-h-12 items-center gap-2 text-sm">
                    <input type="checkbox" checked={q.middleNameAbsent} onChange={(e) => setQ({ ...q, middleNameAbsent: e.target.checked, middleName: "" })} />
                    {t("q_no_middle")}
                  </label>
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_birth")}
                    <input className="field" type="date" value={q.birthDate} onChange={(e) => setQ({ ...q, birthDate: e.target.value })} />
                  </label>
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_gender")}
                    <select className="field" value={q.gender} onChange={(e) => setQ({ ...q, gender: e.target.value })}>
                      <option value="" />
                      <option value="f">{t("q_gender_f")}</option>
                      <option value="m">{t("q_gender_m")}</option>
                      <option value="x">{t("q_gender_x")}</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_citizen")}
                    <input className="field" value={q.citizenship} onChange={(e) => setQ({ ...q, citizenship: e.target.value })} />
                  </label>
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_phone")}
                    <input className="field" value={q.phone} onChange={(e) => setQ({ ...q, phone: e.target.value })} />
                  </label>
                </div>
                <fieldset className="grid gap-2 text-sm">
                  <legend>{t("q_record")}</legend>
                  <label className="flex gap-2"><input type="radio" name="rec" checked={q.criminalRecord === "no"} onChange={() => setQ({ ...q, criminalRecord: "no" })} />{t("q_no")}</label>
                  <label className="flex gap-2"><input type="radio" name="rec" checked={q.criminalRecord === "yes"} onChange={() => setQ({ ...q, criminalRecord: "yes" })} />{t("q_yes")}</label>
                </fieldset>
                <fieldset className="grid gap-2 text-sm">
                  <legend>{t("q_prev")}</legend>
                  <label className="flex gap-2"><input type="radio" name="visa" checked={q.previousVisa === "no"} onChange={() => setQ({ ...q, previousVisa: "no" })} />{t("q_no")}</label>
                  <label className="flex gap-2"><input type="radio" name="visa" checked={q.previousVisa === "yes"} onChange={() => setQ({ ...q, previousVisa: "yes" })} />{t("q_yes")}</label>
                </fieldset>
                <fieldset className="grid gap-2 text-sm">
                  <legend>{t("q_family")}</legend>
                  <label className="flex gap-2"><input type="radio" name="fam" checked={q.travelWithFamily === "alone"} onChange={() => setQ({ ...q, travelWithFamily: "alone" })} />{t("q_alone")}</label>
                  <label className="flex gap-2"><input type="radio" name="fam" checked={q.travelWithFamily === "family"} onChange={() => setQ({ ...q, travelWithFamily: "family" })} />{t("q_with")}</label>
                </fieldset>
                {qErrKey ? <p className="text-metal">{t(qErrKey)}</p> : null}
                <p className="kicker ember">{t("hint_here")}</p>
                <button className="btn-solid step-live w-fit" type="submit">{t("q_save")}</button>
              </form>
            ) : null}

            {app.status === "OPEN" && app.stage === 1 && app.profileComplete ? <p>{t("status_wait")}</p> : null}
            {app.stage === 1 ? <p className="text-sm text-mist">{t("locked_pdf")}</p> : null}

            {app.status === "OPEN" && app.stage === 2 ? (
              <div className="glass p-5">
                <p>
                  {t("cancel_in")}: {proof ? t("proof_pending") : remain(app.cancelDeadlineAt, now)}
                </p>
                {canCancel(app.status, app.stage, app.cancelDeadlineAt, Boolean(proof)) ? (
                  <button
                    type="button"
                    className="btn mt-3"
                    onClick={() =>
                      void cancelMyApplication({ data: app.id }).then(() => Promise.all([refreshDetail(app.id), refreshList()]))
                    }
                  >
                    {t("cancel_btn")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {app.status === "OPEN" && app.stage >= 2 ? (
              <div className="flex flex-wrap gap-3">
                <h3 className="w-full display text-3xl">{t("portal_folder")}</h3>
                <button type="button" className="btn" onClick={() => void invoice(1)}>{t("invoice_1")}</button>
                <button type="button" className="btn" onClick={() => void offer()}>{t("offer")}</button>
                <button type="button" className="btn" onClick={() => void contract()}>{t("contract")}</button>
                {app.stage >= 3 && invoice2Unlocked(app.processStage) ? (
                  <button type="button" className="btn" onClick={() => void invoice(2)}>{t("invoice_2")}</button>
                ) : app.stage >= 2 ? (
                  <p className="self-center text-sm text-mist">{t("invoice2_locked")}</p>
                ) : null}
                {app.stage >= 4 ? (
                  <>
                    {detail?.documents.some((d) => d.status === "REJECTED") ? null : <p className="kicker ember w-full">{t("hint_here")}</p>}
                    <button type="button" className={`btn ${detail?.documents.some((d) => d.status === "REJECTED") ? "" : "step-live"}`} onClick={() => void invoice(3)}>{t("invoice_3")}</button>
                  </>
                ) : null}
              </div>
            ) : null}

            {app.status === "OPEN" && app.stage === 2 ? (
              <label className={`grid gap-2 rounded-2xl p-4 text-sm ${proof ? "" : "step-live"}`}>
                {proof ? null : <span className="kicker ember">{t("hint_here")}</span>}
                {t("proof_title")}
                <span className="text-mist">{t("proof_help")}</span>
                <label className="btn relative mt-2 inline-flex w-fit cursor-pointer items-center overflow-hidden">
                  {t("upload")}
                  <input
                    className="absolute inset-0 z-10 cursor-pointer opacity-0"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      setProofNote(t("docs_wait"));
                      void sendFile("PAYMENT_PROOF", file)
                        .then(() => setProofNote(t("docs_saved")))
                        .catch((err: unknown) => setProofNote(uploadError(err)));
                    }}
                  />
                </label>
                {proofNote ? <span className="text-mist">{proofNote}</span> : null}
              </label>
            ) : null}

            {app.status === "OPEN" && app.stage >= 2 ? (
              <div className={app.stage === 4 && !detail?.documents.some((d) => d.status === "REJECTED") ? "" : proof || app.stage > 2 ? "step-live rounded-2xl p-4" : ""}>
                {app.stage === 4 && !detail?.documents.some((d) => d.status === "REJECTED") ? null : proof || app.stage > 2 ? <p className="kicker ember mb-3">{t("hint_here")}</p> : null}
                <h3 className="display text-3xl">{t("checklist_title")}</h3>
                <ul className="mt-3 grid gap-2 text-sm">
                  {DOC_CATEGORIES.filter((c) => c !== "PAYMENT_PROOF" && c !== "FINAL").map((cat) => {
                    const files = [...(detail?.documents.filter((d) => d.category === cat) ?? [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                    const latest = files[0];
                    const label = !latest ? t("checklist_miss") : latest.status === "REJECTED" ? t("checklist_no") : latest.status === "APPROVED" ? t("checklist_ok") : t("checklist_wait");
                    return (
                      <li key={cat} className="flex items-baseline justify-between gap-3 border-t border-white/10 py-2">
                        <span>{t(`cat_${cat}`)}</span>
                        <span className={latest?.status === "REJECTED" ? "ember" : "text-mist"}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
                <h3 className="display mt-8 text-3xl">{t("docs_title")}</h3>
                <p className="mt-2 text-sm text-mist">{t("docs_help")}</p>
                <ul className="mt-4 grid gap-3">
                  {DOC_CATEGORIES.filter((c) => c !== "PAYMENT_PROOF" && c !== "FINAL").map((cat) => {
                    const files = detail?.documents.filter((d) => d.category === cat) ?? [];
                    return (
                      <li key={cat} className="border-t border-white/10 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t(`cat_${cat}`)}</span>
                          <span className="text-sm text-mist">{files.length ? t("uploaded") : t("checklist_miss")}</span>
                        </div>
                        <div className="mt-2 grid gap-2">
                          {files.map((doc) => (
                            <article key={doc.id} className="bg-white/5 p-3 text-sm">
                              <p>{doc.fileName}</p>
                              <p className="text-mist">
                                {doc.createdAt?.slice(0, 16)} · {doc.status === "REJECTED" ? t("admin_doc_no") : doc.status === "APPROVED" ? t("admin_doc_ok") : t("uploaded")}
                              </p>
                              {doc.rejectionReason ? <p className="mt-1">{doc.rejectionReason}</p> : null}
                            </article>
                          ))}
                        </div>
                        <label className="btn relative mt-2 inline-flex w-fit cursor-pointer items-center overflow-hidden">
                          {t("upload")}
                          <input
                            className="absolute inset-0 z-10 cursor-pointer opacity-0"
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              setPendingDocs((cur) => ({ ...cur, [cat]: file }));
                              setDocNote("");
                            }}
                          />
                        </label>
                        {pendingDocs[cat] ? <p className="mt-1 text-sm text-mist">{pendingDocs[cat]?.name} · {t("docs_chosen")}</p> : null}
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className="btn-solid mt-4" disabled={docBusy} onClick={() => void saveDocs()}>
                  {docBusy ? t("docs_wait") : t("docs_save")}
                </button>
                {docNote ? <p className="mt-2 text-sm text-mist">{docNote}</p> : null}
              </div>
            ) : null}

            {app.status === "OPEN" && app.stage >= 3 ? (
              <div className="glass p-5">
                <p className="kicker">{t("process_now")}</p>
                <p className="mt-2 text-xl">{t(`ps_${app.processStage}` as CopyKey)}</p>
                <p className="mt-3 text-mist">
                  {t("days_left")}: {daysLeft(app.docDeadlineAt, now) ?? "—"}
                </p>
              </div>
            ) : null}

            {app.stage >= 3 ? (
              <div>
                <h3 className="display text-3xl">{t("finals_title")}</h3>
                <p className="mt-2 text-sm text-mist">{t("finals_help")}</p>
                {finals.length === 0 ? <p className="mt-3 text-mist">{t("finals_empty")}</p> : null}
                <ul className="mt-3 grid gap-2">
                  {finals.map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className="btn"
                        onClick={() =>
                          void downloadDocument({ data: doc.id }).then((full) => downloadStamped(full.data, full.fileName, full.mime))
                        }
                      >
                        {t("download")} · {doc.fileName}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {app.status === "OPEN" && app.stage >= 4 ? (
              <div className="glass p-5">
                <h3 className="display text-3xl">{t("stage4_title")}</h3>
                <p className="mt-3 leading-relaxed">{t("stage4_body")}</p>
                {app.dispatchNote ? (
                  <p className="mt-4">
                    <span className="text-mist">{t("dispatch")}: </span>
                    {app.dispatchNote}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div>
              <h3 className="display text-3xl">{t("messages")}</h3>
              <ul className="mt-4 grid gap-2">
                {detail?.messages.map((m) => (
                  <li key={m.id} className="border-t border-white/10 py-2 text-sm">
                    <span className="text-metal">{m.authorRole}</span> {m.body}
                  </li>
                ))}
              </ul>
              <form
                className="mt-3 flex flex-wrap gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  void postMessage({ data: { applicationId: app.id, body: note } }).then(() => {
                    setNote("");
                    return refreshDetail(app.id);
                  });
                }}
              >
                <input className="field max-w-xl" value={note} placeholder={t("message_ph")} onChange={(e) => setNote(e.target.value)} />
                <button className="btn" type="submit">{t("message_send")}</button>
              </form>
            </div>
          </div>
        ) : (
          <p className="mt-8">{t("loading")}</p>
        )}
      </div>
      {preview ? (
        <DocScreen
          url={preview.url}
          title={preview.name}
          closeLabel={t("preview_close")}
          downloadLabel={t("preview_download")}
          onClose={() => {
            URL.revokeObjectURL(preview.url);
            setPreview(null);
          }}
          onDownload={() => {
            if (preview.tranche && app && site && visa) {
              void takeInvoiceNumber()
                .catch(() => ({ number: app.id }))
                .then((numbered) =>
                  buildInvoice({
                    lang,
                    tranche: preview.tranche!,
                    settings: site.settings,
                    fileId: app.id,
                    client: clientName(parseQuestionnaire(app.questionnaire)),
                    country: app.country,
                    permit: visa.name,
                    duration: visa.duration,
                    employer: app.employer,
                    total: app.totalCost,
                    date: new Date().toISOString().slice(0, 10),
                    number: numbered.number,
                  }),
                );
              return;
            }
            const a = document.createElement("a");
            a.href = preview.url;
            a.download = preview.name;
            a.click();
          }}
        />
      ) : null}
    </Shell>
  );
}
