import { jsonResponse } from "../lib/response.ts";
import { supabaseClient } from "../lib/client.ts";
import { buildDsuMessage } from "../telegram/dsu.ts";
import { sendTelegramMessage } from "../telegram/send.ts";

/**
 * GET or POST /cron/dsu
 *
 * Builds the Daily Stand-Up message and sends it to the configured Telegram chat.
 * Called automatically by pg_cron (or GitHub Actions) on a fixed schedule.
 *
 * Security: requests must include the CRON_SECRET in the
 * "x-cron-secret" header (or as a "secret" query param).
 * If CRON_SECRET is not set, the endpoint is open — set it in production.
 */
export async function handleCronDsu(request: Request): Promise<Response> {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const header = request.headers.get("x-cron-secret");
    const query  = new URL(request.url).searchParams.get("secret");
    if (header !== cronSecret && query !== cronSecret) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!chatId) {
    return jsonResponse({ error: "TELEGRAM_CHAT_ID is not set" }, 500);
  }

  const supabase = supabaseClient();
  const message  = await buildDsuMessage(supabase);
  const telegram = await sendTelegramMessage(chatId, message);

  return jsonResponse({
    ok: true,
    telegram,
    sentAt: new Date().toISOString(),
  });
}
