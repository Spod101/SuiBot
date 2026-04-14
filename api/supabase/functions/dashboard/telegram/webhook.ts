import { jsonResponse } from "../lib/response.ts";
import { sendTelegramMessage } from "./send.ts";
import { handleTelegramCommand } from "./commands.ts";

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  // If TELEGRAM_WEBHOOK_SECRET is set, enforce it on every incoming request.
  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (webhookSecret) {
    const provided = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (provided !== webhookSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  const update = await request.json().catch(() => null);
  if (!update) return jsonResponse({ error: "Invalid Telegram payload" }, 400);

  const message = update?.message;
  const text = String(message?.text || "").trim();
  const chatId = message?.chat?.id;

  // Ignore non-command messages silently
  if (!text || !chatId || !text.startsWith("/")) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const reply = await handleTelegramCommand(text);
  await sendTelegramMessage(String(chatId), reply);

  return jsonResponse({ ok: true });
}
