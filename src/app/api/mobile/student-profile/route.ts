import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/student-profile
 * 학생 역할로 로그인한 사용자의 학생 프로필을 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    if (user.role !== 'STUDENT') {
      return NextResponse.json({ error: '학생 계정만 접근 가능합니다.' }, { status: 403 });
    }

    // User와 연결된 Student 조회
    const student = await prisma.student.findUnique({
      where: { userId: user.userId },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            classroom: {
              include: { subject: true, teacher: { select: { name: true } } },
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: '학생 정보가 연결되지 않았습니다.' }, { status: 404 });
    }

    return NextResponse.json({
      id: student.id,
      name: student.name,
      studentNumber: student.studentNumber,
      school: student.school,
      grade: student.grade,
      classrooms: student.enrollments.map((e: any) => ({
        id: e.classroom.id,
        name: e.classroom.name,
        subject: e.classroom.subject.name,
        teacher: e.classroom.teacher.name,
        schedule: e.classroom.schedule,
      })),
    });
  } catch (error) {
    console.error('Get student profile error:', error);
    return NextResponse.json(
      { error: '학생 프로필 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
