import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/student/:id/grades?classroomId=xxx
 * 학생의 성적을 조회합니다.
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
    const classroomId = request.nextUrl.searchParams.get('classroomId');

    const where: Record<string, unknown> = { studentId };
    if (classroomId) {
      where.classroomId = classroomId;
    }

    const grades = await prisma.grade.findMany({
      where,
      orderBy: { testDate: 'desc' },
      include: {
        classroom: {
          include: { subject: true },
        },
      },
    });

    // 각 성적에 대해 반 평균 계산
    const gradesWithAvg = await Promise.all(
      grades.map(async (g: any) => {
        const avgResult = await prisma.grade.aggregate({
          where: {
            classroomId: g.classroomId,
            testName: g.testName,
            testDate: g.testDate,
          },
          _avg: { score: true },
          _count: { score: true },
        });

        return {
          id: g.id,
          testName: g.testName,
          score: g.score,
          maxScore: g.maxScore,
          testDate: g.testDate,
          remarks: g.remarks,
          classroom: g.classroom.name,
          classroomId: g.classroomId,
          subject: g.classroom.subject.name,
          classAverage: avgResult._avg.score != null
            ? Math.round(avgResult._avg.score * 10) / 10
            : null,
        };
      })
    );

    return NextResponse.json(gradesWithAvg);
  } catch (error) {
    console.error('Get grades error:', error);
    return NextResponse.json(
      { error: '성적 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
