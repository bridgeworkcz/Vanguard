import { createFileRoute } from "@tanstack/react-router";
import { officeDatabase } from "@/lib/database-url";

const ADMIN_ID = "USR-MUN5H06L-XD0BEK2I";

const SETTINGS = new Set([
  "usdt_wallet",
  "usdt_network",
  "support_email",
  "support_phone",
  "hero_title_en",
  "hero_title_cs",
  "hero_title_uk",
  "hero_title_ru",
  "hero_title_ur",
  "hero_body_en",
  "hero_body_cs",
  "hero_body_uk",
  "hero_body_ru",
  "hero_body_ur",
  "about_lead_en",
  "legal_address",
  "legal_entity",
  "telegram_owner_chat",
  "telegram_staff_chat",
]);

const ACTIONS = new Set(["accept", "reject", "cancel", "confirm-payment", "stage4"]);

function sheetsOn() {
  if (officeDatabase()) return false;
  return Boolean(process.env.GOOGLE_SPREADSHEET_ID?.trim() && process.env.GOOGLE_CLIENT_EMAIL?.trim());
}

function authorized(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const header = request.headers.get("authorization") || "";
  const got = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || got.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i += 1) diff |= token.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

async function saveSettings(data: Record<string, string>) {
  if (sheetsOn()) {
    const mod = await import("@/lib/vanguard/sheet-backend");
    await mod.adminSaveSettings(ADMIN_ID, data);
    return;
  }
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  for (const [key, value] of Object.entries(data)) {
    await sql`insert into settings (key, value, updated_at) values (${key}, ${value}, now())
      on conflict (key) do update set value = ${value}, updated_at = now()`;
  }
}

async function moveStage(id: string, action: string, reason: string) {
  if (sheetsOn()) {
    const mod = await import("@/lib/vanguard/sheet-backend");
    return mod.adminSetStage(ADMIN_ID, { id, action, reason });
  }
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  if (action === "accept") {
    const moved = await sql<{ id: string }>`update applications set stage = 2, stage2_at = now(),
      cancel_deadline_at = now() + interval '5 days', updated_at = now()
      where id = ${id} and status = 'OPEN' and stage = 1 returning id`;
    if (!moved[0]) throw new Error("Not ready");
    return { ok: true as const, stage: 2 };
  }
  if (action === "reject" || action === "cancel") {
    const status = action === "reject" ? "REJECTED" : "CANCELLED";
    const moved = await sql<{ id: string }>`update applications set status = ${status},
      rejection_reason = ${action === "reject" ? reason : ""}, updated_at = now()
      where id = ${id} and status = 'OPEN' returning id`;
    if (!moved[0]) throw new Error("Not found");
    return { ok: true as const };
  }
  if (action === "confirm-payment") {
    const moved = await sql<{ id: string }>`update applications set stage = 3, stage3_at = now(),
      process_stage = 'IN_PROCESS', updated_at = now()
      where id = ${id} and status = 'OPEN' and stage = 2 returning id`;
    if (!moved[0]) throw new Error("Not ready");
    return { ok: true as const, stage: 3 };
  }
  if (action === "stage4") {
    const moved = await sql<{ id: string }>`update applications set stage = 4, stage4_at = now(), updated_at = now()
      where id = ${id} and status = 'OPEN' and stage = 3 returning id`;
    if (!moved[0]) throw new Error("Not ready");
    return { ok: true as const, stage: 4 };
  }
  throw new Error("Action");
}

export const Route = createFileRoute("/api/desk")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) return Response.json({ ok: false, error: "Forbidden" }, { status: 401 });
        const body = (await request.json().catch(() => null)) as {
          op?: string;
          chatId?: string;
          key?: string;
          value?: string;
          id?: string;
          action?: string;
          reason?: string;
        } | null;
        if (!body?.op) return Response.json({ ok: false, error: "Op" }, { status: 400 });
        try {
          if (body.op === "bind") {
            const chatId = String(body.chatId || "").trim();
            if (!/^-?\d{5,20}$/.test(chatId)) throw new Error("Chat");
            await saveSettings({ telegram_owner_chat: chatId, telegram_staff_chat: chatId });
            return Response.json({ ok: true });
          }
          if (body.op === "setting") {
            const key = String(body.key || "");
            const value = String(body.value || "").trim().slice(0, 2000);
            if (!SETTINGS.has(key) || !value) throw new Error("Setting");
            await saveSettings({ [key]: value });
            return Response.json({ ok: true });
          }
          if (body.op === "stage") {
            const id = String(body.id || "").trim().toUpperCase();
            const action = String(body.action || "");
            if (!/^VG-[A-Z0-9]{4,16}$/.test(id) || !ACTIONS.has(action)) throw new Error("Action");
            const result = await moveStage(id, action, String(body.reason || "").slice(0, 500));
            return Response.json({ ok: true, result });
          }
          return Response.json({ ok: false, error: "Op" }, { status: 400 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Error";
          return Response.json({ ok: false, error: message }, { status: 400 });
        }
      },
    },
  },
});
