import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

/**
 * GET /api/users - 회원 목록 조회 (모든 스태프 접근 가능)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: '인증 토큰이 유효하지 않습니다.' }, { status: 401 });
    }

    // ADMIN, TEACHER, DESK 모두 사용자 목록 조회 가능
    if (!['ADMIN', 'TEACHER', 'DESK'].includes(payload.role)) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const users = await prisma.user.findMany({
      where: {
        role: {
          in: ['TEACHER', 'DESK', 'ADMIN'],
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        image: true,
        provider: true,
        isApproved: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('GET users error:', error);
    return NextResponse.json({ error: '목록 조회에 실패했습니다.' }, { status: 500 });
  }
}
