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
    const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    if (!classroomId) {
      return NextResponse.json(
        { error: 'classroomId 필수' },
        { status: 400 }
      );
    }

    const records = await prisma.attendanceRecord.findMany({
      where: {
        classroomId,
        date,
      },
      include: {
        student: true,
      },
    });

    return NextResponse.json(records);
  } catch (error) {
    console.error('Attendance GET error:', error);
    return NextResponse.json(
      { error: '출결 조회 실패' },
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
    const { classroomId, date, records } = body;

    if (!classroomId || !date || !records || !Array.isArray(records)) {
      return NextResponse.json(
        { error: '필수 필드 누락' },
        { status: 400 }
      );
    }

    const createdRecords = await Promise.all(
      records.map((record: any) =>
        prisma.attendanceRecord.upsert({
          where: {
            studentId_classroomId_date: {
              studentId: record.studentId,
              classroomId,
              date,
            },
          },
          update: {
            status: record.status,
            checkInTime: record.checkInTime || null,
            remarks: record.remarks || null,
          },
          create: {
            studentId: record.studentId,
            classroomId,
            date,
            status: record.status,
            checkInTime: record.checkInTime || null,
            remarks: record.remarks || null,
          },
          include: {
            student: true,
          },
        })
      )
    );

    return NextResponse.json(createdRecords);
  } catch (error) {
    console.error('Attendance POST error:', error);
    return NextResponse.json(
      { error: '출결 저장 실패' },
      { status: 500 }
    );
  }
}
