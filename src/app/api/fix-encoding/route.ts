import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * DB 전체에서 한글 인코딩이 깨진 데이터를 찾아 수정하는 일회성 API
 * UTF-8 바이트가 Latin-1로 잘못 해석된 문자열을 복원
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (key !== 'fix-enc-2026-04') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results: Record<string, unknown[]> = {};

    // 1. Grade의 testName 수정
    const grades = await prisma.grade.findMany({
      select: { id: true, testName: true },
    });
    const gradeFixes: unknown[] = [];
    for (const g of grades) {
      const fixed = tryFixEncoding(g.testName);
      if (fixed !== g.testName) {
        await prisma.grade.update({
          where: { id: g.id },
          data: { testName: fixed },
        });
        gradeFixes.push({ id: g.id, old: g.testName, new: fixed });
      }
    }
    results.grades = gradeFixes;

    // 2. WrongAnswer의 testName 수정
    const wrongAnswers = await prisma.wrongAnswer.findMany({
      select: { id: true, testName: true },
    });
    const waFixes: unknown[] = [];
    for (const wa of wrongAnswers) {
      const fixed = tryFixEncoding(wa.testName);
      if (fixed !== wa.testName) {
        await prisma.wrongAnswer.update({
          where: { id: wa.id },
          data: { testName: fixed },
        });
        waFixes.push({ id: wa.id, old: wa.testName, new: fixed });
      }
    }
    results.wrongAnswers = waFixes;

    // 3. Classroom의 name 수정
    const classrooms = await prisma.classroom.findMany({
      select: { id: true, name: true },
    });
    const crFixes: unknown[] = [];
    for (const cr of classrooms) {
      const fixed = tryFixEncoding(cr.name);
      if (fixed !== cr.name) {
        await prisma.classroom.update({
          where: { id: cr.id },
          data: { name: fixed },
        });
        crFixes.push({ id: cr.id, old: cr.name, new: fixed });
      }
    }
    results.classrooms = crFixes;

    // 4. Subject의 name 수정
    const subjects = await prisma.subject.findMany({
      select: { id: true, name: true },
    });
    const subFixes: unknown[] = [];
    for (const s of subjects) {
      const fixed = tryFixEncoding(s.name);
      if (fixed !== s.name) {
        await prisma.subject.update({
          where: { id: s.id },
          data: { name: fixed },
        });
        subFixes.push({ id: s.id, old: s.name, new: fixed });
      }
    }
    results.subjects = subFixes;

    // 5. Announcement의 title, content 수정
    const announcements = await prisma.announcement.findMany({
      select: { id: true, title: true, content: true },
    });
    const annFixes: unknown[] = [];
    for (const a of announcements) {
      const fixedTitle = tryFixEncoding(a.title);
      const fixedContent = tryFixEncoding(a.content);
      if (fixedTitle !== a.title || fixedContent !== a.content) {
        await prisma.announcement.update({
          where: { id: a.id },
          data: { title: fixedTitle, content: fixedContent },
        });
        annFixes.push({ id: a.id, oldTitle: a.title, newTitle: fixedTitle });
      }
    }
    results.announcements = annFixes;

    // 6. DailySession의 content, homework 등 수정
    const sessions = await prisma.dailySession.findMany({
      select: { id: true, content: true, homework: true, attitude: true, specialNote: true },
    });
    const sesFixes: unknown[] = [];
    for (const s of sessions) {
      const fc = tryFixEncoding(s.content || '');
      const fh = tryFixEncoding(s.homework || '');
      const fa = tryFixEncoding(s.attitude || '');
      const fn = tryFixEncoding(s.specialNote || '');
      if (fc !== (s.content || '') || fh !== (s.homework || '') || fa !== (s.attitude || '') || fn !== (s.specialNote || '')) {
        await prisma.dailySession.update({
          where: { id: s.id },
          data: {
            content: fc || null,
            homework: fh || null,
            attitude: fa || null,
            specialNote: fn || null,
          },
        });
        sesFixes.push({ id: s.id });
      }
    }
    results.dailySessions = sesFixes;

    // 7. User name (이전에 학부모만 수정했으므로 전체 확인)
    const users = await prisma.user.findMany({
      select: { id: true, name: true },
    });
    const userFixes: unknown[] = [];
    for (const u of users) {
      const fixed = tryFixEncoding(u.name);
      if (fixed !== u.name) {
        await prisma.user.update({
          where: { id: u.id },
          data: { name: fixed },
        });
        userFixes.push({ id: u.id, old: u.name, new: fixed });
      }
    }
    results.users = userFixes;

    const totalFixes = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

    return NextResponse.json({
      message: `Total ${totalFixes} records fixed`,
      results,
    });
  } catch (error) {
    console.error('Fix encoding error:', String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

/**
 * UTF-8 바이트가 Latin-1로 잘못 해석된 문자열을 복원 시도
 * 실패 시 원본 반환
 */
function tryFixEncoding(str: string): string {
  if (!str) return str;

  // 깨진 문자가 포함되어 있는지 확인
  // Latin-1로 잘못 해석된 UTF-8은 Ã, Â, ë, í 등의 패턴을 포함
  const hasBroken = /[\u00c0-\u00ff]/.test(str) && !/^[\x20-\x7e\uAC00-\uD7AF\u3131-\u318E\u0000-\u001f\s.,!?;:'"()\-\/0-9a-zA-Z]+$/.test(str);

  if (!hasBroken) return str;

  try {
    // 문자열을 Latin-1 바이트로 변환 후 UTF-8로 재해석
    const bytes = Buffer.from(str, 'latin1');
    const decoded = bytes.toString('utf-8');

    // 복원된 문자열에 한글이 포함되면 성공
    if (/[\uAC00-\uD7AF]/.test(decoded) && !/\ufffd/.test(decoded)) {
      return decoded;
    }
  } catch {
    // ignore
  }

  return str;
}
