import { supabaseClient } from "../lib/client.ts";

/** Joins a section title + blank line + body lines. */
export function formatSection(title: string, lines: string[]): string {
  return [title, "", ...lines].join("\n");
}

/**
 * Splits a raw command argument string on `|` first, then `;`,
 * falling back to treating the whole string as one part.
 */
export function splitCommandParts(raw: string): string[] {
  const input = raw.trim();
  if (!input) return [];
  if (input.includes("|")) return input.split("|").map((s) => s.trim()).filter(Boolean);
  if (input.includes(";")) return input.split(";").map((s) => s.trim()).filter(Boolean);
  return [input];
}

/**
 * Parses `key: value` pairs from a command argument string.
 * Works with both `|` and `;` delimiters.
 *
 * Example input:  "chapter: Zamboanga; owner: Ana; title: Prepare venue"
 * Example output: { chapter: "Zamboanga", owner: "Ana", title: "Prepare venue" }
 */
export function parseKeyValueParts(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const part of splitCommandParts(raw)) {
    const idx = part.indexOf(":");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim().toLowerCase().replace(/\s+/g, "_");
    const value = part.slice(idx + 1).trim();
    if (value) map[key] = value;
  }
  return map;
}

/**
 * Resolves a partial or full task ID string to a full UUID.
 * Accepts UUIDs of >= 32 chars directly; otherwise does a prefix lookup.
 */
export async function resolveTaskId(
  supabase: ReturnType<typeof supabaseClient>,
  taskRef: string,
): Promise<string | null> {
  const cleaned = taskRef.trim();
  if (!cleaned) return null;
  if (cleaned.length >= 32) return cleaned;

  const { data, error } = await supabase
    .from("tasks")
    .select("id")
    .ilike("id", `${cleaned}%`)
    .limit(1)
    .maybeSingle();

  if (error || !data?.id) return null;
  return String(data.id);
}
