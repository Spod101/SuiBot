import { escapeHtml } from '../lib/validate'
import type { TelegramResult, UpdateRow } from '../types'

export async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return { sent: false, error: 'TELEGRAM_BOT_TOKEN is not set' }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  })

  const result = await response.json().catch(() => null)
  if (!response.ok || !result?.ok) {
    return { sent: false, error: String(result?.description || `Telegram error ${response.status}`) }
  }

  return { sent: true, messageId: result.result?.message_id }
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
