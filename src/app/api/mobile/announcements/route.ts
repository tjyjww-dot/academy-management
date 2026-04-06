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

    const baseList = announcements.map((a: any) => ({
      id: a.id,
      title: a.title,
      content: a.content,
      targetRole: a.targetRole,
      publishDate: a.publishDate.toISOString(),
      expiryDate: a.expiryDate,
    }));

    // 학부모인 경우: 자녀의 최근 dailyReport에 저장된 personalNote(전달사항)도
    // 공지 탭에 함께 표시. 학생용 응답에는 포함하지 않음.
    if (user.role === 'PARENT') {
      const parentLinks = await prisma.parentStudent.findMany({
        where: { parentId: user.userId },
        select: { studentId: true },
      });
      const studentIds = parentLinks.map((l) => l.studentId);
      if (studentIds.length > 0) {
        const reports = await prisma.dailyReport.findMany({
          where: { studentId: { in: studentIds } },
          orderBy: { date: 'desc' },
          take: 50,
          include: { student: { select: { name: true } } },
        });
        const personalItems: any[] = [];
        for (const r of reports) {
          if (!r.content) continue;
          let note = '';
          try {
            const parsed = JSON.parse(r.content);
            if (parsed && typeof parsed === 'object' && parsed.personalNote) {
              note = String(parsed.personalNote).trim();
            }
          } catch {}
          if (!note) continue;
          personalItems.push({
            id: 'pn-' + r.id,
            title: '✉️ ' + (r.student?.name || '') + ' 학생 전달사항',
            content: note,
            targetRole: 'PARENT',
            publishDate: new Date(r.date + 'T00:00:00').toISOString(),
            expiryDate: null,
          });
        }
        // 최신순 통합
        const merged = [...personalItems, ...baseList].sort(
          (a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
        );
        return NextResponse.json(merged);
      }
    }

    return NextResponse.json(baseList);
  } catch (error) {
    console.error('Get announcements error:', error);
    return NextResponse.json(
      { error: '공지사항 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
