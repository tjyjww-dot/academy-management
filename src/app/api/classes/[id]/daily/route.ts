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

// GET: í¹ì  ë ì§ì ëª¨ë  ë°ì¼ë¦¬ ë°ì´í° ê°ì ¸ì¤ê¸°
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


    // 이전 수업의 "오늘의 과제"를 숙제로 표시
    let prevAssignmentForHomework = '';
    const todayHasHomework = dailyReports.some((dr) => dr.homework && dr.homework.trim() !== '');
    if (!todayHasHomework) {
      const latestPrevAssignment = await prisma.assignment.findFirst({
        where: { classroomId, assignmentDate: { lt: date } },
        orderBy: { assignmentDate: 'desc' },
      });
      if (latestPrevAssignment) {
        prevAssignmentForHomework = latestPrevAssignment.title +
          (latestPrevAssignment.description ? ' - ' + latestPrevAssignment.description : '');
      }
    }

    return NextResponse.json({
      classroom, attendance, grades, allGrades,
      todayAssignments, prevAssignments, videos, dailyReports, date,
      prevAssignmentForHomework,
    });
  } catch (error) {
    console.error('Daily fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST: ë°ì¼ë¦¬ ì¸ì ë°ì´í° ì¼ê´ ì ì¥
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: classroomId } = await params;
  const body = await req.json();
  const { date, attendanceData, gradesData, assignmentGrades, newAssignment, videoData, progressNote, homework, announcement, perStudentHomework } = body;

  try {
    // 1. ì¶ê²° ì ì¥
    if (attendanceData && Array.isArray(attendanceData)) {
      for (const att of attendanceData) {
                  if (!att.status) continue; // skip empty attendance
        await prisma.attendanceRecord.upsert({
          where: {
            studentId_classroomId_date: {
              studentId: att.studentId,
              classroomId,
              date,
            }
          },
          update: { status: att.status, remarks: att.remarks || '' },
          create: {
            studentId: att.studentId,
            classroomId,
            date,
            status: att.status,
            remarks: att.remarks || '',
          },
        });
      }
    }

    // 2. ì±ì  ì ì¥
    if (gradesData && Array.isArray(gradesData)) {
      for (const g of gradesData) {
        if (g.score !== undefined && g.score !== null && g.score !== '') {
          const existing = await prisma.grade.findFirst({
            where: { studentId: g.studentId, classroomId, testDate: date }
          });
          if (existing) {
            await prisma.grade.update({
              where: { id: existing.id },
              data: {
                score: parseFloat(g.score),
                maxScore: parseFloat(g.maxScore) || 100,
                testName: g.testName || 'ì¼ì¼íì¤í¸',
              },
            });
          } else {
            await prisma.grade.create({
              data: {
                studentId: g.studentId,
                classroomId,
                testDate: date,
                score: parseFloat(g.score),
                maxScore: parseFloat(g.maxScore) || 100,
                testName: g.testName || 'ì¼ì¼íì¤í¸',
              },
            });
          }
        }
      }
    }

    // 3. ë°ì¼ë¦¬ ë¦¬í¬í¸ ì ì¥ (íìë³ - ê³¼ì ë±ê¸ì attitudeì ì ì¥)
    const enrollments = await prisma.enrollment.findMany({
      where: { classroomId, status: 'ACTIVE' }
    });

    const agMap: Record<string, string> = {};
    if (assignmentGrades && Array.isArray(assignmentGrades)) {
      for (const ag of assignmentGrades) {
        agMap[ag.studentId] = ag.grade;
      }
    }

    // ë§ì¶¤ë° íìë³ ê³¼ì ë´ì© ë§µ
    const pshMap: Record<string, string> = {};
    if (perStudentHomework && Array.isArray(perStudentHomework)) {
      for (const psh of perStudentHomework) {
        pshMap[psh.studentId] = psh.homework;
      }
    }

    for (const enr of enrollments) {
      await prisma.dailyReport.upsert({
        where: {
          studentId_classroomId_date: {
            studentId: enr.studentId,
            classroomId,
            date,
          }
        },
        update: {
          content: progressNote || '',
          homework: pshMap[enr.studentId] || homework || '',
          attitude: agMap[enr.studentId] || '',
          specialNote: announcement || '',
        },
        create: {
          studentId: enr.studentId,
          classroomId,
          date,
          content: progressNote || '',
          homework: pshMap[enr.studentId] || homework || '',
          attitude: agMap[enr.studentId] || '',
          specialNote: announcement || '',
        },
      });
    }

    // 4. ì ê³¼ì  ìì±
    if (newAssignment && newAssignment.title) {
      await prisma.assignment.create({
        data: {
          classroomId,
          title: newAssignment.title,
          description: newAssignment.description || '',
          assignmentDate: date,
          dueDate: newAssignment.dueDate || date,
        },
      });
    }

    // 5. ê°ì ìì ì ì¥
    if (videoData && videoData.videoUrl) {
      const existingVideo = await prisma.lectureVideo.findFirst({
        where: { classroomId, date }
      });
      if (existingVideo) {
        await prisma.lectureVideo.update({
          where: { id: existingVideo.id },
          data: { title: videoData.title || '', videoUrl: videoData.videoUrl },
        });
      } else {
        await prisma.lectureVideo.create({
          data: {
            classroomId,
            title: videoData.title || '',
            videoUrl: videoData.videoUrl,
            date,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Daily save error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
