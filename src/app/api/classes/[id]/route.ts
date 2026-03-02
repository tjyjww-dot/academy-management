import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const classroom = await prisma.classroom.findUnique({
      where: { id },
      include: {
        subject: true,
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        enrollments: {
          include: {
            student: true,
          },
        },
        grades: {
          include: {
            student: true,
          },
        },
        assignments: {
          include: {
            submissions: true,
          },
        },
      },
    });

    if (!classroom) {
      return NextResponse.json({ error: 'Classroom not found' }, { status: 404 });
    }

    return NextResponse.json(classroom);
  } catch (error) {
    console.error('Failed to fetch classroom:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classroom' },
      { status: 500 }
    );
  }
}

export async function PUT(
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
    const { name, subjectId, teacherId, schedule, maxCapacity, status } = body;

    const classroom = await prisma.classroom.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(subjectId && { subjectId }),
        ...(teacherId && { teacherId }),
        ...(schedule && { schedule }),
        ...(maxCapacity && { maxCapacity }),
        ...(status && { status }),
      },
      include: {
        subject: true,
        teacher: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        enrollments: {
          include: {
            student: true,
          },
        },
      },
    });

    return NextResponse.json(classroom);
  } catch (error) {
    console.error('Failed to update classroom:', error);
    return NextResponse.json(
      { error: 'Failed to update classroom' },
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

    await prisma.classroom.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Classroom deleted successfully' });
  } catch (error) {
    console.error('Failed to delete classroom:', error);
    return NextResponse.json(
      { error: 'Failed to delete classroom' },
      { status: 500 }
    );
  }
}
