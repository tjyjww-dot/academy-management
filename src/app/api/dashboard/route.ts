import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
      const token = getTokenFromCookies(request);
      if (!token) {
        return NextResponse.json(
          { error: 'Ã¬ÂÂ¸Ã¬Â¦ÂÃ¬ÂÂ´ Ã­ÂÂÃ¬ÂÂÃ­ÂÂ©Ã«ÂÂÃ«ÂÂ¤.' },
          { status: 401 }
        );
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return NextResponse.json(
          { error: 'Ã¬ÂÂ Ã­ÂÂ¨Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ¬ÂÂ Ã­ÂÂ Ã­ÂÂ°Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤.' },
          { status: 401 }
        );
      }

      const today = new Date().toISOString().split('T')[0];

      const [
        totalStudents,
        totalClassrooms,
        todayAttendanceCount,
        pendingCounselingCount,
        announcements,
      ] = await Promise.all([
        prisma.student.count({
          where: { status: 'ACTIVE' },
        }),
        prisma.classroom.count({
          where: { status: 'ACTIVE' },
        }),
        prisma.attendanceRecord.count({
          where: {
            date: today,
            status: 'PRESENT',
          },
        }),
        prisma.counselingRequest.count({
          where: { status: 'PENDING' },
        }),
        prisma.announcement.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            content: true,
            createdAt: true,
          },
        }),
      ]);

      const upcomingTests = await prisma.entranceTest.findMany({
        where: {
          testDate: { gte: today },
          status: 'SCHEDULED',
        },
        orderBy: [
          { testDate: 'asc' },
          { testTime: 'asc' },
        ],
        take: 5,
      });

      const todayTestCount = await prisma.entranceTest.count({
        where: {
          testDate: today,
          status: 'SCHEDULED',
        },
      });

      // Ã«Â°ÂÃ¬ÂÂ Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­: targetUserIdÃªÂ°Â Ã­ÂÂÃ¬ÂÂ¬ Ã¬ÂÂ¬Ã¬ÂÂ©Ã¬ÂÂÃ¬ÂÂ¸ ÃªÂ²ÂÃ«Â§Â Ã­ÂÂÃ¬ÂÂ (Ã«Â¯Â¸Ã¬ÂÂÃ«Â£Â)
      const taskRequestsForUser = await prisma.taskRequest.findMany({
        where: {
          targetUserId: decoded.userId,
          isCompleted: false,
        },
        orderBy: { createdAt: 'desc' },
      });

      const instructor = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: {
          classrooms: {
            include: {
              enrollments: {
                select: { studentId: true },
              },
            },
          },
        },
      });

      const studentIds = instructor?.classrooms?.flatMap(
        (c: { enrollments: { studentId: string }[] }) => c.enrollments.map((e: { studentId: string }) => e.studentId)
      ) || [];

      const parentMemos = await prisma.memo.findMany({
        where: {
          studentId: { in: studentIds.length > 0 ? studentIds : ['__none__'] },
          isFromParent: true,
          isRead: false,
        },
        include: {
          student: {
            select: { id: true, name: true },
          },
          author: {
            select: { name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      return NextResponse.json(
        {
          stats: {
            totalStudents,
            totalClassrooms,
            todayAttendance: todayAttendanceCount,
            pendingCounseling: pendingCounselingCount,
            todayTests: todayTestCount,
          },
          announcements,
          upcomingTests,
          taskRequests: taskRequestsForUser,
          parentMemos,
        },
        { status: 200 }
      );
    } catch (error) {
      console.error('Dashboard error:', error);
      return NextResponse.json(
        { error: 'Ã«ÂÂÃ¬ÂÂÃ«Â³Â´Ã«ÂÂ Ã«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ° Ã¬Â¡Â°Ã­ÂÂ Ã¬Â¤Â Ã¬ÂÂ¤Ã«Â¥ÂÃªÂ°Â Ã«Â°ÂÃ¬ÂÂÃ­ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
        { status: 500 }
      );
    }
}
