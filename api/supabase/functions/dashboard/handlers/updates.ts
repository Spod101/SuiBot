import { supabaseClient } from "../lib/client.ts";
import { jsonResponse } from "../lib/response.ts";
import { toNullableInt } from "../lib/validate.ts";
import { notifyTelegram } from "../telegram/send.ts";
import type { UpdateRow } from "../types.ts";

export async function handleListUpdates(request: Request): Promise<Response> {
  const supabase = supabaseClient();
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || "12");
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 12));

  const { data, error } = await supabase
    .from("updates")
    .select(
      "id, chapter, owner, title, status, event_date, notes, pax_target, pax_actual, is_risk, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ items: data || [] });
}

export async function handleCreateUpdate(request: Request): Promise<Response> {
  const payload = await request.json().catch(() => null);
  if (!payload) return jsonResponse({ error: "Invalid JSON body" }, 400);

  const chapter = String(payload.chapter || "").trim();
  const owner = String(payload.owner || "").trim();
  const title = String(payload.title || "").trim();
  const status = String(payload.status || "").trim();

  if (!chapter || !owner || !title || !status) {
    return jsonResponse({ error: "chapter, owner, title, and status are required" }, 400);
  }

  const row = {
    chapter,
    owner,
    title,
    status,
    event_date: payload.event_date ? String(payload.event_date) : null,
    notes: payload.notes ? String(payload.notes) : null,
    pax_target: toNullableInt(payload.pax_target),
    pax_actual: toNullableInt(payload.pax_actual),
    is_risk: Boolean(payload.is_risk),
  };

  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("updates")
    .insert(row)
    .select(
      "id, chapter, owner, title, status, event_date, notes, pax_target, pax_actual, is_risk, created_at",
    )
    .single();

  if (error || !data) {
    return jsonResponse({ error: error?.message || "Insert failed" }, 500);
  }

  const telegram = await notifyTelegram(data as UpdateRow);
  return jsonResponse({ item: data, telegram }, 201);
}
