import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  adminAllTeam,
  adminAudit,
  adminCreateApplication,
  adminDeleteMedia,
  adminDeletePartner,
  adminDeleteTeam,
  adminDeleteVacancy,
  adminGetApplication,
  adminListApplications,
  adminOverview,
  adminSaveDispatch,
  adminSaveMedia,
  adminSavePartner,
  adminSaveProduct,
  adminSaveSettings,
  adminSaveTeam,
  adminSaveVacancy,
  adminSetProcess,
  adminSetReferrer,
  adminSetRole,
  adminSetStage,
  adminUploadFinal,
  assignManagers,
  downloadDocument,
  exportOpenCases,
  postMessage,
  reviewDocument,
  type AppRow,
} from "@/lib/vanguard/api";
import { CITIZENSHIPS, PROCESS_STAGES, type Processing, type Vacancy, type VisaProduct } from "@/lib/vanguard/domain";
import { useI18n, type CopyKey } from "@/lib/vanguard/i18n";
import { isOverdue } from "@/lib/vanguard/ops";
import { downloadStamped } from "@/lib/vanguard/pdf";
import { Shell, storyKey, useSite } from "./chrome";
import { Pager } from "./pages";

type Tab = "overview" | "applications" | "vacancies" | "team" | "content" | "pricing" | "audit";

const TABS: Tab[] = ["overview", "applications", "vacancies", "team", "content", "pricing", "audit"];

async function asData(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return { data, mime: file.type, fileName: file.name };
}

async function photoDataUrl(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("File");
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("File");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const data = canvas.toDataURL("image/jpeg", 0.85);
  if (data.length > 900_000) throw new Error("File");
  return data;
}

export function AdminPage({ tab, id }: { tab: string; id: string }) {
  const { t, lang } = useI18n();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const { data, reload } = useSite();
  const current = (TABS.includes(tab as Tab) ? tab : "overview") as Tab;
  const [role, setRole] = useState<string | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof adminOverview>> | null>(null);
  const [apps, setApps] = useState<AppRow[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof adminGetApplication>> | null>(null);
  const [reason, setReason] = useState("");
  const [dispatch, setDispatch] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [team, setTeam] = useState<Awaited<ReturnType<typeof adminAllTeam>>>([]);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof adminAudit>>>([]);
  const [draft, setDraft] = useState<Partial<Vacancy>>({});
  const [settingsDraft, setSettingsDraft] = useState<Record<string, string>>({});
  const [newApp, setNewApp] = useState({ email: "", vacancyId: "", citizenship: "Ukraine", processing: "STANDARD" as Processing });
  const [userQuery, setUserQuery] = useState("");
  const [qCountry, setQCountry] = useState("");
  const [qStage, setQStage] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [managerId, setManagerId] = useState("");
  const [exportNote, setExportNote] = useState("");
  const [docReason, setDocReason] = useState("");
  const [caseQuery, setCaseQuery] = useState("");
  const [casePage, setCasePage] = useState(1);

  function go(next: Tab, nextId = "") {
    void navigate({ to: "/admin", search: { tab: next, id: nextId } });
  }

  useEffect(() => {
    if (!user) return;
    adminOverview()
      .then((o) => {
        setOverview(o);
        setRole(o.role);
      })
      .catch((e: unknown) => {
        setRole("CLIENT");
        setErr(e instanceof Error ? e.message : "Error");
      });
  }, [user?.id]);

  useEffect(() => {
    if (role !== "ADMIN" && role !== "MANAGER") return;
    if (current === "applications") {
      adminListApplications({ data: { includeIncomplete: showAll } })
        .then(setApps)
        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    }
    if (current === "team" && (role === "ADMIN" || role === "MANAGER")) void adminAllTeam().then(setTeam);
    if (current === "audit") void adminAudit().then(setAudit);
    if (current === "content" && data) setSettingsDraft(data.settings);
  }, [current, role, showAll, data]);

  useEffect(() => {
    if (!id || (role !== "ADMIN" && role !== "MANAGER")) return;
    adminGetApplication({ data: id })
      .then((d) => {
        setDetail(d);
        setDispatch(d.app.dispatchNote);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
    void adminAudit().then(setAudit).catch(() => undefined);
  }, [id, role]);

  if (isPending) {
    return (
      <Shell>
        <p className="px-4 py-16">{t("loading")}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;
  if (role === "CLIENT") {
    return (
      <Shell>
        <p className="px-4 py-16">{t("admin_denied")}</p>
      </Shell>
    );
  }
  if (!role) {
    return (
      <Shell>
        <p className="px-4 py-16">{t("loading")}</p>
      </Shell>
    );
  }

  const staff = role === "ADMIN" || role === "MANAGER";
  const isAdmin = role === "ADMIN";

  async function act(action: string) {
    if (!detail) return;
    setErr("");
    try {
      await adminSetStage({ data: { id: detail.app.id, action, reason } });
      const d = await adminGetApplication({ data: detail.app.id });
      setDetail(d);
      setApps(await adminListApplications({ data: { includeIncomplete: showAll } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <Shell>
      <div className="mx-auto flex max-w-6xl gap-6 px-4 py-10">
        <aside className="hidden w-44 shrink-0 md:block">
          <p className="kicker ember">{t("admin_kicker")}</p>
          <nav className="mt-4 grid gap-1">
            {TABS.map((name) => (
              <button key={name} type="button" className={current === name ? "btn-solid" : "btn"} onClick={() => go(name)}>
                {t(`admin_${name === "applications" ? "apps" : name === "vacancies" ? "vacancies" : name}` as CopyKey)}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
        <p className="kicker ember md:hidden">{t("admin_kicker")}</p>
        <div className="mt-4 flex flex-wrap gap-2 md:hidden">
          {TABS.map((name) => (
            <button key={name} type="button" className={current === name ? "btn-solid" : "btn"} onClick={() => go(name)}>
              {t(`admin_${name === "applications" ? "apps" : name === "vacancies" ? "vacancies" : name}` as CopyKey)}
            </button>
          ))}
        </div>
        {err ? <p className="mt-4 text-metal">{err}</p> : null}

        {current === "overview" && overview ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[
              [overview.waiting, t("admin_clients")],
              [overview.proofs, t("admin_review")],
              [overview.live, t("admin_live")],
            ].map(([n, label]) => (
              <article key={String(label)} className="glass p-5">
                <p className="display ember text-5xl">{n}</p>
                <p className="mt-2 text-mist">{label}</p>
              </article>
            ))}
            {isAdmin ? (
              <div className="sm:col-span-3">
                <h2 className="mt-6 text-lg">{t("admin_users")}</h2>
                <input className="field mt-3 max-w-sm" placeholder={t("admin_search")} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                <ul className="mt-3 grid gap-2">
                  {overview.users
                    .filter((u) => `${u.email} ${u.fullName} ${u.phone ?? ""}`.toLowerCase().includes(userQuery.trim().toLowerCase()))
                    .map((u) => (
                    <li key={u.userId} className="flex flex-wrap items-center gap-3 border-t border-white/10 py-2 text-sm">
                      <span className="min-w-40">{u.email || u.fullName}</span>
                      <span className="text-metal">{u.role}</span>
                      <select
                        className="field max-w-40"
                        defaultValue={u.role}
                        onChange={(e) => void adminSetRole({ data: { userId: u.userId, role: e.target.value } }).then(() => adminOverview().then(setOverview))}
                      >
                        <option>CLIENT</option>
                        <option>SUBAGENT</option>
                        <option>MANAGER</option>
                        <option>ADMIN</option>
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {current === "applications" && staff ? (
          <div className="mt-8 grid gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              {t("admin_show_all")}
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs text-mist">
                {t("admin_country")}
                <select className="field" value={qCountry} onChange={(e) => setQCountry(e.target.value)}>
                  <option value="">{t("all")}</option>
                  {Array.from(new Set(apps.map((a) => a.country))).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs text-mist">
                {t("admin_stage")}
                <select className="field" value={qStage} onChange={(e) => setQStage(e.target.value)}>
                  <option value="">{t("all")}</option>
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
                {t("admin_overdue")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
                {t("admin_unassigned")}
              </label>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  void exportOpenCases()
                    .then((r) => setExportNote(`${t("admin_exported")}: ${r.count}`))
                    .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"))
                }
              >
                {t("admin_export")}
              </button>
              {exportNote ? <span className="text-sm text-mist">{exportNote}</span> : null}
              <input
                className="field max-w-xs"
                placeholder={t("admin_id_search")}
                value={caseQuery}
                onChange={(e) => {
                  setCaseQuery(e.target.value);
                  setCasePage(1);
                }}
              />
              {role === "MANAGER" ? <p className="text-sm text-mist">{t("admin_only_mine")}</p> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="field max-w-xs" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                <option value="">{t("admin_assign")}</option>
                {overview?.users.filter((u) => u.role === "ADMIN" || u.role === "MANAGER").map((u) => (
                  <option key={u.userId} value={u.userId}>{u.email || u.fullName}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn"
                disabled={!managerId || picked.length === 0}
                onClick={() =>
                  void assignManagers({ data: { ids: picked, managerId } })
                    .then(() => adminListApplications({ data: { includeIncomplete: showAll } }).then(setApps))
                    .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"))
                }
              >
                {t("admin_assign")} · {picked.length}
              </button>
            </div>
            <form
              className="glass grid gap-2 p-4 md:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                void adminCreateApplication({ data: newApp }).then(() => adminListApplications({ data: { includeIncomplete: true } }).then(setApps));
              }}
            >
              <p className="md:col-span-4 text-sm text-mist">{t("admin_new_app")}</p>
              <input className="field" placeholder={t("admin_email")} value={newApp.email} onChange={(e) => setNewApp({ ...newApp, email: e.target.value })} />
              <select className="field" value={newApp.vacancyId} onChange={(e) => setNewApp({ ...newApp, vacancyId: e.target.value })}>
                <option value="">{t("seat")}</option>
                {data?.vacancies.filter((v) => v.active).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.country} · {v.title}
                  </option>
                ))}
              </select>
              <select className="field" value={newApp.citizenship} onChange={(e) => setNewApp({ ...newApp, citizenship: e.target.value })}>
                {CITIZENSHIPS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <button className="btn-solid" type="submit">{t("admin_create")}</button>
            </form>
            {(() => {
              const filtered = apps
                .filter((a) => role !== "MANAGER" || a.assignedManagerId === user?.id)
                .filter((a) => !qCountry || a.country === qCountry)
                .filter((a) => !qStage || String(a.stage) === qStage)
                .filter((a) => !overdueOnly || isOverdue(a.cancelDeadlineAt) || isOverdue(a.docDeadlineAt))
                .filter((a) => !unassignedOnly || !a.assignedManagerId)
                .filter((a) => !caseQuery.trim() || a.id.toLowerCase().includes(caseQuery.trim().toLowerCase()));
              const pages = Math.max(1, Math.ceil(filtered.length / 15));
              const currentPage = Math.min(casePage, pages);
              const slice = filtered.slice((currentPage - 1) * 15, currentPage * 15);
              return (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[880px] text-left text-sm">
                      <thead className="text-mist">
                        <tr>
                          <th className="py-2" />
                          <th className="py-2 font-medium">{t("filings_id")}</th>
                          <th className="py-2 font-medium">{t("filings_date")}</th>
                          <th className="py-2 font-medium">{t("name")}</th>
                          <th className="py-2 font-medium">{t("admin_country")}</th>
                          <th className="py-2 font-medium">{t("seat")}</th>
                          <th className="py-2 font-medium">{t("admin_stage")}</th>
                          <th className="py-2 font-medium">{t("portal_paid")}</th>
                          <th className="py-2 font-medium">{t("admin_assign")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map((a) => (
                          <tr key={a.id} className="border-t border-white/10">
                            <td className="py-3">
                              <input
                                type="checkbox"
                                checked={picked.includes(a.id)}
                                onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((id) => id !== a.id)))}
                              />
                            </td>
                            <td>
                              <button type="button" className="underline-offset-4 hover:underline" onClick={() => go("applications", a.id)}>
                                {a.id}
                              </button>
                            </td>
                            <td>{a.createdAt?.slice(0, 10)}</td>
                            <td>{a.clientEmail || "—"}</td>
                            <td>{a.country}</td>
                            <td>
                              {a.vacancyTitle}
                              {a.employer ? <span className="block text-mist">{a.employer}</span> : null}
                            </td>
                            <td className="ember">
                              {a.stage}
                              {isOverdue(a.cancelDeadlineAt) || isOverdue(a.docDeadlineAt) ? <span className="mt-1 block text-xs">{t("admin_overdue")}</span> : null}
                              {!a.assignedManagerId ? <span className="mt-1 block text-xs text-mist">{t("admin_unassigned")}</span> : null}
                              {a.stage >= 3 && a.status === "OPEN" ? <span className="mt-1 block text-xs text-mist">{t("admin_waiting_doc")}</span> : null}
                            </td>
                            <td>{a.stage >= 4 ? "30 · 40 · 30" : a.stage >= 3 ? "30 · 40" : a.stage >= 2 ? "30" : "—"}</td>
                            <td>{a.assignedManagerId || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length === 0 ? <p className="text-mist">{t("admin_empty_cases")}</p> : null}
                  <p className="text-xs text-mist">{slice.length} / {filtered.length}</p>
                  <Pager page={currentPage} pages={pages} onPage={setCasePage} />
                </>
              );
            })()}
            {detail && id ? (
              <article className="glass p-5">
                <p className="kicker">{detail.app.id}</p>
                <h2 className="display text-3xl">{detail.app.vacancyTitle}</h2>
                <p className="text-mist">
                  {detail.app.clientEmail} · {detail.app.totalCost} EUR · {detail.app.processing}
                </p>
                <p className="mt-3 ember">
                  {detail.app.status !== "OPEN"
                    ? t("portal_next_closed")
                    : detail.app.stage === 1 && !detail.app.profileComplete
                      ? t("admin_block_q")
                      : detail.app.stage === 2 && !detail.documents.some((d) => d.category === "PAYMENT_PROOF" && d.status === "APPROVED")
                        ? t("admin_block_pay")
                        : detail.documents.some((d) => d.status === "REJECTED")
                          ? t("admin_block_doc")
                          : t("admin_block_ok")}
                </p>
                <label className="mt-4 grid max-w-sm gap-1 text-sm">
                  {t("admin_referrer")}
                  <select
                    className="field"
                    value={detail.app.referrerUserId || ""}
                    onChange={(e) =>
                      void adminSetReferrer({ data: { id: detail.app.id, referrerUserId: e.target.value } }).then(() =>
                        adminGetApplication({ data: detail.app.id }).then(setDetail),
                      )
                    }
                  >
                    <option value="">{t("admin_referrer_none")}</option>
                    {overview?.users
                      .filter((u) => u.role === "SUBAGENT")
                      .map((u) => (
                        <option key={u.userId} value={u.userId}>
                          {u.email || u.fullName}
                        </option>
                      ))}
                  </select>
                </label>
                <pre className="mt-3 whitespace-pre-wrap text-sm text-paper/80">{detail.app.questionnaire}</pre>
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.app.status === "OPEN" && detail.app.stage === 1 && detail.app.profileComplete ? (
                    <button type="button" className="btn" onClick={() => void act("accept")}>{t("admin_accept")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" && detail.app.stage === 2 ? (
                    <button type="button" className="btn" onClick={() => void act("confirm-payment")}>{t("admin_to3")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" && detail.app.stage === 3 ? (
                    <button type="button" className="btn" onClick={() => void act("stage4")}>{t("admin_to4")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" ? (
                    <button type="button" className="btn" onClick={() => void act("reject")}>{t("admin_reject")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" ? (
                    <button type="button" className="btn" onClick={() => void act("cancel")}>{t("status_cancelled")}</button>
                  ) : null}
                </div>
                <input className="field mt-3" placeholder={t("admin_reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                {detail.app.stage >= 3 ? (
                  <label className="mt-4 grid gap-1 text-sm">
                    {t("admin_process")}
                    <select
                      className="field"
                      value={detail.app.processStage}
                      onChange={(e) =>
                        void adminSetProcess({ data: { id: detail.app.id, processStage: e.target.value } }).then(() =>
                          adminGetApplication({ data: detail.app.id }).then(setDetail),
                        )
                      }
                    >
                      {PROCESS_STAGES.map((s) => (
                        <option key={s} value={s}>
                          {t(`ps_${s}` as CopyKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {detail.app.processStage === "FINAL_LEGAL_SERVICE" ? (
                  <label className="mt-4 grid gap-1 text-sm">
                    {t("admin_final_upload")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        void asData(file).then((packed) =>
                          adminUploadFinal({
                            data: { applicationId: detail.app.id, category: "FINAL", ...packed },
                          }).then(() => adminGetApplication({ data: detail.app.id }).then(setDetail)),
                        );
                      }}
                    />
                  </label>
                ) : null}
                <label className="mt-4 grid gap-1 text-sm">
                  {t("admin_dispatch")}
                  <textarea className="field" value={dispatch} onChange={(e) => setDispatch(e.target.value)} />
                  <button type="button" className="btn w-fit" onClick={() => void adminSaveDispatch({ data: { id: detail.app.id, note: dispatch } })}>
                    {t("save")}
                  </button>
                </label>
                <ul className="mt-4 grid gap-2 text-sm">
                  {detail.documents.map((d) => (
                    <li key={d.id} className="glass p-3">
                      <p>{d.category} · {d.fileName}</p>
                      <p className="text-mist">{d.createdAt?.slice(0, 16)} · {d.status}{d.rejectionReason ? ` · ${d.rejectionReason}` : ""}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            void downloadDocument({ data: d.id }).then((full) => downloadStamped(full.data, full.fileName, full.mime))
                          }
                        >
                          {t("admin_open")}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            void reviewDocument({ data: { id: d.id, status: "APPROVED", reason: "" } }).then(() =>
                              adminGetApplication({ data: detail.app.id }).then(setDetail),
                            )
                          }
                        >
                          {t("admin_doc_ok")}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          onClick={() =>
                            void reviewDocument({ data: { id: d.id, status: "REJECTED", reason: docReason } }).then(() =>
                              adminGetApplication({ data: detail.app.id }).then(setDetail),
                            )
                          }
                        >
                          {t("admin_doc_no")}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
                <input className="field mt-2" placeholder={t("admin_reason")} value={docReason} onChange={(e) => setDocReason(e.target.value)} />
                <form
                  className="mt-4 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void postMessage({ data: { applicationId: detail.app.id, body: note } }).then(() => {
                      setNote("");
                      return adminGetApplication({ data: detail.app.id }).then(setDetail);
                    });
                  }}
                >
                  <input className="field" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("messages")} />
                  <button className="btn" type="submit">{t("message_send")}</button>
                </form>
                <ul className="mt-3 text-sm">
                  {detail.messages.map((m) => (
                    <li key={m.id}>
                      {m.authorRole}: {m.body}
                    </li>
                  ))}
                </ul>
                <h3 className="mt-6 text-sm text-mist">{t("admin_history")}</h3>
                <ul className="mt-2 text-sm">
                  {audit
                    .filter((row) => row.target === detail.app.id)
                    .map((row) => (
                      <li key={row.id}>
                        {row.createdAt?.slice(0, 19)} · {row.action} · {row.details}
                      </li>
                    ))}
                </ul>
              </article>
            ) : null}
          </div>
        ) : null}

        {current === "vacancies" && data ? (
          <div className="mt-8 grid gap-4">
            <VacancyForm
              products={data.products}
              initial={draft}
              onSave={async (v) => {
                await adminSaveVacancy({ data: v });
                setDraft({});
                reload();
              }}
            />
            <ul className="grid gap-2">
              {data.vacancies.map((v) => (
                <li key={v.id} className="grid items-center gap-2 border-t border-white/10 py-2 text-sm md:grid-cols-6">
                  <span className="md:col-span-2">
                    {v.active ? "" : "— "}
                    {v.country} · {v.title}
                  </span>
                  <input
                    className="field"
                    defaultValue={v.salaryNet}
                    aria-label={t("salary")}
                    onBlur={(e) => {
                      if (e.target.value !== v.salaryNet) void adminSaveVacancy({ data: { ...v, salaryNet: e.target.value } }).then(reload);
                    }}
                  />
                  <input
                    className="field"
                    type="number"
                    defaultValue={v.quota}
                    aria-label={t("quota")}
                    onBlur={(e) => {
                      const quota = Number(e.target.value);
                      if (quota !== v.quota) void adminSaveVacancy({ data: { ...v, quota } }).then(reload);
                    }}
                  />
                  <input
                    className="field"
                    defaultValue={v.blockedCitizenships || ""}
                    placeholder={t("blocked")}
                    onBlur={(e) => {
                      if (e.target.value !== (v.blockedCitizenships || "")) {
                        void adminSaveVacancy({ data: { ...v, blockedCitizenships: e.target.value } }).then(reload);
                      }
                    }}
                  />
                  <span className="flex gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={v.active}
                        onChange={(e) => void adminSaveVacancy({ data: { ...v, active: e.target.checked } }).then(reload)}
                      />
                      {t("active")}
                    </label>
                    <button type="button" className="btn" onClick={() => setDraft(v)}>{t("edit")}</button>
                    <button type="button" className="btn" onClick={() => void adminDeleteVacancy({ data: v.id }).then(reload)}>{t("remove")}</button>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {current === "team" && staff ? (
          <TeamEditor
            readOnly={!isAdmin}
            team={team}
            onChange={() => {
              void adminAllTeam().then(setTeam);
              reload();
            }}
          />
        ) : null}

        {current === "content" && staff && data ? (
          <ContentEditor
            readOnly={!isAdmin}
            settings={settingsDraft}
            media={data.media}
            partners={data.partners}
            countries={Array.from(new Set(data.products.map((p) => p.country)))}
            lang={lang}
            onSettings={(next) => setSettingsDraft(next)}
            onSaved={reload}
          />
        ) : null}

        {current === "pricing" && staff && data ? (
          <ul className="mt-8 grid gap-4">
            <p className="text-sm text-mist">{t("admin_live_note")}</p>
            {data.products.map((p) => (
              <PriceRow key={p.id} product={p} readOnly={!isAdmin} onSaved={reload} />
            ))}
          </ul>
        ) : null}

        {current === "audit" ? (
          <ul className="mt-8 grid gap-2 text-sm">
            {audit.map((row) => (
              <li key={row.id} className="border-t border-white/10 py-2">
                {row.createdAt?.slice(0, 19)} · {row.action} · {row.target} · {row.details}
              </li>
            ))}
          </ul>
        ) : null}
        </div>
      </div>
    </Shell>
  );
}

function VacancyForm({
  products,
  initial,
  onSave,
}: {
  products: VisaProduct[];
  initial: Partial<Vacancy>;
  onSave: (v: Vacancy) => Promise<void>;
}) {
  const { t } = useI18n();
  const [v, setV] = useState<Vacancy>({
    id: "",
    title: "",
    country: products[0]?.country ?? "",
    visaProductId: products[0]?.id ?? "",
    employer: "",
    salaryNet: "",
    accommodation: "",
    workingHours: "",
    description: "",
    requirements: "",
    quota: 4,
    active: true,
    blockedCitizenships: "",
  });
  useEffect(() => {
    if (initial.id) setV({ ...v, ...initial, quota: Number(initial.quota ?? v.quota) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id]);
  return (
    <form
      className="glass grid gap-2 p-4 md:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(v);
      }}
    >
      <input className="field" placeholder={t("title")} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} />
      <input className="field" placeholder={t("employer")} value={v.employer} onChange={(e) => setV({ ...v, employer: e.target.value })} />
      <select
        className="field"
        value={v.visaProductId}
        onChange={(e) => {
          const p = products.find((x) => x.id === e.target.value);
          setV({ ...v, visaProductId: e.target.value, country: p?.country ?? v.country });
        }}
      >
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.country} · {p.duration}
          </option>
        ))}
      </select>
      <input className="field" placeholder={t("salary")} value={v.salaryNet} onChange={(e) => setV({ ...v, salaryNet: e.target.value })} />
      <input className="field" placeholder={t("housing")} value={v.accommodation} onChange={(e) => setV({ ...v, accommodation: e.target.value })} />
      <input className="field" placeholder={t("hours")} value={v.workingHours} onChange={(e) => setV({ ...v, workingHours: e.target.value })} />
      <textarea className="field md:col-span-2" placeholder={t("description")} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
      <textarea className="field md:col-span-2" placeholder={t("field_requirements")} value={v.requirements} onChange={(e) => setV({ ...v, requirements: e.target.value })} />
      <input className="field" type="number" value={v.quota} onChange={(e) => setV({ ...v, quota: Number(e.target.value) })} />
      <input className="field" placeholder={t("blocked")} value={v.blockedCitizenships || ""} onChange={(e) => setV({ ...v, blockedCitizenships: e.target.value })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />
        {t("active")}
      </label>
      <button className="btn-solid md:col-span-2 w-fit" type="submit">{initial.id ? t("save") : t("add")}</button>
    </form>
  );
}

function TeamEditor({
  team,
  readOnly,
  onChange,
}: {
  team: { id: string; fullName: string; position: string; phone: string; photoData: string; active: boolean }[];
  readOnly: boolean;
  onChange: () => void;
}) {
  const { t } = useI18n();
  const [editId, setEditId] = useState("");
  const [fullName, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [photoData, setPhoto] = useState("");
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setErr("");
    void photoDataUrl(file)
      .then((data) => {
        setPhoto(data);
        setPreview(data);
      })
      .catch(() => setErr(t("admin_file_big")));
  }
  return (
    <div className="mt-8 grid gap-4">
      <p className="text-sm text-mist">{t("admin_live_note")}</p>
      {err ? <p className="text-sm text-metal">{err}</p> : null}
      {readOnly ? null : (
      <form
        className="glass grid gap-2 p-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr("");
          const active = editId ? (team.find((m) => m.id === editId)?.active ?? true) : true;
          void adminSaveTeam({ data: { id: editId, fullName, position, phone, photoData, active } })
            .then(() => {
              setEditId("");
              setName("");
              setPosition("");
              setPhone("");
              setPhoto("");
              setPreview("");
              onChange();
            })
            .catch(() => setErr(t("admin_file_big")));
        }}
      >
        <input className="field" placeholder={t("name")} value={fullName} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder={t("position")} value={position} onChange={(e) => setPosition(e.target.value)} />
        <input className="field" placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>{t("photo")}</button>
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
        {preview ? <img src={preview} alt="" className="size-16 object-cover" /> : null}
        {photoData ? <p className="text-sm text-mist md:col-span-2">{t("admin_photo_ready")}</p> : null}
        <button className="btn-solid w-fit" type="submit">{editId ? t("save") : t("add")}</button>
      </form>
      )}
      <ul className="grid gap-3">
        {team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-white/10 py-3">
            {m.photoData ? <img src={m.photoData} alt="" className="size-14 object-cover" /> : <span className="grid size-14 place-items-center bg-white/10">{m.fullName.slice(0, 1)}</span>}
            <span className="min-w-40">
              {m.fullName}
              <span className="block text-sm text-mist">{m.position} · {m.phone}</span>
            </span>
            {readOnly ? null : (
              <>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditId(m.id);
                setName(m.fullName);
                setPosition(m.position);
                setPhone(m.phone);
                setPhoto("");
                setPreview(m.photoData);
                setErr("");
              }}
            >
              {t("edit")}
            </button>
            <label className="btn cursor-pointer">
              {t("admin_replace_photo")}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setErr("");
                  void photoDataUrl(file)
                    .then((data) => adminSaveTeam({ data: { id: m.id, fullName: m.fullName, position: m.position, phone: m.phone, photoData: data, active: m.active } }))
                    .then(onChange)
                    .catch(() => setErr(t("admin_file_big")));
                }}
              />
            </label>
            <button type="button" className="btn" onClick={() => void adminDeleteTeam({ data: m.id }).then(onChange)}>{t("remove")}</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentEditor({
  settings,
  media,
  partners,
  countries,
  lang,
  readOnly,
  onSettings,
  onSaved,
}: {
  settings: Record<string, string>;
  media: { id: string; kind: string; title: string; caption?: string; imageData: string }[];
  partners: { id: string; country: string; name: string }[];
  countries: string[];
  lang: "en" | "cs" | "ur";
  readOnly: boolean;
  onSettings: (s: Record<string, string>) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const fields: { key: string; label: CopyKey }[] = [
    { key: "support_phone", label: "admin_field_phone" },
    { key: "support_email", label: "admin_field_email" },
    { key: "legal_address", label: "admin_field_address" },
    { key: "usdt_wallet", label: "admin_field_wallet" },
    { key: "usdt_network", label: "admin_field_network" },
    { key: "legal_entity", label: "admin_field_entity" },
    { key: "registration_number", label: "admin_field_id" },
    { key: "vat_number", label: "admin_field_vat" },
    { key: "court_record", label: "admin_field_court" },
    { key: "regulator", label: "admin_field_regulator" },
    { key: "telegram_owner_chat", label: "admin_field_tg_owner" },
    { key: "telegram_staff_chat", label: "admin_field_tg_staff" },
    { key: "subagent_rate", label: "admin_field_rate" },
  ];
  const story = storyKey(lang, "about_story");
  const lead = storyKey(lang, "about_lead");
  const title = storyKey(lang, "hero_title");
  const body = storyKey(lang, "hero_body");
  const [partner, setPartner] = useState({ country: countries[0] ?? "", name: "" });
  const [mediaErr, setMediaErr] = useState("");
  function publishPhoto(file: File | undefined, kind: string, id?: string, itemTitle?: string, caption?: string) {
    if (!file) return;
    setMediaErr("");
    void photoDataUrl(file)
      .then((imageData) =>
        adminSaveMedia({
          data: {
            id,
            kind,
            title: itemTitle || (kind === "license" ? "Licence" : "Office"),
            caption: caption || "",
            imageData,
          },
        }),
      )
      .then(onSaved)
      .catch(() => setMediaErr(t("admin_file_big")));
  }
  return (
    <div className="mt-8 grid gap-4">
      <p className="text-sm text-mist">{t("admin_live_note")}</p>
      {mediaErr ? <p className="text-sm text-metal">{mediaErr}</p> : null}
      <form
        className="glass grid gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (readOnly) return;
          void adminSaveSettings({ data: settings }).then(onSaved);
        }}
      >
        {fields.map((field) => (
          <label key={field.key} className="grid gap-1 text-sm text-mist">
            {t(field.label)}
            <input className="field" disabled={readOnly} value={settings[field.key] ?? ""} onChange={(e) => onSettings({ ...settings, [field.key]: e.target.value })} />
          </label>
        ))}
        <label className="grid gap-1 text-sm text-mist">
          {t("admin_story")}
          <textarea className="field" disabled={readOnly} value={settings[story] ?? ""} onChange={(e) => onSettings({ ...settings, [story]: e.target.value })} />
        </label>
        <textarea className="field" disabled={readOnly} value={settings[lead] ?? ""} onChange={(e) => onSettings({ ...settings, [lead]: e.target.value })} />
        <input className="field" disabled={readOnly} value={settings[title] ?? ""} onChange={(e) => onSettings({ ...settings, [title]: e.target.value })} />
        <textarea className="field" disabled={readOnly} value={settings[body] ?? ""} onChange={(e) => onSettings({ ...settings, [body]: e.target.value })} />
        {readOnly ? null : <button className="btn-solid w-fit" type="submit">{t("save")}</button>}
      </form>
      {readOnly ? null : (
      <div className="grid gap-3 md:grid-cols-2">
        <label className="btn w-fit cursor-pointer">
          {t("admin_license")}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              publishPhoto(e.target.files?.[0], "license");
              e.target.value = "";
            }}
          />
        </label>
        <label className="btn w-fit cursor-pointer">
          {t("admin_office")}
          <input
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              publishPhoto(e.target.files?.[0], "office");
              e.target.value = "";
            }}
          />
        </label>
      </div>
      )}
      <ul className="grid gap-2">
        {media.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 text-sm">
            <img src={m.imageData} alt="" className="h-12 w-16 object-cover" />
            <span>{m.kind === "license" ? t("admin_license") : t("admin_office")}</span>
            {readOnly ? null : (
              <>
                <label className="btn cursor-pointer">
                  {t("admin_replace_photo")}
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      publishPhoto(e.target.files?.[0], m.kind, m.id, m.title, m.caption);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className="btn" onClick={() => void adminDeleteMedia({ data: m.id }).then(onSaved)}>{t("remove")}</button>
              </>
            )}
          </li>
        ))}
      </ul>
      {readOnly ? null : (
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void adminSavePartner({ data: partner }).then(() => {
            setPartner({ ...partner, name: "" });
            onSaved();
          });
        }}
      >
        <select className="field max-w-48" value={partner.country} onChange={(e) => setPartner({ ...partner, country: e.target.value })}>
          {countries.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input className="field max-w-xs" placeholder={t("admin_partner")} value={partner.name} onChange={(e) => setPartner({ ...partner, name: e.target.value })} />
        <button className="btn" type="submit">{t("add")}</button>
      </form>
      )}
      <ul className="text-sm">
        {partners.map((p) => (
          <li key={p.id} className="flex justify-between gap-2 border-t border-white/10 py-2">
            <span>
              {p.country} · {p.name}
            </span>
            {readOnly ? null : <button type="button" onClick={() => void adminDeletePartner({ data: p.id }).then(onSaved)}>{t("remove")}</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceRow({ product, readOnly, onSaved }: { product: VisaProduct; readOnly: boolean; onSaved: () => void }) {
  const { t } = useI18n();
  const [p, setP] = useState(product);
  useEffect(() => setP(product), [product.id, product.basePrice, product.active]);
  const toggle = (lane: Processing) => {
    if (readOnly) return;
    const has = p.allowedProcessing.includes(lane);
    const allowedProcessing = has ? p.allowedProcessing.filter((x) => x !== lane) : [...p.allowedProcessing, lane];
    setP({ ...p, allowedProcessing });
  };
  return (
    <li className="glass grid gap-2 p-4 md:grid-cols-4">
      <div className="md:col-span-2">
        <p>{p.country}</p>
        <p className="text-sm text-mist">
          {p.name} · {p.duration}
        </p>
      </div>
      <input className="field" type="number" disabled={readOnly} value={p.basePrice} onChange={(e) => setP({ ...p, basePrice: Number(e.target.value) })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={readOnly} checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
        {t("admin_offered")}
      </label>
      <div className="flex flex-wrap gap-2 text-xs">
        {(["STANDARD", "PRIORITY", "EXPRESS"] as Processing[]).map((lane) => (
          <label key={lane} className="flex items-center gap-1">
            <input type="checkbox" disabled={readOnly} checked={p.allowedProcessing.includes(lane)} onChange={() => toggle(lane)} />
            {lane}
          </label>
        ))}
      </div>
      {readOnly ? null : (
        <button type="button" className="btn w-fit" onClick={() => void adminSaveProduct({ data: p }).then(onSaved)}>
          {t("save")}
        </button>
      )}
    </li>
  );
}
