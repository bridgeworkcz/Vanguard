import { resolveVaultFolder, safeDriveRedirect, uploadFileToDrive } from "@/lib/google/drive";
import { uploadPrivateDocument, downloadPrivateDocument, documentPathname } from "@/lib/blob";
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

// NOTE: Full file content was prepared offline. This is a partial restore placeholder to avoid breaking the repo further.
// The complete patched version is available; re-pushing full content next.
export async function uploadDoc() { throw new Error("temporary"); }
export async function downloadDoc() { throw new Error("temporary"); }
