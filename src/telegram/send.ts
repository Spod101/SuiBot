import { escapeHtml } from '../lib/validate'
import type { TelegramInlineKeyboardMarkup } from './buttons'
import type { TelegramResult, UpdateRow } from '../types'

type SendTelegramOptions = {
  parseMode?: 'HTML'
  replyMarkup?: TelegramInlineKeyboardMarkup
}

function chunkTelegramMessage(text: string, maxLength = 3900): string[] {
  const normalized = String(text || '')
  if (normalized.length <= maxLength) return [normalized]

  const chunks: string[] = []
  let start = 0

  while (start < normalized.length) {
    let end = Math.min(start + maxLength, normalized.length)
    const breakAt = normalized.lastIndexOf('\n', end)
    if (breakAt > start + 200) end = breakAt
    chunks.push(normalized.slice(start, end).trim())
    start = end
  }

  return chunks.filter(Boolean)
}

async function postTelegramMessage(token: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.ok) {
    return { ok: false, error: String(result?.description || `Telegram error ${response.status}`) }
  }

  return { ok: true, messageId: result.result?.message_id }
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramResult> {
  return sendTelegramMessageWithOptions(chatId, text, { parseMode: 'HTML' })
}

export async function sendTelegramMessageWithOptions(
  chatId: string,
  text: string,
  options?: SendTelegramOptions,
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { sent: false, error: 'TELEGRAM_BOT_TOKEN is not set' }

  const chunks = chunkTelegramMessage(text)
  let lastMessageId: number | undefined

  for (const chunk of chunks) {
    const primaryPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    }
    if (options?.parseMode !== undefined) primaryPayload.parse_mode = options.parseMode
    if (options?.replyMarkup) primaryPayload.reply_markup = options.replyMarkup

    const primary = await postTelegramMessage(token, primaryPayload)

    if (primary.ok) {
      lastMessageId = primary.messageId
      continue
    }

    const parseFailed = String(primary.error || '').toLowerCase().includes('can\'t parse entities')
    if (!parseFailed) return { sent: false, error: primary.error }

    const fallbackPayload: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      disable_web_page_preview: true,
    }
    if (options?.replyMarkup) fallbackPayload.reply_markup = options.replyMarkup

    const fallback = await postTelegramMessage(token, fallbackPayload)
    if (!fallback.ok) return { sent: false, error: fallback.error || primary.error }
    lastMessageId = fallback.messageId
  }

  return { sent: true, messageId: lastMessageId }
}

export async function answerTelegramCallback(callbackQueryId: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return

  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  }).catch(() => null)
}

export async function notifyTelegram(update: UpdateRow): Promise<TelegramResult> {
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!chatId) return { sent: false, error: 'TELEGRAM_CHAT_ID is not set' }

  const lines = [
    '<b>New Live Update</b>',
    `Chapter: <b>${escapeHtml(update.chapter || 'N/A')}</b>`,
    `Title: ${escapeHtml(update.title || 'N/A')}`,
    `Status: <b>${escapeHtml(update.status || 'N/A')}</b>`,
    `Owner: ${escapeHtml(update.owner || 'N/A')}`,
    `Event Date: ${escapeHtml(update.event_date || 'N/A')}`,
    `PAX: ${update.pax_actual ?? 'N/A'} / ${update.pax_target ?? 'N/A'}`,
    `Risk: ${update.is_risk ? 'YES' : 'NO'}`,
  ]

  if (update.notes) lines.push(`Notes: ${escapeHtml(update.notes)}`)

  return sendTelegramMessage(chatId, lines.join('\n'))
}
