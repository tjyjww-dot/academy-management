import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// 임시 진단용 API - 확인 후 삭제 예정
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('key');
  if (secret !== 'sutam-debug-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 정태준이 포함된 반 찾기
    const classrooms = await prisma.classroom.findMany({
      where: { name: { contains: '정태준' } },
      include: {
        subject: true,
        lectureVideos: { orderBy: { date: 'desc' }, take: 10 },
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { student: { select: { id: true, name: true } } },
        },
      },
    });

    // 김다인 학생 정보
    const student = await prisma.student.findFirst({
      where: { name: { contains: '김다인' } },
    });

    let studentEnrollments: any[] = [];
    if (student) {
      studentEnrollments = await prisma.enrollment.findMany({
        where: { studentId: student.id, status: 'ACTIVE' },
        include: { classroom: { include: { subject: true } } },
      });
    }

    return NextResponse.json({
      classrooms: classrooms.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject?.name,
        videos: c.lectureVideos.map((v) => ({
          id: v.id,
          title: v.title,
          videoUrl: v.videoUrl,
          videoType: v.videoType,
          isPublished: v.isPublished,
          date: v.date,
        })),
        students: c.enrollments.map((e) => e.student.name),
      })),
      student: student ? {
        id: student.id,
        name: student.name,
        enrolledClasses: studentEnrollments.map((e) => ({
          classId: e.classroom.id,
          className: e.classroom.name,
          subject: e.classroom.subject?.name,
        })),
      } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
