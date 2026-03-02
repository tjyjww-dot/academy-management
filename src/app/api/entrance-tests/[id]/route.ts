import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

// ────────────────────────────────────────────────
// PATCH /api/entrance-tests/[id]
// 상태 변경 및 전체 필드 수정
// ────────────────────────────────────────────────
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, notes, name, school, grade, parentPhone, testDate, testTime, priorLevel, testScore, counselingNotes } = body;

    const now = new Date().toISOString();

    // 동적으로 SET 절 구성 (전달된 필드만 업데이트)
    const sets: string[] = [];
    const vals: unknown[] = [];

    if (name !== undefined)        { sets.push('name = ?');        vals.push(name); }
    if (school !== undefined)      { sets.push('school = ?');      vals.push(school); }
    if (grade !== undefined)       { sets.push('grade = ?');       vals.push(grade); }
    if (parentPhone !== undefined) { sets.push('parentPhone = ?'); vals.push(parentPhone); }
    if (testDate !== undefined)    { sets.push('testDate = ?');    vals.push(testDate); }
    if (testTime !== undefined)    { sets.push('testTime = ?');    vals.push(testTime); }
    if (status !== undefined)      { sets.push('status = ?');      vals.push(status); }
    if (notes !== undefined)       { sets.push('notes = ?');       vals.push(notes); }
    if (priorLevel !== undefined)  { sets.push('priorLevel = ?');  vals.push(priorLevel); }
    if (testScore !== undefined)   { sets.push('testScore = ?');   vals.push(testScore); }
    if (counselingNotes !== undefined) { sets.push('counselingNotes = ?'); vals.push(counselingNotes); }

    sets.push('updatedAt = ?');
    vals.push(now);
    vals.push(id);

    await prisma.$executeRawUnsafe(
      `UPDATE EntranceTest SET ${sets.join(', ')} WHERE id = ?`,
      ...vals
    );

    const [updated] = await prisma.$queryRawUnsafe(
      `SELECT * FROM EntranceTest WHERE id = ?`,
      id
    ) as any[];

    if (!updated) {
      return NextResponse.json({ error: '해당 예약을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error('entrance-tests PATCH error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// ────────────────────────────────────────────────
// DELETE /api/entrance-tests/[id]
// 예약 삭제
// ────────────────────────────────────────────────
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: '유효하지 않은 토큰입니다.' }, { status: 401 });
    }

    const { id } = await params;

    await prisma.$executeRawUnsafe(
      `DELETE FROM EntranceTest WHERE id = ?`,
      id
    );

    return NextResponse.json({ message: '삭제되었습니다.' }, { status: 200 });
  } catch (error) {
    console.error('entrance-tests DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
