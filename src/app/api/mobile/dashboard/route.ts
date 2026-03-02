import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/dashboard?studentId=xxx
 * 학생의 대시보드 데이터를 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const studentId = request.nextUrl.searchParams.get('studentId');
    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    // 최근 성적 (최근 5개)
    const recentGrades = await prisma.grade.findMany({
      where: { studentId },
      orderBy: { testDate: 'desc' },
      take: 5,
      include: {
        classroom: { include: { subject: true } },
      },
    });

    // 이번 달 출결 통계
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        studentId,
        date: { startsWith: currentMonth },
      },
    });

    const attendance = {
      present: attendanceRecords.filter((r: any) => r.status === 'PRESENT').length,
      absent: attendanceRecords.filter((r: any) => r.status === 'ABSENT').length,
      late: attendanceRecords.filter((r: any) => r.status === 'LATE').length,
      excused: attendanceRecords.filter((r: any) => r.status === 'EXCUSED').length,
    };

    // 미제출 과제 수
    const pendingAssignments = await prisma.assignmentSubmission.count({
      where: {
        studentId,
        status: 'NOT_SUBMITTED',
      },
    });

    // 최근 공지사항 (최근 3개)
    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        targetRole: { in: ['ALL', 'PARENT', 'STUDENT'] },
      },
      orderBy: { publishDate: 'desc' },
      take: 3,
      select: {
        id: true,
        title: true,
        content: true,
        publishDate: true,
      },
    });

    return NextResponse.json({
      recentGrades: recentGrades.map((g: any) => ({
        id: g.id,
        testName: g.testName,
        score: g.score,
        maxScore: g.maxScore,
        testDate: g.testDate,
        classroom: g.classroom.name,
      })),
      attendance,
      pendingAssignments,
      announcements: announcements.map((a: any) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        publishDate: a.publishDate.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: '대시보드 데이터 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
