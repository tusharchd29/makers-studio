export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getTasks, getSubmissions } from '@/lib/store'
import { notifyPMDeadlineAlert } from '@/lib/notify'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [tasks, submissions] = await Promise.all([getTasks(), getSubmissions()])
  const approvedTaskIds = new Set(submissions.filter(s => s.status === 'approved').map(s => s.taskId))
  const pendingTasks = tasks.filter(t => !approvedTaskIds.has(t.id))

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const alertTasks = pendingTasks
    .filter(t => t.deadline)
    .map(t => {
      const deadline = new Date(t.deadline)
      deadline.setHours(0, 0, 0, 0)
      const daysLeft = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
      return { ...t, daysLeft }
    })
    .filter(t => t.daysLeft <= 2)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  if (alertTasks.length > 0) {
    await notifyPMDeadlineAlert(alertTasks.map(t => ({
      taskName: t.name,
      clientName: t.clientName,
      assignedTo: t.assignedTo,
      deadline: t.deadline,
      daysLeft: t.daysLeft,
    })))
  }

  return NextResponse.json({ ok: true, alerted: alertTasks.length })
}
