/**
 * GET /api/admin/auto-migrate-status
 * 관리자 전용 · 매일 새벽 3시 크론이 남긴 마지막 실행 요약을 반환.
 *
 * /drive-settings 페이지의 "자동 정리" 카드에서 사용.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const AUTO_MIGRATE_LAST_RUN_KEY = 'autoMigrate:lastRun';

export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const setting = await prisma.appSetting.findUnique({
    where: { key: AUTO_MIGRATE_LAST_RUN_KEY },
  });

  if (!setting) {
    return NextResponse.json({ lastRun: null });
  }

  try {
    const lastRun = JSON.parse(setting.value);
    return NextResponse.json({ lastRun, updatedAt: setting.updatedAt });
  } catch {
    return NextResponse.json({ lastRun: null });
  }
}
