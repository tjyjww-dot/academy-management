import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/wrong-answers?studentId=xxx
 * 모바일 앱에서 학생의 오답 현황을 조회합니다.
 * - STUDENT: 본인 데이터만
 * - PARENT: 자녀 데이터
 * - ADMIN/TEACHER: 모든 학생 데이터
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error: error || '인증 실패' }, { status: status || 401 });
    }

    const { searchParams } = new URL(request.url);
    let studentId = searchParams.get('studentId');

    // 학생 본인인 경우
    if (user.role === 'STUDENT') {
      const student = await prisma.student.findFirst({
        where: { userId: user.id },
      });
      if (!student) {
        return NextResponse.json({ error: '학생 정보를 찾을 수 없습니다.' }, { status: 404 });
      }
      studentId = student.id;
    }

    // 학부모인 경우 - 자녀 중 하나
    if (user.role === 'PARENT') {
      if (!studentId) {
        const parentLinks = await prisma.parentStudent.findMany({
          where: { parentId: user.id },
          include: { student: true },
        });
        if (parentLinks.length === 0) {
          return NextResponse.json({ error: '연결된 자녀가 없습니다.' }, { status: 404 });
        }
        studentId = parentLinks[0].studentId;
      }
    }

    if (!studentId) {
      return NextResponse.json({ error: 'studentId가 필요합니다.' }, { status: 400 });
    }

    // 오답 목록
    const wrongAnswers = await prisma.wrongAnswer.findMany({
      where: { studentId },
      include: {
        classroom: { select: { id: true, name: true } },
        testPaper: {
          include: { pages: { orderBy: { pageNumber: 'asc' } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // 통계
    const totalActive = wrongAnswers.filter(wa => wa.status === 'ACTIVE').length;
    const totalMastered = wrongAnswers.filter(wa => wa.status === 'MASTERED').length;

    // 테스트 이력
    const tests = await prisma.wrongAnswerTest.findMany({
      where: { studentId },
      include: {
        classroom: { select: { id: true, name: true } },
        items: {
          include: {
            wrongAnswer: {
              select: { testName: true, problemNumber: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      wrongAnswers,
      stats: {
        totalActive,
        totalMastered,
        total: wrongAnswers.length,
        masteryRate: wrongAnswers.length > 0
          ? Math.round((totalMastered / wrongAnswers.length) * 100)
          : 0,
        testCount: tests.length,
      },
      tests,
    });
  } catch (error) {
    console.error('Mobile wrong-answers error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
