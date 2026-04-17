# Dashboard API (Supabase Edge Functions)

This folder contains the API for the dashboard in ../apr13-latest-sui-devcon-dashboard.html.

## Endpoints

The function exposes these routes:
- GET /health
- GET /dashboard
- GET /metrics
- GET /updates?limit=12
- POST /updates
- GET /tasks?status=open&limit=25
- POST /tasks
- PATCH /tasks/:id
- DELETE /tasks/:id
- POST /telegram/webhook
- GET or POST /cron/dsu (send DSU to Telegram)

## 1) Configure environment variables

Copy .env.example into your Supabase Edge Functions environment:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_WEBHOOK_SECRET (optional, recommended for production)
- CRON_SECRET (recommended for cron endpoint auth)

## 2) Create database table

Apply migration:
- supabase db push

The migration files are:
- supabase/migrations/20260414_create_updates_table.sql
- supabase/migrations/202604140001_create_dashboard_tables.sql
- supabase/migrations/202604140002_add_dashboard_seed_data.sql
- supabase/migrations/202604140003_create_tasks_table.sql

## 3) Deploy function

Deploy this function folder:
- supabase/functions/dashboard

Example:
- supabase functions deploy dashboard --project-ref YOUR_PROJECT_REF

## 4) Point the dashboard to your API URL

Set the global variable before the dashboard script runs:

window.DASHBOARD_API_BASE = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/dashboard';

Or open the dashboard with a query parameter:
- ?apiBase=https://YOUR_PROJECT_REF.supabase.co/functions/v1/dashboard

## 5) Telegram webhook

Set webhook after deploy:
- https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://YOUR_PROJECT_REF.supabase.co/functions/v1/dashboard/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>

Without webhook secret (allowed for testing):
- https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://YOUR_PROJECT_REF.supabase.co/functions/v1/dashboard/telegram/webhook

## 6) Third-party cron URL for DSU

Use this URL in any scheduler (cron-job.org, EasyCron, GitHub Actions, etc.) to send DSU:
- https://YOUR_PROJECT_REF.supabase.co/functions/v1/dashboard/cron/dsu?secret=YOUR_CRON_SECRET

If you deployed on Vercel/Node instead of Supabase Edge Functions, use:
- https://YOUR_DOMAIN/api/dsu?secret=YOUR_CRON_SECRET

If you do not want a secret (open endpoint), use:
- https://YOUR_DOMAIN/api/dsu

Important:
- This no-secret URL works only when CRON_SECRET is NOT set in your runtime environment.
- If CRON_SECRET exists, requests without secret will return 401 Unauthorized.

Recommended setup:
- Method: GET
- Timezone: Asia/Manila
- Frequency: once daily at your target hour (example: 09:00)
- Retry: enabled (2 to 3 retries)

You can also send CRON_SECRET via header (x-cron-secret), but query param is easiest for most third-party cron providers.

## Notes

- GET /dashboard returns dashboard summary and timeline countdowns using Asia/Manila date/time.
- POST /updates still saves to Supabase even if Telegram fails.
- Telegram command support: /start, /help, /latest, /risk, /tasks, /add, /assign, /update, /delete, /list (also supports /task add, /task assign, /task update, /task delete, plus legacy /task_add, /task_assign, /task_update, /task_delete)
- Webhook secret enforcement is optional. If TELEGRAM_WEBHOOK_SECRET is not set, webhook calls are accepted without secret verification.
- Cron endpoint enforces CRON_SECRET when set. If CRON_SECRET is not configured, the endpoint is public.
