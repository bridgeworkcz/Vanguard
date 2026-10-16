import { createFileRoute } from "@tanstack/react-router";
import { bindOfficeChat, sendTelegramMessage, telegramHookSecret } from "@/lib/google/telegram";

export const Route = createFileRoute("/api/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
        if (!token) return new Response("no", { status: 503 });
        const secret = request.headers.get("x-telegram-bot-api-secret-token") || "";
        if (secret !== telegramHookSecret()) return new Response("no", { status: 401 });
        const update = (await request.json().catch(() => null)) as {
          message?: { text?: string; chat?: { id?: number; type?: string } };
        } | null;
        const chat = update?.message?.chat;
        if (chat?.type === "private" && chat.id) {
          const id = String(chat.id);
          await bindOfficeChat(id);
          const text = update?.message?.text || "";
          if (/^\/start\b/.test(text)) {
            await sendTelegramMessage("Сповіщення з сайту йдуть у цей чат, не в групу.", { chatId: id }).catch(() => undefined);
          }
        }
        return Response.json({ ok: true });
      },
    },
  },
});
