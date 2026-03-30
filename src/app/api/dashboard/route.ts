import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
      const token = getTokenFromCookies(request);
      if (!token) {
        return NextResponse.json(
          { error: 'ì¸ì¦ì´ íìí©ëë¤.' },
          { status: 401 }
        );
      }

      const decoded = verifyToken(token);
      if (!decoded) {
        return NextResponse.json(
          { error: 'ì í¨íì§ ìì í í°ìëë¤.' },
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

      // ë°ì ìì²­ì¬í­: targetUserIdê° íì¬ ì¬ì©ìì¸ ê²ë§ íì (ë¯¸ìë£)
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
        { error: 'ëìë³´ë ë°ì´í° ì¡°í ì¤ ì¤ë¥ê° ë°ìíìµëë¤.' },
        { status: 500 }
      );
    }
}
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
          // Verify authentication
      const token = getTokenFromCookies(request);
          if (!token) {
                  return NextResponse.json(
                    { error: '인증이 필요합니다.' },
                    { status: 401 }
                          );
          }

      const decoded = verifyToken(token);
          if (!decoded) {
                  return NextResponse.json(
                    { error: '유효하지 않은 토큰입니다.' },
                    { status: 401 }
                          );
          }

      // Get today's date string (YYYY-MM-DD)
      const today = new Date().toISOString().split('T')[0];

      // Fetch dashboard statistics
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

      // 임박한 입학테스트 (오늘 이후, SCHEDULED 상태, 날짜+시간 순)
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

      // 오늘의 입학테스트 개수
      const todayTestCount = await prisma.entranceTest.count({
              where: {
                        testDate: today,
                        status: 'SCHEDULED',
              },
      });

      // Fetch task requests for the user's role (pending ones)
      const taskRequestsForUser = await prisma.taskRequest.findMany({
              where: {
                        targetRole: decoded.role,
                        isCompleted: false,
              },
              orderBy: { createdAt: 'desc' },
      });

      // 학부모/학생이 보낸 읽지 않은 메모 가져오기
      // 현재 사용자가 담당하는 학생들의 메모를 가져옴
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
            { error: '대시보드 데이터 조회 중 오류가 발생했습니다.' },
            { status: 500 }
                );
    }
}
