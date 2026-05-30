import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Makers Studio — Meraki Ads',
  description: 'Creative asset submission and review platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="bg-content">
          {children}
        </div>
      </body>
    </html>
  )
}
