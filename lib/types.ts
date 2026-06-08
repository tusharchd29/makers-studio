export type UserRole       = 'designer' | 'pm'
export type DesignerType   = 'video' | 'graphic'
export type DeliverableType = 'Reel' | 'Story' | 'Static' | 'Carousel' | 'YouTube Short' | 'Product Video' | 'Photo'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'revision'
export type FileType       = 'videos' | 'photos'

export interface User {
  name: string; role: UserRole; designerType?: DesignerType
}

export interface Client {
  id: string; name: string
}

export interface SOWEntry {
  clientId: string; serviceType: string; totalCreatives: number
  priority: string; status: string
  reels: number; stories: number; statics: number
  videos: number; photos: number; carousels: number; youtubeShorts: number
}

// Designer-side statuses (set by designer on their work progress)
export type DesignerStatus = 'not-started' | 'processing' | 'hold' | 'done'

// PM-side statuses (only available after designer marks 'done' + PM approves submission)
export type PMStatus = 'ready-to-post' | 'posted'

// Combined for storage — PM fields stored separately
export type TaskStatus = DesignerStatus

export interface Task {
  id: string; clientId: string; clientName: string; name: string
  deliverableType: DeliverableType; assignedTo: string
  deadline: string; brief?: string; createdAt: string; createdBy: string
  sowMonth: string
  asanaGid?: string
  // Designer-controlled
  taskStatus?: TaskStatus
  holdReason?: string
  priority?: 'none' | 'high'
  // PM-controlled
  pmStatus?: PMStatus       // 'ready-to-post' | 'posted' — set by PM after approval
  pmNotes?: string
  // Postings app sync
  postingId?: string        // ID returned from Postings app after auto-create
}

export const DESIGNER_STATUS_META: Record<DesignerStatus, { label: string; color: string; bg: string }> = {
  'not-started': { label: 'Not Started', color: '#aaa',    bg: '#f0f0f0'   },
  'processing':  { label: 'Processing',  color: '#5b9cf6', bg: '#5b9cf618' },
  'hold':        { label: 'On Hold',     color: '#ff9b4e', bg: '#ff9b4e18' },
  'done':        { label: 'Done',        color: '#4ede8c', bg: '#4ede8c18' },
}

export const PM_STATUS_META: Record<PMStatus, { label: string; color: string; bg: string }> = {
  'ready-to-post': { label: 'Ready to Post', color: '#a855f7', bg: '#a855f718' },
  'posted':        { label: 'Posted ✓',      color: '#22c55e', bg: '#22c55e18' },
}

// A single draft submission (gets overwritten on resubmit)
export interface Submission {
  id: string; taskId: string; taskName: string
  clientName: string; designerName: string
  deliverableType: DeliverableType; fileType: string
  fileName: string; storagePath: string; viewUrl: string
  draftNumber: number; status: SubmissionStatus
  designerNote: string; pmComment: string
  submittedAt: string; reviewedAt?: string; reviewedBy?: string
}

// Revision history entry (append-only log for Excel export)
export interface RevisionEntry {
  id: string; taskId: string; taskName: string
  clientName: string; designerName: string
  draftNumber: number; storagePath: string; viewUrl: string
  designerNote: string; pmComment: string; status: string
  submittedAt: string; reviewedAt?: string; reviewedBy?: string
}

// Final approved file
export interface ApprovedFile {
  id: string; taskId: string; taskName: string
  clientName: string; designerName: string
  sowMonth: string; deliverableType: string
  storagePath: string; viewUrl: string
  totalDrafts: number; approvedAt: string; approvedBy: string
}

// All 20 clients — exact names matching Postings app SOW sheet
export const CLIENTS: Client[] = [
  { id: 'summarizex', name: 'SummarizeX' },
  { id: 'pyarababy', name: 'PyaraBaby' },
  { id: 'courtesy-honda', name: 'Courtesy Honda' },
  { id: 'shecare', name: 'SheCare' },
  { id: 'ssw', name: 'SSW' },
  { id: 'volvo', name: 'Volvo' },
  { id: 'veriseek', name: 'VeriSeek' },
  { id: 'asia-cosmetic', name: 'Asia Cosmetic' },
  { id: 'lmk-finance', name: 'LMK Finance' },
  { id: 'honda', name: 'Honda' },
  { id: 'faith-diagnostic', name: 'Faith Diagnostic' },
  { id: 'pratha-pre-school', name: 'Pratha Pre School' },
  { id: 'tress-lounge', name: 'Tress Lounge' },
  { id: 'north-international', name: 'North International' },
  { id: 'manthan', name: 'Manthan Work Spaces' },
  { id: 'softradix', name: 'Softradix' },
  { id: 'outlander', name: 'Outlander' },
  { id: 'kia', name: 'Kia' },
  { id: 'social-magnet', name: 'Social Magnet' },
  { id: 'body-temple', name: 'Body Temple' },
]
export const USERS = [
  { name: 'Anshu',    role: 'designer' as UserRole, designerType: 'video'   as DesignerType },
  { name: 'Amit',     role: 'designer' as UserRole, designerType: 'video'   as DesignerType },
  { name: 'Himanshu', role: 'designer' as UserRole, designerType: 'video'   as DesignerType },
  { name: 'Ranjeet',  role: 'designer' as UserRole, designerType: 'graphic' as DesignerType },
  { name: 'PM',       role: 'pm'       as UserRole },
]

export const DELIVERABLE_TYPES: DeliverableType[] = [
  'Reel', 'Story', 'Static', 'Carousel', 'YouTube Short', 'Product Video', 'Photo'
]

export const SOW_MONTHS = () => {
  const months = []
  const d = new Date()
  for (let i = -1; i <= 3; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() + i, 1)
    months.push(m.toLocaleString('en-US', { month: 'long', year: 'numeric' }))
  }
  return months
}

export const CHECKLIST_ITEMS = [
  'Color corrected',
  'Exported at correct resolution',
  'Caption / text added',
  'Client brief followed',
  'Audio synced',
  'Brand kit used correctly',
  'Subtitles added',
]
