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

    const updatedGrade = await prisma.grade.update({
      where: { id },
      data: {
        score: body.score !== undefined ? body.score : undefined,
        maxScore: body.maxScore !== undefined ? body.maxScore : undefined,
        remarks: body.remarks !== undefined ? body.remarks : undefined,
      },
      include: {
        student: true,
      },
    });

    return NextResponse.json(updatedGrade);
  } catch (error) {
    console.error('Grade PUT error:', error);
    return NextResponse.json(
      { error: '성적 업데이트 실패' },
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

    await prisma.grade.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Grade DELETE error:', error);
    return NextResponse.json(
      { error: '성적 삭제 실패' },
      { status: 500 }
    );
  }
}
