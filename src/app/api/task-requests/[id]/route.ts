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
        { error: 'ì¸ì¦ì´ íìí©ëë¤.' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'ì í¨íì§ ìì í í°ìëë¤.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { isCompleted, completedBy, response: responseText } = body;
    const { id: taskId } = await params;

    // ëµì¥ê³¼ í¨ê» ìë£ ì²ë¦¬
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
        message: 'ìì²­ì¬í­ì´ ìë°ì´í¸ëììµëë¤.',
        taskRequest: taskRequest || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update task request error:', error);
    return NextResponse.json(
      { error: 'ìì²­ì¬í­ ìë°ì´í¸ ì¤ ì¤ë¥ê° ë°ìíìµëë¤.' },
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
        { error: 'ì¸ì¦ì´ íìí©ëë¤.' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'ì í¨íì§ ìì í í°ìëë¤.' },
        { status: 401 }
      );
    }

    const { id: taskId } = await params;

    await prisma.taskRequest.delete({
      where: { id: taskId },
    });

    return NextResponse.json(
      {
        message: 'ìì²­ì¬í­ì´ ì­ì ëììµëë¤.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete task request error:', error);
    return NextResponse.json(
      { error: 'ìì²­ì¬í­ ì­ì  ì¤ ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500 }
    );
  }
}
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
      await prisma.taskRequest.update({
        where: { id: taskId },
        data: {
          isCompleted: true,
          completedBy: completedBy || null,
          completedAt: new Date(),
        },
      });
    } else {
      await prisma.taskRequest.update({
        where: { id: taskId },
        data: {
          isCompleted: false,
          completedBy: null,
          completedAt: null,
        },
      });
    }

    // Fetch and return the updated task request
    const taskRequest = await prisma.taskRequest.findUnique({
      where: { id: taskId },
    });

    return NextResponse.json(
      {
        message: '업무 요청사항이 업데이트되었습니다.',
        taskRequest: taskRequest || null,
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
    await prisma.taskRequest.delete({
      where: { id: taskId },
    });

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
