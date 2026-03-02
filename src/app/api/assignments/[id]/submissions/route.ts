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
    const { studentId, status, score, feedback } = body;

    if (!studentId || !status) {
      return NextResponse.json(
        { error: '필수 필드 누락' },
        { status: 400 }
      );
    }

    const submission = await prisma.assignmentSubmission.update({
      where: {
        assignmentId_studentId: {
          assignmentId: id,
          studentId,
        },
      },
      data: {
        status,
        score: score !== undefined ? score : null,
        feedback: feedback !== undefined ? feedback : null,
        submittedAt: status === 'SUBMITTED' || status === 'GRADED'
          ? (new Date().toISOString())
          : null,
      },
      include: {
        student: true,
      },
    });

    return NextResponse.json(submission);
  } catch (error) {
    console.error('Submission PUT error:', error);
    return NextResponse.json(
      { error: '제출 상태 업데이트 실패' },
      { status: 500 }
    );
  }
}
