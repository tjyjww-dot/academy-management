import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
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
        { error: 'Ã¬ÂÂ¸Ã¬Â¦Â Ã­ÂÂ Ã­ÂÂ°Ã¬ÂÂ´ Ã¬ÂÂ Ã­ÂÂ¨Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const sent = searchParams.get('sent');
    const received = searchParams.get('received');
    const targetUserId = searchParams.get('targetUserId');

    let whereClause: any = {};

    if (sent === 'true') {
      // Ã«ÂÂ´ÃªÂ°Â Ã«Â³Â´Ã«ÂÂ¸ Ã¬ÂÂÃ¬Â²Â­
      whereClause.createdBy = decoded.userId;
    } else if (received === 'true') {
      // Ã«ÂÂ´ÃªÂ°Â Ã«Â°ÂÃ¬ÂÂ Ã¬ÂÂÃ¬Â²Â­
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
      { error: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­ Ã«ÂªÂ©Ã«Â¡ÂÃ¬ÂÂ Ã«Â¶ÂÃ«ÂÂ¬Ã¬ÂÂ¤Ã«ÂÂ Ã«ÂÂ° Ã¬ÂÂ¤Ã­ÂÂ¨Ã­ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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
        { error: 'Ã¬ÂÂ¸Ã¬Â¦Â Ã­ÂÂ Ã­ÂÂ°Ã¬ÂÂ´ Ã¬ÂÂ Ã­ÂÂ¨Ã­ÂÂÃ¬Â§Â Ã¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { title, description, targetUserId, targetRole } = body;
    const createdByFromToken = decoded.userId;
    const createdByNameFromToken = decoded.name || '';

    if (!title) {
      return NextResponse.json(
        { error: 'Ã­ÂÂÃ¬ÂÂ Ã­ÂÂÃ«ÂÂÃªÂ°Â Ã«ÂÂÃ«ÂÂ½Ã«ÂÂÃ¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
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
        message: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­Ã¬ÂÂ´ Ã¬ÂÂ±ÃªÂ³ÂµÃ¬Â ÂÃ¬ÂÂ¼Ã«Â¡Â Ã«ÂÂ±Ã«Â¡ÂÃ«ÂÂÃ¬ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.',
        taskRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create task request error:', error);
    return NextResponse.json(
      { error: 'Ã¬ÂÂÃ¬Â²Â­Ã¬ÂÂ¬Ã­ÂÂ­ Ã«ÂÂ±Ã«Â¡ÂÃ¬ÂÂ Ã¬ÂÂ¤Ã­ÂÂ¨Ã­ÂÂÃ¬ÂÂµÃ«ÂÂÃ«ÂÂ¤.' },
      { status: 500 }
    );
  }
}
