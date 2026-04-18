import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  DRIVE_REFRESH_TOKEN_KEY,
  DRIVE_OWNER_EMAIL_KEY,
  getDriveAuthSource,
  clearDriveTokenCache,
} from '@/lib/googleDrive';

/**
 * GET  /api/admin/drive-oauth/status  → 현재 연결 상태 반환
 * DELETE /api/admin/drive-oauth/status → 저장된 refresh_token 삭제 (연결 해제)
 *
 * ADMIN 전용.
 */
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [tokenRow, emailRow, source] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: DRIVE_REFRESH_TOKEN_KEY } }),
    prisma.appSetting.findUnique({ where: { key: DRIVE_OWNER_EMAIL_KEY } }),
    getDriveAuthSource(),
  ]);

  return NextResponse.json({
    connected: !!tokenRow,
    ownerEmail: emailRow?.value || null,
    connectedAt: tokenRow?.updatedAt || null,
    authSource: source, // 'oauth' | 'service' | 'none'
  });
}

export async function DELETE(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.appSetting.deleteMany({
    where: { key: { in: [DRIVE_REFRESH_TOKEN_KEY, DRIVE_OWNER_EMAIL_KEY] } },
  });
  clearDriveTokenCache();

  return NextResponse.json({ ok: true });
}
