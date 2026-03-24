import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const tkn = request.cookies.get('token')?.value;
    if (!tkn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = verifyToken(tkn);
    if (!decoded) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const classroomId = searchParams.get('classroomId');
    const status = searchParams.get('status');

    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (classroomId) where.classroomId = classroomId;
    if (status) where.status = status;

    const wrongAnswers = await prisma.wrongAnswer.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
        testPaper: { include: { pages: { orderBy: { pageNumber: 'asc' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(wrongAnswers);
  } catch (error) {
    console.error('Failed to fetch wrong answers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tkn = request.cookies.get('token')?.value;
    if (!tkn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = verifyToken(tkn);
    if (!decoded || !['ADMIN', 'TEACHER'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { studentId, classroomId, testName, problemNumbers, testPaperId } = body;

    if (!studentId || !classroomId || !testName || !problemNumbers?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // If testPaperId provided, get the test paper pages for image linking
    let pageImages: Record<number, string> = {};
    if (testPaperId) {
      const testPaper = await prisma.testPaper.findUnique({
        where: { id: testPaperId },
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
      });
      if (testPaper) {
        for (const page of testPaper.pages) {
          pageImages[page.pageNumber] = page.imageUrl;
        }
      }
    }

    const results = [];
    for (const num of problemNumbers) {
      const existing = await prisma.wrongAnswer.findUnique({
        where: {
          studentId_classroomId_testName_problemNumber: {
            studentId, classroomId, testName, problemNumber: num,
          },
        },
      });

      // Determine which page image to link (simple: use first page if only 1, else try to match)
      const problemImage = pageImages[1] || null;

      if (existing) {
        if (existing.status === 'MASTERED') {
          await prisma.wrongAnswer.update({
            where: { id: existing.id },
            data: {
              status: 'ACTIVE',
              round: existing.round + 1,
              testPaperId: testPaperId || existing.testPaperId,
              problemImage: problemImage || existing.problemImage,
            },
          });
        }
        results.push(existing);
      } else {
        const created = await prisma.wrongAnswer.create({
          data: {
            studentId, classroomId, testName,
            problemNumber: num,
            testPaperId: testPaperId || null,
            problemImage,
          },
        });
        results.push(created);
      }
    }

    return NextResponse.json({ count: results.length, results });
  } catch (error) {
    console.error('Failed to record wrong answers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
