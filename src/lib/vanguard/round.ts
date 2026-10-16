import { countrySlug, hasHousing, type DocCategory } from "./domain";
import type { CopyKey } from "./i18n";

/** Papers the client is asked for. The list is not the same for every destination. */
export function docsForCountry(country: string): DocCategory[] {
  const list: DocCategory[] = ["PASSPORT", "PHOTO", "POLICE_CLEARANCE", "EDUCATION"];
  if (country === "Germany" || country === "Canada" || country === "New Zealand" || country === "Norway") {
    list.push("MEDICAL");
  }
  list.push("OTHER");
  return list;
}

/** What the client should read before photographing this paper. Base rule, then the destination. */
export function docNotes(country: string, cat: DocCategory): CopyKey[] {
  if (cat === "PASSPORT") {
    const extra =
      country === "Germany" ? "note_pass_de" : country === "Canada" ? "note_pass_ca" : country === "New Zealand" ? "note_pass_nz" : "note_pass_visa";
    return ["note_pass", extra];
  }
  if (cat === "POLICE_CLEARANCE") {
    const extra =
      country === "Czech Republic"
        ? "note_police_cz"
        : country === "Slovakia"
          ? "note_police_sk"
          : country === "Poland"
            ? "note_police_pl"
            : country === "Germany"
              ? "note_police_de"
              : country === "Hungary"
                ? "note_police_hu"
                : country === "Serbia"
                  ? "note_police_rs"
                  : country === "Norway"
                    ? "note_police_no"
                    : country === "Canada"
                      ? "note_police_ca"
                      : country === "New Zealand"
                        ? "note_police_nz"
                        : "note_police_eu";
    return ["note_police", extra];
  }
  if (cat === "PHOTO") {
    const extra = country === "Germany" ? "note_photo_de" : country === "Canada" ? "note_photo_ca" : country === "New Zealand" ? "note_photo_nz" : "note_photo_eu";
    return ["note_photo", extra];
  }
  if (cat === "EDUCATION") {
    const extra =
      country === "Germany"
        ? "note_edu_de"
        : country === "Poland"
          ? "note_edu_pl"
          : country === "Canada"
            ? "note_edu_ca"
            : country === "New Zealand"
              ? "note_edu_nz"
              : country === "Czech Republic" || country === "Slovakia"
                ? "note_edu_cz"
                : "";
    return extra ? ["note_edu", extra] : ["note_edu"];
  }
  if (cat === "MEDICAL") {
    if (country === "Canada") return ["note_med_ca"];
    if (country === "New Zealand") return ["note_med_nz"];
    if (country === "Norway") return ["note_med_no"];
    return ["note_med_de"];
  }
  if (cat === "PAYMENT_PROOF") return ["note_pay"];
  return ["note_other"];
}

export const HOME_CURRENCY: Record<string, string> = {
  Georgia: "GEL",
  Moldova: "MDL",
  Belarus: "BYN",
  Russia: "RUB",
  Armenia: "AMD",
  Azerbaijan: "AZN",
  Kazakhstan: "KZT",
  Kyrgyzstan: "KGS",
  Tajikistan: "TJS",
  Turkmenistan: "TMT",
  Uzbekistan: "UZS",
  India: "INR",
  Pakistan: "PKR",
  Bangladesh: "BDT",
  Nepal: "NPR",
  Philippines: "PHP",
  Türkiye: "TRY",
  Egypt: "EGP",
  Morocco: "MAD",
  Serbia: "RSD",
  Slovakia: "EUR",
  "Czech Republic": "CZK",
  Poland: "PLN",
  Hungary: "HUF",
  Germany: "EUR",
  Portugal: "EUR",
  Bulgaria: "BGN",
  Italy: "EUR",
  Norway: "NOK",
  Canada: "CAD",
  "New Zealand": "NZD",
  Ukraine: "UAH",
};

const CAMPAIGN_ALIAS: Record<string, string> = {
  czech: "Czech Republic",
  czechia: "Czech Republic",
  poland: "Poland",
  germany: "Germany",
  slovakia: "Slovakia",
  hungary: "Hungary",
  serbia: "Serbia",
  italy: "Italy",
  portugal: "Portugal",
  bulgaria: "Bulgaria",
  norway: "Norway",
  canada: "Canada",
  nz: "New Zealand",
  "new-zealand": "New Zealand",
};

export function resolveCampaign(raw: string, countries: string[]): { slug: string; name: string } | null {
  const key = raw.trim().toLowerCase();
  if (!key) return null;
  const named =
    countries.find((item) => countrySlug(item) === key) ||
    countries.find((item) => item.toLowerCase() === (CAMPAIGN_ALIAS[key] || "").toLowerCase());
  if (!named) return null;
  return { slug: countrySlug(named), name: named };
}

export function seatHasHouse(kind: string, text: string): boolean {
  if (kind === "none") return false;
  if (kind === "room" || kind === "hostel") return true;
  return hasHousing(text);
}

export function homeApprox(euros: number, code: string, rates: Record<string, number>): string {
  if (!code || code === "EUR") return "";
  const rate = Number(rates[code]);
  const base = Math.round(Number(euros) || 0);
  if (!Number.isFinite(rate) || rate <= 0 || base <= 0) return "";
  return `${new Intl.NumberFormat("en-GB").format(Math.round(base * rate))} ${code}`;
}

export function phoneKey(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^00/, "");
}

/** Phones that sit on two open files with different surnames. */
export function clashingPhones(rows: { status: string; phone: string; lastName: string }[]): Set<string> {
  const names = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.status !== "OPEN") continue;
    const phone = phoneKey(row.phone);
    const last = row.lastName.trim().toLowerCase();
    if (phone.length < 8 || last.length < 2) continue;
    const set = names.get(phone) ?? new Set<string>();
    set.add(last);
    names.set(phone, set);
  }
  const bad = new Set<string>();
  for (const [phone, set] of names) if (set.size > 1) bad.add(phone);
  return bad;
}

export function dueWithin(iso: string | null | undefined, now = Date.now(), hours = 4): "soon" | "late" | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const delta = at - now;
  if (delta <= 0 && delta > -12 * 3600 * 1000) return "late";
  if (delta > 0 && delta <= hours * 3600 * 1000) return "soon";
  return null;
}

export function caseLoginPath(id: string): string {
  return `/login?case=${encodeURIComponent(id)}`;
}

export function askScript(lang: string, fileId: string, paper: string): string {
  if (lang === "ru") {
    return `Дело ${fileId}. Нужен документ: ${paper}. Сфотографируйте все страницы так, чтобы были видны края, и загрузите в дело. В этот чат файл не присылайте.`;
  }
  if (lang === "ur") {
    return `فائل ${fileId}. یہ کاغذ ابھی چاہیے: ${paper}. ہر صفحے کی تصویر ایسے لیں کہ کنارے نظر آئیں، پھر فائل میں اپ لوڈ کریں۔ صرف اس چیٹ میں نہ بھیجیں۔`;
  }
  if (lang === "cs") {
    return `Spis ${fileId}. Chybí dokument: ${paper}. Vyfoťte všechny stránky tak, aby byly vidět okraje, a nahrajte je do spisu. Do tohoto chatu soubor neposílejte.`;
  }
  return `File ${fileId}. We still need this paper: ${paper}. Photograph every page so the edges show, and upload it in the case. Do not send the file only in this chat.`;
}
