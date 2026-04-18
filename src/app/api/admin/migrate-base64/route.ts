import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { runMigrationBatch } from '@/lib/base64Migrate';

/**
 * POST /api/admin/migrate-base64
 * 관리자 전용 · DB 에 저장된 레거시 base64 data URL 이미지를 Google Drive 로 옮긴다.
 *
 * 실제 로직은 /lib/base64Migrate.ts 의 runMigrationBatch() 에 있음.
 * (크론 /api/cron/auto-migrate-base64 에서도 동일한 함수를 사용)
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────
  const token = getTokenFromCookies(request);
  if (!token)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Parse options ───────────────────────────────────────────────
  let body: {
    limit?: number;
    dryRun?: boolean;
    skipPaperPages?: boolean;
    skipWrongAnswer?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  try {
    const result = await runMigrationBatch(body);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      {
        error:
          'Drive 인증 실패: ' +
          (e?.message || 'unknown') +
          ' — /drive-settings 에서 Google 계정을 연결해 주세요.',
      },
      { status: 500 }
    );
  }
}
