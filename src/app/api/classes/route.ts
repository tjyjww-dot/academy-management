import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const subjectId = searchParams.get('subjectId') || '';

    const whereClause: any = {};

    if (status && status !== '전체') {
      const statusMap: Record<string, string> = {
        ACTIVE: 'ACTIVE',
        INACTIVE: 'INACTIVE',
      };
      if (statusMap[status]) {
        whereClause.status = statusMap[status];
      }
    }

    if (subjectId) {
      whereClause.subjectId = subjectId;
    }

    const classrooms = await prisma.classroom.findMany({
      where: whereClause,
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
          select: {
            id: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const classroomsWithCount = classrooms.map((classroom) => ({
      ...classroom,
      enrollmentCount: classroom.enrollments.length,
    }));

    return NextResponse.json(classroomsWithCount);
  } catch (error) {
    console.error('Failed to fetch classrooms:', error);
    return NextResponse.json(
      { error: 'Failed to fetch classrooms' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, subjectId, teacherId, schedule, maxCapacity = 20 } = body;

    if (!name || !subjectId || !teacherId) {
      return NextResponse.json(
        { error: 'Name, subjectId, and teacherId are required' },
        { status: 400 }
      );
    }

    const classroom = await prisma.classroom.create({
      data: {
        name,
        subjectId,
        teacherId,
        schedule,
        maxCapacity,
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
        enrollments: true,
      },
    });

    return NextResponse.json(
      { ...classroom, enrollmentCount: classroom.enrollments.length },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create classroom:', error);
    return NextResponse.json(
      { error: 'Failed to create classroom' },
      { status: 500 }
    );
  }
}
