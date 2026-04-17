import { escapeHtml } from './validate'

export function manilaDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .split('-')

  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  }
}

export function daysAwayFromManila(dateText: string | null): number | null {
  if (!dateText) return null

  const chunks = dateText.split('-')
  if (chunks.length !== 3) return null

  const year = Number(chunks[0])
  const month = Number(chunks[1])
  const day = Number(chunks[2])
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  const now = manilaDateParts()
  const todayUtc = Date.UTC(now.year, now.month - 1, now.day)
  const eventUtc = Date.UTC(year, month - 1, day)
  return Math.round((eventUtc - todayUtc) / 86_400_000)
}

export function formatManilaLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function formatManilaMonthDate(dateText: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(`${dateText}T00:00:00+08:00`))
}

export function formatEventCountdown(dateText: string | null, status: string): string {
  if (!dateText) {
    const statusText = String(status || '').trim()
    return statusText ? escapeHtml(statusText) : 'Date TBC'
  }

  const days = daysAwayFromManila(dateText)
  const dateLabel = escapeHtml(formatManilaMonthDate(dateText))

  if (days === null) return dateLabel
  if (days === 0) return `${dateLabel} | Today!`

  if (days < 0) {
    const d = Math.abs(days)
    return `${dateLabel} | ${d} Day${d === 1 ? '' : 's'} ago`
  }

  const weeks = Math.max(1, Math.round(days / 7))
  return `${dateLabel} | ${days} Day${days === 1 ? '' : 's'} to go (~${weeks} Week${weeks === 1 ? '' : 's'})`
}
