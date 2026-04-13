import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
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

      // 받은 요청사항: targetUserId가 현재 사용자인 것만 표시 (미완료)
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

      // 최근 1주일 신규 상담 내용 (관리자/데스크만)
      const isAdminOrDesk = decoded.role === 'ADMIN' || decoded.role === 'DESK';
      let recentCounseling: any[] = [];
      if (isAdminOrDesk) {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        recentCounseling = await prisma.counselingRequest.findMany({
          where: {
            createdAt: { gte: oneWeekAgo },
          },
          include: {
            student: {
              select: {
                id: true, name: true,
                enrollments: {
                  where: { status: 'ACTIVE' },
                  include: { classroom: { include: { teacher: { select: { name: true } } } } },
                  take: 1,
                },
              },
            },
            parent: { select: { name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });
      }

      // 대기중인 상담 요청 - 강사는 담당 학생만, 관리자/데스크는 전체
      // parentId 유무와 무관하게 PENDING 상태면 모두 포함 (조치 필요)
      const pendingCounselingRequests = await prisma.counselingRequest.findMany({
        where: {
          status: 'PENDING',
          ...(isAdminOrDesk ? {} : { studentId: { in: studentIds.length > 0 ? studentIds : ['__none__'] } }),
        },
        include: {
          student: { select: { id: true, name: true } },
          parent: { select: { name: true, phone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // 결석인데 메모(remarks)가 없는 출결 기록 - 강사는 담당 학생만, 관리자/데스크는 전체
      const absentWithoutMemo = await prisma.attendanceRecord.findMany({
        where: {
          status: 'ABSENT',
          OR: [{ remarks: null }, { remarks: '' }],
          ...(isAdminOrDesk ? {} : { studentId: { in: studentIds.length > 0 ? studentIds : ['__none__'] } }),
        },
        include: {
          student: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 30,
      });

      // 최근 7일간 결석 메모가 작성된 기록 (최근 상담 내용 섹션에 표시)
      const sevenDaysAgoStr = (() => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString().split('T')[0]; })();
      const recentAbsentWithMemo = await prisma.attendanceRecord.findMany({
        where: {
          status: 'ABSENT',
          date: { gte: sevenDaysAgoStr },
          remarks: { not: null },
          AND: [{ remarks: { not: '' } }],
          ...(isAdminOrDesk ? {} : { studentId: { in: studentIds.length > 0 ? studentIds : ['__none__'] } }),
        },
        include: {
          student: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: 30,
      });

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
          userRole: decoded.role,
          announcements,
          recentCounseling,
          upcomingTests,
          taskRequests: taskRequestsForUser,
          pendingCounselingRequests,
          absentWithoutMemo,
          recentAbsentWithMemo,
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
