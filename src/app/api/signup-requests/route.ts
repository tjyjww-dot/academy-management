import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { cookies } from 'next/headers';

/**
 * GET /api/signup-requests - 가입신청 목록 조회 (관리자 전용)
 */
export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload || payload.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status'); // PENDING, APPROVED, REJECTED

    const where: any = {};
    if (status) {
      where.status = status;
    }

    const requests = await prisma.signupRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ requests });
  } catch (error) {
    console.error('GET signup-requests error:', error);
    return NextResponse.json({ error: '목록 조회에 실패했습니다.' }, { status: 500 });
  }
}

/**
 * POST /api/signup-requests - 가입신청 생성 (공개 - 인증 불필요)
 * 모바일 앱이나 외부에서 신청 가능
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { studentName, school, grade, parentName, parentPhone, studentPhone, message } = body;

    if (!studentName || !parentPhone) {
      return NextResponse.json(
        { error: '학생 이름과 학부모 연락처는 필수입니다.' },
        { status: 400 }
      );
    }

    const signupRequest = await prisma.signupRequest.create({
      data: {
        studentName,
        school: school || null,
        grade: grade || null,
        parentName: parentName || null,
        parentPhone: parentPhone.replace(/[-\s]/g, ''),
        studentPhone: studentPhone ? studentPhone.replace(/[-\s]/g, '') : null,
        message: message || null,
      },
    });

    const response = NextResponse.json({
      message: '가입신청이 완료되었습니다. 학원에서 확인 후 연락드리겠습니다.',
      id: signupRequest.id,
    });

    // CORS for mobile
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');

    return response;
  } catch (error) {
    console.error('POST signup-requests error:', error);
    return NextResponse.json({ error: '신청 처리에 실패했습니다.' }, { status: 500 });
  }
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
