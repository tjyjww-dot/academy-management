import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
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
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const createdBy = searchParams.get('createdBy');

    let whereClause = '';
    let params: any[] = [];

    if (role) {
      whereClause = 'WHERE targetRole = ?';
      params.push(role);
    }

    if (createdBy) {
      if (whereClause) {
        whereClause += ' AND createdBy = ?';
      } else {
        whereClause = 'WHERE createdBy = ?';
      }
      params.push(createdBy);
    }

    const taskRequests = await prisma.$queryRawUnsafe(
      `SELECT * FROM TaskRequest ${whereClause} ORDER BY createdAt DESC`,
      ...params
    ) as any[];

    return NextResponse.json(
      {
        taskRequests,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Task requests error:', error);
    return NextResponse.json(
      { error: '업무 요청사항 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
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
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, targetRole, createdBy, createdByName } = body;

    // Validate required fields
    if (!title || !targetRole || !createdBy) {
      return NextResponse.json(
        { error: '필수 입력값이 누락되었습니다.' },
        { status: 400 }
      );
    }

    // Create task request using raw SQL to be consistent with codebase
    const newTaskRequest = await prisma.$executeRawUnsafe(
      `INSERT INTO TaskRequest (id, title, description, createdBy, createdByName, targetRole, isCompleted, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      title,
      description || null,
      createdBy,
      createdByName || '',
      targetRole,
      false,
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Fetch and return the created task request
    const taskRequest = await prisma.$queryRawUnsafe(
      `SELECT * FROM TaskRequest WHERE createdBy = ? ORDER BY createdAt DESC LIMIT 1`,
      createdBy
    ) as any[];

    return NextResponse.json(
      {
        message: '업무 요청사항이 등록되었습니다.',
        taskRequest: taskRequest[0] || null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create task request error:', error);
    return NextResponse.json(
      { error: '업무 요청사항 등록 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
