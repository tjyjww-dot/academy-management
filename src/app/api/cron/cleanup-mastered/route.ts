/**
 * GET /api/cron/cleanup-mastered
 *
 * Vercel Cron 에 의해 매일 새벽 4시(KST, 19:00 UTC) 자동 호출.
 * 스케줄은 /vercel.json 의 crons 항목 참고.
 *
 * 동작:
 *   1. MASTERED 상태이면서 masteredAt 이 NULL 인 레거시 항목을 updatedAt 으로 백필.
 *   2. MASTERED 상태이면서 masteredAt 이 60일 이상 지난 오답을 영구 삭제.
 *      (연결된 WrongAnswerTestItem 은 onDelete: Cascade 로 함께 제거)
 *   3. 실행 요약을 AppSetting("cleanupMastered:lastRun") 에 저장.
 *
 * 인증:
 *   - CRON_SECRET 환경변수가 설정되어 있으면 `Authorization: Bearer ${CRON_SECRET}` 검사.
 *   - 그 외에는 Vercel 이 자동으로 붙이는 `x-vercel-cron` 헤더로 확인.
 *   - 로컬 개발 / 수동 테스트는 인증 없이도 허용 (NODE_ENV !== 'production').
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LAST_RUN_KEY = 'cleanupMastered:lastRun';
const RETENTION_DAYS = 60;

type CleanupSummary = {
  ranAt: string;
  backfilled: number;
  deleted: number;
  cutoffIso: string;
  elapsedMs: number;
  lastError: string | null;
};

function isAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'production') return true;

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron === '1' || vercelCron === 'true') return true;

  const userAgent = request.headers.get('user-agent') || '';
  if (userAgent.toLowerCase().includes('vercel-cron')) return true;

  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

  let backfilled = 0;
  let deleted = 0;
  let lastError: string | null = null;

  try {
    // 1) 레거시 백필: MASTERED 인데 masteredAt 이 NULL 인 레코드는 updatedAt 을 기준으로 채운다.
    //    updatedAt 이 이미 cutoff 이전이라면 바로 삭제 대상에 포함된다.
    const legacy = await prisma.wrongAnswer.findMany({
      where: { status: 'MASTERED', masteredAt: null },
      select: { id: true, updatedAt: true },
    });
    for (const row of legacy) {
      await prisma.wrongAnswer.update({
        where: { id: row.id },
        data: { masteredAt: row.updatedAt },
      });
      backfilled++;
    }

    // 2) 60일 초과 MASTERED 항목 영구 삭제
    const delRes = await prisma.wrongAnswer.deleteMany({
      where: {
        status: 'MASTERED',
        masteredAt: { lt: cutoff },
      },
    });
    deleted = delRes.count;
  } catch (e: any) {
    lastError = String(e?.message || e);
  }

  const summary: CleanupSummary = {
    ranAt: new Date(startedAt).toISOString(),
    backfilled,
    deleted,
    cutoffIso: cutoff.toISOString(),
    elapsedMs: Date.now() - startedAt,
    lastError,
  };

  await persistSummary(summary);

  return NextResponse.json({ ok: lastError === null, ...summary });
}

async function persistSummary(summary: CleanupSummary): Promise<void> {
  try {
    await prisma.appSetting.upsert({
      where: { key: LAST_RUN_KEY },
      update: { value: JSON.stringify(summary) },
      create: { key: LAST_RUN_KEY, value: JSON.stringify(summary) },
    });
  } catch {
    // 요약 저장 실패는 무시
  }
}
