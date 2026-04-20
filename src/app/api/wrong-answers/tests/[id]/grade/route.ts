import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    if (['PARENT', 'STUDENT'].includes(payload.role)) {
      return NextResponse.json({ error: '채점 권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { results } = body;

    if (!results?.length) {
      return NextResponse.json({ error: '채점 결과를 입력해주세요' }, { status: 400 });
    }

    for (const result of results) {
      await prisma.wrongAnswerTestItem.updateMany({
        where: { testId: id, wrongAnswerId: result.wrongAnswerId },
        data: { isCorrect: result.isCorrect },
      });

      if (result.isCorrect) {
        await prisma.wrongAnswer.update({
          where: { id: result.wrongAnswerId },
          data: { status: 'MASTERED', masteredAt: new Date() },
        });
      } else {
        await prisma.wrongAnswer.update({
          where: { id: result.wrongAnswerId },
          data: { round: { increment: 1 } },
        });
      }
    }

    const updatedTest = await prisma.wrongAnswerTest.update({
      where: { id },
      data: { status: 'GRADED', gradedAt: new Date(), gradedBy: payload.userId },
      include: {
        items: { include: { wrongAnswer: true } },
        student: { select: { id: true, name: true } },
        classroom: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updatedTest);
  } catch (error) {
    console.error('채점 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
