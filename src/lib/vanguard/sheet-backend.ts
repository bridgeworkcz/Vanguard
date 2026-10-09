import { downloadFileFromDrive, resolveVaultFolder, safeDriveRedirect, uploadFileToDrive } from "@/lib/google/drive";
import { documentPathname, downloadPrivateDocument, uploadPrivateDocument } from "@/lib/blob";
import { appendSheetRow, appendSheetRows, clearSheetBody, deleteSheetRowsByIds, invalidateSheet, patchSheetCells, primeSheetRows, readSheetRows, sheetIdRows, updateSheetRowById, type SheetRow } from "@/lib/google/sheets";
import {
  DOC_CATEGORIES,
  PROCESS_STAGES,
  capLegacyProgress,
  clientName,
  INVOICE2_STAGE,
  openedBeforeInvoice2Rule,
  newId,
  normalizeUploadMime,
  parseQuestionnaire,
  priceFor,
  applyPercent,
  clampCut,
  parseCuts,
  productionWeeks,
  questionnaireError,
  sameCountry,
  stageIndex,
  type DocCategory,
  type Processing,
  type ProcessStage,
  type Questionnaire,
  type Vacancy,
  type VisaProduct,
} from "./domain";
import { DEFAULT_SETTINGS, OFFICE, TEAM, VISA_PRODUCTS, buildVacancies, partnerRows, seatsForPartners, legacyRealPartners } from "./seed";
import { limited } from "./guard";
import { toPublicSettings, toStaffSettings } from "./public-settings";
import { HISTORY_COUNT, buildHistoryBoard, kyivDay } from "./history";
import { readSheetSessionUser } from "./account.server";
import { siteFileUrl } from "./files";
import { canCancel, citizenshipBlocked, dueWithinHours, kyivMonth, monthCommission, trancheSplit } from "./ops";
import { copy } from "./i18n";
import { RESET_LINK, deliverMail } from "./mail";
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
  lang: string;
  accountClosed: boolean;
  commissionPaid: boolean;
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

async function putSetting(key: string, value: string, actor: string, touchCache = true) {
  invalidateSheet("SystemSettings");
  const rows = await settingsRows();
  const found = rows.find((row) => row.key === key);
  const stamp = nowIso();
  if (found) await updateSheetRowById("SystemSettings", found.id, { value, updatedAt: stamp, updatedBy: actor });
  else await appendSheetRow("SystemSettings", { id: newId("SET"), key, value, updatedAt: stamp, updatedBy: actor });
  if (touchCache) dropPublicCache();
}

function filedLang(lang: string) {
  return lang === "cs" || lang === "ur" || lang === "uk" || lang === "ru" ? lang : "en";
}

async function mailCase(app: { id: string; clientEmail: string; extra: { lang: string } }, kind: "stage" | "due" | "doc") {
  try {
    const map = await settingMap();
    const lang = filedLang(app.extra.lang);
    const subjectKey = kind === "due" ? "mail_due_subject" : kind === "doc" ? "mail_doc_subject" : "mail_stage_subject";
    const bodyKey = kind === "due" ? "mail_due_body" : kind === "doc" ? "mail_doc_body" : "mail_stage_body";
    await deliverMail({
      key: map.resend_key || "",
      from: map.mail_from || "",
      to: app.clientEmail || "",
      subject: copy(lang, subjectKey),
      text: copy(lang, bodyKey).replaceAll("{id}", app.id),
    });
  } catch (err) {
    console.error("[mail]", err);
  }
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
    pauseUntil: /^\d{4}-\d{2}-\d{2}T/.test(row.salaryGross || "") ? row.salaryGross : "",
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
    salaryGross: v.pauseUntil || (/^\d{4}-\d{2}-\d{2}T/.test(previous?.salaryGross || "") ? "" : previous?.salaryGross || ""),
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
    const rows = pricing.filter((item) => (item.id === product.id || item.name === product.id) && item.active !== "false");
    rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    const amount = Number(rows[0]?.amount);
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
    lang: "en",
    accountClosed: false,
    commissionPaid: false,
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
  const capped = capLegacyProgress(row.createdAt, Number(row.stage) || 1, row.processStage || "IN_PROCESS");
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
    stage: capped.stage,
    status: row.status || "OPEN",
    processStage: capped.processStage,
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
    clientPhone: extra.questionnaire.phone || "",
    accountClosed: extra.accountClosed === true,
    lang: extra.lang || "en",
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
    totalCost: patch.totalCost ?? app.row.totalCost,
  };
  await updateSheetRowById("Applications", app.id, row);
  dropPublicCache();
}

async function persistLegacyCap(app: ReturnType<typeof appFrom>) {
  const rawStage = Number(app.row.stage) || 1;
  const rawProcess = app.row.processStage || "IN_PROCESS";
  if (rawStage === app.stage && rawProcess === app.processStage) return;
  await saveApp(app, app.extra, { stage: String(app.stage), processStage: app.processStage });
}

function openedBefore(createdAt: string | null | undefined) {
  return openedBeforeInvoice2Rule(createdAt);
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

const DOC_LABEL: Record<string, string> = {
  PASSPORT: "Паспорт",
  POLICE_CLEARANCE: "Довідка про несудимість",
  PHOTO: "Фото",
  EDUCATION: "Освіта",
  MEDICAL: "Медична довідка",
  OTHER: "Інший документ",
  PAYMENT_PROOF: "Підтвердження оплати",
  FINAL: "Готовий документ",
};

function ukYes(value: string) {
  if (value === "yes") return "Так";
  if (value === "no") return "Ні";
  return "—";
}

function ukGender(value: string) {
  if (value === "f") return "Жіноча";
  if (value === "m") return "Чоловіча";
  if (value === "x") return "Інша";
  return "—";
}

function ukPace(value: string) {
  if (value === "EXPRESS") return "Терміново";
  if (value === "PRIORITY") return "Пріоритет";
  return "Стандарт";
}

async function notifyFile(fileName: string, mime: string, buffer: Buffer, caption: string) {
  try {
    const map = await settingMap();
    const chatId = map.telegram_owner_chat || process.env.TELEGRAM_CHAT_ID || "";
    if (!chatId || !process.env.TELEGRAM_BOT_TOKEN || !buffer.length) return;
    const { sendSafeTelegramDocument } = await import("@/lib/google/telegram");
    await sendSafeTelegramDocument({ buffer, fileName: fileName || "file", mime }, caption, { chatId });
  } catch (err) {
    console.error("[notice]", err);
  }
}

async function notifyFilledApplication(app: ReturnType<typeof appFrom>, questionnaire: Questionnaire, email: string) {
  const { escapeTelegramHtml } = await import("@/lib/google/telegram");
  const e = (value: string) => escapeTelegramHtml(value.trim() || "—");
  const vacancy = (await loadVacancies()).find((item) => item.id === app.vacancyId);
  const digits = questionnaire.phone.replace(/\D/g, "");
  const phone = digits ? `<a href="https://wa.me/${digits}">${e(questionnaire.phone)}</a>` : e(questionnaire.phone);
  const middle = questionnaire.middleNameAbsent ? "немає" : questionnaire.middleName;
  const lines = [
    "<b>Нова заявка</b>",
    `Номер: ${e(app.id)}`,
    `Ім’я: ${e(clientName(questionnaire))}`,
    `По батькові: ${e(middle)}`,
    `Телефон: ${phone}`,
    `Пошта: ${e(email)}`,
    `Дата народження: ${e(questionnaire.birthDate)}`,
    `Стать: ${ukGender(questionnaire.gender)}`,
    `Громадянство: ${e(questionnaire.citizenship)}`,
    `Судимість: ${ukYes(questionnaire.criminalRecord)}`,
    `Попередня віза: ${ukYes(questionnaire.previousVisa)}`,
    `Подорож: ${questionnaire.travelWithFamily === "family" ? "З родиною" : questionnaire.travelWithFamily === "alone" ? "Сам" : "—"}`,
    "",
    `Країна: ${e(app.country)}`,
    `Вакансія: ${e(vacancy?.title || app.vacancyTitle)}`,
    `Роботодавець: ${e(vacancy?.employer || app.employer)}`,
    `Зарплата: ${e(vacancy?.salaryNet || "")}`,
    `Житло: ${e(vacancy?.accommodation || "")}`,
    `Графік: ${e(vacancy?.workingHours || "")}`,
    `Темп: ${ukPace(app.processing)}`,
    `Вартість: ${e(String(app.totalCost))} EUR`,
    `Термін: ${e(String(app.productionWeeks || ""))} тижнів`,
  ];
  if (vacancy?.requirements) lines.push(`Вимоги: ${e(vacancy.requirements)}`);
  await notify(lines.join("\n"));
  const docs = (await readSheetRows("DossierDocuments")).filter((row) => row.dossierId === app.id && row.driveFileId);
  for (const doc of docs) {
    try {
      const stored = doc.driveFileId.startsWith("docs/")
        ? await downloadPrivateDocument(doc.driveFileId)
        : await downloadFileFromDrive(doc.driveFileId);
      const mime = "contentType" in stored ? stored.contentType : stored.mimeType;
      const label = DOC_LABEL[doc.category] || doc.category || "Документ";
      await notifyFile(
        doc.fileName || "file",
        mime || doc.mime || "application/octet-stream",
        stored.buffer,
        `<b>${escapeTelegramHtml(label)}</b>\nЗаявка ${e(app.id)}\n${e(clientName(questionnaire))}`,
      );
    } catch (err) {
      console.error("[notice file]", err);
    }
  }
}

async function restoreQuota(vacancyId: string) {
  const raw = (await readSheetRows("Vacancies")).find((row) => row.id === vacancyId);
  if (!raw) return;
  const vacancy = vacancyFrom(raw);
  await updateSheetRowById("Vacancies", vacancyId, vacancyTo({ ...vacancy, quota: vacancy.quota + 1 }, raw));
  dropPublicCache();
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
  if (!row) return false;
  await updateSheetRowById("PaymentTransactions", row.id, { ...row, status: "DUE" });
  return true;
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
        photoUrl: member.photo || "",
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

const VACANCY_CATALOG = "4";

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
    await putSetting("vacancy_catalog", "writing", "system", false);
    await putSetting("vacancy_catalog_at", nowIso(), "system", false);
    invalidateSheet("Vacancies");
    const existing = await readSheetRows("Vacancies");
    const seatKey = (country: string, name: string) => `${country.trim()}|${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
    const titles = new Set(existing.map((row) => `${seatKey(row.country || "", row.employerLabel || "")}|${(row.title || "").trim().toLowerCase()}`));
    const perEmployer = new Map<string, number>();
    for (const row of existing) {
      if (row.isActive === "false") continue;
      const key = seatKey(row.country || "", row.employerLabel || "");
      perEmployer.set(key, (perEmployer.get(key) || 0) + 1);
    }
    const ids = new Set(existing.map((row) => row.id));
    let partners: { country: string; name: string }[] = [];
    try {
      const stored = JSON.parse(map.partners || "[]") as { country?: string; name?: string }[];
      if (Array.isArray(stored)) partners = stored.filter((item) => item.country && item.name).map((item) => ({ country: item.country!, name: item.name! }));
    } catch {
      partners = [];
    }
    const seenPartner = new Set(partners.map((item) => seatKey(item.country, item.name)));
    for (const extra of legacyRealPartners()) {
      const key = seatKey(extra.country, extra.name);
      if (seenPartner.has(key)) continue;
      seenPartner.add(key);
      partners.push({ country: extra.country, name: extra.name });
    }
    const byCountry = new Map<string, { country: string; name: string }[]>();
    for (const partner of partners) {
      const list = byCountry.get(partner.country) ?? [];
      list.push(partner);
      byCountry.set(partner.country, list);
    }
    const ordered: { country: string; name: string }[] = [];
    const groups = [...byCountry.values()];
    for (let index = 0; ordered.length < partners.length; index += 1) {
      let added = false;
      for (const group of groups) {
        const partner = group[index];
        if (!partner) continue;
        ordered.push(partner);
        added = true;
      }
      if (!added) break;
    }
    const missing: SheetRow[] = [];
    let extra = 1;
    const batch = 640;
    for (const vacancy of seatsForPartners(ordered)) {
      if (missing.length >= batch) break;
      const employerKey = seatKey(vacancy.country, vacancy.employer);
      const titleKey = `${employerKey}|${vacancy.title.trim().toLowerCase()}`;
      if (titles.has(titleKey)) continue;
      if ((perEmployer.get(employerKey) || 0) >= 2) continue;
      let id = vacancy.id;
      while (ids.has(id)) {
        extra += 1;
        id = `VAC-S${String(extra + 5000).padStart(4, "0")}`;
      }
      ids.add(id);
      titles.add(titleKey);
      perEmployer.set(employerKey, (perEmployer.get(employerKey) || 0) + 1);
      missing.push(vacancyTo({ ...vacancy, id }));
    }
    if (missing.length) await appendSheetRows("Vacancies", missing);
    const stillShort = ordered.some((partner) => (perEmployer.get(seatKey(partner.country, partner.name)) || 0) < 2);
    await putSetting("vacancy_catalog", missing.length >= batch && stillShort ? "more" : VACANCY_CATALOG, "system", false);
  } catch (err) {
    await putSetting("vacancy_catalog", "pending", "system", false).catch(() => undefined);
    await putSetting("vacancy_catalog_at", nowIso(), "system", false).catch(() => undefined);
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
    await sendWeeklyFunnel();
  } catch (err) {
    housekeepingAt = Date.now();
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
  await putSetting("last_digest_at", nowIso(), "system");
}

type Funnel = { week: string; calc: number; apply: number; question: number };

function weekKey() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getUTCDay() + 1) / 7);
  return `${now.getUTCFullYear()}-W${week}`;
}

async function readFunnel(): Promise<Funnel> {
  const empty: Funnel = { week: weekKey(), calc: 0, apply: 0, question: 0 };
  try {
    const { downloadPrivateDocument } = await import("@/lib/blob");
    const file = await downloadPrivateDocument("cache/funnel.json");
    const parsed = JSON.parse(file.buffer.toString("utf8")) as Funnel;
    if (!parsed || typeof parsed.calc !== "number") return empty;
    return { week: String(parsed.week || empty.week), calc: Number(parsed.calc) || 0, apply: Number(parsed.apply) || 0, question: Number(parsed.question) || 0 };
  } catch {
    return empty;
  }
}

async function writeFunnel(data: Funnel) {
  const { uploadPrivateDocument } = await import("@/lib/blob");
  await uploadPrivateDocument("cache/funnel.json", JSON.stringify(data), "application/json", true);
}

async function sendWeeklyFunnel() {
  const map = await settingMap().catch(() => ({}) as Record<string, string>);
  const current = weekKey();
  if (map.funnel_week === current) return;
  const stats = await readFunnel();
  if (stats.week === current && stats.calc + stats.apply + stats.question === 0) {
    await putSetting("funnel_week", current, "system");
    return;
  }
  if (stats.week !== current || map.funnel_week) {
    const { sendSafeTelegramAlert } = await import("@/lib/google/telegram");
    await sendSafeTelegramAlert(`Тиждень ${stats.week}\nКалькулятор: ${stats.calc}\nЗаявки: ${stats.apply}\nАнкети: ${stats.question}`);
    await writeFunnel({ week: current, calc: 0, apply: 0, question: 0 });
  }
  await putSetting("funnel_week", current, "system");
}

export async function noteFunnel(kind: "calc" | "apply" | "question") {
  const current = weekKey();
  let stats = await readFunnel();
  if (stats.week !== current) {
    await sendWeeklyFunnel();
    stats = { week: current, calc: 0, apply: 0, question: 0 };
  }
  stats[kind] += 1;
  await writeFunnel(stats);
  return stats;
}

async function remindDeadlines() {
  const apps = (await loadApps()).filter((app) => !isHistoryApp(app));
  for (const app of apps) {
    if (app.status !== "OPEN") continue;
    let extra = app.extra;
    if (!extra.paymentReminded && dueWithinHours(app.cancelDeadlineAt, 72)) {
      extra = { ...extra, paymentReminded: true };
      await saveApp(app, extra);
    }
    if (!extra.docReminded && dueWithinHours(app.docDeadlineAt, 72)) {
      extra = { ...extra, docReminded: true };
      await saveApp(app, extra);
    }
  }
}

let expireAt = 0;

async function expireUnpaid() {
  const now = Date.now();
  if (now - expireAt < 10 * 60 * 1000) return;
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
  const map = await settingMap().catch(() => null);
  if (!map || map.seed_version !== "2") await ensureSeed();
  void housekeeping();
  void expireUnpaid();
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

function rowCell(row: SheetRow, names: string[]) {
  const folded = new Map(Object.entries(row).map(([key, value]) => [key.replace(/[\s_]/g, "").toLowerCase(), value]));
  for (const name of names) {
    const value = String(folded.get(name.replace(/[\s_]/g, "").toLowerCase()) ?? "").trim();
    if (value) return value;
  }
  return "";
}

function teamName(row: SheetRow) {
  return rowCell(row, ["fullName", "name"]);
}

function writeAliased(row: SheetRow | undefined, groups: [string, string][]): SheetRow {
  const next: SheetRow = { ...(row || {}) };
  for (const [canonical, value] of groups) {
    const aliases = canonical.split("|");
    const folded = new Set(aliases.map((name) => name.replace(/[\s_]/g, "").toLowerCase()));
    const keys = Object.keys(next).filter((key) => folded.has(key.replace(/[\s_]/g, "").toLowerCase()));
    if (keys.length) {
      for (const key of keys) next[key] = value;
    } else {
      next[aliases[0] || canonical] = value;
    }
  }
  return next;
}

function teamHidden(row: SheetRow) {
  const flag = rowCell(row, ["isActive", "active"]).toLowerCase();
  return flag === "false" || flag === "0" || flag === "no";
}

function teamPerson(row: SheetRow) {
  return {
    id: row.id || rowCell(row, ["id"]) || teamName(row),
    fullName: teamName(row),
    position: rowCell(row, ["position", "role"]),
    phone: rowCell(row, ["contactPhone", "phone"]),
    photoData: siteFileUrl("team", row.id || rowCell(row, ["id"]), rowCell(row, ["photoUrl", "photo"])),
    sortOrder: Number(rowCell(row, ["order", "sort"]) || row.order) || 0,
    active: !teamHidden(row),
  };
}

function plainName(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

const EXTRA_DIRECTORS = new Set(["TM-LNY2GG", "TM-JCO0JT"]);

function isExtraDirector(row: SheetRow) {
  const id = row.id || rowCell(row, ["id"]);
  if (!id || id === "TM-DIR" || teamHidden(row)) return false;
  if (EXTRA_DIRECTORS.has(id)) return true;
  return plainName(teamName(row)).replace(/[^a-z]/g, "").includes("klaranovak");
}

async function hideExtraDirectors(rows: SheetRow[]) {
  const map = await settingMap().catch(() => null);
  if (!map || map.team_deduped === "2") return rows;
  const extra = rows.filter(isExtraDirector);
  if (!extra.length) {
    await putSetting("team_deduped", "2", "system", false);
    return rows;
  }
  for (const row of extra) {
    const id = row.id || rowCell(row, ["id"]);
    if (!id) continue;
    try {
      await updateSheetRowById("Team", id, writeAliased(row, [["isActive|active", "false"]]));
    } catch (err) {
      console.error("[team-dedupe]", id, err);
    }
  }
  invalidateSheet("Team");
  const hidden = new Set(extra.map((row) => row.id || rowCell(row, ["id"])));
  return rows.map((row) => (hidden.has(row.id || rowCell(row, ["id"])) ? writeAliased(row, [["isActive|active", "false"]]) : row));
}

async function teamRowsForSite(rows: SheetRow[]) {
  const current = await hideExtraDirectors(rows);
  return current
    .filter((row) => (row.id || rowCell(row, ["id"])) && teamName(row) && !teamHidden(row))
    .map(teamPerson)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.fullName.localeCompare(b.fullName));
}

function present(app: ReturnType<typeof appFrom>) {
  const { extra: _extra, row: _row, ...rest } = app;
  return rest;
}

async function ensurePartnerCatalog() {
  try {
    const stored = await readJson<{ id: string; country: string; name: string; sort: number }[]>("partners", []);
    if (!Array.isArray(stored) || stored.length < 40) {
      console.error("[partners] refusing to rewrite a short list", Array.isArray(stored) ? stored.length : 0);
      return;
    }
    const have = new Set<string>();
    const kept: typeof stored = [];
    for (const row of stored) {
      const key = `${row.country}|${row.name}`.toLowerCase();
      if (!row.country || !row.name || have.has(key)) continue;
      have.add(key);
      kept.push(row);
    }
    const ids = new Set(kept.map((row) => row.id));
    const missing = legacyRealPartners()
      .filter((row) => !have.has(`${row.country}|${row.name}`.toLowerCase()))
      .map((row) => {
        let id = row.id;
        let n = 1;
        while (ids.has(id)) {
          n += 1;
          id = `${row.id.slice(0, 26)}${n}`;
        }
        ids.add(id);
        return { ...row, id };
      });
    if (!missing.length && kept.length === stored.length) return;
    const next = JSON.stringify([...kept, ...missing]);
    if (next.length > 48000) {
      console.error("[partners] list is too long to store", next.length);
      return;
    }
    await putSetting("partners", next, "system", false);
    await putSetting("partners_catalog", "6", "system", false);
  } catch (err) {
    console.error("[partners]", err);
  }
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
let filingsCache: { at: number; value: { id: string; citizenship: string; country: string; createdAt: string; status: string; stage: number }[] } | null = null;
let publicFlight: Promise<Awaited<ReturnType<typeof buildPublicSite>>> | null = null;
let publicGen = 0;
const PUBLIC_TTL = 90_000;
const SNAP_PATH = "cache/public-site-v9.json";
const SNAP_GEN = 9;

function dropPublicCache() {
  publicGen += 1;
  filingsCache = null;
  if (publicCache) publicCache = { at: 0, value: publicCache.value };
}

async function readSnap() {
  try {
    const { downloadPrivateDocument } = await import("@/lib/blob");
    const file = await downloadPrivateDocument(SNAP_PATH);
    const parsed = JSON.parse(file.buffer.toString("utf8")) as { at?: number; gen?: number; value?: Awaited<ReturnType<typeof buildPublicSite>> };
    if (!parsed?.value || typeof parsed.at !== "number" || parsed.gen !== SNAP_GEN) return null;
    return { at: parsed.at, value: parsed.value };
  } catch {
    return null;
  }
}

async function writeSnap(value: Awaited<ReturnType<typeof buildPublicSite>>) {
  try {
    const { uploadPrivateDocument } = await import("@/lib/blob");
    await uploadPrivateDocument(SNAP_PATH, JSON.stringify({ at: Date.now(), gen: SNAP_GEN, value }), "application/json", true);
  } catch (err) {
    console.error("[site-cache]", err);
  }
}

function refreshPublic(depth = 0): Promise<Awaited<ReturnType<typeof buildPublicSite>>> {
  const gen = publicGen;
  if (publicFlight) {
    return publicFlight.then((value) => {
      if (gen === publicGen || depth >= 2) return value;
      return refreshPublic(depth + 1);
    });
  }
  let flight!: Promise<Awaited<ReturnType<typeof buildPublicSite>>>;
  flight = buildPublicSite()
    .then(async (value) => {
      if (publicFlight === flight) publicFlight = null;
      if (gen !== publicGen) {
        if (depth < 2) return refreshPublic(depth + 1);
        if (publicCache && publicCache.at > 0) return publicCache.value;
        return value;
      }
      publicCache = { at: Date.now(), value };
      await writeSnap(value);
      return value;
    })
    .catch((err) => {
      if (publicFlight === flight) publicFlight = null;
      console.error("[site]", err);
      if (gen !== publicGen && depth < 2) return refreshPublic(depth + 1);
      if (publicCache?.value) return publicCache.value;
      throw err;
    });
  publicFlight = flight;
  return flight;
}

async function publishProductList(products: VisaProduct[], priceLog: string) {
  try {
    const visible = products.filter((item) => item.active);
    let base = publicCache?.value;
    if (!base) base = (await readSnap())?.value;
    if (!base) {
      await refreshPublic();
      return;
    }
    const value = {
      ...base,
      products: visible,
      settings: { ...base.settings, visa_products: JSON.stringify(products), price_log: priceLog },
    };
    publicCache = { at: Date.now(), value };
    await writeSnap(value);
  } catch (err) {
    console.error("[price-publish]", err);
    dropPublicCache();
  }
}

/** A saved copy is served while the table is busy. The table is read about once a minute. */
async function readyForPublicRead() {
  try {
    await primeSheetRows(["SystemSettings", "Applications", "Vacancies", "Team", "Gallery", "Pricing"]);
  } catch (err) {
    console.error("[sheets] prime", err);
    if (err instanceof Error && err.message.includes("busy") && !publicCache) throw err;
  }
  const map = await settingMap().catch(() => null);
  if (map && map.seed_version !== "2") await ensureSeed();
  if (map) await ensurePartnerCatalog();
  if (map) await ensureVacancyCatalog();
}

export async function publicSite() {
  if (publicCache && publicCache.at > 0 && Date.now() - publicCache.at < PUBLIC_TTL) return publicCache.value;
  if (!publicCache) {
    const snap = await readSnap();
    if (snap?.value && snap.at > 0) publicCache = snap;
  }
  if (publicCache && publicCache.at > 0 && Date.now() - publicCache.at < PUBLIC_TTL) return publicCache.value;
  if (publicCache && publicCache.at > 0) {
    void refreshPublic();
    return publicCache.value;
  }
  return refreshPublic();
}

const NO_HOUSING = "No housing included. The worker finds a room.";

async function mixVacancyOffers() {
  const map = await settingMap();
  if (map.vacancy_mix === "1") return;
  const rows = await sheetIdRows("Vacancies");
  const acc = 7;
  const cells: { row: number; col: number; value: string }[] = [];
  for (const row of rows) {
    if (!row.id) continue;
    const hash = [...row.id].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 5;
    const housing = row.values[6] || "";
    if ((hash === 0 || hash === 1) && !/no housing/i.test(housing)) {
      cells.push({ row: row.row, col: acc, value: NO_HOUSING });
    }
  }
  if (cells.length) await patchSheetCells("Vacancies", cells);
  await putSetting("vacancy_mix", "1", "system");
}

async function buildPublicSite() {
  await readyForPublicRead();
  await mixVacancyOffers().catch((err) => console.error("[mix]", err));
  const [settings, products, vacancies, teamRows, galleryRows, filings] = await Promise.all([
    settingMap(),
    loadProducts(),
    loadVacancies(),
    readSheetRows("Team"),
    readSheetRows("Gallery"),
    readSheetRows("Applications"),
  ]);
  const team = await teamRowsForSite(teamRows);
  const media = galleryRows.filter((row) => row.isActive === "" || bool(row.isActive)).map(mediaFrom);
  let partners: { id: string; country: string; name: string; sortOrder: number }[] = [];
  try {
    const stored = JSON.parse(settings.partners || "[]") as { id: string; country: string; name: string; sort: number }[];
    if (Array.isArray(stored)) {
      partners = stored.map((item) => ({ id: item.id, country: item.country, name: item.name, sortOrder: item.sort }));
    }
  } catch {
    partners = [];
  }
  const seenPartner = new Set(partners.map((item) => `${item.country}|${item.name}`.toLowerCase()));
  for (const extra of legacyRealPartners()) {
    const key = `${extra.country}|${extra.name}`.toLowerCase();
    if (seenPartner.has(key)) continue;
    seenPartner.add(key);
    partners.push({ id: extra.id, country: extra.country, name: extra.name, sortOrder: extra.sort });
  }
  const counts = { filed: filings.length, issued: filings.filter((row) => row.status === "ISSUED").length };
  return { settings: toPublicSettings(settings), products: products.filter((item) => item.active), vacancies: vacancies.filter((item) => item.active), team, media, partners, counts };
}

export async function listPublicFilings() {
  if (filingsCache && Date.now() - filingsCache.at < PUBLIC_TTL) return filingsCache.value;
  try {
    await readyForPublicRead();
    const apps = await loadApps();
    const value = apps
      .map((app) => ({
        id: app.id,
        citizenship: app.citizenship || "",
        country: app.country || "",
        createdAt: app.createdAt || "",
        status: app.status || "OPEN",
        stage: app.stage || 1,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    filingsCache = { at: Date.now(), value };
    return value;
  } catch (err) {
    if (filingsCache) return filingsCache.value;
    throw err;
  }
}

export async function takeInvoiceNumber(userId: string) {
  const person = await profile(userId);
  const staff = person.role === "ADMIN" || person.role === "MANAGER";
  if (!staff) {
    const open = (await loadApps()).some((app) => app.userId === userId && app.status === "OPEN" && app.stage >= 2);
    if (!open) throw new Error("Locked");
  }
  if (limited(`invoice:${userId}`, 12, 60 * 60 * 1000)) throw new Error("Locked");
  const map = await settingMap();
  const next = (Number(map.invoice_seq) || 1000) + 1;
  await putSetting("invoice_seq", String(next), userId);
  return { number: `INV-${next}` };
}

export async function joinWaitlist(userId: string, data: { vacancyId: string; citizenship: string }) {
  await profile(userId);
  const map = await settingMap();
  let counts: Record<string, number> = {};
  try {
    counts = JSON.parse(map.waitlist_counts || "{}") as Record<string, number>;
  } catch {
    counts = {};
  }
  counts[data.vacancyId] = (Number(counts[data.vacancyId]) || 0) + 1;
  await putSetting("waitlist_counts", JSON.stringify(counts), userId);
  dropPublicCache();
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
  await persistLegacyCap(app);
  let wallet = "";
  let network = "";
  if (app.status === "OPEN" && app.stage >= 2) {
    const map = await settingMap();
    wallet = (map.usdt_wallet || "").trim();
    network = map.usdt_network || "TRC-20 (TRON)";
  }
  return { app: present(app), documents: await docsFor(id), messages: await messagesFor(id), wallet, network };
}

async function resolveReferrer(code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const map = await settingMap().catch(() => ({}) as Record<string, string>);
  try {
    const aliases = JSON.parse(map.agent_aliases || "{}") as Record<string, { code?: string }>;
    const found = Object.entries(aliases).find(([, item]) => (item.code || "").toLowerCase() === trimmed.toLowerCase());
    if (found) return found[0];
  } catch {
    /* the code may still be a user id */
  }
  const row = (await readSheetRows("Users")).find((item) => item.id === trimmed || item.email.toLowerCase() === trimmed.toLowerCase());
  if (!row || roleOf(rolesOf(row.roles)) !== "SUBAGENT") return "";
  return row.id;
}

async function cutFor(referrerUserId: string): Promise<number> {
  if (!referrerUserId) return 0;
  const map = await settingMap();
  return clampCut(parseCuts(map.agent_discounts)[referrerUserId]);
}

export async function publicCut(code: string): Promise<number> {
  const id = await resolveReferrer(code);
  if (!id) return 0;
  return cutFor(id);
}

export async function createApp(userId: string, data: { vacancyId: string; citizenship: string; processing: Processing; agentCode?: string; referrerUserId?: string; lang?: string }) {
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
      if (referrerUserId) {
        const percent = await cutFor(referrerUserId);
        const extra = { ...existing.extra, referrerUserId };
        if (existing.stage <= 1 && percent > 0) {
          const total = String(applyPercent(priceFor(product.basePrice, existing.processing), percent));
          await saveApp(existing, extra, { totalCost: total });
        } else await saveApp(existing, extra);
      }
    }
    return { id: existing.id };
  }
  const referrerUserId = await resolveReferrer(data.referrerUserId || data.agentCode || "");
  const percent = await cutFor(referrerUserId);
  const id = newId("VG");
  const stamp = nowIso();
  const extra: Extra = { ...emptyExtra(), clientEmail: person.email, citizenship: data.citizenship, lang: filedLang(data.lang || ""), productionWeeks: productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, data.processing), questionnaire: { ...parseQuestionnaire("{}"), citizenship: data.citizenship }, referrerUserId };
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
    totalCost: String(applyPercent(priceFor(product.basePrice, data.processing), percent)),
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
  return { id };
}

export async function saveQuestionnaire(userId: string, data: { id: string; questionnaire: Questionnaire }) {
  const person = await profile(userId);
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || app.userId !== userId) throw new Error("Not found");
  if (app.stage !== 1 || app.status !== "OPEN") throw new Error("Locked");
  const questionnaire = { ...parseQuestionnaire("{}"), ...data.questionnaire };
  const error = questionnaireError(questionnaire);
  if (error) return { ok: false as const, error };
  const firstComplete = !app.profileComplete;
  await saveApp(app, { ...app.extra, questionnaire, profileComplete: true, citizenship: questionnaire.citizenship });
  await writeDossier(userId, app, clientName(questionnaire), questionnaire.citizenship);
  await audit(userId, "QUESTIONNAIRE", app.id, clientName(questionnaire));
  if (firstComplete) await notifyFilledApplication(app, questionnaire, person.email || app.clientEmail);
  return { ok: true as const };
}

async function storeFile(applicationId: string, userId: string, category: string, fileName: string, mime: string, data: string, status: string) {
  const safeMime = normalizeUploadMime(mime, fileName);
  if (!ALLOWED_MIME.has(safeMime)) throw new Error("File type");
  if (!data.startsWith("data:")) throw new Error("File type");
  if (data.length > MAX_DATA) throw new Error("File size");
  const encoded = data.split(",")[1] ?? "";
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length) throw new Error("File type");
  const pathname = documentPathname(applicationId, category, fileName || "file");
  let storedPath = "";
  try {
    const uploaded = await uploadPrivateDocument(pathname, buffer, safeMime);
    storedPath = uploaded.pathname;
  } catch (err) {
    console.error("[file]", err);
    throw new Error("Drive refused");
  }
  const id = newId("DOC");
  try {
    await appendSheetRow("DossierDocuments", {
      id,
      dossierId: applicationId,
      category,
      fileName: fileName || "file",
      driveFileId: storedPath,
      status,
      uploadedAt: nowIso(),
      reviewedAt: "",
      reviewedBy: "",
      rejectionReason: "",
      mime: safeMime,
    });
    await audit(userId, "UPLOAD", applicationId, category);
  } catch (err) {
    console.error("[file] record", err);
  }
  return { id, driveFileId: storedPath };
}

export async function uploadDoc(userId: string, data: { applicationId: string; category: DocCategory; fileName: string; mime: string; data: string }) {
  await profile(userId);
  const app = (await loadApps()).find((item) => item.id === data.applicationId);
  if (!app || app.userId !== userId) throw new Error("Not found");
  if (app.status !== "OPEN" || app.stage < 2) throw new Error("Locked");
  if (!DOC_CATEGORIES.includes(data.category) || data.category === "FINAL") throw new Error("Category");
  if (data.category === "PAYMENT_PROOF" && app.stage !== 2) throw new Error("Locked");
  const saved = await storeFile(app.id, userId, data.category, data.fileName, data.mime, data.data, "UPLOADED");
  const questionnaire = parseQuestionnaire(app.questionnaire);
  const { escapeTelegramHtml } = await import("@/lib/google/telegram");
  const label = DOC_LABEL[data.category] || "Документ";
  const encoded = data.data.split(",")[1] ?? "";
  const buffer = Buffer.from(encoded, "base64");
  await notifyFile(
    data.fileName || "file",
    normalizeUploadMime(data.mime, data.fileName),
    buffer,
    `<b>${escapeTelegramHtml(label)}</b>\nЗаявка ${escapeTelegramHtml(app.id)}\n${escapeTelegramHtml(clientName(questionnaire) || "Клієнт")}`,
  );
  return saved;
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
    if (doc.driveFileId.startsWith("docs/")) {
      const file = await downloadPrivateDocument(doc.driveFileId);
      const mime = doc.mime || file.contentType || "application/octet-stream";
      return {
        applicationId: app.id,
        fileName: doc.fileName || "file",
        mime,
        data: `data:${mime};base64,${file.buffer.toString("base64")}`,
        category: doc.category,
      };
    }
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
  const cuts = parseCuts((await settingMap()).agent_discounts);
  const users = (await readSheetRows("Users"))
    .filter((row) => row.isActive !== "false")
    .map((row) => ({
    userId: row.id,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    role: roleOf(rolesOf(row.roles)),
    clientDiscount: cuts[row.id] || 0,
  }));
  return {
    role: person.role,
    userId: person.userId,
    waiting: apps.filter((app) => app.status === "OPEN" && app.stage === 1 && app.profileComplete).length,
    proofs: apps.filter((app) => app.status === "OPEN" && app.stage === 2 && docs.some((doc) => doc.dossierId === app.id && doc.category === "PAYMENT_PROOF" && doc.status === "UPLOADED")).length,
    live: apps.filter((app) => app.status === "OPEN").length,
    users,
    closed: (await readSheetRows("Users"))
      .filter((row) => row.isActive === "false")
      .map((row) => ({ userId: row.id, email: row.email, fullName: row.fullName })),
    funnel: await readFunnel().catch(() => ({ week: "", calc: 0, apply: 0, question: 0 })),
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
  await persistLegacyCap(app);
  return { app: present(app), documents: await docsFor(id), messages: await messagesFor(id) };
}

function docNote(lang: string, reason: string): string {
  const [code, extra] = reason.split("|");
  const copy: Record<string, Record<string, string>> = {
    en: {
      blur: "The amount on the receipt is not readable. Send a closer photo.",
      name: "The name on the paper does not match the questionnaire.",
      page: "This file has too many pages. Send only the page the case asked for.",
      other: "This paper was declined.",
    },
    cs: {
      blur: "Částka na potvrzení není čitelná. Pošlete bližší fotografii.",
      name: "Jméno na dokladu nesedí s dotazníkem.",
      page: "Soubor má příliš mnoho stran. Pošlete jen tu, kterou kauza žádá.",
      other: "Doklad byl odmítnut.",
    },
    ur: {
      blur: "رسید پر رقم پڑھی نہیں گئی۔ قریب سے تصویر بھیجیں۔",
      name: "کاغذ پر نام سوالنامے سے نہیں ملتا۔",
      page: "فائل میں صفحات زیادہ ہیں۔ صرف وہ صفحہ بھیجیں جو کیس مانگتا ہے۔",
      other: "یہ کاغذ مسترد ہوا۔",
    },
    uk: {
      blur: "Суму на квитанції не прочитати. Надішліть ближче фото.",
      name: "Ім’я на папері не збігається з анкетою.",
      page: "У файлі забагато сторінок. Надішліть лише ту, яку просить справа.",
      other: "Цей папір відхилено.",
    },
    ru: {
      blur: "Сумму на квитанции не прочитать. Пришлите фото ближе.",
      name: "Имя на бумаге не совпадает с анкетой.",
      page: "В файле слишком много страниц. Пришлите только ту, которую просит дело.",
      other: "Этот документ отклонён.",
    },
  };
  const line = (copy[lang] || copy.en)?.[code || ""] || reason;
  return extra?.trim() ? `${line} ${extra.trim()}` : line;
}

function stageNote(lang: string, action: string): string {
  const copy: Record<string, Record<string, string>> = {
    en: {
      accept: "The office accepted the file. The first 30% is now due in your case.",
      "confirm-payment": "The first payment is in. Send the papers the case still lists.",
      stage4: "The last 30% is due. After it is paid, the permit can be sent.",
      reject: "The file was declined. You can open it again from your case.",
      cancel: "The file was cancelled. The seat is free.",
    },
    cs: {
      accept: "Kancelář spis přijala. V kauze je splatných prvních 30 %.",
      "confirm-payment": "První platba je přijatá. Doplňte doklady, které kauza ještě žádá.",
      stage4: "Splatných je posledních 30 %. Po zaplacení lze povolení odeslat.",
      reject: "Spis byl odmítnut. Z kabinetu ho lze otevřít znovu.",
      cancel: "Spis byl zrušen. Místo je volné.",
    },
    ur: {
      accept: "دفتر نے فائل قبول کر لی۔ پہلے 30% اب آپ کے کیس میں واجب ہیں۔",
      "confirm-payment": "پہلی ادائیگی آ گئی۔ جو کاغذات کیس اب بھی مانگے، وہ بھیجیں۔",
      stage4: "آخری 30% واجب ہیں۔ اس کے بعد اجازت نامہ بھیجا جا سکتا ہے۔",
      reject: "فائل مسترد ہوئی۔ کیس سے اسے دوبارہ کھولا جا سکتا ہے۔",
      cancel: "فائل منسوخ ہوئی۔ جگہ خالی ہے۔",
    },
    uk: {
      accept: "Офіс прийняв справу. Перші 30% тепер у кабінеті.",
      "confirm-payment": "Перша оплата є. Надішліть папери, яких справа ще просить.",
      stage4: "Останні 30% до сплати. Після них дозвіл можна надсилати.",
      reject: "Справу відхилено. Її можна відкрити знову з кабінету.",
      cancel: "Справу скасовано. Місце вільне.",
    },
    ru: {
      accept: "Офис принял дело. Первые 30% теперь в кабинете.",
      "confirm-payment": "Первая оплата есть. Пришлите бумаги, которые дело ещё просит.",
      stage4: "Последние 30% к оплате. После них разрешение можно отправлять.",
      reject: "Дело отклонено. Его можно открыть снова из кабинета.",
      cancel: "Дело отменено. Место свободно.",
    },
  };
  return (copy[lang] || copy.en)?.[action] || "";
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
    if (openedBefore(app.createdAt)) throw new Error("Legacy");
    await saveApp(app, { ...app.extra, stage4At: nowIso() }, { stage: "4" });
    stage = 4;
    try {
      await markTrancheDue(app.id, "T3");
    } catch (err) {
      console.error("[stage4]", err);
    }
  } else throw new Error("Action");
  await audit(person.userId, data.action, app.id, data.reason);
  const note = stageNote(app.extra.lang || "en", data.action);
  if (note) {
    try {
      await postMessage(person.userId, { applicationId: app.id, body: note });
    } catch (err) {
      console.error("[stage-note]", err);
    }
  }
  if (data.action === "accept" || data.action === "stage4") void mailCase(app, "due");
  else if (data.action === "confirm-payment" || data.action === "reject" || data.action === "cancel") void mailCase(app, "stage");
  return { ok: true as const, stage };
}

export async function adminSetProcess(userId: string, data: { id: string; processStage: string }) {
  await requireStaff(userId);
  if (!PROCESS_STAGES.includes(data.processStage as ProcessStage)) throw new Error("Stage");
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || isHistoryApp(app) || app.stage < 3 || app.status !== "OPEN") throw new Error("Locked");
  if (openedBefore(app.createdAt) && stageIndex(data.processStage as ProcessStage) > stageIndex(INVOICE2_STAGE)) throw new Error("Legacy");
  await saveApp(app, app.extra, { processStage: data.processStage });
  if (data.processStage === "EMPLOYER_APPROVED_FOR_MINISTRY" || PROCESS_STAGES.indexOf(data.processStage as ProcessStage) >= PROCESS_STAGES.indexOf("EMPLOYER_APPROVED_FOR_MINISTRY")) {
    const opened = await markTrancheDue(app.id, "T2");
    if (opened) void mailCase(app, "due");
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
  dropPublicCache();
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
  const id = data.id?.trim() || newId("TM");
  const fullName = data.fullName.trim();
  if (!fullName) throw new Error("Name");
  invalidateSheet("Team");
  const rows = await readSheetRows("Team");
  const raw = rows.find((row) => (row.id || rowCell(row, ["id"])) === id);
  let photoUrl = raw ? rowCell(raw, ["photoUrl", "photo"]) : "";
  const photo = data.photoData || "";
  if (photo) {
    if (!photo.startsWith("data:image/")) throw new Error("File type");
    if (photo.length > 400_000) throw new Error("File size");
    const buffer = Buffer.from(photo.split(",")[1] ?? "", "base64");
    if (!buffer.length) throw new Error("File type");
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "member";
    const uploaded = await uploadPrivateDocument(`docs/team/portraits/${safeId}.jpg`, buffer, "image/jpeg", true);
    photoUrl = `file:${uploaded.pathname}#${Date.now().toString(36)}`;
  }
  const sample = raw || rows.find((row) => Object.keys(row).length);
  const template = raw || Object.fromEntries(Object.keys(sample || {}).map((key) => [key, ""]));
  const base = writeAliased(template, [
    ["id", id],
    ["fullName|name", fullName],
    ["position|role", data.position.trim()],
    ["photoUrl|photo", photoUrl],
    ["contactPhone|phone", data.phone.trim()],
    ["languages", raw ? rowCell(raw, ["languages"]) || raw.languages || "[]" : "[]"],
    ["bio", raw ? rowCell(raw, ["bio"]) || raw.bio || "" : ""],
    ["order|sort", raw ? rowCell(raw, ["order", "sort"]) || "9" : "9"],
    ["isActive|active", String(data.active !== false)],
  ]);
  if (raw) await updateSheetRowById("Team", raw.id || id, base);
  else await appendSheetRow("Team", base);
  await audit(userId, "TEAM", id, fullName);
  dropPublicCache();
  return { id };
}

export async function adminDeleteTeam(userId: string, id: string) {
  await requireAdmin(userId);
  invalidateSheet("Team");
  const raw = (await readSheetRows("Team")).find((row) => (row.id || rowCell(row, ["id"])) === id);
  if (raw) await updateSheetRowById("Team", raw.id || id, writeAliased(raw, [["isActive|active", "false"]]));
  await audit(userId, "TEAM_DELETE", id, "");
  dropPublicCache();
}

export async function adminGetSettings(userId: string) {
  await requireAdmin(userId);
  return toStaffSettings(await settingMap());
}

export async function adminSaveSettings(userId: string, data: Record<string, string>) {
  await requireAdmin(userId);
  const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
  for (const [key, value] of Object.entries(data ?? {})) {
    if (!allowed.has(key) || typeof value !== "string") continue;
    await putSetting(key, value.slice(0, 8000), userId);
  }
  await audit(userId, "SETTINGS", "site", Object.keys(data ?? {}).join(","));
  await refreshPublic();
}

export async function adminDriveStatus(userId: string) {
  await requireAdmin(userId);
  invalidateSheet("SystemSettings");
  const map = await settingMap();
  const { driveOAuthClientConfigured, driveOAuthFromEnv } = await import("@/lib/google/drive");
  const envId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || "";
  const envSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || "";
  const envRefresh = process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim() || "";
  const sheetId = map.drive_oauth_client_id || "";
  const sheetSecret = map.drive_oauth_client_secret || "";
  const sheetRefresh = map.drive_oauth_refresh_token || "";
  const clientId = envId || sheetId;
  const clientSecret = envSecret || sheetSecret;
  const refresh = envRefresh || (envId && sheetId && envId !== sheetId ? "" : sheetRefresh);
  return {
    connected: Boolean(clientId && clientSecret && refresh),
    configured: driveOAuthClientConfigured({ clientId: sheetId, clientSecret: sheetSecret }),
    fromEnv: driveOAuthFromEnv(),
  };
}

export async function adminSaveDriveClient(userId: string, data: { clientId: string; clientSecret: string }) {
  await requireAdmin(userId);
  const clientId = data.clientId.replace(/\s+/g, "");
  const clientSecret = data.clientSecret.replace(/\s+/g, "");
  if (!clientId.includes(".apps.googleusercontent.com") || clientSecret.length < 8) throw new Error("Client");
  const map = await settingMap();
  const previous = map.drive_oauth_client_id || "";
  await putSetting("drive_oauth_client_id", clientId, userId);
  await putSetting("drive_oauth_client_secret", clientSecret, userId);
  if (previous && previous !== clientId) await putSetting("drive_oauth_refresh_token", "", userId);
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
  const amount = String(Math.max(0, Math.round(Number(data.basePrice) || 0)));
  const matches = pricing.filter((row) => row.id && (row.id === data.id || row.name === data.id));
  const pricePatch = {
    amount,
    currency: "EUR",
    active: String(Boolean(data.active)),
    updatedAt: stamp,
    updatedBy: userId,
    description: data.name,
  };
  if (!matches.length) {
    await appendSheetRow("Pricing", { id: data.id, name: data.id, ...pricePatch });
  } else {
    for (const row of matches) {
      await updateSheetRowById("Pricing", row.id, { ...row, ...pricePatch });
    }
  }
  await audit(userId, "PRICING", data.id, amount);
  const logMap = await settingMap();
  let priceLog: Record<string, { at: string; by: string; amount: string }> = {};
  try {
    priceLog = JSON.parse(logMap.price_log || "{}") as Record<string, { at: string; by: string; amount: string }>;
  } catch {
    priceLog = {};
  }
  priceLog[data.id] = { at: stamp, by: userId, amount };
  const encoded = JSON.stringify(priceLog);
  await putSetting("price_log", encoded, userId);
  await publishProductList(next, encoded);
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

export async function adminSetClientDiscount(userId: string, data: { userId: string; percent: number }) {
  await requireAdmin(userId);
  const percent = clampCut(data.percent);
  const rows = await readSheetRows("Users");
  const target = rows.find((row) => row.id === data.userId);
  if (!target) throw new Error("Not found");
  if (percent > 0 && roleOf(rolesOf(target.roles)) !== "SUBAGENT") throw new Error("Role");
  const book = parseCuts((await settingMap()).agent_discounts);
  if (percent > 0) book[target.id] = percent;
  else delete book[target.id];
  await putSetting("agent_discounts", JSON.stringify(book), userId, false);
  await audit(userId, "CLIENT_DISCOUNT", target.id, String(percent));
  return { percent };
}

export async function adminDeleteApplication(userId: string, id: string) {
  await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === id);
  if (!app || isHistoryApp(app)) throw new Error("Not found");
  const [docs, pays, notes] = await Promise.all([
    readSheetRows("DossierDocuments"),
    readSheetRows("PaymentTransactions"),
    readSheetRows("SupportTickets"),
  ]);
  const removed = await deleteSheetRowsByIds("Applications", [id]);
  if (!removed) throw new Error("Not found");
  if (app.status === "OPEN" && app.vacancyId) {
    try {
      await restoreQuota(app.vacancyId);
    } catch (err) {
      console.error("[delete-quota]", err);
    }
  }
  await deleteSheetRowsByIds(
    "DossierDocuments",
    docs.filter((row) => row.dossierId === id || (row.fileName || "").startsWith(`${id} `)).map((row) => row.id),
  ).catch((err) => console.error("[delete-docs]", err));
  await deleteSheetRowsByIds(
    "PaymentTransactions",
    pays.filter((row) => row.dossierId === id).map((row) => row.id),
  ).catch((err) => console.error("[delete-pay]", err));
  await deleteSheetRowsByIds(
    "SupportTickets",
    notes.filter((row) => row.subject === id || row.dossierId === id).map((row) => row.id),
  ).catch((err) => console.error("[delete-notes]", err));
  await audit(userId, "APPLICATION_DELETE", id, app.clientEmail || "");
  dropPublicCache();
}

export async function adminDeleteAccount(userId: string, targetId: string) {
  await requireAdmin(userId);
  if (!targetId || targetId === userId) throw new Error("Self");
  const rows = await readSheetRows("Users");
  const target = rows.find((row) => row.id === targetId && row.isActive !== "false");
  if (!target) throw new Error("Not found");
  const admins = rows.filter((row) => row.id !== targetId && row.isActive !== "false" && roleOf(rolesOf(row.roles)) === "ADMIN");
  if (roleOf(rolesOf(target.roles)) === "ADMIN" && admins.length < 1) throw new Error("Last admin");
  await updateSheetRowById("Users", target.id, {
    ...target,
    isActive: "false",
  });
  const apps = await loadApps();
  for (const app of apps) {
    if (app.userId !== target.id || isHistoryApp(app)) continue;
    await saveApp(app, { ...app.extra, accountClosed: true });
  }
  await audit(userId, "ACCOUNT_DELETE", target.id, target.email);
}

export async function adminMarkCommission(userId: string, data: { id: string; paid: boolean }) {
  await requireStaff(userId);
  const app = (await loadApps()).find((item) => item.id === data.id);
  if (!app || isHistoryApp(app)) throw new Error("Not found");
  await saveApp(app, { ...app.extra, commissionPaid: Boolean(data.paid) });
  await audit(userId, "COMMISSION", app.id, data.paid ? "paid" : "due");
  return { ok: true };
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

export async function adminRestoreAccount(userId: string, targetId: string) {
  await requireAdmin(userId);
  const rows = await readSheetRows("Users");
  const target = rows.find((row) => row.id === targetId);
  if (!target) throw new Error("Not found");
  await updateSheetRowById("Users", target.id, { ...target, isActive: "true" });
  await audit(userId, "ACCOUNT_RESTORE", target.id, target.email);
}

export async function agentRename(userId: string, code: string) {
  const person = await profile(userId);
  if (person.role !== "SUBAGENT") throw new Error("Forbidden");
  const next = code.trim().slice(0, 40);
  if (!/^[a-z0-9-]{3,40}$/i.test(next)) throw new Error("Code");
  const map = await settingMap();
  let book: Record<string, { code: string; locked?: boolean }> = {};
  try {
    book = JSON.parse(map.agent_aliases || "{}") as Record<string, { code: string; locked?: boolean }>;
  } catch {
    book = {};
  }
  const mine = book[person.userId];
  if (mine?.locked) throw new Error("Locked");
  const taken = Object.entries(book).some(([id, item]) => id !== person.userId && item.code.toLowerCase() === next.toLowerCase());
  if (taken) throw new Error("Code");
  book[person.userId] = { code: next, locked: true };
  await putSetting("agent_aliases", JSON.stringify(book), userId);
  return { code: next };
}

export async function agentBook(userId: string) {
  const person = await profile(userId);
  if (person.role !== "SUBAGENT") throw new Error("Forbidden");
  const map = await settingMap();
  const rate = Number(map.subagent_rate) || 10;
  let aliases: Record<string, { code: string; locked?: boolean }> = {};
  try {
    aliases = JSON.parse(map.agent_aliases || "{}") as Record<string, { code: string; locked?: boolean }>;
  } catch {
    aliases = {};
  }
  const cases = (await loadApps()).filter((app) => app.referrerUserId === userId && !isHistoryApp(app));
  return {
    code: aliases[person.userId]?.code || person.userId,
    locked: Boolean(aliases[person.userId]?.locked),
    email: person.email,
    rate,
    cut: clampCut(parseCuts(map.agent_discounts)[person.userId]),
    month: kyivMonth(),
    commission: monthCommission(cases, rate),
    cases: cases
      .map((app) => ({
        id: app.id,
        country: app.country,
        status: app.status,
        stage: app.stage,
        total: app.totalCost,
        createdAt: app.createdAt,
        pay: app.stage >= 3 ? "paid" : app.stage >= 2 ? "due" : "wait",
        commission: app.stage < 2 ? "wait" : app.extra.commissionPaid ? "paid" : "due",
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
  const rows = await hideExtraDirectors(await readSheetRows("Team"));
  return rows
    .filter((row) => (row.id || rowCell(row, ["id"])) && teamName(row) && !teamHidden(row))
    .map((row) => {
      const id = row.id || rowCell(row, ["id"]);
      return {
        id,
        fullName: teamName(row),
        position: rowCell(row, ["position", "role"]),
        phone: rowCell(row, ["contactPhone", "phone"]),
        photoData: siteFileUrl("team", id, rowCell(row, ["photoUrl", "photo"])),
        active: true,
      };
    });
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
  if (data.status === "REJECTED" && data.reason) {
    const app = (await loadApps()).find((item) => item.id === raw.dossierId);
    if (app) {
      const note = docNote(app.extra.lang || "en", data.reason);
      try {
        await postMessage(userId, { applicationId: app.id, body: note });
      } catch (err) {
        console.error("[doc-note]", err);
      }
      void mailCase(app, "doc");
    }
  }
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

export async function changeMyPassword(userId: string, data: { current: string; next: string }) {
  const rows = await readSheetRows("Users");
  const row = rows.find((item) => item.id === userId);
  if (!row || row.isActive === "false") throw new Error("Not found");
  const { hashPassword, verifyPassword } = await import("@/lib/google/session");
  if (!verifyPassword(data.current, row.passwordHash || "")) throw new Error("Password");
  if (data.next.trim().length < 8) throw new Error("Short");
  await updateSheetRowById("Users", userId, { ...row, passwordHash: hashPassword(data.next) });
  await audit(userId, "PASSWORD", userId, "");
  return { ok: true };
}

type ResetRow = { hash: string; userId: string; exp: number };

function resetRows(raw: string | undefined): ResetRow[] {
  const now = Date.now();
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row): row is ResetRow => Boolean(row) && typeof row === "object" && typeof (row as ResetRow).hash === "string" && typeof (row as ResetRow).userId === "string")
      .filter((row) => row.exp > now)
      .slice(-40);
  } catch {
    return [];
  }
}

export async function adminMailStatus(userId: string) {
  await requireAdmin(userId);
  const map = await settingMap();
  return { from: (map.mail_from || "").slice(0, 160), ready: Boolean((map.resend_key || "").trim() && (map.mail_from || "").includes("@")) };
}

export async function adminSaveMail(userId: string, data: { from: string; key: string }) {
  await requireAdmin(userId);
  const from = data.from.trim().slice(0, 160);
  if (from && !from.includes("@")) throw new Error("Email");
  await putSetting("mail_from", from, userId, false);
  const key = data.key.trim().slice(0, 200);
  if (key) await putSetting("resend_key", key, userId, false);
  const map = await settingMap();
  return { from, ready: Boolean((map.resend_key || "").trim() && from.includes("@")) };
}

export async function requestPasswordReset(email: string, lang: string) {
  const { getRequest } = await import("@tanstack/react-start/server");
  const ip = getRequest()?.headers.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 80) || "local";
  const normalized = email.trim().toLowerCase();
  if (limited(`reset:${normalized}`, 3, 60 * 60 * 1000) || limited(`reset-ip:${ip}`, 20, 60 * 60 * 1000)) throw new Error("Try again later.");
  const map = await settingMap();
  if (!(map.resend_key || "").trim() || !(map.mail_from || "").includes("@")) return { sent: false as const, reason: "nomail" as const };
  const row = (await readSheetRows("Users")).find((item) => (item.email || "").toLowerCase() === normalized && item.isActive !== "false");
  if (row) {
    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const next = resetRows(map.password_resets).filter((item) => item.userId !== row.id);
    next.push({ hash, userId: row.id, exp: Date.now() + 60 * 60 * 1000 });
    await putSetting("password_resets", JSON.stringify(next), "reset", false);
    await deliverMail({
      key: map.resend_key || "",
      from: map.mail_from || "",
      to: row.email,
      subject: copy(filedLang(lang), "mail_reset_subject"),
      text: copy(filedLang(lang), "mail_reset_body").replaceAll("{link}", `${RESET_LINK}${token}`),
    });
  }
  return { sent: true as const };
}

export async function completePasswordReset(token: string, password: string) {
  if (password.trim().length < 8) throw new Error("Short");
  if (!/^[a-f0-9]{64}$/i.test(token)) throw new Error("Expired");
  const map = await settingMap();
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const rows = resetRows(map.password_resets);
  const hit = rows.find((item) => item.hash === hash);
  if (!hit) throw new Error("Expired");
  const users = await readSheetRows("Users");
  const row = users.find((item) => item.id === hit.userId);
  if (!row || row.isActive === "false") throw new Error("Expired");
  const { hashPassword } = await import("@/lib/google/session");
  await updateSheetRowById("Users", row.id, { ...row, passwordHash: hashPassword(password) });
  await putSetting("password_resets", JSON.stringify(rows.filter((item) => item.hash !== hash)), "reset", false);
  await audit(row.id, "PASSWORD_RESET", row.id, "");
  return { ok: true as const };
}

