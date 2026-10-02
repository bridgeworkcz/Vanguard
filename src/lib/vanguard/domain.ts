export type Processing = "STANDARD" | "PRIORITY" | "EXPRESS";
export type Role = "CLIENT" | "MANAGER" | "ADMIN";
export type AppStatus = "OPEN" | "CANCELLED" | "REJECTED";

export const PROCESS_STAGES = [
  "IN_PROCESS",
  "EMPLOYER_SUBMITTED",
  "EMPLOYER_APPROVED_FOR_MINISTRY",
  "LEGAL_SERVICE",
  "MINISTRY_SUBMITTED",
  "MINISTRY_REVIEW",
  "MINISTRY_APPROVED",
  "FINAL_LEGAL_SERVICE",
] as const;

export type ProcessStage = (typeof PROCESS_STAGES)[number];

export const DOC_CATEGORIES = [
  "PASSPORT",
  "POLICE_CLEARANCE",
  "PHOTO",
  "EDUCATION",
  "MEDICAL",
  "OTHER",
  "PAYMENT_PROOF",
  "FINAL",
] as const;

export type DocCategory = (typeof DOC_CATEGORIES)[number];

export type VisaProduct = {
  id: string;
  country: string;
  name: string;
  duration: string;
  description: string;
  basePrice: number;
  currency: string;
  productionMinWeeks: number;
  productionMaxWeeks: number;
  allowedProcessing: Processing[];
  active: boolean;
};

export type Vacancy = {
  id: string;
  title: string;
  country: string;
  visaProductId: string;
  employer: string;
  salaryNet: string;
  accommodation: string;
  workingHours: string;
  description: string;
  requirements: string;
  quota: number;
  active: boolean;
  blockedCitizenships?: string;
};

export type Questionnaire = {
  firstName: string;
  lastName: string;
  middleName: string;
  middleNameAbsent: boolean;
  birthDate: string;
  gender: string;
  citizenship: string;
  criminalRecord: string;
  phone: string;
  previousVisa: string;
  travelWithFamily: string;
};

export const EMPTY_QUESTIONNAIRE: Questionnaire = {
  firstName: "",
  lastName: "",
  middleName: "",
  middleNameAbsent: false,
  birthDate: "",
  gender: "",
  citizenship: "",
  criminalRecord: "",
  phone: "",
  previousVisa: "",
  travelWithFamily: "",
};

export const CITIZENSHIPS = [
  "Georgia",
  "Moldova",
  "Armenia",
  "Azerbaijan",
  "Kazakhstan",
  "Uzbekistan",
  "Kyrgyzstan",
  "Tajikistan",
  "India",
  "Pakistan",
  "Bangladesh",
  "Nepal",
  "Philippines",
  "Türkiye",
  "Egypt",
  "Morocco",
  "Belarus",
  "Serbia",
  "Slovakia",
  "Czech Republic",
  "Poland",
  "Hungary",
  "Germany",
  "Portugal",
  "Bulgaria",
  "Italy",
  "Norway",
  "Canada",
  "New Zealand",
  "Ukraine",
  "Other",
];

/** Standard is the published fee. Priority and express sit inside a 20–35% band over the old list price. */
export function priceFor(base: number, processing: Processing): number {
  if (processing === "EXPRESS") return Math.round((base * 1.35) / 1.2);
  if (processing === "PRIORITY") return Math.round((base * 1.28) / 1.2);
  return base;
}

export function productionWeeks(
  min: number,
  max: number,
  processing: Processing,
): number {
  if (processing === "EXPRESS") return min;
  if (processing === "PRIORITY") return Math.max(min, Math.round((min + max) / 2));
  return max;
}

export function tranches(total: number): { first: number; second: number; final: number } {
  const first = Math.round(total * 0.3);
  const second = Math.round(total * 0.4);
  const final = total - first - second;
  return { first, second, final };
}

export function stageIndex(stage: ProcessStage): number {
  return PROCESS_STAGES.indexOf(stage);
}

export function invoice2Unlocked(processStage: string): boolean {
  return stageIndex(processStage as ProcessStage) >= stageIndex("EMPLOYER_APPROVED_FOR_MINISTRY");
}

export function parseQuestionnaire(raw: string): Questionnaire {
  try {
    const v = JSON.parse(raw) as Partial<Questionnaire>;
    return { ...EMPTY_QUESTIONNAIRE, ...v };
  } catch {
    return { ...EMPTY_QUESTIONNAIRE };
  }
}

export function questionnaireError(q: Questionnaire): string | null {
  if (!q.firstName.trim() || !q.lastName.trim()) return "name";
  if (!q.middleNameAbsent && !q.middleName.trim()) return "middle";
  if (!q.birthDate) return "birth";
  const born = new Date(q.birthDate);
  if (Number.isNaN(born.getTime())) return "birth";
  const age = (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 18 || age > 75) return "age";
  if (!q.gender) return "gender";
  if (!q.citizenship) return "citizenship";
  if (q.criminalRecord !== "yes" && q.criminalRecord !== "no") return "record";
  const digits = q.phone.replace(/\D/g, "");
  if (digits.length < 8) return "phone";
  if (q.previousVisa !== "yes" && q.previousVisa !== "no") return "visa";
  if (q.travelWithFamily !== "alone" && q.travelWithFamily !== "family") return "family";
  return null;
}

export function clientName(q: Questionnaire): string {
  const mid = q.middleNameAbsent ? "" : q.middleName.trim();
  return [q.firstName.trim(), mid, q.lastName.trim()].filter(Boolean).join(" ");
}

export function normalizeUploadMime(mime: string, fileName: string): string {
  const raw = (mime || "").toLowerCase().split(";")[0].trim();
  if (raw === "image/jpg" || raw === "image/pjpeg") return "image/jpeg";
  if (raw === "image/jpeg" || raw === "image/png" || raw === "image/webp" || raw === "application/pdf") return raw;
  const ext = (fileName || "").toLowerCase().split(".").pop() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "pdf") return "application/pdf";
  return raw;
}

export function sameCountry(citizenship: string, destination: string): boolean {
  return citizenship.trim().toLowerCase() === destination.trim().toLowerCase();
}

export function countrySlug(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function whatsAppHref(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const base = `https://wa.me/${digits}`;
  return text ? `${base}?text=${encodeURIComponent(text.slice(0, 400))}` : base;
}

export function newId(prefix: string): string {
  const n = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${n}`;
}
