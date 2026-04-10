import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const tkn = getTokenFromCookies(request);
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

    let wrongAnswers = await prisma.wrongAnswer.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
        testPaper: { select: { id: true, name: true, answers: true, pages: { orderBy: { pageNumber: 'asc' } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-link orphan wrong answers missing testPaperId
    const orphans = wrongAnswers.filter(wa => !wa.testPaperId);
    if (orphans.length > 0) {
      const orphansByKey: Record<string, typeof orphans> = {};
      for (const wa of orphans) {
        const key = `${wa.testName}__${wa.classroomId}`;
        if (!orphansByKey[key]) orphansByKey[key] = [];
        orphansByKey[key].push(wa);
      }
      let updated = false;
      for (const [key, items] of Object.entries(orphansByKey)) {
        const [testName, cId] = key.split('__');
        const tp = await prisma.testPaper.findFirst({
          where: { name: testName, classroomId: cId },
          include: { pages: { orderBy: { pageNumber: 'asc' } } },
        });
        if (tp) {
          const pageMap: Record<number, string> = {};
          tp.pages.forEach(p => { pageMap[p.pageNumber] = p.imageUrl; });
          for (const wa of items) {
            await prisma.wrongAnswer.update({
              where: { id: wa.id },
              data: { testPaperId: tp.id, problemImage: pageMap[wa.problemNumber] || null },
            });
            updated = true;
          }
        }
      }
      if (updated) {
        wrongAnswers = await prisma.wrongAnswer.findMany({
          where,
          include: {
            student: { select: { id: true, name: true, studentNumber: true } },
            classroom: { select: { id: true, name: true } },
            testPaper: { select: { id: true, name: true, answers: true, pages: { orderBy: { pageNumber: 'asc' } } } },
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    return NextResponse.json(wrongAnswers);
  } catch (error) {
    console.error('Failed to fetch wrong answers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const tkn = getTokenFromCookies(request);
    if (!tkn) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const decoded = verifyToken(tkn);
    if (!decoded || ['PARENT', 'STUDENT'].includes(decoded.role)) {
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

      // Match problem N to image page N (each problem is stored as a separate page)
      const problemImage = pageImages[num] || null;

      if (existing) {
        // Always update testPaperId and image if provided (even for ACTIVE records)
        const updateData: any = {};
        if (testPaperId && !existing.testPaperId) updateData.testPaperId = testPaperId;
        if (problemImage && !existing.problemImage) updateData.problemImage = problemImage;
        if (existing.status === 'MASTERED') {
          updateData.status = 'ACTIVE';
          updateData.round = existing.round + 1;
          if (testPaperId) updateData.testPaperId = testPaperId;
          if (problemImage) updateData.problemImage = problemImage;
        }
        if (Object.keys(updateData).length > 0) {
          await prisma.wrongAnswer.update({
            where: { id: existing.id },
            data: updateData,
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
