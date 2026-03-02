import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';
import { randomUUID } from 'crypto';

// ────────────────────────────────────────────────
// GET /api/entrance-tests
// 전체 목록 또는 upcoming(임박한) 목록 반환
// query: ?upcoming=true  →  오늘 이후 날짜 + 시간순 정렬
// ────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const upcoming = searchParams.get('upcoming') === 'true';
    const limit = parseInt(searchParams.get('limit') || '100');

    const today = new Date().toISOString().split('T')[0];

    let rows: any[];

    if (upcoming) {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, name, school, grade, parentPhone, testDate, testTime, status, notes, priorLevel, testScore, counselingNotes, createdAt, updatedAt FROM EntranceTest
         WHERE testDate >= ?
           AND status = 'SCHEDULED'
         ORDER BY testDate ASC, testTime ASC
         LIMIT ?`,
        today,
        limit
      );
    } else {
      rows = await prisma.$queryRawUnsafe(
        `SELECT id, name, school, grade, parentPhone, testDate, testTime, status, notes, priorLevel, testScore, counselingNotes, createdAt, updatedAt FROM EntranceTest
         ORDER BY testDate DESC, testTime DESC
         LIMIT ?`,
        limit
      );
    }

    return NextResponse.json(rows, { status: 200 });
  } catch (error) {
    console.error('entrance-tests GET error:', error);
    return NextResponse.json({ error: '데이터 조회 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// ────────────────────────────────────────────────
// POST /api/entrance-tests
// 새 입학테스트 예약 생성
// ────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { name, school, grade, parentPhone, testDate, testTime, notes, priorLevel, testScore, counselingNotes } = body;

    if (!name || !parentPhone || !testDate || !testTime) {
      return NextResponse.json(
        { error: '이름, 학부모 연락처, 테스트 날짜, 시간은 필수입니다.' },
        { status: 400 }
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await prisma.$executeRawUnsafe(
      `INSERT INTO EntranceTest (id, name, school, grade, parentPhone, testDate, testTime, status, notes, priorLevel, testScore, counselingNotes, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?, ?, ?)`,
      id,
      name,
      school || null,
      grade || null,
      parentPhone,
      testDate,
      testTime,
      notes || null,
      priorLevel || null,
      testScore || null,
      counselingNotes || null,
      now,
      now
    );

    const [created] = await prisma.$queryRawUnsafe(
      `SELECT * FROM EntranceTest WHERE id = ?`,
      id
    ) as any[];

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('entrance-tests POST error:', error);
    return NextResponse.json({ error: '예약 생성 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
