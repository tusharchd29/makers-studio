export type UserRole = 'designer' | 'pm'
export type DesignerType = 'video' | 'graphic'
export type DeliverableType = 'Reel' | 'Story' | 'Static' | 'Carousel' | 'YouTube Short' | 'Product Video' | 'Photo'
export type SubmissionStatus = 'pending' | 'approved' | 'rejected' | 'revision'
export type FileType = 'video' | 'photo'

export interface User {
  name: string
  role: UserRole
  designerType?: DesignerType
}

export interface Client {
  id: string
  name: string
  driveFolderId?: string
}

export interface SOWEntry {
  clientId: string
  reels: number
  stories: number
  statics: number
  videos: number
  photos: number
  carousels: number
  youtubeShorts: number
}

export interface Task {
  id: string
  clientId: string
  clientName: string
  name: string
  deliverableType: DeliverableType
  assignedTo: string
  deadline: string
  brief?: string
  createdAt: string
  createdBy: string
}

export interface Submission {
  id: string
  taskId: string
  taskName: string
  clientId: string
  clientName: string
  designerName: string
  deliverableType: DeliverableType
  fileType: FileType
  fileName: string
  driveFileId: string
  driveViewUrl: string
  drivePath: string
  version: number
  status: SubmissionStatus
  pmComment?: string
  checklist: string[]
  notes?: string
  submittedAt: string
  reviewedAt?: string
  reviewedBy?: string
}

export const CLIENTS: Client[] = [
  { id: 'asia-cosmetic', name: 'Asia Cosmetic', driveFolderId: '1mgiy4yZgxYPqKJB6S5NTOojZEHHe_W1W' },
  { id: 'courtesy-honda', name: 'Courtesy Honda', driveFolderId: '1AiNzvEFsvTdBum_ZuEfrnvmDNNDzAfQz' },
  { id: 'faith-diagnostic', name: 'Faith Diagnostic', driveFolderId: '1AM3dcfxMUm1_DvTJCqlibwvg7jjfaLMe' },
  { id: 'pratha-pre-school', name: 'Pratha Pre School', driveFolderId: '1rwteM7HLl4IBn9kBZvffe9v2MSgWcxos' },
  { id: 'pyarababy', name: 'PyaraBaby', driveFolderId: '1DtZ0oKSaiKoQ_GR_IaF1gFxSePrmB7iM' },
  { id: 'shecare-360', name: 'SheCare 360', driveFolderId: '1589GGQNgn50LQzdzavizj5QCbTFCej_3' },
  { id: 'ssw', name: 'SSW', driveFolderId: '1M6bJXTuIO8lAU_7XMAujQhR9jR5SJ1bO' },
  { id: 'berkeley', name: 'Berkeley', driveFolderId: '1dn6ixyPF6iz2KPLZrDK5F9oK3a0I6wVT' },
  { id: 'manthan', name: 'Manthan', driveFolderId: '10n6LiBCLvYSHPRlgDw5-AesMtmGqvOJx' },
  { id: 'veriseek', name: 'VeriSeek', driveFolderId: '1l3EyAcc9TlBqU6Wmo-GxxZiaY5mNtKve' },
  { id: 'summarizex', name: 'SummarizeX', driveFolderId: '1ntG8VezmTA2fclVuhaBtPpsZv0kz2XqZ' },
  { id: 'outlanders', name: 'Outlanders', driveFolderId: '1DNNRqx3O62Wq66OsenRwNIZd_WrJKvnN' },
]

export const USERS = [
  { name: 'Anshu', role: 'designer' as UserRole, designerType: 'video' as DesignerType },
  { name: 'Amit', role: 'designer' as UserRole, designerType: 'video' as DesignerType },
  { name: 'Ranjeet', role: 'designer' as UserRole, designerType: 'graphic' as DesignerType },
  { name: 'PM', role: 'pm' as UserRole },
]

export const DELIVERABLE_TYPES: DeliverableType[] = [
  'Reel', 'Story', 'Static', 'Carousel', 'YouTube Short', 'Product Video', 'Photo'
]

export const CHECKLIST_ITEMS = [
  'Color corrected',
  'Exported at correct resolution',
  'Caption / text added',
  'Client brief followed',
  'Audio synced',
  'Brand kit used correctly',
  'Subtitles added',
]
