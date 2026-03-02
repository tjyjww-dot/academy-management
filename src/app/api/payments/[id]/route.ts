import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// PATCH: 수납 상태 업데이트
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, tuitionFee, specialFee, otherFee, remarks } = body;

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: '수납 기록을 찾을 수 없습니다.' }, { status: 404 });
    }

    const newTuition = tuitionFee !== undefined ? tuitionFee : existing.tuitionFee;
    const newSpecial = specialFee !== undefined ? specialFee : existing.specialFee;
    const newOther = otherFee !== undefined ? otherFee : existing.otherFee;
    const totalFee = newTuition + newSpecial + newOther;

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(tuitionFee !== undefined ? { tuitionFee } : {}),
        ...(specialFee !== undefined ? { specialFee } : {}),
        ...(otherFee !== undefined ? { otherFee } : {}),
        totalFee,
        ...(remarks !== undefined ? { remarks } : {}),
      },
      include: { student: true },
    });

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Failed to update payment:', error);
    return NextResponse.json({ error: '수납 상태 업데이트에 실패했습니다.' }, { status: 500 });
  }
}

// DELETE: 수납 기록 삭제
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.payment.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete payment:', error);
    return NextResponse.json({ error: '수납 기록 삭제에 실패했습니다.' }, { status: 500 });
  }
}
