import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { isCompleted, completedBy, response: responseText } = body;
    const { id: taskId } = await params;

    // 답장과 함께 완료 처리
    if (isCompleted) {
      await prisma.taskRequest.update({
        where: { id: taskId },
        data: {
          isCompleted: true,
          completedBy: completedBy || decoded.userId,
          completedAt: new Date(),
          response: responseText || null,
          responseByName: decoded.name || null,
        },
      });
    } else {
      await prisma.taskRequest.update({
        where: { id: taskId },
        data: {
          isCompleted: false,
          completedBy: null,
          completedAt: null,
          response: null,
          responseByName: null,
        },
      });
    }

    const taskRequest = await prisma.taskRequest.findUnique({
      where: { id: taskId },
    });

    return NextResponse.json(
      {
        message: '요청사항이 업데이트되었습니다.',
        taskRequest: taskRequest || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update task request error:', error);
    return NextResponse.json(
      { error: '요청사항 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
        { error: '유효하지 않은 토큰입니다.' },
        { status: 401 }
      );
    }

    const { id: taskId } = await params;

    await prisma.taskRequest.delete({
      where: { id: taskId },
    });

    return NextResponse.json(
      {
        message: '요청사항이 삭제되었습니다.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete task request error:', error);
    return NextResponse.json(
      { error: '요청사항 삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
