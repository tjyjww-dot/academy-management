import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/student/:id/attendance?month=2026-02
 * 학생의 출결 기록을 조회합니다.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const { id: studentId } = await params;
    const month = request.nextUrl.searchParams.get('month');

    const where: Record<string, unknown> = { studentId };
    if (month) {
      where.date = { startsWith: month };
    }

    const records = await prisma.attendanceRecord.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        classroom: true,
      },
    });

    // 요약 통계
    const summary = {
      total: records.length,
      present: records.filter((r: any) => r.status === 'PRESENT').length,
      absent: records.filter((r: any) => r.status === 'ABSENT').length,
      late: records.filter((r: any) => r.status === 'LATE').length,
      excused: records.filter((r: any) => r.status === 'EXCUSED').length,
    };

    return NextResponse.json({
      summary,
      records: records.map((r: any) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        checkInTime: r.checkInTime,
        remarks: r.remarks,
        classroom: r.classroom.name,
      })),
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    return NextResponse.json(
      { error: '출결 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
