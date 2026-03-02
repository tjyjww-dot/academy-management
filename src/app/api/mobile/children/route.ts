import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/children
 * 학부모의 자녀 목록을 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    // 학부모-학생 관계에서 자녀 목록 조회
    const parentStudents = await prisma.parentStudent.findMany({
      where: { parentId: user.userId },
      include: {
        student: {
          include: {
            enrollments: {
              where: { status: 'ACTIVE' },
              include: {
                classroom: {
                  include: { subject: true },
                },
              },
            },
          },
        },
      },
    });

    const children = parentStudents.map((ps: any) => ({
      id: ps.student.id,
      name: ps.student.name,
      studentNumber: ps.student.studentNumber,
      school: ps.student.school,
      grade: ps.student.grade,
      status: ps.student.status,
      relation: ps.relation,
      classrooms: ps.student.enrollments.map((e: any) => ({
        id: e.classroom.id,
        name: e.classroom.name,
        subject: e.classroom.subject.name,
      })),
    }));

    return NextResponse.json(children);
  } catch (error) {
    console.error('Get children error:', error);
    return NextResponse.json(
      { error: '자녀 정보 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
