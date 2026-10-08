import { createServerFn } from "@tanstack/react-start";
import { getSql, type Sql } from "@/lib/db";
import { vgMiddleware as authMiddleware } from "./vg-middleware";
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
import { canCancel, citizenshipBlocked, kyivMonth, monthCommission } from "./ops";

type Profile = {
  userId: string;
  email: string;
  fullName: string;
  phone: string;
  role: string;
};

const STAFF = new Set(["ADMIN", "MANAGER"]);
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_DATA = 2_600_000;

function clean(v: unknown, max = 2000): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

async function audit(sql: Sql, actor: string, action: string, target: string, details: string) {
  await sql`insert into audit_log (id, actor_id, action, target, details) values (${newId("AUD")}, ${actor}, ${action}, ${target}, ${details.slice(0, 500)})`;
}

async function ensureSeed(sql: Sql) {
  const flag = await sql<{ value: string }>`select value from settings where key = 'seed_version'`;
  if (flag[0]?.value === "2") return;
  const apps = await sql<{ c: number }>`select count(*)::int as c from applications`;
  if (Number(apps[0]?.c ?? 0) > 0) {
    await sql`insert into settings (key, value) values ('seed_version', '2') on conflict (key) do update set value = '2'`;
    return;
  }
  await sql`delete from partners`;
  await sql`delete from media_items`;
  await sql`delete from team_members`;
  await sql`delete from vacancies`;
  await sql`delete from visa_products`;
  for (const p of VISA_PRODUCTS) {
    await sql`insert into visa_products (id, country, name, duration, description, base_price, currency, production_min_weeks, production_max_weeks, allowed_processing, active)
      values (${p.id}, ${p.country}, ${p.name}, ${p.duration}, ${p.description}, ${p.basePrice}, ${p.currency}, ${p.productionMinWeeks}, ${p.productionMaxWeeks}, ${p.allowedProcessing.join(",")}, ${p.active})`;
  }
  for (const v of buildVacancies()) {
    await sql`insert into vacancies (id, title, country, visa_product_id, employer, salary_net, accommodation, working_hours, description, requirements, quota, active)
      values (${v.id}, ${v.title}, ${v.country}, ${v.visaProductId}, ${v.employer}, ${v.salaryNet}, ${v.accommodation}, ${v.workingHours}, ${v.description}, ${v.requirements}, ${v.quota}, ${v.active})`;
  }
  for (const m of OFFICE) {
    await sql`insert into media_items (id, kind, title, caption, image_data, sort_order, active) values (${m.id}, ${m.kind}, ${m.title}, ${m.caption}, ${m.image}, ${m.sort}, true)`;
  }
  for (const t of TEAM) {
    await sql`insert into team_members (id, full_name, position, phone, photo_data, sort_order, active) values (${t.id}, ${t.name}, ${t.position}, ${t.phone}, ${t.photo ?? ""}, ${t.sort}, true)`;
  }
  for (const p of partnerRows()) {
    await sql`insert into partners (id, country, name, sort_order, active) values (${p.id}, ${p.country}, ${p.name}, ${p.sort}, true)`;
  }
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await sql`insert into settings (key, value) values (${key}, ${value}) on conflict (key) do update set value = ${value}`;
  }
  await sql`insert into settings (key, value) values ('seed_version', '2') on conflict (key) do update set value = '2'`;
}

async function ensurePartnerCatalog(sql: Sql) {
  const flag = await sql<{ value: string }>`select value from settings where key = 'partners_catalog'`;
  if (flag[0]?.value === "5") return;
  const existing = await sql<{ country: string; name: string }>`select country, name from partners`;
  const have = new Set(existing.map((row) => `${row.country}|${row.name}`.toLowerCase()));
  const source = flag[0]?.value === "4" ? legacyRealPartners() : [...partnerRows(), ...legacyRealPartners()];
  for (const row of source) {
    if (have.has(`${row.country}|${row.name}`.toLowerCase())) continue;
    await sql`insert into partners (id, country, name, sort_order, active) values (${row.id}, ${row.country}, ${row.name}, ${row.sort}, true) on conflict (id) do nothing`;
    have.add(`${row.country}|${row.name}`.toLowerCase());
  }
  await sql`insert into settings (key, value) values ('partners_catalog', '5') on conflict (key) do update set value = '5'`;
}

async function ensureEmployerSeats(sql: Sql) {
  const flag = await sql<{ value: string }>`select value from settings where key = 'vacancy_catalog'`;
  if (flag[0]?.value === "3") return;
  const partners = await sql<{ country: string; name: string }>`select country, name from partners where active = true order by country, sort_order`;
  const existing = await sql<{ id: string; country: string; employer: string; title: string; active: boolean }>`select id, country, employer, title, active from vacancies`;
  const seatKey = (country: string, name: string) => `${country.trim()}|${name.trim().toLowerCase().replace(/\s+/g, " ")}`;
  const titles = new Set(existing.map((row) => `${seatKey(row.country, row.employer)}|${row.title.trim().toLowerCase()}`));
  const perEmployer = new Map<string, number>();
  const ids = new Set(existing.map((row) => row.id));
  for (const row of existing) {
    if (!row.active) continue;
    const key = seatKey(row.country, row.employer);
    perEmployer.set(key, (perEmployer.get(key) || 0) + 1);
  }
  let extra = 1;
  for (const vacancy of seatsForPartners(partners)) {
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
    await sql`insert into vacancies (id, title, country, visa_product_id, employer, salary_net, accommodation, working_hours, description, requirements, quota, active)
      values (${id}, ${vacancy.title}, ${vacancy.country}, ${vacancy.visaProductId}, ${vacancy.employer}, ${vacancy.salaryNet}, ${vacancy.accommodation}, ${vacancy.workingHours}, ${vacancy.description}, ${vacancy.requirements}, ${vacancy.quota}, true)
      on conflict (id) do nothing`;
  }
  await sql`insert into settings (key, value) values ('vacancy_catalog', '3') on conflict (key) do update set value = '3'`;
}

async function ensureDirector(sql: Sql) {
  const photo = "/media/team/klara.jpg";
  const rows = await sql<{ id: string; photo: string }>`select id, photo_data as photo from team_members where id = 'TM-1' or full_name = 'Klára Nováková'`;
  if (!rows.length) {
    await sql`insert into team_members (id, full_name, position, phone, photo_data, sort_order, active)
      values ('TM-1', 'Klára Nováková', 'Client director', '+420 770 347 160', ${photo}, 1, true)`;
    return;
  }
  for (const row of rows) {
    if (row.photo) continue;
    await sql`update team_members set photo_data = ${photo} where id = ${row.id}`;
  }
}

async function expireUnpaid(sql: Sql) {
  const late = await sql<{ id: string; vacancyId: string }>`select id, vacancy_id as "vacancyId" from applications
    where status = 'OPEN' and stage = 2 and cancel_deadline_at is not null and cancel_deadline_at < now()
    and not exists (select 1 from documents d where d.application_id = applications.id and d.category = 'PAYMENT_PROOF')`;
  for (const row of late) {
    await sql`update applications set status = 'CANCELLED', updated_at = now() where id = ${row.id}`;
    await sql`update vacancies set quota = quota + 1 where id = ${row.vacancyId}`;
    await audit(sql, "system", "AUTO_CANCEL", row.id, "");
  }
}

async function ctxProfile(sql: Sql, userId: string): Promise<Profile> {
  await ensureSeed(sql);
  const authUser = await sql<{ email: string; name: string }>`select email, name from "user" where id = ${userId}`;
  const email = authUser[0]?.email ?? "";
  const name = authUser[0]?.name ?? "";
  const existing = await sql<Profile>`select user_id as "userId", email, full_name as "fullName", phone, role from profiles where user_id = ${userId}`;
  if (!existing[0]) {
    const admins = await sql<{ c: number }>`select count(*)::int as c from profiles where role = 'ADMIN'`;
    const role = Number(admins[0]?.c ?? 0) === 0 ? "ADMIN" : "CLIENT";
    await sql`insert into profiles (user_id, email, full_name, phone, role) values (${userId}, ${email}, ${name}, '', ${role})`;
  } else if (email && existing[0].email !== email) {
    await sql`update profiles set email = ${email} where user_id = ${userId}`;
  }
  if (email) {
    await sql`update applications set user_id = ${userId} where user_id is null and lower(client_email) = lower(${email})`;
  }
  await expireUnpaid(sql);
  const profile = (
    await sql<Profile>`select user_id as "userId", email, full_name as "fullName", phone, role from profiles where user_id = ${userId}`
  )[0];
  if (!profile) throw new Error("Profile missing");
  return profile;
}

async function requireStaff(sql: Sql, userId: string) {
  const p = await ctxProfile(sql, userId);
  if (!STAFF.has(p.role)) throw new Error("Forbidden");
  return p;
}

async function requireAdmin(sql: Sql, userId: string) {
  const p = await ctxProfile(sql, userId);
  if (p.role !== "ADMIN") throw new Error("Forbidden");
  return p;
}

type ProductRow = {
  id: string;
  country: string;
  name: string;
  duration: string;
  description: string;
  basePrice: number;
  currency: string;
  productionMinWeeks: number;
  productionMaxWeeks: number;
  allowedProcessing: string;
  active: boolean;
};

function mapProduct(r: ProductRow): VisaProduct {
  return {
    id: r.id,
    country: r.country,
    name: r.name,
    duration: r.duration,
    description: r.description,
    basePrice: Number(r.basePrice),
    currency: r.currency,
    productionMinWeeks: Number(r.productionMinWeeks),
    productionMaxWeeks: Number(r.productionMaxWeeks),
    allowedProcessing: r.allowedProcessing.split(",").filter(Boolean) as Processing[],
    active: Boolean(r.active),
  };
}

async function loadProducts(sql: Sql): Promise<VisaProduct[]> {
  const rows = await sql<ProductRow>`select id, country, name, duration, description, base_price as "basePrice", currency,
    production_min_weeks as "productionMinWeeks", production_max_weeks as "productionMaxWeeks",
    allowed_processing as "allowedProcessing", active from visa_products order by country, duration desc`;
  return rows.map(mapProduct);
}

async function loadVacancies(sql: Sql): Promise<Vacancy[]> {
  const rows = await sql<Vacancy>`select id, title, country, visa_product_id as "visaProductId", employer, salary_net as "salaryNet",
    accommodation, working_hours as "workingHours", description, requirements, quota, active,
    coalesce(blocked_citizenships, '') as "blockedCitizenships"
    from vacancies order by country, title`;
  return rows.map((v) => ({ ...v, quota: Number(v.quota), active: Boolean(v.active), blockedCitizenships: v.blockedCitizenships || "" }));
}

export type AppRow = {
  id: string;
  userId: string | null;
  clientEmail: string;
  vacancyId: string;
  visaProductId: string;
  country: string;
  citizenship: string;
  processing: Processing;
  totalCost: number;
  currency: string;
  productionWeeks: number;
  stage: number;
  status: string;
  processStage: string;
  questionnaire: string;
  profileComplete: boolean;
  rejectionReason: string;
  dispatchNote: string;
  stage2At: string | null;
  stage3At: string | null;
  cancelDeadlineAt: string | null;
  docDeadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
  vacancyTitle: string;
  employer: string;
  assignedManagerId: string;
  referrerUserId: string;
  stage4At: string | null;
  clientPhone?: string;
  accountClosed?: boolean;
};

async function loadApp(sql: Sql, id: string): Promise<AppRow | null> {
  const rows = await sql<AppRow>`select a.id, a.user_id as "userId", a.client_email as "clientEmail", a.vacancy_id as "vacancyId",
    a.visa_product_id as "visaProductId", a.country, a.citizenship, a.processing, a.total_cost as "totalCost", a.currency,
    a.production_weeks as "productionWeeks", a.stage, a.status, a.process_stage as "processStage", a.questionnaire,
    a.profile_complete as "profileComplete", a.rejection_reason as "rejectionReason", a.dispatch_note as "dispatchNote",
    a.stage2_at::text as "stage2At", a.stage3_at::text as "stage3At", a.cancel_deadline_at::text as "cancelDeadlineAt",
    a.doc_deadline_at::text as "docDeadlineAt", a.created_at::text as "createdAt", a.updated_at::text as "updatedAt",
    coalesce(v.title, '') as "vacancyTitle", coalesce(v.employer, '') as "employer",
    coalesce(a.assigned_manager_id, '') as "assignedManagerId",
    coalesce(a.referrer_user_id, '') as "referrerUserId",
    a.stage4_at::text as "stage4At"
    from applications a left join vacancies v on v.id = a.vacancy_id where a.id = ${id}`;
  const row = rows[0];
  if (!row) return null;
  const capped = capLegacyProgress(row.createdAt, Number(row.stage), row.processStage);
  return {
    ...row,
    totalCost: Number(row.totalCost),
    productionWeeks: Number(row.productionWeeks),
    stage: capped.stage,
    processStage: capped.processStage,
    profileComplete: Boolean(row.profileComplete),
  };
}

type DocMeta = {
  id: string;
  category: string;
  fileName: string;
  mime: string;
  status: string;
  createdAt: string;
  rejectionReason: string;
};

async function docsFor(sql: Sql, applicationId: string): Promise<DocMeta[]> {
  return sql<DocMeta>`select id, category, file_name as "fileName", mime, status, created_at::text as "createdAt",
    coalesce(rejection_reason, '') as "rejectionReason"
    from documents where application_id = ${applicationId} order by created_at`;
}

async function messagesFor(sql: Sql, applicationId: string) {
  return sql<{ id: string; authorRole: string; body: string; createdAt: string }>`select id, author_role as "authorRole", body, created_at::text as "createdAt"
    from messages where application_id = ${applicationId} order by created_at`;
}

function settingMap(rows: { key: string; value: string }[]): Record<string, string> {
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export const getPublicSite = createServerFn({ method: "GET" }).handler(async () => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.publicSite();
    }
  const sql = await getSql();
  await ensureSeed(sql);
  await ensureDirector(sql);
  try {
    await ensurePartnerCatalog(sql);
  } catch (err) {
    console.error("[partners]", err);
  }
  try {
    await ensureEmployerSeats(sql);
  } catch (err) {
    console.error("[vacancies]", err);
  }
  await expireUnpaid(sql);
  const settingsRows = await sql<{ key: string; value: string }>`select key, value from settings`;
  const products = await loadProducts(sql);
  const vacancies = await loadVacancies(sql);
  const team = await sql<{
    id: string;
    fullName: string;
    position: string;
    phone: string;
    photoData: string;
    sortOrder: number;
    active: boolean;
  }>`select id, full_name as "fullName", position, phone, photo_data as "photoData", sort_order as "sortOrder", active
    from team_members where active = true order by sort_order, full_name`;
  const media = await sql<{
    id: string;
    kind: string;
    title: string;
    caption: string;
    imageData: string;
    sortOrder: number;
    country: string;
    vacancyId: string;
    startsAt: string;
    endsAt: string;
    cover: boolean;
  }>`select id, kind, title, caption, image_data as "imageData", sort_order as "sortOrder",
    country, vacancy_id as "vacancyId", starts_at as "startsAt", ends_at as "endsAt", cover
    from media_items where active = true order by sort_order`;
  const partners = await sql<{ id: string; country: string; name: string; sortOrder: number }>`select id, country, name, sort_order as "sortOrder" from partners where active = true order by country, sort_order`;
  const counts = await sql<{ filed: number; issued: number }>`select count(*)::int as filed,
    coalesce(sum(case when status = 'ISSUED' then 1 else 0 end), 0)::int as issued from applications`;
  return {
    settings: toPublicSettings(settingMap(settingsRows)),
    products,
    vacancies,
    team,
    media: media.map((item) => ({ ...item, active: true, cover: Boolean(item.cover) })),
    partners,
    counts: { filed: Number(counts[0]?.filed ?? 0), issued: Number(counts[0]?.issued ?? 0) },
  };
});

export const listPublicFilings = createServerFn({ method: "GET" }).handler(async () => {
  if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
    const mod = await import("./sheet-backend");
    return mod.listPublicFilings();
  }
  const sql = await getSql();
  await ensureSeed(sql);
  const rows = await sql<{ id: string; citizenship: string; country: string; status: string; stage: number; createdAt: string }>`
    select id, citizenship, country, status, stage, created_at::text as "createdAt" from applications order by created_at desc`;
  return rows.map((row) => ({
    id: row.id,
    citizenship: row.citizenship || "",
    country: row.country || "",
    createdAt: row.createdAt || "",
    status: row.status || "OPEN",
    stage: Number(row.stage) || 1,
  }));
});

export const takeInvoiceNumber = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.takeInvoiceNumber(context.userId);
    }
    const sql = await getSql();
    const profile = await ctxProfile(sql, context.userId);
    const staff = STAFF.has(profile.role);
    if (!staff) {
      const open = await sql<{ id: string }>`select id from applications where user_id = ${context.userId} and status = 'OPEN' and stage >= 2 limit 1`;
      if (!open[0]) throw new Error("Locked");
    }
    if (limited(`invoice:${context.userId}`, 12, 60 * 60 * 1000)) throw new Error("Locked");
    const rows = await sql<{ value: string }>`select value from settings where key = 'invoice_seq'`;
    const next = (Number(rows[0]?.value) || 1000) + 1;
    await sql`insert into settings (key, value) values ('invoice_seq', ${String(next)}) on conflict (key) do update set value = ${String(next)}`;
    return { number: `INV-${next}` };
  });

export const joinWaitlist = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { vacancyId: string; citizenship: string }) => ({
    vacancyId: clean(input?.vacancyId, 40),
    citizenship: clean(input?.citizenship, 80),
  }))
  .handler(async ({ context, data }) => {
    if (!data.vacancyId) throw new Error("Opening");
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.joinWaitlist(context.userId, data);
    }
    const sql = await getSql();
    await audit(sql, context.userId, "WAITLIST", data.vacancyId, data.citizenship);
    return { ok: true };
  });

export const listAgentBook = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).agentBook(context.userId);
    const sql = await getSql();
    const person = await ctxProfile(sql, context.userId);
    if (person.role !== "SUBAGENT") throw new Error("Forbidden");
    const rateRow = await sql<{ value: string }>`select value from settings where key = 'subagent_rate'`;
    const rate = Number(rateRow[0]?.value) || 10;
    const rows = await sql<AppRow>`select a.id, a.user_id as "userId", a.client_email as "clientEmail", a.vacancy_id as "vacancyId",
      a.visa_product_id as "visaProductId", a.country, a.citizenship, a.processing, a.total_cost as "totalCost", a.currency,
      a.production_weeks as "productionWeeks", a.stage, a.status, a.process_stage as "processStage", a.questionnaire,
      a.profile_complete as "profileComplete", a.rejection_reason as "rejectionReason", a.dispatch_note as "dispatchNote",
      a.stage2_at::text as "stage2At", a.stage3_at::text as "stage3At", a.cancel_deadline_at::text as "cancelDeadlineAt",
      a.doc_deadline_at::text as "docDeadlineAt", a.created_at::text as "createdAt", a.updated_at::text as "updatedAt",
      coalesce(v.title, '') as "vacancyTitle", coalesce(v.employer, '') as "employer",
      coalesce(a.assigned_manager_id, '') as "assignedManagerId",
      coalesce(a.referrer_user_id, '') as "referrerUserId",
      a.stage4_at::text as "stage4At"
      from applications a left join vacancies v on v.id = a.vacancy_id
      where a.referrer_user_id = ${context.userId} order by a.created_at desc`;
    const cases = rows.map((row) => ({
      ...row,
      totalCost: Number(row.totalCost),
      stage: Number(row.stage),
      productionWeeks: Number(row.productionWeeks),
      profileComplete: Boolean(row.profileComplete),
    }));
    return {
      code: person.userId,
      locked: true,
      email: person.email,
      rate,
      month: kyivMonth(),
      commission: monthCommission(cases, rate),
      cases: cases.map((app) => ({
        id: app.id,
        country: app.country,
        status: app.status,
        stage: app.stage,
        total: Number(app.totalCost),
        createdAt: app.createdAt,
        pay: app.stage >= 3 ? "paid" : app.stage >= 2 ? "due" : "wait",
        commission: app.stage < 2 ? "wait" : "due",
      })),
    };
  });

export const getSessionProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.sessionProfile(context.userId);
    }
    const sql = await getSql();
    return ctxProfile(sql, context.userId);
  });

export const listMyApplications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.listMine(context.userId);
    }
    const sql = await getSql();
    await ctxProfile(sql, context.userId);
    const rows = await sql<AppRow>`select a.id, a.user_id as "userId", a.client_email as "clientEmail", a.vacancy_id as "vacancyId",
      a.visa_product_id as "visaProductId", a.country, a.citizenship, a.processing, a.total_cost as "totalCost", a.currency,
      a.production_weeks as "productionWeeks", a.stage, a.status, a.process_stage as "processStage", a.questionnaire,
      a.profile_complete as "profileComplete", a.rejection_reason as "rejectionReason", a.dispatch_note as "dispatchNote",
      a.stage2_at::text as "stage2At", a.stage3_at::text as "stage3At", a.cancel_deadline_at::text as "cancelDeadlineAt",
      a.doc_deadline_at::text as "docDeadlineAt", a.created_at::text as "createdAt", a.updated_at::text as "updatedAt",
      coalesce(v.title, '') as "vacancyTitle", coalesce(v.employer, '') as "employer",
      coalesce(a.assigned_manager_id, '') as "assignedManagerId",
      coalesce(a.referrer_user_id, '') as "referrerUserId",
      a.stage4_at::text as "stage4At"
      from applications a left join vacancies v on v.id = a.vacancy_id
      where a.user_id = ${context.userId} order by a.created_at desc`;
    return rows.map((r) => {
      const capped = capLegacyProgress(r.createdAt, Number(r.stage), r.processStage);
      return {
        ...r,
        totalCost: Number(r.totalCost),
        stage: capped.stage,
        processStage: capped.processStage,
        productionWeeks: Number(r.productionWeeks),
        profileComplete: Boolean(r.profileComplete),
      };
    });
  });

export const getMyApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.getMine(context.userId, id);
    }
    const sql = await getSql();
    await ctxProfile(sql, context.userId);
    const app = await loadApp(sql, id);
    if (!app || app.userId !== context.userId) throw new Error("Not found");
    const documents = await docsFor(sql, id);
    const messages = await messagesFor(sql, id);
    let wallet = "";
    let network = "";
    if (app.status === "OPEN" && app.stage >= 2) {
      const rows = await sql<{ key: string; value: string }>`select key, value from settings where key in ('usdt_wallet', 'usdt_network')`;
      const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));
      wallet = (map.usdt_wallet || "").trim();
      network = map.usdt_network || "TRC-20 (TRON)";
    }
    return { app, documents, messages, wallet, network };
  });

type CreateInput = { vacancyId: string; citizenship: string; processing: Processing; agentCode?: string; lang?: string };

async function resolveReferrer(sql: Sql, code: string): Promise<string> {
  const trimmed = code.trim();
  if (!trimmed) return "";
  const rows = await sql<{ userId: string; role: string }>`select user_id as "userId", role from profiles
    where user_id = ${trimmed} or lower(email) = ${trimmed.toLowerCase()} limit 1`;
  if (!rows[0] || rows[0].role !== "SUBAGENT") return "";
  return rows[0].userId;
}

export const noteFunnel = createServerFn({ method: "POST" })
  .validator((input: { kind?: string }) => ({
    kind: input?.kind === "apply" || input?.kind === "question" ? input.kind : ("calc" as const),
  }))
  .handler(async ({ data }) => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const ip = getRequest()?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (limited(`funnel:${ip.slice(0, 80)}`, 30, 60_000)) return { ok: true };
    if (!(process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim())) return { ok: true };
    const mod = await import("./sheet-backend");
    const kind = data.kind === "apply" || data.kind === "question" ? data.kind : "calc";
    return mod.noteFunnel(kind);
  });

export const createApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: CreateInput) => ({
    vacancyId: clean(input?.vacancyId, 40),
    citizenship: clean(input?.citizenship, 80),
    processing: input?.processing,
    agentCode: clean(input?.agentCode, 120),
    lang: clean(input?.lang, 8),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.createApp(context.userId, data);
    }
    const sql = await getSql();
    const profile = await ctxProfile(sql, context.userId);
    if (data.processing !== "STANDARD" && data.processing !== "PRIORITY" && data.processing !== "EXPRESS") {
      throw new Error("Pace");
    }
    const vacancies = await loadVacancies(sql);
    const products = await loadProducts(sql);
    const vacancy = vacancies.find((v) => v.id === data.vacancyId && v.active);
    if (!vacancy || vacancy.quota < 1) throw new Error("Opening unavailable");
    const product = products.find((p) => p.id === vacancy.visaProductId && p.active);
    if (!product) throw new Error("Permit unavailable");
    if (!product.allowedProcessing.includes(data.processing)) throw new Error("Pace");
    if (!data.citizenship || sameCountry(data.citizenship, product.country)) throw new Error("Citizenship");
    if (citizenshipBlocked(vacancy.blockedCitizenships, data.citizenship)) throw new Error("Citizenship");
    const dup = await sql<{ id: string }>`select id from applications where user_id = ${context.userId} and vacancy_id = ${vacancy.id} and status = 'OPEN' limit 1`;
    if (dup[0]) {
      if (data.agentCode) {
        const linked = await resolveReferrer(sql, data.agentCode);
        if (linked) {
          await sql`update applications set referrer_user_id = ${linked}, updated_at = now()
            where id = ${dup[0].id} and (referrer_user_id is null or referrer_user_id = '')`;
        }
      }
      return { id: dup[0].id };
    }
    const referrerUserId = await resolveReferrer(sql, data.agentCode || "");
    const id = newId("VG");
    const total = priceFor(product.basePrice, data.processing);
    const weeks = productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, data.processing);
    const q: Questionnaire = { ...parseQuestionnaire("{}"), citizenship: data.citizenship };
    await sql`insert into applications (id, user_id, client_email, vacancy_id, visa_product_id, country, citizenship, processing, total_cost, currency, production_weeks, stage, status, questionnaire, referrer_user_id)
      values (${id}, ${context.userId}, ${profile.email}, ${vacancy.id}, ${product.id}, ${product.country}, ${data.citizenship}, ${data.processing}, ${total}, 'EUR', ${weeks}, 1, 'OPEN', ${JSON.stringify(q)}, ${referrerUserId})`;
    await sql`update vacancies set quota = quota - 1 where id = ${vacancy.id} and quota > 0`;
    await audit(sql, context.userId, "APPLICATION_OPENED", id, vacancy.title);
    return { id };
  });

export const saveQuestionnaire = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; questionnaire: Questionnaire }) => ({
    id: clean(input?.id, 40),
    questionnaire: input?.questionnaire,
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.saveQuestionnaire(context.userId, data);
    }
    const sql = await getSql();
    await ctxProfile(sql, context.userId);
    const app = await loadApp(sql, data.id);
    if (!app || app.userId !== context.userId) throw new Error("Not found");
    if (app.stage !== 1 || app.status !== "OPEN") throw new Error("Locked");
    const q = { ...parseQuestionnaire("{}"), ...data.questionnaire };
    const err = questionnaireError(q);
    if (err) return { ok: false as const, error: err };
    await sql`update applications set questionnaire = ${JSON.stringify(q)}, profile_complete = true, citizenship = ${q.citizenship}, updated_at = now() where id = ${app.id}`;
    await audit(sql, context.userId, "QUESTIONNAIRE", app.id, clientName(q));
    return { ok: true as const };
  });

type UploadInput = { applicationId: string; category: DocCategory; fileName: string; mime: string; data: string };

export const uploadMyDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: UploadInput) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.uploadDoc(context.userId, data);
    }
    const sql = await getSql();
    await ctxProfile(sql, context.userId);
    const app = await loadApp(sql, clean(data?.applicationId, 40));
    if (!app || app.userId !== context.userId) throw new Error("Not found");
    if (app.status !== "OPEN" || app.stage < 2) throw new Error("Locked");
    const category = data.category;
    if (!DOC_CATEGORIES.includes(category) || category === "FINAL") throw new Error("Category");
    if (category === "PAYMENT_PROOF" && app.stage !== 2) throw new Error("Locked");
    const mime = normalizeUploadMime(data.mime, data.fileName);
    if (!ALLOWED_MIME.has(mime)) throw new Error("File type");
    if (!data.data?.startsWith("data:") || data.data.length > MAX_DATA) throw new Error(data.data?.length > MAX_DATA ? "File size" : "File type");
    const id = newId("DOC");
    await sql`insert into documents (id, application_id, user_id, category, file_name, mime, data, status)
      values (${id}, ${app.id}, ${context.userId}, ${category}, ${clean(data.fileName, 180)}, ${mime}, ${data.data}, 'UPLOADED')`;
    await audit(sql, context.userId, "UPLOAD", app.id, category);
    return { id };
  });

export const postMessage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { applicationId: string; body: string }) => ({
    applicationId: clean(input?.applicationId, 40),
    body: clean(input?.body, 2000),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.postMessage(context.userId, data); return;
    }
    const sql = await getSql();
    const profile = await ctxProfile(sql, context.userId);
    if (!data.body) return;
    const app = await loadApp(sql, data.applicationId);
    if (!app) throw new Error("Not found");
    const staff = STAFF.has(profile.role);
    if (!staff && app.userId !== context.userId) throw new Error("Forbidden");
    await sql`insert into messages (id, application_id, author_id, author_role, body) values (${newId("MSG")}, ${app.id}, ${context.userId}, ${profile.role}, ${data.body})`;
  });

export const downloadDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.downloadDoc(context.userId, id);
    }
    const sql = await getSql();
    const profile = await ctxProfile(sql, context.userId);
    const rows = await sql<{
      applicationId: string;
      fileName: string;
      mime: string;
      data: string;
      category: string;
    }>`select application_id as "applicationId", file_name as "fileName", mime, data, category from documents where id = ${id}`;
    const doc = rows[0];
    if (!doc) throw new Error("Not found");
    const app = await loadApp(sql, doc.applicationId);
    if (!app) throw new Error("Not found");
    const staff = STAFF.has(profile.role);
    if (!staff && app.userId !== context.userId) throw new Error("Forbidden");
    return doc;
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminOverview(context.userId);
    }
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const waiting = await sql<{ c: number }>`select count(*)::int as c from applications where status = 'OPEN' and stage = 1 and profile_complete = true`;
    const proofs = await sql<{ c: number }>`select count(*)::int as c from applications a where a.status = 'OPEN' and a.stage = 2
      and exists (select 1 from documents d where d.application_id = a.id and d.category = 'PAYMENT_PROOF' and d.status = 'UPLOADED')`;
    const live = await sql<{ c: number }>`select count(*)::int as c from applications where status = 'OPEN'`;
    const users = await sql<{ userId: string; email: string; fullName: string; phone: string; role: string }>`select user_id as "userId", email, full_name as "fullName", phone, role from profiles order by email`;
    return {
      role: profile.role,
      userId: profile.userId,
      waiting: Number(waiting[0]?.c ?? 0),
      proofs: Number(proofs[0]?.c ?? 0),
      live: Number(live[0]?.c ?? 0),
      users,
    };
  });

export const adminListApplications = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { includeIncomplete?: boolean }) => ({
    includeIncomplete: Boolean(input?.includeIncomplete),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminList(context.userId, data.includeIncomplete);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const rows = await sql<AppRow>`select a.id, a.user_id as "userId", a.client_email as "clientEmail", a.vacancy_id as "vacancyId",
      a.visa_product_id as "visaProductId", a.country, a.citizenship, a.processing, a.total_cost as "totalCost", a.currency,
      a.production_weeks as "productionWeeks", a.stage, a.status, a.process_stage as "processStage", a.questionnaire,
      a.profile_complete as "profileComplete", a.rejection_reason as "rejectionReason", a.dispatch_note as "dispatchNote",
      a.stage2_at::text as "stage2At", a.stage3_at::text as "stage3At", a.cancel_deadline_at::text as "cancelDeadlineAt",
      a.doc_deadline_at::text as "docDeadlineAt", a.created_at::text as "createdAt", a.updated_at::text as "updatedAt",
      coalesce(v.title, '') as "vacancyTitle", coalesce(v.employer, '') as "employer",
      coalesce(a.assigned_manager_id, '') as "assignedManagerId",
      coalesce(a.referrer_user_id, '') as "referrerUserId",
      a.stage4_at::text as "stage4At"
      from applications a left join vacancies v on v.id = a.vacancy_id
      order by a.created_at desc`;
    return rows
      .map((r) => {
        const capped = capLegacyProgress(r.createdAt, Number(r.stage), r.processStage);
        return {
          ...r,
          totalCost: Number(r.totalCost),
          stage: capped.stage,
          processStage: capped.processStage,
          productionWeeks: Number(r.productionWeeks),
          profileComplete: Boolean(r.profileComplete),
        };
      })
      .filter((r) => data.includeIncomplete || r.profileComplete || r.stage > 1);
  });

export const adminGetApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminGet(context.userId, id);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const app = await loadApp(sql, id);
    if (!app) throw new Error("Not found");
    return { app, documents: await docsFor(sql, id), messages: await messagesFor(sql, id) };
  });

export const adminSetStage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; action: string; reason?: string }) => ({
    id: clean(input?.id, 40),
    action: clean(input?.action, 40),
    reason: clean(input?.reason, 500),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminSetStage(context.userId, data);
    }
    const sql = await getSql();
    const profile = await requireStaff(sql, context.userId);
    const app = await loadApp(sql, data.id);
    if (!app) throw new Error("Not found");
    if (data.action === "accept") {
      if (app.stage !== 1 || app.status !== "OPEN" || !app.profileComplete) throw new Error("Not ready");
      await sql`update applications set stage = 2, stage2_at = now(), cancel_deadline_at = now() + interval '5 days', updated_at = now() where id = ${app.id}`;
    } else if (data.action === "reject") {
      if (app.status === "OPEN") await sql`update vacancies set quota = quota + 1 where id = ${app.vacancyId}`;
      await sql`update applications set status = 'REJECTED', rejection_reason = ${data.reason}, updated_at = now() where id = ${app.id}`;
    } else if (data.action === "cancel") {
      if (app.status === "OPEN") await sql`update vacancies set quota = quota + 1 where id = ${app.vacancyId}`;
      await sql`update applications set status = 'CANCELLED', updated_at = now() where id = ${app.id}`;
    } else if (data.action === "confirm-payment") {
      if (app.stage !== 2 || app.status !== "OPEN") throw new Error("Not ready");
      await sql`update documents set status = 'APPROVED' where application_id = ${app.id} and category = 'PAYMENT_PROOF'`;
      await sql`update applications set stage = 3, stage3_at = now(), doc_deadline_at = now() + (${Math.max(1, Number(app.productionWeeks) || 8) * 7} * interval '1 day'),
        process_stage = 'IN_PROCESS', updated_at = now() where id = ${app.id}`;
      await audit(sql, profile.userId, data.action, app.id, data.reason);
      return { ok: true as const, stage: 3 };
    } else if (data.action === "stage4") {
      if (app.stage !== 3 || app.status !== "OPEN") throw new Error("Not ready");
      if (openedBeforeInvoice2Rule(app.createdAt)) throw new Error("Legacy");
      await sql`update applications set stage = 4, stage4_at = now(), updated_at = now() where id = ${app.id}`;
      await audit(sql, profile.userId, data.action, app.id, data.reason);
      return { ok: true as const, stage: 4 };
    } else {
      throw new Error("Action");
    }
    await audit(sql, profile.userId, data.action, app.id, data.reason);
    return { ok: true as const, stage: data.action === "accept" ? 2 : app.stage };
  });

export const adminSetProcess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; processStage: string }) => ({
    id: clean(input?.id, 40),
    processStage: clean(input?.processStage, 60),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminSetProcess(context.userId, data); return;
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    if (!PROCESS_STAGES.includes(data.processStage as ProcessStage)) throw new Error("Stage");
    const app = await loadApp(sql, data.id);
    if (!app || app.stage < 3 || app.status !== "OPEN") throw new Error("Locked");
    if (openedBeforeInvoice2Rule(app.createdAt) && stageIndex(data.processStage as ProcessStage) > stageIndex(INVOICE2_STAGE)) throw new Error("Legacy");
    await sql`update applications set process_stage = ${data.processStage}, updated_at = now() where id = ${app.id}`;
    await audit(sql, context.userId, "PROCESS", app.id, data.processStage);
  });

export const adminSaveDispatch = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; note: string }) => ({
    id: clean(input?.id, 40),
    note: clean(input?.note, 2000),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminSaveDispatch(context.userId, data); return;
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    await sql`update applications set dispatch_note = ${data.note}, updated_at = now() where id = ${data.id}`;
    await audit(sql, context.userId, "DISPATCH", data.id, "");
  });

export const adminUploadFinal = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: UploadInput) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminUploadFinal(context.userId, data);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const app = await loadApp(sql, clean(data.applicationId, 40));
    if (!app || app.processStage !== "FINAL_LEGAL_SERVICE" || app.stage < 3) throw new Error("Locked");
    if (!ALLOWED_MIME.has(data.mime) || !data.data?.startsWith("data:") || data.data.length > MAX_DATA) {
      throw new Error("File");
    }
    const id = newId("DOC");
    await sql`insert into documents (id, application_id, user_id, category, file_name, mime, data, status)
      values (${id}, ${app.id}, ${context.userId}, 'FINAL', ${clean(data.fileName, 180)}, ${data.mime}, ${data.data}, 'APPROVED')`;
    await audit(sql, context.userId, "FINAL_UPLOAD", app.id, data.fileName);
    return { id };
  });

export const adminUploadProof = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { applicationId: string; fileName: string; mime: string; data: string }) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminUploadProof(context.userId, data);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const app = await loadApp(sql, clean(data.applicationId, 40));
    if (!app || app.stage !== 2 || app.status !== "OPEN") throw new Error("Locked");
    const mime = normalizeUploadMime(data.mime, data.fileName);
    if (!ALLOWED_MIME.has(mime) || !data.data?.startsWith("data:") || data.data.length > MAX_DATA) throw new Error("File");
    const id = newId("DOC");
    await sql`insert into documents (id, application_id, user_id, category, file_name, mime, data, status)
      values (${id}, ${app.id}, ${context.userId}, 'PAYMENT_PROOF', ${clean(data.fileName, 180)}, ${mime}, ${data.data}, 'UPLOADED')`;
    await audit(sql, context.userId, "PAYMENT_PROOF", app.id, data.fileName);
    return { id };
  });

export const adminCreateApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string; vacancyId: string; citizenship: string; processing: Processing }) => ({
    email: clean(input?.email, 180).toLowerCase(),
    vacancyId: clean(input?.vacancyId, 40),
    citizenship: clean(input?.citizenship, 80),
    processing: input?.processing,
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminCreateApplication(context.userId, data);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    if (!data.email.includes("@")) throw new Error("Email");
    if (data.processing !== "STANDARD" && data.processing !== "PRIORITY" && data.processing !== "EXPRESS") throw new Error("Pace");
    const vacancies = await loadVacancies(sql);
    const products = await loadProducts(sql);
    const vacancy = vacancies.find((v) => v.id === data.vacancyId);
    const product = products.find((p) => p.id === vacancy?.visaProductId);
    if (!vacancy || !product) throw new Error("Opening");
    if (vacancy.quota < 1) throw new Error("Opening unavailable");
    if (!product.allowedProcessing.includes(data.processing)) throw new Error("Pace");
    if (citizenshipBlocked(vacancy.blockedCitizenships, data.citizenship)) throw new Error("Citizenship");
    const user = await sql<{ id: string }>`select id from "user" where lower(email) = ${data.email} limit 1`;
    if (user[0]?.id) {
      const dup = await sql<{ id: string }>`select id from applications where user_id = ${user[0].id} and vacancy_id = ${vacancy.id} and status = 'OPEN' limit 1`;
      if (dup[0]) return { id: dup[0].id };
    }
    const id = newId("VG");
    const total = priceFor(product.basePrice, data.processing);
    const weeks = productionWeeks(product.productionMinWeeks, product.productionMaxWeeks, data.processing);
    await sql`insert into applications (id, user_id, client_email, vacancy_id, visa_product_id, country, citizenship, processing, total_cost, currency, production_weeks, stage, status, questionnaire)
      values (${id}, ${user[0]?.id ?? null}, ${data.email}, ${vacancy.id}, ${product.id}, ${product.country}, ${data.citizenship}, ${data.processing}, ${total}, 'EUR', ${weeks}, 1, 'OPEN', ${JSON.stringify({ ...parseQuestionnaire("{}"), citizenship: data.citizenship })})`;
    await sql`update vacancies set quota = quota - 1 where id = ${vacancy.id} and quota > 0`;
    await audit(sql, context.userId, "APPLICATION_CREATED", id, data.email);
    return { id };
  });

export const adminSaveVacancy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Vacancy) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminSaveVacancy(context.userId, data);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const id = clean(data.id, 40) || newId("VAC");
    const title = clean(data.title, 160);
    if (!title) throw new Error("Title");
    const existing = await sql<{ id: string }>`select id from vacancies where id = ${id}`;
    if (existing[0]) {
      await sql`update vacancies set title = ${title}, country = ${clean(data.country, 80)}, visa_product_id = ${clean(data.visaProductId, 40)},
        employer = ${clean(data.employer, 160)}, salary_net = ${clean(data.salaryNet, 160)}, accommodation = ${clean(data.accommodation, 300)},
        working_hours = ${clean(data.workingHours, 200)}, description = ${clean(data.description, 2000)}, requirements = ${clean(data.requirements, 2000)},
        quota = ${Math.max(0, Number(data.quota) || 0)}, active = ${Boolean(data.active)},
        blocked_citizenships = ${clean(data.blockedCitizenships || "", 300)} where id = ${id}`;
    } else {
      await sql`insert into vacancies (id, title, country, visa_product_id, employer, salary_net, accommodation, working_hours, description, requirements, quota, active, blocked_citizenships)
        values (${id}, ${title}, ${clean(data.country, 80)}, ${clean(data.visaProductId, 40)}, ${clean(data.employer, 160)}, ${clean(data.salaryNet, 160)},
        ${clean(data.accommodation, 300)}, ${clean(data.workingHours, 200)}, ${clean(data.description, 2000)}, ${clean(data.requirements, 2000)},
        ${Math.max(0, Number(data.quota) || 0)}, ${Boolean(data.active)}, ${clean(data.blockedCitizenships || "", 300)})`;
    }
    await audit(sql, context.userId, "VACANCY", id, title);
    return { id };
  });

export const adminDeleteVacancy = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminDeleteVacancy(context.userId, id); return;
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    await sql`update vacancies set active = false where id = ${id}`;
    await audit(sql, context.userId, "VACANCY_ARCHIVE", id, "");
  });

export const adminSaveTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: { id?: string; fullName: string; position: string; phone: string; photoData: string; active: boolean }) =>
      input,
  )
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminSaveTeam(context.userId, data);
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const id = clean(data.id, 40) || newId("TM");
    const name = clean(data.fullName, 120);
    if (!name) throw new Error("Name");
    const photo = data.photoData?.startsWith("data:") && data.photoData.length < MAX_DATA ? data.photoData : "";
    const existing = await sql<{ id: string }>`select id from team_members where id = ${id}`;
    if (existing[0]) {
      if (photo) {
        await sql`update team_members set full_name = ${name}, position = ${clean(data.position, 120)}, phone = ${clean(data.phone, 40)},
          photo_data = ${photo}, active = ${Boolean(data.active)} where id = ${id}`;
      } else {
        await sql`update team_members set full_name = ${name}, position = ${clean(data.position, 120)}, phone = ${clean(data.phone, 40)},
          active = ${Boolean(data.active)} where id = ${id}`;
      }
    } else {
      await sql`insert into team_members (id, full_name, position, phone, photo_data, sort_order, active)
        values (${id}, ${name}, ${clean(data.position, 120)}, ${clean(data.phone, 40)}, ${photo}, 9, ${data.active !== false})`;
    }
    await audit(sql, context.userId, "TEAM", id, name);
    return { id };
  });

export const adminDeleteTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminDeleteTeam(context.userId, id); return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await sql`delete from team_members where id = ${id}`;
    await audit(sql, context.userId, "TEAM_DELETE", id, "");
  });

export const adminGetSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminGetSettings(context.userId);
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const rows = await sql<{ key: string; value: string }>`select key, value from settings`;
    return toStaffSettings(settingMap(rows));
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Record<string, string>) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminSaveSettings(context.userId, data); return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const allowed = new Set(Object.keys(DEFAULT_SETTINGS));
    for (const [key, value] of Object.entries(data ?? {})) {
      if (!allowed.has(key) || typeof value !== "string") continue;
      await sql`insert into settings (key, value, updated_at) values (${key}, ${value.slice(0, 8000)}, now())
        on conflict (key) do update set value = ${value.slice(0, 8000)}, updated_at = now()`;
    }
    await audit(sql, context.userId, "SETTINGS", "site", Object.keys(data ?? {}).join(","));
  });

export const adminSaveProduct = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: VisaProduct) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminSaveProduct(context.userId, data); return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const lanes = (data.allowedProcessing ?? []).filter((p) => p === "STANDARD" || p === "PRIORITY" || p === "EXPRESS");
    if (!lanes.includes("STANDARD")) lanes.unshift("STANDARD");
    await sql`update visa_products set base_price = ${Math.max(0, Math.round(Number(data.basePrice) || 0))},
      production_min_weeks = ${Math.max(1, Number(data.productionMinWeeks) || 1)},
      production_max_weeks = ${Math.max(1, Number(data.productionMaxWeeks) || 1)},
      allowed_processing = ${lanes.join(",")}, active = ${Boolean(data.active)}, description = ${clean(data.description, 1000)}
      where id = ${clean(data.id, 40)}`;
    await audit(sql, context.userId, "PRICING", data.id, String(data.basePrice));
  });

export const adminSaveMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: {
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
  }) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminSaveMedia(context.userId, data);
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const kinds = new Set(["office", "license", "country", "vacancy", "logo", "banner"]);
    const kind = kinds.has(data.kind) ? data.kind : "office";
    const id = clean(data.id, 40) || newId("MED");
    const existing = await sql<{
      id: string;
      title: string;
      caption: string;
      active: boolean;
      cover: boolean;
      sortOrder: number;
      country: string;
      vacancyId: string;
      startsAt: string;
      endsAt: string;
    }>`select id, title, caption, active, cover, sort_order as "sortOrder", country, vacancy_id as "vacancyId", starts_at as "startsAt", ends_at as "endsAt" from media_items where id = ${id}`;
    const prev = existing[0];
    if (data.imageData && (!data.imageData.startsWith("data:") || data.imageData.length > MAX_DATA)) throw new Error("File");
    if (!prev && !data.imageData) throw new Error("File");
    const title = clean(data.title, 120) || prev?.title || kind;
    const caption = data.caption === undefined ? prev?.caption || "" : clean(data.caption, 300);
    const country = data.country === undefined ? prev?.country || "" : clean(data.country, 80);
    const vacancyId = data.vacancyId === undefined ? prev?.vacancyId || "" : clean(data.vacancyId, 40);
    const startsAt = data.startsAt === undefined ? prev?.startsAt || "" : clean(data.startsAt, 20);
    const endsAt = data.endsAt === undefined ? prev?.endsAt || "" : clean(data.endsAt, 20);
    const active = data.active === undefined ? (prev ? Boolean(prev.active) : true) : Boolean(data.active);
    const cover = data.cover === undefined ? Boolean(prev?.cover) : Boolean(data.cover);
    const sortOrder = data.sortOrder === undefined ? Number(prev?.sortOrder ?? 5) : Number(data.sortOrder) || 0;
    if (kind === "vacancy" && vacancyId && active && !prev?.active) {
      const live = await sql<{ c: number }>`select count(*)::int as c from media_items where kind = 'vacancy' and vacancy_id = ${vacancyId} and active = true and id <> ${id}`;
      if (Number(live[0]?.c ?? 0) >= 3) throw new Error("Three");
    }
    if (cover && kind === "license") await sql`update media_items set cover = false where kind = 'license' and id <> ${id}`;
    if (cover && kind === "vacancy" && vacancyId) await sql`update media_items set cover = false where kind = 'vacancy' and vacancy_id = ${vacancyId} and id <> ${id}`;
    if (prev) {
      if (data.imageData) {
        await sql`update media_items set kind = ${kind}, title = ${title}, caption = ${caption}, image_data = ${data.imageData},
          country = ${country}, vacancy_id = ${vacancyId}, starts_at = ${startsAt}, ends_at = ${endsAt},
          cover = ${cover}, sort_order = ${sortOrder}, active = ${active} where id = ${id}`;
      } else {
        await sql`update media_items set kind = ${kind}, title = ${title}, caption = ${caption},
          country = ${country}, vacancy_id = ${vacancyId}, starts_at = ${startsAt}, ends_at = ${endsAt},
          cover = ${cover}, sort_order = ${sortOrder}, active = ${active} where id = ${id}`;
      }
    } else {
      await sql`insert into media_items (id, kind, title, caption, image_data, sort_order, active, country, vacancy_id, starts_at, ends_at, cover)
        values (${id}, ${kind}, ${title}, ${caption}, ${data.imageData ?? ""}, ${sortOrder}, ${active}, ${country}, ${vacancyId}, ${startsAt}, ${endsAt}, ${cover})`;
    }
    await audit(sql, context.userId, "MEDIA", id, kind);
    return { id };
  });

export const adminDeleteMedia = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminDeleteMedia(context.userId, id); return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await sql`update media_items set active = false where id = ${id}`;
    await audit(sql, context.userId, "MEDIA_DELETE", id, "");
  });

export const adminListMedia = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminListMedia(context.userId);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const rows = await sql<{
      id: string;
      kind: string;
      title: string;
      caption: string;
      imageData: string;
      sortOrder: number;
      active: boolean;
      country: string;
      vacancyId: string;
      startsAt: string;
      endsAt: string;
      cover: boolean;
    }>`select id, kind, title, caption, image_data as "imageData", sort_order as "sortOrder", active,
      country, vacancy_id as "vacancyId", starts_at as "startsAt", ends_at as "endsAt", cover
      from media_items order by sort_order, title`;
    return rows.map((row) => ({ ...row, active: Boolean(row.active), cover: Boolean(row.cover), sortOrder: Number(row.sortOrder) || 0 }));
  });

export const adminSavePartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id?: string; country: string; name: string }) => input)
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminSavePartner(context.userId, data);
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    const name = clean(data.name, 160);
    const country = clean(data.country, 80);
    if (!name || !country) throw new Error("Name");
    const id = clean(data.id, 40) || newId("PT");
    const existing = await sql<{ id: string }>`select id from partners where id = ${id}`;
    if (existing[0]) await sql`update partners set country = ${country}, name = ${name} where id = ${id}`;
    else await sql`insert into partners (id, country, name, sort_order, active) values (${id}, ${country}, ${name}, 9, true)`;
    await audit(sql, context.userId, "PARTNER", id, name);
    return { id };
  });

export const adminDeletePartner = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminDeletePartner(context.userId, id); return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    await sql`delete from partners where id = ${id}`;
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; role: string }) => ({
    userId: clean(input?.userId, 80),
    role: clean(input?.role, 20),
  }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminSetRole(context.userId, data); return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    if (data.role !== "ADMIN" && data.role !== "MANAGER" && data.role !== "CLIENT" && data.role !== "SUBAGENT") throw new Error("Role");
    if (data.role !== "ADMIN") {
      const admins = await sql<{ c: number }>`select count(*)::int as c from profiles where role = 'ADMIN' and user_id <> ${data.userId}`;
      const target = await sql<{ role: string }>`select role from profiles where user_id = ${data.userId}`;
      if (target[0]?.role === "ADMIN" && Number(admins[0]?.c ?? 0) < 1) throw new Error("Last admin");
    }
    await sql`update profiles set role = ${data.role} where user_id = ${data.userId}`;
    await audit(sql, context.userId, "ROLE", data.userId, data.role);
  });

export const adminDeleteApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminDeleteApplication(context.userId, id);
      return;
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const app = await loadApp(sql, id);
    if (!app) throw new Error("Not found");
    if (app.status === "OPEN") await sql`update vacancies set quota = quota + 1 where id = ${app.vacancyId}`;
    await sql`delete from documents where application_id = ${id}`;
    await sql`delete from messages where application_id = ${id}`;
    await sql`delete from applications where id = ${id}`;
    await audit(sql, context.userId, "APPLICATION_DELETE", id, app.clientEmail || "");
  });

export const adminDeleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => ({ userId: clean(input?.userId, 80) }))
  .handler(async ({ context, data }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      await mod.adminDeleteAccount(context.userId, data.userId);
      return;
    }
    const sql = await getSql();
    await requireAdmin(sql, context.userId);
    if (!data.userId || data.userId === context.userId) throw new Error("Self");
    const admins = await sql<{ c: number }>`select count(*)::int as c from profiles where role = 'ADMIN' and user_id <> ${data.userId}`;
    const target = await sql<{ role: string }>`select role from profiles where user_id = ${data.userId}`;
    if (target[0]?.role === "ADMIN" && Number(admins[0]?.c ?? 0) < 1) throw new Error("Last admin");
    await sql`delete from profiles where user_id = ${data.userId}`;
    await audit(sql, context.userId, "ACCOUNT_DELETE", data.userId, "");
  });

export const adminRestoreAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => ({ userId: clean(input?.userId, 80) }))
  .handler(async ({ context, data }) => {
    if (!sheetsOn()) throw new Error("Unavailable");
    await (await import("./sheet-backend")).adminRestoreAccount(context.userId, data.userId);
  });

export const adminMarkCommission = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; paid: boolean }) => ({ id: clean(input?.id, 40), paid: Boolean(input?.paid) }))
  .handler(async ({ context, data }) => {
    if (!sheetsOn()) throw new Error("Unavailable");
    return (await import("./sheet-backend")).adminMarkCommission(context.userId, data);
  });

export const agentRename = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { code: string }) => ({ code: clean(input?.code, 40) }))
  .handler(async ({ context, data }) => {
    if (!sheetsOn()) throw new Error("Unavailable");
    return (await import("./sheet-backend")).agentRename(context.userId, data.code);
  });

export const adminSetReferrer = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; referrerUserId: string }) => ({
    id: clean(input?.id, 40),
    referrerUserId: clean(input?.referrerUserId, 80),
  }))
  .handler(async ({ context, data }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).adminSetReferrer(context.userId, data);
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const app = await loadApp(sql, data.id);
    if (!app) throw new Error("Not found");
    const referrerUserId = data.referrerUserId ? await resolveReferrer(sql, data.referrerUserId) : "";
    if (data.referrerUserId && !referrerUserId) throw new Error("Role");
    await sql`update applications set referrer_user_id = ${referrerUserId}, updated_at = now() where id = ${app.id}`;
    await audit(sql, context.userId, "REFERRER", app.id, referrerUserId);
    return { ok: true };
  });

export const adminAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminAudit(context.userId);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    return sql<{ id: string; actorId: string; action: string; target: string; details: string; createdAt: string }>`select id, actor_id as "actorId", action, target, details, created_at::text as "createdAt" from audit_log order by created_at desc limit 80`;
  });

export const adminAllTeam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim()) {
      const mod = await import("./sheet-backend");
      return mod.adminAllTeam(context.userId);
    }
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    return sql<{
      id: string;
      fullName: string;
      position: string;
      phone: string;
      photoData: string;
      active: boolean;
    }>`select id, full_name as "fullName", position, phone, photo_data as "photoData", active from team_members order by sort_order, full_name`;
  });

export const adminDriveStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!sheetsOn()) return { connected: false, configured: false, fromEnv: false };
    const mod = await import("./sheet-backend");
    return mod.adminDriveStatus(context.userId);
  });

export const adminSaveDriveClient = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { clientId: string; clientSecret: string }) => ({
    clientId: clean(input?.clientId, 200),
    clientSecret: clean(input?.clientSecret, 200),
  }))
  .handler(async ({ context, data }) => {
    if (!sheetsOn()) throw new Error("Sheets");
    const mod = await import("./sheet-backend");
    return mod.adminSaveDriveClient(context.userId, data);
  });

export const adminDriveAuthUrl = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { redirectUri: string }) => ({ redirectUri: clean(input?.redirectUri, 300) }))
  .handler(async ({ context, data }) => {
    if (!sheetsOn()) throw new Error("Sheets");
    const mod = await import("./sheet-backend");
    return mod.adminDriveAuthUrl(context.userId, data.redirectUri);
  });

function sheetsOn() {
  return Boolean(process.env["GOOGLE_SPREADSHEET_ID"]?.trim() && process.env["GOOGLE_CLIENT_EMAIL"]?.trim());
}

export const cancelMyApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).cancelMine(context.userId, id);
    const sql = await getSql();
    await ctxProfile(sql, context.userId);
    const app = await loadApp(sql, id);
    if (!app || app.userId !== context.userId) throw new Error("Not found");
    const docs = await docsFor(sql, id);
    if (!canCancel(app.status, app.stage, app.cancelDeadlineAt, docs.some((doc) => doc.category === "PAYMENT_PROOF"))) {
      throw new Error("Locked");
    }
    await sql`update applications set status = 'CANCELLED', updated_at = now() where id = ${id}`;
    await sql`update vacancies set quota = quota + 1 where id = ${app.vacancyId}`;
    await audit(sql, context.userId, "CLIENT_CANCEL", id, "");
    return { ok: true };
  });

export const resubmitApplication = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((id: unknown) => clean(id, 40))
  .handler(async ({ context, data: id }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).resubmit(context.userId, id);
    const sql = await getSql();
    const person = await ctxProfile(sql, context.userId);
    const app = await loadApp(sql, id);
    if (!app || app.userId !== context.userId || app.status !== "REJECTED") throw new Error("Locked");
    const citizenship = app.citizenship || parseQuestionnaire(app.questionnaire).citizenship;
    if (!citizenship) throw new Error("Citizenship");
    const vacancies = await loadVacancies(sql);
    const products = await loadProducts(sql);
    const vacancy = vacancies.find((item) => item.id === app.vacancyId && item.active);
    const product = products.find((item) => item.id === vacancy?.visaProductId && item.active);
    if (!vacancy || vacancy.quota < 1 || !product) throw new Error("Opening unavailable");
    if (citizenshipBlocked(vacancy.blockedCitizenships, citizenship)) throw new Error("Citizenship");
    const dup = await sql<{ id: string }>`select id from applications where user_id = ${context.userId} and vacancy_id = ${vacancy.id} and status = 'OPEN' limit 1`;
    if (dup[0]) return { id: dup[0].id };
    const next = newId("VG");
    await sql`insert into applications (id, user_id, client_email, vacancy_id, visa_product_id, country, citizenship, processing, total_cost, currency, production_weeks, stage, status, questionnaire, referrer_user_id)
      values (${next}, ${context.userId}, ${person.email}, ${vacancy.id}, ${product.id}, ${product.country}, ${citizenship}, ${app.processing}, ${app.totalCost}, 'EUR', ${app.productionWeeks}, 1, 'OPEN', ${JSON.stringify({ ...parseQuestionnaire(app.questionnaire), citizenship })}, ${app.referrerUserId || ""})`;
    await sql`update vacancies set quota = quota - 1 where id = ${vacancy.id} and quota > 0`;
    await audit(sql, context.userId, "RESUBMIT", next, id);
    return { id: next };
  });

export const reviewDocument = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { id: string; status: string; reason?: string }) => ({
    id: clean(input?.id, 40),
    status: clean(input?.status, 20),
    reason: clean(input?.reason, 500),
  }))
  .handler(async ({ context, data }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).reviewDocument(context.userId, data);
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    if (data.status !== "APPROVED" && data.status !== "REJECTED") throw new Error("Status");
    const found = await sql<{ id: string }>`select id from documents where id = ${data.id}`;
    if (!found[0]) throw new Error("Not found");
    await sql`update documents set status = ${data.status}, rejection_reason = ${data.status === "REJECTED" ? data.reason : ""} where id = ${data.id}`;
    await audit(sql, context.userId, "DOCUMENT", data.id, data.status);
    return { ok: true };
  });

export const assignManagers = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { ids: string[]; managerId: string }) => ({
    ids: Array.isArray(input?.ids) ? input.ids.map((id) => clean(id, 40)).filter(Boolean) : [],
    managerId: clean(input?.managerId, 80),
  }))
  .handler(async ({ context, data }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).assignManagers(context.userId, data);
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    for (const id of data.ids) {
      await sql`update applications set assigned_manager_id = ${data.managerId}, updated_at = now() where id = ${id}`;
    }
    await audit(sql, context.userId, "ASSIGN", data.managerId, data.ids.join(","));
    return { ok: true };
  });

export const exportOpenCases = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).exportOpenCases(context.userId);
    const sql = await getSql();
    await requireStaff(sql, context.userId);
    const rows = await sql<{ c: number }>`select count(*)::int as c from applications where status = 'OPEN'`;
    const count = Number(rows[0]?.c ?? 0);
    await audit(sql, context.userId, "EXPORT", "OpenCases", String(count));
    return { count };
  });

export const updateMyContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string; phone: string }) => ({
    email: clean(input?.email, 180),
    phone: clean(input?.phone, 40),
  }))
  .handler(async ({ context, data }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).updateMyContact(context.userId, data);
    const sql = await getSql();
    await ctxProfile(sql, context.userId);
    const prior = await sql<{ id: string }>`select id from audit_log where actor_id = ${context.userId} and action = 'PROFILE_EDIT' limit 1`;
    if (prior[0]) throw new Error("Locked");
    const email = data.email.trim().toLowerCase();
    const phone = data.phone.trim();
    if (!email.includes("@") || phone.replace(/\D/g, "").length < 7) throw new Error("Contact");
    const taken = await sql<{ id: string }>`select id from profiles where user_id <> ${context.userId} and lower(email) = ${email} limit 1`;
    if (taken[0]) throw new Error("User with this email already exists.");
    await sql`update profiles set email = ${email}, phone = ${phone} where user_id = ${context.userId}`;
    await sql`update "user" set email = ${email}, "updatedAt" = now() where id = ${context.userId}`;
    await audit(sql, context.userId, "PROFILE_EDIT", context.userId, email);
    return { ok: true };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { current: string; next: string }) => ({
    current: String(input?.current ?? "").slice(0, 200),
    next: String(input?.next ?? "").slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    if (sheetsOn()) return (await import("./sheet-backend")).changeMyPassword(context.userId, data);
    throw new Error("Password");
  });

