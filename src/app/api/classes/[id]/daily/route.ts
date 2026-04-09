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

    // 이전 날짜의 DailyReport에서 숙제 가져오기 (중복 제거)
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

    // DailyReport 숙제를 이전 과제 형식으로 변환하여 prevAssignments와 병합
    const homeworkAsAssignments = prevDailyHomework
      .filter((dr: any) => dr.homework && dr.homework.trim() !== '')
      .reduce((acc: any[], dr: any) => {
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

    // Assignment와 DailyReport 숙제를 합친 후 날짜순 정렬
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
      const latestPrevHomework = await prisma.dailyReport.findFirst({
        where: { classroomId, date: { lt: date }, homework: { not: '' } },
        orderBy: { date: 'desc' },
      });
      if (latestPrevHomework && latestPrevHomework.homework?.trim()) {
        prevAssignmentForHomework = latestPrevHomework.homework;
      } else {
        const latestPrevAssignment = await prisma.assignment.findFirst({
          where: { classroomId, assignmentDate: { lt: date } },
          orderBy: { assignmentDate: 'desc' },
        });
        if (latestPrevAssignment) {
          prevAssignmentForHomework = latestPrevAssignment.title + (latestPrevAssignment.description ? ' - ' + latestPrevAssignment.description : '');
        }
      }
    }

    // DailyReport의 content에서 testName/maxScore 메타데이터 추출
    let savedTestName = '';
    let savedMaxScore = '100';
    if (dailyReports.length > 0) {
      try {
        const parsed = JSON.parse(dailyReports[0].content);
        if (parsed && typeof parsed === 'object' && 'progressNote' in parsed) {
          savedTestName = parsed.testName || '';
          savedMaxScore = parsed.maxScore || '100';
        }
      } catch {
        // 레거시 데이터 (JSON이 아닌 경우) - 무시
      }
    }

    return NextResponse.json({
      classroom, attendance, grades, allGrades, todayAssignments, prevAssignments: allPrevItems,
      videos, dailyReports, date, prevAssignmentForHomework, savedTestName, savedMaxScore,
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
  const { date, attendanceData, gradesData, assignmentGrades, newAssignment, videoData, progressNote, homework, announcement, perStudentHomework, perStudentProgress, perStudentNote, sendPushNotification, testName: bodyTestName, maxScore: bodyMaxScore } = body;

  // If this is only a push notification request (e.g., from copyReport), skip data saving
  if (sendPushNotification && !attendanceData && !gradesData && !assignmentGrades && !videoData && !progressNote && !homework && !announcement && !perStudentHomework && !perStudentProgress) {
    let expoSent = 0;
    let webSent = 0;
    try {
      const { studentId: pushStudentId } = sendPushNotification;
      // 학부모 + 학생 본인 userId 수집
      const parentLinks = await prisma.parentStudent.findMany({
        where: { studentId: pushStudentId },
        include: { parent: { include: { pushTokens: { where: { isActive: true } } } } },
      });
      const student = await prisma.student.findUnique({
        where: { id: pushStudentId },
        include: { user: { include: { pushTokens: { where: { isActive: true } } } } },
      });
      const expoTokens = [
        ...parentLinks.flatMap(pl => pl.parent.pushTokens.map(pt => pt.token)),
        ...((student?.user?.pushTokens || []).map(pt => pt.token)),
      ];
      if (expoTokens.length > 0) {
        const messages = expoTokens.map(t => ({
          to: t,
          sound: 'default',
          badge: 1,
          priority: 'high',
          channelId: 'default',
          title: '📋 수업 리포트',
          body: sendPushNotification.studentName + ' 학생의 오늘 수업 리포트가 도착했습니다.',
          data: { type: 'DAILY_REPORT', studentId: pushStudentId, date },
        }));
        const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
          body: JSON.stringify(messages),
        });
        if (expoRes.ok) expoSent = expoTokens.length;
      }
      // 웹 푸시(학부모/학생 모두)
      try {
        const { sendWebPushToStudent } = await import('@/lib/web-push-notification');
        const r = await sendWebPushToStudent(
          pushStudentId,
          '📋 수업 리포트',
          sendPushNotification.studentName + ' 학생의 오늘 수업 리포트가 도착했습니다.',
          '/parent'
        );
        webSent = r?.sent || 0;
      } catch (e) { console.error('web push error', e); }
    } catch (pushErr) {
      console.error('Push notification error (non-fatal):', pushErr);
    }
    return NextResponse.json({ success: true, expoSent, webSent });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Attendance
      if (attendanceData && Array.isArray(attendanceData)) {
        for (const att of attendanceData) {
          // 상태와 메모가 모두 비었으면 기존 기록 삭제
          if (!att.status && !att.remarks) {
            await tx.attendanceRecord.deleteMany({
              where: { studentId: att.studentId, classroomId, date },
            });
            continue;
          }
          await tx.attendanceRecord.upsert({
            where: { studentId_classroomId_date: { studentId: att.studentId, classroomId, date } },
            update: {
              status: att.status || 'PRESENT',
              remarks: att.remarks || '',
            },
            create: {
              studentId: att.studentId,
              classroomId,
              date,
              status: att.status || 'PRESENT',
              remarks: att.remarks || '',
            },
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
          } else {
            // 점수가 비었으면 해당 날짜의 기존 점수 삭제
            await tx.grade.deleteMany({
              where: { studentId: g.studentId, classroomId, testDate: date },
            });
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

      const psnMap: Record<string, string> = {};
      if (perStudentNote && Array.isArray(perStudentNote)) {
        for (const pn of perStudentNote) {
          psnMap[pn.studentId] = pn.note;
        }
      }

      // content 필드에 progressNote와 함께 testName/maxScore 메타데이터를 JSON으로 저장
      for (const enr of enrollments) {
        let studentProgress = pspMap[enr.studentId] || progressNote || '';
            // Fix: progressNote에 JSON이 중첩 저장되는 버그 방지 - 순수 텍스트만 추출
            if (typeof studentProgress === 'string' && studentProgress.startsWith('{')) {
              try {
                let parsed = JSON.parse(studentProgress);
                while (parsed && typeof parsed === 'object' && 'progressNote' in parsed) {
                  studentProgress = parsed.progressNote || '';
                  if (typeof studentProgress !== 'string' || !studentProgress.startsWith('{')) break;
                  try { parsed = JSON.parse(studentProgress); } catch { break; }
                }
              } catch {}
            }
            const contentData = JSON.stringify({
              progressNote: studentProgress,
              testName: bodyTestName || '',
              maxScore: bodyMaxScore || '100',
              personalNote: psnMap[enr.studentId] || '',
            });

        await tx.dailyReport.upsert({
          where: { studentId_classroomId_date: { studentId: enr.studentId, classroomId, date } },
          update: { content: contentData, homework: pshMap[enr.studentId] || homework || '', attitude: agMap[enr.studentId] || '', specialNote: announcement || '' },
          create: { studentId: enr.studentId, classroomId, date, content: contentData, homework: pshMap[enr.studentId] || homework || '', attitude: agMap[enr.studentId] || '', specialNote: announcement || '' },
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
      let expoSent = 0;
      let webSent = 0;
      try {
        const { studentId: pushStudentId } = sendPushNotification;
        // 학부모 + 학생 본인 userId 수집
        const parentLinks = await prisma.parentStudent.findMany({
          where: { studentId: pushStudentId },
          include: { parent: { include: { pushTokens: { where: { isActive: true } } } } },
        });
        const student = await prisma.student.findUnique({
          where: { id: pushStudentId },
          include: { user: { include: { pushTokens: { where: { isActive: true } } } } },
        });
        const expoTokens = [
          ...parentLinks.flatMap(pl => pl.parent.pushTokens.map(pt => pt.token)),
          ...((student?.user?.pushTokens || []).map(pt => pt.token)),
        ];
        if (expoTokens.length > 0) {
          const messages = expoTokens.map(t => ({
            to: t,
            sound: 'default',
            badge: 1,
            priority: 'high',
            channelId: 'default',
            title: '📋 수업 리포트',
            body: sendPushNotification.studentName + ' 학생의 오늘 수업 리포트가 도착했습니다.',
            data: { type: 'DAILY_REPORT', studentId: pushStudentId, date },
          }));
          const expoRes = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'Accept-encoding': 'gzip, deflate', 'Content-Type': 'application/json' },
            body: JSON.stringify(messages),
          });
          if (expoRes.ok) expoSent = expoTokens.length;
        }
        // 웹 푸시 (학부모/학생 모두)
        try {
          const { sendWebPushToStudent } = await import('@/lib/web-push-notification');
          const r = await sendWebPushToStudent(
            pushStudentId,
            '📋 수업 리포트',
            sendPushNotification.studentName + ' 학생의 오늘 수업 리포트가 도착했습니다.',
            '/parent'
          );
          webSent = r?.sent || 0;
        } catch (e) { console.error('web push error', e); }
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
