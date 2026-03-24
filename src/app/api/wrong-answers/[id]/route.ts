import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    if (!['ADMIN', 'TEACHER'].includes(payload.role)) {
      return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 });
    }

    const { id } = await params;
    await prisma.wrongAnswer.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('오답 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
