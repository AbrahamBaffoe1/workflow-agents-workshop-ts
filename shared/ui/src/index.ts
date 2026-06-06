/**
 * A mountable telemetry viewer. Provides the dashboard page and the read-only
 * APIs it polls. The host app supplies the write path (POST /api/reviews) and
 * mounts this at the root:
 *
 *   app.route('/', createUiRouter('Naive agent'))
 */
import { Hono } from 'hono'
import { getFindings, getReview, getSpans, listReviews } from '@workshop/db'
import { dashboardHtml } from './page.js'

export function createUiRouter(title: string): Hono {
  const app = new Hono()

  app.get('/', (c) => c.html(dashboardHtml(title)))

  app.get('/api/reviews', async (c) => c.json(await listReviews(50)))

  app.get('/api/reviews/:id', async (c) => {
    const id = c.req.param('id')
    const review = await getReview(id)
    if (!review) return c.json({ error: 'not found' }, 404)
    const [findings, spans] = await Promise.all([getFindings(id), getSpans(id)])
    return c.json({ review, findings, spans })
  })

  return app
}

export { dashboardHtml }
