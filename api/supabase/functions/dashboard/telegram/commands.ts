import { supabaseClient } from "../lib/client.ts";
import { isMissingRelationError } from "../lib/validate.ts";
import { buildDsuMessage, listDashboardEvents } from "./dsu.ts";
import { formatSection, parseKeyValueParts, resolveTaskId, splitCommandParts } from "./helpers.ts";

export async function handleTelegramCommand(commandText: string): Promise<string> {
  const tokens = commandText.trim().split(/\s+/).filter(Boolean);
  const command = (tokens[0] || "").toLowerCase();
  const subcommand = (tokens[1] || "").toLowerCase();
  let normalized = command;
  let tail = tokens.slice(1);

  // Normalize "/task <sub>" two-word commands
  if (command === "/task") {
    if (subcommand === "add")                           { normalized = "/task_add";    tail = tokens.slice(2); }
    else if (subcommand === "assign")                   { normalized = "/task_assign"; tail = tokens.slice(2); }
    else if (subcommand === "update" || subcommand === "edit")   { normalized = "/task_update"; tail = tokens.slice(2); }
    else if (subcommand === "delete" || subcommand === "remove") { normalized = "/task_delete"; tail = tokens.slice(2); }
    else if (subcommand === "list"   || subcommand === "show")   { normalized = "/tasks";       tail = tokens.slice(2); }
    else if (subcommand === "help")                     { normalized = "/help";        tail = tokens.slice(2); }
  }

  // Single-word aliases
  const aliases: Record<string, string> = {
    "/addtask":    "/task_add",
    "/assigntask": "/task_assign",
    "/updatetask": "/task_update",
    "/edittask":   "/task_update",
    "/deletetask": "/task_delete",
    "/removetask": "/task_delete",
    "/listtasks":  "/tasks",
    "/showtasks":  "/tasks",
    "/add":        "/task_add",
    "/assign":     "/task_assign",
    "/update":     "/task_update",
    "/edit":       "/task_update",
    "/delete":     "/task_delete",
    "/remove":     "/task_delete",
    "/list":       "/tasks",
    "/show":       "/tasks",
    "/done":       "/task_done",
  };
  if (aliases[command]) normalized = aliases[command];

  // ── /help ──────────────────────────────────────────────────────────────────
  if (normalized === "/start" || normalized === "/help") {
    return formatSection("Dashboard Bot Commands", [
      "Here are the commands you can use:",
      "",
      "📋 READING",
      "/latest or /dsu — Show full Daily Stand-Up report",
      "/risk or /risks — Show open risk updates",
      "/tasks or /list or /task list — Show latest tasks",
      "",
      "✅ TASK MANAGEMENT",
      "/add — Add a new task",
      "/done <id> — Mark a task as done (quick shorthand)",
      "/assign — Assign a task to someone",
      "/update or /edit — Update a task",
      "/delete or /remove — Delete a task by ID",
      "",
      "ℹ️ OTHER",
      "/help or /start — Show this help message",
      "",
      "Legacy commands (still supported): /task_add, /task_assign, /task_update, /task_delete",
      "",
      "── SYNTAX ──",
      "Commands accept positional or key:value format:",
      "",
      "Add examples:",
      "- /add chapter | owner | title | due_date | notes",
      "- /add chapter: Zamboanga; owner: Ana; title: Prepare venue; due: 2026-04-20; notes: Waiting for permit",
      "",
      "Done example:",
      "- /done 3f9b2c1a",
      "",
      "Assign examples:",
      "- /assign 3f9b2c1a | Ana",
      "- /assign id: 3f9b2c1a; assignee: Ana",
      "",
      "Update examples:",
      "- /update 3f9b2c1a | in progress | Permit follow-up done",
      "- /update id: 3f9b2c1a; status: in progress; notes: Permit follow-up done",
      "- /update id: 3f9b2c1a; title: Confirm venue; owner: Ana; due: 2026-04-20",
      "",
      "Delete examples:",
      "- /delete 3f9b2c1a",
      "- /delete id: 3f9b2c1a",
      "",
      "Tip: Task IDs can be the first 8 characters of the full UUID.",
    ]);
  }

  const supabase = supabaseClient();

  // ── /latest | /dsu ─────────────────────────────────────────────────────────
  if (normalized === "/latest" || normalized === "/dsu") {
    return buildDsuMessage(supabase);
  }

  // ── /risk | /risks ─────────────────────────────────────────────────────────
  if (normalized === "/risk" || normalized === "/risks") {
    const { data, error } = await supabase
      .from("updates")
      .select("chapter, title, owner, status")
      .eq("is_risk", true)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error && !isMissingRelationError(error)) {
      return `Failed to load risk updates: ${error.message}`;
    }

    if (!data?.length) {
      try {
        const fallback = await listDashboardEvents({ limit: 10, risksOnly: true, openOnly: true });
        if (!fallback.length) return "No open risk updates.";
        const lines = ["Here are the current risk items (from dashboard events):"];
        for (const item of fallback) {
          lines.push(`- ${item.chapter}`, `  Status: ${item.status}`, `  Title: ${item.title}`);
        }
        return formatSection("Open Risk Updates", lines);
      } catch (err) {
        return `Failed to load risk updates: ${err instanceof Error ? err.message : "fallback failed"}`;
      }
    }

    const lines = ["Here are the current open risk updates:"];
    for (const item of data) {
      lines.push(
        `- ${item.chapter}`,
        `  Status: ${item.status}`,
        `  Owner: ${item.owner}`,
        `  Title: ${item.title}`,
      );
    }
    return formatSection("Open Risk Updates", lines);
  }

  // ── /tasks | /list ─────────────────────────────────────────────────────────
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
          lines.push(
            `- ${item.chapter}`,
            `  Status: ${item.status}`,
            `  Title: ${item.title}`,
            `  Due: ${item.dueDate || "n/a"}`,
          );
        }
        return formatSection("Latest Tasks", lines);
      } catch (err) {
        return `Failed to load tasks: ${err instanceof Error ? err.message : "fallback failed"}`;
      }
    }

    const lines = ["Here are your latest tasks:"];
    for (const item of data) {
      lines.push(
        `- Task ID: ${String(item.id).slice(0, 8)}`,
        `  Chapter: ${item.chapter}`,
        `  Owner: ${item.owner}`,
        `  Status: ${item.status}`,
        `  Title: ${item.title}`,
        `  Due: ${item.due_date || "n/a"}`,
      );
    }
    return formatSection("Latest Tasks", lines);
  }

  // ── /task_add ──────────────────────────────────────────────────────────────
  if (normalized === "/task_add") {
    const raw = tail.join(" ");
    const kv = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const chapter = (kv.chapter || kv.group || kv.team || parts[0] || "").trim();
    const owner   = (kv.owner   || kv.lead  || kv.assignee || parts[1] || "").trim();
    const title   = (kv.title   || kv.task  || kv.name     || parts[2] || "").trim();
    const dueDate = (kv.due     || kv.due_date || kv.deadline || parts[3] || "").trim();
    const notes   = (kv.notes   || kv.note  || parts[4] || "").trim();

    if (!chapter || !owner || !title) {
      return [
        "I could not parse that task clearly.",
        "Try either:",
        "- /add chapter | owner | title | due_date(optional) | notes(optional)",
        "- /add chapter: Zamboanga; owner: Ana; title: Prepare venue; due: 2026-04-20; notes: Waiting for permit",
      ].join("\n");
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({ chapter, owner, title, status: "open", due_date: dueDate || null, notes: notes || null })
      .select("id, chapter, owner, title, status, due_date")
      .single();

    if (error || !data) return `Failed to add task: ${error?.message || "unknown error"}`;

    return formatSection("Task Added", [
      `Done. I added a new task for ${data.chapter}.`,
      `Task ID: ${String(data.id).slice(0, 8)}`,
      `Owner: ${data.owner}`,
      `Status: ${data.status}`,
      `Title: ${data.title}`,
      `Due: ${data.due_date || "n/a"}`,
    ]);
  }

  // ── /task_assign ───────────────────────────────────────────────────────────
  if (normalized === "/task_assign") {
    const raw = tail.join(" ");
    const kv = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const taskRef = (kv.id || kv.task_id || kv.task || parts[0] || "").trim();
    const assignee = (kv.assignee || kv.owner || kv.lead || parts[1] || "").trim();

    if (!taskRef || !assignee) {
      return [
        "I could not parse that assign request clearly.",
        "Try either:",
        "- /assign task_id | assignee",
        "- /assign id: 3f9b2c1a; assignee: Ana",
      ].join("\n");
    }

    const taskId = await resolveTaskId(supabase, taskRef);
    if (!taskId) return `Task not found for reference: ${taskRef}`;

    const { data, error } = await supabase
      .from("tasks")
      .update({ owner: assignee })
      .eq("id", taskId)
      .select("id, chapter, owner, title, status, due_date")
      .single();

    if (error || !data) return `Failed to assign task: ${error?.message || "unknown error"}`;

    return formatSection("Task Assigned", [
      `Done. I assigned task ${String(data.id).slice(0, 8)} to ${data.owner}.`,
      `Chapter: ${data.chapter}`,
      `Title: ${data.title}`,
      `Status: ${data.status}`,
      `Due: ${data.due_date || "n/a"}`,
    ]);
  }

  // ── /task_update ───────────────────────────────────────────────────────────
  if (normalized === "/task_update") {
    const raw = tail.join(" ");
    const kv = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const taskRef = (kv.id || kv.task_id || kv.task || parts[0] || "").trim();
    const status  = (kv.status || kv.state || parts[1] || "").trim();
    const notes   = (kv.notes  || kv.note  || parts[2] || "").trim();
    const chapter = (kv.chapter || kv.group || "").trim();
    const owner   = (kv.owner   || kv.lead  || kv.assignee || "").trim();
    const title   = (kv.title   || kv.task_title || kv.task || "").trim();
    const dueDate = (kv.due     || kv.due_date || kv.deadline || "").trim();

    if (!taskRef) {
      return [
        "I could not parse that update clearly.",
        "Try either:",
        "- /update task_id | status | notes(optional)",
        "- /update id: 3f9b2c1a; status: in progress; notes: Permit follow-up done",
        "- /update id: 3f9b2c1a; title: Confirm venue; owner: Ana; due: 2026-04-20",
      ].join("\n");
    }

    const taskId = await resolveTaskId(supabase, taskRef);
    if (!taskId) return `Task not found for reference: ${taskRef}`;

    const patch: Record<string, string | null> = {};
    if (status)  patch.status  = status;
    if (notes)   patch.notes   = notes;
    if (chapter) patch.chapter = chapter;
    if (owner)   patch.owner   = owner;
    if (title)   patch.title   = title;
    if (dueDate) {
      const nd = dueDate.toLowerCase();
      patch.due_date =
        nd === "none" || nd === "null" || nd === "clear" ? null : dueDate;
    }

    if (!Object.keys(patch).length) {
      return "No fields detected to update. Provide status, notes, title, owner, chapter, or due.";
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(patch)
      .eq("id", taskId)
      .select("id, chapter, owner, title, status, due_date")
      .single();

    if (error || !data) return `Failed to update task: ${error?.message || "unknown error"}`;

    return formatSection("Task Updated", [
      `Done. I updated task ${String(data.id).slice(0, 8)}.`,
      `Status: ${data.status}`,
      `Chapter: ${data.chapter}`,
      `Owner: ${data.owner}`,
      `Title: ${data.title}`,
      `Due: ${data.due_date || "n/a"}`,
    ]);
  }

  // ── /task_delete ───────────────────────────────────────────────────────────
  if (normalized === "/task_delete" || normalized === "/task_remove") {
    const raw = tail.join(" ");
    const kv = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const taskRef = (kv.id || kv.task_id || kv.task || parts[0] || "").trim();
    if (!taskRef) {
      return [
        "I could not parse the task ID.",
        "Try:",
        "- /delete 3f9b2c1a",
        "- /delete id: 3f9b2c1a",
      ].join("\n");
    }

    const taskId = await resolveTaskId(supabase, taskRef);
    if (!taskId) return `Task not found for reference: ${taskRef}`;

    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .select("id, chapter, title")
      .single();

    if (error || !data) return `Failed to delete task: ${error?.message || "unknown error"}`;

    return formatSection("Task Deleted", [
      `Done. I deleted task ${String(data.id).slice(0, 8)}.`,
      `Chapter: ${data.chapter}`,
      `Title: ${data.title}`,
    ]);
  }

  // ── /task_done (quick /done shorthand) ────────────────────────────────────
  if (normalized === "/task_done") {
    const raw = tail.join(" ");
    const kv = parseKeyValueParts(raw);
    const parts = splitCommandParts(raw);

    const taskRef = (kv.id || kv.task_id || kv.task || parts[0] || "").trim();
    if (!taskRef) {
      return ["Provide the task ID to mark as done.", "Example: /done 3f9b2c1a"].join("\n");
    }

    const taskId = await resolveTaskId(supabase, taskRef);
    if (!taskId) return `Task not found for reference: ${taskRef}`;

    const { data, error } = await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", taskId)
      .select("id, chapter, owner, title, status, due_date")
      .single();

    if (error || !data) {
      return `Failed to mark task as done: ${error?.message || "unknown error"}`;
    }

    return formatSection("Task Done", [
      `Task ${String(data.id).slice(0, 8)} marked as done.`,
      `Chapter: ${data.chapter}`,
      `Owner: ${data.owner}`,
      `Title: ${data.title}`,
    ]);
  }

  // ── Unknown ────────────────────────────────────────────────────────────────
  return formatSection("Unknown Command", [
    "I did not recognize that command.",
    "Use /help to see the full command list and examples.",
  ]);
}
