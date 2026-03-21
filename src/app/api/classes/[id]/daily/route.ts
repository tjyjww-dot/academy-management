import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';

async function getUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token');
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.value.split('.')[1], 'base64').toString());
    return await prisma.user.findUnique({ where: { id: payload.userId } });
  } catch { return null; }
}

// GET: fetch daily data for a specific date
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: classroomId } = await params;
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        subject: true,
        teacher: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: { student: true }
        },
      }
    });

    if (!classroom) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [attendance, grades, allGrades, todayAssignments, prevAssignments, videos, dailyReports] = await Promise.all([
      prisma.attendanceRecord.findMany({ where: { classroomId, date } }),
      prisma.grade.findMany({ where: { classroomId, testDate: date } }),
      prisma.grade.findMany({ where: { classroomId }, orderBy: { createdAt: 'desc' } }),
      prisma.assignment.findMany({ where: { classroomId, assignmentDate: date }, include: { submissions: true } }),
      prisma.assignment.findMany({ where: { classroomId, NOT: { assignmentDate: date } }, orderBy: { assignmentDate: 'desc' }, take: 5, include: { submissions: true } }),
      prisma.lectureVideo.findMany({ where: { classroomId, date } }),
      prisma.dailyReport.findMany({ where: { classroomId, date } }),
    ]);

    // ì´ì  ë ì§ì DailyReportìì ìì  ê°ì ¸ì¤ê¸° (ì¤ë³µ ì ê±°)
    const prevDailyHomework = await prisma.dailyReport.findMany({
      where: {
        classroomId,
        date: { lt: date },
        homework: { not: '' },
      },
      orderBy: { date: 'desc' },
      take: 20,
      distinct: ['date'],
      select: { date: true, homework: true },
    });

    // DailyReport ìì ë¥¼ ì´ì  ê³¼ì  íìì¼ë¡ ë³ííì¬ prevAssignmentsì ë³í©
    const homeworkAsAssignments = prevDailyHomework
      .filter((dr: any) => dr.homework && dr.homework.trim() !== '')
      .reduce((acc: any[], dr: any) => {
        // ê°ì ë ì§ì ìì ê° ì¬ë¬ ê°ì¼ ì ìì¼ë¯ë¡ ë ì§ë³ë¡ ì¤ë³µ ì ê±°
        if (!acc.find((a: any) => a.assignmentDate === dr.date && a.title === dr.homework)) {
          acc.push({
            id: 'hw-' + dr.date,
            assignmentDate: dr.date,
            title: dr.homework,
            description: '',
          });
        }
        return acc;
      }, []);

    // Assignmentì DailyReport ìì ë¥¼ í©ì¹ í ë ì§ì ì ë ¬
    const allPrevItems = [...prevAssignments.map((a: any) => ({
      id: a.id,
      assignmentDate: a.assignmentDate,
      title: a.title,
      description: a.description,
    })), ...homeworkAsAssignments]
      .sort((a: any, b: any) => b.assignmentDate.localeCompare(a.assignmentDate))
      .slice(0, 5);

    let prevAssignmentForHomework = '';
    const todayHasHomework = dailyReports.some((dr) => dr.homework && dr.homework.trim() !== '');
    if (!todayHasHomework) {
      // ë¨¼ì  ê°ì¥ ìµê·¼ DailyReportì ìì ë¥¼ íì¸
      const latestPrevHomework = await prisma.dailyReport.findFirst({
        where: { classroomId, date: { lt: date }, homework: { not: '' } },
        orderBy: { date: 'desc' },
      });
      if (latestPrevHomework && latestPrevHomework.homework?.trim()) {
        prevAssignmentForHomework = latestPrevHomework.homework;
      } else {
        // DailyReportì ìì¼ë©´ Assignmentìì ê°ì ¸ì¤ê¸°
        const latestPrevAssignment = await prisma.assignment.findFirst({
          where: { classroomId, assignmentDate: { lt: date } },
          orderBy: { assignmentDate: 'desc' },
        });
        if (latestPrevAssignment) {
          prevAssignmentForHomework = latestPrevAssignment.title + (latestPrevAssignment.description ? ' - ' + latestPrevAssignment.description : '');
        }
      }
    }

    return NextResponse.json({
      classroom, attendance, grades, allGrades, todayAssignments, prevAssignments: allPrevItems,
      videos, dailyReports, date, prevAssignmentForHomework,
    });
  } catch (error) {
    console.error('Daily fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST: save daily session data with transaction
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: classroomId } = await params;
  const body = await req.json();
  const { date, attendanceData, gradesData, assignmentGrades, newAssignment, videoData, progressNote, homework, announcement, perStudentHomework, perStudentProgress, sendPushNotification } = body;

  // If this is only a push notification request (e.g., from copyReport), skip data saving
  if (sendPushNotification && !attendanceData && !gradesData && !assignmentGrades && !videoData && !progressNote && !homework && !announcement && !perStudentHomework && !perStudentProgress) {
    try {
      const { studentId: pushStudentId } = sendPushNotification;
      const parentLinks = await prisma.parentStudent.findMany({
        where: { studentId: pushStudentId },
        include: { parent: { include: { pushTokens: { where: { isActive: true } } } } },
      });
      const tokens = parentLinks.flatMap(pl => pl.parent.pushTokens.map(pt => pt.token));
      if (tokens.length > 0) {
        const messages = tokens.map(t => ({
          to: t,
          sound: 'default',
          title: 'Daily Report',
          body: sendPushNotification.studentName + ' daily report is ready.',
          data: { type: 'DAILY_REPORT', studentId: pushStudentId, date },
        }));
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        });
      }
    } catch (pushErr) {
      console.error('Push notification error (non-fatal):', pushErr);
    }
    return NextResponse.json({ success: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Attendance
      if (attendanceData && Array.isArray(attendanceData)) {
        for (const att of attendanceData) {
          if (!att.status) continue;
          await tx.attendanceRecord.upsert({
            where: { studentId_classroomId_date: { studentId: att.studentId, classroomId, date } },
            update: { status: att.status, remarks: att.remarks || '' },
            create: { studentId: att.studentId, classroomId, date, status: att.status, remarks: att.remarks || '' },
          });
        }
      }

      // 2. Grades
      if (gradesData && Array.isArray(gradesData)) {
        for (const g of gradesData) {
          if (g.score !== undefined && g.score !== null && g.score !== '') {
            const existing = await tx.grade.findFirst({
              where: { studentId: g.studentId, classroomId, testDate: date }
            });
            if (existing) {
              await tx.grade.update({
                where: { id: existing.id },
                data: { score: parseFloat(g.score), maxScore: parseFloat(g.maxScore) || 100, testName: g.testName || 'daily test' },
              });
            } else {
              await tx.grade.create({
                data: { studentId: g.studentId, classroomId, testDate: date, score: parseFloat(g.score), maxScore: parseFloat(g.maxScore) || 100, testName: g.testName || 'daily test' },
              });
            }
          }
        }
      }

      // 3. Daily reports per student
      const enrollments = await tx.enrollment.findMany({ where: { classroomId, status: 'ACTIVE' } });
      const agMap: Record<string, string> = {};
      if (assignmentGrades && Array.isArray(assignmentGrades)) {
        for (const ag of assignmentGrades) { agMap[ag.studentId] = ag.grade; }
      }
      const pshMap: Record<string, string> = {};
      if (perStudentHomework && Array.isArray(perStudentHomework)) {
        for (const psh of perStudentHomework) { pshMap[psh.studentId] = psh.homework; }
      }

      const pspMap: Record<string, string> = {};
      if (perStudentProgress && Array.isArray(perStudentProgress)) {
        for (const psp of perStudentProgress) {
          pspMap[psp.studentId] = psp.progress;
        }
      }

      for (const enr of enrollments) {
        await tx.dailyReport.upsert({
          where: { studentId_classroomId_date: { studentId: enr.studentId, classroomId, date } },
          update: { content: pspMap[enr.studentId] || progressNote || '', homework: pshMap[enr.studentId] || homework || '', attitude: agMap[enr.studentId] || '', specialNote: announcement || '' },
          create: { studentId: enr.studentId, classroomId, date, content: progressNote || '', homework: pshMap[enr.studentId] || homework || '', attitude: agMap[enr.studentId] || '', specialNote: announcement || '' },
        });
      }

      // 4. New assignment
      if (newAssignment && newAssignment.title) {
        await tx.assignment.create({
          data: { classroomId, title: newAssignment.title, description: newAssignment.description || '', assignmentDate: date, dueDate: newAssignment.dueDate || date },
        });
      }

      // 5. Lecture video
      if (videoData && videoData.videoUrl) {
        const existingVideo = await tx.lectureVideo.findFirst({ where: { classroomId, date } });
        if (existingVideo) {
          await tx.lectureVideo.update({ where: { id: existingVideo.id }, data: { title: videoData.title || '', videoUrl: videoData.videoUrl } });
        } else {
          await tx.lectureVideo.create({ data: { classroomId, title: videoData.title || '', videoUrl: videoData.videoUrl, date } });
        }
      }
    });

    // Push notification (outside transaction - non-fatal)
    if (sendPushNotification) {
      try {
        const { studentId: pushStudentId } = sendPushNotification;
        const parentLinks = await prisma.parentStudent.findMany({
          where: { studentId: pushStudentId },
          include: { parent: { include: { pushTokens: { where: { isActive: true } } } } },
        });
        const tokens = parentLinks.flatMap(pl => pl.parent.pushTokens.map(pt => pt.token));
        if (tokens.length > 0) {
          const messages = tokens.map(t => ({
            to: t, sound: 'default', title: 'Daily Report',
            body: sendPushNotification.studentName + ' daily report is ready.',
            data: { type: 'DAILY_REPORT', studentId: pushStudentId, date },
          }));
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
            body: JSON.stringify(messages),
          });
        }
      } catch (pushErr) {
        console.error('Push notification error (non-fatal):', pushErr);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Daily save error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
