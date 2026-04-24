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
      // 방어: 클라이언트에서 boolean 이 아닌 값이 섞여 들어오면 해당 항목은 건너뜀
      if (typeof result.isCorrect !== 'boolean' || !result.wrongAnswerId) continue;

      // 기존 채점 상태 조회 (재채점 대응)
      const existingItem = await prisma.wrongAnswerTestItem.findFirst({
        where: { testId: id, wrongAnswerId: result.wrongAnswerId },
        select: { isCorrect: true },
      });
      const prev = existingItem?.isCorrect ?? null; // null = 미채점
      const next: boolean = result.isCorrect;

      // 아이템 업데이트
      await prisma.wrongAnswerTestItem.updateMany({
        where: { testId: id, wrongAnswerId: result.wrongAnswerId },
        data: { isCorrect: next },
      });

      // 변화 없음 → 사이드이펙트 건너뜀
      if (prev === next) continue;

      if (prev === null) {
        // 첫 채점
        if (next) {
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
      } else if (prev === true && next === false) {
        // 재채점: 정답 → 오답 (MASTERED 해제 + round++)
        await prisma.wrongAnswer.update({
          where: { id: result.wrongAnswerId },
          data: {
            status: 'ACTIVE',
            masteredAt: null,
            round: { increment: 1 },
          },
        });
      } else if (prev === false && next === true) {
        // 재채점: 오답 → 정답 (round-- 최소 1, MASTERED 설정)
        const current = await prisma.wrongAnswer.findUnique({
          where: { id: result.wrongAnswerId },
          select: { round: true },
        });
        const newRound = Math.max(1, (current?.round ?? 1) - 1);
        await prisma.wrongAnswer.update({
          where: { id: result.wrongAnswerId },
          data: {
            status: 'MASTERED',
            masteredAt: new Date(),
            round: newRound,
          },
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
