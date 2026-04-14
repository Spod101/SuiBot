/** Safely convert a value to an integer, returning null for blanks/non-numbers. */
export function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

/** Escape special HTML/Telegram characters. */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseNumberOrDefault(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

export function isCompletedStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s === "completed" || s === "done";
}

export function isLikelyRiskStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return (
    s.includes("risk") ||
    s.includes("tbc") ||
    s.includes("unconfirmed") ||
    s.includes("pending") ||
    s.includes("blocked") ||
    s.includes("cancel")
  );
}

/** Returns true when a Supabase error means the table simply doesn't exist yet. */
export function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "42P01") return true;
  const message = String(maybe.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    (message.includes("relation") && message.includes("not found"))
  );
}
