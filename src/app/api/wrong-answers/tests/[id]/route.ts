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

    const { id } = await params;

    // Delete test items first, then the test
    await prisma.wrongAnswerTestItem.deleteMany({ where: { testId: id } });
    await prisma.wrongAnswerTest.delete({ where: { id } });

    return NextResponse.json({ message: '테스트가 삭제되었습니다' });
  } catch (error) {
    console.error('테스트 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
