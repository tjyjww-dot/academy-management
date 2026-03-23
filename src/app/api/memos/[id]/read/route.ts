import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
          const token = getTokenFromCookies(request);
          const user = verifyToken(token || '');
          if (!user?.userId) {
                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                }

          const { id: memoId } = await params;

          const memo = await prisma.memo.update({
                  where: { id: memoId },
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
