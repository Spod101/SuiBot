/**
 * Sui x DevCon CodeCamp — Dashboard Edge Function
 *
 * This file is the entry point. It only handles routing.
 * All business logic lives in the sub-modules below:
 *
 *   lib/           — shared utilities (client, response, date, validation)
 *   handlers/      — HTTP route handlers (dashboard, updates, tasks)
 *   telegram/      — Telegram bot (send, DSU builder, commands, webhook)
 *   types.ts       — shared TypeScript types
 */

import { corsHeaders, jsonResponse, normalizeRoute, routeId } from "./lib/response.ts";
import { handleDashboard, handleMetrics } from "./handlers/dashboard.ts";
import { handleListUpdates, handleCreateUpdate } from "./handlers/updates.ts";
import { handleListTasks, handleCreateTask, handleUpdateTask, handleDeleteTask } from "./handlers/tasks.ts";
import { handleTelegramWebhook } from "./telegram/webhook.ts";

Deno.serve(async (request) => {
  // Handle CORS pre-flight
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const route = normalizeRoute(new URL(request.url).pathname);
    const { method } = request;

    if (method === "GET"  && route === "/health")           return jsonResponse({ ok: true, timestamp: new Date().toISOString() });
    if (method === "GET"  && route === "/metrics")          return await handleMetrics();
    if (method === "GET"  && route === "/dashboard")        return await handleDashboard();
    if (method === "GET"  && route === "/updates")          return await handleListUpdates(request);
    if (method === "POST" && route === "/updates")          return await handleCreateUpdate(request);
    if (method === "GET"  && route === "/tasks")            return await handleListTasks(request);
    if (method === "POST" && route === "/tasks")            return await handleCreateTask(request);
    if (method === "POST" && route === "/telegram/webhook") return await handleTelegramWebhook(request);

    const taskId = routeId(route, "/tasks");
    if (taskId) {
      if (method === "PATCH")  return await handleUpdateTask(request, taskId);
      if (method === "DELETE") return await handleDeleteTask(taskId);
    }

    return jsonResponse({ error: `Not found: ${route}` }, 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    return jsonResponse({ error: message }, 500);
  }
});
