import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { getSql } from "@/lib/db";

function authorized(request: Request): boolean {
  const expected = process.env.IMPORT_KEY?.trim() || "";
  const given = request.headers.get("x-import-key")?.trim() || "";
  if (!expected || !given || expected.length !== given.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given));
}

function text(value: unknown, max = 20000): string {
  return typeof value === "string" ? value.slice(0, max) : value == null ? "" : String(value).slice(0, max);
}

function stamp(value: unknown): string | null {
  const raw = text(value, 80);
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function bool(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (value === "false" || value === "0") return false;
  if (value === "true" || value === "1") return true;
  return fallback;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

export const Route = createFileRoute("/api/registry-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return new Response("Not found", { status: 404 });
        const body = (await request.json()) as { table?: string; rows?: unknown[] };
        const table = text(body.table, 40);
        const rows = Array.isArray(body.rows) ? body.rows : [];
        const sql = await getSql();
        let written = 0;
        if (table === "users") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            const roles = text(row.roles, 400) || '["CLIENT"]';
            let role = "CLIENT";
            try {
              const parsed = JSON.parse(roles) as unknown;
              const list = Array.isArray(parsed) ? parsed.map(String) : [roles];
              role = list.includes("ADMIN") ? "ADMIN" : list.includes("MANAGER") ? "MANAGER" : list.includes("SUBAGENT") ? "SUBAGENT" : "CLIENT";
            } catch {
              role = roles.includes("ADMIN") ? "ADMIN" : "CLIENT";
            }
            const email = text(row.email, 200).toLowerCase();
            const phone = text(row.phone, 40);
            const name = text(row.fullName, 200);
            const active = bool(row.isActive, true);
            await sql`insert into office_users (id, email, phone, full_name, roles, password_hash, is_active, created_at, last_login_at)
              values (${id}, ${email}, ${phone}, ${name}, ${roles}, ${text(row.passwordHash, 400)}, ${active}, ${stamp(row.createdAt) ?? new Date().toISOString()}, ${stamp(row.lastLoginAt)})
              on conflict (id) do update set email = ${email}, phone = ${phone}, full_name = ${name}, roles = ${roles},
                password_hash = ${text(row.passwordHash, 400)}, is_active = ${active}, last_login_at = ${stamp(row.lastLoginAt)}`;
            await sql`insert into profiles (user_id, email, full_name, phone, role)
              values (${id}, ${email}, ${name}, ${phone}, ${role})
              on conflict (user_id) do update set email = ${email}, full_name = ${name}, phone = ${phone}, role = ${role}`;
            written += 1;
          }
        } else if (table === "products") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            const lanes = Array.isArray(row.allowedProcessing) ? row.allowedProcessing.map(String).join(",") : text(row.allowedProcessing, 80);
            await sql`insert into visa_products (id, country, name, duration, description, base_price, currency, production_min_weeks, production_max_weeks, allowed_processing, active)
              values (${id}, ${text(row.country, 80)}, ${text(row.name, 160)}, ${text(row.duration, 80)}, ${text(row.description, 4000)}, ${num(row.basePrice)}, ${text(row.currency, 8) || "EUR"}, ${num(row.productionMinWeeks) || 1}, ${num(row.productionMaxWeeks) || 1}, ${lanes || "STANDARD"}, ${bool(row.active, true)})
              on conflict (id) do update set country = ${text(row.country, 80)}, name = ${text(row.name, 160)}, duration = ${text(row.duration, 80)}, description = ${text(row.description, 4000)},
                base_price = ${num(row.basePrice)}, production_min_weeks = ${num(row.productionMinWeeks) || 1}, production_max_weeks = ${num(row.productionMaxWeeks) || 1},
                allowed_processing = ${lanes || "STANDARD"}, active = ${bool(row.active, true)}`;
            written += 1;
          }
        } else if (table === "partners") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id || !text(row.country, 80) || !text(row.name, 200)) continue;
            await sql`insert into partners (id, country, name, sort_order, active)
              values (${id}, ${text(row.country, 80)}, ${text(row.name, 200)}, ${num(row.sort)}, true)
              on conflict (id) do update set country = ${text(row.country, 80)}, name = ${text(row.name, 200)}, sort_order = ${num(row.sort)}, active = true`;
            written += 1;
          }
        } else if (table === "vacancies") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            await sql`insert into vacancies (id, title, country, visa_product_id, employer, salary_net, accommodation, working_hours, description, requirements, quota, active, blocked_citizenships, created_at)
              values (${id}, ${text(row.title, 200)}, ${text(row.country, 80)}, ${text(row.visaProductId, 80)}, ${text(row.employer, 200)}, ${text(row.salaryNet, 80)}, ${text(row.accommodation, 500)}, ${text(row.workingHours, 200)}, ${text(row.description, 8000)}, ${text(row.requirements, 4000)}, ${num(row.quota)}, ${bool(row.active, true)}, ${text(row.blockedCitizenships, 500)}, ${stamp(row.createdAt) ?? new Date().toISOString()})
              on conflict (id) do update set title = ${text(row.title, 200)}, country = ${text(row.country, 80)}, visa_product_id = ${text(row.visaProductId, 80)}, employer = ${text(row.employer, 200)},
                salary_net = ${text(row.salaryNet, 80)}, accommodation = ${text(row.accommodation, 500)}, working_hours = ${text(row.workingHours, 200)}, description = ${text(row.description, 8000)},
                requirements = ${text(row.requirements, 4000)}, quota = ${num(row.quota)}, active = ${bool(row.active, true)}, blocked_citizenships = ${text(row.blockedCitizenships, 500)}`;
            written += 1;
          }
        } else if (table === "applications") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 40);
            if (!id) continue;
            const userId = text(row.userId, 80) || null;
            await sql`insert into applications (
              id, user_id, client_email, vacancy_id, visa_product_id, country, citizenship, processing, total_cost, currency,
              production_weeks, stage, status, process_stage, questionnaire, profile_complete, rejection_reason, dispatch_note,
              stage2_at, stage3_at, stage4_at, cancel_deadline_at, doc_deadline_at, created_at, updated_at, assigned_manager_id,
              referrer_user_id, commission_paid, client_lang, account_closed)
              values (${id}, ${userId}, ${text(row.clientEmail, 200)}, ${text(row.vacancyId, 80)}, ${text(row.visaProductId, 80)}, ${text(row.country, 80)}, ${text(row.citizenship, 80)}, ${text(row.processing, 20) || "STANDARD"}, ${num(row.totalCost)}, ${text(row.currency, 8) || "EUR"},
                ${num(row.productionWeeks)}, ${num(row.stage) || 1}, ${text(row.status, 40) || "OPEN"}, ${text(row.processStage, 40) || "IN_PROCESS"}, ${text(row.questionnaire, 20000) || "{}"}, ${bool(row.profileComplete, false)}, ${text(row.rejectionReason, 2000)}, ${text(row.dispatchNote, 4000)},
                ${stamp(row.stage2At)}, ${stamp(row.stage3At)}, ${stamp(row.stage4At)}, ${stamp(row.cancelDeadlineAt)}, ${stamp(row.docDeadlineAt)}, ${stamp(row.createdAt) ?? new Date().toISOString()}, ${stamp(row.updatedAt) ?? new Date().toISOString()}, ${text(row.assignedManagerId, 80)},
                ${text(row.referrerUserId, 80)}, ${bool(row.commissionPaid, false)}, ${text(row.lang, 8) || "en"}, ${bool(row.accountClosed, false)})
              on conflict (id) do update set user_id = ${userId}, client_email = ${text(row.clientEmail, 200)}, vacancy_id = ${text(row.vacancyId, 80)}, visa_product_id = ${text(row.visaProductId, 80)},
                country = ${text(row.country, 80)}, citizenship = ${text(row.citizenship, 80)}, processing = ${text(row.processing, 20) || "STANDARD"}, total_cost = ${num(row.totalCost)}, stage = ${num(row.stage) || 1},
                status = ${text(row.status, 40) || "OPEN"}, process_stage = ${text(row.processStage, 40) || "IN_PROCESS"}, questionnaire = ${text(row.questionnaire, 20000) || "{}"}, profile_complete = ${bool(row.profileComplete, false)},
                rejection_reason = ${text(row.rejectionReason, 2000)}, dispatch_note = ${text(row.dispatchNote, 4000)}, stage2_at = ${stamp(row.stage2At)}, stage3_at = ${stamp(row.stage3At)}, stage4_at = ${stamp(row.stage4At)},
                cancel_deadline_at = ${stamp(row.cancelDeadlineAt)}, doc_deadline_at = ${stamp(row.docDeadlineAt)}, assigned_manager_id = ${text(row.assignedManagerId, 80)}, referrer_user_id = ${text(row.referrerUserId, 80)},
                commission_paid = ${bool(row.commissionPaid, false)}, client_lang = ${text(row.lang, 8) || "en"}, account_closed = ${bool(row.accountClosed, false)}, updated_at = ${stamp(row.updatedAt) ?? new Date().toISOString()}`;
            written += 1;
          }
        } else if (table === "documents") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            await sql`insert into documents (id, application_id, user_id, category, file_name, mime, data, status, created_at, rejection_reason)
              values (${id}, ${text(row.applicationId, 40)}, ${text(row.userId, 80) || null}, ${text(row.category, 40)}, ${text(row.fileName, 200)}, ${text(row.mime, 80)}, ${text(row.data, 200)}, ${text(row.status, 40) || "UPLOADED"}, ${stamp(row.createdAt) ?? new Date().toISOString()}, ${text(row.rejectionReason, 2000)})
              on conflict (id) do update set application_id = ${text(row.applicationId, 40)}, category = ${text(row.category, 40)}, file_name = ${text(row.fileName, 200)}, mime = ${text(row.mime, 80)}, data = ${text(row.data, 200)}, status = ${text(row.status, 40) || "UPLOADED"}, rejection_reason = ${text(row.rejectionReason, 2000)}`;
            written += 1;
          }
        } else if (table === "team") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            await sql`insert into team_members (id, full_name, position, phone, photo_data, sort_order, active)
              values (${id}, ${text(row.fullName, 200)}, ${text(row.position, 200)}, ${text(row.phone, 40)}, ${text(row.photoData, 500)}, ${num(row.sortOrder)}, ${bool(row.active, true)})
              on conflict (id) do update set full_name = ${text(row.fullName, 200)}, position = ${text(row.position, 200)}, phone = ${text(row.phone, 40)}, photo_data = ${text(row.photoData, 500)}, sort_order = ${num(row.sortOrder)}, active = ${bool(row.active, true)}`;
            written += 1;
          }
        } else if (table === "media") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            await sql`insert into media_items (id, kind, title, caption, image_data, sort_order, active, country, vacancy_id, starts_at, ends_at, cover)
              values (${id}, ${text(row.kind, 40) || "office"}, ${text(row.title, 200)}, ${text(row.caption, 500)}, ${text(row.imageData, 500)}, ${num(row.sortOrder)}, ${bool(row.active, true)}, ${text(row.country, 80)}, ${text(row.vacancyId, 80)}, ${text(row.startsAt, 40)}, ${text(row.endsAt, 40)}, ${bool(row.cover, false)})
              on conflict (id) do update set kind = ${text(row.kind, 40) || "office"}, title = ${text(row.title, 200)}, caption = ${text(row.caption, 500)}, image_data = ${text(row.imageData, 500)}, sort_order = ${num(row.sortOrder)}, active = ${bool(row.active, true)}, country = ${text(row.country, 80)}, vacancy_id = ${text(row.vacancyId, 80)}, starts_at = ${text(row.startsAt, 40)}, ends_at = ${text(row.endsAt, 40)}, cover = ${bool(row.cover, false)}`;
            written += 1;
          }
        } else if (table === "settings") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const key = text(row.key, 80);
            if (!key) continue;
            const value = text(row.value, 60000);
            await sql`insert into settings (key, value, updated_at) values (${key}, ${value}, now())
              on conflict (key) do update set value = ${value}, updated_at = now()`;
            written += 1;
          }
        } else if (table === "audit") {
          for (const raw of rows) {
            const row = raw as Record<string, unknown>;
            const id = text(row.id, 80);
            if (!id) continue;
            await sql`insert into audit_log (id, actor_id, action, target, details, created_at)
              values (${id}, ${text(row.actorId, 80)}, ${text(row.action, 80)}, ${text(row.target, 80)}, ${text(row.details, 500)}, ${stamp(row.createdAt) ?? new Date().toISOString()})
              on conflict (id) do nothing`;
            written += 1;
          }
        } else if (table === "done") {
          await sql`insert into settings (key, value, updated_at) values ('registry_source', 'neon', now()) on conflict (key) do update set value = 'neon', updated_at = now()`;
          await sql`insert into settings (key, value, updated_at) values ('seed_version', '2', now()) on conflict (key) do update set value = '2', updated_at = now()`;
          written = 1;
        } else {
          return Response.json({ ok: false, error: "Unknown table" }, { status: 400 });
        }
        return Response.json({ ok: true, written });
      },
    },
  },
});
