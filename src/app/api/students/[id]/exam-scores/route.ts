import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

/**
 * 원생 내신점수 API
 *
 * GET    /api/students/[id]/exam-scores           → 학생의 12개 시험 슬롯 조회 (없으면 빈 슬롯 반환)
 * PUT    /api/students/[id]/exam-scores           → 12개 시험 슬롯 일괄 upsert
 *
 * 시험 슬롯: 중1·중2·중3 × 1·2학기 × 중간/기말 = 12 행. 각 행에 국영수과 점수 4개.
 */

const GRADES = [1, 2, 3];
const SEMESTERS = [1, 2];
const TYPES = ['MIDTERM', 'FINAL'] as const;

function buildEmptySlots(studentId: string) {
  const slots: any[] = [];
  for (const g of GRADES) {
    for (const s of SEMESTERS) {
      for (const t of TYPES) {
        slots.push({
          studentId,
          grade: g,
          semester: s,
          examType: t,
          korean: null,
          english: null,
          math: null,
          science: null,
        });
      }
    }
  }
  return slots;
}

function authzCheck(role: string | undefined) {
  // 관리자/강사/데스크는 조회/수정 가능. 학부모/학생은 차단.
  return role === 'ADMIN' || role === 'TEACHER' || role === 'DESK';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });
    if (!authzCheck(payload.role)) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    const { id: studentId } = await params;

    const records = await prisma.examScore.findMany({
      where: { studentId },
      orderBy: [{ grade: 'asc' }, { semester: 'asc' }, { examType: 'asc' }],
    });

    // 12개 슬롯 모두 반환 (빈 칸 포함)
    const slots = buildEmptySlots(studentId);
    for (const r of records) {
      const slot = slots.find(
        s => s.grade === r.grade && s.semester === r.semester && s.examType === r.examType
      );
      if (slot) {
        slot.id = r.id;
        slot.korean = r.korean;
        slot.english = r.english;
        slot.math = r.math;
        slot.science = r.science;
      }
    }

    return NextResponse.json(slots);
  } catch (e) {
    console.error('내신점수 조회 오류:', e);
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰' }, { status: 401 });
    if (!authzCheck(payload.role)) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    const { id: studentId } = await params;
    const body = await request.json();
    const slots: any[] = Array.isArray(body?.scores) ? body.scores : [];

    // 각 슬롯을 upsert. 점수가 모두 null 인 슬롯은 (이미 존재하지 않는 경우) 스킵, 존재하면 갱신.
    for (const s of slots) {
      const grade = Number(s.grade);
      const semester = Number(s.semester);
      const examType = String(s.examType || '');
      if (![1, 2, 3].includes(grade)) continue;
      if (![1, 2].includes(semester)) continue;
      if (!['MIDTERM', 'FINAL'].includes(examType)) continue;

      const cleaned = {
        korean: numOrNull(s.korean),
        english: numOrNull(s.english),
        math: numOrNull(s.math),
        science: numOrNull(s.science),
      };

      // 모두 null 이면 기존 행이 있으면 삭제, 없으면 패스
      const allNull = cleaned.korean == null && cleaned.english == null
        && cleaned.math == null && cleaned.science == null;

      if (allNull) {
        await prisma.examScore.deleteMany({
          where: { studentId, grade, semester, examType },
        });
        continue;
      }

      await prisma.examScore.upsert({
        where: {
          studentId_grade_semester_examType: { studentId, grade, semester, examType },
        },
        create: { studentId, grade, semester, examType, ...cleaned },
        update: cleaned,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('내신점수 저장 오류:', e);
    return NextResponse.json({ error: '저장 실패: ' + (e?.message || '서버 오류') }, { status: 500 });
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
