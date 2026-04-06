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
    const studentId = request.nextUrl.searchParams.get('studentId');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (studentId) {
      where.studentId = studentId;
    }

    const counselingRequests = await prisma.counselingRequest.findMany({
      where,
      include: {
        parent: true,
        student: true,
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
    const decoded = token ? verifyToken(token) : null;
    if (!decoded) {
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

    // 학부모 요청이 아니라 직원이 직접 입력한 경우 기본 상태는 '완료'
    const defaultStatus = parentId ? 'PENDING' : 'COMPLETED';

    const counselingRequest = await prisma.counselingRequest.create({
      data: {
        parentId: parentId || null,
        studentId,
        title,
        description: description || null,
        preferredDate: preferredDate || null,
        status: status || defaultStatus,
        sessionNotes: sessionNotes || null,
        adminNotes: adminNotes || null,
        sessionDate: sessionDate || null,
        createdById: decoded.userId,
        createdByName: decoded.name || null,
      },
      include: {
        parent: true,
        student: true,
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


export async function PUT(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const body = await request.json();
    const { id, title, description, counselingType, status } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID 필수' }, { status: 400 });
    }

    const updated = await prisma.counselingRequest.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(counselingType !== undefined && { counselingType }),
        ...(status !== undefined && { status }),
      },
      include: { parent: true, student: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Counseling PUT error:', error);
    return NextResponse.json({ error: '상담 수정 실패' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID 필수' }, { status: 400 });
    }

    await prisma.counselingRequest.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Counseling DELETE error:', error);
    return NextResponse.json({ error: '상담 삭제 실패' }, { status: 500 });
  }
}
