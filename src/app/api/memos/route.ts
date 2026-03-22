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

            // Find students assigned to this instructor via classrooms and enrollments
            const instructor = await prisma.user.findUnique({
                            where: { id: user.userId },
                            include: {
                                                classrooms: {
                                                                        include: {
                                                                                                    enrollments: {
                                                                                                                                    select: { studentId: true },
                                                                                                        },
                                                                        },
                                                },
                            },
            });

            if (!instructor) {
                            return NextResponse.json({ error: 'Instructor not found' }, { status: 404 });
            }

            const studentIds = instructor.classrooms.flatMap(c => c.enrollments.map(e => e.studentId));

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
