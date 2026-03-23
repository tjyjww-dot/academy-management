import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/daily-reports?studentId=xxx&month=2026-02
 * 학생의 데일리 리포트를 조회합니다.
 * 학부모: 자녀의 리포트 조회
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const studentId = request.nextUrl.searchParams.get('studentId');
    const month = request.nextUrl.searchParams.get('month');
    const classroomId = request.nextUrl.searchParams.get('classroomId');

    if (!studentId) {
      return NextResponse.json({ error: '학생 ID가 필요합니다.' }, { status: 400 });
    }

    const where: any = { studentId };
    if (month) where.date = { startsWith: month };
    if (classroomId) where.classroomId = classroomId;

    const reports = await prisma.dailyReport.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 30,
      include: {
        classroom: {
          include: { subject: true },
        },
      },
    });

    return NextResponse.json(
      reports.map((r: any) => {
        // content가 JSON 형식이면 progressNote만 추출 (레거시 호환)
        let displayContent = r.content;
        try {
          const parsed = JSON.parse(r.content);
          if (parsed && typeof parsed === 'object' && 'progressNote' in parsed) {
            displayContent = parsed.progressNote || '';
          }
        } catch {
          // JSON이 아닌 레거시 데이터 - 그대로 사용
        }
        return {
          id: r.id,
          date: r.date,
          content: displayContent,
          homework: r.homework,
          attitude: r.attitude,
          specialNote: r.specialNote,
          classroom: r.classroom.name,
          subject: r.classroom.subject.name,
        };
      })
    );
  } catch (error) {
    console.error('Get daily reports error:', error);
    return NextResponse.json(
      { error: '데일리 리포트 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
