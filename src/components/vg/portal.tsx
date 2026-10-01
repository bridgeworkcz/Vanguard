import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  cancelMyApplication,
  createApplication,
  downloadDocument,
  getMyApplication,
  getSessionProfile,
  listMyApplications,
  postMessage,
  resubmitApplication,
  saveQuestionnaire,
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
  type DocCategory,
  type Questionnaire,
} from "@/lib/vanguard/domain";
import { useI18n, type CopyKey } from "@/lib/vanguard/i18n";
import { canCancel } from "@/lib/vanguard/ops";
import { buildContract, buildInvoice, downloadStamped } from "@/lib/vanguard/pdf";
import { Shell, useSite } from "./chrome";

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

async function fileToData(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { data, mime: file.type, fileName: file.name };
}

function statusLabel(app: AppRow, t: (k: CopyKey) => string) {
  if (app.status === "CANCELLED") return t("status_cancelled");
  if (app.status === "REJECTED") return t("status_rejected");
  return t(`stage_${app.stage}` as CopyKey);
}

export function PortalPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const { user, isPending } = useCurrentUserState();
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

  async function refreshList() {
    const list = await listMyApplications();
    setRows(list);
  }
  async function refreshDetail(appId: string) {
    const d = await getMyApplication({ data: appId });
    setDetail(d);
    setQ(parseQuestionnaire(d.app.questionnaire));
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    getSessionProfile()
      .then((p) => setContact({ email: p.email, phone: p.phone }))
      .catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    const raw = sessionStorage.getItem("vg-intent");
    if (!raw) {
      void refreshList().catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
      return;
    }
    sessionStorage.removeItem("vg-intent");
    const intent = JSON.parse(raw) as { vacancyId: string; citizenship: string; processing: "STANDARD" | "PRIORITY" | "EXPRESS" };
    createApplication({ data: intent })
      .then((res) => navigate({ to: "/portal", search: { id: res.id } }))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
  }, [user?.id]);

  useEffect(() => {
    if (!user || !id) {
      setDetail(null);
      return;
    }
    void refreshDetail(id).catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
  }, [user?.id, id]);

  if (isPending) {
    return (
      <Shell>
        <p className="px-4 py-16">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

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

  async function upload(category: DocCategory, file: File) {
    if (!app) return;
    const packed = await fileToData(file);
    await uploadMyDocument({ data: { applicationId: app.id, category, ...packed } });
    await refreshDetail(app.id);
  }

  async function invoice(tranche: 1 | 2 | 3) {
    if (!app || !site || !visa) return;
    await buildInvoice({
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
    });
  }

  async function contract() {
    if (!app || !site || !visa) return;
    const person = parseQuestionnaire(app.questionnaire);
    await buildContract({
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
    });
  }

  return (
    <Shell>
      <div className="mx-auto max-w-5xl px-4 py-12">
        <p className="kicker">{t("portal_kicker")}</p>
        <h1 className="display mt-3 text-5xl">{t("portal_title")}</h1>
        {err ? <p className="mt-4 text-metal">{err}</p> : null}
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
                  <span className="text-sm text-metal">{statusLabel(row, t)}</span>
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
            <div className="glass p-5">
              <p className="kicker">{app.id}</p>
              <h2 className="display mt-2 text-4xl">{app.vacancyTitle}</h2>
              <p className="mt-2 text-mist">
                {app.employer} · {app.country} · {app.totalCost} EUR · {t(`speed_${app.processing}`)}
              </p>
              <p className="mt-4 text-metal">{statusLabel(app, t)}</p>
              <ol className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[t("track_1"), t("track_2"), t("track_3"), t("track_4")].map((label, index) => (
                  <li key={label} className={app.stage >= index + 1 ? "border-t-2 border-paper pt-2 text-sm" : "border-t border-white/20 pt-2 text-sm text-mist"}>
                    <span className="text-metal">0{index + 1}</span>
                    <span className="mt-1 block">{label}</span>
                  </li>
                ))}
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
                  30% {parts.first} · 40% {parts.second} · 30% {parts.final} EUR
                </p>
              ) : null}
            </div>

            {app.status === "CANCELLED" ? <p>{t("cancel_done")}</p> : null}

            {app.status === "OPEN" && app.stage === 1 && !app.profileComplete ? (
              <form
                className="grid gap-3"
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
                <button className="btn-solid w-fit" type="submit">{t("q_save")}</button>
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
                <button type="button" className="btn" onClick={() => void invoice(1)}>{t("invoice_1")}</button>
                <button type="button" className="btn" onClick={() => void contract()}>{t("contract")}</button>
                {app.stage >= 3 && invoice2Unlocked(app.processStage) ? (
                  <button type="button" className="btn" onClick={() => void invoice(2)}>{t("invoice_2")}</button>
                ) : app.stage >= 2 ? (
                  <p className="self-center text-sm text-mist">{t("invoice2_locked")}</p>
                ) : null}
                {app.stage >= 4 ? (
                  <button type="button" className="btn" onClick={() => void invoice(3)}>{t("invoice_3")}</button>
                ) : null}
              </div>
            ) : null}

            {app.status === "OPEN" && app.stage === 2 ? (
              <label className="grid gap-2 text-sm">
                {t("proof_title")}
                <span className="text-mist">{t("proof_help")}</span>
                <input
                  className="text-sm"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void upload("PAYMENT_PROOF", file);
                  }}
                />
              </label>
            ) : null}

            {app.status === "OPEN" && app.stage >= 2 ? (
              <div>
                <h3 className="display text-3xl">{t("docs_title")}</h3>
                <p className="mt-2 text-sm text-mist">{t("docs_help")}</p>
                <ul className="mt-4 grid gap-3">
                  {DOC_CATEGORIES.filter((c) => c !== "PAYMENT_PROOF" && c !== "FINAL").map((cat) => {
                    const files = detail?.documents.filter((d) => d.category === cat) ?? [];
                    return (
                      <li key={cat} className="border-t border-white/10 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t(`cat_${cat}`)}</span>
                          <span className="text-sm text-mist">{files.length ? t("uploaded") : t("upload")}</span>
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
                        <input
                          className="mt-2 text-sm"
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void upload(cat, file);
                          }}
                        />
                      </li>
                    );
                  })}
                </ul>
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
    </Shell>
  );
}
