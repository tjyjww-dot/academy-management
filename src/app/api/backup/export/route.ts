import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export async function GET() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('auth-token')?.value;
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const decoded = verifyToken(token);
    if (!decoded || decoded.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const [
      users, students, parentStudents, subjects, classrooms,
      enrollments, grades, attendanceRecords, assignments,
      assignmentSubmissions, counselingRequests, announcements,
      entranceTests, payments, dailyReports, lectureVideos,
      signupRequests, taskRequests, pushTokens
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.student.findMany(),
      prisma.parentStudent.findMany(),
      prisma.subject.findMany(),
      prisma.classroom.findMany(),
      prisma.enrollment.findMany(),
      prisma.grade.findMany(),
      prisma.attendanceRecord.findMany(),
      prisma.assignment.findMany(),
      prisma.assignmentSubmission.findMany(),
      prisma.counselingRequest.findMany(),
      prisma.announcement.findMany(),
      prisma.entranceTest.findMany(),
      prisma.payment.findMany(),
      prisma.dailyReport.findMany(),
      prisma.lectureVideo.findMany(),
      prisma.signupRequest.findMany(),
      prisma.taskRequest.findMany(),
      prisma.pushToken.findMany(),
    ]);

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        users, students, parentStudents, subjects, classrooms,
        enrollments, grades, attendanceRecords, assignments,
        assignmentSubmissions, counselingRequests, announcements,
        entranceTests, payments, dailyReports, lectureVideos,
        signupRequests, taskRequests, pushTokens
      }
    };

    const filename = 'backup_' + new Date().toISOString().slice(0, 10) + '.json';

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="' + filename + '"',
      },
    });
  } catch (error) {
    console.error('Backup export error:', error);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
