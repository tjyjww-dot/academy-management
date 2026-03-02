import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';
import { sendPushToRole } from '@/lib/push-notification';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const announcements = await prisma.announcement.findMany({
      orderBy: {
        publishDate: 'desc',
      },
    });

    return NextResponse.json(announcements);
  } catch (error) {
    console.error('Announcements GET error:', error);
    return NextResponse.json(
      { error: '공지 조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const body = await request.json();
    const { title, content, targetRole, expiryDate } = body;

    if (!title || !content || !targetRole) {
      return NextResponse.json(
        { error: '필수 필드 누락' },
        { status: 400 }
      );
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        targetRole,
        expiryDate: expiryDate || null,
        isActive: true,
      },
    });

    // 푸시 알림 발송 (비동기, 실패해도 공지 생성은 유지)
    try {
      await sendPushToRole(
        targetRole,
        `[공지] ${title}`,
        content.length > 100 ? content.substring(0, 100) + '...' : content,
        { type: 'announcement', announcementId: announcement.id }
      );
    } catch (pushError) {
      console.error('Push notification failed:', pushError);
    }

    return NextResponse.json(announcement);
  } catch (error) {
    console.error('Announcements POST error:', error);
    return NextResponse.json(
      { error: '공지 생성 실패' },
      { status: 500 }
    );
  }
}
