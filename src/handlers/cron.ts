import { jsonResponse } from '../lib/response'
import { supabaseClient } from '../lib/client'
import { buildDsuMessage } from '../telegram/dsu'
import { sendTelegramMessage } from '../telegram/send'

function envValue(name: string): string | undefined {
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return nodeProcess?.env?.[name]
}

function querySecretFromRequest(request: Request): string | null {
  try {
    return new URL(request.url).searchParams.get('secret')
  } catch {
    return null
  }
}

function missingRequiredEnv(): string[] {
  const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_CHAT_ID', 'TELEGRAM_BOT_TOKEN']
  return required.filter((name) => !String(envValue(name) || '').trim())
}

export async function handleCronDsu(request: Request): Promise<Response> {
  try {
    const cronSecret = String(envValue('CRON_SECRET') || '').trim()
    if (cronSecret) {
      const header = request.headers.get('x-cron-secret')
      const query  = querySecretFromRequest(request)
      if (header !== cronSecret && query !== cronSecret) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    }

    const missing = missingRequiredEnv()
    if (missing.length) {
      return jsonResponse({ ok: false, error: 'Missing required environment variables', missing }, 500)
    }

    const chatId = String(envValue('TELEGRAM_CHAT_ID') || '').trim()

    const supabase = supabaseClient()
    const message  = await buildDsuMessage(supabase)
    const telegram = await sendTelegramMessage(chatId, message)

    if (!telegram.sent) {
      return jsonResponse({ ok: false, error: telegram.error || 'Failed to send Telegram message', stage: 'telegram' }, 502)
    }

    return jsonResponse({ ok: true, telegram, sentAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    return jsonResponse({ ok: false, error: message, stage: 'cron_dsu' }, 500)
  }
}
