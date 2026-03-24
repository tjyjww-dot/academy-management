import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { del } from '@vercel/blob';
import { verifyToken } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { id } = await params;

    const testPaper = await prisma.testPaper.findUnique({
      where: { id },
      include: {
        classroom: true,
        pages: { orderBy: { pageNumber: 'asc' } },
        wrongAnswers: {
          include: { student: true }
        }
      }
    });

    if (!testPaper) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json(testPaper);
  } catch (error) {
    console.error('Failed to fetch test paper:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || !['ADMIN', 'TEACHER'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const testPaper = await prisma.testPaper.findUnique({
      where: { id },
      include: { pages: true }
    });

    if (!testPaper) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Delete images from Vercel Blob
    for (const page of testPaper.pages) {
      try {
        await del(page.imageUrl);
      } catch (e) {
        console.error('Failed to delete blob:', e);
      }
    }

    // Delete from database
    await prisma.testPaper.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete test paper:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
