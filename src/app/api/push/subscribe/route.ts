import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }
    const decoded = verifyToken(token) as any;
    const userId = decoded.userId;
    const body = await request.json();
    const { endpoint, keys } = body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: '유효하지 않은 구독 정보' }, { status: 400 });
    }
    const subscription = await prisma.webPushSubscription.upsert({
      where: { endpoint },
      update: { p256dh: keys.p256dh, auth: keys.auth, isActive: true, userId },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId },
    });
    return NextResponse.json({ success: true, id: subscription.id });
  } catch (error) {
    console.error('Push subscribe error:', error);
    return NextResponse.json({ error: '구독 저장 실패' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }
    const body = await request.json();
    const { endpoint } = body;
    if (endpoint) {
      await prisma.webPushSubscription.updateMany({
        where: { endpoint },
        data: { isActive: false },
      });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Push unsubscribe error:', error);
    return NextResponse.json({ error: '구독 해제 실패' }, { status: 500 });
  }
}
