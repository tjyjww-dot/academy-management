import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token') || cookieStore.get('auth-token-js');
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.value.split('.')[1], 'base64').toString());
    // 토큰 만료 확인 (이 검증이 없으면 미들웨어와 불일치로 무한 리다이렉트 발생)
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return await prisma.user.findUnique({ where: { id: payload.userId } });
  } catch { return null; }
}

export async function GET(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'PARENT' && user.role !== 'STUDENT')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    let studentIds: string[] = [];

    if (user.role === 'PARENT') {
      const links = await prisma.parentStudent.findMany({
        where: { parentId: user.id },
        select: { studentId: true }
      });
      studentIds = links.map(l => l.studentId);
    } else {
      const student = await prisma.student.findFirst({ where: { userId: user.id } });
      if (student) studentIds = [student.id];
    }

    if (studentIds.length === 0)
      return NextResponse.json({ error: 'No students found' }, { status: 404 });

    const students = await prisma.student.findMany({
      where: { id: { in: studentIds } },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { classroom: { include: { subject: true, teacher: true } } }
        }
      },
    });

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const dailyReports = await prisma.dailyReport.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: ninetyDaysAgo.toISOString().split('T')[0] }
      },
      include: { classroom: { include: { subject: true } } },
      orderBy: { date: 'desc' },
    });

    const grades = await prisma.grade.findMany({
      where: { studentId: { in: studentIds } },
      include: { classroom: { include: { subject: true } } },
      orderBy: { testDate: 'desc' },
      take: 20,
    });

    const gradesWithAvg = await Promise.all(grades.map(async (g: any) => {
      const allGrades = await prisma.grade.findMany({
        where: { classroomId: g.classroomId, testName: g.testName, testDate: g.testDate },
        select: { score: true, maxScore: true }
      });
      const scores = allGrades.map((gr: any) => gr.score);
      const avg = allGrades.length > 0
        ? Math.round(allGrades.reduce((sum: number, gr: any) => sum + (gr.score / (gr.maxScore || 100)) * 100, 0) / allGrades.length * 10) / 10
        : g.score;
      const avgRaw = allGrades.length > 0
        ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length * 10) / 10
        : g.score;
      const highScore = scores.length > 0 ? Math.max(...scores) : g.score;
      const lowScore = scores.length > 0 ? Math.min(...scores) : g.score;
      const studentCount = allGrades.length;
      return { ...g, classAverage: avg, avgRaw, highScore, lowScore, studentCount };
    }));

    const attendance = await prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: ninetyDaysAgo.toISOString().split('T')[0] }
      },
      include: { classroom: { include: { subject: true } } },
      orderBy: { date: 'desc' },
    });

    const baseAnnouncements = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { publishDate: 'desc' },
      take: 20
    });

    // 학부모인 경우: 자녀의 dailyReport에 저장된 personalNote(전달사항)도
    // 공지 탭에 함께 표시. 학생 응답에는 포함하지 않음.
    let announcements: any[] = baseAnnouncements;
    if (user.role === 'PARENT') {
      const personalItems: any[] = [];
      for (const r of dailyReports) {
        if (!r.content) continue;
        let note = '';
        try {
          const parsed = JSON.parse(r.content);
          if (parsed && typeof parsed === 'object' && parsed.personalNote) {
            note = String(parsed.personalNote).trim();
          }
        } catch {}
        if (!note) continue;
        const stu = students.find((s: any) => s.id === r.studentId);
        personalItems.push({
          id: 'pn-' + r.id,
          title: '✉️ ' + (stu?.name || '') + ' 학생 전달사항',
          content: note,
          targetRole: 'PARENT',
          publishDate: new Date(r.date + 'T00:00:00'),
          expiryDate: null,
          isActive: true,
          createdAt: new Date(r.date + 'T00:00:00'),
        });
      }
      announcements = [...personalItems, ...baseAnnouncements].sort(
        (a: any, b: any) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
      );
    }

    const classroomIds = students.flatMap(s =>
      s.enrollments.map((e: any) => e.classroom.id)
    );

    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const videos = await prisma.lectureVideo.findMany({
      where: {
        classroomId: { in: classroomIds },
        date: { gte: twoWeeksAgo.toISOString().split('T')[0] }
      },
      include: { classroom: { include: { subject: true } } },
      orderBy: { date: 'desc' },
    });

    return NextResponse.json({
      user: { id: user.id, name: user.name, role: user.role },
      students,
      dailyReports,
      grades: gradesWithAvg,
      attendance,
      announcements,
      videos
    });

  } catch (error) {
    console.error('Parent data error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
