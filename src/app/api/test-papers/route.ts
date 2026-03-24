import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { put } from '@vercel/blob';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get('classroomId');

    const where: Record<string, unknown> = {};
    if (classroomId) where.classroomId = classroomId;

    const testPapers = await prisma.testPaper.findMany({
      where,
      include: {
        classroom: true,
        pages: { orderBy: { pageNumber: 'asc' } },
        _count: { select: { wrongAnswers: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(testPapers);
  } catch (error) {
    console.error('Failed to fetch test papers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || !['ADMIN', 'TEACHER'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const classroomId = formData.get('classroomId') as string;
    const totalProblems = parseInt(formData.get('totalProblems') as string);
    const answers = formData.get('answers') as string | null;
    const images = formData.getAll('images') as File[];

    if (!name || !classroomId || !totalProblems || images.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Upload images to Vercel Blob
    const pageData: { pageNumber: number; imageUrl: string }[] = [];
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i];
      const blob = await put(
        `test-papers/${classroomId}/${Date.now()}-page${i + 1}.png`,
        image,
        { access: 'public', contentType: 'image/png' }
      );
      pageData.push({ pageNumber: i + 1, imageUrl: blob.url });
    }

    // Create test paper with pages
    const testPaper = await prisma.testPaper.create({
      data: {
        name,
        classroomId,
        uploadedById: decoded.userId,
        totalProblems,
        answers: answers || undefined,
        pages: {
          create: pageData
        }
      },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
        classroom: true
      }
    });

    return NextResponse.json(testPaper);
  } catch (error) {
    console.error('Failed to create test paper:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
