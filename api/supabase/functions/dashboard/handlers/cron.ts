import { jsonResponse } from "../lib/response.ts";
import { supabaseClient } from "../lib/client.ts";
import { buildDsuMessage } from "../telegram/dsu.ts";
import { sendTelegramMessage } from "../telegram/send.ts";

function envValue(name: string): string | undefined {
  const deno = (globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }).Deno;
  return deno?.env?.get?.(name);
}

function querySecretFromRequest(request: Request): string | null {
  try {
    return new URL(request.url).searchParams.get("secret");
  } catch {
    return null;
  }
}

function missingRequiredEnv(): string[] {
  const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "TELEGRAM_CHAT_ID", "TELEGRAM_BOT_TOKEN"];
  return required.filter((name) => !String(envValue(name) || "").trim());
}

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
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const cronSecret = String(envValue("CRON_SECRET") || "").trim();
    if (cronSecret) {
      const header = request.headers.get("x-cron-secret");
      const query = querySecretFromRequest(request);
      if (header !== cronSecret && query !== cronSecret) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
    }

    const missing = missingRequiredEnv();
    if (missing.length) {
      return jsonResponse({ ok: false, error: "Missing required environment variables", missing }, 500);
    }

    // ── Send ──────────────────────────────────────────────────────────────────
    const chatId = String(envValue("TELEGRAM_CHAT_ID") || "").trim();

    const supabase = supabaseClient();
    const message = await buildDsuMessage(supabase);
    const telegram = await sendTelegramMessage(chatId, message);

    if (!telegram.sent) {
      return jsonResponse({ ok: false, error: telegram.error || "Failed to send Telegram message", stage: "telegram" }, 502);
    }

    return jsonResponse({
      ok: true,
      telegram,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonResponse({ ok: false, error: message, stage: "cron_dsu" }, 500);
  }
}
