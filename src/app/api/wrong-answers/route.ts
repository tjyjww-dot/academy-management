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
    const status = searchParams.get('status') || 'ACTIVE';

    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (classroomId) where.classroomId = classroomId;
    if (status !== 'ALL') where.status = status;

    const wrongAnswers = await prisma.wrongAnswer.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return NextResponse.json(wrongAnswers);
  } catch (error) {
    console.error('오답 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    if (!['ADMIN', 'TEACHER'].includes(payload.role)) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    const body = await request.json();
    const { studentId, classroomId, testName, problemNumbers } = body;

    if (!studentId || !classroomId || !testName || !problemNumbers?.length) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다' }, { status: 400 });
    }

    const results = [];
    for (const num of problemNumbers) {
      const existing = await prisma.wrongAnswer.findUnique({
        where: {
          studentId_classroomId_testName_problemNumber: {
            studentId, classroomId, testName, problemNumber: num,
          },
        },
      });

      if (existing) {
        if (existing.status === 'MASTERED') {
          const updated = await prisma.wrongAnswer.update({
            where: { id: existing.id },
            data: { status: 'ACTIVE', round: existing.round + 1 },
          });
          results.push(updated);
        } else {
          results.push(existing);
        }
      } else {
        const created = await prisma.wrongAnswer.create({
          data: { studentId, classroomId, testName, problemNumber: num },
        });
        results.push(created);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('오답 기록 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
