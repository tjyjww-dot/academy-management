import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const date = request.nextUrl.searchParams.get('date') || new Date().toISOString().split('T')[0];

    const absentRecords = await prisma.$queryRawUnsafe(`
      SELECT ar.id, ar."studentId", ar."classroomId", ar.date, ar.status, ar.remarks,
             s.name as "studentName", s."studentNumber", s.phone as "studentPhone", s."parentPhone",
             c.name as "classroomName",
             sub.name as "subjectName"
      FROM "AttendanceRecord" ar
      JOIN "Student" s ON ar."studentId" = s.id
      JOIN "Classroom" c ON ar."classroomId" = c.id
      LEFT JOIN "Subject" sub ON c."subjectId" = sub.id
      WHERE ar.status IN ('ABSENT', 'EXCUSED_ABSENT')
        AND ar.date = $1
      ORDER BY c.name, s.name
    `, date) as any[];

    return NextResponse.json(absentRecords);
  } catch (error) {
    console.error('Absent list error:', error);
    return NextResponse.json({ error: '결석자 조회 실패' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const body = await request.json();
    const { recordId, remarks } = body;

    if (!recordId) {
      return NextResponse.json({ error: 'recordId 필수' }, { status: 400 });
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { remarks: remarks || null },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Update remarks error:', error);
    return NextResponse.json({ error: '보충 메모 저장 실패' }, { status: 500 });
  }
}
