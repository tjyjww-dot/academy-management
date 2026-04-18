import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  DRIVE_REFRESH_TOKEN_KEY,
  DRIVE_OWNER_EMAIL_KEY,
  clearDriveTokenCache,
} from '@/lib/googleDrive';

/**
 * GET /api/admin/drive-oauth/callback
 *
 * Receives ?code=... from Google after the admin grants Drive permission,
 * exchanges it for access_token + refresh_token, and persists the
 * refresh_token to AppSetting (survives cold starts, separate from .env).
 *
 * The refresh token is stored in the database (not as env var) so that:
 *   - Admin can rotate/disconnect without editing Vercel env vars
 *   - The value is not exposed in deployment logs
 *   - Revocation can be handled by the app itself
 */
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token) {
    return renderPage('error', '로그인이 필요합니다. 관리자로 다시 로그인해 주세요.');
  }
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return renderPage('error', '관리자 권한이 없습니다.');
  }

  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const errorParam = searchParams.get('error');

  if (errorParam) {
    return renderPage('error', `Google 승인이 거부되었습니다: ${errorParam}`);
  }
  if (!code) {
    return renderPage('error', 'Google 인증 코드가 누락되었습니다. 다시 시도해 주세요.');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return renderPage('error', 'OAuth 클라이언트가 설정되지 않았습니다 (GOOGLE_CLIENT_ID).');
  }

  const baseUrl = request.nextUrl.origin;
  const redirectUri = baseUrl + '/api/admin/drive-oauth/callback';

  // Exchange code → tokens
  let tokenData: { access_token?: string; refresh_token?: string; error?: string; error_description?: string } = {};
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    tokenData = await res.json();
  } catch (e: any) {
    return renderPage('error', '토큰 교환 네트워크 오류: ' + (e?.message || e));
  }

  if (!tokenData.access_token) {
    return renderPage('error', '토큰 교환 실패: ' + JSON.stringify(tokenData));
  }
  if (!tokenData.refresh_token) {
    // Google only issues a refresh_token when prompt=consent is forced AND the
    // app hasn't been previously authorized with the same scopes. If we land
    // here, the admin likely previously granted access; they need to revoke
    // the app from https://myaccount.google.com/permissions and try again.
    return renderPage(
      'error',
      'refresh_token 이 발급되지 않았습니다. https://myaccount.google.com/permissions 에서 ' +
        '"수탐학원" 액세스를 먼저 철회한 뒤 이 화면을 다시 시도해 주세요.'
    );
  }

  // Grab the connected account's email for display
  let ownerEmail: string | null = null;
  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });
    const userInfo = await userInfoRes.json();
    ownerEmail = userInfo?.email || null;
  } catch {}

  // Persist to AppSetting
  try {
    await prisma.appSetting.upsert({
      where: { key: DRIVE_REFRESH_TOKEN_KEY },
      create: { key: DRIVE_REFRESH_TOKEN_KEY, value: tokenData.refresh_token },
      update: { value: tokenData.refresh_token },
    });
    if (ownerEmail) {
      await prisma.appSetting.upsert({
        where: { key: DRIVE_OWNER_EMAIL_KEY },
        create: { key: DRIVE_OWNER_EMAIL_KEY, value: ownerEmail },
        update: { value: ownerEmail },
      });
    }
  } catch (e: any) {
    return renderPage('error', 'DB 저장 실패: ' + (e?.message || e));
  }

  // Clear the in-memory token cache so next upload uses OAuth credential
  clearDriveTokenCache();

  return renderPage(
    'success',
    `${ownerEmail || 'Google 계정'} 의 Drive 저장소와 연결되었습니다. 이제 시험지 업로드 시 이 계정의 Drive 용량을 사용합니다.`
  );
}

function renderPage(kind: 'success' | 'error', message: string) {
  const isSuccess = kind === 'success';
  const title = isSuccess ? 'Drive 연결 완료' : 'Drive 연결 실패';
  const color = isSuccess ? '#16a34a' : '#dc2626';
  const icon = isSuccess ? '✓' : '✕';
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #fafafa; font-family: -apple-system, BlinkMacSystemFont, 'Pretendard', 'Segoe UI', sans-serif; display: grid; place-items: center; padding: 24px; }
  .card { width: 100%; max-width: 420px; background: #fff; border: 1px solid #e5e7eb; border-radius: 16px; padding: 32px 28px; box-shadow: 0 4px 24px rgba(0,0,0,.04); }
  .icon { width: 56px; height: 56px; border-radius: 50%; background: ${color}15; color: ${color}; display: grid; place-items: center; font-size: 28px; font-weight: 700; margin: 0 auto 16px; }
  h1 { margin: 0 0 12px; font-size: 20px; text-align: center; color: #111827; }
  p { margin: 0 0 20px; font-size: 14px; line-height: 1.6; color: #374151; text-align: center; }
  .actions { display: flex; gap: 8px; justify-content: center; }
  a { display: inline-block; padding: 10px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; text-decoration: none; transition: transform .12s; }
  a:active { transform: scale(.97); }
  .primary { background: #111827; color: #fff; }
  .secondary { background: #f3f4f6; color: #374151; }
</style></head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <div class="actions">
      <a class="primary" href="/dashboard">대시보드로</a>
      ${isSuccess ? '' : '<a class="secondary" href="/api/admin/drive-oauth/init">다시 시도</a>'}
    </div>
  </div>
</body></html>`;
  return new NextResponse(html, {
    status: isSuccess ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
