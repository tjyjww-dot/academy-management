import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, generateToken } from '@/lib/auth';

/**
 * POST /api/auth/phone-login
 * 전화번호 기반 로그인 (모바일 앱 전용)
 *
 * Step 1: { phone } → 매칭되는 학생 목록 반환
 * Step 2: { phone, studentId, studentName, loginType } → 학생 이름 확인 후 토큰 발급
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, studentId, studentName, loginType } = body;

    if (!phone) {
      return NextResponse.json(
        { error: '전화번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    // 전화번호 정규화 (하이픈 제거)
    const normalizedPhone = phone.replace(/[-\s]/g, '');

    // ── Step 1: 전화번호로 학생 검색 ──
    if (!studentId) {
      // 학생 본인 전화번호 매칭
      const studentsByPhone = await prisma.student.findMany({
        where: {
          phone: normalizedPhone,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, school: true, grade: true },
      });

      // 학부모 전화번호 매칭
      const studentsByParentPhone = await prisma.student.findMany({
        where: {
          parentPhone: normalizedPhone,
          status: 'ACTIVE',
        },
        select: { id: true, name: true, school: true, grade: true },
      });

      // 이미 User.phone으로 등록된 학부모 찾기
      const existingParentUser = await prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          role: 'PARENT',
        },
        include: {
          parentStudents: {
            include: {
              student: {
                select: { id: true, name: true, school: true, grade: true },
              },
            },
          },
        },
      });

      const parentStudentsFromUser = existingParentUser?.parentStudents.map(
        (ps: any) => ps.student
      ) || [];

      // 중복 제거
      const allStudents = new Map<string, { id: string; name: string; school: string | null; grade: string | null }>();

      const studentMatches: { studentId: string; role: 'STUDENT' }[] = [];
      const parentMatches: { studentId: string; role: 'PARENT' }[] = [];

      for (const s of studentsByPhone) {
        allStudents.set(s.id, s);
        studentMatches.push({ studentId: s.id, role: 'STUDENT' });
      }

      for (const s of studentsByParentPhone) {
        allStudents.set(s.id, s);
        if (!studentMatches.find((m) => m.studentId === s.id)) {
          parentMatches.push({ studentId: s.id, role: 'PARENT' });
        }
      }

      for (const s of parentStudentsFromUser) {
        allStudents.set(s.id, s);
        if (!studentMatches.find((m) => m.studentId === s.id) &&
            !parentMatches.find((m) => m.studentId === s.id)) {
          parentMatches.push({ studentId: s.id, role: 'PARENT' });
        }
      }

      if (allStudents.size === 0) {
        return NextResponse.json(
          { error: '등록된 전화번호가 아닙니다. 학원에 문의해주세요.' },
          { status: 404 }
        );
      }

      // 학생 목록 + 로그인 역할 정보 반환 (이름은 부분 마스킹)
      const results = [...allStudents.entries()].map(([id, s]) => {
        const isStudentLogin = studentMatches.find((m) => m.studentId === id);
        return {
          id,
          name: maskName(s.name),
          school: s.school,
          grade: s.grade,
          loginAs: isStudentLogin ? 'STUDENT' : 'PARENT',
        };
      });

      return NextResponse.json({
        step: 'SELECT_STUDENT',
        students: results,
        message: '학생을 선택하고 이름을 입력해주세요.',
      });
    }

    // ── Step 2: 학생 이름 확인 후 로그인 ──
    if (!studentName) {
      return NextResponse.json(
        { error: '학생 이름을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 학생 조회
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return NextResponse.json(
        { error: '학생 정보를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    // 이름 확인 (공백 제거 후 비교)
    const inputName = studentName.replace(/\s/g, '').trim();
    const actualName = student.name.replace(/\s/g, '').trim();

    if (inputName !== actualName) {
      return NextResponse.json(
        { error: '학생 이름이 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    // 로그인 타입 결정: 학생 본인 전화번호면 STUDENT, 학부모 전화번호면 PARENT
    const role = loginType === 'STUDENT' ? 'STUDENT' : 'PARENT';

    if (role === 'STUDENT') {
      // ── 학생 로그인 ──
      let user = student.userId
        ? await prisma.user.findUnique({ where: { id: student.userId } })
        : null;

      if (!user) {
        // 학생 User 자동 생성
        const randomPassword = await hashPassword(
          Math.random().toString(36).slice(-12)
        );
        user = await prisma.user.create({
          data: {
            email: `student_${student.studentNumber}@suhaktamgu.local`,
            password: randomPassword,
            name: student.name,
            role: 'STUDENT',
            phone: normalizedPhone,
          },
        });

        // Student → User 연결
        await prisma.student.update({
          where: { id: student.id },
          data: { userId: user.id },
        });
      }

      const token = generateToken({
        userId: user.id,
        role: user.role,
        name: user.name,
      });

      return createLoginResponse(token, user);
    } else {
      // ── 학부모 로그인 ──
      // 기존 학부모 계정 찾기 (전화번호 기준)
      let user = await prisma.user.findFirst({
        where: { phone: normalizedPhone, role: 'PARENT' },
      });

      if (!user) {
        // 학부모 User 자동 생성
        const randomPassword = await hashPassword(
          Math.random().toString(36).slice(-12)
        );
        user = await prisma.user.create({
          data: {
            email: `parent_${normalizedPhone}@suhaktamgu.local`,
            password: randomPassword,
            name: `${student.name} 학부모`,
            role: 'PARENT',
            phone: normalizedPhone,
          },
        });
      }

      // ParentStudent 관계 확인/생성
      const existingRelation = await prisma.parentStudent.findUnique({
        where: {
          parentId_studentId: {
            parentId: user.id,
            studentId: student.id,
          },
        },
      });

      if (!existingRelation) {
        await prisma.parentStudent.create({
          data: {
            parentId: user.id,
            studentId: student.id,
          },
        });
      }

      const token = generateToken({
        userId: user.id,
        role: user.role,
        name: user.name,
      });

      return createLoginResponse(token, user);
    }
  } catch (error) {
    console.error('Phone login error:', error);
    return NextResponse.json(
      { error: '로그인 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

function createLoginResponse(token: string, user: any) {
  const response = NextResponse.json({
    step: 'LOGIN_SUCCESS',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });

  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Client-Type'
  );

  return response;
}

function maskName(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return name[0] + '*';
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
}

// CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Type',
    },
  });
}
