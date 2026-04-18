/**
 * GET /api/cron/auto-migrate-base64
 *
 * Vercel Cron 에 의해 매일 새벽 3시(KST, 18:00 UTC) 자동 호출.
 * 스케줄은 /vercel.json 의 crons 항목 참고.
 *
 * 동작:
 *   1. DB 에 남아 있는 base64 이미지를 최대 10 라운드, 시간 예산 50초 이내에 Drive 로 이관.
 *   2. 이관 결과 요약을 AppSetting("autoMigrate:lastRun") 에 저장 → /drive-settings UI 에서 표시.
 *   3. 실패해도 원본 DB 는 보존됨.
 *
 * 인증:
 *   - CRON_SECRET 환경변수가 설정되어 있으면 `Authorization: Bearer ${CRON_SECRET}` 검사.
 *   - 그 외에는 Vercel 이 자동으로 붙이는 `x-vercel-cron` 헤더로 확인.
 *   - 로컬 개발 / 수동 테스트는 인증 없이도 허용 (NODE_ENV !== 'production').
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runMigrationBatch } from '@/lib/base64Migrate';

export const runtime = 'nodejs';
export const maxDuration = 60;

const AUTO_MIGRATE_LAST_RUN_KEY = 'autoMigrate:lastRun';

type CronSummary = {
  ranAt: string;
  rounds: number;
  totalProcessed: number;
  totalSuccessful: number;
  totalFailed: number;
  totalMB: number;
  lastRemaining: { paper: number; wa: number };
  elapsedMs: number;
  lastError: string | null;
};

function isAuthorized(request: NextRequest): boolean {
  // Vercel cron 은 요청 시 `x-vercel-cron: 1` 헤더를 자동으로 부착한다.
  // 또한 프로젝트에 CRON_SECRET 환경변수가 있으면 Authorization 헤더도 보낸다.
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
  const OVERALL_BUDGET_MS = 50_000;
  const MAX_ROUNDS = 10;
  const PER_BATCH_LIMIT = 30;

  let rounds = 0;
  let totalProcessed = 0;
  let totalSuccessful = 0;
  let totalFailed = 0;
  let totalBytes = 0;
  let lastRemaining = { paper: 0, wa: 0 };
  let lastError: string | null = null;

  try {
    // 사전 dry-run 한 번으로 남은 건수 체크 — 0 이면 바로 종료
    const preview = await runMigrationBatch({ dryRun: true, limit: 1 });
    lastRemaining = {
      paper: preview.remainingPaperPages,
      wa: preview.remainingWrongAnswers,
    };
    if (lastRemaining.paper === 0 && lastRemaining.wa === 0) {
      // 할 일 없음 — 요약만 남기고 즉시 반환
      const summary: CronSummary = {
        ranAt: new Date(startedAt).toISOString(),
        rounds: 0,
        totalProcessed: 0,
        totalSuccessful: 0,
        totalFailed: 0,
        totalMB: 0,
        lastRemaining,
        elapsedMs: Date.now() - startedAt,
        lastError: null,
      };
      await persistSummary(summary);
      return NextResponse.json({ ok: true, noop: true, ...summary });
    }

    // 실제 이관 루프
    while (Date.now() - startedAt < OVERALL_BUDGET_MS && rounds < MAX_ROUNDS) {
      const remainingBudget = OVERALL_BUDGET_MS - (Date.now() - startedAt);
      const perBatchBudget = Math.max(10_000, remainingBudget - 5_000);

      const result = await runMigrationBatch({
        limit: PER_BATCH_LIMIT,
        timeBudgetMs: perBatchBudget,
      });
      rounds++;
      totalProcessed += result.processed;
      totalSuccessful += result.successful;
      totalFailed += result.failed;
      totalBytes += result.totalBytes;
      lastRemaining = {
        paper: result.remainingPaperPages,
        wa: result.remainingWrongAnswers,
      };

      // 종료 조건
      if (lastRemaining.paper === 0 && lastRemaining.wa === 0) break;
      if (result.processed === 0) break;
      if (result.timeBudgetExceeded) break;
    }
  } catch (e: any) {
    lastError = String(e?.message || e);
  }

  const summary: CronSummary = {
    ranAt: new Date(startedAt).toISOString(),
    rounds,
    totalProcessed,
    totalSuccessful,
    totalFailed,
    totalMB: +(totalBytes / 1024 / 1024).toFixed(2),
    lastRemaining,
    elapsedMs: Date.now() - startedAt,
    lastError,
  };

  await persistSummary(summary);

  return NextResponse.json({ ok: true, ...summary });
}

async function persistSummary(summary: CronSummary): Promise<void> {
  try {
    await prisma.appSetting.upsert({
      where: { key: AUTO_MIGRATE_LAST_RUN_KEY },
      update: { value: JSON.stringify(summary) },
      create: { key: AUTO_MIGRATE_LAST_RUN_KEY, value: JSON.stringify(summary) },
    });
  } catch {
    // DB 저장 실패는 무시 (크론 본문은 이미 이관을 마쳤음)
  }
}
