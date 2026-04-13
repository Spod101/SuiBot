# Dashboard API (Supabase Edge Functions)

This folder contains the API for the dashboard in ../apr13-latest-sui-devcon-dashboard.html.

## Endpoints

The function exposes these routes:
- GET /health
- GET /metrics
- GET /updates?limit=12
- POST /updates
- POST /telegram/webhook

## 1) Configure environment variables

Copy .env.example into your Supabase Edge Functions environment:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- TELEGRAM_BOT_TOKEN
- TELEGRAM_CHAT_ID
- TELEGRAM_WEBHOOK_SECRET

## 2) Create database table

Apply migration:
- supabase db push

The migration file is:
- supabase/migrations/20260414_create_updates_table.sql

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

## Notes

- POST /updates still saves to Supabase even if Telegram fails.
- Telegram command support: /start, /help, /latest, /risk
