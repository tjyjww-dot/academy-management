import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

// GET: 특정 연도/학기/시험종류 + 학생 목록과 함께 조회
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const year = parseInt(params.get('year') || '0', 10);
    const semester = parseInt(params.get('semester') || '0', 10);
    const examType = params.get('examType') || '';

    if (!year || !semester || !examType) {
      return NextResponse.json({ error: 'year/semester/examType 필수' }, { status: 400 });
    }

    const [entries, students] = await Promise.all([
      prisma.examPrep.findMany({
        where: { year, semester, examType },
      }),
      prisma.student.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true, school: true, grade: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    return NextResponse.json({ entries, students });
  } catch (error) {
    console.error('ExamPrep GET error:', error);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

// POST: upsert (연도/학기/시험종류/학생 기준)
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const body = await request.json();
    const {
      year,
      semester,
      examType,
      studentId,
      testRange,
      examStartDate,
      examEndDate,
      mathExamDate,
      mathExamTime,
      prepDate,
      prepTime,
    } = body;

    if (!year || !semester || !examType || !studentId) {
      return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 });
    }

    const data = {
      testRange: testRange || null,
      examStartDate: examStartDate || null,
      examEndDate: examEndDate || null,
      mathExamDate: mathExamDate || null,
      mathExamTime: mathExamTime || null,
      prepDate: prepDate || null,
      prepTime: prepTime || null,
    };

    const entry = await prisma.examPrep.upsert({
      where: {
        year_semester_examType_studentId: { year, semester, examType, studentId },
      },
      update: data,
      create: { year, semester, examType, studentId, ...data },
    });

    return NextResponse.json(entry);
  } catch (error) {
    console.error('ExamPrep POST error:', error);
    return NextResponse.json({ error: '저장 실패' }, { status: 500 });
  }
}

// DELETE: 특정 학생의 항목 제거
export async function DELETE(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token || !verifyToken(token)) {
      return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    }

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    await prisma.examPrep.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('ExamPrep DELETE error:', error);
    return NextResponse.json({ error: '삭제 실패' }, { status: 500 });
  }
}
