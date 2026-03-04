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
    const role = searchParams.get('role');
    const createdBy = searchParams.get('createdBy');
    const sent = searchParams.get('sent');
    const targetUserId = searchParams.get('targetUserId');

    let whereClause = '';
    let params: any[] = [];

    if (role) {
      whereClause = 'WHERE "targetRole" = $1';
      params.push(role);
    }

    if (targetUserId) {
      if (whereClause) {
        whereClause += ` AND "targetUserId" = $${params.length + 1}`;
      } else {
        whereClause = `WHERE "targetUserId" = $1`;
      }
      params.push(targetUserId);
    }

    const effectiveCreatedBy = sent === 'true' ? decoded.userId : createdBy;

    if (effectiveCreatedBy) {
      if (whereClause) {
        whereClause += ` AND "createdBy" = $${params.length + 1}`;
      } else {
        whereClause = `WHERE "createdBy" = $1`;
      }
      params.push(effectiveCreatedBy);
    }

    const taskRequests = await prisma.$queryRawUnsafe(
      `SELECT * FROM "TaskRequest" ${whereClause} ORDER BY "createdAt" DESC`,
      ...params
    ) as any[];

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

    const id = crypto.randomUUID();
    await prisma.$executeRawUnsafe(
      `INSERT INTO "TaskRequest" ("id", "title", "description", "createdBy", "createdByName", "targetRole", "targetUserId", "targetUserName", "isCompleted", "createdAt", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      id,
      title,
      description || null,
      createdByFromToken,
      createdByNameFromToken,
      resolvedTargetRole,
      targetUserId || null,
      resolvedTargetUserName || null,
      false,
      new Date(),
      new Date()
    );

    const taskRequest = await prisma.$queryRawUnsafe(
      `SELECT * FROM "TaskRequest" WHERE "id" = $1`,
      id
    ) as any[];

    return NextResponse.json(
      {
        message: '요청사항이 성공적으로 등록되었습니다.',
        taskRequest: taskRequest[0] || null,
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
