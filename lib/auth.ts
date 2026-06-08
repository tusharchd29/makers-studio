import { SignJWT, jwtVerify } from 'jose'
import { User } from './types'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'makers-studio-secret-2026'
)

const PINS: Record<string, { role: 'designer' | 'pm'; designerType?: 'video' | 'graphic' }> = {
  Anshu:    { role: 'designer', designerType: 'video' },
  Amit:     { role: 'designer', designerType: 'video' },
  Himanshu: { role: 'designer', designerType: 'video' },
  Ranjeet:  { role: 'designer', designerType: 'graphic' },
  PM:       { role: 'pm' },
}

const PIN_VALUES: Record<string, string> = {
  Anshu:    process.env.PIN_ANSHU    || '2841',
  Amit:     process.env.PIN_AMIT     || '5973',
  Himanshu: process.env.PIN_HIMANSHU || '7391',
  Ranjeet:  process.env.PIN_RANJEET  || '6127',
  PM:       process.env.PIN_PM       || '3456',
}

export function verifyPin(name: string, pin: string): User | null {
  const expected = PIN_VALUES[name]
  if (!expected || pin !== expected) return null
  const config = PINS[name]
  if (!config) return null
  return { name, role: config.role, designerType: config.designerType }
}

export async function createSession(user: User): Promise<string> {
  return await new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('12h')
    .sign(JWT_SECRET)
}

export async function verifySession(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return (payload as { user: User }).user
  } catch {
    return null
  }
}

export function getCurrentMonth(): string {
  return new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })
}
