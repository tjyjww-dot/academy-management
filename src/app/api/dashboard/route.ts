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
    // notes, priorLevel, testScore, counselingNotes 필드 포함하여 조회
    const upcomingTests = await prisma.$queryRawUnsafe(
      `SELECT id, name, school, grade, parentPhone, testDate, testTime, status, notes, priorLevel, testScore, counselingNotes, createdAt FROM EntranceTest
       WHERE testDate >= ?
         AND status = 'SCHEDULED'
       ORDER BY testDate ASC, testTime ASC
       LIMIT 5`,
      today
    ) as any[];

    // 오늘의 입학테스트 개수
    const todayTestCount = await prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM EntranceTest WHERE testDate = ? AND status = 'SCHEDULED'`,
      today
    ) as any[];

    // Fetch task requests for the user's role (pending ones)
    const taskRequestsForUser = await prisma.$queryRawUnsafe(
      `SELECT * FROM TaskRequest WHERE targetRole = ? AND isCompleted = 0 ORDER BY createdAt DESC`,
      decoded.role
    ) as any[];

    return NextResponse.json(
      {
        stats: {
          totalStudents,
          totalClassrooms,
          todayAttendance: todayAttendanceCount,
          pendingCounseling: pendingCounselingCount,
          todayTests: Number(todayTestCount[0]?.count ?? 0),
        },
        announcements,
        upcomingTests,
        taskRequests: taskRequestsForUser,
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
