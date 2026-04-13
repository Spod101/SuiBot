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
- POST /telegram/webhook

## 1) Configure environment variables

Copy .env.example into your Supabase Edge Functions environment:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_WEBHOOK_SECRET (optional, recommended for production)

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

## Notes

- GET /dashboard returns dashboard summary and timeline countdowns using Asia/Manila date/time.
- POST /updates still saves to Supabase even if Telegram fails.
- Telegram command support: /start, /help, /latest, /risk, /tasks, /task_add, /task_update
- Webhook secret enforcement is optional. If TELEGRAM_WEBHOOK_SECRET is not set, webhook calls are accepted without secret verification.
