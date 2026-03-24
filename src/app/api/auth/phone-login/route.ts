import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, generateToken } from '@/lib/auth';

/**
 * POST /api/auth/phone-login
 * ì íë²í¸ ê¸°ë° ë¡ê·¸ì¸ (ëª¨ë°ì¼ ì± ì ì©)
 *
 * Step 1: { phone } â ë§¤ì¹­ëë íì ëª©ë¡ ë°í
 * Step 2: { phone, studentId, studentName, loginType } â íì ì´ë¦ íì¸ í í í° ë°ê¸
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, studentId, studentName, loginType } = body;

    if (!phone) {
      return NextResponse.json(
        { error: 'ì íë²í¸ë¥¼ ìë ¥í´ì£¼ì¸ì.' },
        { status: 400 }
      );
    }

    // ì íë²í¸ ì ê·í (íì´í ì ê±°)
    const normalizedPhone = phone.replace(/[-\s]/g, '');
    // íì´í í¬í¨ ííë ë§ë¤ê¸° (010-1234-5678)
    const formattedPhone = normalizedPhone.length === 11
      ? normalizedPhone.slice(0,3) + '-' + normalizedPhone.slice(3,7) + '-' + normalizedPhone.slice(7)
      : normalizedPhone;

    // ââ Step 1: ì íë²í¸ë¡ íì ê²ì ââ
    if (!studentId) {
      // íì ë³¸ì¸ ì íë²í¸ ë§¤ì¹­
      const studentsByPhone = await prisma.student.findMany({
        where: {
          OR: [{ phone: normalizedPhone }, { phone: formattedPhone }, { phone: { startsWith: formattedPhone } }],
          status: 'ACTIVE',
        },
        select: { id: true, name: true, school: true, grade: true, userId: true },
      });

      // íë¶ëª¨ ì íë²í¸ ë§¤ì¹­
      const studentsByParentPhone = await prisma.student.findMany({
        where: {
          OR: [{ parentPhone: normalizedPhone }, { parentPhone: formattedPhone }, { parentPhone: { startsWith: formattedPhone } }],
          status: 'ACTIVE',
        },
        select: { id: true, name: true, school: true, grade: true, userId: true },
      });

      // ì´ë¯¸ User.phoneì¼ë¡ ë±ë¡ë íë¶ëª¨ ì°¾ê¸°
      const existingParentUser = await prisma.user.findFirst({
        where: {
          phone: normalizedPhone,
          role: 'PARENT',
        },
        include: {
          parentStudents: {
            include: {
              student: {
                select: { id: true, name: true, school: true, grade: true, userId: true },
              },
            },
          },
        },
      });

      const parentStudentsFromUser = existingParentUser?.parentStudents.map(
        (ps: any) => ps.student
      ) || [];

      // ì¤ë³µ ì ê±°
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
        if (!studentMatches.find((m) => m.studentId === s.id) && !parentMatches.find((m) => m.studentId === s.id)) {
          parentMatches.push({ studentId: s.id, role: 'PARENT' });
        }
      }

      if (allStudents.size === 0) {
        return NextResponse.json(
          { error: 'ë±ë¡ë ì íë²í¸ê° ìëëë¤. íìì ë¬¸ìí´ì£¼ì¸ì.' },
          { status: 404 }
        );
      }

      // íì ëª©ë¡ + ë¡ê·¸ì¸ ì­í  ì ë³´ ë°í (ì´ë¦ì ë¶ë¶ ë§ì¤í¹)
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
        message: 'íìì ì ííê³  ì´ë¦ì ìë ¥í´ì£¼ì¸ì.',
      });
    }

    // ââ Step 2: íì ì´ë¦ íì¸ í ë¡ê·¸ì¸ ââ
    if (!studentName) {
      return NextResponse.json(
        { error: 'íì ì´ë¦ì ìë ¥í´ì£¼ì¸ì.' },
        { status: 400 }
      );
    }

    // íì ì¡°í
    const student = await prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student) {
      return NextResponse.json(
        { error: 'íì ì ë³´ë¥¼ ì°¾ì ì ììµëë¤.' },
        { status: 404 }
      );
    }

    // ì´ë¦ íì¸ (ê³µë°± ì ê±° í ë¹êµ)
    const inputName = studentName.replace(/\s/g, '').trim();
    const actualName = student.name.replace(/\s/g, '').trim();

    if (inputName !== actualName) {
      return NextResponse.json(
        { error: 'íì ì´ë¦ì´ ì¼ì¹íì§ ììµëë¤.' },
        { status: 401 }
      );
    }

    // ë¡ê·¸ì¸ íì ê²°ì 
    const role = loginType === 'STUDENT' ? 'STUDENT' : 'PARENT';

    if (role === 'STUDENT') {
      // ââ íì ë¡ê·¸ì¸ ââ
      let user = student.userId
        ? await prisma.user.findUnique({ where: { id: student.userId } })
        : null;

      if (!user) {
        // ê¸°ì¡´ì ê°ì ì´ë©ì¼ë¡ ìì±ë Userê° ìëì§ íì¸
        const studentEmail = `student_${student.studentNumber}@suhaktamgu.local`;
        const existingUser = await prisma.user.findUnique({
          where: { email: studentEmail },
        });

        if (existingUser) {
          // ê¸°ì¡´ Userê° ìì¼ë©´ ì¬ì¬ì©íê³  Studentì ì°ê²°
          user = existingUser;
          // ì´ë¦/ì íë²í¸ ìë°ì´í¸
          user = await prisma.user.update({
            where: { id: existingUser.id },
            data: {
              name: student.name,
              phone: normalizedPhone,
              role: 'STUDENT',
            },
          });
        } else {
          // íì User ìë ìì±
          const randomPassword = await hashPassword(
            Math.random().toString(36).slice(-12)
          );
          user = await prisma.user.create({
            data: {
              email: studentEmail,
              password: randomPassword,
              name: student.name,
              role: 'STUDENT',
              phone: normalizedPhone,
            },
          });
        }

        // Student â User ì°ê²°
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
      // ââ íë¶ëª¨ ë¡ê·¸ì¸ ââ
      // ê¸°ì¡´ íë¶ëª¨ ê³ì  ì°¾ê¸° (ì íë²í¸ ê¸°ì¤)
      let user = await prisma.user.findFirst({
        where: { OR: [{ phone: normalizedPhone }, { phone: formattedPhone }, { phone: { startsWith: formattedPhone } }], role: 'PARENT' },
      });

      if (!user) {
        // ê¸°ì¡´ì ê°ì ì´ë©ì¼ë¡ ìì±ë Userê° ìëì§ íì¸
        const parentEmail = `parent_${normalizedPhone}@suhaktamgu.local`;
        const existingUserByEmail = await prisma.user.findUnique({
          where: { email: parentEmail },
        });

        if (existingUserByEmail) {
          user = existingUserByEmail;
        } else {
          // íë¶ëª¨ User ìë ìì±
          const randomPassword = await hashPassword(
            Math.random().toString(36).slice(-12)
          );
          user = await prisma.user.create({
            data: {
              email: parentEmail,
              password: randomPassword,
              name: `${student.name} íë¶ëª¨`,
              role: 'PARENT',
              phone: normalizedPhone,
            },
          });
        }
      }

      // ParentStudent ê´ê³ íì¸/ìì±
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
      { error: 'ë¡ê·¸ì¸ ì²ë¦¬ ì¤ ì¤ë¥ê° ë°ìíìµëë¤.' },
      { status: 500 }
    );
  }
}

function createLoginResponse(token: string, user: any) {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = 30 * 24 * 60 * 60;
  const cookieValue = `auth-token=${token}; HttpOnly; ${isProduction ? 'Secure; ' : ''}SameSite=Lax; Max-Age=${maxAge}; Path=/`;

  return new Response(
    JSON.stringify({
      step: 'LOGIN_SUCCESS',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookieValue,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Type',
      },
    }
  );
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
