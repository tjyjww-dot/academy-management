import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const status = request.nextUrl.searchParams.get('status');

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const counselingRequests = await prisma.counselingRequest.findMany({
      where,
      include: {
        parent: true,
        student: {
          include: {
            parent: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(counselingRequests);
  } catch (error) {
    console.error('Counseling GET error:', error);
    return NextResponse.json(
      { error: '상담 요청 조회 실패' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const body = await request.json();
    const {
      parentId,
      studentId,
      title,
      description,
      preferredDate,
      sessionNotes,
      adminNotes,
      status,
      sessionDate
    } = body;

    if (!studentId || !title) {
      return NextResponse.json(
        { error: '필수 필드 누락' },
        { status: 400 }
      );
    }

    const counselingRequest = await prisma.counselingRequest.create({
      data: {
        parentId: parentId || null,
        studentId,
        title,
        description: description || null,
        preferredDate: preferredDate || null,
        status: status || 'PENDING',
        sessionNotes: sessionNotes || null,
        adminNotes: adminNotes || null,
        sessionDate: sessionDate || null,
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

    return NextResponse.json(counselingRequest);
  } catch (error) {
    console.error('Counseling POST error:', error);
    return NextResponse.json(
      { error: '상담 요청 생성 실패' },
      { status: 500 }
    );
  }
}
