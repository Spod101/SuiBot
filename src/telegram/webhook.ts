import { jsonResponse } from '../lib/response'
import { getCommandKeyboard, resolveCommandCallback } from './buttons'
import { answerTelegramCallback, sendTelegramMessageWithOptions } from './send'
import { handleTelegramCommand } from './commands'

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    const provided = request.headers.get('X-Telegram-Bot-Api-Secret-Token')
    if (provided !== webhookSecret) return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const update = await request.json().catch(() => null)
  if (!update) return jsonResponse({ error: 'Invalid Telegram payload' }, 400)

  const callback = update?.callback_query
  if (callback?.id && callback?.message?.chat?.id) {
    const chatId = String(callback.message.chat.id)
    const resolution = resolveCommandCallback(String(callback.data || ''))
    const reply = resolution.commandText
      ? await handleTelegramCommand(resolution.commandText)
      : String(resolution.responseText || 'Unknown action.')

    const sent = await sendTelegramMessageWithOptions(chatId, reply, {
      parseMode: 'HTML',
      replyMarkup: getCommandKeyboard(),
    })
    await answerTelegramCallback(String(callback.id))

    if (!sent.sent) return jsonResponse({ ok: false, error: sent.error || 'Failed to send Telegram reply' }, 500)
    return jsonResponse({ ok: true, callback: true })
  }

  const message = update?.message
  const text    = String(message?.text || '').trim()
  const chatId  = message?.chat?.id

  if (!text || !chatId || !text.startsWith('/')) return jsonResponse({ ok: true, ignored: true })

  const reply = await handleTelegramCommand(text)
  const sent = await sendTelegramMessageWithOptions(String(chatId), reply, {
    parseMode: 'HTML',
    replyMarkup: getCommandKeyboard(),
  })
  if (!sent.sent) return jsonResponse({ ok: false, error: sent.error || 'Failed to send Telegram reply' }, 500)

  return jsonResponse({ ok: true })
}
