import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

/**
 * 한글 인코딩이 깨진 보호자 이름을 수정하는 일회성 API
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    if (key !== 'fix-enc-2026-04') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 학부모 역할의 모든 User 조회
    const parents = await prisma.user.findMany({
      where: { role: 'PARENT' },
      select: { id: true, name: true },
    });

    const fixes: { id: string; oldName: string; newName: string }[] = [];

    for (const parent of parents) {
      const name = parent.name;
      if (!name) continue;

      let fixedName = name;
      let needsFix = false;

      // 한글 이름 뒤에 깨진 문자가 있는지 확인
      // 정상 패턴: "박소율 학부모" (모두 한글)
      // 깨진 패턴: "박소율 í..." (한글 + 깨진 문자)
      const koreanMatch = name.match(/^([\uAC00-\uD7AF]+)\s+(.+)$/);
      if (koreanMatch) {
        const suffix = koreanMatch[2];
        // suffix에 한글이 아닌 비정상 문자가 포함되어 있으면 수정
        const hasNonKorean = /[^\uAC00-\uD7AF\s]/.test(suffix);
        if (hasNonKorean) {
          fixedName = `${koreanMatch[1]} 학부모`;
          needsFix = true;
        }
      }

      if (needsFix) {
        await prisma.user.update({
          where: { id: parent.id },
          data: { name: fixedName },
        });
        fixes.push({ id: parent.id, oldName: name, newName: fixedName });
      }
    }

    // ParentStudent relation 필드 수정
    let relationFixCount = 0;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "ParentStudent" SET "relation" = '부모' WHERE "relation" != '부모' AND "relation" IS NOT NULL`
      );
      relationFixCount = 1;
    } catch (e) {
      console.error('Relation fix error:', e);
    }

    return NextResponse.json({
      message: `Fixed ${fixes.length} parent names`,
      totalParents: parents.length,
      fixes,
      relationFixed: relationFixCount > 0,
    });
  } catch (error) {
    console.error('Fix encoding error:', String(error));
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
