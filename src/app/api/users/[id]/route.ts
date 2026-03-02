import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

/**
 * PATCH /api/users/[id] - 회원 승인 / 역할 변경
 * body: { isApproved?: boolean, role?: string }
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
    const { isApproved, role } = body;

    // role 유효성 검사
    const validRoles = ['ADMIN', 'TEACHER', 'DESK'];
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: '유효하지 않은 역할입니다. (ADMIN, TEACHER, DESK 중 선택)' },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (typeof isApproved === 'boolean') updateData.isApproved = isApproved;
    if (role) updateData.role = role;

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: '변경할 항목이 없습니다.' },
        { status: 400 }
      );
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isApproved: true,
      },
    });

    return NextResponse.json({ user: updated });
  } catch (error) {
    console.error('PATCH user error:', error);
    return NextResponse.json({ error: '처리에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * DELETE /api/users/[id] - 회원 삭제 (관리자 전용)
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

    // 자기 자신은 삭제 불가
    if (payload.userId === id) {
      return NextResponse.json({ error: '자신의 계정은 삭제할 수 없습니다.' }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ message: '삭제되었습니다.' });
  } catch (error) {
    console.error('DELETE user error:', error);
    return NextResponse.json({ error: '삭제에 실패했습니다.' }, { status: 500 });
  }
}
