import { supabaseClient } from '../lib/client'
import { isMissingRelationError } from '../lib/validate'
import { buildDsuMessage, listDashboardEvents } from './dsu'
import { resolveTaskId } from './helpers'

export async function handleTelegramCommand(commandText: string): Promise<string> {
  const [command, ...tail] = commandText.split(' ')
  const normalized = command.toLowerCase()

  if (normalized === '/start' || normalized === '/help') {
    return [
      'Available commands:',
      '/latest - show Monday Morning DSU format',
      '/dsu - show Monday Morning DSU format',
      '/risk - show open risk updates',
      '/risks - alias for /risk',
      '/tasks - show latest tasks',
      '/task_add chapter | owner | title | due_date | notes',
      '/task_update task_id | status | notes',
      '/help - show this help',
    ].join('\n')
  }

  const supabase = supabaseClient()

  if (normalized === '/latest' || normalized === '/dsu') {
    return buildDsuMessage(supabase)
  }

  if (normalized === '/risk' || normalized === '/risks') {
    const { data, error } = await supabase
      .from('updates')
      .select('chapter, title, owner, status')
      .eq('is_risk', true)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error && !isMissingRelationError(error)) return `Failed to load risk updates: ${error.message}`

    if (!data?.length) {
      try {
        const fallback = await listDashboardEvents({ limit: 10, risksOnly: true, openOnly: true })
        if (!fallback.length) return 'No open risk updates.'

        const lines = ['Open risk updates (from dashboard events):']
        for (const item of fallback) {
          lines.push(`- ${item.chapter} | ${item.status} | ${item.title}`)
        }
        return lines.join('\n')
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : 'fallback failed'
        return `Failed to load risk updates: ${message}`
      }
    }

    const lines = ['Open risk updates:']
    for (const item of data) {
      lines.push(`- ${item.chapter} | ${item.status} | ${item.owner} | ${item.title}`)
    }
    return lines.join('\n')
  }

  if (normalized === '/tasks') {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, chapter, owner, title, status, due_date')
      .order('updated_at', { ascending: false })
      .limit(10)

    if (error && !isMissingRelationError(error)) return `Failed to load tasks: ${error.message}`

    if (!data?.length) {
      try {
        const fallback = await listDashboardEvents({ limit: 10, openOnly: true })
        if (!fallback.length) return 'No tasks yet.'

        const lines = ['Latest tasks (derived from open dashboard events):']
        for (const item of fallback) {
          lines.push(`- ${item.chapter} | ${item.status} | ${item.title} | due: ${item.dueDate || 'n/a'}`)
        }
        return lines.join('\n')
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : 'fallback failed'
        return `Failed to load tasks: ${message}`
      }
    }

    const lines = ['Latest tasks:']
    for (const item of data) {
      lines.push(`- ${String(item.id).slice(0, 8)} | ${item.chapter} | ${item.status} | ${item.title} | due: ${item.due_date || 'n/a'}`)
    }
    return lines.join('\n')
  }

  if (normalized === '/task_add') {
    const raw = tail.join(' ')
    const parts = raw.split('|').map((s) => s.trim())
    if (parts.length < 3) {
      return 'Usage: /task_add chapter | owner | title | due_date(optional) | notes(optional)'
    }

    const [chapter, owner, title, dueDate, notes] = parts
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        chapter,
        owner,
        title,
        status: 'open',
        due_date: dueDate || null,
        notes: notes || null,
      })
      .select('id, chapter, owner, title, status, due_date')
      .single()

    if (error || !data) {
      return `Failed to add task: ${error?.message || 'unknown error'}`
    }

    return `Task created: ${String(data.id).slice(0, 8)} | ${data.chapter} | ${data.status} | ${data.title}`
  }

  if (normalized === '/task_update') {
    const raw = tail.join(' ')
    const parts = raw.split('|').map((s) => s.trim())
    if (parts.length < 2) {
      return 'Usage: /task_update task_id | status | notes(optional)'
    }

    const [taskRef, status, notes] = parts
    const taskId = await resolveTaskId(supabase, taskRef)
    if (!taskId) {
      return `Task not found for reference: ${taskRef}`
    }

    const patch: { status: string; notes?: string } = { status }
    if (notes) patch.notes = notes

    const { data, error } = await supabase
      .from('tasks')
      .update(patch)
      .eq('id', taskId)
      .select('id, chapter, title, status')
      .single()

    if (error || !data) {
      return `Failed to update task: ${error?.message || 'unknown error'}`
    }

    return `Task updated: ${String(data.id).slice(0, 8)} | ${data.status} | ${data.chapter} | ${data.title}`
  }

  return 'Unknown command. Try /help.'
}
