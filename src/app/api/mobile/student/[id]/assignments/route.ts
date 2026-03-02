import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/student/:id/assignments
 * 학생의 과제 목록을 조회합니다.
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

    // 학생이 등록된 수업의 과제 + 제출 현황
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      select: { classroomId: true },
    });

    const classroomIds = enrollments.map((e: any) => e.classroomId);

    const assignments = await prisma.assignment.findMany({
      where: { classroomId: { in: classroomIds } },
      orderBy: { dueDate: 'desc' },
      include: {
        classroom: { include: { subject: true } },
        submissions: {
          where: { studentId },
        },
      },
    });

    return NextResponse.json(
      assignments.map((a: any) => {
        const submission = a.submissions[0];
        return {
          id: a.id,
          title: a.title,
          description: a.description,
          dueDate: a.dueDate,
          assignmentDate: a.assignmentDate,
          classroom: a.classroom.name,
          subject: a.classroom.subject.name,
          submission: submission
            ? {
                status: submission.status,
                submittedAt: submission.submittedAt,
                score: submission.score,
                feedback: submission.feedback,
              }
            : {
                status: 'NOT_SUBMITTED',
                submittedAt: null,
                score: null,
                feedback: null,
              },
        };
      })
    );
  } catch (error) {
    console.error('Get assignments error:', error);
    return NextResponse.json(
      { error: '과제 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
