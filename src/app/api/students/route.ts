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
    const q = searchParams.get('q') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const status = searchParams.get('status') || '';

    const skip = (page - 1) * limit;

    const whereClause: any = {};

    if (q) {
      whereClause.name = { contains: q };
    }

    if (status && status !== '전체') {
      const statusMap: Record<string, string> = {
        재원: 'ACTIVE',
        수료: 'COMPLETED',
        퇴원: 'WITHDRAWN',
      };
      if (statusMap[status]) {
        whereClause.status = statusMap[status];
      }
    }

    const [students, total] = await Promise.all([
      prisma.student.findMany({
        where: whereClause,
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
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.student.count({ where: whereClause }),
    ]);

    return NextResponse.json({
      students,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Failed to fetch students:', error);
    return NextResponse.json(
      { error: 'Failed to fetch students' },
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
    const {
      name,
      studentNumber,
      dateOfBirth,
      phone,
      parentPhone,
      school,
      grade,
      status = 'ACTIVE',
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    let finalStudentNumber = studentNumber;

    if (!finalStudentNumber) {
      const year = new Date().getFullYear();
      const lastStudent = await prisma.student.findFirst({
        where: {
          studentNumber: {
            startsWith: year.toString(),
          },
        },
        orderBy: { studentNumber: 'desc' },
      });

      let sequence = 1;
      if (lastStudent) {
        const lastNumber = parseInt(lastStudent.studentNumber.slice(-3));
        sequence = lastNumber + 1;
      }

      finalStudentNumber = `${year}${sequence.toString().padStart(3, '0')}`;
    }

    const student = await prisma.student.create({
      data: {
        name,
        studentNumber: finalStudentNumber,
        dateOfBirth,
        phone,
        parentPhone: parentPhone || null,
        school,
        grade,
        status,
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

    return NextResponse.json(student, { status: 201 });
  } catch (error) {
    console.error('Failed to create student:', error);
    return NextResponse.json(
      { error: 'Failed to create student' },
      { status: 500 }
    );
  }
}
