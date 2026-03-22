import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token');
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.value.split('.')[1], 'base64').toString());
    return await prisma.user.findUnique({ where: { id: payload.userId } });
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });
  const memos = await prisma.memo.findMany({
    where: { studentId },
    include: { author: { select: { name: true, role: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(memos);
}

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { studentId, content, parentMemoId } = await req.json();
  if (!studentId || !content) return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  const isFromParent = user.role === 'PARENT' || user.role === 'STUDENT';
  const memo = await prisma.memo.create({
    data: { studentId, authorId: user.id, content, isFromParent, parentMemoId: parentMemoId || null },
    include: { author: { select: { name: true, role: true } } },
  });

    // Create CounselingRequest record
    await prisma.counselingRequest.create({
      data: {
        studentId: studentId,
        parentId: session.user.id,
        type: 'MEMO',
        status: 'COMPLETED',
        content: content,
        resolvedAt: new Date(),
      },
    });
  return NextResponse.json(memo);
}
