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
  /** room, hostel, none, or blank when the old free-text line is all we have. */
  housingKind?: string;
  /** ISO time. While this is in the future the opening stays off the public list. */
  pauseUntil?: string;
  /** First-month hostel Vanguard can book, when the employer provides no room. */
  hostelEur?: number;
  hostelLocal?: number;
  hostelCurrency?: string;
};

export type ChildRow = { name: string; age: string };

export type PayAcks = { room: boolean; night: boolean; fee: boolean; country: boolean };

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
  visaRefusal: string;
  passportExpiry: string;
  travelWithFamily: string;
  children: ChildRow[];
  contactHour: string;
  acks: PayAcks;
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
  visaRefusal: "",
  passportExpiry: "",
  travelWithFamily: "",
  children: [],
  contactHour: "",
  acks: { room: false, night: false, fee: false, country: false },
};

export const CITIZENSHIPS = [
  "Georgia",
  "Moldova",
  "Belarus",
  "Russia",
  "Armenia",
  "Azerbaijan",
  "Kazakhstan",
  "Kyrgyzstan",
  "Tajikistan",
  "Turkmenistan",
  "Uzbekistan",
  "India",
  "Pakistan",
  "Bangladesh",
  "Nepal",
  "Philippines",
  "Türkiye",
  "Egypt",
  "Morocco",
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

/** 0–90. Zero means no client discount. */
export function clampCut(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(90, n);
}

export function parseCuts(raw: string | undefined | null): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const n = clampCut(value);
      if (key && n > 0) out[key] = n;
    }
    return out;
  } catch {
    return {};
  }
}

/** Whole euros. A real discount never rounds a positive fee down to zero. */
export function applyPercent(amount: number, percent: number): number {
  const cut = clampCut(percent);
  const base = Math.round(Number(amount) || 0);
  if (cut <= 0 || base <= 0) return Math.max(0, base);
  return Math.max(1, Math.round((base * (100 - cut)) / 100));
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

export type FeeScheme = "legacy30" | "entry160";

/** First payment on files opened after the 160 euro seat. Older files stay on 30/40/30. */
export const ENTRY_EUR = 160;

export function normalizeScheme(value: unknown): FeeScheme {
  return value === "entry160" ? "entry160" : "legacy30";
}

export function tranches(total: number, scheme: FeeScheme = "legacy30"): { first: number; second: number; final: number } {
  const safe = Math.max(0, Math.round(Number(total) || 0));
  if (scheme === "entry160") {
    const first = Math.min(ENTRY_EUR, safe);
    const rest = safe - first;
    const second = Math.round(rest * 0.6);
    return { first, second, final: Math.max(0, rest - second) };
  }
  const first = Math.round(safe * 0.3);
  const second = Math.round(safe * 0.4);
  return { first, second, final: Math.max(0, safe - first - second) };
}

export function shareLabel(scheme: FeeScheme, index: 0 | 1 | 2): string {
  if (scheme === "entry160") return ["160 EUR", "60%", "rest"][index] || "";
  return ["30%", "40%", "30%"][index] || "";
}

export function declineText(reason: string): string {
  const [code, ...rest] = reason.split("|");
  const extra = rest.join("|").trim();
  const lines: Record<string, string> = {
    blur: "The scan is blurry. Send a sharper photo of the whole page.",
    name: "The name on the paper does not match the questionnaire.",
    page: "This is the wrong page.",
    expired: "This paper is out of date.",
    cropped: "The page is cut off. The whole page has to be in the photo.",
    other: extra || "The office could not accept this scan.",
  };
  const line = lines[code] || lines.other || "The office could not accept this scan.";
  return extra && code !== "other" ? `${line} ${extra}` : line;
}

export function stageIndex(stage: ProcessStage): number {
  return PROCESS_STAGES.indexOf(stage);
}

/** Invoice 2 opens at this document stage. Older files cannot go past it. */
export const INVOICE2_STAGE: ProcessStage = "EMPLOYER_APPROVED_FOR_MINISTRY";
export const LEGACY_CASE_BEFORE = "2026-09-16";

export function openedBeforeInvoice2Rule(createdAt: string | null | undefined): boolean {
  const day = (createdAt || "").slice(0, 10);
  return day.length >= 10 && day < LEGACY_CASE_BEFORE;
}

export function capLegacyProgress(
  createdAt: string | null | undefined,
  stage: number,
  processStage: string,
): { stage: number; processStage: string } {
  if (!openedBeforeInvoice2Rule(createdAt)) return { stage, processStage };
  const cap = stageIndex(INVOICE2_STAGE);
  const at = stageIndex(processStage as ProcessStage);
  return {
    stage: stage > 3 ? 3 : stage,
    processStage: at > cap ? INVOICE2_STAGE : processStage,
  };
}

export function invoice2Unlocked(processStage: string): boolean {
  return stageIndex(processStage as ProcessStage) >= stageIndex("EMPLOYER_APPROVED_FOR_MINISTRY");
}

export const CONTACT_HOURS = ["08", "10", "12", "14", "16", "18", "20", "22"] as const;

/** Office rule for opening a file. Not a statement of what a ministry requires. */
export const PASSPORT_MIN_MONTHS = 12;

export function passportShort(iso: string, now = new Date()): boolean {
  const end = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(end.getTime())) return true;
  const min = new Date(now.getTime());
  min.setUTCMonth(min.getUTCMonth() + PASSPORT_MIN_MONTHS);
  return end.getTime() < min.getTime();
}

export function openBlock(row: { criminalRecord?: string; visaRefusal?: string; passportExpiry?: string }): "record" | "refusal" | "passport" | null {
  if (row.criminalRecord === "yes") return "record";
  if (row.visaRefusal === "yes") return "refusal";
  if (!row.passportExpiry || passportShort(row.passportExpiry)) return "passport";
  return null;
}

export function childrenOk(q: Pick<Questionnaire, "travelWithFamily" | "children">): boolean {
  if (q.travelWithFamily !== "family") return true;
  if (!q.children?.length) return false;
  return q.children.every((child) => child.name.trim().length >= 2 && /^\d{1,2}$/.test(child.age) && Number(child.age) <= 24);
}

export function acksDone(q: Pick<Questionnaire, "acks">): boolean {
  return Boolean(q.acks?.room && q.acks?.night && q.acks?.fee && q.acks?.country);
}

function cleanChildren(value: unknown): ChildRow[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).map((item) => {
    const row = item && typeof item === "object" ? (item as { name?: unknown; age?: unknown }) : {};
    return {
      name: String(row.name || "").slice(0, 80),
      age: String(row.age || "").replace(/\D/g, "").slice(0, 2),
    };
  });
}

function cleanAcks(value: unknown): PayAcks {
  const row = value && typeof value === "object" ? (value as Partial<PayAcks>) : {};
  return { room: Boolean(row.room), night: Boolean(row.night), fee: Boolean(row.fee), country: Boolean(row.country) };
}

export function parseQuestionnaire(raw: string): Questionnaire {
  try {
    const v = JSON.parse(raw) as Partial<Questionnaire>;
    const hour = String(v.contactHour || "");
    return {
      ...EMPTY_QUESTIONNAIRE,
      ...v,
      children: cleanChildren(v.children),
      acks: cleanAcks(v.acks),
      passportExpiry: String(v.passportExpiry || "").slice(0, 10),
      contactHour: (CONTACT_HOURS as readonly string[]).includes(hour) ? hour : "",
      visaRefusal: v.visaRefusal === "yes" || v.visaRefusal === "no" ? v.visaRefusal : "",
    };
  } catch {
    return { ...EMPTY_QUESTIONNAIRE, children: [], acks: { room: false, night: false, fee: false, country: false } };
  }
}

export function questionnaireError(q: Questionnaire): string | null {
  if (!q.firstName.trim() || !q.lastName.trim()) return "name";
  if (!q.middleNameAbsent && !q.middleName.trim()) return "middle";
  if (!q.birthDate) return "birth";
  const born = new Date(q.birthDate);
  if (Number.isNaN(born.getTime())) return "birth";
  if (born.getTime() > Date.now()) return "future";
  const age = (Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (age < 18 || age > 75) return "age";
  if (!q.gender) return "gender";
  if (!q.citizenship) return "citizenship";
  if (q.criminalRecord !== "yes" && q.criminalRecord !== "no") return "record";
  const digits = q.phone.replace(/\D/g, "").replace(/^00/, "");
  if (digits.length < 8) return "phone";
  const code = CALLING[q.citizenship];
  if (code && !digits.startsWith(code)) return "phone_code";
  if (q.previousVisa !== "yes" && q.previousVisa !== "no") return "visa";
  if (q.visaRefusal !== "yes" && q.visaRefusal !== "no") return "refusal";
  const block = openBlock(q);
  if (block === "record") return "gate_record";
  if (block === "refusal") return "gate_refusal";
  if (block === "passport") return "passport";
  if (q.travelWithFamily !== "alone" && q.travelWithFamily !== "family") return "family";
  if (!childrenOk(q)) return "child";
  if (!(CONTACT_HOURS as readonly string[]).includes(q.contactHour)) return "hour";
  return null;
}

export const CALLING: Record<string, string> = {
  Georgia: "995",
  Moldova: "373",
  Armenia: "374",
  Azerbaijan: "994",
  Kazakhstan: "7",
  Uzbekistan: "998",
  Kyrgyzstan: "996",
  Tajikistan: "992",
  India: "91",
  Pakistan: "92",
  Bangladesh: "880",
  Nepal: "977",
  Philippines: "63",
  Türkiye: "90",
  Egypt: "20",
  Morocco: "212",
  Belarus: "375",
  Russia: "7",
  Turkmenistan: "993",
  Serbia: "381",
  Slovakia: "421",
  "Czech Republic": "420",
  Poland: "48",
  Hungary: "36",
  Germany: "49",
  Portugal: "351",
  Bulgaria: "359",
  Italy: "39",
  Norway: "47",
  Canada: "1",
  "New Zealand": "64",
  Ukraine: "380",
};

export function hasHousing(text: string): boolean {
  return !/no housing/i.test(text || "");
}

export function isNightShift(text: string): boolean {
  return /night/i.test(text || "");
}

export function netMark(text: string): "net" | "gross" | "" {
  if (/gross/i.test(text || "")) return "gross";
  if (/net/i.test(text || "")) return "net";
  return "";
}

export function salaryNumber(text: string): number {
  const n = Number((text || "").replace(/[^\d.]/g, "").slice(0, 6));
  return Number.isFinite(n) ? n : 0;
}

export function termMonths(text: string): number {
  const n = Number((text || "").match(/\d+/)?.[0] || 0);
  if (!Number.isFinite(n)) return 0;
  return /year|rok|roků|let/i.test(text || "") ? n * 12 : n;
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
