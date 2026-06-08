// Email notifications via Nodemailer
import nodemailer from 'nodemailer'

function getTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILER_PASSWORD,
    },
  })
}

const PM_EMAILS = [
  process.env.PM_EMAIL_1 || 'tusharchd29@gmail.com',
  process.env.PM_EMAIL_2,
].filter(Boolean) as string[]

function baseStyle() {
  return `
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #F2F5EE;
    padding: 32px 16px;
  `
}

function card(content: string) {
  return `
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
      <div style="background:#7DC242;padding:18px 24px;display:flex;align-items:center;gap:10px;">
        <span style="font-family:'Dancing Script',cursive;font-size:22px;color:#fff;font-weight:700;">
          <span style="color:#fff">meraki</span><span style="color:#29ABE2">ads</span>
        </span>
        <span style="color:rgba(255,255,255,0.7);font-size:13px;margin-left:8px;">Makers Studio</span>
      </div>
      <div style="padding:24px;">${content}</div>
      <div style="padding:12px 24px;background:#F2F5EE;font-size:11px;color:#aaa;text-align:center;">
        Makers Studio · Meraki Ads · Panchkula
      </div>
    </div>
  `
}

// ── Notify PM: new draft submitted ───────────────────────────────────────
export async function notifyPMNewSubmission(opts: {
  designerName: string
  taskName: string
  clientName: string
  draftNumber: number
  designerNote: string
  viewUrl: string
}) {
  if (!PM_EMAILS.length || !process.env.NODEMAILER_EMAIL) return
  try {
    const transporter = getTransporter()
    const html = `<div style="${baseStyle()}">${card(`
      <h2 style="margin:0 0 6px;font-size:16px;color:#3B6D11;">📤 New Draft Submitted</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#666;">A designer has submitted a draft for your review.</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#888;width:120px;">Designer</td><td style="font-weight:600;">${opts.designerName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Task</td><td style="font-weight:600;">${opts.taskName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Client</td><td>${opts.clientName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Draft #</td><td>${opts.draftNumber}</td></tr>
        ${opts.designerNote ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top;">Note</td><td style="font-style:italic;color:#555;">"${opts.designerNote}"</td></tr>` : ''}
      </table>
      ${opts.viewUrl ? `<a href="${opts.viewUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#7DC242;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">View File ↗</a>` : ''}
    `)}</div>`
    await transporter.sendMail({
      from: `"Makers Studio" <${process.env.NODEMAILER_EMAIL}>`,
      to: PM_EMAILS.join(','),
      subject: `[Makers Studio] Draft ${opts.draftNumber} — ${opts.taskName} (${opts.clientName})`,
      html,
    })
  } catch { /* never block main flow */ }
}

// ── Notify Designer: draft reviewed ──────────────────────────────────────
export async function notifyDesignerReviewed(opts: {
  designerEmail: string
  designerName: string
  taskName: string
  clientName: string
  draftNumber: number
  status: 'approved' | 'rejected' | 'revision'
  pmComment: string
  reviewedBy: string
  viewUrl?: string
}) {
  if (!opts.designerEmail || !process.env.NODEMAILER_EMAIL) return
  const statusMap = {
    approved: { emoji: '✅', label: 'Approved', color: '#4ede8c' },
    rejected:  { emoji: '❌', label: 'Rejected',  color: '#ff5f5f' },
    revision:  { emoji: '🔄', label: 'Revision Requested', color: '#5b9cf6' },
  }
  const s = statusMap[opts.status]
  try {
    const transporter = getTransporter()
    const html = `<div style="${baseStyle()}">${card(`
      <h2 style="margin:0 0 6px;font-size:16px;color:#3B6D11;">${s.emoji} Draft ${s.label}</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#666;">Your draft has been reviewed by ${opts.reviewedBy}.</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#888;width:120px;">Task</td><td style="font-weight:600;">${opts.taskName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Client</td><td>${opts.clientName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Draft #</td><td>${opts.draftNumber}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Status</td><td style="font-weight:700;color:${s.color};">${s.label}</td></tr>
        ${opts.pmComment ? `<tr><td style="padding:6px 0;color:#888;vertical-align:top;">PM Comment</td><td style="font-style:italic;color:#555;">"${opts.pmComment}"</td></tr>` : ''}
      </table>
      ${opts.status !== 'approved' ? `<p style="margin-top:16px;font-size:12px;color:#888;">Please review the comment above and resubmit when ready.</p>` : ''}
      ${opts.viewUrl ? `<a href="${opts.viewUrl}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#7DC242;color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">View File ↗</a>` : ''}
    `)}</div>`
    await transporter.sendMail({
      from: `"Makers Studio" <${process.env.NODEMAILER_EMAIL}>`,
      to: opts.designerEmail,
      subject: `[Makers Studio] Your draft was ${s.label} — ${opts.taskName}`,
      html,
    })
  } catch { /* never block main flow */ }
}

// ── Notify PM: designer put task on hold ──────────────────────────────────
export async function notifyPMOnHold(opts: {
  designerName: string
  taskName: string
  clientName: string
  holdReason: string
}) {
  if (!PM_EMAILS.length || !process.env.NODEMAILER_EMAIL) return
  try {
    const transporter = getTransporter()
    const html = `<div style="${baseStyle()}">${card(`
      <h2 style="margin:0 0 6px;font-size:16px;color:#ff9b4e;">⏸ Task Put On Hold</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#666;">${opts.designerName} has put a task on hold and needs your attention.</p>
      <table style="width:100%;font-size:13px;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#888;width:120px;">Designer</td><td style="font-weight:600;">${opts.designerName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Task</td><td style="font-weight:600;">${opts.taskName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;">Client</td><td>${opts.clientName}</td></tr>
        <tr><td style="padding:6px 0;color:#888;vertical-align:top;">Reason</td><td style="color:#ff9b4e;font-weight:600;">"${opts.holdReason}"</td></tr>
      </table>
      <p style="margin-top:16px;font-size:12px;color:#888;">Please review and resolve the blocker so the designer can continue.</p>
    `)}</div>`
    await transporter.sendMail({
      from: `"Makers Studio" <${process.env.NODEMAILER_EMAIL}>`,
      to: PM_EMAILS.join(','),
      subject: `[Makers Studio] ⏸ On Hold — ${opts.taskName} (${opts.clientName})`,
      html,
    })
  } catch { /* never block main flow */ }
}

// ── Notify PM: deadline alert (called from cron) ──────────────────────────
export async function notifyPMDeadlineAlert(tasks: {
  taskName: string
  clientName: string
  assignedTo: string
  deadline: string
  daysLeft: number
}[]) {
  if (!PM_EMAILS.length || !process.env.NODEMAILER_EMAIL || !tasks.length) return
  try {
    const transporter = getTransporter()
    const rows = tasks.map(t => `
      <tr style="border-bottom:1px solid #eee;">
        <td style="padding:8px 6px;font-weight:600;">${t.taskName}</td>
        <td style="padding:8px 6px;">${t.clientName}</td>
        <td style="padding:8px 6px;">${t.assignedTo}</td>
        <td style="padding:8px 6px;color:${t.daysLeft < 0 ? '#ff5f5f' : t.daysLeft <= 1 ? '#ff9b4e' : '#5b9cf6'};font-weight:700;">
          ${t.daysLeft < 0 ? `${Math.abs(t.daysLeft)}d overdue` : t.daysLeft === 0 ? 'Due today' : `${t.daysLeft}d left`}
        </td>
      </tr>
    `).join('')
    const html = `<div style="${baseStyle()}">${card(`
      <h2 style="margin:0 0 6px;font-size:16px;color:#3B6D11;">⏰ Deadline Alert</h2>
      <p style="margin:0 0 16px;font-size:13px;color:#666;">${tasks.length} task(s) need attention.</p>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        <thead><tr style="background:#F2F5EE;">
          <th style="padding:8px 6px;text-align:left;">Task</th>
          <th style="padding:8px 6px;text-align:left;">Client</th>
          <th style="padding:8px 6px;text-align:left;">Designer</th>
          <th style="padding:8px 6px;text-align:left;">Status</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `)}</div>`
    await transporter.sendMail({
      from: `"Makers Studio" <${process.env.NODEMAILER_EMAIL}>`,
      to: PM_EMAILS.join(','),
      subject: `[Makers Studio] ⏰ ${tasks.length} Task(s) Approaching Deadline`,
      html,
    })
  } catch { /* never block */ }
}
