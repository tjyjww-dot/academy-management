import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET: 월별 수납 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const yearMonth = searchParams.get('yearMonth') || new Date().toISOString().slice(0, 7);
    const search = searchParams.get('search') || '';

    // 현재 재원 중인 학생 목록
    const activeStudents = await prisma.student.findMany({
      where: {
        status: 'ACTIVE',
        ...(search ? { name: { contains: search } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    // 해당 월의 수납 기록 조회
    const payments = await prisma.payment.findMany({
      where: {
        yearMonth,
        student: {
          status: 'ACTIVE',
          ...(search ? { name: { contains: search } } : {}),
        },
      },
      include: {
        student: true,
      },
      orderBy: { student: { name: 'asc' } },
    });

    // 수납 기록이 없는 학생도 포함하여 반환
    const paymentMap = new Map(payments.map((p: any) => [p.studentId, p]));

    const result = activeStudents.map((student: any) => {
      const payment = paymentMap.get(student.id);
      return {
        studentId: student.id,
        studentName: student.name,
        studentNumber: student.studentNumber,
        grade: student.grade,
        school: student.school,
        payment: payment || null,
      };
    });

    return NextResponse.json({ data: result, yearMonth });
  } catch (error) {
    console.error('Failed to fetch payments:', error);
    return NextResponse.json({ error: '수납 정보를 불러오는데 실패했습니다.' }, { status: 500 });
  }
}

// POST: 수납 기록 생성 또는 업데이트
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentId, yearMonth, tuitionFee, specialFee, otherFee, remarks, status } = body;

    if (!studentId || !yearMonth) {
      return NextResponse.json({ error: '학생 ID와 연월은 필수입니다.' }, { status: 400 });
    }

    const totalFee = (tuitionFee || 0) + (specialFee || 0) + (otherFee || 0);

    // 이미 존재하는 기록이 있는지 확인
    const existing = await prisma.payment.findFirst({
      where: { studentId, yearMonth },
    });

    let payment;
    if (existing) {
      payment = await prisma.payment.update({
        where: { id: existing.id },
        data: {
          tuitionFee: tuitionFee ?? existing.tuitionFee,
          specialFee: specialFee ?? existing.specialFee,
          otherFee: otherFee ?? existing.otherFee,
          totalFee,
          remarks: remarks !== undefined ? remarks : existing.remarks,
          status: status || existing.status,
        },
        include: { student: true },
      });
    } else {
      payment = await prisma.payment.create({
        data: {
          studentId,
          yearMonth,
          tuitionFee: tuitionFee || 0,
          specialFee: specialFee || 0,
          otherFee: otherFee || 0,
          totalFee,
          remarks: remarks || null,
          status: status || 'INPUT_DONE',
        },
        include: { student: true },
      });
    }

    return NextResponse.json(payment);
  } catch (error) {
    console.error('Failed to save payment:', error);
    return NextResponse.json({ error: '수납 정보 저장에 실패했습니다.' }, { status: 500 });
  }
}
