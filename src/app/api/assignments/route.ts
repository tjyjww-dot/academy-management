import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const classroomId = request.nextUrl.searchParams.get('classroomId');

    if (!classroomId) {
      return NextResponse.json(
        { error: 'classroomId 필수' },
        { status: 400 }
      );
    }

    const assignments = await prisma.assignment.findMany({
      where: { classroomId },
      include: {
        submissions: {
          include: {
            student: true,
          },
        },
      },
    });

    const withSubmissionCounts = assignments.map((assignment) => ({
      ...assignment,
      submissionCount: assignment.submissions.filter(
        (s) => s.status === 'SUBMITTED' || s.status === 'GRADED'
      ).length,
      totalCount: assignment.submissions.length,
    }));

    return NextResponse.json(withSubmissionCounts);
  } catch (error) {
    console.error('Assignments GET error:', error);
    return NextResponse.json(
      { error: '과제 조회 실패' },
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
    const { classroomId, title, description, dueDate, assignmentDate } = body;

    if (!classroomId || !title || !dueDate || !assignmentDate) {
      return NextResponse.json(
        { error: '필수 필드 누락' },
        { status: 400 }
      );
    }

    const assignment = await prisma.assignment.create({
      data: {
        classroomId,
        title,
        description: description || null,
        dueDate,
        assignmentDate,
      },
    });

    const enrollments = await prisma.enrollment.findMany({
      where: { classroomId },
    });

    await Promise.all(
      enrollments.map((enrollment) =>
        prisma.assignmentSubmission.create({
          data: {
            assignmentId: assignment.id,
            studentId: enrollment.studentId,
            status: 'NOT_SUBMITTED',
          },
        })
      )
    );

    const createdAssignment = await prisma.assignment.findUnique({
      where: { id: assignment.id },
      include: {
        submissions: {
          include: {
            student: true,
          },
        },
      },
    });

    return NextResponse.json(createdAssignment);
  } catch (error) {
    console.error('Assignments POST error:', error);
    return NextResponse.json(
      { error: '과제 생성 실패' },
      { status: 500 }
    );
  }
}
