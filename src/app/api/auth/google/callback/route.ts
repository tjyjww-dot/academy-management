import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateToken } from '@/lib/auth';

const ADMIN_EMAILS = ['tjyjww@gmail.com'];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const baseUrl = request.nextUrl.origin;

  if (!code) {
    return NextResponse.redirect(baseUrl + '/auth/login?error=no_code');
  }

  try {
    const redirectUri = baseUrl + '/api/auth/google/callback';
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      return NextResponse.redirect(baseUrl + '/auth/login?error=token_failed');
    }

    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + tokenData.access_token },
    });

    const userInfo = await userInfoResponse.json();

    if (!userInfo.email) {
      return NextResponse.redirect(baseUrl + '/auth/login?error=no_email');
    }

    const isAdminEmail = ADMIN_EMAILS.includes(userInfo.email);

    let user = await prisma.user.findUnique({
      where: { email: userInfo.email },
    });

    if (!user) {
      const userCount = await prisma.user.count();
      const isFirstUser = userCount === 0;

      user = await prisma.user.create({
        data: {
          email: userInfo.email,
          name: userInfo.name || '',
          image: userInfo.picture || null,
          provider: 'google',
          role: (isFirstUser || isAdminEmail) ? 'ADMIN' : 'TEACHER',
          isApproved: isFirstUser || isAdminEmail,
        },
      });
    } else {
      // Update existing user: if admin email, ensure approved and ADMIN
      if (isAdminEmail && (!user.isApproved || user.role !== 'ADMIN')) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            isApproved: true,
            role: 'ADMIN',
            image: userInfo.picture || user.image,
          },
        });
      } else if (user.provider !== 'google') {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            provider: 'google',
            image: userInfo.picture || user.image,
          },
        });
      }
    }

    if (!user.isApproved) {
      return NextResponse.redirect(baseUrl + '/auth/login?error=not_approved');
    }

    const token = generateToken({
      userId: user.id,
      role: user.role,
      name: user.name,
    });

    const response = NextResponse.redirect(baseUrl + '/dashboard');
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    return NextResponse.redirect(baseUrl + '/auth/login?error=callback_failed');
  }
}
