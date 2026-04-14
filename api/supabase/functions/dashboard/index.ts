import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type UpdateRow = {
  id: string;
  chapter: string;
  owner: string;
  title: string;
  status: string;
  event_date: string | null;
  notes: string | null;
  pax_target: number | null;
  pax_actual: number | null;
  is_risk: boolean;
  created_at: string;
};

type TelegramResult = {
  sent: boolean;
  error?: string;
  messageId?: number;
};

type DashboardEvent = {
  slug: string;
  chapter: string;
  event_name: string;
  event_date: string | null;
  event_kind: string;
  status: string;
  pax_target: number | null;
  display_order: number;
};

type DashboardConfigRow = {
  key: string;
  value_text: string | null;
  value_number: number | null;
};

type TaskRow = {
  id: string;
  chapter: string;
  owner: string;
  title: string;
  status: string;
  due_date: string | null;
  notes: string | null;
  updated_at: string;
};

type TelegramListItem = {
  chapter: string;
  title: string;
  status: string;
  dueDate: string | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function toNullableInt(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return null;
  }
  return Math.round(n);
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function normalizeRoute(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const fnIndex = parts.indexOf("dashboard");
  if (fnIndex >= 0) {
    const nested = parts.slice(fnIndex + 1);
    return `/${nested.join("/")}`.replace(/\/$/, "") || "/";
  }
  return pathname.replace(/\/$/, "") || "/";
}

function routeId(route: string, prefix: string): string | null {
  if (!route.startsWith(prefix + "/")) return null;
  const id = route.slice(prefix.length + 1).trim();
  return id || null;
}

async function sendTelegramMessage(chatId: string, text: string): Promise<TelegramResult> {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) {
    return { sent: false, error: "TELEGRAM_BOT_TOKEN is not set" };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    return {
      sent: false,
      error: String(result?.description || `Telegram error ${response.status}`),
    };
  }

  return {
    sent: true,
    messageId: result.result?.message_id,
  };
}

async function notifyTelegram(update: UpdateRow): Promise<TelegramResult> {
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  if (!chatId) {
    return { sent: false, error: "TELEGRAM_CHAT_ID is not set" };
  }

  const status = escapeHtml(update.status || "N/A");
  const chapter = escapeHtml(update.chapter || "N/A");
  const owner = escapeHtml(update.owner || "N/A");
  const title = escapeHtml(update.title || "N/A");
  const eventDate = escapeHtml(update.event_date || "N/A");
  const paxTarget = update.pax_target ?? "N/A";
  const paxActual = update.pax_actual ?? "N/A";
  const risk = update.is_risk ? "YES" : "NO";

  const lines = [
    "<b>New Live Update</b>",
    `Chapter: <b>${chapter}</b>`,
    `Title: ${title}`,
    `Status: <b>${status}</b>`,
    `Owner: ${owner}`,
    `Event Date: ${eventDate}`,
    `PAX: ${paxActual} / ${paxTarget}`,
    `Risk: ${risk}`,
  ];

  if (update.notes) {
    lines.push(`Notes: ${escapeHtml(update.notes)}`);
  }

  return sendTelegramMessage(chatId, lines.join("\n"));
}

function supabaseClient() {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

function parseNumberOrDefault(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string };
  if (maybe.code === "42P01") return true;
  const message = String(maybe.message || "").toLowerCase();
  return message.includes("does not exist") || message.includes("relation") && message.includes("not found");
}

function normalizeStatus(status: string): string {
  return status.trim().toLowerCase();
}

function isCompletedStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s === "completed" || s === "done";
}

function isLikelyRiskStatus(status: string): boolean {
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

function eventToTelegramListItem(event: DashboardEvent): TelegramListItem {
  return {
    chapter: event.chapter,
    title: event.event_name,
    status: event.status,
    dueDate: event.event_date,
  };
}

async function listDashboardEvents(options?: { limit?: number; risksOnly?: boolean; openOnly?: boolean }): Promise<TelegramListItem[]> {
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

  if (options?.openOnly) {
    events = events.filter((item) => !isCompletedStatus(String(item.status || "")));
  }

  if (options?.risksOnly) {
    events = events.filter((item) => isLikelyRiskStatus(String(item.status || "")));
  }

  return events.slice(0, limit).map(eventToTelegramListItem);
}

function manilaDateParts(date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).split("-");

  return {
    year: Number(parts[0]),
    month: Number(parts[1]),
    day: Number(parts[2]),
  };
}

function daysAwayFromManila(dateText: string | null): number | null {
  if (!dateText) return null;

  const chunks = dateText.split("-");
  if (chunks.length !== 3) return null;

  const year = Number(chunks[0]);
  const month = Number(chunks[1]);
  const day = Number(chunks[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const now = manilaDateParts();
  const todayUtc = Date.UTC(now.year, now.month - 1, now.day);
  const eventUtc = Date.UTC(year, month - 1, day);
  return Math.round((eventUtc - todayUtc) / 86400000);
}

function formatManilaLongDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatManilaMonthDate(dateText: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(`${dateText}T00:00:00+08:00`));
}

function formatEventCountdown(dateText: string | null, status: string): string {
  if (!dateText) {
    const statusText = String(status || "").trim();
    if (statusText) return escapeHtml(statusText);
    return "Date TBC";
  }

  const days = daysAwayFromManila(dateText);
  const dateLabel = escapeHtml(formatManilaMonthDate(dateText));
  if (days === null) {
    return dateLabel;
  }

  if (days < 0) {
    return `${dateLabel} | ${Math.abs(days)} Days ago`;
  }

  const weeks = Math.max(1, Math.round(days / 7));
  return `${dateLabel} | ${days} Days to go (~${weeks} Weeks)`;
}

function configText(
  config: Map<string, { value_text: string | null; value_number: number | null }>,
  keys: string[],
  fallback: string,
): string {
  for (const key of keys) {
    const value = config.get(key)?.value_text;
    if (value && String(value).trim()) return String(value).trim();
  }
  return fallback;
}

function configNumber(
  config: Map<string, { value_text: string | null; value_number: number | null }>,
  keys: string[],
  fallback: number,
): number {
  for (const key of keys) {
    const value = config.get(key)?.value_number;
    if (Number.isFinite(Number(value))) return Number(value);
  }
  return fallback;
}

async function buildDsuMessage(supabase: ReturnType<typeof supabaseClient>): Promise<string> {
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
    .map((result) => result.error)
    .filter((error) => error && !isMissingRelationError(error));

  if (hardErrors.length) {
    return `Failed to load DSU data: ${hardErrors[0]?.message || "unknown error"}`;
  }

  const config = new Map<string, { value_text: string | null; value_number: number | null }>();
  for (const row of ((configResult.data || []) as DashboardConfigRow[])) {
    config.set(String(row.key), {
      value_text: row.value_text,
      value_number: row.value_number,
    });
  }

  const events = (eventResult.data || []) as DashboardEvent[];
  const codeCampEvents = events.filter((item) => item.event_kind === "code_camp");
  const scheduleEvents = codeCampEvents.length ? codeCampEvents : events;

  const totalCamps = scheduleEvents.length;
  const completedCamps = scheduleEvents.filter((item) => isCompletedStatus(String(item.status || ""))).length;

  const updates = (updateResult.data || []) as Array<{ status: string; title: string; created_at: string }>;
  const completedProjects = updates.filter((item) => isCompletedStatus(String(item.status || ""))).length;

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
  const technicalText = configText(config, ["technical_update", "technical_status"], technicalDefault);

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
    lines.push("No camp schedule data found in Supabase.");
  } else {
    for (const item of scheduleEvents.slice(0, 8)) {
      const venue = configText(config, [`event_${item.slug}_venue`, `${item.slug}_venue`], "TBC");
      const lead = configText(config, [`event_${item.slug}_lead`, `${item.slug}_lead`], "TBC");
      lines.push("");
      lines.push(`${escapeHtml(item.chapter)} (Venue: ${escapeHtml(venue)})`);
      lines.push(formatEventCountdown(item.event_date, item.status));
      lines.push(`Lead: ${escapeHtml(lead)}`);
    }
  }

  lines.push("");
  lines.push("⚠️ HIGH RISKS & BLOCKERS");

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
      .filter((item) => isLikelyRiskStatus(String(item.status || "")) && !isCompletedStatus(String(item.status || "")))
      .slice(0, 5);

    if (fallbackRisks.length) {
      for (const item of fallbackRisks) {
        lines.push(`${escapeHtml(item.chapter)}: ${escapeHtml(item.event_name)} (${escapeHtml(item.status)}).`);
      }
    } else {
      lines.push("No high risks recorded in Supabase.");
    }
  }

  lines.push("");
  lines.push("✅ TO-DO LIST PER CAMP");

  const taskRows = (taskResult.data || []) as TaskRow[];
  const openTasks = taskRows.filter((item) => {
    const status = normalizeStatus(String(item.status || ""));
    return status !== "done" && status !== "completed" && status !== "closed";
  });

  if (!openTasks.length) {
    lines.push("No open tasks found in Supabase.");
  } else {
    const tasksByChapter = new Map<string, TaskRow[]>();
    for (const task of openTasks.slice(0, 24)) {
      const chapter = String(task.chapter || "GENERAL / BACKLOG").trim() || "GENERAL / BACKLOG";
      const bucket = tasksByChapter.get(chapter) || [];
      bucket.push(task);
      tasksByChapter.set(chapter, bucket);
    }

    for (const [chapter, chapterTasks] of tasksByChapter.entries()) {
      lines.push("");
      lines.push(`📍 ${escapeHtml(chapter.toUpperCase())}`);
      lines.push("");
      for (const task of chapterTasks.slice(0, 6)) {
        const due = task.due_date ? ` (due: ${escapeHtml(task.due_date)})` : "";
        const notes = task.notes ? ` - ${escapeHtml(task.notes)}` : "";
        lines.push(`${escapeHtml(task.owner || "Owner")}: ${escapeHtml(task.title)}${due}${notes}`);
      }
    }
  }

  return lines.join("\n");
}

async function handleDashboard() {
  const supabase = supabaseClient();

  const [{ data: rawConfigRows, error: configError }, { data: rawEventRows, error: eventError }] = await Promise.all([
    supabase
      .from("dashboard_config")
      .select("key, value_text, value_number"),
    supabase
      .from("dashboard_events")
      .select("slug, chapter, event_name, event_date, event_kind, status, pax_target, display_order")
      .order("display_order", { ascending: true }),
  ]);

  if (configError && !isMissingRelationError(configError)) {
    return jsonResponse({ error: configError.message }, 500);
  }

  if (eventError && !isMissingRelationError(eventError)) {
    return jsonResponse({ error: eventError.message }, 500);
  }

  const configRows = rawConfigRows || [];
  const eventRows = rawEventRows || [];

  const config = new Map<string, { value_text: string | null; value_number: number | null }>();
  for (const row of configRows || []) {
    config.set(String(row.key), {
      value_text: row.value_text,
      value_number: row.value_number,
    });
  }

  const events = (eventRows || []) as DashboardEvent[];
  const codeCampEvents = events.filter((item) => item.event_kind === "code_camp");
  const codeCampsTotal = codeCampEvents.length;
  const codeCampsCompleted = codeCampEvents.filter((item) => {
    const status = String(item.status || "").toLowerCase();
    return status === "completed" || status === "done";
  }).length;

  const formSubmissions = parseNumberOrDefault(config.get("form_submissions")?.value_number, 0);
  const trainedMentors = parseNumberOrDefault(config.get("trained_mentors")?.value_number, 0);
  const confirmedDeployments = parseNumberOrDefault(config.get("confirmed_deployments")?.value_number, 0);
  const completionRatePct = parseNumberOrDefault(config.get("completion_rate_pct")?.value_number, 0);
  const computerLabs = parseNumberOrDefault(config.get("computer_labs")?.value_number, 0);

  const deadlineText = config.get("q2_deadline")?.value_text || null;
  const q2DaysRemaining = daysAwayFromManila(deadlineText);

  const manilaNow = new Date();
  const manilaDateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(manilaNow);

  return jsonResponse({
    timezone: "Asia/Manila",
    generatedAt: new Date().toISOString(),
    manilaDateLabel,
    q2DaysRemaining,
    summary: {
      codeCampsTotal,
      codeCampsCompleted,
      formSubmissions,
      trainedMentors,
      confirmedDeployments,
      completionRatePct,
      computerLabs,
    },
    events: events.map((item) => ({
      slug: item.slug,
      chapter: item.chapter,
      eventName: item.event_name,
      eventDate: item.event_date,
      eventKind: item.event_kind,
      status: item.status,
      paxTarget: item.pax_target,
      daysAway: daysAwayFromManila(item.event_date),
    })),
  });
}

async function handleListTasks(request: Request) {
  const supabase = supabaseClient();
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const requestedLimit = Number(url.searchParams.get("limit") || "25");
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 25));

  let query = supabase
    .from("tasks")
    .select("id, chapter, owner, title, status, due_date, notes, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ items: data || [] });
}

async function handleCreateTask(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const chapter = String(payload.chapter || "").trim();
  const owner = String(payload.owner || "").trim();
  const title = String(payload.title || "").trim();
  const status = String(payload.status || "open").trim().toLowerCase();

  if (!chapter || !owner || !title) {
    return jsonResponse({ error: "chapter, owner, and title are required" }, 400);
  }

  const row = {
    chapter,
    owner,
    title,
    status: status || "open",
    due_date: payload.due_date ? String(payload.due_date) : null,
    notes: payload.notes ? String(payload.notes) : null,
  };

  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("id, chapter, owner, title, status, due_date, notes, created_at, updated_at")
    .single();

  if (error || !data) {
    return jsonResponse({ error: error?.message || "Failed to create task" }, 500);
  }

  return jsonResponse({ item: data }, 201);
}

async function handleUpdateTask(request: Request, taskId: string) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const patch: Record<string, unknown> = {};
  const stringFields = ["chapter", "owner", "title", "status", "notes", "due_date"];
  for (const field of stringFields) {
    if (payload[field] !== undefined) {
      patch[field] = payload[field] === null ? null : String(payload[field]).trim();
    }
  }

  if (!Object.keys(patch).length) {
    return jsonResponse({ error: "No fields to update" }, 400);
  }

  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select("id, chapter, owner, title, status, due_date, notes, created_at, updated_at")
    .single();

  if (error || !data) {
    return jsonResponse({ error: error?.message || "Failed to update task" }, 500);
  }

  return jsonResponse({ item: data });
}

async function handleMetrics() {
  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("updates")
    .select("status, is_risk, pax_actual");

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  const rows = data || [];
  const totalUpdates = rows.length;
  let completed = 0;
  let inProgress = 0;
  let openRisks = 0;
  let totalPaxActual = 0;

  for (const row of rows) {
    const status = String(row.status || "").trim().toLowerCase();
    if (status === "completed") completed += 1;
    if (status === "in progress" || status === "in_progress" || status === "ongoing") inProgress += 1;
    if (row.is_risk) openRisks += 1;
    totalPaxActual += Number(row.pax_actual || 0);
  }

  return jsonResponse({
    totalUpdates,
    completed,
    inProgress,
    openRisks,
    totalPaxActual,
  });
}

async function handleListUpdates(request: Request) {
  const supabase = supabaseClient();
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || "12");
  const limit = Math.max(1, Math.min(100, Number.isFinite(requestedLimit) ? requestedLimit : 12));

  const { data, error } = await supabase
    .from("updates")
    .select("id, chapter, owner, title, status, event_date, notes, pax_target, pax_actual, is_risk, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return jsonResponse({ error: error.message }, 500);
  }

  return jsonResponse({ items: data || [] });
}

async function handleCreateUpdate(request: Request) {
  const payload = await request.json().catch(() => null);
  if (!payload) {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

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
    .select("id, chapter, owner, title, status, event_date, notes, pax_target, pax_actual, is_risk, created_at")
    .single();

  if (error || !data) {
    return jsonResponse({ error: error?.message || "Insert failed" }, 500);
  }

  const telegram = await notifyTelegram(data as UpdateRow);

  return jsonResponse({
    item: data,
    telegram,
  }, 201);
}

async function handleTelegramWebhook(request: Request) {
  // Webhook secret checks are intentionally disabled.
  // Telegram requests are accepted without token validation.

  const update = await request.json().catch(() => null);
  if (!update) {
    return jsonResponse({ error: "Invalid Telegram payload" }, 400);
  }

  const message = update?.message;
  const text = String(message?.text || "").trim();
  const chatId = message?.chat?.id;

  if (!text || !chatId || !text.startsWith("/")) {
    return jsonResponse({ ok: true, ignored: true });
  }

  const reply = await handleTelegramCommand(text);
  await sendTelegramMessage(String(chatId), reply);

  return jsonResponse({ ok: true });
}

async function handleTelegramCommand(commandText: string): Promise<string> {
  const [command, ...tail] = commandText.split(" ");
  const normalized = command.toLowerCase();

  function formatSection(title: string, lines: string[]): string {
    return [title, "", ...lines].join("\n");
  }

  function splitCommandParts(raw: string): string[] {
    const input = raw.trim();
    if (!input) return [];
    if (input.includes("|")) {
      return input.split("|").map((s) => s.trim()).filter(Boolean);
    }
    if (input.includes(";")) {
      return input.split(";").map((s) => s.trim()).filter(Boolean);
    }
    return [input];
  }

  function parseKeyValueParts(raw: string): Record<string, string> {
    const map: Record<string, string> = {};
    const parts = splitCommandParts(raw);

    for (const part of parts) {
      const idx = part.indexOf(":");
      if (idx <= 0) continue;

      const key = part.slice(0, idx).trim().toLowerCase().replace(/\s+/g, "_");
      const value = part.slice(idx + 1).trim();
      if (!value) continue;
      map[key] = value;
    }

    return map;
  }

  if (normalized === "/start" || normalized === "/help") {
    return formatSection("Dashboard Bot Commands", [
      "Here are the commands you can use:",
      "/latest - Show DSU",
      "/dsu - Show DSU",
      "/risk - Show open risk updates",
      "/risks - Alias of /risk",
      "/tasks - Show latest tasks",
      "/task_add - Add a task (supports freeform)",
      "/task_update - Update a task (supports freeform)",
      "/help - Show this help message",
      "",
      "You can send task commands in either format:",
      "- Positional: /task_add chapter | owner | title | due_date(optional) | notes(optional)",
      "- Freeform: /task_add chapter: Zamboanga; owner: Ana; title: Prepare venue; due: 2026-04-20; notes: Waiting for permit",
      "",
      "Update examples:",
      "- Positional: /task_update 3f9b2c1a | in progress | Permit follow-up done",
      "- Freeform: /task_update id: 3f9b2c1a; status: in progress; notes: Permit follow-up done",
    ]);
  }

  const supabase = supabaseClient();

  async function resolveTaskId(taskRef: string): Promise<string | null> {
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

  if (normalized === "/latest") {
    return buildDsuMessage(supabase);
  }

  if (normalized === "/dsu") {
    return buildDsuMessage(supabase);
  }

  if (normalized === "/risk" || normalized === "/risks") {
    const { data, error } = await supabase
      .from("updates")
      .select("chapter, title, owner, status")
      .eq("is_risk", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error && !isMissingRelationError(error)) return `Failed to load risk updates: ${error.message}`;

    if (!data?.length) {
      try {
        const fallback = await listDashboardEvents({ limit: 10, risksOnly: true, openOnly: true });
        if (!fallback.length) return "No open risk updates.";

        const lines = ["Here are the current risk items (from dashboard events):"];
        for (const item of fallback) {
          lines.push(`- ${item.chapter}`);
          lines.push(`  Status: ${item.status}`);
          lines.push(`  Title: ${item.title}`);
        }
        return formatSection("Open Risk Updates", lines);
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : "fallback failed";
        return `Failed to load risk updates: ${message}`;
      }
    }

    const lines = ["Here are the current open risk updates:"];
    for (const item of data) {
      lines.push(`- ${item.chapter}`);
      lines.push(`  Status: ${item.status}`);
      lines.push(`  Owner: ${item.owner}`);
      lines.push(`  Title: ${item.title}`);
    }
    return formatSection("Open Risk Updates", lines);
  }

  if (normalized === "/tasks") {
    const { data, error } = await supabase
      .from("tasks")
      .select("id, chapter, owner, title, status, due_date")
      .order("updated_at", { ascending: false })
      .limit(10);

    if (error && !isMissingRelationError(error)) return `Failed to load tasks: ${error.message}`;

    if (!data?.length) {
      try {
        const fallback = await listDashboardEvents({ limit: 10, openOnly: true });
        if (!fallback.length) return "No tasks yet.";

        const lines = ["Here are the latest tasks (from open dashboard events):"];
        for (const item of fallback) {
          lines.push(`- ${item.chapter}`);
          lines.push(`  Status: ${item.status}`);
          lines.push(`  Title: ${item.title}`);
          lines.push(`  Due: ${item.dueDate || "n/a"}`);
        }
        return formatSection("Latest Tasks", lines);
      } catch (fallbackError) {
        const message = fallbackError instanceof Error ? fallbackError.message : "fallback failed";
        return `Failed to load tasks: ${message}`;
      }
    }

    const lines = ["Here are your latest tasks:"];
    for (const item of data) {
      lines.push(`- Task ID: ${String(item.id).slice(0, 8)}`);
      lines.push(`  Chapter: ${item.chapter}`);
      lines.push(`  Status: ${item.status}`);
      lines.push(`  Title: ${item.title}`);
      lines.push(`  Due: ${item.due_date || "n/a"}`);
    }
    return formatSection("Latest Tasks", lines);
  }

  if (normalized === "/task_add") {
    const raw = tail.join(" ");
    const keyValues = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const chapter = (keyValues.chapter || keyValues.group || keyValues.team || parts[0] || "").trim();
    const owner = (keyValues.owner || keyValues.lead || keyValues.assignee || parts[1] || "").trim();
    const title = (keyValues.title || keyValues.task || keyValues.name || parts[2] || "").trim();
    const dueDate = (keyValues.due || keyValues.due_date || keyValues.deadline || parts[3] || "").trim();
    const notes = (keyValues.notes || keyValues.note || parts[4] || "").trim();

    if (!chapter || !owner || !title) {
      return [
        "I could not parse that task clearly.",
        "Try either:",
        "- /task_add chapter | owner | title | due_date(optional) | notes(optional)",
        "- /task_add chapter: Zamboanga; owner: Ana; title: Prepare venue; due: 2026-04-20; notes: Waiting for permit",
      ].join("\n");
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        chapter,
        owner,
        title,
        status: "open",
        due_date: dueDate || null,
        notes: notes || null,
      })
      .select("id, chapter, owner, title, status, due_date")
      .single();

    if (error || !data) {
      return `Failed to add task: ${error?.message || "unknown error"}`;
    }

    return formatSection("Task Added", [
      `Done. I added a new task for ${data.chapter}.`,
      `Task ID: ${String(data.id).slice(0, 8)}`,
      `Owner: ${data.owner}`,
      `Status: ${data.status}`,
      `Title: ${data.title}`,
      `Due: ${data.due_date || "n/a"}`,
    ]);
  }

  if (normalized === "/task_update") {
    const raw = tail.join(" ");
    const keyValues = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const taskRef = (keyValues.id || keyValues.task_id || keyValues.task || parts[0] || "").trim();
    const status = (keyValues.status || keyValues.state || parts[1] || "").trim();
    const notes = (keyValues.notes || keyValues.note || parts[2] || "").trim();

    if (!taskRef || !status) {
      return [
        "I could not parse that update clearly.",
        "Try either:",
        "- /task_update task_id | status | notes(optional)",
        "- /task_update id: 3f9b2c1a; status: in progress; notes: Permit follow-up done",
      ].join("\n");
    }

    const taskId = await resolveTaskId(taskRef);
    if (!taskId) {
      return `Task not found for reference: ${taskRef}`;
    }

    const patch: { status: string; notes?: string } = { status };
    if (notes) patch.notes = notes;

    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", taskId)
      .select("id, chapter, title, status")
      .single();

    if (error || !data) {
      return `Failed to update task: ${error?.message || "unknown error"}`;
    }

    return formatSection("Task Updated", [
      `Done. I updated task ${String(data.id).slice(0, 8)}.`,
      `Status: ${data.status}`,
      `Chapter: ${data.chapter}`,
      `Title: ${data.title}`,
    ]);
  }

  return formatSection("Unknown Command", [
    "I did not recognize that command.",
    "Use /help to see the full command list and examples.",
  ]);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const route = normalizeRoute(new URL(request.url).pathname);

    if (request.method === "GET" && route === "/health") {
      return jsonResponse({ ok: true, timestamp: new Date().toISOString() });
    }

    if (request.method === "GET" && route === "/metrics") {
      return await handleMetrics();
    }

    if (request.method === "GET" && route === "/dashboard") {
      return await handleDashboard();
    }

    if (request.method === "GET" && route === "/updates") {
      return await handleListUpdates(request);
    }

    if (request.method === "POST" && route === "/updates") {
      return await handleCreateUpdate(request);
    }

    if (request.method === "GET" && route === "/tasks") {
      return await handleListTasks(request);
    }

    if (request.method === "POST" && route === "/tasks") {
      return await handleCreateTask(request);
    }

    if (request.method === "PATCH" && routeId(route, "/tasks")) {
      return await handleUpdateTask(request, routeId(route, "/tasks") as string);
    }

    if (request.method === "POST" && route === "/telegram/webhook") {
      return await handleTelegramWebhook(request);
    }

    return jsonResponse({ error: `Not found: ${route}` }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonResponse({ error: message }, 500);
  }
});
