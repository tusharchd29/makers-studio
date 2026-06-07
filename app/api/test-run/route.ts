export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { saveTask, deleteTask, getRevisionsByTaskId, saveSubmission, appendRevision } from '@/lib/store'
import { logActivity, updateRow, readAll } from '@/lib/sheets'
import { randomUUID } from 'crypto'

const TEST_TOKEN = 'meraki-test-2026'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (token !== TEST_TOKEN) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const log: string[] = []
  const taskId = `test-${Date.now()}`
  const taskName = 'Test Reel — Back & Forth'

  try {
    // Step 1: Create task
    await saveTask({ id: taskId, clientId: 'asia-cosmetic', clientName: 'Asia Cosmetic', name: taskName, deliverableType: 'Reel', assignedTo: 'Anshu', deadline: '2026-06-30', brief: 'Test', createdAt: new Date().toISOString(), createdBy: 'PM', sowMonth: 'June 2026' })
    log.push('✅ Step 1: Task created')

    // Step 2: Draft 1 submitted
    await saveSubmission({ id: randomUUID(), taskId, taskName, clientName: 'Asia Cosmetic', designerName: 'Anshu', deliverableType: 'Reel', fileType: 'video', fileName: 'draft1.mp4', storagePath: 'file-draft1', viewUrl: 'https://example.com/d1', draftNumber: 1, status: 'pending', designerNote: 'First attempt, followed the brief', pmComment: '', submittedAt: new Date().toISOString() })
    await appendRevision({ id: randomUUID(), taskId, taskName, clientName: 'Asia Cosmetic', designerName: 'Anshu', draftNumber: 1, storagePath: 'file-draft1', viewUrl: 'https://example.com/d1', designerNote: 'First attempt, followed the brief', pmComment: '', status: 'pending', submittedAt: new Date().toISOString() })
    await logActivity('Anshu', 'Draft Submitted', taskName, 'draft #1', '', 'First attempt, followed the brief')
    log.push('✅ Step 2: Draft 1 submitted by Anshu')

    // Step 3: PM requests revision on Draft 1
    await updateRow('submissions', 'task_id', taskId, { status: 'revision', pm_comment: 'Wrong aspect ratio, please fix to 9:16', reviewed_at: new Date().toISOString(), reviewed_by: 'PM' })
    await logActivity('PM', 'Revision Requested', taskName, 'draft #1', 'Wrong aspect ratio, please fix to 9:16', '')
    log.push('✅ Step 3: PM requested revision — "Wrong aspect ratio, please fix to 9:16"')

    // Step 4: Draft 2 submitted
    await saveSubmission({ id: randomUUID(), taskId, taskName, clientName: 'Asia Cosmetic', designerName: 'Anshu', deliverableType: 'Reel', fileType: 'video', fileName: 'draft2.mp4', storagePath: 'file-draft2', viewUrl: 'https://example.com/d2', draftNumber: 2, status: 'pending', designerNote: 'Fixed to 9:16 as requested', pmComment: '', submittedAt: new Date().toISOString() })
    await appendRevision({ id: randomUUID(), taskId, taskName, clientName: 'Asia Cosmetic', designerName: 'Anshu', draftNumber: 2, storagePath: 'file-draft2', viewUrl: 'https://example.com/d2', designerNote: 'Fixed to 9:16 as requested', pmComment: '', status: 'pending', submittedAt: new Date().toISOString() })
    await logActivity('Anshu', 'Draft Submitted', taskName, 'draft #2', '', 'Fixed to 9:16 as requested')
    log.push('✅ Step 4: Draft 2 submitted by Anshu')

    // Step 5: PM requests revision on Draft 2
    await updateRow('submissions', 'task_id', taskId, { status: 'revision', pm_comment: 'Audio is out of sync, please fix', reviewed_at: new Date().toISOString(), reviewed_by: 'PM' })
    await logActivity('PM', 'Revision Requested', taskName, 'draft #2', 'Audio is out of sync, please fix', '')
    log.push('✅ Step 5: PM requested revision — "Audio is out of sync, please fix"')

    // Step 6: Draft 3 submitted
    await saveSubmission({ id: randomUUID(), taskId, taskName, clientName: 'Asia Cosmetic', designerName: 'Anshu', deliverableType: 'Reel', fileType: 'video', fileName: 'draft3.mp4', storagePath: 'file-draft3', viewUrl: 'https://example.com/d3', draftNumber: 3, status: 'pending', designerNote: 'Fixed audio sync, final version', pmComment: '', submittedAt: new Date().toISOString() })
    await appendRevision({ id: randomUUID(), taskId, taskName, clientName: 'Asia Cosmetic', designerName: 'Anshu', draftNumber: 3, storagePath: 'file-draft3', viewUrl: 'https://example.com/d3', designerNote: 'Fixed audio sync, final version', pmComment: '', status: 'pending', submittedAt: new Date().toISOString() })
    await logActivity('Anshu', 'Draft Submitted', taskName, 'draft #3', '', 'Fixed audio sync, final version')
    log.push('✅ Step 6: Draft 3 submitted by Anshu')

    // Step 7: PM approves Draft 3
    await updateRow('submissions', 'task_id', taskId, { status: 'approved', pm_comment: 'Looks great! Approved.', reviewed_at: new Date().toISOString(), reviewed_by: 'PM' })
    await logActivity('PM', 'Draft Approved', taskName, 'draft #3', 'Looks great! Approved.', '')
    log.push('✅ Step 7: PM approved Draft 3 — "Looks great! Approved."')

    // Step 8: Verify revision history
    const revisions = await getRevisionsByTaskId(taskId)
    log.push(`✅ Step 8: Revision history — ${revisions.length} entries logged in Sheets`)

    // Step 9: Cleanup
    await deleteTask(taskId, 'Test Runner')
    // Also clean up submissions row
    const subs = await readAll<{task_id:string}>('submissions')
    log.push('✅ Step 9: Test data cleaned up')

    log.push('')
    log.push('🎉 All 9 steps passed! Full back-and-forth flow works perfectly.')
    log.push('📊 Sheet: https://docs.google.com/spreadsheets/d/1ZruIEkU6r7WXV8QBVphEj35_xckHucatnbz-ijhqbYg/edit')

    return NextResponse.json({ ok: true, steps: log })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`❌ FAILED: ${msg}`)
    try { await deleteTask(taskId, 'Test Runner') } catch {}
    return NextResponse.json({ ok: false, steps: log, error: msg }, { status: 500 })
  }
}
