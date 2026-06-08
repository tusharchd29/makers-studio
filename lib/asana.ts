// ── Asana API helper — all Asana interactions for Makers Studio ──────────────
// Uses same PAT + workspace as meraki-task-dashboard.
// Set ASANA_PAT in Vercel env vars (same value used in meraki-task-dashboard).
// All functions are fire-and-forget safe — failures never block Makers Studio.

const ASANA_PAT     = process.env.ASANA_PAT!
const WORKSPACE_GID = process.env.ASANA_WORKSPACE_GID || '1136684103770054'
const BASE          = 'https://app.asana.com/api/1.0'

function asanaHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${ASANA_PAT}`,
    'Content-Type': 'application/json',
  }
}

// ── Designer first-name → Asana user GID cache ───────────────────────────
// Makers Studio knows "Anshu". Asana knows "Anshu Kumari". We map by first name.
let _designerGids: Record<string, string> | null = null

async function getDesignerGids(): Promise<Record<string, string>> {
  if (_designerGids) return _designerGids
  try {
    const res  = await fetch(
      `${BASE}/workspaces/${WORKSPACE_GID}/users?opt_fields=name,gid`,
      { headers: asanaHeaders() }
    )
    const data = await res.json()
    const map: Record<string, string> = {}
    for (const u of (data.data || [])) {
      const firstName = (u.name as string).split(' ')[0]
      map[firstName] = u.gid
    }
    _designerGids = map
    return map
  } catch { return {} }
}

// ── Asana task shape returned to Makers Studio ───────────────────────────
export interface AsanaTask {
  gid:          string
  name:         string
  due_on:       string | null
  notes:        string
  projectGid:   string
  projectName:  string
  assigneeGid:  string | null
  assigneeName: string | null
}

// ── Fetch all active Asana projects (for PM to pick when creating manual task) ─
export async function fetchAsanaProjects(): Promise<{ gid: string; name: string }[]> {
  try {
    const res = await fetch(
      `${BASE}/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,gid&limit=100&archived=false`,
      { headers: asanaHeaders() }
    )
    const data = await res.json()
    return (data.data || []).map((p: { gid: string; name: string }) => ({ gid: p.gid, name: p.name }))
  } catch { return [] }
}

// ── Create a brand-new task in Asana (for manual tasks created in Makers Studio) ─
export async function createAsanaTask(opts: {
  name:            string
  projectGid:      string
  designerName:    string
  deliverableType: string
  sowMonth:        string
  brief:           string
  deadline:        string
  clientName:      string
  pmName:          string
}): Promise<string | null> {  // returns new task GID or null on failure
  try {
    const gidMap      = await getDesignerGids()
    const assigneeGid = gidMap[opts.designerName] || null

    const notes = [
      `Client: ${opts.clientName}`,
      `Deliverable: ${opts.deliverableType}`,
      `Assigned to: ${opts.designerName}`,
      `SOW Month: ${opts.sowMonth}`,
      opts.brief ? `Brief: ${opts.brief}` : null,
      '',
      `Created via Makers Studio by ${opts.pmName}`,
    ].filter((l): l is string => l !== null).join('\n')

    const body: Record<string, unknown> = {
      name:      opts.name,
      notes,
      projects:  [opts.projectGid],
      workspace: WORKSPACE_GID,
    }
    if (opts.deadline) body.due_on = opts.deadline
    if (assigneeGid)   body.assignee = assigneeGid

    const res = await fetch(`${BASE}/tasks`, {
      method:  'POST',
      headers: asanaHeaders(),
      body:    JSON.stringify({ data: body }),
    })
    const data = await res.json()
    const newGid = data.data?.gid || null

    if (newGid) {
      await addAsanaComment(newGid,
        `📋 Created from Makers Studio by ${opts.pmName} — ${opts.deliverableType} for ${opts.clientName}`
      )
    }
    return newGid
  } catch { return null }
}

// ── Fetch all incomplete tasks across all Asana projects ─────────────────
export async function fetchAsanaTasks(): Promise<AsanaTask[]> {
  const projRes = await fetch(
    `${BASE}/workspaces/${WORKSPACE_GID}/projects?opt_fields=name,gid&limit=100&archived=false`,
    { headers: asanaHeaders() }
  )
  const projects: { gid: string; name: string }[] = (await projRes.json()).data || []

  const all: AsanaTask[] = []
  await Promise.all(projects.map(async (project) => {
    try {
      const params = new URLSearchParams({
        project:         project.gid,
        completed_since: 'now',
        opt_fields:      'name,due_on,notes,assignee.name,assignee.gid,completed',
        limit:           '100',
      })
      const res  = await fetch(`${BASE}/tasks?${params}`, { headers: asanaHeaders() })
      const data = await res.json()
      for (const t of (data.data || []).filter((t: { completed: boolean }) => !t.completed)) {
        all.push({
          gid:          t.gid,
          name:         t.name,
          due_on:       t.due_on   || null,
          notes:        t.notes    || '',
          projectGid:   project.gid,
          projectName:  project.name,
          assigneeGid:  t.assignee?.gid  || null,
          assigneeName: t.assignee?.name || null,
        })
      }
    } catch { /* skip failed project, never block */ }
  }))

  return all
}

// ── Set assignee on Asana task ────────────────────────────────────────────
export async function setAsanaAssignee(taskGid: string, designerFirstName: string): Promise<void> {
  try {
    const gidMap      = await getDesignerGids()
    const assigneeGid = gidMap[designerFirstName]
    if (!assigneeGid) return // designer not in Asana workspace — skip silently
    await fetch(`${BASE}/tasks/${taskGid}`, {
      method:  'PUT',
      headers: asanaHeaders(),
      body:    JSON.stringify({ data: { assignee: assigneeGid } }),
    })
  } catch { /* never block */ }
}

// ── Update notes/description on Asana task ───────────────────────────────
export async function setAsanaNotes(taskGid: string, notes: string): Promise<void> {
  try {
    await fetch(`${BASE}/tasks/${taskGid}`, {
      method:  'PUT',
      headers: asanaHeaders(),
      body:    JSON.stringify({ data: { notes } }),
    })
  } catch { /* never block */ }
}

// ── Add a comment (story) to Asana task ──────────────────────────────────
export async function addAsanaComment(taskGid: string, text: string): Promise<void> {
  try {
    await fetch(`${BASE}/tasks/${taskGid}/stories`, {
      method:  'POST',
      headers: asanaHeaders(),
      body:    JSON.stringify({ data: { text } }),
    })
  } catch { /* never block */ }
}

// ── Mark Asana task complete ──────────────────────────────────────────────
export async function completeAsanaTask(taskGid: string): Promise<void> {
  try {
    await fetch(`${BASE}/tasks/${taskGid}`, {
      method:  'PUT',
      headers: asanaHeaders(),
      body:    JSON.stringify({ data: { completed: true } }),
    })
  } catch { /* never block */ }
}

// ── Sync on import: PM imports task + assigns designer ───────────────────
// Called once when PM clicks "Import" in Makers Studio.
// Sets assignee, writes structured brief to notes, adds audit comment.
export async function syncImportToAsana(opts: {
  taskGid:         string
  designerName:    string
  deliverableType: string
  sowMonth:        string
  brief:           string
  pmName:          string
}): Promise<void> {
  const notes = [
    `Deliverable: ${opts.deliverableType}`,
    `Assigned to: ${opts.designerName}`,
    `SOW Month: ${opts.sowMonth}`,
    opts.brief ? `Brief: ${opts.brief}` : null,
    '',
    `Imported via Makers Studio by ${opts.pmName}`,
  ].filter((l): l is string => l !== null).join('\n')

  await Promise.all([
    setAsanaAssignee(opts.taskGid, opts.designerName),
    setAsanaNotes(opts.taskGid, notes),
    addAsanaComment(opts.taskGid,
      `📋 Imported into Makers Studio — assigned to ${opts.designerName} (${opts.deliverableType})`
    ),
  ])
}

// ── Sync on edit: PM edits an already-imported task ──────────────────────
// Updates assignee + notes. No new comment (avoid noise).
export async function syncEditToAsana(opts: {
  taskGid:         string
  designerName:    string
  deliverableType: string
  sowMonth:        string
  brief:           string
  pmName:          string
}): Promise<void> {
  const notes = [
    `Deliverable: ${opts.deliverableType}`,
    `Assigned to: ${opts.designerName}`,
    `SOW Month: ${opts.sowMonth}`,
    opts.brief ? `Brief: ${opts.brief}` : null,
    '',
    `Last updated in Makers Studio by ${opts.pmName}`,
  ].filter((l): l is string => l !== null).join('\n')

  await Promise.all([
    setAsanaAssignee(opts.taskGid, opts.designerName),
    setAsanaNotes(opts.taskGid, notes),
  ])
}
