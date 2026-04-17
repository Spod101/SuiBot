import { supabaseClient } from '../lib/client'

export function formatSection(title: string, lines: string[]): string {
  return [title, '', ...lines].join('\n')
}

export function splitCommandParts(raw: string): string[] {
  const input = raw.trim()
  if (!input) return []
  if (input.includes('|')) return input.split('|').map((s) => s.trim()).filter(Boolean)
  if (input.includes(';')) return input.split(';').map((s) => s.trim()).filter(Boolean)
  return [input]
}

export function parseKeyValueParts(raw: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const part of splitCommandParts(raw)) {
    const idx = part.indexOf(':')
    if (idx <= 0) continue
    const key   = part.slice(0, idx).trim().toLowerCase().replace(/\s+/g, '_')
    const value = part.slice(idx + 1).trim()
    if (value) map[key] = value
  }
  return map
}

export async function resolveTaskId(
  supabase: ReturnType<typeof supabaseClient>,
  taskRef: string,
): Promise<string | null> {
  const cleaned = taskRef.trim()
  if (!cleaned) return null
  if (cleaned.length >= 32) return cleaned

  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .ilike('id', `${cleaned}%`)
    .limit(1)
    .maybeSingle()

  if (error || !data?.id) return null
  return String(data.id)
}
