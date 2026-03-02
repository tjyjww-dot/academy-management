import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/counseling
 * 학부모의 상담 요청 목록을 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const counselingRequests = await prisma.counselingRequest.findMany({
      where: { parentId: user.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { name: true } },
      },
    });

    return NextResponse.json(
      counselingRequests.map((c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        counselingType: c.counselingType || 'PHONE',
        visitMessage: c.visitMessage || null,
        preferredDate: c.preferredDate,
        status: c.status,
        adminNotes: c.adminNotes,
        sessionDate: c.sessionDate,
        sessionNotes: c.sessionNotes,
        category: null,
        studentName: c.student.name,
        createdAt: c.createdAt.toISOString(),
      }))
    );
  } catch (error) {
    console.error('Get counseling error:', error);
    return NextResponse.json(
      { error: '상담 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/mobile/counseling
 * 새로운 상담을 신청합니다.
 */
export async function POST(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const body = await request.json();
    const { studentId, title, description, preferredDate, counselingType, visitMessage } = body;

    if (!studentId || !title) {
      return NextResponse.json(
        { error: '학생 ID와 제목은 필수입니다.' },
        { status: 400 }
      );
    }

    const counseling = await prisma.counselingRequest.create({
      data: {
        parentId: user.userId,
        studentId,
        title,
        description: description || null,
        counselingType: counselingType || 'PHONE',
        visitMessage: counselingType === 'VISIT' ? (visitMessage || null) : null,
        preferredDate: preferredDate || null,
      },
      include: {
        student: { select: { name: true } },
      },
    });

    return NextResponse.json({
      id: counseling.id,
      title: counseling.title,
      description: counseling.description,
      counselingType: counseling.counselingType,
      visitMessage: counseling.visitMessage,
      preferredDate: counseling.preferredDate,
      status: counseling.status,
      adminNotes: counseling.adminNotes,
      sessionDate: counseling.sessionDate,
      sessionNotes: counseling.sessionNotes,
      category: null,
      studentName: counseling.student.name,
      createdAt: counseling.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Create counseling error:', error);
    return NextResponse.json(
      { error: '상담 신청 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
