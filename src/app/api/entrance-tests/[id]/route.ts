import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

// ————————————————————————————————————————
// PATCH /api/entrance-tests/[id]
// 상태 변경 및 전체 필드 수정
// ————————————————————————————————————————
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

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (school !== undefined) updateData.school = school;
    if (grade !== undefined) updateData.grade = grade;
    if (parentPhone !== undefined) updateData.parentPhone = parentPhone;
    if (testDate !== undefined) updateData.testDate = testDate;
    if (testTime !== undefined) updateData.testTime = testTime;
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (priorLevel !== undefined) updateData.priorLevel = priorLevel;
    if (testScore !== undefined) updateData.testScore = testScore;
    if (counselingNotes !== undefined) updateData.counselingNotes = counselingNotes;
    updateData.updatedAt = new Date().toISOString();

    const updated = await prisma.entranceTest.update({
      where: { id },
      data: updateData,
    });

    if (!updated) {
      return NextResponse.json({ error: '해당 예약을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error('entrance-tests PATCH error:', error);
    return NextResponse.json({ error: '수정 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

// ————————————————————————————————————————
// DELETE /api/entrance-tests/[id]
// 예약 삭제
// ————————————————————————————————————————
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

    await prisma.entranceTest.delete({
      where: { id },
    });

    return NextResponse.json({ message: '삭제되었습니다.' }, { status: 200 });
  } catch (error) {
    console.error('entrance-tests DELETE error:', error);
    return NextResponse.json({ error: '삭제 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
