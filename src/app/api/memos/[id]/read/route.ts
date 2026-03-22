import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const memo = await prisma.memo.update({
      where: { id: params.id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return NextResponse.json(memo);
  } catch (error) {
    console.error('Error marking memo as read:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
