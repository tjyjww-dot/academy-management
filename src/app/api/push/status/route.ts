import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

// GET: 현재 사용자의 활성 푸시 구독 여부 확인
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ subscribed: false });
    }
    const decoded = verifyToken(token) as any;
    const count = await prisma.webPushSubscription.count({
      where: { userId: decoded.userId, isActive: true },
    });
    return NextResponse.json({ subscribed: count > 0 });
  } catch {
    return NextResponse.json({ subscribed: false });
  }
}
