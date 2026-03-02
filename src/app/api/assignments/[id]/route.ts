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

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        submissions: {
          include: {
            student: true,
          },
        },
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: '과제를 찾을 수 없음' },
        { status: 404 }
      );
    }

    return NextResponse.json(assignment);
  } catch (error) {
    console.error('Assignment GET error:', error);
    return NextResponse.json(
      { error: '과제 조회 실패' },
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

    const updatedAssignment = await prisma.assignment.update({
      where: { id },
      data: {
        title: body.title !== undefined ? body.title : undefined,
        description: body.description !== undefined ? body.description : undefined,
        dueDate: body.dueDate !== undefined ? body.dueDate : undefined,
        assignmentDate: body.assignmentDate !== undefined ? body.assignmentDate : undefined,
      },
      include: {
        submissions: {
          include: {
            student: true,
          },
        },
      },
    });

    return NextResponse.json(updatedAssignment);
  } catch (error) {
    console.error('Assignment PUT error:', error);
    return NextResponse.json(
      { error: '과제 업데이트 실패' },
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

    await prisma.assignment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Assignment DELETE error:', error);
    return NextResponse.json(
      { error: '과제 삭제 실패' },
      { status: 500 }
    );
  }
}
