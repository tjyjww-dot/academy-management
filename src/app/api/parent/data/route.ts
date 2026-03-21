import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token') || cookieStore.get('auth-token-js');
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.value.split('.')[1], 'base64').toString());
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
        select: { score: true }
      });
      const avg = allGrades.length > 0
        ? Math.round(allGrades.reduce((sum: number, gr: any) => sum + gr.score, 0) / allGrades.length * 10) / 10
        : g.score;
      return { ...g, classAverage: avg };
    }));

    const attendance = await prisma.attendanceRecord.findMany({
      where: {
        studentId: { in: studentIds },
        date: { gte: ninetyDaysAgo.toISOString().split('T')[0] }
      },
      include: { classroom: { include: { subject: true } } },
      orderBy: { date: 'desc' },
    });

    const announcements = await prisma.announcement.findMany({
      where: { isActive: true },
      orderBy: { publishDate: 'desc' },
      take: 5
    });

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
