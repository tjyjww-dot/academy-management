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
    if (orphans.length > 0) {h
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
        if (tp) {h
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

