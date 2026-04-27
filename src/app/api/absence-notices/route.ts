import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

/**
 * 관리자/데스크/담당강사용 결석·지각 통보 목록 조회.
 *
 * GET /api/absence-notices
 *   ADMIN/DESK : 모든 통보
 *   TEACHER    : 본인이 담당하는 반의 학생들 통보만
 *   학부모/학생 : 차단
 *
 * 응답: AbsenceNotice[] (학생 + 학생의 활성 반·강사 정보 포함)
 */
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });

    if (!['ADMIN', 'DESK', 'TEACHER'].includes(payload.role)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    let where: any = {};
    if (payload.role === 'TEACHER') {
      // 강사가 담당하는 반의 학생들
      const myClassrooms = await prisma.classroom.findMany({
        where: { teacherId: payload.userId },
        select: { id: true },
      });
      const myClassroomIds = myClassrooms.map(c => c.id);
      if (myClassroomIds.length === 0) return NextResponse.json([]);
      const enrollments = await prisma.enrollment.findMany({
        where: {
          classroomId: { in: myClassroomIds },
          status: 'ACTIVE',
        },
        select: { studentId: true },
      });
      const studentIds = Array.from(new Set(enrollments.map(e => e.studentId)));
      if (studentIds.length === 0) return NextResponse.json([]);
      where.studentId = { in: studentIds };
    }

    const list = await prisma.absenceNotice.findMany({
      where,
      orderBy: [{ status: 'asc' }, { date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        student: {
          select: {
            id: true,
            name: true,
            enrollments: {
              where: { status: 'ACTIVE' },
              select: {
                classroom: {
                  select: { id: true, name: true, teacher: { select: { id: true, name: true } } },
                },
              },
            },
          },
        },
      },
    });
    return NextResponse.json(list);
  } catch (e: any) {
    console.error('통보 목록 조회 실패:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

/**
 * PATCH /api/absence-notices
 *   body: { id, status: 'ACKNOWLEDGED' | 'PENDING' }
 *
 * 통보를 "확인 완료" 처리한다. ADMIN/DESK/TEACHER 만.
 */
export async function PATCH(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });

    if (!['ADMIN', 'DESK', 'TEACHER'].includes(payload.role)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const body = await request.json();
    const { id, status } = body;
    if (!id || !['ACKNOWLEDGED', 'PENDING'].includes(status)) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const updated = await prisma.absenceNotice.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    console.error('통보 상태 변경 실패:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
