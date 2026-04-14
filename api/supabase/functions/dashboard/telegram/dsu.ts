import { supabaseClient } from "../lib/client.ts";
import { formatEventCountdown, formatManilaLongDate, daysAwayFromManila } from "../lib/date.ts";
import {
  escapeHtml,
  isMissingRelationError,
  isCompletedStatus,
  isLikelyRiskStatus,
  normalizeStatus,
} from "../lib/validate.ts";
import type { ConfigMap, DashboardConfigRow, DashboardEvent, TaskRow, TelegramListItem } from "../types.ts";

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

export function configText(config: ConfigMap, keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = config.get(key)?.value_text;
    if (value && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

export function configNumber(config: ConfigMap, keys: string[], fallback: number): number {
  for (const key of keys) {
    const value = config.get(key)?.value_number;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Dashboard events list (used as fallback when tasks table is empty)
// ---------------------------------------------------------------------------

export function eventToTelegramListItem(event: DashboardEvent): TelegramListItem {
  return {
    chapter: event.chapter,
    title: event.event_name,
    status: event.status,
    dueDate: event.event_date,
  };
}

export async function listDashboardEvents(options?: {
  limit?: number;
  risksOnly?: boolean;
  openOnly?: boolean;
}): Promise<TelegramListItem[]> {
  const supabase = supabaseClient();
  const limit = Math.max(1, Math.min(50, options?.limit ?? 10));

  const { data, error } = await supabase
    .from("dashboard_events")
    .select("slug, chapter, event_name, event_date, event_kind, status, pax_target, display_order")
    .order("display_order", { ascending: true })
    .limit(limit * 3);

  if (error) {
    if (isMissingRelationError(error)) return [];
    throw new Error(error.message);
  }

  let events = (data || []) as DashboardEvent[];
  if (options?.openOnly) events = events.filter((e) => !isCompletedStatus(String(e.status || "")));
  if (options?.risksOnly) events = events.filter((e) => isLikelyRiskStatus(String(e.status || "")));

  return events.slice(0, limit).map(eventToTelegramListItem);
}

// ---------------------------------------------------------------------------
// Daily Stand-Up message builder
// ---------------------------------------------------------------------------

export async function buildDsuMessage(
  supabase: ReturnType<typeof supabaseClient>,
): Promise<string> {
  const [configResult, eventResult, riskResult, taskResult, updateResult] = await Promise.all([
    supabase.from("dashboard_config").select("key, value_text, value_number"),
    supabase
      .from("dashboard_events")
      .select("slug, chapter, event_name, event_date, event_kind, status, pax_target, display_order")
      .order("display_order", { ascending: true })
      .limit(20),
    supabase
      .from("updates")
      .select("chapter, owner, title, status, event_date, notes, created_at")
      .eq("is_risk", true)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("tasks")
      .select("id, chapter, owner, title, status, due_date, notes, updated_at")
      .order("updated_at", { ascending: false })
      .limit(30),
    supabase
      .from("updates")
      .select("status, title, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const hardErrors = [configResult, eventResult, riskResult, taskResult, updateResult]
    .map((r) => r.error)
    .filter((e) => e && !isMissingRelationError(e));

  if (hardErrors.length) {
    return `Failed to load DSU data: ${hardErrors[0]?.message || "unknown error"}`;
  }

  // Build config map
  const config: ConfigMap = new Map();
  for (const row of (configResult.data || []) as DashboardConfigRow[]) {
    config.set(String(row.key), { value_text: row.value_text, value_number: row.value_number });
  }

  // Events
  const events = (eventResult.data || []) as DashboardEvent[];
  const codeCampEvents = events.filter((e) => e.event_kind === "code_camp");
  const scheduleEvents = codeCampEvents.length ? codeCampEvents : events;

  const totalCamps = scheduleEvents.length;
  const completedCamps = scheduleEvents.filter((e) =>
    isCompletedStatus(String(e.status || ""))
  ).length;

  // Updates
  const updates = (updateResult.data || []) as Array<{
    status: string;
    title: string;
    created_at: string;
  }>;
  const completedProjects = updates.filter((u) => isCompletedStatus(String(u.status || ""))).length;

  // KPI values
  const projectCompletion = configNumber(
    config,
    ["projects_completed", "project_completion_count", "confirmed_deployments"],
    completedProjects,
  );
  const trainedMentors = configNumber(config, ["trained_mentors"], 0);
  const q2Deadline = configText(config, ["q2_deadline"], "");
  const q2DaysRemaining = daysAwayFromManila(q2Deadline || null);
  const projectName = configText(config, ["project_name", "project_title"], "N/A");

  const technicalDefault = updates[0]
    ? `${updates[0].title} (${updates[0].status})`
    : "No technical status available";
  const technicalText = configText(
    config,
    ["technical_update", "technical_status"],
    technicalDefault,
  );

  // Build message lines
  const lines: string[] = [
    "DSU",
    formatManilaLongDate(),
    "",
    "📊 KPI & OVERVIEW",
    `Camps: ${completedCamps}/${totalCamps} Completed`,
    `Project Completion Tracker: ${projectCompletion} Projects Completed`,
    `Technical: ${escapeHtml(technicalText)}`,
    `Mentors: ${trainedMentors} Total Trained and Deployed`,
    `Timeline: ${q2DaysRemaining === null ? "TBC" : q2DaysRemaining} days remaining in Q2`,
    `Project: ${escapeHtml(projectName)}`,
    "",
    "📅 CAMP SCHEDULE & COUNTDOWN",
  ];

  if (!scheduleEvents.length) {
    lines.push("No camp schedule data found.");
  } else {
    for (const item of scheduleEvents.slice(0, 8)) {
      const venue = configText(
        config,
        [`event_${item.slug}_venue`, `${item.slug}_venue`],
        "TBC",
      );
      const lead = configText(
        config,
        [`event_${item.slug}_lead`, `${item.slug}_lead`],
        "TBC",
      );
      lines.push("");
      lines.push(`${escapeHtml(item.chapter)} (Venue: ${escapeHtml(venue)})`);
      lines.push(formatEventCountdown(item.event_date, item.status));
      lines.push(`Lead: ${escapeHtml(lead)}`);
    }
  }

  // Risks
  lines.push("", "⚠️ HIGH RISKS & BLOCKERS");

  const riskRows = (riskResult.data || []) as Array<{
    chapter: string;
    owner: string;
    title: string;
    status: string;
    notes: string | null;
    event_date: string | null;
    created_at: string;
  }>;

  if (riskRows.length) {
    for (const risk of riskRows) {
      const base = `${escapeHtml(risk.chapter)}: ${escapeHtml(risk.title)} (${escapeHtml(risk.status)})`;
      const detail = risk.notes ? ` ${escapeHtml(risk.notes)}` : "";
      lines.push(`${base}.${detail}`.trim());
    }
  } else {
    const fallbackRisks = scheduleEvents
      .filter(
        (e) =>
          isLikelyRiskStatus(String(e.status || "")) &&
          !isCompletedStatus(String(e.status || "")),
      )
      .slice(0, 5);

    if (fallbackRisks.length) {
      for (const e of fallbackRisks) {
        lines.push(`${escapeHtml(e.chapter)}: ${escapeHtml(e.event_name)} (${escapeHtml(e.status)}).`);
      }
    } else {
      lines.push("No high risks recorded.");
    }
  }

  // Tasks by chapter
  lines.push("", "✅ TO-DO LIST PER CAMP");

  const taskRows = (taskResult.data || []) as TaskRow[];
  const openTasks = taskRows.filter((t) => {
    const s = normalizeStatus(String(t.status || ""));
    return s !== "done" && s !== "completed" && s !== "closed";
  });

  if (!openTasks.length) {
    lines.push("No open tasks found.");
  } else {
    const byChapter = new Map<string, TaskRow[]>();
    for (const task of openTasks.slice(0, 24)) {
      const ch = String(task.chapter || "GENERAL / BACKLOG").trim() || "GENERAL / BACKLOG";
      const bucket = byChapter.get(ch) || [];
      bucket.push(task);
      byChapter.set(ch, bucket);
    }

    for (const [chapter, chapterTasks] of byChapter.entries()) {
      lines.push("", `📍 ${escapeHtml(chapter.toUpperCase())}`, "");
      for (const task of chapterTasks.slice(0, 6)) {
        const due = task.due_date ? ` (due: ${escapeHtml(task.due_date)})` : "";
        const notes = task.notes ? ` - ${escapeHtml(task.notes)}` : "";
        lines.push(
          `${escapeHtml(task.owner || "Owner")}: ${escapeHtml(task.title)}${due}${notes}`,
        );
      }
    }
  }

  return lines.join("\n");
}
