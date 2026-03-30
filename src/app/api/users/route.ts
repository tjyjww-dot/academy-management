import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

/**
 * GET /api/users - íì ëª©ë¡ ì¡°í (ëª¨ë  ì¤íí ì ê·¼ ê°ë¥)
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'ì¸ì¦ì´ íìí©ëë¤.' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'ì¸ì¦ í í°ì´ ì í¨íì§ ììµëë¤.' }, { status: 401 });
    }

    // ADMIN, TEACHER, DESK ëª¨ë ì¬ì©ì ëª©ë¡ ì¡°í ê°ë¥
    if (!['ADMIN', 'TEACHER', 'DESK'].includes(payload.role)) {
      return NextResponse.json({ error: 'ê¶íì´ ììµëë¤.' }, { status: 403 });
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
    return NextResponse.json({ error: 'ëª©ë¡ ì¡°íì ì¤í¨íìµëë¤.' }, { status: 500 });
  }
}
