import { supabaseClient } from "../lib/client.ts";
import { jsonResponse } from "../lib/response.ts";
import { daysAwayFromManila, formatManilaLongDate } from "../lib/date.ts";
import {
  isCompletedStatus,
  isMissingRelationError,
  parseNumberOrDefault,
} from "../lib/validate.ts";
import type { DashboardConfigRow, DashboardEvent } from "../types.ts";

export async function handleDashboard(): Promise<Response> {
  const supabase = supabaseClient();

  const [{ data: rawConfigRows, error: configError }, { data: rawEventRows, error: eventError }] =
    await Promise.all([
      supabase.from("dashboard_config").select("key, value_text, value_number"),
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

  const config = new Map<string, { value_text: string | null; value_number: number | null }>();
  for (const row of (rawConfigRows || []) as DashboardConfigRow[]) {
    config.set(String(row.key), {
      value_text: row.value_text,
      value_number: row.value_number,
    });
  }

  const events = (rawEventRows || []) as DashboardEvent[];
  const codeCampEvents = events.filter((e) => e.event_kind === "code_camp");
  const codeCampsTotal = codeCampEvents.length;
  const codeCampsCompleted = codeCampEvents.filter((e) =>
    isCompletedStatus(String(e.status || ""))
  ).length;

  const formSubmissions = parseNumberOrDefault(config.get("form_submissions")?.value_number, 0);
  const trainedMentors = parseNumberOrDefault(config.get("trained_mentors")?.value_number, 0);
  const confirmedDeployments = parseNumberOrDefault(
    config.get("confirmed_deployments")?.value_number,
    0,
  );
  const completionRatePct = parseNumberOrDefault(
    config.get("completion_rate_pct")?.value_number,
    0,
  );
  const computerLabs = parseNumberOrDefault(config.get("computer_labs")?.value_number, 0);

  const deadlineText = config.get("q2_deadline")?.value_text || null;
  const q2DaysRemaining = daysAwayFromManila(deadlineText);
  const manilaDateLabel = formatManilaLongDate();

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
    events: events.map((e) => ({
      slug: e.slug,
      chapter: e.chapter,
      eventName: e.event_name,
      eventDate: e.event_date,
      eventKind: e.event_kind,
      status: e.status,
      paxTarget: e.pax_target,
      daysAway: daysAwayFromManila(e.event_date),
    })),
  });
}

export async function handleMetrics(): Promise<Response> {
  const supabase = supabaseClient();
  const { data, error } = await supabase
    .from("updates")
    .select("status, is_risk, pax_actual");

  if (error) return jsonResponse({ error: error.message }, 500);

  const rows = data || [];
  let completed = 0;
  let inProgress = 0;
  let openRisks = 0;
  let totalPaxActual = 0;

  for (const row of rows) {
    const status = String(row.status || "").trim().toLowerCase();
    if (isCompletedStatus(status)) completed += 1;
    if (status === "in progress" || status === "in_progress" || status === "ongoing") inProgress += 1;
    if (row.is_risk) openRisks += 1;
    totalPaxActual += Number(row.pax_actual || 0);
  }

  return jsonResponse({
    totalUpdates: rows.length,
    completed,
    inProgress,
    openRisks,
    totalPaxActual,
  });
}
