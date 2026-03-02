import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/announcements
 * 공지사항 목록을 조회합니다 (학부모/학생용).
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        targetRole: { in: ['ALL', 'PARENT', 'STUDENT'] },
      },
      orderBy: { publishDate: 'desc' },
      take: 20,
    });

    return NextResponse.json(
      announcements.map((a: any) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        targetRole: a.targetRole,
        publishDate: a.publishDate.toISOString(),
        expiryDate: a.expiryDate,
      }))
    );
  } catch (error) {
    console.error('Get announcements error:', error);
    return NextResponse.json(
      { error: '공지사항 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
