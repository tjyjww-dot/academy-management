import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

/**
 * PATCH /api/signup-requests/[id] - 가입신청 상태 변경 (승인/거절)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, adminNotes } = body;

    if (!status || !['APPROVED', 'REJECTED'].includes(status)) {
      return NextResponse.json(
        { error: '상태는 APPROVED 또는 REJECTED만 가능합니다.' },
        { status: 400 }
      );
    }

    const updated = await prisma.signupRequest.update({
      where: { id },
      data: {
        status,
        adminNotes: adminNotes || null,
      },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    console.error('PATCH signup-request error:', error);
    return NextResponse.json({ error: '처리에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/signup-requests/[id] - 가입신청 삭제
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { id } = await params;

    await prisma.signupRequest.delete({
      where: { id },
    });

    return NextResponse.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('DELETE signup-request error:', error);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
