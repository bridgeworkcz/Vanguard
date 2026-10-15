import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type CSSProperties } from "react";
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
  agentRename,
  postMessage,
  resubmitApplication,
  saveQuestionnaire,
  savePayAcks,
  takeInvoiceNumber,
  noteFunnel,
  openSpouseCase,
  updateMyContact,
  changeMyPassword,
  uploadMyDocument,
  type AppRow,
} from "@/lib/vanguard/api";
import {
  CALLING,
  CITIZENSHIPS,
  CONTACT_HOURS,
  DOC_CATEGORIES,
  EMPTY_QUESTIONNAIRE,
  acksDone,
  childrenOk,
  clientName,
  countrySlug,
  invoice2Unlocked,
  passportShort,
  parseQuestionnaire,
  questionnaireError,
  sameCountry,
  shareLabel,
  normalizeScheme,
  tranches,
  whatsAppHref,
  type DocCategory,
  type Questionnaire,
} from "@/lib/vanguard/domain";
import { useI18n, PUBLIC_LANGS, type CopyKey } from "@/lib/vanguard/i18n";
import { desktopOn, toggleDesktop } from "@/lib/vanguard/desk-view";
import { canCancel, hasLiveProof, hoursUntil, stageTone } from "@/lib/vanguard/ops";
import { buildAgentStatement, buildContract, buildInvoice, buildOffer, downloadStamped } from "@/lib/vanguard/pdf";
import { docsForCountry } from "@/lib/vanguard/round";

function shownReason(raw: string, t: (key: CopyKey) => string) {
  const code = raw.split("|")[0] || "";
  const extra = raw.split("|").slice(1).join("|").trim();
  const line = code === "blur" ? t("pay_blur") : code === "name" ? t("reject_name") : code === "page" ? t("pass_pages") : code === "expired" ? t("reject_expired") : code === "cropped" ? t("reject_cropped") : code === "other" ? t("reject_other") : raw;
  if (line === raw) return raw;
  return extra ? `${line} ${extra}` : line;
}

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

function fileGuide(app: AppRow, docs: { category: string; status: string }[], t: (k: CopyKey) => string) {
  const papers = docs.filter((doc) => doc.category !== "PAYMENT_PROOF" && doc.category !== "FINAL");
  const accepted = papers.filter((doc) => doc.status === "APPROVED").length;
  const rejected = papers.some((doc) => doc.status === "REJECTED");
  const proof = hasLiveProof(docs);
  const needed = docsForCountry(app.country).filter((cat) => cat !== "OTHER");
  const missing = needed.filter((cat) => !papers.some((doc) => doc.category === cat)).map((cat) => t(`cat_${cat}`));
  if (app.status === "ISSUED") return { done: t("guide_done_issued"), miss: t("guide_none"), when: t("guide_when_issued") };
  if (app.status === "CANCELLED" || app.status === "REJECTED") {
    return { done: app.profileComplete ? t("guide_done_q") : t("guide_none"), miss: t("guide_none"), when: t("guide_when_closed") };
  }
  if (!app.profileComplete) return { done: t("guide_none"), miss: t("guide_miss_q"), when: t("guide_when_1") };
  const done = [t("guide_done_q")];
  if (app.stage >= 2) done.push(t("guide_done_accept"));
  if (proof || app.stage > 2) done.push(t("guide_done_pay"));
  if (accepted) done.push(`${accepted} ${t("guide_done_papers")}`);
  const miss: string[] = [];
  if (app.stage === 1) miss.push(t("guide_miss_accept"));
  if (app.stage === 2 && !proof) miss.push(t("guide_miss_pay"));
  if (app.stage >= 2 && app.stage < 4 && missing.length) miss.push(`${t("guide_miss_papers")}: ${missing.join(", ")}`);
  if (rejected) miss.push(t("guide_miss_replace"));
  if (app.stage >= 4) miss.push(t("guide_miss_final"));
  const when = app.stage <= 1 ? t("guide_when_1") : app.stage === 2 && !proof ? t("guide_when_2") : app.stage >= 4 ? t("guide_when_4") : t("guide_when_3");
  return { done: done.join(" "), miss: miss.length ? miss.join(" ") : t("guide_none"), when };
}

function soon(iso: string | null, now: number) {
  if (!iso) return false;
  const ms = new Date(iso).getTime() - now;
  if (Number.isNaN(ms) || ms <= 0) return false;
  return ms <= 3 * 86400000;
}

function SettingsPanel({
  contact,
  setContact,
  contactMsg,
  setContactMsg,
}: {
  contact: { email: string; phone: string };
  setContact: (next: { email: string; phone: string }) => void;
  contactMsg: string;
  setContactMsg: (next: string) => void;
}) {
  const { t, lang, setLang } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [passMsg, setPassMsg] = useState("");
  const [desk, setDesk] = useState(false);
  useEffect(() => setDesk(desktopOn()), []);
  return (
    <div className="mt-8 grid max-w-xl gap-6">
      <Link to="/portal" search={{ id: "" }} className="text-sm text-mist">
        {t("portal_back")}
      </Link>
      <h2 className="display text-4xl">{t("settings_title")}</h2>
      <form
        className="glass grid gap-3 p-4"
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
        <p className="text-xs uppercase tracking-widest text-mist">{t("settings_account")}</p>
        <p className="text-sm text-mist">{t("contact_edit")}</p>
        <p className="text-xs text-mist">{t("contact_once")}</p>
        <input className="field" type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
        <input className="field" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
        <button className="btn w-fit" type="submit">{t("save")}</button>
        {contactMsg ? <p className="text-sm text-metal">{contactMsg}</p> : null}
      </form>
      <form
        className="glass grid gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setPassMsg("");
          if (next.trim().length < 8) {
            setPassMsg(t("settings_short"));
            return;
          }
          if (next !== again) {
            setPassMsg(t("settings_mismatch"));
            return;
          }
          void changeMyPassword({ data: { current, next } })
            .then(() => {
              setCurrent("");
              setNext("");
              setAgain("");
              setPassMsg(t("settings_saved"));
            })
            .catch((e: unknown) => {
              const text = e instanceof Error ? e.message : "";
              setPassMsg(text === "Short" ? t("settings_short") : t("settings_bad"));
            });
        }}
      >
        <p className="text-xs uppercase tracking-widest text-mist">{t("settings_password")}</p>
        <input className="field" type="password" autoComplete="current-password" placeholder={t("settings_current")} value={current} onChange={(e) => setCurrent(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" placeholder={t("settings_next")} value={next} onChange={(e) => setNext(e.target.value)} />
        <input className="field" type="password" autoComplete="new-password" placeholder={t("settings_again")} value={again} onChange={(e) => setAgain(e.target.value)} />
        <button className="btn w-fit" type="submit">{t("save")}</button>
        {passMsg ? <p className="text-sm text-metal">{passMsg}</p> : null}
      </form>
      <div className="glass grid gap-3 p-4">
        <p className="text-xs uppercase tracking-widest text-mist">{t("settings_lang")}</p>
        <div className="flex gap-2">
          {PUBLIC_LANGS.map((code) => (
            <button key={code} type="button" className={lang === code ? "btn-solid" : "btn"} onClick={() => setLang(code)}>
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <div className="glass grid gap-3 p-4">
        <p className="text-xs uppercase tracking-widest text-mist">{t("settings_view")}</p>
        <p className="text-sm text-mist">{t("view_help")}</p>
        <button type="button" className="btn w-fit" onClick={() => toggleDesktop()}>
          {desk ? t("view_phone") : t("view_desktop")}
        </button>
      </div>
    </div>
  );
}

export function PortalPage({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const paperLang = "en" as const;
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
  const [paperBusy, setPaperBusy] = useState(false);
  const [pendingDocs, setPendingDocs] = useState<Partial<Record<DocCategory, File>>>({});
  const [docNote, setDocNote] = useState("");
  const [docBusy, setDocBusy] = useState(false);
  const [proofNote, setProofNote] = useState("");
  const [qStep, setQStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const [shot, setShot] = useState<{ url: string; file: File } | null>(null);
  const [frame, setFrame] = useState<{ url: string; file: File } | null>(null);
  const [acks, setAcks] = useState({ room: false, night: false, fee: false, country: false });
  const [seeSum, setSeeSum] = useState(false);
  const [seeDate, setSeeDate] = useState(false);
  const [seePayee, setSeePayee] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [codeNote, setCodeNote] = useState("");

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
    setAcks(parsed.acks);
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
        if (p.role === "SUBAGENT") {
          return listAgentBook().then((next) => {
            setBook(next);
            setCodeDraft(next.code);
          });
        }
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
    const intent = JSON.parse(raw) as { vacancyId: string; citizenship: string; processing: "STANDARD" | "PRIORITY" | "EXPRESS"; agentCode?: string; lang?: string; record?: string; refusal?: string; passportExpiry?: string; campaign?: string };
    createApplication({ data: { ...intent, lang: intent.lang || lang, campaign: intent.campaign || sessionStorage.getItem("vg-campaign") || "" } })
      .then((res) => navigate({ to: "/portal", search: { id: res.id } }))
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"));
  }, [deskId]);

  useEffect(() => {
    if (!signedIn || !id || id === "settings") {
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
  useEffect(() => {
    const id = detail?.app?.id;
    if (!id) return;
    window.sessionStorage.setItem("vg-case", id);
  }, [detail?.app?.id]);

  function stepBad(step: number): string | null {
    if (step === 0) {
      if (!q.firstName.trim() || !q.lastName.trim()) return "name";
      if (!q.middleNameAbsent && !q.middleName.trim()) return "middle";
    }
    if (step === 1) {
      if (!q.birthDate) return "birth";
      const born = new Date(q.birthDate);
      if (Number.isNaN(born.getTime())) return "birth";
      if (born.getTime() > Date.now()) return "future";
      const age = (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
      if (age < 18 || age > 75) return "age";
    }
    if (step === 2 && !q.gender) return "gender";
    if (step === 3 && !q.citizenship) return "citizenship";
    if (step === 4) {
      const digits = q.phone.replace(/\D/g, "").replace(/^00/, "");
      if (digits.length < 8) return "phone";
      const code = CALLING[q.citizenship];
      if (code && !digits.startsWith(code)) return "phone_code";
    }
    if (step === 5 && q.criminalRecord !== "yes" && q.criminalRecord !== "no") return "record";
    if (step === 5 && q.criminalRecord === "yes") return "gate_record";
    if (step === 6 && q.previousVisa !== "yes" && q.previousVisa !== "no") return "visa";
    if (step === 7 && q.visaRefusal !== "yes" && q.visaRefusal !== "no") return "refusal";
    if (step === 7 && q.visaRefusal === "yes") return "gate_refusal";
    if (step === 8 && (!q.passportExpiry || passportShort(q.passportExpiry))) return "passport";
    if (step === 9 && q.travelWithFamily !== "alone" && q.travelWithFamily !== "family") return "family";
    if (step === 9 && q.travelWithFamily === "family" && !childrenOk(q)) return "child";
    if (step === 10 && !(CONTACT_HOURS as readonly string[]).includes(q.contactHour)) return "hour";
    if (step >= 11) return questionnaireError(q);
    return null;
  }

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
  const parts = app ? tranches(app.totalCost, normalizeScheme(app.feeScheme)) : null;
  const scheme = normalizeScheme(app?.feeScheme);
  const livePay = hasLiveProof(detail?.documents ?? []);
  const papers = app ? docsForCountry(app.country) : [];
  const thirdPaid =
    app?.status === "ISSUED" ||
    Boolean(
      app &&
        app.stage >= 4 &&
        detail?.documents.some(
          (d) => d.category === "PAYMENT_PROOF" && d.status !== "REJECTED" && (!app.stage4At || (d.createdAt || "") >= app.stage4At),
        ),
    );
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
    void noteFunnel({ data: { kind: "question" } }).catch(() => undefined);
    setEditing(false);
    setQStep(0);
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

  async function queueDoc(cat: DocCategory, file: File) {
    let next = file;
    if (cat === "PASSPORT" && /^IMG_\d+/i.test(file.name)) {
      const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
      next = new File([file], `passport.${ext}`, { type: file.type || "image/jpeg" });
    }
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      const text = await file.text();
      const pages = (text.match(/\/Type\s*\/Page(?!s)/g) || []).length;
      if (pages > 8) {
        setDocNote(t("pass_pages"));
        return;
      }
    }
    if (cat === "PHOTO" && (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name))) {
      const url = URL.createObjectURL(next);
      setFrame((cur) => {
        if (cur) URL.revokeObjectURL(cur.url);
        return { url, file: next };
      });
      return;
    }
    if (cat === "PASSPORT" && (file.type.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name))) {
      const url = URL.createObjectURL(next);
      setShot((cur) => {
        if (cur) URL.revokeObjectURL(cur.url);
        return { url, file: next };
      });
      return;
    }
    setPendingDocs((cur) => ({ ...cur, [cat]: next }));
    setDocNote("");
  }

  async function sendProof(file: File) {
    if (!file.type.startsWith("application/pdf") && !/\.pdf$/i.test(file.name)) {
      const url = URL.createObjectURL(file);
      const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("type"));
        img.src = url;
      }).finally(() => URL.revokeObjectURL(url));
      if (size.w < 1000 || size.h < 700) {
        setProofNote(t("pay_blur"));
        return;
      }
    }
    setProofNote(t("docs_wait"));
    await sendFile("PAYMENT_PROOF", file);
    setProofNote(t("docs_saved"));
  }

  function saveFile(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function withPaper(work: () => Promise<void>) {
    if (paperBusy) return;
    setPaperBusy(true);
    try {
      await work();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setPaperBusy(false);
    }
  }

  async function invoice(tranche: 1 | 2 | 3) {
    if (!app || !site || !visa) return;
    await withPaper(async () => {
      const numbered = await takeInvoiceNumber().catch(() => ({ number: `${app.id}-${tranche}` }));
      const url = await buildInvoice({
        lang: paperLang,
        tranche,
        settings: { ...site.settings, usdt_wallet: detail?.wallet || "", usdt_network: detail?.network || site.settings.usdt_network },
        fileId: app.id,
        client: clientName(parseQuestionnaire(app.questionnaire)),
        country: app.country,
        permit: visa.name,
        duration: visa.duration,
        employer: app.employer,
        total: app.totalCost,
        date: new Date().toISOString().slice(0, 10),
        number: numbered.number,
        hold: true,
        scheme: normalizeScheme(app.feeScheme),
      });
      if (url) saveFile(url, `${app.id}-invoice-${tranche}.pdf`);
    });
  }

  async function offer() {
    if (!app || !site) return;
    await withPaper(async () => {
      const job = site.vacancies.find((item) => item.id === app.vacancyId);
      const person = parseQuestionnaire(app.questionnaire);
      const url = await buildOffer({
        lang: paperLang,
        settings: { ...site.settings, usdt_wallet: detail?.wallet || "", usdt_network: detail?.network || site.settings.usdt_network },
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
      if (url) saveFile(url, `${app.id}-offer.pdf`);
    });
  }

  async function contract() {
    if (!app || !site || !visa) return;
    await withPaper(async () => {
      const person = parseQuestionnaire(app.questionnaire);
      const url = await buildContract({
        lang: paperLang,
        settings: { ...site.settings, usdt_wallet: detail?.wallet || "", usdt_network: detail?.network || site.settings.usdt_network },
        fileId: app.id,
        client: clientName(person),
        q: person,
        country: app.country,
        permit: visa.name,
        duration: visa.duration,
        total: app.totalCost,
        date: new Date().toISOString().slice(0, 10),
        hold: true,
        scheme: normalizeScheme(app.feeScheme),
      });
      if (url) saveFile(url, `${app.id}-agreement.pdf`);
    });
  }

  return (
    <Shell>
      <div className={`mx-auto max-w-5xl px-4 py-12 ${app && app.status === "OPEN" ? "pb-40" : ""}`}>
        <p className="kicker">{t("portal_kicker")}</p>
        <h1 className="display mt-3 text-5xl">{t("portal_title")}</h1>
        {err ? <p className="mt-4 text-metal">{err}</p> : null}
        {!id && role === "SUBAGENT" && book ? (
          <section className="mt-8 grid gap-4">
            <p className="kicker">{t("desk_kicker")}</p>
            <h2 className="display text-4xl">{t("desk_title")}</h2>
            <p className="max-w-2xl text-sm text-mist">{t("desk_only")}</p>
            <div className="glass grid gap-4 p-5 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-mist">{t("desk_code")}</p>
                <p className="mt-1 text-lg">{book.code}</p>
                <p className="text-sm text-mist">{book.email}</p>
                {book.locked ? (
                  <p className="mt-2 text-sm text-mist">{t("agent_code_locked")}</p>
                ) : (
                  <form
                    className="mt-2 grid gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setCodeNote("");
                      void agentRename({ data: { code: codeDraft } })
                        .then((next) => {
                          setBook({ ...book, code: next.code, locked: true });
                          setCodeNote(t("agent_code_locked"));
                        })
                        .catch(() => setCodeNote(t("q_err_name")));
                    }}
                  >
                    <p className="text-sm text-mist">{t("agent_code_once")}</p>
                    <input className="field" value={codeDraft} onChange={(e) => setCodeDraft(e.target.value)} />
                    <button className="btn w-fit" type="submit">{t("agent_code_save")}</button>
                    {codeNote ? <p className="text-sm text-metal">{codeNote}</p> : null}
                  </form>
                )}
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-mist">{t("desk_month")}</p>
                <p className="mt-1">{book.month}</p>
                <p className="text-sm text-mist">{t("desk_rate")} {book.rate}%</p>
                {"cut" in book && book.cut > 0 ? <p className="mt-2 text-sm">{t("desk_cut")} −{book.cut}%</p> : null}
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
            <button
              type="button"
              className="btn w-fit"
              onClick={() => {
                const head = ["id", "country", "stage", "pay", "fee", "commission", "opened"];
                const lines = book.cases
                  .filter((row) => (row.createdAt || "").slice(0, 7) === book.month)
                  .map((row) => [row.id, row.country, row.stage, row.pay, row.total, row.commission, (row.createdAt || "").slice(0, 10)].join(","));
                const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `cases-${book.month}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              {t("agent_csv")}
            </button>
            <button
              type="button"
              className="btn w-fit"
              onClick={() => {
                if (!site) return;
                const monthRows = book.cases.filter((row) => (row.createdAt || "").slice(0, 7) === book.month);
                void buildAgentStatement({
                  settings: site.settings,
                  month: book.month,
                  agent: book.code,
                  rate: book.rate,
                  total: book.commission,
                  rows: monthRows.map((row) => ({
                    id: row.id,
                    country: row.country,
                    fee: row.total,
                    commission: row.commission === "paid" ? "Paid" : row.commission === "due" ? "Due" : "Waiting",
                    opened: row.createdAt || "",
                  })),
                }).then((url) => {
                  if (url) saveFile(url, `vanguard-${book.month}.pdf`);
                });
              }}
            >
              {t("agent_pdf")}
            </button>
            <div className="sheet-wrap">
              <table className="sheet w-full min-w-[640px] text-left text-sm">
                <thead className="text-mist">
                  <tr>
                    <th className="py-2 font-medium">{t("filings_id")}</th>
                    <th className="py-2 font-medium">{t("filings_to")}</th>
                    <th className="py-2 font-medium">{t("admin_stage")}</th>
                    <th className="py-2 font-medium">{t("portal_paid")}</th>
                    <th className="py-2 font-medium">{t("search_fee")}</th>
                    <th className="py-2 font-medium">{t("agent_comm")}</th>
                  </tr>
                </thead>
                <tbody>
                  {book.cases.map((row) => (
                    <tr key={row.id} className="border-t border-white/10">
                      <td className="latin py-3" data-label={t("filings_id")}>{row.id}</td>
                      <td data-label={t("filings_to")}>{row.country}</td>
                      <td data-label={t("admin_stage")}>{row.status === "CANCELLED" ? t("status_cancelled") : row.status === "REJECTED" ? t("status_rejected") : t(`stage_${row.stage}` as CopyKey)}</td>
                      <td data-label={t("portal_paid")}>{row.pay === "paid" ? t("agent_pay_paid") : row.pay === "due" ? t("agent_pay_due") : t("agent_pay_wait")}</td>
                      <td className="latin" data-label={t("search_fee")}>{row.total}</td>
                      <td data-label={t("agent_comm")}>{row.commission === "paid" ? t("agent_pay_paid") : row.commission === "due" ? t("agent_pay_due") : t("agent_pay_wait")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        {id === "settings" ? (
          <SettingsPanel contact={contact} setContact={setContact} contactMsg={contactMsg} setContactMsg={setContactMsg} />
        ) : null}
        {!id ? (
          <div className="mt-8 grid gap-6">
            <Link to="/portal" search={{ id: "settings" }} className="btn w-fit">
              {t("settings_open")}
            </Link>
          <ul className="grid gap-3">
            {rows && rows.length === 0 ? <li className="text-mist">{t("portal_empty")}</li> : null}
            {rows?.map((row) => (
              <li key={row.id}>
                <Link to="/portal" search={{ id: row.id }} className="glass grid gap-2 p-4 sm:grid-cols-4">
                  <span className="display text-2xl sm:col-span-2">{row.vacancyTitle || row.country}</span>
                  <span className="text-sm text-mist">{row.country}</span>
                  <span className="text-sm text-paper">{nextAction(row, false, false, t)}</span>
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
              <button
                type="button"
                className="btn mt-2"
                onClick={() => {
                  const line = `${app.id} · ${t(`stage_${app.stage}` as CopyKey)}`;
                  void navigator.clipboard.writeText(line).catch(() => undefined);
                }}
              >
                {t("share_case")}
              </button>
              <h2 className="display mt-2 text-4xl">{app.vacancyTitle}</h2>
              <a href="#case-next" className="btn-solid mt-4 inline-flex">
                {nextAction(app, livePay, Boolean(detail?.documents.some((d) => d.status === "REJECTED")), t)}
              </a>
              <p className="mt-2 text-mist">
                {app.employer} · {app.country} · {app.totalCost} EUR · {t(`speed_${app.processing}`)}
              </p>
              {(soon(app.cancelDeadlineAt, now) || soon(app.docDeadlineAt, now)) && app.status === "OPEN" ? (
                <p className="mt-2 text-sm text-mist">
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
              <ol
                className="stage-line"
                style={{ "--stage": String(app.status === "CANCELLED" || app.status === "REJECTED" ? 1 : Math.min(4, Math.max(1, app.stage))) } as CSSProperties}
              >
                {[t("track_1"), t("track_2"), t("track_3"), t("track_4")].map((label, index) => {
                  const n = index + 1;
                  const here = app.status === "CANCELLED" || app.status === "REJECTED" ? n === 1 : n === Math.min(4, Math.max(1, app.stage));
                  const past = !here && n < app.stage && app.status !== "CANCELLED" && app.status !== "REJECTED";
                  return (
                    <li key={label} className={`stage-step ${here ? "stage-now" : past ? "stage-past" : "stage-next"}`}>
                      <span className="stage-tick" />
                      <span>
                        <span className="stage-name">{label}</span>
                        {here ? (
                          <span className="stage-now-line">
                            {nextAction(app, livePay, Boolean(detail?.documents.some((d) => d.status === "REJECTED")), t)}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {(() => {
                const guide = fileGuide(app, detail?.documents ?? [], t);
                return (
                  <section className="mt-5 grid gap-4 border border-white/15 p-4 sm:grid-cols-3">
                    <h3 className="display text-xl sm:col-span-3">{t("guide_title")}</h3>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-mist">{t("guide_done")}</p>
                      <p className="mt-2 text-sm">{guide.done}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-mist">{t("guide_miss")}</p>
                      <p className="mt-2 text-sm">{guide.miss}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-widest text-mist">{t("guide_when")}</p>
                      <p className="mt-2 text-sm">{guide.when}</p>
                    </div>
                  </section>
                );
              })()}
              {app.status === "REJECTED" && app.rejectionReason ? <p className="mt-2">{shownReason(app.rejectionReason, t)}</p> : null}
              {app.status === "REJECTED" ? (
                <button
                  type="button"
                  className="btn-solid mt-3"
                  onClick={() =>
                    void resubmitApplication({ data: app.id })
                      .then((res) => navigate({ to: "/portal", search: { id: res.id } }))
                      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"))
                  }
                >
                  {t("resubmit")}
                </button>
              ) : null}
              {app.status === "REJECTED" ? <p className="mt-2 text-sm text-mist">{t("resubmit_note")}</p> : null}
              {parts ? (
                <p className="mt-3 text-sm">
                  {t("pay_left")} {app.stage >= 4 ? parts.first + parts.second : app.stage >= 3 ? parts.first : 0} EUR · {t("pay_still")}{" "}
                  {app.stage >= 4 ? parts.final : app.stage >= 3 ? parts.second + parts.final : app.totalCost} EUR
                </p>
              ) : null}
              {parts ? (
                <p className="mt-3 text-sm text-mist">
                  {shareLabel(scheme, 0)} {parts.first} EUR · {app.stage >= 3 ? t("portal_paid") : t("portal_due")}
                  {" · "}{shareLabel(scheme, 1)} {parts.second} EUR · {app.stage >= 4 ? t("portal_paid") : t("portal_due")}
                  {" · "}{shareLabel(scheme, 2)} {parts.final} EUR · {thirdPaid ? t("portal_paid") : t("portal_due")}
                </p>
              ) : null}
            </div>

            {app.status === "CANCELLED" ? <p>{t("cancel_done")}</p> : null}

            {app.status === "OPEN" && app.stage === 1 && (!app.profileComplete || editing) ? (
              <form
                id="case-next"
                className="glass grid gap-4 p-5 sm:p-7"
                onSubmit={(e) => {
                  e.preventDefault();
                  const bad = stepBad(qStep);
                  if (bad) {
                    setMsg(bad);
                    return;
                  }
                  setMsg("");
                  if (qStep < 11) {
                    setQStep(qStep + 1);
                    return;
                  }
                  void saveQ();
                }}
              >
                <p className="text-xs uppercase tracking-widest text-mist">{qStep + 1} / 12</p>
                <h3 className="display text-3xl">{qStep === 11 ? t("q_review") : t("q_title")}</h3>
                {qStep === 0 ? (
                  <div className="grid gap-3">
                    <input className="field" placeholder={t("q_first")} value={q.firstName} onChange={(e) => setQ({ ...q, firstName: e.target.value })} />
                    <input className="field" placeholder={t("q_last")} value={q.lastName} onChange={(e) => setQ({ ...q, lastName: e.target.value })} />
                    <input className="field" placeholder={t("q_middle")} disabled={q.middleNameAbsent} value={q.middleName} onChange={(e) => setQ({ ...q, middleName: e.target.value })} />
                    <label className="flex min-h-12 items-center gap-2 text-sm">
                      <input type="checkbox" checked={q.middleNameAbsent} onChange={(e) => setQ({ ...q, middleNameAbsent: e.target.checked, middleName: "" })} />
                      {t("q_no_middle")}
                    </label>
                  </div>
                ) : null}
                {qStep === 1 ? (
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_birth")}
                    <input className="field" type="date" value={q.birthDate} onChange={(e) => setQ({ ...q, birthDate: e.target.value })} />
                  </label>
                ) : null}
                {qStep === 2 ? (
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_gender")}
                    <select className="field" value={q.gender} onChange={(e) => setQ({ ...q, gender: e.target.value })}>
                      <option value="" />
                      <option value="f">{t("q_gender_f")}</option>
                      <option value="m">{t("q_gender_m")}</option>
                      <option value="x">{t("q_gender_x")}</option>
                    </select>
                  </label>
                ) : null}
                {qStep === 3 ? (
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_citizen")}
                    <select className="field" value={q.citizenship} onChange={(e) => setQ({ ...q, citizenship: e.target.value })}>
                      <option value="" />
                      {CITIZENSHIPS.filter((c) => !sameCountry(c, app.country)).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {qStep === 4 ? (
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_phone")}
                    <input className="field" inputMode="tel" placeholder={CALLING[q.citizenship] ? `+${CALLING[q.citizenship]}` : ""} value={q.phone} onChange={(e) => setQ({ ...q, phone: e.target.value })} />
                  </label>
                ) : null}
                {qStep === 5 ? (
                  <fieldset className="grid gap-2 text-sm">
                    <legend>{t("q_record")}</legend>
                    <label className="flex gap-2"><input type="radio" name="rec" checked={q.criminalRecord === "no"} onChange={() => setQ({ ...q, criminalRecord: "no" })} />{t("q_no")}</label>
                    <label className="flex gap-2"><input type="radio" name="rec" checked={q.criminalRecord === "yes"} onChange={() => setQ({ ...q, criminalRecord: "yes" })} />{t("q_yes")}</label>
                  </fieldset>
                ) : null}
                {qStep === 6 ? (
                  <fieldset className="grid gap-2 text-sm">
                    <legend>{t("q_prev")}</legend>
                    <label className="flex gap-2"><input type="radio" name="visa" checked={q.previousVisa === "no"} onChange={() => setQ({ ...q, previousVisa: "no" })} />{t("q_no")}</label>
                    <label className="flex gap-2"><input type="radio" name="visa" checked={q.previousVisa === "yes"} onChange={() => setQ({ ...q, previousVisa: "yes" })} />{t("q_yes")}</label>
                  </fieldset>
                ) : null}
                {qStep === 7 ? (
                  <fieldset className="grid gap-2 text-sm">
                    <legend>{t("q_refusal")}</legend>
                    <label className="flex gap-2"><input type="radio" name="ref" checked={q.visaRefusal === "no"} onChange={() => setQ({ ...q, visaRefusal: "no" })} />{t("q_no")}</label>
                    <label className="flex gap-2"><input type="radio" name="ref" checked={q.visaRefusal === "yes"} onChange={() => setQ({ ...q, visaRefusal: "yes" })} />{t("q_yes")}</label>
                  </fieldset>
                ) : null}
                {qStep === 8 ? (
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_passport")}
                    <input className="field" type="date" value={q.passportExpiry} onChange={(e) => setQ({ ...q, passportExpiry: e.target.value })} />
                    <span>{t("q_passport_hint")}</span>
                  </label>
                ) : null}
                {qStep === 9 ? (
                  <fieldset className="grid gap-2 text-sm">
                    <legend>{t("q_family")}</legend>
                    <label className="flex gap-2"><input type="radio" name="fam" checked={q.travelWithFamily === "alone"} onChange={() => setQ({ ...q, travelWithFamily: "alone", children: [] })} />{t("q_alone")}</label>
                    <label className="flex gap-2"><input type="radio" name="fam" checked={q.travelWithFamily === "family"} onChange={() => setQ({ ...q, travelWithFamily: "family", children: q.children.length ? q.children : [{ name: "", age: "" }] })} />{t("q_with")}</label>
                    {q.travelWithFamily === "family" ? (
                      <div className="grid gap-2">
                        {q.children.map((child, index) => (
                          <div key={index} className="grid grid-cols-[1fr_5rem] gap-2">
                            <input className="field" placeholder={t("q_child_name")} value={child.name} onChange={(e) => setQ({ ...q, children: q.children.map((item, i) => i === index ? { ...item, name: e.target.value } : item) })} />
                            <input className="field" inputMode="numeric" placeholder={t("q_child_age")} value={child.age} onChange={(e) => setQ({ ...q, children: q.children.map((item, i) => i === index ? { ...item, age: e.target.value.replace(/\D/g, "").slice(0, 2) } : item) })} />
                          </div>
                        ))}
                        <button type="button" className="btn w-fit" onClick={() => setQ({ ...q, children: [...q.children, { name: "", age: "" }] })}>{t("q_child_add")}</button>
                      </div>
                    ) : null}
                  </fieldset>
                ) : null}
                {qStep === 10 ? (
                  <label className="grid gap-1 text-sm text-mist">
                    {t("q_hour")}
                    <select className="field" value={q.contactHour} onChange={(e) => setQ({ ...q, contactHour: e.target.value })}>
                      <option value="" />
                      {CONTACT_HOURS.map((hour) => (
                        <option key={hour} value={hour}>{hour}:00</option>
                      ))}
                    </select>
                    <span>{t("q_hour_hint")}</span>
                  </label>
                ) : null}
                {qStep === 11 ? (
                  <ul className="grid gap-2 text-sm">
                    <li>{q.firstName} {q.middleNameAbsent ? "" : q.middleName} {q.lastName}</li>
                    <li>{q.birthDate}</li>
                    <li>{q.gender}</li>
                    <li>{q.citizenship}</li>
                    <li>{q.phone}</li>
                    <li>{q.criminalRecord}</li>
                    <li>{q.previousVisa}</li>
                    <li>{q.visaRefusal}</li>
                    <li>{q.passportExpiry}</li>
                    <li>{q.travelWithFamily}{q.children.length ? ` · ${q.children.map((child) => `${child.name} ${child.age}`).join(", ")}` : ""}</li>
                    <li>{q.contactHour ? `${q.contactHour}:00` : ""}</li>
                  </ul>
                ) : null}
                {qErrKey ? <p className="text-metal">{t(qErrKey)}</p> : null}
                <div className="flex flex-wrap gap-2">
                  {qStep > 0 ? (
                    <button type="button" className="btn" onClick={() => { setMsg(""); setQStep(qStep - 1); }}>{t("q_back")}</button>
                  ) : null}
                  <button className="btn-solid w-fit" type="submit">{qStep === 11 ? t("q_save") : t("q_next")}</button>
                </div>
              </form>
            ) : null}

            {app.status === "OPEN" && app.stage === 1 && app.profileComplete && !editing ? (
              <div className="glass grid gap-2 p-5">
                <h3 className="display text-3xl">{t("q_review")}</h3>
                {[
                  [q.firstName, q.lastName, 0],
                  [q.birthDate, "", 1],
                  [q.gender, "", 2],
                  [q.citizenship, "", 3],
                  [q.phone, "", 4],
                  [q.criminalRecord, "", 5],
                  [q.previousVisa, "", 6],
                  [q.visaRefusal, "", 7],
                  [q.passportExpiry, "", 8],
                  [q.travelWithFamily, "", 9],
                  [q.contactHour ? `${q.contactHour}:00` : "", "", 10],
                ].map((row) => (
                  <p key={String(row[2])} className="flex items-center justify-between gap-3 border-t border-white/10 py-2 text-sm">
                    <span>{[row[0], row[1]].filter(Boolean).join(" ")}</span>
                    <button type="button" className="btn" onClick={() => { setEditing(true); setQStep(Number(row[2])); }}>{t("q_edit")}</button>
                  </p>
                ))}
              </div>
            ) : null}

            {app.status === "ISSUED" ? (
              <div className="glass p-5">
                <p className="kicker">{t("status_issued")}</p>
                <p className="mt-3 text-lg">{t("issued_keep")}</p>
                <Link to="/after/$citizenship" params={{ citizenship: countrySlug(app.citizenship || "georgia") }} className="btn mt-4 inline-flex">{t("after_nav")}</Link>
              </div>
            ) : null}
            {parts && app.status === "OPEN" && app.stage >= 2 ? (
              <div className="glass p-5">
                <p className="kicker">{t("pay_bar")}</p>
                <ol className="mt-3 grid gap-2 sm:grid-cols-3">
                  {[
                    [shareLabel(scheme, 0), parts.first, app.stage2At, app.stage >= 2],
                    [shareLabel(scheme, 1), parts.second, app.stage3At, app.stage >= 3],
                    [shareLabel(scheme, 2), parts.final, app.stage4At, app.stage >= 4],
                  ].map(([label, amount, date], index) => {
                    const due = !thirdPaid && ((app.stage === 2 && index === 0) || (app.stage === 3 && index === 1 && invoice2Unlocked(app.processStage)) || (app.stage >= 4 && index === 2));
                    return (
                    <li key={String(label)} className={`border-t pt-2 ${due ? "border-[#ff6a1a]" : "border-white/10"}`}>
                      <p className={due ? "ember" : "text-mist"}>{label}</p>
                      <p className={due ? "ember" : ""}>{amount} EUR</p>
                      <p className="text-sm text-mist">{typeof date === "string" && date ? date.slice(0, 10) : t("portal_due")}</p>
                    </li>
                    );
                  })}
                </ol>
              </div>
            ) : null}
            {app.status === "OPEN" && app.stage === 1 && app.profileComplete ? (
              <div id="case-next" className="grid gap-3">
                <p>{t("status_wait")}</p>
                <p>{t("contact_ask")}</p>
                {site?.settings.support_phone ? (
                  <a className="btn-solid w-fit" href={whatsAppHref(site.settings.support_phone, `${app.id}. ${app.citizenship} → ${app.country}`)} target="_blank" rel="noopener noreferrer">
                    WhatsApp · {site.settings.support_phone}
                  </a>
                ) : null}
              </div>
            ) : null}
            {app.stage === 1 ? <p className="text-sm text-mist">{t("locked_pdf")}</p> : null}

            {app.status === "OPEN" && app.stage === 2 ? (
              <div className="glass p-5">
                <p>
                  {t("cancel_on")}{" "}
                  {app.cancelDeadlineAt ? new Date(app.cancelDeadlineAt).toLocaleString() : "—"}
                  {app.cancelDeadlineAt && hoursUntil(app.cancelDeadlineAt, now) !== null ? (
                    <span className="mt-1 block text-mist">{Math.max(0, Math.ceil(hoursUntil(app.cancelDeadlineAt, now) || 0))} h</span>
                  ) : null}
                </p>
                {canCancel(app.status, app.stage, app.cancelDeadlineAt, livePay) ? (
                  <button
                    type="button"
                    className="btn mt-3"
                    onClick={() =>
                      void cancelMyApplication({ data: app.id })
                        .then(() => Promise.all([refreshDetail(app.id), refreshList()]))
                        .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"))
                    }
                  >
                    {t("cancel_btn")}
                  </button>
                ) : null}
              </div>
            ) : null}

            {app.status === "OPEN" && app.stage >= 2 ? (
              <div id="case-next" className="grid gap-2">
                <h3 className="display text-3xl">{t("portal_folder")}</h3>
                {thirdPaid ? <p className="text-sm text-mist">{t("pay_no_more")}</p> : <p className="text-sm text-mist">{t("open_here")}</p>}
                {(parts
                  ? [
                      { n: 1 as const, label: t("invoice_1"), amount: parts.first, open: true, paid: app.stage >= 3, due: app.stage === 2 && !thirdPaid },
                      { n: 2 as const, label: t("invoice_2"), amount: parts.second, open: (app.stage >= 3 && invoice2Unlocked(app.processStage)) || app.stage >= 4, paid: app.stage >= 4, due: app.stage === 3 && invoice2Unlocked(app.processStage) && !thirdPaid },
                      { n: 3 as const, label: t("invoice_3"), amount: parts.final, open: app.stage >= 4, paid: thirdPaid, due: app.stage >= 4 && !thirdPaid },
                    ]
                  : []
                )
                  .filter((row) => row.open)
                  .map((row) => (
                    <div key={row.n} className={`flex items-center justify-between gap-3 border px-3 py-3 ${row.due ? "border-[#ff6a1a]" : "border-white/15"}`}>
                      <div className="min-w-0">
                        <button type="button" className={`${row.due ? "btn-solid" : "btn"} max-w-full`} disabled={paperBusy} onClick={() => void invoice(row.n)}>
                          {row.label} · {row.amount} EUR
                        </button>
                        <p className={`mt-1 text-xs ${row.due ? "text-[#ff6a1a]" : "text-mist"}`}>{row.paid ? t("portal_paid") : row.due ? t("invoice_now") : t("portal_due")}</p>
                      </div>
                      <button type="button" className="btn shrink-0" disabled={paperBusy} onClick={() => void invoice(row.n)}>
                        {t("preview_download")}
                      </button>
                    </div>
                  ))}
                {app.stage >= 3 && app.stage < 4 && !invoice2Unlocked(app.processStage) ? <p className="text-sm text-mist">{t("invoice_2_when")}</p> : null}
                <div className="flex items-center justify-between gap-3 border border-white/15 px-3 py-3">
                  <button type="button" className="btn min-w-0" disabled={paperBusy} onClick={() => void offer()}>{t("offer")}</button>
                  <button type="button" className="btn shrink-0" disabled={paperBusy} onClick={() => void offer()}>{t("preview_download")}</button>
                </div>
                <div className="flex items-center justify-between gap-3 border border-white/15 px-3 py-3">
                  <button type="button" className="btn min-w-0" disabled={paperBusy} onClick={() => void contract()}>{t("contract")}</button>
                  <button type="button" className="btn shrink-0" disabled={paperBusy} onClick={() => void contract()}>{t("preview_download")}</button>
                </div>
                {detail?.wallet && !thirdPaid && app.stage >= 2 ? (
                  <p className="break-all text-sm">
                    {t("contact_wallet")}: {detail.wallet}
                    {detail.network ? <span className="mt-1 block text-mist">{detail.network}</span> : null}
                  </p>
                ) : null}
              </div>
            ) : null}

            {app.status === "OPEN" && !thirdPaid && (app.stage === 2 || (app.stage === 3 && invoice2Unlocked(app.processStage)) || app.stage >= 4) ? (
              <label className={`grid gap-2 rounded-2xl p-4 text-sm ${livePay && app.stage === 2 ? "" : "step-live"}`}>
                {t("pay_i_paid")}
                <span className="text-mist">{t("ack_need")}</span>
                {([
                  ["room", "ack_room"],
                  ["night", "ack_night"],
                  ["fee", "ack_fee"],
                  ["country", "ack_country"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={acks[key]}
                      onChange={(e) => {
                        const next = { ...acks, [key]: e.target.checked };
                        setAcks(next);
                        if (app) void savePayAcks({ data: { id: app.id, ...next } }).catch(() => undefined);
                      }}
                    />
                    {t(label)}
                  </label>
                ))}
                <span className="text-mist">{t("proof_help")}</span>
                <label className="flex items-center gap-2"><input type="checkbox" checked={seeSum} onChange={(e) => setSeeSum(e.target.checked)} />{t("proof_see_sum")}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={seeDate} onChange={(e) => setSeeDate(e.target.checked)} />{t("proof_see_date")}</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={seePayee} onChange={(e) => setSeePayee(e.target.checked)} />{t("proof_see_payee")}</label>
                <label className={`btn relative mt-2 inline-flex w-fit items-center overflow-hidden ${acksDone({ acks }) && seeSum && seeDate && seePayee ? "cursor-pointer" : "pointer-events-none opacity-40"}`}>
                  {t("upload")}
                  <input
                    className="absolute inset-0 z-10 cursor-pointer opacity-0"
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    disabled={!acksDone({ acks }) || !seeSum || !seeDate || !seePayee}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      void sendProof(file).catch((err: unknown) => setProofNote(uploadError(err)));
                    }}
                  />
                </label>
                {proofNote ? <span className="text-mist">{proofNote}</span> : null}
              </label>
            ) : null}

            {app.status === "OPEN" && app.stage >= 2 ? (
              <div className={app.stage === 4 && !detail?.documents.some((d) => d.status === "REJECTED") ? "" : livePay || app.stage > 2 ? "step-live rounded-2xl p-4" : ""}>
                {app.stage === 4 && !detail?.documents.some((d) => d.status === "REJECTED") ? null : livePay || app.stage > 2 ? <p className="kicker mb-3">{t("hint_here")}</p> : null}
                <h3 className="display text-3xl">{t("checklist_title")}</h3>
                <ul className="mt-3 grid gap-2 text-sm">
                  {papers.map((cat) => {
                    const files = [...(detail?.documents.filter((d) => d.category === cat) ?? [])].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
                    const latest = files[0];
                    const label = !latest ? t("checklist_miss") : latest.status === "REJECTED" ? t("checklist_no") : latest.status === "APPROVED" ? t("checklist_ok") : t("checklist_wait");
                    return (
                      <li key={cat} className={`flex items-baseline justify-between gap-3 border-t py-2 ${latest?.status === "REJECTED" ? "border-[#ff6a1a]" : "border-white/10"}`}>
                        <span>
                          {t(`cat_${cat}`)}
                          {latest?.status === "REJECTED" && latest.rejectionReason ? <span className="mt-1 block text-lg text-paper">{shownReason(latest.rejectionReason, t)}</span> : null}
                        </span>
                        <span className={latest?.status === "REJECTED" ? "ember" : "text-mist"}>{label}</span>
                      </li>
                    );
                  })}
                </ul>
                <h3 className="display mt-8 text-3xl">{t("docs_title")}</h3>
                <p className="mt-2 text-sm text-mist">{t("docs_help")}</p>
                {shot ? (
                  <div className="mt-4 grid gap-3">
                    <img src={shot.url} alt="" className="max-h-[70vh] w-full object-contain bg-black/40" />
                    <p className="text-sm text-mist">{t("pass_hint")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          URL.revokeObjectURL(shot.url);
                          setShot(null);
                        }}
                      >
                        {t("pass_retake")}
                      </button>
                      <button
                        type="button"
                        className="btn-solid"
                        onClick={() => {
                          setPendingDocs((cur) => ({ ...cur, PASSPORT: shot.file }));
                          URL.revokeObjectURL(shot.url);
                          setShot(null);
                        }}
                      >
                        {t("pass_use")}
                      </button>
                    </div>
                  </div>
                ) : null}
                {frame ? (
                  <div className="mt-4 grid gap-3">
                    <div className="relative bg-black">
                      <img src={frame.url} alt="" className="max-h-[70vh] w-full object-contain" />
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="h-[72%] w-[42%] rounded-[50%] border-2 border-[#ff6a1a] shadow-[0_0_0_999px_rgba(9,9,9,0.55)]" />
                      </div>
                    </div>
                    <p className="text-sm text-mist">{t("photo_frame")}</p>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn" onClick={() => { URL.revokeObjectURL(frame.url); setFrame(null); }}>{t("pass_retake")}</button>
                      <button type="button" className="btn-solid" onClick={() => { setPendingDocs((cur) => ({ ...cur, PHOTO: frame.file })); URL.revokeObjectURL(frame.url); setFrame(null); }}>{t("photo_use")}</button>
                    </div>
                  </div>
                ) : null}
                <ul className="mt-4 grid gap-3">
                  {papers.map((cat) => {
                    const files = [...(detail?.documents.filter((d) => d.category === cat) ?? [])].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
                    const newest = files[files.length - 1]?.id;
                    return (
                      <li key={cat} className="border-t border-white/10 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>{t(`cat_${cat}`)}</span>
                          <span className="text-sm text-mist">{files.length ? t("uploaded") : t("checklist_miss")}</span>
                        </div>
                        {cat === "PASSPORT" ? <p className="mt-1 text-sm text-mist">{t("pass_hint")}</p> : null}
                        <div className="mt-2 grid gap-2">
                          {files.map((doc) => (
                            <article key={doc.id} className={`p-3 text-sm ${doc.status === "REJECTED" ? "border-s-2 border-[#ff6a1a]" : "bg-white/5"}`}>
                              <p>{doc.fileName}</p>
                              {doc.id !== newest && doc.status === "REJECTED" ? <p className="text-mist">{t("pass_earlier")}</p> : null}
                              <p className="text-mist">
                                {doc.createdAt?.slice(0, 16)} · {doc.status === "REJECTED" ? t("admin_doc_no") : doc.status === "APPROVED" ? t("admin_doc_ok") : t("uploaded")}
                              </p>
                              {doc.rejectionReason ? <p className="mt-2 text-lg">{shownReason(doc.rejectionReason, t)}</p> : null}
                            </article>
                          ))}
                        </div>
                        <label className="btn relative mt-2 inline-flex w-fit cursor-pointer items-center overflow-hidden">
                          {t("upload")}
                          <input
                            className="absolute inset-0 z-10 cursor-pointer opacity-0"
                            type="file"
                            accept={cat === "PASSPORT" ? "image/*" : "image/*,application/pdf"}
                            capture={cat === "PASSPORT" ? "environment" : undefined}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = "";
                              if (!file) return;
                              void queueDoc(cat, file);
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
                {finals.length === 0 ? <p className="mt-3 text-mist">{t("finals_empty")}</p> : <p className="mt-3 text-sm">{t("finals_ready")}</p>}
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
                    <span className="text-metal">{m.authorRole === "CLIENT" ? t("msg_you") : t("msg_office")}</span>
                    {m.createdAt ? <span className="text-mist"> · {m.createdAt.slice(0, 16)}</span> : null}
                    <span> {m.body}</span>
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
              {app.status === "OPEN" ? (
                <button
                  type="button"
                  className="btn mt-4"
                  onClick={() =>
                    void openSpouseCase({ data: app.id })
                      .then((row) => navigate({ to: "/portal", search: { id: row.id } }))
                      .catch((e: unknown) => setErr(e instanceof Error ? e.message : "Error"))
                  }
                >
                  {t("spouse_add")}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="mt-8">{t("loading")}</p>
        )}
      </div>
      {app && app.status === "OPEN" ? (
        <div className="action-dock fixed inset-x-0 bottom-0 z-30 border-t border-white/15 bg-[#090909]/95 px-4 py-3 pr-20 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <p className="text-sm">{nextAction(app, livePay, Boolean(detail?.documents.some((d) => d.status === "REJECTED")), t)}</p>
          {app.stage === 2 && app.cancelDeadlineAt ? (
            <p className="text-xs text-mist">{Math.max(0, Math.ceil(hoursUntil(app.cancelDeadlineAt, now) || 0))} h</p>
          ) : null}
          {app.stage === 3 && app.invoice2DueAt ? (
            <p className="text-xs text-mist">{Math.max(0, Math.ceil(hoursUntil(app.invoice2DueAt, now) || 0))} h</p>
          ) : null}
        </div>
      ) : null}
    </Shell>
  );
}
