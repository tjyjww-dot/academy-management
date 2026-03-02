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

    const student = await prisma.student.findUnique({
      where: { id },
      include: {
        parentStudents: {
          include: {
            parent: true,
          },
        },
        enrollments: {
          include: {
            classroom: {
              include: {
                subject: true,
                teacher: true,
              },
            },
          },
        },
        grades: {
          include: {
            classroom: {
              include: {
                subject: true,
              },
            },
          },
        },
        attendanceRecords: {
          include: {
            classroom: {
              include: {
                subject: true,
              },
            },
          },
        },
      },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    return NextResponse.json(student);
  } catch (error) {
    console.error('Failed to fetch student:', error);
    return NextResponse.json(
      { error: 'Failed to fetch student' },
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
    const { name, dateOfBirth, phone, parentPhone, school, grade, status, withdrawalReason, withdrawalDate } = body;

    const student = await prisma.student.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(dateOfBirth && { dateOfBirth }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(parentPhone !== undefined && { parentPhone: parentPhone || null }),
        ...(school && { school }),
        ...(grade && { grade }),
        ...(status && { status }),
        ...(withdrawalReason !== undefined && { withdrawalReason: withdrawalReason || null }),
        ...(withdrawalDate !== undefined && { withdrawalDate: withdrawalDate ? new Date(withdrawalDate) : null }),
      },
      include: {
        parentStudents: {
          include: {
            parent: true,
          },
        },
        enrollments: {
          include: {
            classroom: {
              include: {
                subject: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(student);
  } catch (error) {
    console.error('Failed to update student:', error);
    return NextResponse.json(
      { error: 'Failed to update student' },
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

    await prisma.student.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Failed to delete student:', error);
    return NextResponse.json(
      { error: 'Failed to delete student' },
      { status: 500 }
    );
  }
}
