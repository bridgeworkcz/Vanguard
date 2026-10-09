import { useNavigate } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { Shell, storyKey, useDesk, useSite } from "./chrome";
import {
  adminAllTeam,
  adminAudit,
  adminCreateApplication,
  adminDeleteMedia,
  adminDeletePartner,
  adminDeleteAccount,
  adminDeleteApplication,
  adminRestoreAccount,
  adminMarkCommission,
  adminDeleteTeam,
  adminDeleteVacancy,
  adminGetApplication,
  adminGetSettings,
  adminListApplications,
  adminMailStatus,
  adminOverview,
  adminSaveDispatch,
  adminSaveMail,
  adminSaveMedia,
  adminSavePartner,
  adminSaveProduct,
  adminSaveSettings,
  adminSaveTeam,
  adminSaveVacancy,
  adminSetProcess,
  adminSetReferrer,
  adminSetRole,
  adminSetClientDiscount,
  adminSetStage,
  adminUploadFinal,
  adminUploadProof,
  adminListMedia,
  assignManagers,
  downloadDocument,
  exportOpenCases,
  postMessage,
  reviewDocument,
  type AppRow,
} from "@/lib/vanguard/api";
import { CITIZENSHIPS, DOC_CATEGORIES, INVOICE2_STAGE, PROCESS_STAGES, openedBeforeInvoice2Rule, stageIndex, type DocCategory, type Processing, type Vacancy, type VisaProduct } from "@/lib/vanguard/domain";
import { useI18n, type CopyKey, type Lang } from "@/lib/vanguard/i18n";
import { ADMIN_UK } from "@/lib/vanguard/admin-uk";
import { stepField, writeStep, type Slot } from "./media";
import { isOverdue } from "@/lib/vanguard/ops";
import { DocScreen } from "./doc-view";
import { Pager } from "./pages";

type Tab = "overview" | "applications" | "vacancies" | "team" | "content" | "pricing" | "audit";

const TABS: Tab[] = ["overview", "applications", "vacancies", "team", "content", "pricing", "audit"];

function NavGlyph({ tab }: { tab: Tab }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
      {tab === "overview" ? <path {...common} d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /> : null}
      {tab === "applications" ? <path {...common} d="M7 3.5h7l4 4V20a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1zM14 3.5V8h4.5M8.5 12h7M8.5 16h5" /> : null}
      {tab === "vacancies" ? <path {...common} d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M4.5 7h15v11.5a1.5 1.5 0 0 1-1.5 1.5h-12a1.5 1.5 0 0 1-1.5-1.5z" /> : null}
      {tab === "team" ? <path {...common} d="M8 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM15.5 11.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3.5 18.5v-1.2A3.3 3.3 0 0 1 6.8 14h2.4a3.3 3.3 0 0 1 3.3 3.3v1.2M13.5 14.2h2.2a3 3 0 0 1 3 3v1.3" /> : null}
      {tab === "content" ? <path {...common} d="M5 6h14M5 12h14M5 18h9" /> : null}
      {tab === "pricing" ? <path {...common} d="M12 3v18M16.5 7.5c0-1.6-2-2.5-4.5-2.5S7.5 5.9 7.5 7.5 9.5 10 12 10s4.5.9 4.5 2.5-2 2.5-4.5 2.5-4.5-.9-4.5-2.5" /> : null}
      {tab === "audit" ? <path {...common} d="M8 4h8M7 4.5h10v15.5H7zM9.5 9h5M9.5 13h5M9.5 17h3" /> : null}
    </svg>
  );
}

function errorMessage(err: unknown) {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") return err.message;
  return "";
}

function stageFail(message: string, t: (key: CopyKey) => string) {
  if (message.includes("No proof")) return t("admin_need_proof");
  if (message.includes("No finals")) return t("admin_need_final");
  if (message.includes("Not ready") || message.includes("Locked")) return t("admin_not_ready");
  if (message === "Legacy") return t("admin_legacy_cap");
  if (/Drive|403|404|401/i.test(message)) return t("admin_drive");
  if (message === "File" || message.includes("File size") || message.includes("File type")) return t("admin_file_big");
  if (/busy|register|429/i.test(message)) return t("admin_busy");
  return t("admin_unsaved");
}

const AdminLang = createContext(false);

function useAdminT() {
  const uk = useContext(AdminLang);
  const { t } = useI18n();
  return (key: CopyKey) => (uk ? (ADMIN_UK[key] ?? t(key)) : t(key));
}

function dataUrlToBlob(dataUrl: string) {
  const [head, body] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head || "")?.[1] || "application/octet-stream";
  const binary = atob(body || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function CaseFiles({
  appId,
  documents,
  docReason,
  onReason,
  onChanged,
}: {
  appId: string;
  documents: { id: string; category: string; fileName: string; mime: string; status: string; createdAt: string; rejectionReason: string }[];
  docReason: string;
  onReason: (value: string) => void;
  onChanged: () => void;
}) {
  const t = useAdminT();
  const [shots, setShots] = useState<Record<string, string>>({});
  const [viewer, setViewer] = useState<{ url: string; title: string; fileName: string; mime: string } | null>(null);
  const [fileErr, setFileErr] = useState("");
  const ids = documents.map((doc) => doc.id).join("|");
  useEffect(() => {
    let stop = false;
    const images = documents.filter((doc) => (doc.mime || "").startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(doc.fileName || ""));
    void (async () => {
      for (const doc of images) {
        if (stop) return;
        try {
          const full = await downloadDocument({ data: doc.id });
          if (!stop && full.data.startsWith("data:image/")) setShots((cur) => ({ ...cur, [doc.id]: full.data }));
        } catch {
          /* the name still shows */
        }
      }
    })();
    return () => {
      stop = true;
    };
  }, [appId, ids]);
  function catLabel(category: string) {
    const key = `cat_${category}` as CopyKey;
    const text = t(key);
    return text === key ? category : text;
  }
  const ordered = [...documents].sort((a, b) => {
    const ai = DOC_CATEGORIES.indexOf(a.category as DocCategory);
    const bi = DOC_CATEGORIES.indexOf(b.category as DocCategory);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || (b.createdAt || "").localeCompare(a.createdAt || "");
  });
  return (
    <section className="mt-6">
      <h3 className="display text-2xl">{t("admin_files")}</h3>
      {ordered.length === 0 ? <p className="mt-2 text-sm text-mist">{t("admin_files_empty")}</p> : null}
      <ul className="mt-3 grid gap-3">
        {ordered.map((doc) => (
          <li key={doc.id} className="glass p-3">
            {shots[doc.id] ? <img src={shots[doc.id]} alt="" className="mb-3 max-h-64 w-full object-contain bg-black/40" /> : null}
            <p>{catLabel(doc.category)}</p>
            <p className="text-sm text-mist">{doc.fileName}</p>
            <p className="text-sm text-mist">{doc.createdAt?.slice(0, 16)} · {doc.status}{doc.rejectionReason ? ` · ${doc.rejectionReason}` : ""}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setFileErr("");
                  void downloadDocument({ data: doc.id })
                    .then((full) => {
                      const blob = dataUrlToBlob(full.data);
                      const url = URL.createObjectURL(blob);
                      if ((full.mime || "").startsWith("image/") || full.data.startsWith("data:image/")) {
                        setShots((cur) => ({ ...cur, [doc.id]: full.data }));
                      }
                      setViewer({ url, title: catLabel(doc.category), fileName: full.fileName, mime: full.mime });
                    })
                    .catch(() => setFileErr(t("admin_file_miss")));
                }}
              >
                {t("admin_open")}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => void reviewDocument({ data: { id: doc.id, status: "APPROVED", reason: "" } }).then(onChanged).catch(() => setFileErr(t("admin_unsaved")))}
              >
                {t("admin_doc_ok")}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const code = docReason.split("|")[0] || "other";
                  const extra = docReason.split("|").slice(1).join("|");
                  const reason = ["blur", "name", "page", "other"].includes(code) ? `${code}|${extra}` : `other|${docReason}`;
                  void reviewDocument({ data: { id: doc.id, status: "REJECTED", reason } }).then(onChanged).catch(() => setFileErr(t("admin_unsaved")));
                }}
              >
                {t("admin_doc_no")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 grid max-w-md gap-2">
        <select
          className="field"
          value={(docReason.split("|")[0] || "other")}
          onChange={(e) => onReason(`${e.target.value}|${docReason.split("|").slice(1).join("|")}`)}
        >
          <option value="blur">{t("reject_blur")}</option>
          <option value="name">{t("reject_name")}</option>
          <option value="page">{t("reject_page")}</option>
          <option value="other">{t("reject_other")}</option>
        </select>
        <input className="field" placeholder={t("reject_line")} value={docReason.includes("|") ? docReason.split("|").slice(1).join("|") : docReason} onChange={(e) => onReason(`${docReason.split("|")[0] || "other"}|${e.target.value}`)} />
      </div>
      {fileErr ? <p className="mt-2 text-sm text-metal">{fileErr}</p> : null}
      {viewer ? (
        <DocScreen
          url={viewer.url}
          title={viewer.title}
          closeLabel={t("close")}
          downloadLabel={t("download")}
          onClose={() => {
            URL.revokeObjectURL(viewer.url);
            setViewer(null);
          }}
          onDownload={() => {
            const link = document.createElement("a");
            link.href = viewer.url;
            link.download = viewer.fileName;
            link.click();
          }}
        />
      ) : null}
    </section>
  );
}

const QUESTION_LABELS: [string, string][] = [
  ["firstName", "Ім’я"],
  ["lastName", "Прізвище"],
  ["middleName", "По батькові"],
  ["birthDate", "Дата народження"],
  ["gender", "Стать"],
  ["citizenship", "Громадянство"],
  ["criminalRecord", "Судимість"],
  ["phone", "Телефон"],
  ["previousVisa", "Попередня віза"],
  ["travelWithFamily", "Їде з родиною"],
];

function QuestionnaireBlock({ raw }: { raw: string }) {
  let data: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") data = parsed as Record<string, unknown>;
  } catch {
    return <p className="mt-3 break-all text-sm">{raw}</p>;
  }
  const rows = QUESTION_LABELS.map(([key, label]) => {
    const value = data[key];
    if (key === "middleName" && data.middleNameAbsent === true) return [label, "немає"] as const;
    if (value === undefined || value === null || value === "") return null;
    return [label, String(value)] as const;
  }).filter((row): row is readonly [string, string] => Boolean(row));
  if (!rows.length) return null;
  return (
    <dl className="mt-4 grid min-w-0 gap-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="grid min-w-0 gap-0.5 border-t border-white/10 py-2">
          <dt className="text-mist">{label}</dt>
          <dd className="break-all">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

async function asData(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  return { data, mime: file.type, fileName: file.name };
}

async function photoDataUrl(file: File, limit = 900_000) {
  const image = await openImage(await asReadablePhoto(file));
  let edge = 1200;
  let quality = 0.72;
  let data = "";
  try {
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const scale = Math.min(1, edge / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("File");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      image.draw(ctx, canvas.width, canvas.height);
      data = canvas.toDataURL("image/jpeg", quality);
      if (data.length <= limit) return data;
      quality = Math.max(0.4, quality - 0.08);
      edge = Math.max(420, Math.round(edge * 0.72));
    }
  } finally {
    image.close();
  }
  if (!data || data.length > limit) throw new Error("File");
  return data;
}

async function asReadablePhoto(file: File) {
  try {
    const probe = await openImage(file);
    probe.close();
    return file;
  } catch {
    const convert = (await import("heic2any")).default;
    try {
      const result = await convert({ blob: file, toType: "image/jpeg", quality: 0.86 });
      const blob = Array.isArray(result) ? result[0] : result;
      if (!blob) throw new Error("File");
      return new File([blob], "photo.jpg", { type: "image/jpeg" });
    } catch {
      throw new Error("heic");
    }
  }
}

function openImage(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  return createImageBitmap(file)
    .then((bitmap) => ({
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => ctx.drawImage(bitmap, 0, 0, w, h),
      close: () => bitmap.close(),
    }))
    .catch(async () => {
      const url = URL.createObjectURL(file);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error("decode"));
          el.src = url;
        });
        if (!img.naturalWidth) throw new Error("decode");
        return {
          width: img.naturalWidth,
          height: img.naturalHeight,
          draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => ctx.drawImage(img, 0, 0, w, h),
          close: () => URL.revokeObjectURL(url),
        };
      } catch {
        URL.revokeObjectURL(url);
        throw new Error("decode");
      }
    });
}

function PhotoPick({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  return (
    <label className="btn relative inline-flex w-fit cursor-pointer items-center overflow-hidden">
      {label}
      <input
        className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
        type="file"
        accept="image/*,.heic,.heif,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.avif,.jfif"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
      />
    </label>
  );
}

function phoneOf(raw: string) {
  try {
    const q = JSON.parse(raw) as { phone?: string };
    return q.phone || "";
  } catch {
    return "";
  }
}

function lastNameOf(raw: string) {
  try {
    const q = JSON.parse(raw) as { lastName?: string };
    return q.lastName || "";
  } catch {
    return "";
  }
}

function moneyHanging(app: AppRow) {
  if (app.status !== "OPEN") return false;
  const stamp = app.stage === 2 ? app.stage2At : app.stage === 4 ? app.stage4At : "";
  if (!stamp) return false;
  return Date.now() - Date.parse(stamp) > 48 * 3600 * 1000;
}

function photoError(err: unknown, t: (key: CopyKey) => string) {
  const text = err instanceof Error ? err.message : "";
  if (text === "heic") return t("admin_photo_heic");
  if (text === "Three") return t("admin_three");
  if (/Drive|stored|403|404|401|busy|register/i.test(text)) return t("admin_drive");
  if (text === "File" || text === "File size" || text === "File type") return t("admin_file_big");
  if (text) return `${t("admin_unsaved")} ${text}`;
  return t("admin_unsaved");
}

export function AdminPage({ tab, id }: { tab: string; id: string }) {
  const { t: publicT, lang } = useI18n();
  const { pending, signedIn, deskId } = useDesk();
  const navigate = useNavigate();
  const { data, reload } = useSite();
  const current = (TABS.includes(tab as Tab) ? tab : "overview") as Tab;
  const [role, setRole] = useState<string | null>(null);
  const [me, setMe] = useState("");
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
  const [staffSettings, setStaffSettings] = useState<Record<string, string> | null>(null);
  const [newApp, setNewApp] = useState({ email: "", vacancyId: "", citizenship: CITIZENSHIPS[0] ?? "", processing: "STANDARD" as Processing });
  const [userQuery, setUserQuery] = useState("");
  const [qCountry, setQCountry] = useState("");
  const [qStage, setQStage] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [auditQuery, setAuditQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [managerId, setManagerId] = useState("");
  const [exportNote, setExportNote] = useState("");
  const [docReason, setDocReason] = useState("");
  const [stageNote, setStageNote] = useState("");
  const [acting, setActing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [caseQuery, setCaseQuery] = useState("");
  const [casePage, setCasePage] = useState(1);
  const [hangOnly, setHangOnly] = useState(false);
  const [rejectCode, setRejectCode] = useState("other");
  const [focusUser, setFocusUser] = useState("");
  const [appsReady, setAppsReady] = useState(false);
  const [rail, setRail] = useState<"off" | "icons" | "labels">("off");
  const [menuSlot, setMenuSlot] = useState<HTMLElement | null>(null);
  const [cutUser, setCutUser] = useState("");
  const [cutPct, setCutPct] = useState("0");
  const [cutNote, setCutNote] = useState("");
  const staffUk = role === "ADMIN" || role === "MANAGER";
  const t = (key: CopyKey) => (staffUk ? (ADMIN_UK[key] ?? publicT(key)) : publicT(key));

  async function acceptCase(caseId: string) {
    setErr("");
    try {
      await adminSetStage({ data: { id: caseId, action: "accept", reason: "" } });
      setApps(await adminListApplications({ data: { includeIncomplete: showAll } }));
      if (id === caseId) setDetail(await adminGetApplication({ data: caseId }));
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error";
      setErr(message === "Not ready" ? t("admin_block_q") : message);
    }
  }

  function go(next: Tab, nextId = "") {
    void navigate({ to: "/admin", search: { tab: next, id: nextId } });
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vg-admin-rail");
      if (saved === "off" || saved === "icons" || saved === "labels") {
        setRail(saved);
        return;
      }
      setRail(window.matchMedia("(max-width: 767px)").matches ? "off" : "icons");
    } catch {
      /* keep the menu closed */
    }
  }, []);

  useLayoutEffect(() => {
    setMenuSlot(document.getElementById("vg-admin-burger"));
  });

  function setRailMode(next: "off" | "icons" | "labels") {
    setRail(next);
    try {
      localStorage.setItem("vg-admin-rail", next);
      if (next !== "off") localStorage.setItem("vg-admin-rail-size", next);
    } catch {
      /* the choice simply will not stick */
    }
  }

  function openRail() {
    let size: "icons" | "labels" = "icons";
    try {
      const saved = localStorage.getItem("vg-admin-rail-size");
      if (saved === "labels" || saved === "icons") size = saved;
      else if (window.matchMedia("(max-width: 767px)").matches) size = "labels";
    } catch {
      size = "icons";
    }
    setRailMode(size);
  }

  useEffect(() => {
    if (!signedIn) return;
    adminOverview()
      .then((o) => {
        setOverview(o);
        setRole(o.role);
        setMe(o.userId);
      })
      .catch((e: unknown) => {
        setRole("CLIENT");
        setErr(e instanceof Error ? e.message : "Error");
      });
  }, [deskId, signedIn]);

  useEffect(() => {
    if (role !== "ADMIN" && role !== "MANAGER") return;
    if (current === "applications" || current === "overview") {
      adminListApplications({ data: { includeIncomplete: current === "overview" || showAll } })
        .then((rows) => {
          setApps(rows);
          setAppsReady(true);
        })
        .catch((e: unknown) => {
          setAppsReady(true);
          setErr(e instanceof Error ? e.message : "Error");
        });
    }
    if (current === "team" && (role === "ADMIN" || role === "MANAGER")) void adminAllTeam().then(setTeam);
    if (current === "audit") void adminAudit().then(setAudit);
    if (current === "content" && data && role !== "ADMIN") setSettingsDraft(data.settings);
    if ((current === "content" || current === "pricing") && role === "ADMIN") {
      void adminGetSettings()
        .then((rows) => {
          setStaffSettings(rows);
          if (current === "content") setSettingsDraft(rows);
        })
        .catch(() => setErr(t("admin_unsaved")));
    }
  }, [current, role, showAll, data]);

  useEffect(() => {
    if ((current !== "applications" && current !== "overview") || !id || !detail) return;
    document.getElementById("case-detail")?.scrollIntoView({ block: "start" });
  }, [id, current, detail]);

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

  if (pending) {
    return (
      <Shell>
        <p className="px-4 py-16">{t("loading")}</p>
      </Shell>
    );
  }
  if (!signedIn) return <RedirectToSignIn />;
  if (role === "CLIENT" || role === "SUBAGENT") {
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
    if (!detail || acting) return;
    setErr("");
    setStageNote("");
    setActing(true);
    try {
      const result = await adminSetStage({ data: { id: detail.app.id, action, reason: action === "reject" ? `${rejectCode}|${reason}` : reason } });
      const moved = Number(result?.stage) || 0;
      const d = await adminGetApplication({ data: detail.app.id });
      if (moved > d.app.stage && d.app.status === "OPEN") d.app.stage = moved;
      setDetail(d);
      const listed = await adminListApplications({ data: { includeIncomplete: showAll } });
      setApps(listed.map((row) => (row.id === detail.app.id && moved > row.stage ? { ...row, stage: moved } : row)));
      setStageNote(t("admin_stage_ok"));
      void reload();
    } catch (e) {
      const text = stageFail(errorMessage(e), t);
      setStageNote(text);
      setErr(text);
    } finally {
      setActing(false);
    }
  }

  const tabLabel = (name: Tab) => t(`admin_${name === "applications" ? "apps" : name}` as CopyKey);

  return (
    <AdminLang.Provider value={staffUk}>
    <Shell>
      <div className="relative mx-auto flex w-full min-w-0 max-w-6xl items-start gap-3 px-4 py-6">
        {rail !== "off" ? (
          <button type="button" className="admin-scrim fixed inset-x-0 bottom-0 z-30 bg-black/55 md:hidden" aria-label={t("admin_nav_close")} onClick={() => setRailMode("off")} />
        ) : null}
        {rail !== "off" ? (
          <aside className={`admin-rail${rail === "labels" ? " is-wide" : ""}`}>
            <button type="button" className="admin-nav-btn" title={t("admin_nav_close")} aria-label={t("admin_nav_close")} onClick={() => setRailMode("off")}>
              <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              {rail === "labels" ? <span>{t("admin_nav_close")}</span> : null}
            </button>
            <button
              type="button"
              className="admin-nav-btn"
              title={rail === "labels" ? t("admin_nav_icons") : t("admin_nav_labels")}
              aria-label={rail === "labels" ? t("admin_nav_icons") : t("admin_nav_labels")}
              onClick={() => setRailMode(rail === "labels" ? "icons" : "labels")}
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden="true">
                {rail === "labels" ? (
                  <path d="M14 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M10 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
              {rail === "labels" ? <span>{t("admin_nav_icons")}</span> : null}
            </button>
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                title={tabLabel(name)}
                aria-label={tabLabel(name)}
                aria-current={current === name ? "page" : undefined}
                className={`admin-nav-btn${current === name ? " is-on" : ""}`}
                onClick={() => {
                  go(name);
                  if (window.matchMedia("(max-width: 767px)").matches) setRailMode("off");
                }}
              >
                <NavGlyph tab={name} />
                {rail === "labels" ? <span>{tabLabel(name)}</span> : null}
              </button>
            ))}
          </aside>
        ) : null}
        <div className="min-w-0 w-full max-w-full flex-1 overflow-x-clip">
        {menuSlot
          ? createPortal(
              <button type="button" className="admin-nav-btn" title={t("admin_nav_menu")} aria-label={t("admin_nav_menu")} aria-expanded={rail !== "off"} onClick={() => (rail === "off" ? openRail() : setRailMode("off"))}>
                <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
              </button>,
              menuSlot,
            )
          : null}
        <p className="kicker">{t("admin_kicker")}</p>
        {err ? <p className="mt-4 text-metal">{err}</p> : null}

        {current === "overview" && overview ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <button type="button" className="glass p-5 text-left" onClick={() => { setQStage("1"); setHangOnly(false); setShowAll(true); go("applications"); }}>
              <p className="display text-5xl">{overview.waiting}</p>
              <p className="mt-2 text-mist">{t("admin_clients")}</p>
            </button>
            <button type="button" className="glass p-5 text-left" onClick={() => { setQStage("2"); setHangOnly(false); setShowAll(true); go("applications"); }}>
              <p className="display text-5xl">{overview.proofs}</p>
              <p className="mt-2 text-mist">{t("admin_review")}</p>
            </button>
            <button type="button" className="glass p-5 text-left" onClick={() => { setQStage(""); setHangOnly(false); setShowAll(false); go("applications"); }}>
              <p className="display text-5xl">{overview.live}</p>
              <p className="mt-2 text-mist">{t("admin_live")}</p>
            </button>
            {"funnel" in overview && overview.funnel ? (
              <article className="glass p-5 sm:col-span-3">
                <p className="kicker">{t("funnel_t")}</p>
                <p className="mt-2 text-sm text-mist">{t("funnel_calc")}: {overview.funnel.calc}</p>
                <p className="text-sm text-mist">{t("funnel_apply")}: {overview.funnel.apply}</p>
                <p className="text-sm text-mist">{t("funnel_q")}: {overview.funnel.question}</p>
              </article>
            ) : null}
            {"closed" in overview && overview.closed?.length ? (
              <div className="sm:col-span-3">
                <h2 className="mt-6 text-lg">{t("account_closed")}</h2>
                <ul className="mt-2 grid gap-2">
                  {overview.closed.map((row) => (
                    <li key={row.userId} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{row.email || row.fullName}</span>
                      <button type="button" className="btn" onClick={() => void adminRestoreAccount({ data: { userId: row.userId } }).then(() => adminOverview().then(setOverview)).catch(() => setErr(t("admin_unsaved")))}>
                        {t("account_restore")}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {isAdmin ? (
              <div className="sm:col-span-3">
                <h2 className="mt-6 text-lg">{t("admin_client_discount")}</h2>
                <p className="mt-2 max-w-xl text-sm text-mist">{t("admin_client_discount_help")}</p>
                {overview.users.some((u) => u.role === "SUBAGENT") ? (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!cutUser) return;
                      setCutNote("");
                      setErr("");
                      const percent = Math.max(0, Math.min(90, Math.round(Number(cutPct) || 0)));
                      void adminSetClientDiscount({ data: { userId: cutUser, percent } })
                        .then((saved) => {
                          setCutPct(String(saved.percent));
                          setCutNote(t("admin_client_discount_saved"));
                          return adminOverview().then(setOverview);
                        })
                        .catch(() => setErr(t("admin_unsaved")));
                    }}
                  >
                    <label className="grid gap-1 text-xs text-mist">
                      {t("admin_client_discount_pick")}
                      <select
                        className="field max-w-xs"
                        value={cutUser}
                        onChange={(e) => {
                          const id = e.target.value;
                          setCutUser(id);
                          setCutNote("");
                          const row = overview.users.find((u) => u.userId === id);
                          setCutPct(String(row && "clientDiscount" in row ? row.clientDiscount || 0 : 0));
                        }}
                      >
                        <option value="">{t("admin_client_discount_pick")}</option>
                        {overview.users
                          .filter((u) => u.role === "SUBAGENT")
                          .map((u) => (
                            <option key={u.userId} value={u.userId}>
                              {u.email || u.fullName}
                              {u.clientDiscount ? ` · −${u.clientDiscount}%` : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-mist">
                      %
                      <input className="field w-24" type="number" min={0} max={90} value={cutPct} onChange={(e) => setCutPct(e.target.value)} />
                    </label>
                    <button className="btn-solid" type="submit" disabled={!cutUser}>{t("save")}</button>
                    {cutNote ? <p className="text-sm text-mist">{cutNote}</p> : null}
                  </form>
                ) : (
                  <p className="mt-3 text-sm text-mist">{t("admin_client_discount_none")}</p>
                )}
                <h2 className="mt-6 text-lg">{t("admin_users")}</h2>
                <input className="field mt-3 max-w-sm" placeholder={t("admin_search")} value={userQuery} onChange={(e) => setUserQuery(e.target.value)} />
                <ul className="mt-3 grid gap-2">
                  {overview.users
                    .filter((u) => `${u.email} ${u.fullName} ${u.phone ?? ""}`.toLowerCase().includes(userQuery.trim().toLowerCase()))
                    .map((u) => {
                      const email = u.email.trim().toLowerCase();
                      const openCases = apps.filter((a) => a.status === "OPEN" && (a.userId === u.userId || (email !== "" && (a.clientEmail || "").trim().toLowerCase() === email)));
                      return (
                    <li key={u.userId} className="grid gap-2 border-t border-white/10 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        className="min-w-40 text-left underline-offset-4 hover:underline"
                        onClick={() => {
                          setFocusUser((cur) => (cur === u.userId ? "" : u.userId));
                          if (id) go("overview");
                        }}
                      >
                        {u.email || u.fullName}
                      </button>
                      <span className="text-metal">{u.role}{u.role === "SUBAGENT" && u.clientDiscount ? ` · −${u.clientDiscount}%` : ""}</span>
                      {isAdmin ? (
                      <select
                        className="field max-w-40"
                        defaultValue={u.role}
                        onChange={(e) => void adminSetRole({ data: { userId: u.userId, role: e.target.value } }).then(() => adminOverview().then(setOverview)).catch((err: unknown) => {
                          const text = err instanceof Error ? err.message : "";
                          setErr(text === "Last admin" ? t("admin_last_admin") : t("admin_unsaved"));
                        })}
                      >
                        <option>CLIENT</option>
                        <option>SUBAGENT</option>
                        <option>MANAGER</option>
                        <option>ADMIN</option>
                      </select>
                      ) : null}
                      {isAdmin ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          if (u.userId === deskId) {
                            setErr(t("admin_delete_self"));
                            return;
                          }
                          if (!window.confirm(t("admin_delete_user_ask"))) return;
                          void adminDeleteAccount({ data: { userId: u.userId } })
                            .then(() => adminOverview().then(setOverview))
                            .catch((e: unknown) => {
                              const text = e instanceof Error ? e.message : "";
                              setErr(text === "Last admin" ? t("admin_last_admin") : text === "Self" ? t("admin_delete_self") : t("admin_unsaved"));
                            });
                        }}
                      >
                        {t("admin_delete_user")}
                      </button>
                      ) : null}
                      </div>
                      {focusUser === u.userId ? (
                        <div className="grid gap-2 pb-1">
                          <p className="text-xs uppercase tracking-widest text-mist">{t("admin_user_cases")}</p>
                          {!appsReady ? <p className="text-mist">{t("loading")}</p> : openCases.length === 0 ? <p className="text-mist">{t("admin_no_open")}</p> : null}
                          {openCases.map((a) => (
                            <button key={a.id} type="button" className="btn w-fit" onClick={() => go("overview", a.id)}>
                              {a.id} · {a.vacancyTitle || a.country} · {a.stage}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                      );
                    })}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {current === "applications" && staff ? (
          <div className="mt-8 grid gap-4">
            <>
            <input
              className="field max-w-md"
              placeholder={t("admin_id_search")}
              value={caseQuery}
              onChange={(e) => {
                setCaseQuery(e.target.value);
                setCasePage(1);
              }}
            />
            <button type="button" className="btn w-fit md:hidden" onClick={() => setFiltersOpen((open) => !open)}>{t("admin_filters")}</button>
            <div className={`${filtersOpen ? "grid" : "hidden"} gap-2 md:grid`}>
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
                <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
                {t("mine_only")}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={hangOnly} onChange={(e) => setHangOnly(e.target.checked)} />
                {t("hang_money")}
              </label>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const lines = [["id", "email", "phone", "country", "stage", "status"].join(",")];
                  for (const row of apps.filter((item) => item.status === "OPEN")) {
                    const phone = row.clientPhone || phoneOf(row.questionnaire);
                    lines.push([row.id, row.clientEmail, phone, row.country, String(row.stage), row.status].map((cell) => `"${String(cell).replace(/"/g, "")}"`).join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "open-cases.csv";
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t("admin_export")}
              </button>
              {exportNote ? <span className="text-sm text-mist">{exportNote}</span> : null}
              {role === "MANAGER" ? <p className="text-sm text-mist">{t("admin_only_mine")}</p> : null}
            </div>
            </div>
            <p className="text-sm text-mist">{t("admin_pick_hint")}</p>
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
                disabled={acting || !managerId || picked.length === 0}
                onClick={() =>
                  void assignManagers({ data: { ids: picked, managerId } })
                    .then(() => adminListApplications({ data: { includeIncomplete: showAll } }).then(setApps))
                    .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"))
                }
              >
                {t("admin_assign")} · {picked.length}
              </button>
              <button
                type="button"
                className="btn"
                disabled={picked.length === 0}
                onClick={() => {
                  const lines = [["id", "email", "phone", "country", "stage", "status"].join(",")];
                  for (const row of apps.filter((item) => picked.includes(item.id))) {
                    const phone = row.clientPhone || phoneOf(row.questionnaire);
                    lines.push([row.id, row.clientEmail, phone, row.country, String(row.stage), row.status].map((cell) => `"${String(cell).replace(/"/g, "")}"`).join(","));
                  }
                  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "selected-cases.csv";
                  link.click();
                  URL.revokeObjectURL(url);
                }}
              >
                {t("admin_export_picked")} · {picked.length}
              </button>
              <button
                type="button"
                className="btn"
                disabled={acting || picked.length === 0}
                onClick={() => {
                  if (!window.confirm(t("admin_delete_picked_ask"))) return;
                  setActing(true);
                  void (async () => {
                    try {
                      for (const id of picked) await adminDeleteApplication({ data: id });
                      setPicked([]);
                      setApps(await adminListApplications({ data: { includeIncomplete: showAll } }));
                    } catch {
                      setErr(t("admin_unsaved"));
                    } finally {
                      setActing(false);
                    }
                  })();
                }}
              >
                {t("admin_delete_picked")} · {picked.length}
              </button>
            </div>
            <form
              className="glass grid gap-2 p-4 md:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                setErr("");
                void adminCreateApplication({ data: newApp })
                  .then(() => adminListApplications({ data: { includeIncomplete: true } }).then(setApps))
                  .then(() => reload())
                  .catch(() => setErr(t("admin_unsaved")));
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
                .filter((a) => role !== "MANAGER" || a.assignedManagerId === me)
                .filter((a) => !qCountry || a.country === qCountry)
                .filter((a) => !qStage || String(a.stage) === qStage)
                .filter((a) => !overdueOnly || isOverdue(a.cancelDeadlineAt) || isOverdue(a.docDeadlineAt))
                .filter((a) => !unassignedOnly || !a.assignedManagerId)
                .filter((a) => !mineOnly || a.assignedManagerId === me)
                .filter((a) => !hangOnly || (a.stage === 2 && moneyHanging(a)))
                .filter((a) => !caseQuery.trim() || `${a.id} ${a.clientEmail} ${a.clientPhone || ""} ${phoneOf(a.questionnaire)} ${lastNameOf(a.questionnaire)}`.toLowerCase().includes(caseQuery.trim().toLowerCase()));
              const pages = Math.max(1, Math.ceil(filtered.length / 15));
              const currentPage = Math.min(casePage, pages);
              const slice = filtered.slice((currentPage - 1) * 15, currentPage * 15);
              const phones = new Map<string, number>();
              for (const row of apps) {
                const digits = (row.clientPhone || phoneOf(row.questionnaire)).replace(/\D/g, "");
                if (digits.length >= 8) phones.set(digits, (phones.get(digits) || 0) + 1);
              }
              const hanging = apps.filter((row) => moneyHanging(row));
              return (
                <>
                  {hanging.length ? (
                    <div className="grid gap-2">
                      <p className="text-sm text-mist">{t("hang_list")}</p>
                      {hanging.map((row) => (
                        <button key={row.id} type="button" className="btn w-fit" onClick={() => go("applications", row.id)}>
                          {row.id} · {row.country} · {row.stage}
                          {row.stage2At ? ` · ${Math.max(0, Math.floor((Date.now() - Date.parse(row.stage2At)) / 86400000))} ${t("hang_days")}` : ""}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="sheet-wrap min-w-0 max-w-full">
                    <table className="sheet w-full text-left text-sm md:min-w-[880px]">
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
                          <th className="py-2 font-medium">{t("admin_action")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {slice.map((a) => {
                          const digits = (a.clientPhone || phoneOf(a.questionnaire)).replace(/\D/g, "");
                          const twin = digits.length >= 8 && (phones.get(digits) || 0) > 1;
                          return (
                          <tr key={a.id} className="border-t border-white/10">
                            <td className="py-3" data-label="">
                              <input
                                type="checkbox"
                                checked={picked.includes(a.id)}
                                onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, a.id] : cur.filter((id) => id !== a.id)))}
                              />
                            </td>
                            <td className="latin" data-label={t("filings_id")}>
                              <button type="button" className="underline-offset-4 hover:underline" onClick={() => go("applications", a.id)}>
                                {a.id}
                              </button>
                            </td>
                            <td className="latin" data-label={t("filings_date")}>{a.createdAt?.slice(0, 10)}</td>
                            <td className="latin" data-label={t("name")}>
                              {a.clientEmail || "—"}
                              {lastNameOf(a.questionnaire) ? <span className="mt-1 block text-xs text-mist">{lastNameOf(a.questionnaire)}</span> : null}
                              {twin ? <span className="mt-1 block text-xs">{t("phone_same")}</span> : null}
                              {a.accountClosed ? <span className="mt-1 block text-xs text-mist">{t("account_closed")}</span> : null}
                            </td>
                            <td data-label={t("admin_country")}>{a.country}</td>
                            <td data-label={t("seat")}>
                              {a.vacancyTitle}
                              {a.employer ? <span className="block text-mist">{a.employer}</span> : null}
                            </td>
                            <td data-label={t("admin_stage")}>
                              {a.stage}
                              {isOverdue(a.cancelDeadlineAt) || isOverdue(a.docDeadlineAt) ? <span className="mt-1 block text-xs">{t("admin_overdue")}</span> : null}
                              {!a.assignedManagerId ? <span className="mt-1 block text-xs text-mist">{t("admin_unassigned")}</span> : null}
                              {a.stage >= 3 && a.status === "OPEN" ? <span className="mt-1 block text-xs text-mist">{t("admin_waiting_doc")}</span> : null}
                            </td>
                            <td className="latin" data-label={t("portal_paid")}>{a.stage >= 4 ? "30 · 40 · 30" : a.stage >= 3 ? "30 · 40" : a.stage >= 2 ? "30" : "—"}</td>
                            <td className="latin" data-label={t("admin_assign")}>
                              {(() => {
                                const person = overview?.users.find((u) => u.userId === a.assignedManagerId);
                                const name = person?.fullName || person?.email;
                                return name ? <span className="text-[#7eb6ff]">{name}</span> : "—";
                              })()}
                            </td>
                            <td data-label={t("admin_action")}>
                              {a.status === "OPEN" && a.stage === 1 && a.profileComplete ? (
                                <button type="button" className="btn" onClick={() => void acceptCase(a.id)}>
                                  {t("admin_accept")}
                                </button>
                              ) : a.status === "OPEN" && a.stage === 1 ? (
                                <span className="text-xs text-mist">{t("admin_block_q")}</span>
                              ) : (
                                <button type="button" className="btn" onClick={() => go("applications", a.id)}>
                                  {t("admin_open")}
                                </button>
                              )}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {filtered.length === 0 ? <p className="text-mist">{t("admin_empty_cases")}</p> : null}
                  <p className="text-xs text-mist">{slice.length} / {filtered.length}</p>
                  <Pager page={currentPage} pages={pages} onPage={setCasePage} />
                </>
              );
            })()}
            </>
          </div>
        ) : null}

        {(current === "applications" || current === "overview") && staff && id && !detail ? <p className="mt-4">{t("loading")}</p> : null}
        {(current === "applications" || current === "overview") && staff && detail && id ? (
              <article id="case-detail" className="glass mt-8 w-full min-w-0 max-w-full overflow-x-clip p-5">
                <button type="button" className="btn mb-4" onClick={() => go(current)}>{t("admin_back")}</button>
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
                      : detail.app.stage === 2 && !detail.documents.some((d) => d.category === "PAYMENT_PROOF")
                      ? t("admin_need_proof")
                      : detail.app.stage === 2
                        ? t("admin_proof_ready")
                        : detail.documents.some((d) => d.status === "REJECTED")
                          ? t("admin_block_doc")
                          : t("admin_block_ok")}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.app.status === "OPEN" && detail.app.stage === 1 && detail.app.profileComplete ? (
                    <button type="button" className="btn-solid" disabled={acting} onClick={() => void act("accept")}>{t("admin_accept")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" ? (
                    <button type="button" className="btn" disabled={acting} onClick={() => void act("reject")}>{t("admin_reject")}</button>
                  ) : null}
                  <button type="button" className="btn" onClick={() => document.getElementById("case-note")?.scrollIntoView({ block: "center" })}>{t("case_write")}</button>
                  {detail.app.referrerUserId ? (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void adminMarkCommission({ data: { id: detail.app.id, paid: true } }).then(() => setStageNote(t("agent_pay_paid"))).catch(() => setStageNote(t("admin_unsaved")))}
                    >
                      {t("agent_comm")} · {t("agent_pay_paid")}
                    </button>
                  ) : null}
                </div>
                <div className="mt-3 grid max-w-md gap-2">
                  <select className="field" value={rejectCode} onChange={(e) => setRejectCode(e.target.value)}>
                    <option value="blur">{t("reject_blur")}</option>
                    <option value="name">{t("reject_name")}</option>
                    <option value="page">{t("reject_page")}</option>
                    <option value="other">{t("reject_other")}</option>
                  </select>
                  <input className="field" placeholder={t("reject_line")} value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
                <CaseFiles
                  appId={detail.app.id}
                  documents={detail.documents}
                  docReason={docReason}
                  onReason={setDocReason}
                  onChanged={() => void adminGetApplication({ data: detail.app.id }).then(setDetail)}
                />
                <label className="mt-4 grid max-w-sm gap-1 text-sm">
                  {t("admin_referrer")}
                  <select
                    className="field"
                    value={detail.app.referrerUserId || ""}
                    onChange={(e) =>
                      void adminSetReferrer({ data: { id: detail.app.id, referrerUserId: e.target.value } })
                        .then(() => adminGetApplication({ data: detail.app.id }).then(setDetail))
                        .catch(() => setStageNote(t("admin_unsaved")))
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
                <QuestionnaireBlock raw={detail.app.questionnaire} />
                <div className="mt-4 flex flex-wrap gap-2">
                  {detail.app.status === "OPEN" && detail.app.stage === 1 && detail.app.profileComplete ? (
                    <button type="button" className="btn-solid" disabled={acting} onClick={() => void act("accept")}>{t("admin_accept")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" && detail.app.stage === 2 ? (
                    <>
                      <button type="button" className="btn-solid" disabled={acting} onClick={() => void act("confirm-payment")}>{t("admin_to3")}</button>
                      <label className="btn relative inline-flex cursor-pointer items-center overflow-hidden">
                        {t("admin_proof_add")}
                        <input
                          className="absolute inset-0 z-10 size-full cursor-pointer opacity-0"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (!file || !detail) return;
                            setStageNote(t("admin_photo_wait"));
                            const pack = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
                              ? asData(file)
                              : photoDataUrl(file).then((data) => ({ data, mime: "image/jpeg", fileName: `${file.name.replace(/\.\w+$/, "") || "receipt"}.jpg` }));
                            void pack
                              .then((packed) => adminUploadProof({ data: { applicationId: detail.app.id, fileName: packed.fileName, mime: packed.mime, data: packed.data } }))
                              .then(() => adminGetApplication({ data: detail.app.id }))
                              .then((next) => {
                                setDetail(next);
                                setStageNote(t("admin_proof_ready"));
                              })
                              .catch((e: unknown) => setStageNote(stageFail(errorMessage(e), t)));
                          }}
                        />
                      </label>
                    </>
                  ) : null}
                  {detail.app.status === "OPEN" && detail.app.stage === 3 && !openedBeforeInvoice2Rule(detail.app.createdAt) ? (
                    <button type="button" className="btn-solid" disabled={acting} onClick={() => void act("stage4")}>{t("admin_to4")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" ? (
                    <button type="button" className="btn" disabled={acting} onClick={() => void act("reject")}>{t("admin_reject")}</button>
                  ) : null}
                  {detail.app.status === "OPEN" ? (
                    <button type="button" className="btn" disabled={acting} onClick={() => void act("cancel")}>{t("status_cancelled")}</button>
                  ) : null}
                </div>
                {openedBeforeInvoice2Rule(detail.app.createdAt) ? <p className="mt-3 text-sm text-mist">{t("admin_legacy_cap")}</p> : null}
                {stageNote ? <p className="mt-3 text-sm text-metal">{stageNote}</p> : null}
                <input className="field mt-3" placeholder={t("admin_reason")} value={reason} onChange={(e) => setReason(e.target.value)} />
                {detail.app.stage >= 3 ? (
                  <label className="mt-4 grid gap-1 text-sm">
                    {t("admin_process")}
                    <select
                      className="field"
                      value={detail.app.processStage}
                      onChange={(e) =>
                        void adminSetProcess({ data: { id: detail.app.id, processStage: e.target.value } })
                          .then(() => adminGetApplication({ data: detail.app.id }).then(setDetail))
                          .catch(() => setStageNote(t("admin_unsaved")))
                      }
                    >
                      {PROCESS_STAGES.filter((s) => !openedBeforeInvoice2Rule(detail.app.createdAt) || stageIndex(s) <= stageIndex(INVOICE2_STAGE)).map((s) => (
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
                          })
                            .then(() => adminGetApplication({ data: detail.app.id }).then(setDetail))
                            .catch(() => setStageNote(t("admin_unsaved"))),
                        );
                      }}
                    />
                  </label>
                ) : null}
                <label className="mt-4 grid gap-1 text-sm">
                  {t("admin_dispatch")}
                  <textarea className="field" value={dispatch} onChange={(e) => setDispatch(e.target.value)} />
                  <button type="button" className="btn w-fit" onClick={() => void adminSaveDispatch({ data: { id: detail.app.id, note: dispatch } }).then(() => setStageNote(t("admin_saved"))).catch(() => setStageNote(t("admin_unsaved")))}>
                    {t("save")}
                  </button>
                </label>
                <form
                  id="case-note"
                  className="mt-4 flex min-w-0 flex-wrap gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void postMessage({ data: { applicationId: detail.app.id, body: note } }).then(() => {
                      setNote("");
                      return adminGetApplication({ data: detail.app.id }).then(setDetail);
                    }).catch(() => setStageNote(t("admin_unsaved")));
                  }}
                >
                  <input className="field min-w-0 flex-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("messages")} />
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
                <ul className="mt-2 break-all text-sm">
                  {audit
                    .filter((row) => row.target === detail.app.id)
                    .map((row) => (
                      <li key={row.id}>
                        {row.createdAt?.slice(0, 19)} · {row.action} · {row.details}
                      </li>
                    ))}
                </ul>
                <button
                  type="button"
                  className="btn mt-8"
                  disabled={acting}
                  onClick={() => {
                    if (!detail || !window.confirm(t("admin_delete_case_ask"))) return;
                    const caseId = detail.app.id;
                    setActing(true);
                    void adminDeleteApplication({ data: caseId })
                      .then(async () => {
                        setDetail(null);
                        const listed = await adminListApplications({ data: { includeIncomplete: current === "overview" || showAll } });
                        setApps(listed.filter((row) => row.id !== caseId));
                        go(current);
                      })
                      .catch(() => setStageNote(t("admin_unsaved")))
                      .finally(() => setActing(false));
                  }}
                >
                  {t("admin_delete_case")}
                </button>
              </article>
            ) : null}

        {current === "vacancies" && data ? (
          <div className="mt-8 grid gap-4">
            <VacancyForm
              products={data.products}
              initial={draft}
              onSave={async (v) => {
                try {
                  await adminSaveVacancy({ data: v });
                  setDraft({});
                  setErr("");
                  await reload();
                } catch {
                  setErr(t("admin_unsaved"));
                }
              }}
            />
            {draft.id ? <WorkplacePhotos vacancyId={draft.id} readOnly={!isAdmin} /> : null}
            <ul className="grid min-w-0 gap-3">
              {data.vacancies.map((v) => (
                <li key={v.id} className="grid min-w-0 gap-2 border-t border-white/10 py-3 text-sm">
                  <span className="min-w-0">
                    {v.active ? "" : "— "}
                    {v.country} · {v.title}
                  </span>
                  <input
                    className="field min-w-0"
                    defaultValue={v.salaryNet}
                    aria-label={t("salary")}
                    onBlur={(e) => {
                      if (e.target.value !== v.salaryNet) void adminSaveVacancy({ data: { ...v, salaryNet: e.target.value } }).then(reload).catch(() => setErr(t("admin_unsaved")));
                    }}
                  />
                  <div className="grid min-w-0 grid-cols-2 gap-2">
                    <input
                      className="field min-w-0"
                      type="number"
                      defaultValue={v.quota}
                      aria-label={t("quota")}
                      onBlur={(e) => {
                        const quota = Number(e.target.value);
                        if (quota !== v.quota) void adminSaveVacancy({ data: { ...v, quota } }).then(reload).catch(() => setErr(t("admin_unsaved")));
                      }}
                    />
                    <input
                      className="field min-w-0"
                      defaultValue={v.blockedCitizenships || ""}
                      placeholder={t("blocked")}
                      onBlur={(e) => {
                        if (e.target.value !== (v.blockedCitizenships || "")) {
                          void adminSaveVacancy({ data: { ...v, blockedCitizenships: e.target.value } }).then(reload).catch(() => setErr(t("admin_unsaved")));
                        }
                      }}
                    />
                  </div>
                  <div className="flex min-w-0 flex-wrap items-end gap-2">
                    <label className="flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={v.active}
                        onChange={(e) => void adminSaveVacancy({ data: { ...v, active: e.target.checked } }).then(reload).catch(() => setErr(t("admin_unsaved")))}
                      />
                      {t("active")}
                    </label>
                    <button type="button" className="btn" onClick={() => setDraft(v)}>{t("edit")}</button>
                    <button type="button" className="btn" onClick={() => setDraft({ ...v, id: "" })}>{t("copy_vac")}</button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() =>
                        void adminSaveVacancy({
                          data: { ...v, active: false, pauseUntil: new Date(Date.now() + 86400000).toISOString() },
                        }).then(reload).catch(() => setErr(t("admin_unsaved")))
                      }
                    >
                      {t("pause_day")}
                    </button>
                    <button type="button" className="btn" onClick={() => void adminDeleteVacancy({ data: v.id }).then(reload).catch(() => setErr(t("admin_unsaved")))}>{t("remove")}</button>
                    <label className="grid gap-1 text-xs text-mist">
                      {t("hide_until")}
                      <input
                        className="field field-date"
                        type="date"
                        onChange={(e) => {
                          if (!e.target.value) return;
                          void adminSaveVacancy({
                            data: { ...v, active: false, pauseUntil: new Date(`${e.target.value}T23:59:59`).toISOString() },
                          }).then(reload).catch(() => setErr(t("admin_unsaved")));
                        }}
                      />
                    </label>
                  </div>
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

        {current === "content" && staff && data && (role !== "ADMIN" || Object.keys(settingsDraft).length > 0) ? (
          <div className="mt-8 grid gap-4">
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
          </div>
        ) : null}

        {current === "pricing" && staff && data ? (
          <ul className="mt-8 grid gap-4">
            <p className="text-sm text-mist">{t("admin_live_note")}</p>
            {data.products.map((p) => {
              let log: { at: string; by: string; amount: string } | undefined;
              try {
                const book = JSON.parse(staffSettings?.price_log || "{}") as Record<string, { at: string; by: string; amount: string }>;
                log = book[p.id];
              } catch {
                log = undefined;
              }
              return <PriceRow key={p.id} product={p} readOnly={!isAdmin} onSaved={reload} log={log} />;
            })}
          </ul>
        ) : null}

        {current === "audit" ? (
          <div className="mt-8 grid gap-2">
            <input className="field max-w-xs" value={auditQuery} placeholder={t("filings_id")} onChange={(e) => setAuditQuery(e.target.value)} />
          <ul className="grid gap-2 text-sm">
            {audit
              .filter((row) => !auditQuery.trim() || `${row.target} ${row.details} ${row.action}`.toLowerCase().includes(auditQuery.trim().toLowerCase()))
              .map((row) => (
              <li key={row.id} className="border-t border-white/10 py-2">
                {row.createdAt?.slice(0, 19)} · {row.action} · {row.target} · {row.details}
              </li>
            ))}
          </ul>
          </div>
        ) : null}
        </div>
      </div>
    </Shell>
    </AdminLang.Provider>
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
  const t = useAdminT();
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
    if (!initial.id && !initial.title) return;
    setV((cur) => ({
      ...cur,
      ...initial,
      id: initial.id || "",
      quota: Number(initial.quota ?? cur.quota),
      country: initial.country || cur.country,
      visaProductId: initial.visaProductId || cur.visaProductId,
      active: initial.active ?? cur.active,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.id, initial.title, initial.visaProductId, initial.country]);
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
  const t = useAdminT();
  const [editId, setEditId] = useState("");
  const [fullName, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [photoData, setPhoto] = useState("");
  const [preview, setPreview] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  function pickPhoto(file: File | undefined) {
    if (!file) return;
    setNote("");
    setErr(t("admin_photo_wait"));
    void photoDataUrl(file, 180_000)
      .then((data) => {
        setPhoto(data);
        setPreview(data);
        setErr("");
      })
      .catch((e: unknown) => setErr(photoError(e, t)));
  }
  return (
    <div className="mt-8 grid gap-4">
      <p className="text-sm text-mist">{t("admin_live_note")}</p>
      {err ? <p className="text-sm text-metal">{err}</p> : null}
      {note ? <p className="text-sm text-mist">{note}</p> : null}
      {readOnly ? null : (
      <form
        className="glass grid gap-2 p-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setErr("");
          setNote("");
          const active = editId ? (team.find((m) => m.id === editId)?.active ?? true) : true;
          void adminSaveTeam({ data: { id: editId, fullName, position, phone, photoData, active } })
            .then(() => {
              setEditId("");
              setName("");
              setPosition("");
              setPhone("");
              setPhoto("");
              setPreview("");
              setNote(t("admin_saved"));
              onChange();
            })
            .catch((e: unknown) => {
              setErr(photoError(e, t));
              onChange();
            });
        }}
      >
        <input className="field" placeholder={t("name")} value={fullName} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder={t("position")} value={position} onChange={(e) => setPosition(e.target.value)} />
        <input className="field" placeholder={t("phone")} value={phone} onChange={(e) => setPhone(e.target.value)} />
        <PhotoPick label={t("photo")} onFile={pickPhoto} />
        {preview ? <img src={preview} alt="" className="size-16 object-cover" /> : null}
        {photoData ? <p className="text-sm text-mist md:col-span-2">{t("admin_photo_ready")}</p> : null}
        <button className="btn-solid w-fit" type="submit">{editId ? t("save") : t("add")}</button>
      </form>
      )}
      <ul className="grid gap-3">
        {team.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 border-t border-white/10 py-3">
            {m.photoData ? <img key={m.photoData} src={m.photoData} alt="" className="size-14 object-cover" /> : <span className="grid size-14 place-items-center bg-white/10">{m.fullName.slice(0, 1)}</span>}
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
                setNote("");
              }}
            >
              {t("edit")}
            </button>
            <PhotoPick
              label={t("admin_replace_photo")}
              onFile={(file) => {
                setErr("");
                setNote("");
                setErr(t("admin_photo_wait"));
                void photoDataUrl(file, 180_000)
                  .then((data) => adminSaveTeam({ data: { id: m.id, fullName: m.fullName, position: m.position, phone: m.phone, photoData: data, active: m.active } }))
                  .then(() => {
                    setErr("");
                    setNote(t("admin_photo_ok"));
                    onChange();
                  })
                  .catch((e: unknown) => setErr(photoError(e, t)));
              }}
            />
            <button type="button" className="btn" onClick={() => void adminDeleteTeam({ data: m.id }).then(onChange).catch((e: unknown) => setErr(photoError(e, t)))}>{t("remove")}</button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MailBox({ readOnly }: { readOnly: boolean }) {
  const t = useAdminT();
  const [from, setFrom] = useState("");
  const [key, setKey] = useState("");
  const [ready, setReady] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    void adminMailStatus()
      .then((row) => {
        setFrom(row.from || "");
        setReady(Boolean(row.ready));
      })
      .catch(() => undefined);
  }, []);
  return (
    <form
      className="glass grid gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (readOnly) return;
        setNote("");
        void adminSaveMail({ data: { from, key } })
          .then((row) => {
            setReady(Boolean(row.ready));
            setFrom(row.from || "");
            setKey("");
            setNote(t("admin_mail_saved"));
          })
          .catch(() => setNote(t("admin_unsaved")));
      }}
    >
      <p className="kicker">{t("admin_mail")}</p>
      <p className="text-sm text-mist">{t("admin_mail_help")}</p>
      <p className="text-sm">{ready ? t("admin_mail_ready") : t("admin_mail_missing")}</p>
      <label className="grid gap-1 text-sm text-mist">
        {t("admin_mail_from")}
        <input className="field" type="email" disabled={readOnly} value={from} onChange={(e) => setFrom(e.target.value)} />
      </label>
      <label className="grid gap-1 text-sm text-mist">
        {t("admin_mail_key")}
        <input className="field" disabled={readOnly} value={key} autoComplete="off" placeholder={t("admin_mail_keep")} onChange={(e) => setKey(e.target.value)} />
      </label>
      {note ? <p className="text-sm text-mist">{note}</p> : null}
      {readOnly ? null : <button className="btn-solid w-fit" type="submit">{t("save")}</button>}
    </form>
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
  lang: Lang;
  readOnly: boolean;
  onSettings: (s: Record<string, string>) => void;
  onSaved: () => void;
}) {
  const t = useAdminT();
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
    { key: "desk_hours", label: "hours_field" },
    { key: "door_hint", label: "door_field" },
    { key: "review_1_name", label: "name" },
    { key: "review_1_country", label: "admin_country" },
    { key: "review_1_date", label: "filings_date" },
    { key: "review_1_text", label: "admin_review_line" },
    { key: "review_2_name", label: "name" },
    { key: "review_2_country", label: "admin_country" },
    { key: "review_2_date", label: "filings_date" },
    { key: "review_2_text", label: "admin_review_line" },
  ];
  const story = storyKey(lang, "about_story");
  const lead = storyKey(lang, "about_lead");
  const title = storyKey(lang, "hero_title");
  const [partner, setPartner] = useState({ country: countries[0] ?? "", name: "" });
  const [mediaErr, setMediaErr] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [library, setLibrary] = useState<Slot[]>([]);
  const [shotCountry, setShotCountry] = useState(countries[0] ?? "");
  const [logoName, setLogoName] = useState("");
  const [logoCountry, setLogoCountry] = useState(countries[0] ?? "");
  function loadLibrary() {
    void adminListMedia().then(setLibrary).catch(() => undefined);
  }
  useEffect(() => {
    loadLibrary();
  }, []);
  function saved() {
    onSaved();
    loadLibrary();
  }
  function publishPhoto(file: File | undefined, kind: string, id?: string, itemTitle?: string, caption?: string, country?: string) {
    if (!file) return;
    setMediaErr(t("admin_photo_wait"));
    void photoDataUrl(file, 180_000)
      .then((imageData) =>
        adminSaveMedia({
          data: {
            id,
            kind,
            title: itemTitle || (kind === "license" ? "Licence" : kind === "office" ? "Office" : itemTitle || kind),
            caption: caption || "",
            imageData,
            country,
          },
        }),
      )
      .then(() => {
        setMediaErr(t("admin_photo_ok"));
        saved();
      })
      .catch((e: unknown) => setMediaErr(photoError(e, t)));
  }
  function patchMedia(item: Slot, extra: { caption?: string; active?: boolean; cover?: boolean; sortOrder?: number }) {
    setMediaErr("");
    void adminSaveMedia({
      data: {
        id: item.id,
        kind: item.kind,
        title: item.title,
        caption: extra.caption ?? item.caption,
        country: item.country,
        vacancyId: item.vacancyId,
        cover: extra.cover ?? item.cover,
        active: extra.active ?? item.active,
        sortOrder: extra.sortOrder ?? item.sortOrder,
      },
    })
      .then(saved)
      .catch((e: unknown) => setMediaErr(photoError(e, t)));
  }
  const rows: Slot[] = library.length
    ? library
    : media.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        caption: item.caption || "",
        imageData: item.imageData,
        sortOrder: 0,
        active: true,
      }));
  return (
    <div className="mt-8 grid gap-4">
      <MailBox readOnly={readOnly} />
      <p className="text-sm text-mist">{t("admin_live_note")}</p>
      {mediaErr ? <p className="text-sm text-metal">{mediaErr}</p> : null}
      <form
        className="glass grid gap-3 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (readOnly) return;
          setSaveNote("");
          void adminSaveSettings({ data: settings })
            .then(() => {
              setSaveNote(t("admin_saved"));
              onSaved();
            })
            .catch(() => setSaveNote(t("admin_unsaved")));
        }}
      >
        {[1, 2].some((n) => {
          const bits = ["name", "country", "date", "text"].map((key) => (settings[`review_${n}_${key}`] || "").trim());
          const filled = bits.filter(Boolean).length;
          return filled > 0 && filled < 4;
        }) ? <p className="text-sm text-metal">{t("review_need")}</p> : null}
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
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" disabled={readOnly} checked={settings.motion !== "0"} onChange={(e) => onSettings({ ...settings, motion: e.target.checked ? "1" : "0" })} />
          {t("admin_motion")}
        </label>
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" disabled={readOnly} checked={settings.count_filed !== "0"} onChange={(e) => onSettings({ ...settings, count_filed: e.target.checked ? "1" : "0" })} />
          {t("admin_count_filed")}
        </label>
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" disabled={readOnly} checked={settings.count_issued !== "0"} onChange={(e) => onSettings({ ...settings, count_issued: e.target.checked ? "1" : "0" })} />
          {t("admin_count_issued")}
        </label>
        <p className="text-sm text-mist">{t("admin_steps")}</p>
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className="grid gap-2">
            <input
              className="field"
              disabled={readOnly}
              value={stepField(settings.step_copy || "", lang, index, "t")}
              onChange={(e) => onSettings({ ...settings, step_copy: writeStep(settings.step_copy || "", lang, index, "t", e.target.value) })}
            />
            <textarea
              className="field"
              disabled={readOnly}
              value={stepField(settings.step_copy || "", lang, index, "b")}
              onChange={(e) => onSettings({ ...settings, step_copy: writeStep(settings.step_copy || "", lang, index, "b", e.target.value) })}
            />
          </div>
        ))}
        <label className="flex items-center gap-2 text-sm text-mist">
          <input type="checkbox" disabled={readOnly} checked={settings.banner_on === "1"} onChange={(e) => onSettings({ ...settings, banner_on: e.target.checked ? "1" : "0" })} />
          {t("admin_banner")}
        </label>
        <label className="grid gap-1 text-sm text-mist">
          {t("admin_banner_text")}
          <input className="field" disabled={readOnly} value={settings[`banner_text_${lang}`] ?? ""} onChange={(e) => onSettings({ ...settings, [`banner_text_${lang}`]: e.target.value })} />
        </label>
        <label className="grid gap-1 text-sm text-mist">
          {t("admin_banner_country")}
          <select className="field" disabled={readOnly} value={settings.banner_country ?? ""} onChange={(e) => onSettings({ ...settings, banner_country: e.target.value })}>
            <option value="" />
            {countries.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-sm text-mist">
            {t("admin_banner_start")}
            <input className="field" type="date" disabled={readOnly} value={settings.banner_start ?? ""} onChange={(e) => onSettings({ ...settings, banner_start: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm text-mist">
            {t("admin_banner_end")}
            <input className="field" type="date" disabled={readOnly} value={settings.banner_end ?? ""} onChange={(e) => onSettings({ ...settings, banner_end: e.target.value })} />
          </label>
        </div>
        {readOnly ? null : <button className="btn-solid w-fit" type="submit">{t("save")}</button>}
        {saveNote ? <p className="text-sm text-mist">{saveNote}</p> : null}
      </form>
      {readOnly ? null : (
      <div className="grid gap-3 md:grid-cols-2">
        {mediaErr ? <p className="text-sm text-metal md:col-span-2">{mediaErr}</p> : null}
        <PhotoPick label={t("admin_license")} onFile={(file) => publishPhoto(file, "license")} />
        <PhotoPick label={t("admin_office")} onFile={(file) => publishPhoto(file, "office")} />
        <PhotoPick label={t("admin_banner")} onFile={(file) => publishPhoto(file, "banner", undefined, "Banner")} />
        <div className="flex flex-wrap items-center gap-2 text-sm text-mist">
          {t("admin_country_photo")}
          <select className="field max-w-48" value={shotCountry} onChange={(e) => setShotCountry(e.target.value)}>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
          <PhotoPick label={t("add")} onFile={(file) => publishPhoto(file, "country", undefined, shotCountry, "", shotCountry)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-mist md:col-span-2">
          {t("admin_logo")}
          <select className="field max-w-40" value={logoCountry} onChange={(e) => setLogoCountry(e.target.value)}>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
          <input className="field max-w-xs" placeholder={t("admin_partner")} value={logoName} onChange={(e) => setLogoName(e.target.value)} />
          <PhotoPick label={t("add")} onFile={(file) => publishPhoto(file, "logo", undefined, logoName || logoCountry, "", logoCountry)} />
        </div>
      </div>
      )}
      <ul className="grid gap-2">
        {rows.filter((item) => item.kind !== "vacancy").map((m) => (
          <li key={m.id} className={`flex flex-wrap items-center gap-3 text-sm ${m.active === false ? "opacity-50" : ""}`}>
            {m.active === false || !m.imageData ? <span className="grid h-12 w-16 place-items-center border border-white/15 text-xs text-mist">{t("admin_hide")}</span> : <img src={m.imageData} alt="" className="h-12 w-16 object-cover" />}
            <span>{m.kind === "license" ? t("admin_license") : m.kind === "country" ? t("admin_country_photo") : m.kind === "logo" ? t("admin_logo") : m.kind === "banner" ? t("admin_banner") : t("admin_office")}{m.country ? ` · ${m.country}` : ""}{m.title && m.kind === "logo" ? ` · ${m.title}` : ""}</span>
            {readOnly ? null : (
              <>
                <input className="field max-w-xs" defaultValue={m.caption} placeholder={t("admin_caption")} onBlur={(e) => { if (e.target.value !== m.caption) patchMedia(m, { caption: e.target.value }); }} />
                {m.kind === "logo" ? (
                  <input className="field w-20" type="number" defaultValue={m.sortOrder} aria-label={t("admin_order")} onBlur={(e) => { const sortOrder = Number(e.target.value); if (sortOrder !== m.sortOrder) patchMedia(m, { sortOrder }); }} />
                ) : null}
                <PhotoPick label={t("admin_replace_photo")} onFile={(file) => publishPhoto(file, m.kind, m.id, m.title, m.caption, m.country)} />
                {m.kind === "license" ? <button type="button" className="btn" onClick={() => patchMedia(m, { cover: true })}>{t("admin_cover")}</button> : null}
                {m.active === false ? (
                  <button type="button" className="btn" onClick={() => patchMedia(m, { active: true })}>{t("admin_show")}</button>
                ) : (
                  <button type="button" className="btn" onClick={() => void adminDeleteMedia({ data: m.id }).then(saved).catch((e: unknown) => setMediaErr(photoError(e, t)))}>{t("admin_hide")}</button>
                )}
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
          void adminSavePartner({ data: partner })
            .then(() => {
              setPartner({ ...partner, name: "" });
              onSaved();
            })
            .catch(() => setMediaErr(t("admin_unsaved")));
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
            {readOnly ? null : <button type="button" onClick={() => void adminDeletePartner({ data: p.id }).then(onSaved).catch(() => setMediaErr(t("admin_unsaved")))}>{t("remove")}</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkplacePhotos({ vacancyId, readOnly }: { vacancyId: string; readOnly: boolean }) {
  const t = useAdminT();
  const [rows, setRows] = useState<Slot[]>([]);
  const [err, setErr] = useState("");
  function load() {
    void adminListMedia().then((all) => setRows(all.filter((item) => item.kind === "vacancy" && item.vacancyId === vacancyId))).catch(() => undefined);
  }
  useEffect(() => {
    load();
  }, [vacancyId]);
  const shots = [...rows].sort((a, b) => Number(b.cover) - Number(a.cover) || a.sortOrder - b.sortOrder);
  function fail(e: unknown) {
    setErr(photoError(e, t));
  }
  return (
    <div className="glass grid gap-3 p-4">
      <p className="text-sm text-mist">{t("admin_vacancy_photo")}</p>
      {err ? <p className="text-sm text-metal">{err}</p> : null}
      {readOnly ? null : (
        <PhotoPick
          label={t("add")}
          onFile={(file) => {
            setErr(t("admin_photo_wait"));
            void photoDataUrl(file, 180_000)
              .then((imageData) => adminSaveMedia({ data: { kind: "vacancy", title: t("admin_vacancy_photo"), caption: "", imageData, vacancyId, cover: shots.length === 0 } }))
              .then(() => {
                setErr(t("admin_photo_ok"));
                load();
              })
              .catch(fail);
          }}
        />
      )}
      <ul className="grid gap-2">
        {shots.map((shot) => (
          <li key={shot.id} className={`flex flex-wrap items-center gap-2 text-sm ${shot.active === false ? "opacity-50" : ""}`}>
            {shot.imageData && shot.active !== false ? <img src={shot.imageData} alt="" className="h-12 w-16 object-cover" /> : <span className="text-xs text-mist">{t("admin_hide")}</span>}
            {readOnly ? null : (
              <>
                <input className="field max-w-xs" defaultValue={shot.caption} placeholder={t("admin_caption")} onBlur={(e) => {
                  if (e.target.value === shot.caption) return;
                  void adminSaveMedia({ data: { id: shot.id, kind: "vacancy", title: shot.title, caption: e.target.value, vacancyId, cover: shot.cover, active: shot.active } }).then(load).catch(fail);
                }} />
                <button type="button" className="btn" onClick={() => void adminSaveMedia({ data: { id: shot.id, kind: "vacancy", title: shot.title, caption: shot.caption, vacancyId, cover: true, active: true } }).then(load).catch(fail)}>{t("admin_cover")}</button>
                {shot.active === false ? (
                  <button type="button" className="btn" onClick={() => void adminSaveMedia({ data: { id: shot.id, kind: "vacancy", title: shot.title, caption: shot.caption, vacancyId, active: true, cover: shot.cover } }).then(load).catch(fail)}>{t("admin_show")}</button>
                ) : (
                  <button type="button" className="btn" onClick={() => void adminDeleteMedia({ data: shot.id }).then(load).catch(fail)}>{t("admin_hide")}</button>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriceRow({ product, readOnly, onSaved, log }: { product: VisaProduct; readOnly: boolean; onSaved: () => void; log?: { at: string; by: string; amount: string } }) {
  const t = useAdminT();
  const [p, setP] = useState(product);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const held = useRef<number | null>(null);
  useEffect(() => {
    if (held.current !== null && product.basePrice !== held.current) return;
    held.current = null;
    setP(product);
  }, [product.id, product.basePrice, product.active]);
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
      <input className="field" type="number" disabled={readOnly || busy} value={p.basePrice} onChange={(e) => setP({ ...p, basePrice: Number(e.target.value) })} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled={readOnly || busy} checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />
        {t("admin_offered")}
      </label>
      <div className="flex flex-wrap gap-2 text-xs">
        {(["STANDARD", "PRIORITY", "EXPRESS"] as Processing[]).map((lane) => (
          <label key={lane} className="flex items-center gap-1">
            <input type="checkbox" disabled={readOnly || busy} checked={p.allowedProcessing.includes(lane)} onChange={() => toggle(lane)} />
            {lane}
          </label>
        ))}
      </div>
      {readOnly ? null : (
        <button
          type="button"
          className="btn w-fit"
          disabled={busy}
          onClick={() => {
            const next = { ...p, basePrice: Math.max(0, Math.round(Number(p.basePrice) || 0)) };
            setBusy(true);
            setNote("");
            void adminSaveProduct({ data: next })
              .then(() => {
                held.current = next.basePrice;
                setP(next);
                setNote(t("admin_saved"));
                onSaved();
              })
              .catch(() => setNote(t("admin_unsaved")))
              .finally(() => setBusy(false));
          }}
        >
          {t("save")}
        </button>
      )}
      {note ? <p className="text-sm text-mist md:col-span-4">{note}</p> : null}
      <p className="text-sm text-mist md:col-span-4">{t("price_kept")}</p>
      {log ? <p className="text-xs text-mist md:col-span-4">{t("price_who")}: {log.at.slice(0, 16)} · {log.amount} · {log.by}</p> : null}
    </li>
  );
}
