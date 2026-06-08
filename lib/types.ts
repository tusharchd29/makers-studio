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

export interface Task {
  id: string; clientId: string; clientName: string; name: string
  deliverableType: DeliverableType; assignedTo: string
  deadline: string; brief?: string; createdAt: string; createdBy: string
  sowMonth: string  // e.g. "June 2026" — which month this counts toward
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
  { name: 'Anshu',   role: 'designer' as UserRole, designerType: 'video'   as DesignerType },
  { name: 'Amit',    role: 'designer' as UserRole, designerType: 'video'   as DesignerType },
  { name: 'Ranjeet', role: 'designer' as UserRole, designerType: 'graphic' as DesignerType },
  { name: 'PM',      role: 'pm'       as UserRole },
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
