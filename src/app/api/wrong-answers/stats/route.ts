import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get('classroomId');
    const studentId = searchParams.get('studentId');

    const where: Record<string, unknown> = {};
    if (classroomId) where.classroomId = classroomId;
    if (studentId) where.studentId = studentId;

    // 강사(TEACHER)는 본인 담당반만 통계 집계
    if (payload.role === 'TEACHER') {
      const myClassrooms = await prisma.classroom.findMany({
        where: { teacherId: payload.userId },
        select: { id: true },
      });
      const myClassroomIds = myClassrooms.map(c => c.id);
      if (classroomId) {
        if (!myClassroomIds.includes(classroomId)) {
          return NextResponse.json({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });
        }
      } else {
        where.classroomId = { in: myClassroomIds.length > 0 ? myClassroomIds : ['__none__'] };
      }
    }

    const [totalActive, totalMastered, totalTests, pendingTests] = await Promise.all([
      prisma.wrongAnswer.count({ where: { ...where, status: 'ACTIVE' } }),
      prisma.wrongAnswer.count({ where: { ...where, status: 'MASTERED' } }),
      prisma.wrongAnswerTest.count({ where }),
      prisma.wrongAnswerTest.count({ where: { ...where, status: 'PENDING' } }),
    ]);

    return NextResponse.json({
      totalActive,
      totalMastered,
      totalTests,
      pendingTests,
      masteryRate: totalActive + totalMastered > 0
        ? Math.round((totalMastered / (totalActive + totalMastered)) * 100)
        : 0,
    });
  } catch (error) {
    console.error('통계 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
