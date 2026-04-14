import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const classroomId = searchParams.get('classroomId');

    const where: Record<string, unknown> = {};
    if (studentId) where.studentId = studentId;
    if (classroomId) where.classroomId = classroomId;

    // 강사(TEACHER)는 본인이 담당하는 반의 데이터만 조회
    if (payload.role === 'TEACHER') {
      const myClassrooms = await prisma.classroom.findMany({
        where: { teacherId: payload.userId },
        select: { id: true },
      });
      const myClassroomIds = myClassrooms.map(c => c.id);
      if (classroomId) {
        if (!myClassroomIds.includes(classroomId)) {
          return NextResponse.json([]);
        }
      } else {
        where.classroomId = { in: myClassroomIds.length > 0 ? myClassroomIds : ['__none__'] };
      }
    }

    let tests = await prisma.wrongAnswerTest.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
        items: { include: { wrongAnswer: { include: { testPaper: { include: { pages: { orderBy: { pageNumber: 'asc' } } } } } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Auto-link orphan wrong answers missing testPaperId (fix for existing data)
    let needRefresh = false;
    for (const test of tests) {
      for (const item of test.items) {
        const wa = item.wrongAnswer;
        if (!wa.testPaperId) {
          const tp = await prisma.testPaper.findFirst({
            where: { name: wa.testName, classroomId: wa.classroomId },
            include: { pages: { orderBy: { pageNumber: 'asc' } } },
          });
          if (tp) {
            const pageMap: Record<number, string> = {};
            tp.pages.forEach(p => { pageMap[p.pageNumber] = p.imageUrl; });
            await prisma.wrongAnswer.update({
              where: { id: wa.id },
              data: { testPaperId: tp.id, problemImage: pageMap[wa.problemNumber] || null },
            });
            needRefresh = true;
          }
        }
      }
    }

    // Re-fetch if any auto-links were made
    if (needRefresh) {
      tests = await prisma.wrongAnswerTest.findMany({
        where,
        include: {
          student: { select: { id: true, name: true, studentNumber: true } },
          classroom: { select: { id: true, name: true } },
          items: { include: { wrongAnswer: { include: { testPaper: { include: { pages: { orderBy: { pageNumber: 'asc' } } } } } } } },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return NextResponse.json(tests);
  } catch (error) {
    console.error('오답 테스트 조회 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증이 필요합니다' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: '유효하지 않은 토큰입니다' }, { status: 401 });

    const body = await request.json();
    const { studentId, classroomId, maxCount } = body;

    if (!studentId || !classroomId) {
      return NextResponse.json({ error: '학생과 수업을 선택해주세요' }, { status: 400 });
    }

    let activeWrongAnswers = await prisma.wrongAnswer.findMany({
      where: { studentId, classroomId, status: 'ACTIVE' },
      orderBy: [{ testName: 'asc' }, { problemNumber: 'asc' }],
    });

    if (activeWrongAnswers.length === 0) {
      return NextResponse.json({ error: '활성 오답이 없습니다' }, { status: 400 });
    }

    // Auto-link testPaper for wrong answers missing testPaperId
    const orphansByTestName: Record<string, typeof activeWrongAnswers> = {};
    for (const wa of activeWrongAnswers) {
      if (!wa.testPaperId) {
        if (!orphansByTestName[wa.testName]) orphansByTestName[wa.testName] = [];
        orphansByTestName[wa.testName].push(wa);
      }
    }
    for (const [testName, orphans] of Object.entries(orphansByTestName)) {
      // Find a TestPaper with matching name in the same classroom
      const tp = await prisma.testPaper.findFirst({
        where: { name: testName, classroomId },
        include: { pages: { orderBy: { pageNumber: 'asc' } } },
      });
      if (tp && tp.pages.length > 0) {
        // Build pageNum -> imageUrl map
        const pageMap: Record<number, string> = {};
        tp.pages.forEach(p => { pageMap[p.pageNumber] = p.imageUrl; });
        // Update each orphan wrong answer
        for (const wa of orphans) {
          await prisma.wrongAnswer.update({
            where: { id: wa.id },
            data: { testPaperId: tp.id, problemImage: pageMap[wa.problemNumber] || null },
          });
        }
        console.log(`[test-create] Auto-linked ${orphans.length} orphan wrong answers to testPaper "${testName}" (${tp.id})`);
      }
    }

    // If maxCount specified, randomly select that many problems
    if (maxCount && maxCount > 0 && maxCount < activeWrongAnswers.length) {
      const shuffled = [...activeWrongAnswers].sort(() => Math.random() - 0.5);
      activeWrongAnswers = shuffled.slice(0, maxCount);
    }

    const maxRound = Math.max(...activeWrongAnswers.map(wa => wa.round));

    const test = await prisma.wrongAnswerTest.create({
      data: {
        studentId,
        classroomId,
        round: maxRound,
        items: {
          create: activeWrongAnswers.map(wa => ({ wrongAnswerId: wa.id })),
        },
      },
      include: {
        student: { select: { id: true, name: true, studentNumber: true } },
        classroom: { select: { id: true, name: true } },
        items: { include: { wrongAnswer: { include: { testPaper: { include: { pages: { orderBy: { pageNumber: 'asc' } } } } } } } },
      },
    });

    return NextResponse.json(test, { status: 201 });
  } catch (error) {
    console.error('오답 테스트 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다' }, { status: 500 });
  }
}
