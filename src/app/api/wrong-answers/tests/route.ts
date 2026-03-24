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
    const studentId = searchParams.get('studentId');
    const classroomId = searchParams.get('classroomId');

    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (classroomId) where.classroomId = classroomId;

    const tests = await prisma.wrongAnswerTest.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
        items: { include: { wrongAnswer: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(tests);
  } catch (error) {
    console.error('오답 테스트 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    const body = await request.json();
    const { studentId, classroomId } = body;

    if (!studentId || !classroomId) {
      return NextResponse.json({ error: '학생과 수업을 선택해주세요' }, { status: 400 });
    }

    const activeWrongAnswers = await prisma.wrongAnswer.findMany({
      where: { studentId, classroomId, status: 'ACTIVE' },
      orderBy: [{ testName: 'asc' }, { problemNumber: 'asc' }],
    });

    if (activeWrongAnswers.length === 0) {
      return NextResponse.json({ error: '활성 오답이 없습니다' }, { status: 400 });
    }

    const maxRound = Math.max(...activeWrongAnswers.map(wa => wa.round));

    const test = await prisma.wrongAnswerTest.create({
      data: {
        studentId,
        classroomId,
        round: maxRound,
        items: {
          create: activeWrongAnswers.map(wa => ({ wrongAnswerId: wa.id })),
        },
      },
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
        items: { include: { wrongAnswer: true } },
      },
    });

    return NextResponse.json(test, { status: 201 });
  } catch (error) {
    console.error('오답 테스트 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
