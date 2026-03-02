import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { isCompleted, completedBy } = body;
    const { id: taskId } = await params;

    // Update task request
    if (isCompleted) {
      await prisma.$executeRawUnsafe(
        `UPDATE TaskRequest SET isCompleted = ?, completedBy = ?, completedAt = ?, updatedAt = ? WHERE id = ?`,
        true,
        completedBy || null,
        new Date().toISOString(),
        new Date().toISOString(),
        taskId
      );
    } else {
      await prisma.$executeRawUnsafe(
        `UPDATE TaskRequest SET isCompleted = ?, completedBy = NULL, completedAt = NULL, updatedAt = ? WHERE id = ?`,
        false,
        new Date().toISOString(),
        taskId
      );
    }

    // Fetch and return the updated task request
    const taskRequest = await prisma.$queryRawUnsafe(
      `SELECT * FROM TaskRequest WHERE id = ?`,
      taskId
    ) as any[];

    return NextResponse.json(
      {
        message: '업무 요청사항이 업데이트되었습니다.',
        taskRequest: taskRequest[0] || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update task request error:', error);
    return NextResponse.json(
      { error: '업무 요청사항 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id: taskId } = await params;

    // Delete task request
    await prisma.$executeRawUnsafe(
      `DELETE FROM TaskRequest WHERE id = ?`,
      taskId
    );

    return NextResponse.json(
      {
        message: '업무 요청사항이 삭제되었습니다.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete task request error:', error);
    return NextResponse.json(
      { error: '업무 요청사항 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
