import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

/**
 * 학부모 결석/지각 사전 통보 API
 *
 * POST /api/parent/absence-notice
 *   body: { studentId, date, noticeType: 'ABSENT' | 'LATE', reason }
 *
 * 동작:
 * 1) AbsenceNotice 행 생성
 * 2) 해당 학생의 모든 ACTIVE 등록(반)에 대해 그 날짜의 출결레코드(AttendanceRecord) 를
 *    upsert: status = ABSENT/LATE, remarks = reason
 *    → 반관리 출결 페이지에서 자동으로 체크되고 메모가 채워짐.
 *
 * GET /api/parent/absence-notice?limit=20
 *   학부모가 자신이 제출한 통보 목록을 조회 (확인용)
 */
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });

    const body = await request.json();
    const { studentId, date, noticeType, reason } = body;

    if (!studentId || !date || !noticeType || !reason || !reason.trim()) {
      return NextResponse.json({ error: '필수 항목이 누락되었습니다' }, { status: 400 });
    }
    if (!['ABSENT', 'LATE'].includes(noticeType)) {
      return NextResponse.json({ error: '잘못된 유형' }, { status: 400 });
    }
    // YYYY-MM-DD 형식 검증
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '날짜 형식 오류 (YYYY-MM-DD)' }, { status: 400 });
    }

    // 학부모 권한 검증: PARENT 라면 본인의 자녀인지 확인
    if (payload.role === 'PARENT') {
      const link = await prisma.parentStudent.findFirst({
        where: { parentId: payload.userId, studentId },
      });
      if (!link) {
        return NextResponse.json({ error: '본인의 자녀가 아닙니다' }, { status: 403 });
      }
    } else if (payload.role === 'STUDENT') {
      const stu = await prisma.student.findUnique({ where: { id: studentId } });
      if (!stu || stu.userId !== payload.userId) {
        return NextResponse.json({ error: '본인 정보가 아닙니다' }, { status: 403 });
      }
    }
    // ADMIN/TEACHER/DESK 도 통보 등록 가능 (선택적으로 학부모를 대신해 입력)

    // 학생 + 보호자 이름 조회 (UI 표시용)
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true, name: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          select: { classroomId: true },
        },
      },
    });
    if (!student) {
      return NextResponse.json({ error: '학생을 찾을 수 없습니다' }, { status: 404 });
    }

    const me = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { name: true },
    });

    // 1) AbsenceNotice 생성
    const notice = await prisma.absenceNotice.create({
      data: {
        studentId,
        parentId: payload.role === 'PARENT' ? payload.userId : null,
        date,
        noticeType,
        reason: reason.trim(),
        status: 'PENDING',
        createdByName: me?.name || '학부모',
      },
    });

    // 2) 학생이 등록된 모든 활성 반의 출결레코드 upsert
    const status = noticeType === 'ABSENT' ? 'ABSENT' : 'LATE';
    let updatedCount = 0;
    for (const enr of student.enrollments) {
      try {
        await prisma.attendanceRecord.upsert({
          where: {
            studentId_classroomId_date: {
              studentId,
              classroomId: enr.classroomId,
              date,
            },
          },
          create: {
            studentId,
            classroomId: enr.classroomId,
            date,
            status,
            remarks: reason.trim(),
          },
          update: {
            status,
            // remarks 가 비어있으면 새로 채우고, 있으면 그대로 두지 않고 사유로 덮어씀
            remarks: reason.trim(),
          },
        });
        updatedCount++;
      } catch (e) {
        console.error('attendance upsert 실패:', e);
      }
    }

    return NextResponse.json({
      ok: true,
      notice,
      attendanceUpdated: updatedCount,
    });
  } catch (e: any) {
    console.error('결석/지각 통보 등록 실패:', e);
    return NextResponse.json({ error: '서버 오류: ' + (e?.message || '') }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });

    if (payload.role !== 'PARENT' && payload.role !== 'STUDENT') {
      return NextResponse.json({ error: '학부모 전용' }, { status: 403 });
    }

    let studentIds: string[] = [];
    if (payload.role === 'PARENT') {
      const links = await prisma.parentStudent.findMany({
        where: { parentId: payload.userId },
        select: { studentId: true },
      });
      studentIds = links.map(l => l.studentId);
    } else {
      const stu = await prisma.student.findFirst({
        where: { userId: payload.userId },
        select: { id: true },
      });
      if (stu) studentIds = [stu.id];
    }

    if (studentIds.length === 0) return NextResponse.json([]);

    const list = await prisma.absenceNotice.findMany({
      where: { studentId: { in: studentIds } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { student: { select: { name: true } } },
    });
    return NextResponse.json(list);
  } catch (e: any) {
    console.error('결석/지각 통보 목록 조회 실패:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}
