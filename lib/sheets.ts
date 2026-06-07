// ── Activity Log via Supabase ─────────────────────────────────────────────
// Google Sheets removed. All logging goes to Supabase activity_log table.
import { getSupabase } from './supabase'

// ── Log an activity event ─────────────────────────────────────────────────
export async function logActivity(
  user: string,
  action: string,
  entity: string,
  detail: string,
  pmComment = '',
  designerNote = ''
): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('activity_log').insert({
      user_name:     user,
      action,
      entity,
      detail,
      pm_comment:    pmComment,
      designer_note: designerNote,
      created_at:    new Date().toISOString(),
    })
  } catch { /* never block main flow */ }
}

// ── Submission lock (duplicate upload guard) ──────────────────────────────
export async function acquireLock(taskId: string, designerName: string): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('submission_locks')
      .select('locked_at')
      .eq('task_id', taskId)
      .single()

    if (data) {
      const age = Date.now() - new Date(data.locked_at).getTime()
      if (age < 10 * 60 * 1000) return false // still locked
      // Expired — remove stale lock
      await supabase.from('submission_locks').delete().eq('task_id', taskId)
    }

    await supabase.from('submission_locks').insert({
      task_id:     taskId,
      locked_at:   new Date().toISOString(),
      locked_by:   designerName,
    })
    return true
  } catch { return true } // fail open
}

export async function releaseLock(taskId: string): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('submission_locks').delete().eq('task_id', taskId)
  } catch { /* ignore */ }
}

// ── SOW approved count increment ─────────────────────────────────────────
export async function incrementSOWApprovedCount(clientId: string): Promise<void> {
  try {
    const supabase = getSupabase()
    const { data } = await supabase
      .from('sow')
      .select('approved_count')
      .eq('client_id', clientId)
      .single()
    if (!data) return
    await supabase.from('sow')
      .update({ approved_count: (data.approved_count || 0) + 1 })
      .eq('client_id', clientId)
  } catch { /* never block */ }
}
