import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const { id } = await props.params;
    const body = await request.json();

    const updatedAnnouncement = await prisma.announcement.update({
      where: { id },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        content: body.content !== undefined ? body.content : undefined,
        targetRole: body.targetRole !== undefined ? body.targetRole : undefined,
        isActive: body.isActive !== undefined ? body.isActive : undefined,
        expiryDate: body.expiryDate !== undefined ? body.expiryDate : undefined,
      },
    });

    return NextResponse.json(updatedAnnouncement);
  } catch (error) {
    console.error('Announcement PUT error:', error);
    return NextResponse.json(
      { error: '공지 업데이트 실패' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const { id } = await props.params;

    await prisma.announcement.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Announcement DELETE error:', error);
    return NextResponse.json(
      { error: '공지 삭제 실패' },
      { status: 500 }
    );
  }
}
