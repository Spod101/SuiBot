import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handleDashboard, handleMetrics } from './handlers/dashboard'
import { handleListUpdates, handleCreateUpdate } from './handlers/updates'
import { handleListTasks, handleCreateTask, handleUpdateTask, handleDeleteTask } from './handlers/tasks'
import { handleCronDsu } from './handlers/cron'
import { handleTelegramWebhook } from './telegram/webhook'

const app = new Hono()

app.use('*', cors())

// Health
app.get('/api/health', (c) => c.json({ ok: true, timestamp: new Date().toISOString() }))

// Dashboard
app.get('/api/dashboard', () => handleDashboard())
app.get('/api/metrics',   () => handleMetrics())

// Updates
app.get ('/api/updates', (c) => handleListUpdates(c.req.raw))
app.post('/api/updates', (c) => handleCreateUpdate(c.req.raw))

// Tasks
app.get   ('/api/tasks',     (c) => handleListTasks(c.req.raw))
app.post  ('/api/tasks',     (c) => handleCreateTask(c.req.raw))
app.patch ('/api/tasks/:id', (c) => handleUpdateTask(c.req.raw, c.req.param('id')))
app.delete('/api/tasks/:id', (c) => handleDeleteTask(c.req.param('id')))

// Cron — called by cron-job.org
app.get ('/api/dsu', (c) => handleCronDsu(c.req.raw))
app.post('/api/dsu', (c) => handleCronDsu(c.req.raw))

// Telegram webhook
app.post('/api/telegram/webhook', (c) => handleTelegramWebhook(c.req.raw))

const port = Number(process.env.PORT) || 3000
serve({ fetch: app.fetch, port }, () => {
  console.log(`Server running on http://localhost:${port}`)
})
