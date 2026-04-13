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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const providedSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (expectedSecret && expectedSecret !== providedSecret) {
    return jsonResponse({ error: "Invalid webhook secret" }, 401);
  }

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
  const normalized = commandText.split(" ")[0].toLowerCase();

  if (normalized === "/start" || normalized === "/help") {
    return [
      "Available commands:",
      "/latest - show the latest updates",
      "/risk - show open risk updates",
      "/help - show this help",
    ].join("\n");
  }

  const supabase = supabaseClient();

  if (normalized === "/latest") {
    const { data, error } = await supabase
      .from("updates")
      .select("chapter, title, status, created_at")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) return `Failed to load updates: ${error.message}`;
    if (!data?.length) return "No updates yet.";

    const lines = ["Latest updates:"];
    for (const item of data) {
      lines.push(`- ${item.chapter} | ${item.status} | ${item.title}`);
    }
    return lines.join("\n");
  }

  if (normalized === "/risk") {
    const { data, error } = await supabase
      .from("updates")
      .select("chapter, title, owner, status")
      .eq("is_risk", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return `Failed to load risk updates: ${error.message}`;
    if (!data?.length) return "No open risk updates.";

    const lines = ["Open risk updates:"];
    for (const item of data) {
      lines.push(`- ${item.chapter} | ${item.status} | ${item.owner} | ${item.title}`);
    }
    return lines.join("\n");
  }

  return "Unknown command. Try /help.";
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

    if (request.method === "GET" && route === "/updates") {
      return await handleListUpdates(request);
    }

    if (request.method === "POST" && route === "/updates") {
      return await handleCreateUpdate(request);
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
