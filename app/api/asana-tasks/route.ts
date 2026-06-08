export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getTasks } from '@/lib/store'
import { fetchAsanaTasks } from '@/lib/asana'

// GET /api/asana-tasks
// Returns all incomplete Asana tasks that have NOT yet been imported into Makers Studio.
// PM uses this to see what's available to pull in.
export async function GET(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await verifySession(token)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Fetch all Asana tasks + all already-imported tasks in parallel
    const [asanaTasks, importedTasks] = await Promise.all([
      fetchAsanaTasks(),
      getTasks(),
    ])

    // Build a set of already-imported Asana GIDs so we can filter them out
    const importedGids = new Set(
      importedTasks
        .map(t => t.asanaGid)
        .filter((g): g is string => Boolean(g))
    )

    // Return only tasks not yet imported
    const pending = asanaTasks.filter(t => !importedGids.has(t.gid))

    return NextResponse.json(pending)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
