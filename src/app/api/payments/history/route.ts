import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

// GET: 학생별 입금 내역 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const search = searchParams.get('search') || '';

    if (studentId) {
      // 특정 학생의 전체 내역
      const payments = await prisma.payment.findMany({
        where: { studentId },
        include: { student: true },
        orderBy: { yearMonth: 'desc' },
      });
      return NextResponse.json({ data: payments });
    }

    if (search) {
      // 학생 이름 검색
      const students = await prisma.student.findMany({
        where: {
          name: { contains: search },
        },
        include: {
          payments: {
            orderBy: { yearMonth: 'desc' },
          },
        },
        orderBy: { name: 'asc' },
      });
      return NextResponse.json({ data: students });
    }

    return NextResponse.json({ data: [] });
  } catch (error) {
    console.error('Failed to fetch payment history:', error);
    return NextResponse.json({ error: '입금 내역 조회에 실패했습니다.' }, { status: 500 });
  }
}
