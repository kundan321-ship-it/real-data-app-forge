import { createFileRoute } from '@tanstack/react-router'
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth'

/**
 * Daily history cleanup — keeps only the last 7 days of measurements.
 * Called by the managed schedule "cleanup-wifi-history-7d"; every request
 * is authenticated with the platform's cron credential.
 */
export const Route = createFileRoute('/api/public/jobs/cleanup-history')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request)
        if (authFailure) return authFailure

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { error, count } = await supabaseAdmin
          .from('wifi_measurements')
          .delete()
          .lt('created_at', cutoff)
        if (error) {
          return Response.json({ success: false, error: error.message }, { status: 500 })
        }
        return Response.json({ success: true, deleted: count ?? 0 })
      },
    },
  },
})
