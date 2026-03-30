import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: '인증 토큰이 유효하지 않습니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sent = searchParams.get('sent');
    const received = searchParams.get('received');
    const targetUserId = searchParams.get('targetUserId');

    let whereClause: any = {};

    if (sent === 'true') {
      // 내가 보낸 요청
      whereClause.createdBy = decoded.userId;
    } else if (received === 'true') {
      // 내가 받은 요청
      whereClause.targetUserId = decoded.userId;
    } else if (targetUserId) {
      whereClause.targetUserId = targetUserId;
    }

    const taskRequests = await prisma.taskRequest.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(
      { taskRequests },
      { status: 200 }
    );
  } catch (error) {
    console.error('Task requests error:', error);
    return NextResponse.json(
      { error: '요청사항 목록을 불러오는 데 실패했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json(
        { error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: '인증 토큰이 유효하지 않습니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, targetUserId, targetRole } = body;
    const createdByFromToken = decoded.userId;
    const createdByNameFromToken = decoded.name || '';

    if (!title) {
      return NextResponse.json(
        { error: '필수 필드가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // Look up target user name if targetUserId is provided
    let resolvedTargetUserName = '';
    let resolvedTargetRole = targetRole || 'TEACHER';
    if (targetUserId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { name: true, role: true }
      });
      if (targetUser) {
        resolvedTargetUserName = targetUser.name;
        resolvedTargetRole = targetUser.role;
      }
    }

    const taskRequest = await prisma.taskRequest.create({
      data: {
        title,
        description: description || null,
        createdBy: createdByFromToken,
        createdByName: createdByNameFromToken,
        targetRole: resolvedTargetRole,
        targetUserId: targetUserId || null,
        targetUserName: resolvedTargetUserName || null,
        isCompleted: false,
      },
    });

    return NextResponse.json(
      {
        message: '요청사항이 성공적으로 등록되었습니다.',
        taskRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create task request error:', error);
    return NextResponse.json(
      { error: '요청사항 등록에 실패했습니다.' },
      { status: 500 }
    );
  }
}
