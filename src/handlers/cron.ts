import { jsonResponse } from '../lib/response'
import { supabaseClient } from '../lib/client'
import { buildDsuMessage } from '../telegram/dsu'
import { sendTelegramMessage } from '../telegram/send'

export async function handleCronDsu(request: Request): Promise<Response> {
  const cronSecret = String(process.env.CRON_SECRET || '').trim()
  if (cronSecret) {
    const header = request.headers.get('x-cron-secret')
    const query  = new URL(request.url).searchParams.get('secret')
    if (header !== cronSecret && query !== cronSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }
  }

  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!chatId) return jsonResponse({ error: 'TELEGRAM_CHAT_ID is not set' }, 500)

  const supabase = supabaseClient()
  const message  = await buildDsuMessage(supabase)
  const telegram = await sendTelegramMessage(chatId, message)

  return jsonResponse({ ok: true, telegram, sentAt: new Date().toISOString() })
}
