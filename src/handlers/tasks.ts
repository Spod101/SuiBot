import { supabaseClient } from '../lib/client'
import { jsonResponse } from '../lib/response'

const TASK_SELECT = 'id, chapter, owner, title, status, due_date, notes, created_at, updated_at'

export async function handleListTasks(request: Request): Promise<Response> {
  const supabase = supabaseClient()
  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const requestedLimit = Number(url.searchParams.get('limit') || '25')
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 25))

  let query = supabase.from('tasks').select(TASK_SELECT).order('updated_at', { ascending: false }).limit(limit)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ items: data || [] })
}

export async function handleCreateTask(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null)
  if (!payload) return jsonResponse({ error: 'Invalid JSON body' }, 400)

  const chapter = String(payload.chapter || '').trim()
  const owner   = String(payload.owner   || '').trim()
  const title   = String(payload.title   || '').trim()
  const status  = String(payload.status  || 'open').trim().toLowerCase()

  if (!chapter || !owner || !title) {
    return jsonResponse({ error: 'chapter, owner, and title are required' }, 400)
  }

  const supabase = supabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      chapter, owner, title, status,
      due_date: payload.due_date ? String(payload.due_date) : null,
      notes:    payload.notes    ? String(payload.notes)    : null,
    })
    .select(TASK_SELECT)
    .single()

  if (error || !data) return jsonResponse({ error: error?.message || 'Failed to create task' }, 500)
  return jsonResponse({ item: data }, 201)
}

export async function handleUpdateTask(request: Request, taskId: string): Promise<Response> {
  const payload = await request.json().catch(() => null)
  if (!payload) return jsonResponse({ error: 'Invalid JSON body' }, 400)

  const patch: Record<string, unknown> = {}
  for (const field of ['chapter', 'owner', 'title', 'status', 'notes', 'due_date']) {
    if (payload[field] !== undefined) {
      patch[field] = payload[field] === null ? null : String(payload[field]).trim()
    }
  }

  if (!Object.keys(patch).length) return jsonResponse({ error: 'No fields to update' }, 400)

  const supabase = supabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select(TASK_SELECT)
    .single()

  if (error || !data) return jsonResponse({ error: error?.message || 'Failed to update task' }, 500)
  return jsonResponse({ item: data })
}

export async function handleDeleteTask(taskId: string): Promise<Response> {
  const supabase = supabaseClient()
  const { data, error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId)
    .select(TASK_SELECT)
    .maybeSingle()

  if (error)  return jsonResponse({ error: error.message }, 500)
  if (!data)  return jsonResponse({ error: 'Task not found' }, 404)
  return jsonResponse({ deleted: true, item: data })
}
