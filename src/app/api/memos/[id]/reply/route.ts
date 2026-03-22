import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { content } = await request.json();
    if (!content || !content.trim()) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Get the original memo
    const originalMemo = await prisma.memo.findUnique({
      where: { id: params.id },
      include: { student: true },
    });

    if (!originalMemo) {
      return NextResponse.json({ error: 'Memo not found' }, { status: 404 });
    }

    // Use transaction: create reply + mark original as read + create counseling record
    const result = await prisma.$transaction(async (tx) => {
      // Create reply memo
      const reply = await tx.memo.create({
        data: {
          studentId: originalMemo.studentId,
          authorId: session.user.id,
          content: content.trim(),
          isFromParent: false,
          parentMemoId: originalMemo.id,
        },
      });

      // Mark original memo as read
      await tx.memo.update({
        where: { id: params.id },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      // Create CounselingRequest record
      const counseling = await tx.counselingRequest.create({
        data: {
          studentId: originalMemo.studentId,
          parentId: originalMemo.authorId,
          type: 'MEMO',
          status: 'COMPLETED',
          content: `[학부모 메모] ${originalMemo.content}\n[강사 답변] ${content.trim()}`,
          resolvedAt: new Date(),
          resolvedBy: session.user.id,
        },
      });

      return { reply, counseling };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error replying to memo:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
