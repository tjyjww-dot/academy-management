import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
    try {
          const token = getTokenFromCookies(request);
          const user = verifyToken(token || '');
          if (!user?.userId) {
                  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
          }

      // Find students assigned to this instructor
      const instructor = await prisma.user.findUnique({
              where: { id: user.userId },
              include: {
                        assignedStudents: {
                                    select: { id: true },
                        },
              },
      });

      if (!instructor) {
              return NextResponse.json({ error: 'Instructor not found' }, { status: 404 });
      }

      const studentIds = instructor.assignedStudents.map((s: { id: string }) => s.id);

      // Get unread memos from parents for these students
      const unreadMemos = await prisma.memo.findMany({
              where: {
                        studentId: { in: studentIds },
                        isFromParent: true,
                        isRead: false,
              },
              include: {
                        student: {
                                    select: { name: true, id: true },
                        },
                        author: {
                                    select: { name: true },
                        },
              },
              orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json(unreadMemos);
    } catch (error) {
          console.error('Error fetching unread memos:', error);
          return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
