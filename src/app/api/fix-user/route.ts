import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

// 임시 API: 누락된 User 레코드 생성
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  if (key !== 'fix-2026-04') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const studentName = searchParams.get('name') || '이다연';

  try {
    // 학생 검색
    const student = await prisma.student.findFirst({
      where: { name: studentName },
      include: {
        parentStudents: { include: { parent: true } },
      },
    });

    if (!student) {
      return NextResponse.json({ error: 'Student not found', studentName });
    }

    const results: any = { student: { id: student.id, name: student.name, phone: student.phone, parentPhone: student.parentPhone } };

    // 1. 학생 User 생성
    const normalizedStudentPhone = student.phone?.replace(/[-\s]/g, '') || '';
    let studentUser = await prisma.user.findFirst({
      where: { role: 'STUDENT', OR: [{ phone: normalizedStudentPhone }, { phone: student.phone }] },
    });

    if (!studentUser && student.phone) {
      const studentEmail = `student_${student.studentNumber}@suhaktamgu.local`;
      // 이메일로 기존 User 확인
      studentUser = await prisma.user.findUnique({ where: { email: studentEmail } }) as any;

      if (!studentUser) {
        const randomPassword = await hashPassword(Math.random().toString(36).slice(-12));
        studentUser = await prisma.user.create({
          data: {
            email: studentEmail,
            password: randomPassword,
            name: student.name,
            role: 'STUDENT',
            phone: normalizedStudentPhone,
          },
        });
        results.studentUserCreated = true;
      } else {
        results.studentUserExisted = true;
      }

      // Student → User 연결
      if (!student.userId) {
        await prisma.student.update({
          where: { id: student.id },
          data: { userId: studentUser.id },
        });
        results.studentLinked = true;
      }
    }
    results.studentUser = studentUser ? { id: studentUser.id, name: studentUser.name, phone: studentUser.phone, role: studentUser.role } : null;

    // 2. 학부모 User 생성
    const normalizedParentPhone = student.parentPhone?.replace(/[-\s]/g, '') || '';
    let parentUser = await prisma.user.findFirst({
      where: { role: 'PARENT', OR: [{ phone: normalizedParentPhone }, { phone: student.parentPhone }] },
    });

    if (!parentUser && student.parentPhone) {
      const parentEmail = `parent_${normalizedParentPhone}@suhaktamgu.local`;
      parentUser = await prisma.user.findUnique({ where: { email: parentEmail } }) as any;

      if (!parentUser) {
        const randomPassword = await hashPassword(Math.random().toString(36).slice(-12));
        parentUser = await prisma.user.create({
          data: {
            email: parentEmail,
            password: randomPassword,
            name: `${student.name} 학부모`,
            role: 'PARENT',
            phone: normalizedParentPhone,
          },
        });
        results.parentUserCreated = true;
      } else {
        results.parentUserExisted = true;
      }

      // ParentStudent 관계 확인/생성
      const existingRelation = await prisma.parentStudent.findFirst({
        where: { parentId: parentUser.id, studentId: student.id },
      });

      if (!existingRelation) {
        await prisma.parentStudent.create({
          data: { parentId: parentUser.id, studentId: student.id },
        });
        results.parentRelationCreated = true;
      }
    }
    results.parentUser = parentUser ? { id: parentUser.id, name: parentUser.name, phone: parentUser.phone, role: parentUser.role } : null;

    return NextResponse.json({ success: true, ...results });
  } catch (error: any) {
    console.error('Fix user error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
