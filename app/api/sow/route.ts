export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/auth'
import { getSOW, saveSOWEntry, getApprovedFiles } from '@/lib/store'

async function getUser(req: NextRequest) {
  const token = req.cookies.get('ms_session')?.value
  if (!token) return null
  return verifySession(token)
}

export async function GET(req: NextRequest) {
  const user = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sow = await getSOW()

  // Build approved-count map: clientName → { total, byType }
  const approved = await getApprovedFiles()
  const now = new Date()
  const currentMonth = now.toLocaleString('en-US', { month: 'long', year: 'numeric' }) // e.g. "June 2026"

  // Deduplicate approved by taskName+client — same logic as /api/approved GET
  const seen = new Map<string, typeof approved[0]>()
  for (const f of approved) {
    const key = (f.taskName || '') + '|' + (f.clientName || '')
    const existing = seen.get(key)
    if (!existing || Number(f.totalDrafts) >= Number(existing.totalDrafts)) seen.set(key, f)
  }
  const dedupedApproved = [...seen.values()]

  const progress: Record<string, { total: number; byType: Record<string, number> }> = {}
  for (const f of dedupedApproved) {
    if (f.sowMonth !== currentMonth) continue
    if (!progress[f.clientName]) progress[f.clientName] = { total: 0, byType: {} }
    progress[f.clientName].total++
    const t = f.deliverableType || 'Other'
    progress[f.clientName].byType[t] = (progress[f.clientName].byType[t] || 0) + 1
  }

  return NextResponse.json({ sow, progress, month: currentMonth })
}

export async function POST(req: NextRequest) {
  const user = await getUser(req)
  if (!user || user.role !== 'pm') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entry = await req.json()
  await saveSOWEntry(entry)
  return NextResponse.json(entry)
}
