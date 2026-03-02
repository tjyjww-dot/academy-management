import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const { id } = await props.params;

    const counselingRequest = await prisma.counselingRequest.findUnique({
      where: { id },
      include: {
        parent: true,
        student: {
          include: {
            parent: true,
          },
        },
      },
    });

    if (!counselingRequest) {
      return NextResponse.json(
        { error: '상담 요청을 찾을 수 없음' },
        { status: 404 }
      );
    }

    return NextResponse.json(counselingRequest);
  } catch (error) {
    console.error('Counseling GET error:', error);
    return NextResponse.json(
      { error: '상담 요청 조회 실패' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const { id } = await props.params;
    const body = await request.json();
    const { status, adminNotes, sessionDate, sessionNotes } = body;

    const updatedRequest = await prisma.counselingRequest.update({
      where: { id },
      data: {
        status: status !== undefined ? status : undefined,
        adminNotes: adminNotes !== undefined ? adminNotes : undefined,
        sessionDate: sessionDate !== undefined ? sessionDate : undefined,
        sessionNotes: sessionNotes !== undefined ? sessionNotes : undefined,
      },
      include: {
        parent: true,
        student: {
          include: {
            parent: true,
          },
        },
      },
    });

    return NextResponse.json(updatedRequest);
  } catch (error) {
    console.error('Counseling PUT error:', error);
    return NextResponse.json(
      { error: '상담 요청 업데이트 실패' },
      { status: 500 }
    );
  }
}
