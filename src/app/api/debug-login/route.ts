import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (key !== 'debug-2026-04') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const name = searchParams.get('name') || '이다연';

  // 학생 검색
  const student = await prisma.student.findFirst({
    where: { name },
    include: {
      parentStudents: {
        include: { parent: true },
      },
      enrollments: {
        include: { classroom: true },
      },
    },
  });

  if (!student) {
    return NextResponse.json({ error: 'Student not found', name });
  }

  // 학생 User 계정 확인
  const studentUser = await prisma.user.findFirst({
    where: { role: 'STUDENT', phone: student.phone },
    select: { id: true, name: true, email: true, phone: true, role: true },
  });

  // 학부모 User 계정 확인
  const parentUser = student.parentPhone ? await prisma.user.findFirst({
    where: { role: 'PARENT', phone: student.parentPhone },
    select: { id: true, name: true, email: true, phone: true, role: true },
  }) : null;

  return NextResponse.json({
    student: {
      id: student.id,
      name: student.name,
      phone: student.phone,
      parentPhone: student.parentPhone,
      status: student.status,
      enrollments: student.enrollments.map(e => ({
        classroomName: e.classroom.name,
        classroomId: e.classroomId,
      })),
      parentStudents: student.parentStudents.map(ps => ({
        parentName: ps.parent.name,
        parentId: ps.parentId,
        relation: ps.relation,
      })),
    },
    studentUser,
    parentUser,
  });
}
