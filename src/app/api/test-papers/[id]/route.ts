import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { deleteFile, extractFileId } from '@/lib/googleDrive';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || ['PARENT', 'STUDENT'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const updateData: Record<string, unknown> = {};
    if (body.answers !== undefined) updateData.answers = body.answers;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.totalProblems !== undefined) updateData.totalProblems = body.totalProblems;

    const testPaper = await prisma.testPaper.update({
      where: { id },
      data: updateData,
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
        classroom: true,
      }
    });

    return NextResponse.json(testPaper);
  } catch (error) {
    console.error('Failed to update test paper:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || ['PARENT', 'STUDENT'].includes(decoded.role)) {
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

    // Delete images from Google Drive
    for (const page of testPaper.pages) {
      try {
        const fileId = extractFileId(page.imageUrl);
        if (fileId) {
          await deleteFile(fileId);
        }
      } catch (e) {
        console.error('Failed to delete from Google Drive:', e);
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
