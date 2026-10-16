import crypto from "node:crypto";

interface SendTelegramOptions {
  chatId?: string;
  parseMode?: "HTML" | "MarkdownV2";
  disableWebPagePreview?: boolean;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  if (!token) throw new Error("Server Config Error: Missing TELEGRAM_BOT_TOKEN.");
  return token;
}

function hookSecret(token: string): string {
  return crypto.createHash("sha256").update(`vg-telegram:${token}`).digest("hex").slice(0, 32);
}

export function telegramHookSecret(): string {
  return hookSecret(botToken());
}

function isGroup(chatId: string): boolean {
  return chatId.trim().startsWith("-");
}

export function escapeTelegramHtml(text: string): string {
  if (!text) return "";
  return String(text).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
}

export function waLink(phone: string): string {
  const shown = phone.trim();
  const digits = shown.replace(/\D/g, "");
  if (digits.length < 8) return escapeTelegramHtml(shown);
  return `<a href="https://wa.me/${digits}">${escapeTelegramHtml(shown)}</a>`;
}

export function officeNote(title: string, lines: Array<string | false | null | undefined>): string {
  const body = lines.map((line) => (typeof line === "string" ? line.trim() : "")).filter(Boolean);
  return [`<b>${escapeTelegramHtml(title)}</b>`, ...body].join("\n");
}

async function readOfficeChat(): Promise<string> {
  try {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const rows = await sql<{ value: string }>`select value from settings where key = 'telegram_owner_chat'`;
    return (rows[0]?.value || "").trim();
  } catch {
    return "";
  }
}

export async function bindOfficeChat(chatId: string): Promise<void> {
  const id = chatId.trim();
  if (!/^\d{5,20}$/.test(id)) return;
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  for (const key of ["telegram_owner_chat", "telegram_staff_chat"]) {
    await sql`insert into settings (key, value, updated_at) values (${key}, ${id}, now())
      on conflict (key) do update set value = ${id}, updated_at = now()`;
  }
}

async function privateFromUpdates(token: string): Promise<string> {
  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ limit: 100, allowed_updates: ["message"] }),
  });
  if (!response.ok) return "";
  const data = (await response.json()) as {
    ok?: boolean;
    result?: { message?: { chat?: { id?: number; type?: string } } }[];
  };
  if (!data.ok || !Array.isArray(data.result)) return "";
  let found = "";
  for (const update of data.result) {
    const chat = update.message?.chat;
    if (chat?.type === "private" && chat.id) found = String(chat.id);
  }
  return found;
}

let hookReady = false;

export async function ensureTelegramWebhook(): Promise<void> {
  if (hookReady) return;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  if (!token) return;
  hookReady = true;
  const host = (process.env.VERCEL_PROJECT_PRODUCTION_URL || "vanguardmobility.site").replace(/^https?:\/\//, "").replace(/\/$/, "");
  await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: `https://${host}/api/telegram`,
      secret_token: hookSecret(token),
      allowed_updates: ["message"],
      drop_pending_updates: false,
    }),
  }).catch(() => undefined);
}

/** Private chat with the bot. A group id is never used. */
export async function officeChatId(preferred?: string): Promise<string> {
  const given = preferred?.trim() || "";
  if (given && !isGroup(given)) return given;
  const saved = await readOfficeChat();
  if (saved && !isGroup(saved)) return saved;
  const env = process.env.TELEGRAM_CHAT_ID?.trim() || "";
  if (env && !isGroup(env)) return env;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  if (token) {
    const found = await privateFromUpdates(token).catch(() => "");
    if (found) {
      await bindOfficeChat(found).catch(() => undefined);
      void ensureTelegramWebhook();
      return found;
    }
  }
  void ensureTelegramWebhook();
  return "";
}

export async function sendTelegramMessage(message: string, options: SendTelegramOptions = {}): Promise<boolean> {
  const cleanMessage = message ? message.trim() : "";
  if (!cleanMessage) throw new Error("Telegram Error: Cannot send an empty message.");
  const token = botToken();
  const targetChatId = await officeChatId(options.chatId);
  if (!targetChatId) throw new Error("Telegram Error: No private chat with the bot yet.");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: targetChatId,
      text: cleanMessage,
      parse_mode: options.parseMode || "HTML",
      disable_web_page_preview: options.disableWebPagePreview ?? true,
    }),
  });
  if (!response.ok) throw new Error(`Telegram API responded with HTTP status ${response.status}`);
  const data = (await response.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram API Error: ${data.description || "Unknown Telegram API failure"}`);
  return true;
}

export async function sendSafeTelegramAlert(message: string, options: SendTelegramOptions = {}): Promise<boolean> {
  try {
    return await sendTelegramMessage(message, options);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Telegram Alert Warning]: Non-blocking notification skipped due to error:", msg);
    return false;
  }
}

export async function sendTelegramDocument(
  file: { buffer: Buffer; fileName: string; mime: string },
  caption: string,
  options: SendTelegramOptions = {},
): Promise<boolean> {
  const token = botToken();
  const targetChatId = await officeChatId(options.chatId);
  if (!targetChatId) throw new Error("Telegram Error: No private chat with the bot yet.");
  const form = new FormData();
  form.append("chat_id", targetChatId);
  const note = caption.trim().slice(0, 1000);
  if (note) {
    form.append("caption", note);
    form.append("parse_mode", "HTML");
  }
  const bytes = new Uint8Array(file.buffer);
  form.append("document", new Blob([bytes], { type: file.mime || "application/octet-stream" }), file.fileName || "file");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Telegram API responded with HTTP status ${response.status}`);
  const data = (await response.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram API Error: ${data.description || "Unknown Telegram API failure"}`);
  return true;
}

export async function sendSafeTelegramDocument(
  file: { buffer: Buffer; fileName: string; mime: string },
  caption: string,
  options: SendTelegramOptions = {},
): Promise<boolean> {
  try {
    return await sendTelegramDocument(file, caption, options);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.warn("[Telegram Alert Warning]: Document skipped:", msg);
    return false;
  }
}

let menuReady = false;

export async function ensureTelegramMenu() {
  if (menuReady) return;
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || "";
  if (!token || !host) return;
  menuReady = true;
  const url = `https://${host.replace(/^https?:\/\//, "")}/admin`;
  const menu_button = { type: "web_app", text: "Адмін", web_app: { url } };
  await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ menu_button }),
  }).catch(() => undefined);
  void ensureTelegramWebhook();
}
