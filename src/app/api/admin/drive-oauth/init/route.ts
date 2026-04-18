import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { DRIVE_SCOPE } from '@/lib/googleDrive';

/**
 * GET /api/admin/drive-oauth/init
 *
 * Starts the Google Drive OAuth consent flow using the admin's personal
 * Google account (tjyjww@gmail.com, 15GB). Because drive.file scope is
 * sensitive, Google only issues a refresh_token when all three params are
 * present: access_type=offline + prompt=consent + include_granted_scopes.
 *
 * ADMIN role only. After consent, Google redirects the user to
 * /api/admin/drive-oauth/callback with an authorization code which is
 * then exchanged for access_token + refresh_token.
 */
export async function GET(request: NextRequest) {
  const token = getTokenFromCookies(request);
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'GOOGLE_CLIENT_ID not configured' }, { status: 500 });
  }

  const baseUrl = request.nextUrl.origin;
  const redirectUri = baseUrl + '/api/admin/drive-oauth/callback';

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    // drive.file + email + profile — email lets us display which account is connected
    scope: [DRIVE_SCOPE, 'openid', 'email', 'profile'].join(' '),
    access_type: 'offline',
    // Force the consent screen so Google actually issues a refresh_token
    // (otherwise it skips consent if the user already authorized the app
    // and no refresh_token is returned).
    prompt: 'consent',
    include_granted_scopes: 'true',
  });

  const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
  return NextResponse.redirect(authUrl);
}
