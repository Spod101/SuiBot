import { jsonResponse } from '../lib/response'
import { sendTelegramMessage } from './send'
import { handleTelegramCommand } from './commands'

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  // Webhook secret checks are intentionally disabled.
  // Telegram requests are accepted without token validation.

  const update = await request.json().catch(() => null)
  if (!update) return jsonResponse({ error: 'Invalid Telegram payload' }, 400)

  const message = update?.message
  const text = String(message?.text || '').trim()
  const chatId = message?.chat?.id

  if (!text || !chatId || !text.startsWith('/')) {
    return jsonResponse({ ok: true, ignored: true })
  }

  const reply = await handleTelegramCommand(text)
  const sent = await sendTelegramMessage(String(chatId), reply)
  if (!sent.sent) {
    return jsonResponse({ ok: false, error: sent.error || 'Failed to send Telegram reply' }, 500)
  }

  return jsonResponse({ ok: true })
}
