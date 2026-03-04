import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
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

    const backup = await request.json();

    if (!backup.version || !backup.data) {
      return NextResponse.json({ error: 'Invalid backup file format' }, { status: 400 });
    }

    const d = backup.data;

    // Delete all existing data in reverse dependency order
    await prisma.$transaction([
      prisma.pushToken.deleteMany(),
      prisma.taskRequest.deleteMany(),
      prisma.signupRequest.deleteMany(),
      prisma.lectureVideo.deleteMany(),
      prisma.dailyReport.deleteMany(),
      prisma.payment.deleteMany(),
      prisma.entranceTest.deleteMany(),
      prisma.assignmentSubmission.deleteMany(),
      prisma.assignment.deleteMany(),
      prisma.attendanceRecord.deleteMany(),
      prisma.grade.deleteMany(),
      prisma.enrollment.deleteMany(),
      prisma.counselingRequest.deleteMany(),
      prisma.announcement.deleteMany(),
      prisma.classroom.deleteMany(),
      prisma.subject.deleteMany(),
      prisma.parentStudent.deleteMany(),
      prisma.student.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    // Restore data in dependency order
    if (d.users?.length) {
      await prisma.user.createMany({ data: d.users.map((u: Record<string, unknown>) => ({
        ...u,
        createdAt: new Date(u.createdAt as string),
        updatedAt: new Date(u.updatedAt as string),
      }))});
    }

    if (d.students?.length) {
      await prisma.student.createMany({ data: d.students.map((s: Record<string, unknown>) => ({
        ...s,
        registrationDate: new Date(s.registrationDate as string),
        withdrawalDate: s.withdrawalDate ? new Date(s.withdrawalDate as string) : null,
        createdAt: new Date(s.createdAt as string),
        updatedAt: new Date(s.updatedAt as string),
      }))});
    }

    if (d.parentStudents?.length) {
      await prisma.parentStudent.createMany({ data: d.parentStudents });
    }

    if (d.subjects?.length) {
      await prisma.subject.createMany({ data: d.subjects.map((s: Record<string, unknown>) => ({
        ...s,
        createdAt: new Date(s.createdAt as string),
      }))});
    }

    if (d.classrooms?.length) {
      await prisma.classroom.createMany({ data: d.classrooms.map((c: Record<string, unknown>) => ({
        ...c,
        createdAt: new Date(c.createdAt as string),
        updatedAt: new Date(c.updatedAt as string),
      }))});
    }

    if (d.enrollments?.length) {
      await prisma.enrollment.createMany({ data: d.enrollments.map((e: Record<string, unknown>) => ({
        ...e,
        enrollmentDate: new Date(e.enrollmentDate as string),
        createdAt: new Date(e.createdAt as string),
      }))});
    }

    if (d.grades?.length) {
      await prisma.grade.createMany({ data: d.grades.map((g: Record<string, unknown>) => ({
        ...g,
        createdAt: new Date(g.createdAt as string),
        updatedAt: new Date(g.updatedAt as string),
      }))});
    }

    if (d.attendanceRecords?.length) {
      await prisma.attendanceRecord.createMany({ data: d.attendanceRecords.map((a: Record<string, unknown>) => ({
        ...a,
        createdAt: new Date(a.createdAt as string),
      }))});
    }

    if (d.assignments?.length) {
      await prisma.assignment.createMany({ data: d.assignments.map((a: Record<string, unknown>) => ({
        ...a,
        createdAt: new Date(a.createdAt as string),
        updatedAt: new Date(a.updatedAt as string),
      }))});
    }

    if (d.assignmentSubmissions?.length) {
      await prisma.assignmentSubmission.createMany({ data: d.assignmentSubmissions.map((a: Record<string, unknown>) => ({
        ...a,
        createdAt: new Date(a.createdAt as string),
        updatedAt: new Date(a.updatedAt as string),
      }))});
    }

    if (d.counselingRequests?.length) {
      await prisma.counselingRequest.createMany({ data: d.counselingRequests.map((c: Record<string, unknown>) => ({
        ...c,
        createdAt: new Date(c.createdAt as string),
        updatedAt: new Date(c.updatedAt as string),
      }))});
    }

    if (d.announcements?.length) {
      await prisma.announcement.createMany({ data: d.announcements.map((a: Record<string, unknown>) => ({
        ...a,
        publishDate: new Date(a.publishDate as string),
        createdAt: new Date(a.createdAt as string),
        updatedAt: new Date(a.updatedAt as string),
      }))});
    }

    if (d.entranceTests?.length) {
      await prisma.entranceTest.createMany({ data: d.entranceTests.map((e: Record<string, unknown>) => ({
        ...e,
        createdAt: new Date(e.createdAt as string),
        updatedAt: new Date(e.updatedAt as string),
      }))});
    }

    if (d.payments?.length) {
      await prisma.payment.createMany({ data: d.payments.map((p: Record<string, unknown>) => ({
        ...p,
        createdAt: new Date(p.createdAt as string),
        updatedAt: new Date(p.updatedAt as string),
      }))});
    }

    if (d.dailyReports?.length) {
      await prisma.dailyReport.createMany({ data: d.dailyReports.map((r: Record<string, unknown>) => ({
        ...r,
        createdAt: new Date(r.createdAt as string),
        updatedAt: new Date(r.updatedAt as string),
      }))});
    }

    if (d.lectureVideos?.length) {
      await prisma.lectureVideo.createMany({ data: d.lectureVideos.map((v: Record<string, unknown>) => ({
        ...v,
        createdAt: new Date(v.createdAt as string),
        updatedAt: new Date(v.updatedAt as string),
      }))});
    }

    if (d.signupRequests?.length) {
      await prisma.signupRequest.createMany({ data: d.signupRequests.map((s: Record<string, unknown>) => ({
        ...s,
        createdAt: new Date(s.createdAt as string),
        updatedAt: new Date(s.updatedAt as string),
      }))});
    }

    if (d.taskRequests?.length) {
      await prisma.taskRequest.createMany({ data: d.taskRequests.map((t: Record<string, unknown>) => ({
        ...t,
        completedAt: t.completedAt ? new Date(t.completedAt as string) : null,
        createdAt: new Date(t.createdAt as string),
        updatedAt: new Date(t.updatedAt as string),
      }))});
    }

    if (d.pushTokens?.length) {
      await prisma.pushToken.createMany({ data: d.pushTokens.map((p: Record<string, unknown>) => ({
        ...p,
        createdAt: new Date(p.createdAt as string),
        updatedAt: new Date(p.updatedAt as string),
      }))});
    }

    return NextResponse.json({
      success: true,
      message: 'Backup restored successfully',
      restoredAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Backup import error:', error);
    return NextResponse.json({ error: 'Restore failed: ' + (error instanceof Error ? error.message : 'Unknown error') }, { status: 500 });
  }
}
