export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Strip the Supabase function path prefix so route logic stays simple. */
export function normalizeRoute(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  const fnIndex = parts.indexOf("dashboard");
  if (fnIndex >= 0) {
    const nested = parts.slice(fnIndex + 1);
    return `/${nested.join("/")}`.replace(/\/$/, "") || "/";
  }
  return pathname.replace(/\/$/, "") || "/";
}

/** Extract the :id segment from a route like /tasks/abc-123. */
export function routeId(route: string, prefix: string): string | null {
  if (!route.startsWith(prefix + "/")) return null;
  const id = route.slice(prefix.length + 1).trim();
  return id || null;
}
