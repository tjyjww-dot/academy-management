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

export async function POST(request: NextRequest) {
        try {
                const token = getTokenFromCookies(request);
                const user = verifyToken(token || '');
                if (!user?.userId) {
                        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
                }

                const body = await request.json();
                const { studentId, content, isFromParent, parentMemoId } = body;

                if (!studentId || !content) {
                        return NextResponse.json({ error: 'studentId and content are required' }, { status: 400 });
                }

                const memo = await prisma.memo.create({
                        data: {
                                studentId,
                                authorId: user.userId,
                                content,
                                isFromParent: isFromParent ?? false,
                                parentMemoId: parentMemoId || null,
                        },
                });

                // If this is a reply to a parent memo, mark the original as read
                // and also record the reply on the matching CounselingRequest (memo entry)
                if (parentMemoId) {
                        const original = await prisma.memo.findUnique({
                                where: { id: parentMemoId },
                                select: { content: true, studentId: true },
                        });
                        await prisma.memo.update({
                                where: { id: parentMemoId },
                                data: { isRead: true, readAt: new Date() },
                        });
                        if (original) {
                                const match = await prisma.counselingRequest.findFirst({
                                        where: {
                                                studentId: original.studentId,
                                                title: `[memo] ${original.content}`,
                                        },
                                        orderBy: { createdAt: 'desc' },
                                });
                                if (match) {
                                        await prisma.counselingRequest.update({
                                                where: { id: match.id },
                                                data: {
                                                        sessionNotes: content,
                                                        sessionDate: new Date().toISOString(),
                                                        status: 'COMPLETED',
                                                },
                                        });
                                }
                        }
                }

                return NextResponse.json(memo, { status: 201 });
        } catch (error) {
                console.error('Error creating memo:', error);
                return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
}
