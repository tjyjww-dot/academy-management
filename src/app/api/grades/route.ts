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
    const testName = request.nextUrl.searchParams.get('testName');

    if (!classroomId) {
      return NextResponse.json(
        { error: 'classroomId 필수' },
        { status: 400 }
      );
    }

    const where: any = { classroomId };
    if (testName) {
      where.testName = testName;
    }

    const grades = await prisma.grade.findMany({
      where,
      include: {
        student: true,
      },
    });

    return NextResponse.json(grades);
  } catch (error) {
    console.error('Grades GET error:', error);
    return NextResponse.json(
      { error: '성적 조회 실패' },
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
    const { classroomId, testName, testDate, grades } = body;

    if (!classroomId || !testName || !testDate || !grades || !Array.isArray(grades)) {
      return NextResponse.json(
        { error: '필수 필드 누락' },
        { status: 400 }
      );
    }

    const createdGrades = await Promise.all(
      grades.map((grade: any) =>
        prisma.grade.create({
          data: {
            studentId: grade.studentId,
            classroomId,
            testName,
            testDate,
            score: grade.score,
            maxScore: grade.maxScore || 100,
            remarks: grade.remarks || null,
          },
          include: {
            student: true,
          },
        })
      )
    );

    return NextResponse.json(createdGrades);
  } catch (error) {
    console.error('Grades POST error:', error);
    return NextResponse.json(
      { error: '성적 저장 실패' },
      { status: 500 }
    );
  }
}
