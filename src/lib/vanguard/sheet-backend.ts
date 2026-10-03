import { getDossierCategoryFolder, downloadFileFromDrive, resolveVaultFolder, safeDriveRedirect, uploadFileToDrive } from "@/lib/google/drive";
import { appendSheetRow, appendSheetRows, clearSheetBody, invalidateSheet, primeSheetRows, readSheetRows, updateSheetRowById, type SheetRow } from "@/lib/google/sheets";
import {
  DOC_CATEGORIES,
  PROCESS_STAGES,
  clientName,
  newId,
  normalizeUploadMime,
  parseQuestionnaire,
  priceFor,
  productionWeeks,
  questionnaireError,
  sameCountry,
  type DocCategory,
  type Processing,
  type ProcessStage,
  type Questionnaire,
  type Vacancy,
  type VisaProduct,
} from "./domain";
import { DEFAULT_SETTINGS, OFFICE, TEAM, VISA_PRODUCTS, buildVacancies, partnerRows } from "./seed";
import { HISTORY_COUNT, buildHistoryBoard, kyivDay } from "./history";
import { readSheetSessionUser } from "./account.server";
import { siteFileUrl } from "./files";
import { canCancel, citizenshipBlocked, dueWithinHours, isOverdue, kyivMonth, monthCommission, trancheSplit } from "./ops";
import crypto from "crypto";

const MAX_DATA = 2_600_000;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

type Extra = {
  clientEmail: string;
  citizenship: string;
  productionWeeks: number;
  profileComplete: boolean;
  dispatchNote: string;
  questionnaire: Questionnaire;
  stage2At: string | null;
  stage3At: string | null;
  stage4At: string | null;
  cancelDeadlineAt: string | null;
  paymentReminded: boolean;
  docReminded: boolean;
  referrerUserId: string;
  history: boolean;
};

type Profile = { userId: string; email: string; fullName: string; phone: string; role: string };

function nowIso() {
  return new Date().toISOString();
}

function plusDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function bool(value: string | boolean | undefined) {
  return value === true || value === "true" || value === "TRUE" || value === "1";
}

function rolesOf(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* plain string */
  }
  const list = raw.split(",").map((item) => item.trim()).filter(Boolean);
  return list.length ? list : ["CLIENT"];
}

function roleOf(roles: string[]) {
  if (roles.includes("ADMIN")) return "ADMIN";
  if (roles.includes("MANAGER")) return "MANAGER";
  if (roles.includes("SUBAGENT")) return "SUBAGENT";
  return "CLIENT";
}

async function settingsRows() {
  return readSheetRows("SystemSettings");
}

async function settingMap() {
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of await settingsRows()) if (row.key) out[row.key] = row.value;
  return out;
}

async function putSetting(key: string, value: string, actor: string) {
  invalidateSheet("SystemSettings");
  const rows = await settingsRows();
  const found = rows.find((row) => row.key === key);
  const stamp = nowIso();
  if (found) await updateSheetRowById("SystemSettings", found.id, { value, updatedAt: stamp, updatedBy: actor });
  else await appendSheetRow("SystemSettings", { id: newId("SET"), key, value, updatedAt: stamp, updatedBy: actor });
  dropPublicCache();
}

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const map = await settingMap();
  if (!map[key]) return fallback;
  try {
    return JSON.parse(map[key]) as T;
  } catch {
    return fallback;
  }
}

function vacancyFrom(row: SheetRow): Vacancy {
  return {
    id: row.id,
    title: row.title,
    country: row.country,
    visaProductId: row.visaProductId,
    employer: row.employerLabel,
    salaryNet: row.salaryNet,
    accommodation: row.accommodation,
    workingHours: row.workingHours,
    description: row.description,
    requirements: row.requirements,
    quota: Number(row.quotaRemaining) || 0,
    active: bool(row.isActive),
    blockedCitizenships: row.blockedCitizenships || "",
  };
}

function vacancyTo(v: Vacancy, previous?: SheetRow): SheetRow {
  const stamp = nowIso();
  return {
    id: v.id,
    title: v.title,
    category: previous?.category ?? "",
    country: v.country,
    salaryNet: v.salaryNet,
    salaryGross: previous?.salaryGross ?? "",
    accommodation: v.accommodation,
    workingHours: v.workingHours,
    description: v.description,
    quotaRemaining: String(v.quota),
    isActive: String(v.active),
    visaProductId: v.visaProductId,
    visaDuration: previous?.visaDuration ?? "",
    processingOptions: previous?.processingOptions ?? "[]",
    employerLabel: v.employer,
    requirements: v.requirements,
    createdAt: previous?.createdAt || stamp,
    updatedAt: stamp,
    blockedCitizenships: v.blockedCitizenships || previous?.blockedCitizenships || "",
  };
}

async function loadVacancies() {
  return (await readSheetRows("Vacancies")).map(vacancyFrom);
}

function productOf(raw: Partial<VisaProduct> | null | undefined): VisaProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const known = VISA_PRODUCTS.find((item) => item.id === raw.id);
  const id = String(raw.id || "").trim();
  const country = String(raw.country || known?.country || "").trim();
  if (!id || !country) return null;
  const flag = raw.active as boolean | string | undefined;
  const active =
    flag === undefined || flag === null
      ? (known?.active ?? true)
      : flag === true || flag === "true" || flag === "TRUE" || flag === "1";
  const lanes = (Array.isArray(raw.allowedProcessing) ? raw.allowedProcessing : known?.allowedProcessing ?? ["STANDARD"]).filter(
    (item): item is Processing => item === "STANDARD" || item === "PRIORITY" || item === "EXPRESS",
  );
  return {
    id,
    country,
    name: raw.name || known?.name || "Work permit",
    duration: raw.duration || known?.duration || "",
    description: raw.description || known?.description || "",
    basePrice: Number(raw.basePrice) || known?.basePrice || 0,
    currency: "EUR",
    productionMinWeeks: Number(raw.productionMinWeeks) || known?.productionMinWeeks || 1,
    productionMaxWeeks: Number(raw.productionMaxWeeks) || known?.productionMaxWeeks || 1,
    allowedProcessing: lanes.length ? lanes : ["STANDARD"],
    active,
  };
}

async function loadProducts(): Promise<VisaProduct[]> {
  const stored = await readJson<Partial<VisaProduct>[]>("visa_products", []);
  const parsed = Array.isArray(stored) ? stored.map((item) => productOf(item)).filter((item): item is VisaProduct => item !== null) : [];
  const base = parsed.length ? parsed : VISA_PRODUCTS;
  const pricing = await readSheetRows("Pricing");
  return base.map((product) => {
    const row = pricing.find((item) => item.id === product.id || item.name === product.id);
    if (!row || row.active === "false") return product;
    const amount = Number(row.amount);
    return Number.isFinite(amount) && amount > 0 ? { ...product, basePrice: Math.round(amount) } : product;
  });
}

async function saveProducts(products: VisaProduct[], actor: string) {
  await putSetting("visa_products", JSON.stringify(products), actor);
}

function emptyExtra(): Extra {
  return {
    clientEmail: "",
    citizenship: "",
    productionWeeks: 0,
    profileComplete: false,
    dispatchNote: "",
    questionnaire: parseQuestionnaire("{}"),
    stage2At: null,
    stage3At: null,
    stage4At: null,
    cancelDeadlineAt: null,
    paymentReminded: false,
    docReminded: false,
    referrerUserId: "",
    history: false,
  };
}

function isHistoryExtra(extra: Extra) {
  return extra.history === true;
}

function isHistorySheetRow(row: SheetRow) {
  if (row.id.startsWith("VG-H")) return true;
  try {
    return (JSON.parse(row.applicantData || "{}") as { history?: boolean }).history === true;
  } catch {
    return false;
  }
}

function isHistoryApp(app: { id: string; extra: Extra }) {
  return isHistoryExtra(app.extra) || app.id.startsWith("VG-H");
}

function extraOf(raw: string): Extra {
  const base = emptyExtra();
  try {
    const value = JSON.parse(raw || "{}") as Partial<Extra> & { questionnaire?: Questionnaire };
    if (!value || typeof value !== "object") return base;
    if (!("questionnaire" in value) && !("clientEmail" in value) && !("profileComplete" in value)) return base;
    return { ...base, ...value, questionnaire: { ...base.questionnaire, ...(value.questionnaire ?? {}) } };
  } catch {
    return base;
  }
}

function appFrom(row: SheetRow, vacancies: Vacancy[]) {
  const extra = extraOf(row.applicantData);
  const vacancy = vacancies.find((item) => item.id === row.vacancyId);
  return {
    id: row.id,
    userId: row.userId || null,
    clientEmail: extra.clientEmail,
    vacancyId: row.vacancyId,
    visaProductId: row.visaProductId,
    country: row.country,
    citizenship: extra.citizenship,
    processing: (row.processingOption || "STANDARD") as Processing,
    totalCost: Number(row.totalCost) || 0,
    currency: row.currency || "EUR",
    productionWeeks: extra.productionWeeks,
    stage: Number(row.stage) || 1,
    status: row.status || "OPEN",
    processStage: row.processStage || "IN_PROCESS",
    questionnaire: JSON.stringify(extra.questionnaire),
    profileComplete: Boolean(extra.profileComplete),
    rejectionReason: row.rejectedReason || "",
    dispatchNote: extra.dispatchNote,
    stage2At: extra.stage2At,
    stage3At: extra.stage3At,
    stage4At: extra.stage4At,
    cancelDeadlineAt: extra.cancelDeadlineAt || row.paymentDeadlineAt || null,
    docDeadlineAt: row.documentDeadlineAt || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    vacancyTitle: vacancy?.title ?? "",
    employer: vacancy?.employer ?? "",
    assignedManagerId: row.assignedManagerId || "",
    referrerUserId: extra.referrerUserId || "",
    extra,
    row,
  };
}

async function loadApps() {
  const [rows, vacancies] = await Promise.all([readSheetRows("Applications"), loadVacancies()]);
  return rows.map((row) => appFrom(row, vacancies));
}

async function saveApp(app: ReturnType<typeof appFrom>, extra: Extra, patch: Partial<SheetRow> = {}) {
  const row: SheetRow = {
    ...app.row,
    applicantData: JSON.stringify(extra),
    status: patch.status ?? app.status,
    stage: String(patch.stage ?? app.stage),
    processStage: patch.processStage ?? app.processStage,
    paymentDeadlineAt: patch.paymentDeadlineAt ?? extra.cancelDeadlineAt ?? "",
    documentDeadlineAt: patch.documentDeadlineAt ?? app.docDeadlineAt ?? "",
    rejectedReason: patch.rejectedReason ?? app.rejectionReason,
    updatedAt: nowIso(),
    approvedAt: patch.approvedAt ?? app.row.approvedAt ?? "",
  };
  await updateSheetRowById("Applications", app.id, row);
  dropPublicCache();
}

async function docsFor(applicationId: string) {
  const rows = await readSheetRows("DossierDocuments");
  return rows
    .filter((row) => row.dossierId === applicationId || (row.fileName || "").startsWith(`${applicationId} `))
    .map((row) => ({
      id: row.id,
      category: row.category,
      fileName: row.fileName,
      mime: row.mime || (String(row.reviewedBy || "").includes("/") ? row.reviewedBy : ""),
      status: row.status || "UPLOADED",
      createdAt: row.uploadedAt,
      rejectionReason: row.rejectionReason || "",
    }));
}

async function messagesFor(applicationId: string) {
  const rows = await readSheetRows("SupportTickets");
  return rows
    .filter((row) => row.subject === applicationId)
    .map((row) => ({
      id: row.id,
      authorRole: row.assignedManagerId || "CLIENT",
      body: row.message,
      createdAt: row.createdAt,
    }));
}

async function notify(text: string, audience: "owner" | "staff" = "owner") {
  try {
    const map = await settingMap();
    const owner = map.telegram_owner_chat || process.env.TELEGRAM_CHAT_ID || "";
    const staff = map.telegram_staff_chat || owner;
    const chatId = audience === "staff" ? staff : owner;
    if (!chatId || !process.env.TELEGRAM_BOT_TOKEN) return;
    const { sendSafeTelegramAlert } = await import("@/lib/google/telegram");
    const ok = await sendSafeTelegramAlert(text, { chatId });
    if (!ok) {
      await appendSheetRow("AuditLog", {
        id: newId("AUD"),
        actorUserId: "system",
        action: "TELEGRAM_FAILED",
        targetEntity: "record",
        targetEntityId: "telegram",
        details: text.slice(0, 300),
        timestamp: nowIso(),
      });
    }
  } catch (err) {
    console.error("[notice]", err);
  }
}

async function restoreQuota(vacancyId: string) {
  const raw = (await readSheetRows("Vacancies")).find((row) => row.id === vacancyId);
  if (!raw) return;
  const vacancy = vacancyFrom(raw);
  await updateSheetRowById("Vacancies", vacancyId, vacancyTo({ ...vacancy, quota: vacancy.quota + 1 }, raw));
}

async function writeDossier(userId: string, app: ReturnType<typeof appFrom>, fullName: string, citizenship: string) {
  const rows = await readSheetRows("Dossiers");
  const existing = rows.find((row) => row.userId === userId && row.vacancyId === app.vacancyId);
  const stamp = nowIso();
  const row = {
    id: existing?.id || newId("DOS"),
    userId,
    fullName,
    passportNumber: existing?.passportNumber || "",
    citizenship,
    targetCountry: app.country,
    vacancyId: app.vacancyId,
    vacancyTitle: app.vacancyTitle,
    processStatus: existing?.processStatus || "NEW",
    paymentStatus: existing?.paymentStatus || "NOT_DUE",
    currency: "EUR",
    totalCost: String(app.totalCost),
    paidAmount: existing?.paidAmount || "0",
    remainingAmount: String(Math.max(0, app.totalCost - Number(existing?.paidAmount || 0))),
    assignedManagerId: existing?.assignedManagerId || "",
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  };
  if (existing) await updateSheetRowById("Dossiers", existing.id, row);
  else await appendSheetRow("Dossiers", row);
}

async function markTrancheDue(applicationId: string, key: string) {
  const row = (await readSheetRows("PaymentTransactions")).find(
    (item) => item.dossierId === applicationId && item.trancheKey === key && item.status === "NOT_DUE",
  );
  if (row) await updateSheetRowById("PaymentTransactions", row.id, { ...row, status: "DUE" });
}

async function ensureTranches(applicationId: string, userId: string, total: number) {
  const rows = await readSheetRows("PaymentTransactions");
  if (rows.some((row) => row.dossierId === applicationId)) return;
  const stamp = nowIso();
  for (const part of trancheSplit(total)) {
    await appendSheetRow("PaymentTransactions", {
      id: newId("PAY"),
      dossierId: applicationId,
      userId,
      amount: String(part.amount),
      currency: "EUR",
      network: "",
      txHash: "",
      tranchePercent: String(part.percent),
      trancheKey: part.key,
      status: part.key === "T1" ? "DUE" : "NOT_DUE",
      submittedAt: stamp,
      verifiedAt: "",
      verifiedBy: "",
      proofFileId: "",
      proofFileName: "",
    });
  }
}

async function audit(actor: string, action: string, target: string, details: string) {
  await appendSheetRow("AuditLog", {
    id: newId("AUD"),
    actorUserId: actor,
    action,
    targetEntity: "record",
    targetEntityId: target,
    details: details.slice(0, 500),
    timestamp: nowIso(),
  });
}

async function ensureSeed() {
  void import("@/lib/google/telegram").then((mod) => mod.ensureTelegramMenu()).catch(() => undefined);
  try {
    const { prepareGoogle } = await import("@/lib/google/prepare");
    await prepareGoogle();
  } catch (err) {
    console.error("[google] prepare", err);
    if (err instanceof Error && err.message.includes("busy")) throw err;
  }
  try {
    await primeSheetRows(["SystemSettings", "Applications", "Vacancies", "Team", "Gallery", "DossierDocuments", "Pricing", "Users"]);
  } catch (err) {
    console.error("[sheets] prime", err);
    if (err instanceof Error && err.message.includes("busy")) throw err;
  }
  const map = await settingMap();
  if (map.seed_version === "2") {
    await safeHistory();
    await ensureVacancyCatalog();
    return;
  }
  const apps = await readSheetRows("Applications");
  if (apps.some((row) => !isHistorySheetRow(row))) {
    await putSetting("seed_version", "2", "system");
    await safeHistory();
    await ensureVacancyCatalog();
    return;
  }
  const vacancies = await readSheetRows("Vacancies");
  if (vacancies.length === 0) await appendSheetRows("Vacancies", buildVacancies().map((vacancy) => vacancyTo(vacancy)));
  if (!map.visa_products) await putSetting("visa_products", JSON.stringify(VISA_PRODUCTS), "system");
  if (!map.partners) await putSetting("partners", JSON.stringify(partnerRows()), "system");
  const team = await readSheetRows("Team");
  if (team.length === 0) {
    for (const member of TEAM) {
      await appendSheetRow("Team", {
        id: member.id,
        fullName: member.name,
        position: member.position,
        photoUrl: "",
        contactPhone: member.phone,
        languages: "[]",
        bio: "",
        order: String(member.sort),
        isActive: "true",
      });
    }
  }
  const gallery = await readSheetRows("Gallery");
  if (gallery.length === 0) {
    for (const item of OFFICE) {
      await appendSheetRow("Gallery", {
        id: item.id,
        title: item.title,
        imageUrl: item.image,
        caption: `${item.kind}|${item.caption}`,
        order: String(item.sort),
        isActive: "true",
      });
    }
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (map[key] === undefined) await putSetting(key, value, "system");
  }
  await putSetting("seed_version", "2", "system");
  await safeHistory();
  await ensureVacancyCatalog();
  await housekeeping();
}

let historyTask: Promise<void> | null = null;

async function safeHistory() {
  try {
    await ensureHistoryBoard();
  } catch (err) {
    console.error("[history]", err);
  }
}

const VACANCY_CATALOG = "1";

async function ensureVacancyCatalog() {
  try {
    let map = await settingMap();
    if (map.vacancy_catalog === VACANCY_CATALOG) return;
    invalidateSheet("SystemSettings");
    map = await settingMap();
    if (map.vacancy_catalog === VACANCY_CATALOG) return;
    const started = Date.parse(map.vacancy_catalog_at || "");
    const cooling = map.vacancy_catalog === "writing" || map.vacancy_catalog === "pending";
    if (cooling && Number.isFinite(started) && Date.now() - started < 180_000) return;
    await putSetting("vacancy_catalog", "writing", "system");
    await putSetting("vacancy_catalog_at", nowIso(), "system");
    invalidateSheet("Vacancies");
    const existing = await readSheetRows("Vacancies");
    const taken = new Set(existing.map((row) => `${row.country}|${(row.employerLabel || "").trim().toLowerCase()}`));
    const ids = new Set(existing.map((row) => row.id));
    const open = new Map<string, number>();
    for (const row of existing) {
      if (row.isActive === "false") continue;
      open.set(row.country, (open.get(row.country) || 0) + 1);
    }
    const missing: SheetRow[] = [];
    let extra = 1;
    for (const vacancy of buildVacancies()) {
      const key = `${vacancy.country}|${vacancy.employer.trim().toLowerCase()}`;
      if (taken.has(key)) continue;
      const count = open.get(vacancy.country) || 0;
      if (count >= 20) continue;
      let id = vacancy.id;
      while (ids.has(id)) {
        extra += 1;
        id = `VAC-X${String(extra).padStart(4, "0")}`;
      }
      ids.add(id);
      taken.add(key);
      open.set(vacancy.country, count + 1);
      missing.push(vacancyTo({ ...vacancy, id }));
    }
    if (missing.length) await appendSheetRows("Vacancies", missing);
    await putSetting("vacancy_catalog", VACANCY_CATALOG, "system");
  } catch (err) {
    await putSetting("vacancy_catalog", "pending", "system").catch(() => undefined);
    await putSetting("vacancy_catalog_at", nowIso(), "system").catch(() => undefined);
    console.error("[vacancies]", err);
  }
}

async function ensureHistoryBoard() {
  if (historyTask) return historyTask;
  historyTask = writeHistoryBoard().finally(() => {
    historyTask = null;
  });
  return historyTask;
}

async function writeHistoryBoard() {
  let map = await settingMap();
  if (map.history_board === String(HISTORY_COUNT)) return;
  invalidateSheet("SystemSettings");
  map = await settingMap();
  if (map.history_board === String(HISTORY_COUNT)) return;
  const started = Date.parse(map.history_board_at || "");
  const cooling = map.history_board === "writing" || map.history_board === "pending";
  if (cooling && Number.isFinite(started) && Date.now() - started < 180_000) return;
  const end = map.history_board_end || kyivDay();
  if (!map.history_board_end) await putSetting("history_board_end", end, "system");
  await putSetting("history_board", "writing", "system");
  await putSetting("history_board_at", nowIso(), "system");
  try {
    invalidateSheet("Applications");
    const existing = await readSheetRows("Applications");
    const have = new Set(existing.map((row) => row.id));
    const missing = buildHistoryBoard(end).filter((row) => !have.has(row.id));
    if (missing.length) await appendSheetRows("Applications", missing);
    await putSetting("history_board", String(HISTORY_COUNT), "system");
  } catch (err) {
    await putSetting("history_board", "pending", "system").catch(() => undefined);
    await putSetting("history_board_at", nowIso(), "system").catch(() => undefined);
    throw err;
  }
}

let housekeepingAt = 0;

async function housekeeping() {
  const now = Date.now();
  if (now - housekeepingAt < 10 * 60 * 1000) return;
  housekeepingAt = now;
  try {
    const map = await settingMap();
    if (now - Date.parse(map.last_backup_at || "0") > 20 * 3600 * 1000) await writeBackup();
    if (now - Date.parse(map.last_digest_at || "0") > 20 * 3600 * 1000) await writeDigest();
    await remindDeadlines();
  } catch (err) {
    housekeepingAt = 0;
    console.error("[housekeeping]", err);
  }
}

async function writeBackup() {
  const names = ["Users", "Applications", "Vacancies", "DossierDocuments", "PaymentTransactions", "AuditLog"] as const;
  const lines = [`snapshot ${nowIso()}`];
  for (const name of names) {
    const rows = await readSheetRows(name);
    lines.push(`${name}: ${rows.length}`);
  }
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID?.trim();
  let driveFileId = "";
  if (root) {
    const folder = await resolveVaultFolder(root, "Backups");
    const fileName = `snapshot-${nowIso().slice(0, 10)}.txt`;
    const uploaded = await uploadFileToDrive(folder, fileName, "text/plain", Buffer.from(lines.join("\n"), "utf8"));
    driveFileId = uploaded.fileId;
    await appendSheetRow("Backups", { id: newId("BAK"), createdBy: "system", driveFileId, fileName, createdAt: nowIso() });
  }
  await putSetting("last_backup_at", nowIso(), "system");
}

async function writeDigest() {
  const apps = (await loadApps()).filter((app) => !isHistoryApp(app));
  const open = apps.filter((app) => app.status === "OPEN");
  const late = open.filter((app) => isOverdue(app.cancelDeadlineAt) || isOverdue(app.docDeadlineAt));
  await notify(`Open files: ${open.length}\nOverdue: ${late.length}`);
  await putSetting("last_digest_at", nowIso(), "system");
}

async function remindDeadlines() {
  const apps = (await loadApps()).filter((app) => !isHistoryApp(app));
  for (const app of apps) {
    if (app.status !== "OPEN") continue;
    let extra = app.extra;
    if (!extra.paymentReminded && dueWithinHours(app.cancelDeadlineAt, 72)) {
      const phone = app.extra.questionnaire.phone?.replace(/\D/g, "") || "";
      const wa = phone ? `\nWhatsApp: https://wa.me/${phone}` : "";
      await notify(`Payment due within 3 days\n${app.id}${wa}`);
      extra = { ...extra, paymentReminded: true };
      await saveApp(app, extra);
    }
    if (!extra.docReminded && dueWithinHours(app.docDeadlineAt, 72)) {
      const phone = extra.questionnaire.phone?.replace(/\D/g, "") || "";
      const wa = phone ? `\nWhatsApp: https://wa.me/${phone}` : "";
      await notify(`Documents due within 3 days\n${app.id}${wa}`, "staff");
      extra = { ...extra, docReminded: true };
      await saveApp(app, extra);
    }
  }
}

let expireAt = 0;

async function expireUnpaid() {
  const now = Date.now();
  if (now - expireAt < 60_000) return;
  expireAt = now;
  try {
    const apps = (await loadApps()).filter((app) => !isHistoryApp(app));
    const docs = await readSheetRows("DossierDocuments");
    for (const app of apps) {
      if (app.status !== "OPEN" || app.stage !== 2 || !app.cancelDeadlineAt) continue;
      if (Date.parse(app.cancelDeadlineAt) > Date.now()) continue;
      if (docs.some((doc) => doc.dossierId === app.id && doc.category === "PAYMENT_PROOF")) continue;
      await saveApp(app, app.extra, { status: "CANCELLED" });
      await restoreQuota(app.vacancyId);
    }
  } catch (err) {
    console.error("[expire]", err);
  }
}

async function profile(userId: string): Promise<Profile> {
  await ensureSeed();
  await housekeeping();
  await expireUnpaid();
  const session = await readSheetSessionUser();
  const rows = await readSheetRows("Users");
  const row = rows.find((item) => item.id === userId);
  if (!row && session?.id === userId) {
    return { userId, email: session.email, fullName: session.fullName, phone: session.phone, role: session.role };
  }
  if (!row) throw new Error("Profile missing");
  const roles = rolesOf(row.roles);
  return { userId: row.id, email: row.email, fullName: row.fullName, phone: row.phone, role: roleOf(roles) };
}

async function requireStaff(userId: string) {
  const person = await profile(userId);
  if (person.role !== "ADMIN" && person.role !== "MANAGER") throw new Error("Forbidden");
  return person;
}

async function requireAdmin(userId: string) {
  const person = await profile(userId);
  if (person.role !== "ADMIN") throw new Error("Forbidden");
  return person;
}

function present(app: ReturnType<typeof appFrom>) {
  const { extra: _extra, row: _row, ...rest } = app;
  return rest;
}

async function ensurePartnerCatalog() {
  const map = await settingMap();
  if (map.partners_catalog === "3") return;
  const stored = await readJson<{ id: string; country: string; name: string; sort: number }[]>("partners", []);
  const have = new Set(stored.map((row) => `${row.country}|${row.name}`.toLowerCase()));
  const missing = partnerRows().filter((row) => !have.has(`${row.country}|${row.name}`.toLowerCase()));
  if (missing.length) await putSetting("partners", JSON.stringify([...stored, ...missing]), "system");
  await putSetting("partners_catalog", "3", "system");
}

const MEDIA_KINDS = new Set(["office", "license", "country", "vacancy", "logo", "banner"]);

function mediaKind(row: SheetRow): string {
  const kind = (row.kind || "").trim();
  if (MEDIA_KINDS.has(kind)) return kind;
  return (row.caption || "").split("|")[0] === "license" ? "license" : "office";
}

function mediaCaption(row: SheetRow): string {
  if ((row.kind || "").trim()) return row.caption || "";
  return (row.caption || "").split("|").slice(1).join("|");
}

function mediaFrom(row: SheetRow) {
  return {
    id: row.id,
    kind: mediaKind(row),
    title: row.title || "",
    caption: mediaCaption(row),
    imageData: siteFileUrl("gallery", row.id, row.imageUrl),
    sortOrder: Number(row.order) || 0,
    active: row.isActive === "" || bool(row.isActive),
    country: row.country || "",
    vacancyId: row.vacancyId || "",
    startsAt: row.startsAt || "",
    endsAt: row.endsAt || "",
    cover: bool(row.cover),
  };
}

let publicCache: { at: number; value: Awaited<ReturnType<typeof buildPublicSite>> } | null = null;
let publicFlight: Promise<Awaited<ReturnType<typeof buildPublicSite>>> | null = null;

function dropPublicCache() {
  publicCache = null;
}

export async function publicSite() {
  if (publicCache && Date.now() - publicCache.at < 30_000) return publicCache.value;
  if (!publicFlight) {
    publicFlight = buildPublicSite()
      .then((value) => {
        publicCache = { at: Date.now(), value };
        return value;
      })
      .catch((err) => {
        if (publicCache) return publicCache.value;
        throw err;
      })
      .finally(() => {
        publicFlight = null;
      });
  }
  return publicFlight;
}

async function buildPublicSite() {
  await ensureSeed();
  await ensurePartnerCatalog();
  await housekeeping();
  await expireUnpaid();
  const settings = await settingMap();
  const products = (await loadProducts()).filter((item) => item.active);
  const vacancies = (await loadVacancies()).filter((item) => item.active);
  const team = (await readSheetRows("Team"))
    .filter((row) => bool(row.isActive) || row.isActive === "")
    .map((row) => ({
      id: row.id,
      fullName: row.fullName,
      position: row.position,
      phone: row.contactPhone,
      photoData: siteFileUrl("team", row.id, row.photoUrl),
      sortOrder: Number(row.order) || 0,
      active: true,
    }));
  const media = (await readSheetRows("Gallery")).filter((row) => row.isActive === "" || bool(row.isActive)).map(mediaFrom);
  const partners = (await readJson<{ id: string; country: string; name: string; sort: number }[]>("partners", [])).map((item) => ({
    id: item.id,
    country: item.country,
    name: item.name,
    sortOrder: item.sort,
  }));
  const filings = await readSheetRows("Applications");
  const counts = { filed: filings.length, issued: filings.filter((row) => row.status === "ISSUED").length };
  return { settings, products, vacancies, team, media, partners, counts };
}

export async function listPublicFilings() {
  await ensureSeed();
  const apps = await loadApps();
  return apps
    .map((app) => ({
      id: app.id,
      citizenship: app.citizenship || "",
      country: app.country || "",
      createdAt: app.createdAt || "",
      status: app.status || "OPEN",
      stage: app.stage || 1,
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function takeInvoiceNumber(userId: string) {
  await profile(userId);
  const map = await settingMap();
  const next = (Number(map.invoice_seq) || 1000) + 1;
  await putSetting("invoice_seq", String(next), userId);
  return { number: `INV-${next}` };
}

export async function joinWaitlist(userId: string, data: { vacancyId: string; citizenship: string }) {
  await profile(userId);
  await audit(userId, "WAITLIST", data.vacancyId, data.citizenship);
  return { ok: true };
}

export async function sessionProfile(userId: string) {
  return profile(userId);
}

export async function listMine(userId: string) {
  await profile(userId);
  return (await loadApps())
    .filter((app) => app.userId === userId)
    .map(present)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getMine(userId: string, id: string) {
  await profile(userId);
  const app = (await loadApps()).find((item) => item.id === id);
  if (!app || app.userId !== userId) throw new Error("Not found");
  return { app: present(app), documents: await docsFor(id), messages: await messagesFor(id) };
}

async function resolveReferrer(code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const row = (await readSheetRows("Users")).find((item) => item.id === trimmed || item.email.toLowerCase() === trimmed.toLowerCase());
  if (!row || roleOf(rolesOf(row.roles)) !== "SUBAGENT") return "";
  return row.id;
}

export async function createApp(userId: string, data: { vacancyId: string; citizenship: string; processing: Processing; agentCode?: string; referrerUserId?: string }) {
  const person = await profile(userId);
  if (data.processing !== "STANDARD" && data.processing !== "PRIORITY" && data.processing !== "EXPRESS") throw new Error("Pace");
  const vacancies = await loadVacancies();
  const products = await loadProducts();
  const vacancy = vacancies.find((item) => item.id === data.vacancyId && item.active);
  if (!vacancy || vacancy.quota < 1) throw new Error("Opening unavailable");
  const product = products.find((item) => item.id === vacancy.visaProductId && item.active);
  if (!product) throw new Error("Permit unavailable");
  if (!product.allowedProcessing.includes(data.processing)) throw new Error("Pace");
  if (!data.citizenship || sameCountry(data.citizenship, product.country)) throw new Error("Citizenship");
  if (citizenshipBlocked(vacancy.blockedCitizenships, data.citizenship)) throw new Error("Citizenship");
  const existing = (await loadApps()).find((app) => app.userId === userId && app.vacancyId === vacancy.id && app.status === "OPEN");
  if (existing) {
    if (!existing.referrerUserId && (data.agentCode || data.referrerUserId)) {
      const referrerUserId = await resolveReferrer(data.referrerUserId || data.agentCode || "");
      if (referrerUserId) await saveApp(existing, { ...existing.extra, referrerUserId });
    }
    return { id: existing.id };
  }
  const referrerUserId = await resolveReferrer(data.referrerUserId || data.agentCode || "");
  const id = newId("VG");
  const stamp = nowIso();
  const extra: Extra = { ...emptyExtra(), clientEmail: person.email, citizenship: data.citizenship, productionWeeks: productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, data.processing), questionnaire: { ...parseQuestionnaire("{}"), citizenship: data.citizenship }, referrerUserId };
  await appendSheetRow("Applications", {
    id,
    userId,
    vacancyId: vacancy.id,
    applicantData: JSON.stringify(extra),
    status: "OPEN",
    stage: "1",
    visaProductId: product.id,
    country: product.country,
    processingOption: data.processing,
    totalCost: String(priceFor(product.basePrice, data.processing)),
    currency: "EUR",
    processStage: "IN_PROCESS",
    paymentDeadlineAt: "",
    documentDeadlineAt: "",
    assignedManagerId: "",
    createdAt: stamp,
    updatedAt: stamp,
    approvedAt: "",
    rejectedReason: "",
  });
  const raw = (await readSheetRows("Vacancies")).find((row) => row.id === vacancy.id);
  if (raw) await updateSheetRowById("Vacancies", vacancy.id, vacancyTo({ ...vacancy, quota: Math.max(0, vacancy.quota - 1) }, raw));
  await audit(userId, "APPLICATION_OPENED", id, vacancy.title);
  await notify(`New application\n${id}\n${product.country}`);
  return { id };
}

export async function saveQuestionnaire(userId: string, data: { id: string; questionnaire: Questionnaire }) {
  await profile(userId);
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || app.userId !== userId) throw new Error("Not found");
  if (app.stage !== 1 || app.status !== "OPEN") throw new Error("Locked");
  const questionnaire = { ...parseQuestionnaire("{}"), ...data.questionnaire };
  const error = questionnaireError(questionnaire);
  if (error) return { ok: false as const, error };
  await saveApp(app, { ...app.extra, questionnaire, profileComplete: true, citizenship: questionnaire.citizenship });
  await writeDossier(userId, app, clientName(questionnaire), questionnaire.citizenship);
  await audit(userId, "QUESTIONNAIRE", app.id, clientName(questionnaire));
  return { ok: true as const };
}

async function storeFile(applicationId: string, userId: string, category: string, fileName: string, mime: string, data: string, status: string) {
  const safeMime = normalizeUploadMime(mime, fileName);
  if (!ALLOWED_MIME.has(safeMime)) throw new Error("File type");
  if (!data.startsWith("data:")) throw new Error("File type");
  if (data.length > MAX_DATA) throw new Error("File size");
  const encoded = data.split(",")[1] ?? "";
  const buffer = Buffer.from(encoded, "base64");
  const folder = await getDossierCategoryFolder(applicationId, category);
  let uploaded: { fileId: string };
  try {
    uploaded = await uploadFileToDrive(folder, `${applicationId} ${category} ${fileName || "file"}`.slice(0, 180), safeMime, buffer);
  } catch (err) {
    console.error("[file]", err);
    const message = err instanceof Error ? err.message : "";
    const code = message.match(/\((\d{3})/)?.[1];
    throw new Error(message.includes("quota") || message.includes("reconnect") ? "Drive quota" : code ? `Drive ${code}` : `Drive ${message.slice(0, 160) || "refused"}`);
  }
  const id = newId("DOC");
  try {
    await appendSheetRow("DossierDocuments", {
      id,
      dossierId: applicationId,
      category,
      fileName: fileName || "file",
      driveFileId: uploaded.fileId,
      status,
      uploadedAt: nowIso(),
      reviewedAt: "",
      reviewedBy: "",
      rejectionReason: "",
      mime: safeMime,
    });
    await audit(userId, "UPLOAD", applicationId, category);
    await notify(`New file\n${applicationId}\n${category}`, "staff");
  } catch (err) {
    console.error("[file] record", err);
  }
  return { id, driveFileId: uploaded.fileId };
}

export async function uploadDoc(userId: string, data: { applicationId: string; category: DocCategory; fileName: string; mime: string; data: string }) {
  await profile(userId);
  const app = (await loadApps()).find((item) => item.id === data.applicationId);
  if (!app || app.userId !== userId) throw new Error("Not found");
  if (app.status !== "OPEN" || app.stage < 2) throw new Error("Locked");
  if (!DOC_CATEGORIES.includes(data.category) || data.category === "FINAL") throw new Error("Category");
  if (data.category === "PAYMENT_PROOF" && app.stage !== 2) throw new Error("Locked");
  return storeFile(app.id, userId, data.category, data.fileName, data.mime, data.data, "UPLOADED");
}

export async function postMessage(userId: string, data: { applicationId: string; body: string }) {
  const person = await profile(userId);
  if (!data.body) return;
  const app = (await loadApps()).find((item) => item.id === data.applicationId);
  if (!app) throw new Error("Not found");
  const staff = person.role === "ADMIN" || person.role === "MANAGER";
  if (!staff && app.userId !== userId) throw new Error("Forbidden");
  const stamp = nowIso();
  await appendSheetRow("SupportTickets", {
    id: newId("MSG"),
    userId,
    dossierId: app.id,
    subject: app.id,
    message: data.body,
    status: "OPEN",
    assignedManagerId: person.role,
    createdAt: stamp,
    updatedAt: stamp,
  });
  await notify(`New message\n${app.id}`, "staff");
}

export async function downloadDoc(userId: string, id: string) {
  const person = await profile(userId);
  const docs = await readSheetRows("DossierDocuments");
  const doc = docs.find((item) => item.id === id);
  if (!doc) throw new Error("Not found");
  const app = (await loadApps()).find((item) => item.id === doc.dossierId);
  if (!app) throw new Error("Not found");
  const staff = person.role === "ADMIN" || person.role === "MANAGER";
  if (!staff && app.userId !== userId) throw new Error("Forbidden");
  if (!doc.driveFileId) throw new Error("File could not be opened.");
  try {
    const file = await downloadFileFromDrive(doc.driveFileId);
    return {
      applicationId: app.id,
      fileName: doc.fileName || file.name,
      mime: file.mimeType,
      data: `data:${file.mimeType};base64,${file.buffer.toString("base64")}`,
      category: doc.category,
    };
  } catch (err) {
    console.error("[file]", err);
    throw new Error("File could not be opened.");
  }
}

export async function adminOverview(userId: string) {
  const person = await requireStaff(userId);
  const apps = (await loadApps()).filter((app) => !isHistoryApp(app));
  const docs = await readSheetRows("DossierDocuments");
  const users = (await readSheetRows("Users")).map((row) => ({
    userId: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    role: roleOf(rolesOf(row.roles)),
  }));
  return {
    role: person.role,
    userId: person.userId,
    waiting: apps.filter((app) => app.status === "OPEN" && app.stage === 1 && app.profileComplete).length,
    proofs: apps.filter((app) => app.status === "OPEN" && app.stage === 2 && docs.some((doc) => doc.dossierId === app.id && doc.category === "PAYMENT_PROOF" && doc.status === "UPLOADED")).length,
    live: apps.filter((app) => app.status === "OPEN").length,
    users,
  };
}

export async function adminList(userId: string, includeIncomplete: boolean) {
  await requireStaff(userId);
  return (await loadApps())
    .filter((app) => !isHistoryApp(app))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(present)
    .filter((app) => includeIncomplete || app.profileComplete || app.stage > 1);
}

export async function adminGet(userId: string, id: string) {
  await requireStaff(userId);
  invalidateSheet("DossierDocuments");
  const app = (await loadApps()).find((item) => item.id === id);
  if (!app || isHistoryApp(app)) throw new Error("Not found");
  return { app: present(app), documents: await docsFor(id), messages: await messagesFor(id) };
}

export async function adminSetStage(userId: string, data: { id: string; action: string; reason: string }) {
  const person = await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || isHistoryApp(app)) throw new Error("Not found");
  let stage = app.stage;
  if (data.action === "accept") {
    if (app.stage !== 1 || app.status !== "OPEN" || !app.profileComplete) throw new Error("Not ready");
    await saveApp(app, { ...app.extra, stage2At: nowIso(), cancelDeadlineAt: plusDays(5) }, { stage: "2", paymentDeadlineAt: plusDays(5) });
    await ensureTranches(app.id, app.userId || person.userId, app.totalCost);
    stage = 2;
  } else if (data.action === "reject") {
    if (app.status === "OPEN") await restoreQuota(app.vacancyId);
    await saveApp(app, app.extra, { status: "REJECTED", rejectedReason: data.reason });
  } else if (data.action === "cancel") {
    if (app.status === "OPEN") await restoreQuota(app.vacancyId);
    await saveApp(app, app.extra, { status: "CANCELLED" });
  } else if (data.action === "confirm-payment") {
    if (app.stage !== 2 || app.status !== "OPEN") throw new Error("Not ready");
    const weeks = Number(app.productionWeeks);
    const deadline = plusDays((Number.isFinite(weeks) && weeks > 0 ? weeks : 8) * 7);
    await saveApp(app, { ...app.extra, stage3At: nowIso() }, { stage: "3", processStage: "IN_PROCESS", documentDeadlineAt: deadline });
    stage = 3;
    try {
      const rawDocs = await readSheetRows("DossierDocuments");
      for (const doc of rawDocs) {
        if (doc.dossierId === app.id && doc.category === "PAYMENT_PROOF" && doc.status !== "APPROVED") {
          await updateSheetRowById("DossierDocuments", doc.id, { ...doc, status: "APPROVED", reviewedAt: nowIso(), reviewedBy: person.userId });
        }
      }
      const due = (await readSheetRows("PaymentTransactions")).find((row) => row.dossierId === app.id && row.status === "DUE");
      const proof = rawDocs.find((doc) => doc.dossierId === app.id && doc.category === "PAYMENT_PROOF");
      if (due) {
        await updateSheetRowById("PaymentTransactions", due.id, {
          ...due,
          status: "VERIFIED",
          verifiedAt: nowIso(),
          verifiedBy: person.userId,
          proofFileId: proof?.driveFileId || "",
          proofFileName: proof?.fileName || "",
        });
      }
    } catch (err) {
      console.error("[stage3]", err);
    }
  } else if (data.action === "stage4") {
    if (app.stage !== 3 || app.status !== "OPEN") throw new Error("Not ready");
    await saveApp(app, { ...app.extra, stage4At: nowIso() }, { stage: "4" });
    stage = 4;
    try {
      await markTrancheDue(app.id, "T3");
    } catch (err) {
      console.error("[stage4]", err);
    }
  } else throw new Error("Action");
  await audit(person.userId, data.action, app.id, data.reason);
  return { ok: true as const, stage };
}

export async function adminSetProcess(userId: string, data: { id: string; processStage: string }) {
  await requireStaff(userId);
  if (!PROCESS_STAGES.includes(data.processStage as ProcessStage)) throw new Error("Stage");
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || isHistoryApp(app) || app.stage < 3 || app.status !== "OPEN") throw new Error("Locked");
  await saveApp(app, app.extra, { processStage: data.processStage });
  if (data.processStage === "EMPLOYER_APPROVED_FOR_MINISTRY" || PROCESS_STAGES.indexOf(data.processStage as ProcessStage) >= PROCESS_STAGES.indexOf("EMPLOYER_APPROVED_FOR_MINISTRY")) {
    await markTrancheDue(app.id, "T2");
  }
  await audit(userId, "PROCESS", app.id, data.processStage);
}

export async function adminSaveDispatch(userId: string, data: { id: string; note: string }) {
  await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || isHistoryApp(app)) throw new Error("Not found");
  await saveApp(app, { ...app.extra, dispatchNote: data.note });
  await audit(userId, "DISPATCH", data.id, "");
}

export async function adminUploadProof(userId: string, data: { applicationId: string; fileName: string; mime: string; data: string }) {
  await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === data.applicationId);
  if (!app || isHistoryApp(app) || app.status !== "OPEN" || app.stage !== 2) throw new Error("Locked");
  return storeFile(app.id, userId, "PAYMENT_PROOF", data.fileName, data.mime, data.data, "UPLOADED");
}

export async function adminUploadFinal(userId: string, data: { applicationId: string; fileName: string; mime: string; data: string }) {
  await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === data.applicationId);
  if (!app || isHistoryApp(app) || app.processStage !== "FINAL_LEGAL_SERVICE" || app.stage < 3) throw new Error("Locked");
  return storeFile(app.id, userId, "FINAL", data.fileName, data.mime, data.data, "APPROVED");
}

export async function adminCreateApplication(userId: string, data: { email: string; vacancyId: string; citizenship: string; processing: Processing }) {
  await requireStaff(userId);
  if (!data.email.includes("@")) throw new Error("Email");
  if (data.processing !== "STANDARD" && data.processing !== "PRIORITY" && data.processing !== "EXPRESS") throw new Error("Pace");
  const vacancies = await loadVacancies();
  const products = await loadProducts();
  const vacancy = vacancies.find((item) => item.id === data.vacancyId);
  const product = products.find((item) => item.id === vacancy?.visaProductId);
  if (!vacancy || !product) throw new Error("Opening");
  if (vacancy.quota < 1) throw new Error("Opening unavailable");
  if (!product.allowedProcessing.includes(data.processing)) throw new Error("Pace");
  const user = (await readSheetRows("Users")).find((row) => row.email.toLowerCase() === data.email);
  if (user?.id) {
    const existing = (await loadApps()).find((app) => app.userId === user.id && app.vacancyId === vacancy.id && app.status === "OPEN");
    if (existing) return { id: existing.id };
  }
  const id = newId("VG");
  const stamp = nowIso();
  const extra: Extra = { ...emptyExtra(), clientEmail: data.email, citizenship: data.citizenship, productionWeeks: productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, data.processing), questionnaire: { ...parseQuestionnaire("{}"), citizenship: data.citizenship } };
  await appendSheetRow("Applications", {
    id,
    userId: user?.id ?? "",
    vacancyId: vacancy.id,
    applicantData: JSON.stringify(extra),
    status: "OPEN",
    stage: "1",
    visaProductId: product.id,
    country: product.country,
    processingOption: data.processing,
    totalCost: String(priceFor(product.basePrice, data.processing)),
    currency: "EUR",
    processStage: "IN_PROCESS",
    paymentDeadlineAt: "",
    documentDeadlineAt: "",
    assignedManagerId: "",
    createdAt: stamp,
    updatedAt: stamp,
    approvedAt: "",
    rejectedReason: "",
  });
  const raw = (await readSheetRows("Vacancies")).find((row) => row.id === vacancy.id);
  if (raw) await updateSheetRowById("Vacancies", vacancy.id, vacancyTo({ ...vacancy, quota: Math.max(0, vacancy.quota - 1) }, raw));
  await audit(userId, "APPLICATION_CREATED", id, data.email);
  return { id };
}

export async function adminSaveVacancy(userId: string, data: Vacancy) {
  await requireStaff(userId);
  const id = data.id || newId("VAC");
  const vacancy: Vacancy = { ...data, id, quota: Math.max(0, Number(data.quota) || 0), active: Boolean(data.active) };
  if (!vacancy.title) throw new Error("Title");
  const raw = (await readSheetRows("Vacancies")).find((row) => row.id === id);
  if (raw) await updateSheetRowById("Vacancies", id, vacancyTo(vacancy, raw));
  else await appendSheetRow("Vacancies", vacancyTo(vacancy));
  await audit(userId, "VACANCY", id, vacancy.title);
  dropPublicCache();
  return { id };
}

export async function adminDeleteVacancy(userId: string, id: string) {
  await requireStaff(userId);
  const raw = (await readSheetRows("Vacancies")).find((row) => row.id === id);
  if (raw) await updateSheetRowById("Vacancies", id, { ...raw, isActive: "false", updatedAt: nowIso() });
  await audit(userId, "VACANCY_ARCHIVE", id, "");
  dropPublicCache();
}

export async function adminSaveTeam(userId: string, data: { id?: string; fullName: string; position: string; phone: string; photoData: string; active: boolean }) {
  await requireAdmin(userId);
  const id = data.id || newId("TM");
  if (!data.fullName) throw new Error("Name");
  const raw = (await readSheetRows("Team")).find((row) => row.id === id);
  let photoUrl = raw?.photoUrl || "";
  if (data.photoData) {
    if (!data.photoData.startsWith("data:")) throw new Error("File type");
    if (data.photoData.length > MAX_DATA) throw new Error("File size");
    const mime = data.photoData.slice(5, data.photoData.indexOf(";")) || "image/jpeg";
    const saved = await storeFile("team", userId, "PHOTO", `${id}.jpg`, mime, data.photoData, "APPROVED");
    photoUrl = `file:${saved.driveFileId}`;
  }
  const row = {
    id,
    fullName: data.fullName,
    position: data.position,
    photoUrl: photoUrl || raw?.photoUrl || "",
    contactPhone: data.phone,
    languages: raw?.languages || "[]",
    bio: raw?.bio || "",
    order: raw?.order || "9",
    isActive: String(data.active !== false),
  };
  if (raw) await updateSheetRowById("Team", id, row);
  else await appendSheetRow("Team", row);
  await audit(userId, "TEAM", id, data.fullName);
  dropPublicCache();
  return { id };
}

export async function adminDeleteTeam(userId: string, id: string) {
  await requireAdmin(userId);
  const raw = (await readSheetRows("Team")).find((row) => row.id === id);
  if (raw) await updateSheetRowById("Team", id, { ...raw, isActive: "false" });
  await audit(userId, "TEAM_DELETE", id, "");
  dropPublicCache();
}

export async function adminSaveSettings(userId: string, data: Record<string, string>) {
  await requireAdmin(userId);
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!allowed.has(key) || typeof value !== "string") continue;
    await putSetting(key, value.slice(0, 8000), userId);
  }
  await audit(userId, "SETTINGS", "site", Object.keys(data ?? {}).join(","));
}

export async function adminDriveStatus(userId: string) {
  await requireAdmin(userId);
  invalidateSheet("SystemSettings");
  const map = await settingMap();
  const env = Boolean(process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() && process.env.GOOGLE_OAUTH_CLIENT_ID?.trim());
  return { connected: env || Boolean(map.drive_oauth_refresh_token && map.drive_oauth_client_id && map.drive_oauth_client_secret) };
}

export async function adminSaveDriveClient(userId: string, data: { clientId: string; clientSecret: string }) {
  await requireAdmin(userId);
  const clientId = data.clientId.replace(/\s+/g, "");
  const clientSecret = data.clientSecret.replace(/\s+/g, "");
  if (!clientId.includes(".apps.googleusercontent.com") || clientSecret.length < 8) throw new Error("Client");
  await putSetting("drive_oauth_client_id", clientId, userId);
  await putSetting("drive_oauth_client_secret", clientSecret, userId);
  return { ok: true as const };
}

export async function adminDriveAuthUrl(userId: string, redirectUri: string) {
  await requireAdmin(userId);
  const redirect = safeDriveRedirect(redirectUri);
  if (!redirect) throw new Error("Client");
  invalidateSheet("SystemSettings");
  const map = await settingMap();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || map.drive_oauth_client_id;
  if (!clientId) throw new Error("Client");
  const state = crypto.randomBytes(16).toString("hex");
  const { setCookie } = await import("@tanstack/react-start/server");
  setCookie("vg_drive_state", state, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 15,
  });
  await putSetting("drive_oauth_state", state, userId);
  await putSetting("drive_oauth_redirect", redirect, userId);
  const { driveAuthUrl } = await import("@/lib/google/drive");
  return { url: driveAuthUrl(clientId, redirect, state) };
}

export async function finishDriveOAuth(userId: string, code: string, redirectUri: string, state: string, cookieState = "") {
  await requireAdmin(userId);
  invalidateSheet("SystemSettings");
  const map = await settingMap();
  const stateOk = Boolean(state) && (state === map.drive_oauth_state || state === cookieState);
  if (!stateOk) throw new Error("State");
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || map.drive_oauth_client_id;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || map.drive_oauth_client_secret;
  const redirect = map.drive_oauth_redirect || safeDriveRedirect(redirectUri);
  if (!clientId || !clientSecret || !redirect) throw new Error("Client");
  const { exchangeDriveCode } = await import("@/lib/google/drive");
  const refresh = await exchangeDriveCode(clientId, clientSecret, code, redirect);
  await putSetting("drive_oauth_refresh_token", refresh, userId);
  await putSetting("drive_oauth_state", "", userId);
  return { ok: true as const };
}

export async function adminSaveProduct(userId: string, data: VisaProduct) {
  await requireAdmin(userId);
  const products = await loadProducts();
  const lanes = (data.allowedProcessing ?? []).filter((item) => item === "STANDARD" || item === "PRIORITY" || item === "EXPRESS");
  if (!lanes.includes("STANDARD")) lanes.unshift("STANDARD");
  const next = products.map((item) =>
    item.id === data.id
      ? { ...item, basePrice: Math.max(0, Math.round(Number(data.basePrice) || 0)), productionMinWeeks: Math.max(1, Number(data.productionMinWeeks) || 1), productionMaxWeeks: Math.max(1, Number(data.productionMaxWeeks) || 1), allowedProcessing: lanes, active: Boolean(data.active), description: data.description }
      : item,
  );
  await saveProducts(next, userId);
  const stamp = nowIso();
  const pricing = await readSheetRows("Pricing");
  const priceRow = {
    id: data.id,
    name: data.id,
    description: data.name,
    amount: String(Math.max(0, Math.round(Number(data.basePrice) || 0))),
    currency: "EUR",
    active: String(Boolean(data.active)),
    updatedAt: stamp,
    updatedBy: userId,
  };
  if (pricing.some((row) => row.id === data.id)) await updateSheetRowById("Pricing", data.id, priceRow);
  else await appendSheetRow("Pricing", priceRow);
  await audit(userId, "PRICING", data.id, String(data.basePrice));
  dropPublicCache();
}

export async function adminSaveMedia(
  userId: string,
  data: {
    id?: string;
    kind: string;
    title: string;
    caption?: string;
    imageData?: string;
    country?: string;
    vacancyId?: string;
    startsAt?: string;
    endsAt?: string;
    cover?: boolean;
    active?: boolean;
    sortOrder?: number;
  },
) {
  await requireAdmin(userId);
  const kind = MEDIA_KINDS.has(data.kind) ? data.kind : "office";
  const id = data.id || newId("MED");
  const rows = await readSheetRows("Gallery");
  const raw = rows.find((row) => row.id === id);
  let imageUrl = raw?.imageUrl || "";
  if (data.imageData) {
    if (!data.imageData.startsWith("data:") || data.imageData.length > MAX_DATA) throw new Error("File size");
    const mime = normalizeUploadMime(data.imageData.slice(5, data.imageData.indexOf(";")) || "image/jpeg", `${id}.jpg`);
    const saved = await storeFile("gallery", userId, kind.toUpperCase(), `${id}.jpg`, mime, data.imageData, "APPROVED");
    imageUrl = `file:${saved.driveFileId}`;
  } else if (!raw) {
    throw new Error("File");
  }
  const vacancyId = data.vacancyId ?? raw?.vacancyId ?? "";
  if (kind === "vacancy" && vacancyId && data.active !== false && (!raw || !(raw.isActive === "" || bool(raw.isActive)))) {
    const live = rows.filter((row) => row.id !== id && mediaKind(row) === "vacancy" && row.vacancyId === vacancyId && (row.isActive === "" || bool(row.isActive)));
    if (live.length >= 3) throw new Error("Three");
  }
  if (data.cover) {
    for (const row of rows) {
      if (row.id === id || !bool(row.cover)) continue;
      const same = (kind === "vacancy" && row.vacancyId === vacancyId) || (kind === "license" && mediaKind(row) === "license");
      if (same) await updateSheetRowById("Gallery", row.id, { cover: "false" });
    }
  }
  const row: SheetRow = {
    ...(raw ?? {}),
    id,
    title: data.title || raw?.title || kind,
    imageUrl,
    caption: data.caption !== undefined ? data.caption : mediaCaption(raw ?? {}),
    order: String(data.sortOrder ?? raw?.order ?? "5"),
    isActive: data.active === undefined ? raw?.isActive || "true" : String(data.active),
    kind,
    country: data.country ?? raw?.country ?? "",
    vacancyId,
    startsAt: data.startsAt ?? raw?.startsAt ?? "",
    endsAt: data.endsAt ?? raw?.endsAt ?? "",
    cover: data.cover === undefined ? raw?.cover || "false" : String(Boolean(data.cover)),
  };
  if (raw) await updateSheetRowById("Gallery", id, row);
  else await appendSheetRow("Gallery", row);
  await audit(userId, "MEDIA", id, kind);
  dropPublicCache();
  return { id };
}

export async function adminListMedia(userId: string) {
  await requireStaff(userId);
  return (await readSheetRows("Gallery")).map(mediaFrom).sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
}

export async function adminDeleteMedia(userId: string, id: string) {
  await requireAdmin(userId);
  const raw = (await readSheetRows("Gallery")).find((row) => row.id === id);
  if (raw) await updateSheetRowById("Gallery", id, { ...raw, isActive: "false" });
  await audit(userId, "MEDIA_DELETE", id, "");
  dropPublicCache();
}

export async function adminSavePartner(userId: string, data: { id?: string; country: string; name: string }) {
  await requireAdmin(userId);
  if (!data.name || !data.country) throw new Error("Name");
  const id = data.id || newId("PT");
  const rows = await readJson<{ id: string; country: string; name: string; sort: number }[]>("partners", []);
  const next = rows.some((row) => row.id === id) ? rows.map((row) => (row.id === id ? { ...row, country: data.country, name: data.name } : row)) : [...rows, { id, country: data.country, name: data.name, sort: 9 }];
  await putSetting("partners", JSON.stringify(next), userId);
  await audit(userId, "PARTNER", id, data.name);
  return { id };
}

export async function adminDeletePartner(userId: string, id: string) {
  await requireAdmin(userId);
  const rows = await readJson<{ id: string }[]>("partners", []);
  await putSetting("partners", JSON.stringify(rows.filter((row) => row.id !== id)), userId);
}

export async function adminSetRole(userId: string, data: { userId: string; role: string }) {
  await requireAdmin(userId);
  if (data.role !== "ADMIN" && data.role !== "MANAGER" && data.role !== "CLIENT" && data.role !== "SUBAGENT") throw new Error("Role");
  const rows = await readSheetRows("Users");
  const target = rows.find((row) => row.id === data.userId);
  if (!target) throw new Error("Not found");
  const admins = rows.filter((row) => row.id !== data.userId && roleOf(rolesOf(row.roles)) === "ADMIN");
  if (data.role !== "ADMIN" && roleOf(rolesOf(target.roles)) === "ADMIN" && admins.length < 1) throw new Error("Last admin");
  const roles = data.role === "ADMIN" ? ["ADMIN"] : data.role === "MANAGER" ? ["MANAGER"] : data.role === "SUBAGENT" ? ["SUBAGENT"] : ["CLIENT"];
  await updateSheetRowById("Users", target.id, { ...target, roles: JSON.stringify(roles) });
  await audit(userId, "ROLE", data.userId, data.role);
}

export async function adminSetReferrer(userId: string, data: { id: string; referrerUserId: string }) {
  await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || isHistoryApp(app)) throw new Error("Not found");
  const referrerUserId = data.referrerUserId ? await resolveReferrer(data.referrerUserId) : "";
  if (data.referrerUserId && !referrerUserId) throw new Error("Role");
  await saveApp(app, { ...app.extra, referrerUserId });
  await audit(userId, "REFERRER", app.id, referrerUserId);
  return { ok: true };
}

export async function agentBook(userId: string) {
  const person = await profile(userId);
  if (person.role !== "SUBAGENT") throw new Error("Forbidden");
  const map = await settingMap();
  const rate = Number(map.subagent_rate) || 10;
  const cases = (await loadApps()).filter((app) => app.referrerUserId === userId);
  return {
    code: person.userId,
    email: person.email,
    rate,
    month: kyivMonth(),
    commission: monthCommission(cases, rate),
    cases: cases
      .map((app) => ({
        id: app.id,
        name: clientName(parseQuestionnaire(app.questionnaire)) || "—",
        country: app.country,
        citizenship: app.citizenship,
        status: app.status,
        stage: app.stage,
        createdAt: app.createdAt,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

export async function adminAudit(userId: string) {
  await requireStaff(userId);
  return (await readSheetRows("AuditLog"))
    .map((row) => ({ id: row.id, actorId: row.actorUserId, action: row.action, target: row.targetEntityId, details: row.details, createdAt: row.timestamp }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 80);
}

export async function adminAllTeam(userId: string) {
  await requireStaff(userId);
  return (await readSheetRows("Team")).map((row) => ({
    id: row.id,
    fullName: row.fullName,
    position: row.position,
    phone: row.contactPhone,
    photoData: siteFileUrl("team", row.id, row.photoUrl),
    active: bool(row.isActive) || row.isActive === "",
  }));
}

export async function cancelMine(userId: string, id: string) {
  await profile(userId);
  const app = (await loadApps()).find((item) => item.id === id);
  if (!app || app.userId !== userId) throw new Error("Not found");
  const docs = await docsFor(id);
  if (!canCancel(app.status, app.stage, app.cancelDeadlineAt, docs.some((doc) => doc.category === "PAYMENT_PROOF"))) {
    throw new Error("Locked");
  }
  await restoreQuota(app.vacancyId);
  await saveApp(app, app.extra, { status: "CANCELLED" });
  await audit(userId, "CLIENT_CANCEL", id, "");
  return { ok: true };
}

export async function resubmit(userId: string, id: string) {
  await profile(userId);
  const app = (await loadApps()).find((item) => item.id === id);
  if (!app || app.userId !== userId || app.status !== "REJECTED") throw new Error("Locked");
  const citizenship = app.citizenship || app.extra.questionnaire.citizenship;
  if (!citizenship) throw new Error("Citizenship");
  return createApp(userId, { vacancyId: app.vacancyId, citizenship, processing: app.processing, referrerUserId: app.referrerUserId });
}

export async function reviewDocument(userId: string, data: { id: string; status: string; reason: string }) {
  await requireStaff(userId);
  if (data.status !== "APPROVED" && data.status !== "REJECTED") throw new Error("Status");
  const raw = (await readSheetRows("DossierDocuments")).find((row) => row.id === data.id);
  if (!raw) throw new Error("Not found");
  await updateSheetRowById("DossierDocuments", raw.id, {
    ...raw,
    status: data.status,
    reviewedAt: nowIso(),
    reviewedBy: userId,
    rejectionReason: data.status === "REJECTED" ? data.reason : "",
  });
  await audit(userId, "DOCUMENT", raw.id, data.status);
  return { ok: true };
}

export async function assignManagers(userId: string, data: { ids: string[]; managerId: string }) {
  await requireStaff(userId);
  for (const id of data.ids) {
    const app = (await loadApps()).find((item) => item.id === id);
    if (!app || isHistoryApp(app)) continue;
    await updateSheetRowById("Applications", id, { ...app.row, assignedManagerId: data.managerId, updatedAt: nowIso() });
  }
  await audit(userId, "ASSIGN", data.managerId, data.ids.join(","));
  return { ok: true };
}

export async function exportOpenCases(userId: string) {
  await requireStaff(userId);
  const apps = (await loadApps()).filter((app) => app.status === "OPEN" && !isHistoryApp(app));
  await clearSheetBody("OpenCases");
  const stamp = nowIso();
  for (const app of apps) {
    await appendSheetRow("OpenCases", {
      id: newId("EXP"),
      snapshotAt: stamp,
      applicationId: app.id,
      email: app.clientEmail,
      country: app.country,
      stage: String(app.stage),
      status: app.status,
      deadline: app.docDeadlineAt || app.cancelDeadlineAt || "",
    });
  }
  await audit(userId, "EXPORT", "OpenCases", String(apps.length));
  return { count: apps.length };
}

export async function updateMyContact(userId: string, data: { email: string; phone: string }) {
  const rows = await readSheetRows("Users");
  const row = rows.find((item) => item.id === userId);
  if (!row) throw new Error("Not found");
  const auditRows = await readSheetRows("AuditLog");
  if (auditRows.some((item) => item.actorUserId === userId && item.action === "PROFILE_EDIT")) throw new Error("Locked");
  const email = data.email.trim().toLowerCase();
  const phone = data.phone.trim();
  if (!email.includes("@") || phone.replace(/\D/g, "").length < 7) throw new Error("Contact");
  if (rows.some((item) => item.id !== userId && item.email.toLowerCase() === email)) throw new Error("User with this email already exists.");
  await updateSheetRowById("Users", userId, { ...row, email, phone });
  await audit(userId, "PROFILE_EDIT", userId, email);
  return { ok: true };
}

