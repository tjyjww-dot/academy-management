import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export async function POST() {
  try {
    // Create initial admin user
    const adminPassword = await hashPassword('admin1234');

    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@academy.com' },
      update: {},
      create: {
        email: 'admin@academy.com',
        password: adminPassword,
        name: '관리자',
        role: 'ADMIN',
      },
    });

    // Create sample subjects
    const subjects = [
      { code: 'KOR', name: '국어' },
      { code: 'MATH', name: '수학' },
      { code: 'ENG', name: '영어' },
      { code: 'SCI', name: '과학' },
    ];

    const createdSubjects = await Promise.all(
      subjects.map((subject) =>
        prisma.subject.upsert({
          where: { code: subject.code },
          update: {},
          create: {
            code: subject.code,
            name: subject.name,
          },
        })
      )
    );

    return NextResponse.json(
      {
        message: '초기 데이터 생성 완료',
        admin: {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: adminUser.role,
        },
        subjects: createdSubjects,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: '초기 데이터 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
