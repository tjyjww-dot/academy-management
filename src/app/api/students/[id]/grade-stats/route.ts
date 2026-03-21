import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: studentId } = await params;

    // Get all grades for this student with classroom info
    const studentGrades = await prisma.$queryRawUnsafe(`
      SELECT g.id, g."testName", g.score, g."maxScore", g."testDate",
             g."classroomId", c.name as "classroomName",
             s.name as "subjectName"
      FROM "Grade" g
      JOIN "Classroom" c ON g."classroomId" = c.id
      LEFT JOIN "Subject" s ON c."subjectId" = s.id
      WHERE g."studentId" = $1
      ORDER BY g."testDate" ASC
    `, studentId) as any[];

    // For each grade, get the class average
    const gradesWithAvg = await Promise.all(
      studentGrades.map(async (grade: any) => {
        const avgResult = await prisma.$queryRawUnsafe(`
          SELECT AVG(score/"maxScore"*100) as avg_score, COUNT(*) as student_count
          FROM "Grade"
          WHERE "classroomId" = $1
            AND "testName" = $2
            AND "testDate" = $3
        `, grade.classroomId, grade.testName, grade.testDate) as any[];

        return {
          id: grade.id,
          testName: grade.testName,
          score: Number(grade.score),
          maxScore: Number(grade.maxScore),
          testDate: grade.testDate,
          classroomName: grade.classroomName,
          subjectName: grade.subjectName,
          classAverage: avgResult[0] ? Math.round(Number(avgResult[0].avg_score) * 10) / 10 : null,
          studentCount: avgResult[0] ? Number(avgResult[0].student_count) : 0
        };
      })
    );

    return NextResponse.json(gradesWithAvg);
  } catch (error) {
    console.error('Grade stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch grade stats' },
      { status: 500 }
    );
  }
}
