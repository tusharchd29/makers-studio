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
  checklistJson?: string  // JSON array of checked item strings
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

export const VIDEO_CHECKLIST: { section: string; items: string[] }[] = [
  { section: 'Content & Copy', items: [
    'No spelling mistakes in on-screen text or subtitles',
    'Subtitles are timed correctly and fully legible',
    'CTA is clearly visible at the end for 2–3 seconds',
    'Instagram Reels must not exceed 40 seconds in duration',
  ]},
  { section: 'Audio & Sync', items: [
    'Voiceover is clear and well-paced',
    'Lip sync is accurate throughout',
    'Music is balanced — doesn\'t drown out voiceover',
    'No unwanted noise, echo, or audio gaps',
  ]},
  { section: 'Visuals & Motion', items: [
    'First 3 seconds have a strong hook',
    'Transitions and animations are smooth',
    'No pixelated, blurry, or watermarked footage',
    'No awkward cropping of faces or key elements',
  ]},
  { section: 'Brand & Export', items: [
    'Logo is correctly placed and undistorted',
    'Brand colors and fonts are used throughout',
    'Exported in correct format, dimensions, and duration',
    'Final file reviewed on actual screen before sending',
  ]},
]

export const GRAPHIC_CHECKLIST: { section: string; items: string[] }[] = [
  { section: 'Copy & Message', items: [
    'No spelling, grammar, or punctuation errors',
    'Key message and CTA are clear and correctly worded',
    'Disclaimer or legal text is legible (if applicable)',
  ]},
  { section: 'Visual & Layout', items: [
    'Clean composition with proper visual hierarchy',
    'All elements are aligned — nothing looks off or stray',
    'Adequate whitespace, not cluttered',
    'No blurry, pixelated, or low-res images',
    'Minimal text on creative — avoid large blocks of copy',
  ]},
  { section: 'Brand', items: [
    'Correct logo with clear space, no distortion',
    'Brand colors and fonts used throughout',
    'No off-brand visuals or competitor elements',
  ]},
  { section: 'Export & Specs', items: [
    'Correct dimensions and aspect ratio as per brief',
    'Safe zone respected — key content not near edges',
    'Exported in correct format, resolution, and file size',
    'All required variants/sizes delivered',
  ]},
]

// Flat list of all items for a given designer type
export function getChecklistItems(designerType?: string): string[] {
  const sections = designerType === 'graphic' ? GRAPHIC_CHECKLIST : VIDEO_CHECKLIST
  return sections.flatMap(s => s.items)
}

export function getChecklistSections(designerType?: string) {
  return designerType === 'graphic' ? GRAPHIC_CHECKLIST : VIDEO_CHECKLIST
}

// Keep for backward compat
export const CHECKLIST_ITEMS = VIDEO_CHECKLIST.flatMap(s => s.items)
