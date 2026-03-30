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
        { error: 'Ã¬ÂÂ¸Ã¬Â¦ÂÃ¬ÂÂ´ Ã­ÂÂÃ¬ÂÂÃ­ÂÂ©Ã«ÂÂÃ«ÂÂ¤.' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Ã¬ÂÂ Ã­ÂÂ¨Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ¬ÂÂ Ã­ÂÂ Ã­ÂÂ°Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { isCompleted, completedBy, response: responseText } = body;
    const { id: taskId } = await params;

    // Ã«ÂÂµÃ¬ÂÂ¥ÃªÂ³Â¼ Ã­ÂÂ¨ÃªÂ»Â Ã¬ÂÂÃ«Â£Â Ã¬Â²ÂÃ«Â¦Â¬
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
        message: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­Ã¬ÂÂ´ Ã¬ÂÂÃ«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ¸Ã«ÂÂÃ¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.',
        taskRequest: taskRequest || null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update task request error:', error);
    return NextResponse.json(
      { error: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­ Ã¬ÂÂÃ«ÂÂ°Ã¬ÂÂ´Ã­ÂÂ¸ Ã¬Â¤Â Ã¬ÂÂ¤Ã«Â¥ÂÃªÂ°Â Ã«Â°ÂÃ¬ÂÂÃ­ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
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
        { error: 'Ã¬ÂÂ¸Ã¬Â¦ÂÃ¬ÂÂ´ Ã­ÂÂÃ¬ÂÂÃ­ÂÂ©Ã«ÂÂÃ«ÂÂ¤.' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { error: 'Ã¬ÂÂ Ã­ÂÂ¨Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ¬ÂÂ Ã­ÂÂ Ã­ÂÂ°Ã¬ÂÂÃ«ÂÂÃ«ÂÂ¤.' },
        { status: 401 }
      );
    }

    const { id: taskId } = await params;

    await prisma.taskRequest.delete({
      where: { id: taskId },
    });

    return NextResponse.json(
      {
        message: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­Ã¬ÂÂ´ Ã¬ÂÂ­Ã¬Â ÂÃ«ÂÂÃ¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete task request error:', error);
    return NextResponse.json(
      { error: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­ Ã¬ÂÂ­Ã¬Â Â Ã¬Â¤Â Ã¬ÂÂ¤Ã«Â¥ÂÃªÂ°Â Ã«Â°ÂÃ¬ÂÂÃ­ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
      { status: 500 }
    );
  }
}
