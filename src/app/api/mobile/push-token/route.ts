import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * POST /api/mobile/push-token
 * Expo Push Token을 등록/업데이트합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const { token, platform } = await request.json();

    if (!token) {
      return NextResponse.json({ error: '토큰이 필요합니다.' }, { status: 400 });
    }

    // upsert: 토큰이 이미 있으면 업데이트, 없으면 생성
    const pushToken = await prisma.pushToken.upsert({
      where: { token },
      update: {
        userId: user.userId,
        platform: platform || 'unknown',
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        userId: user.userId,
        token,
        platform: platform || 'unknown',
      },
    });

    return NextResponse.json({
      message: '푸시 토큰이 등록되었습니다.',
      id: pushToken.id,
    });
  } catch (error) {
    console.error('Register push token error:', error);
    return NextResponse.json(
      { error: '푸시 토큰 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/mobile/push-token
 * 로그아웃 시 토큰 비활성화
 */
export async function DELETE(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const { token } = await request.json();

    if (token) {
      await prisma.pushToken.updateMany({
        where: { token, userId: user.userId },
        data: { isActive: false },
      });
    }

    return NextResponse.json({ message: '토큰이 비활성화되었습니다.' });
  } catch (error) {
    console.error('Deactivate push token error:', error);
    return NextResponse.json(
      { error: '토큰 비활성화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
