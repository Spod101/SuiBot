import { jsonResponse } from '../lib/response'
import { supabaseClient } from '../lib/client'
import { buildDsuMessage } from '../telegram/dsu'
import { sendTelegramMessage } from '../telegram/send'

function envValue(name: string): string | undefined {
  const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  return nodeProcess?.env?.[name]
}

export async function handleCronDsu(request: Request): Promise<Response> {
  try {
    const cronSecret = String(envValue('CRON_SECRET') || '').trim()
    if (cronSecret) {
      const header = request.headers.get('x-cron-secret')
      const query  = new URL(request.url).searchParams.get('secret')
      if (header !== cronSecret && query !== cronSecret) {
        return jsonResponse({ error: 'Unauthorized' }, 401)
      }
    }

    const chatId = envValue('TELEGRAM_CHAT_ID')
    if (!chatId) return jsonResponse({ error: 'TELEGRAM_CHAT_ID is not set' }, 500)

    const supabase = supabaseClient()
    const message  = await buildDsuMessage(supabase)
    const telegram = await sendTelegramMessage(chatId, message)

    return jsonResponse({ ok: true, telegram, sentAt: new Date().toISOString() })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected server error'
    return jsonResponse({ ok: false, error: message }, 500)
  }
}
