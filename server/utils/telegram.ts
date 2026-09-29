interface TelegramCredentials {
  botToken: string;
  chatId: string;
}

interface SendTelegramOptions {
  chatId?: string;
  parseMode?: 'HTML' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
}

// --- 1. Отримання та валідація конфігурації Credentials ---

function getCredentials(): TelegramCredentials {
  const botToken = process.env.TELEGRAM_BOT_TOKEN ? process.env.TELEGRAM_BOT_TOKEN.trim() : '';
  const chatId = process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.trim() : '';

  if (!botToken || !chatId) {
    throw new Error(
      'Server Config Error: Missing required Telegram environment variables (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID).'
    );
  }

  return { botToken, chatId };
}

// --- 2. Екранування спецсимволів для безпечного HTML у Telegram ---

export function escapeTelegramHtml(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// --- 3. Базовий транспорт відправки повідомлень у Telegram API ---

export async function sendTelegramMessage(
  message: string,
  options: SendTelegramOptions = {}
): Promise<boolean> {
  const cleanMessage = message ? message.trim() : '';
  if (!cleanMessage) {
    throw new Error('Telegram Error: Cannot send an empty message.');
  }

  const { botToken, chatId: defaultChatId } = getCredentials();
  const targetChatId = options.chatId ? options.chatId.trim() : defaultChatId;

  if (!targetChatId) {
    throw new Error('Telegram Error: Target chatId is missing.');
  }

  const parseMode = options.parseMode || 'HTML';
  const disableWebPagePreview = options.disableWebPagePreview ?? true;

  // Безопасне формування URL без розкриття токена в зовнішніх логах
  const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: targetChatId,
        text: cleanMessage,
        parse_mode: parseMode,
        disable_web_page_preview: disableWebPagePreview,
      }),
    });

    if (!response.ok) {
      // Маскуємо токен у помилці
      throw new Error(`Telegram API responded with HTTP status ${response.status}`);
    }

    const data = (await response.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      throw new Error(`Telegram API Error: ${data.description || 'Unknown Telegram API failure'}`);
    }

    return true;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    // Логуємо абстрактну помилку без публікації секретного URL з токеном
    console.error('[Telegram Notification Failed]:', errorMessage);
    throw new Error(`Telegram Service Exception: Failed to send notification. (${errorMessage})`);
  }
}

// --- 4. Безпечний обгортковий метод (Safe Non-Blocking Alert) ---

/**
 * Відправляє сповіщення в Telegram, не перериваючи виконання основної бізнес-транзакції у разі збою Telegram.
 */
export async function sendSafeTelegramAlert(
  message: string,
  options: SendTelegramOptions = {}
): Promise<boolean> {
  try {
    return await sendTelegramMessage(message, options);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.warn('[Telegram Alert Warning]: Non-blocking notification skipped due to error:', msg);
    return false;
  }
}

