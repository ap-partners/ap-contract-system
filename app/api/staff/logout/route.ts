import { NextRequest, NextResponse } from 'next/server'
import { clearStaffSessionCookie } from '@/lib/staffAuth'

export async function POST(_req: NextRequest) {
  const res = NextResponse.json({ success: true })
  clearStaffSessionCookie(res)
  return res
}
