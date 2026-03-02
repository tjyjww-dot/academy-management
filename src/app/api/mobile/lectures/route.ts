import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireMobileAuth } from '@/lib/mobile-auth';

/**
 * GET /api/mobile/lectures?studentId=xxx&classroomId=yyy
 * 학생이 등록된 반의 강의 영상/링크를 조회합니다.
 */
export async function GET(request: NextRequest) {
  try {
    const { error, status, user } = requireMobileAuth(request);
    if (error || !user) {
      return NextResponse.json({ error }, { status });
    }

    const studentId = request.nextUrl.searchParams.get('studentId');
    const classroomId = request.nextUrl.searchParams.get('classroomId');

    // 학생이 등록된 반의 강의만 조회
    let classroomIds: string[] = [];

    if (classroomId) {
      classroomIds = [classroomId];
    } else if (studentId) {
      const enrollments = await prisma.enrollment.findMany({
        where: { studentId, status: 'ACTIVE' },
        select: { classroomId: true },
      });
      classroomIds = enrollments.map((e: any) => e.classroomId);
    }

    if (classroomIds.length === 0) {
      return NextResponse.json([]);
    }

    const lectures = await prisma.lectureVideo.findMany({
      where: {
        classroomId: { in: classroomIds },
        isPublished: true,
      },
      orderBy: { date: 'desc' },
      take: 50,
      include: {
        classroom: {
          include: { subject: true },
        },
      },
    });

    return NextResponse.json(
      lectures.map((l: any) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        videoUrl: l.videoUrl,
        videoType: l.videoType,
        duration: l.duration,
        date: l.date,
        classroom: l.classroom.name,
        subject: l.classroom.subject.name,
      }))
    );
  } catch (error) {
    console.error('Get lectures error:', error);
    return NextResponse.json(
      { error: '강의 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
