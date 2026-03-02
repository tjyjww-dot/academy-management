import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json(
        { error: 'studentId is required' },
        { status: 400 }
      );
    }

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId,
        classroomId: id,
      },
      include: {
        student: true,
        classroom: {
          include: {
            subject: true,
            teacher: true,
          },
        },
      },
    });

    return NextResponse.json(enrollment, { status: 201 });
  } catch (error: any) {
    console.error('Failed to enroll student:', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Student is already enrolled in this class' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to enroll student' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { studentId } = body;

    if (!studentId) {
      return NextResponse.json(
        { error: 'studentId is required' },
        { status: 400 }
      );
    }

    await prisma.enrollment.delete({
      where: {
        studentId_classroomId: {
          studentId,
          classroomId: id,
        },
      },
    });

    return NextResponse.json({ message: 'Student withdrawn successfully' });
  } catch (error) {
    console.error('Failed to withdraw student:', error);
    return NextResponse.json(
      { error: 'Failed to withdraw student' },
      { status: 500 }
    );
  }
}
