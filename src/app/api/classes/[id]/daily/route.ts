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

// GET: 특정 날짜의 모든 데일리 데이터 가져오기
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
          include: {
            student: {
              include: {
                grades: { where: { classroomId }, orderBy: { createdAt: 'desc' } },
                counselingRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
              }
            }
          }
        },
      }
    });

    if (!classroom) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // 해당 날짜 출결
    const attendance = await prisma.attendanceRecord.findMany({
      where: { classroomId, date },
    });

    // 해당 날짜 성적
    const grades = await prisma.grade.findMany({
      where: { classroomId, testDate: date },
    });

    // 모든 성적 (평균 계산용)
    const allGrades = await prisma.grade.findMany({
      where: { classroomId },
      orderBy: { createdAt: 'desc' },
    });

    // 해당 날짜 과제
    const todayAssignments = await prisma.assignment.findMany({
      where: { classroomId, assignmentDate: date },
      include: { submissions: true },
    });

    // 이전 과제 (가장 최근)
    const prevAssignments = await prisma.assignment.findMany({
      where: { classroomId, assignmentDate: { lt: date } },
      orderBy: { assignmentDate: 'desc' },
      take: 3,
      include: { submissions: true },
    });

    // 해당 날짜 강의 영상
    const videos = await prisma.lectureVideo.findMany({
      where: { classroomId, date },
    });

    // 해당 날짜 데일리 리포트
    const dailyReports = await prisma.dailyReport.findMany({
      where: { classroomId, date },
    });

    return NextResponse.json({
      classroom,
      attendance,
      grades,
      allGrades,
      todayAssignments,
      prevAssignments,
      videos,
      dailyReports,
      date,
    });
  } catch (error) {
    console.error('Daily fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST: 데일리 세션 데이터 일괄 저장
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: classroomId } = await params;
  const body = await req.json();
  const { date, attendanceData, gradesData, assignmentCompletions, newAssignment, videoData, progressNote, announcement } = body;

  try {
    // 1. 출결 저장
    if (attendanceData && Array.isArray(attendanceData)) {
      for (const att of attendanceData) {
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

    // 2. 성적 저장
    if (gradesData && Array.isArray(gradesData)) {
      for (const g of gradesData) {
        if (g.score !== undefined && g.score !== null && g.score !== '') {
          const existing = await prisma.grade.findFirst({
            where: { studentId: g.studentId, classroomId, testDate: date }
          });
          if (existing) {
            await prisma.grade.update({
              where: { id: existing.id },
              data: { score: parseFloat(g.score), maxScore: parseFloat(g.maxScore) || 100, testName: g.testName || '누적테스트' },
            });
          } else {
            await prisma.grade.create({
              data: {
                studentId: g.studentId,
                classroomId,
                testDate: date,
                score: parseFloat(g.score),
                maxScore: parseFloat(g.maxScore) || 100,
                testName: g.testName || '누적테스트',
              },
            });
          }
        }
      }
    }

    // 3. 과제 완성도 저장 (AssignmentSubmission 활용)
    if (assignmentCompletions && Array.isArray(assignmentCompletions)) {
      // 오늘 날짜 과제가 있으면 그것에 대한 submission으로 저장
      let todayAssignment = await prisma.assignment.findFirst({
        where: { classroomId, assignmentDate: date }
      });
      if (!todayAssignment) {
        todayAssignment = await prisma.assignment.create({
          data: {
            classroomId,
            title: date + ' 과제',
            assignmentDate: date,
            dueDate: date,
          }
        });
      }
      for (const comp of assignmentCompletions) {
        await prisma.assignmentSubmission.upsert({
          where: {
            assignmentId_studentId: {
              assignmentId: todayAssignment.id,
              studentId: comp.studentId,
            }
          },
          update: { status: comp.grade, feedback: comp.grade },
          create: {
            assignmentId: todayAssignment.id,
            studentId: comp.studentId,
            status: comp.grade,
            feedback: comp.grade,
          },
        });
      }
    }

    // 4. 새 과제 생성
    if (newAssignment && newAssignment.title) {
      await prisma.assignment.upsert({
        where: { id: newAssignment.id || 'new' },
        update: {
          title: newAssignment.title,
          description: newAssignment.description || '',
        },
        create: {
          classroomId,
          title: newAssignment.title,
          description: newAssignment.description || '',
          assignmentDate: date,
          dueDate: newAssignment.dueDate || date,
        },
      });
    }

    // 5. 강의 영상 저장
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

    // 6. 데일리 리포트 저장 (각 학생별)
    if (progressNote || announcement) {
      const enrollments = await prisma.enrollment.findMany({
        where: { classroomId, status: 'ACTIVE' }
      });
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
            homework: announcement || '',
          },
          create: {
            studentId: enr.studentId,
            classroomId,
            date,
            content: progressNote || '',
            homework: announcement || '',
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
