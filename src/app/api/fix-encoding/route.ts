import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

/**
 * 한글 인코딩이 깨진 보호자 이름을 수정하는 API
 * 실행 후 삭제할 것
 */
export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    const payload = token ? verifyToken(token) : null;
    if (!payload || payload.role !== 'ADMIN') {
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

      // 깨진 한글 감지: 정상적인 한글이 아닌 Latin-1 인코딩 잔해 확인
      // "학부모" -> UTF-8 bytes가 Latin-1로 해석되면 "í•™ë¶€ëª¨" 등의 패턴
      // 또는 더 심하게 깨진 경우 제어문자나 특수문자가 포함됨

      let fixedName = name;
      let needsFix = false;

      // 방법1: Buffer를 이용한 복원 시도
      try {
        const buf = Buffer.from(name, 'utf-8');
        // Check if the name contains garbled characters (Latin-1 interpreted UTF-8)
        // Pattern: name has valid Korean start but then corrupted chars

        // Check for common corrupted patterns
        if (name.includes('\u00c3') || name.includes('\u00c2') ||
            name.includes('\u00ab') || name.includes('\u00eb') ||
            name.includes('\u00ed') || name.includes('\u0099') ||
            name.includes('\u00a8') || name.includes('\u00b6')) {
          // Try to decode as Latin-1 -> UTF-8
          const latin1Buf = Buffer.from(name, 'latin1');
          const decoded = latin1Buf.toString('utf-8');
          if (decoded !== name && /[\uAC00-\uD7AF]/.test(decoded)) {
            fixedName = decoded;
            needsFix = true;
          }
        }
      } catch {
        // ignore decoding errors
      }

      // 방법2: "학부모" 패턴이 깨진 경우 직접 치환
      // "학부모"의 UTF-8 bytes (ED 95 99 EB B6 80 EB AA A8)가
      // Latin-1로 해석되면 다양한 패턴으로 깨짐
      if (!needsFix) {
        // 이름에 한글이 아닌 이상한 문자가 섞여있는지 확인
        const koreanPart = name.match(/^([\uAC00-\uD7AF]+)\s+/);
        if (koreanPart) {
          const afterKorean = name.slice(koreanPart[0].length);
          // 한글이 아닌 비정상 문자가 있으면 "학부모"로 대체
          if (afterKorean && !/^[\uAC00-\uD7AF\s]+$/.test(afterKorean)) {
            fixedName = `${koreanPart[1]} 학부모`;
            needsFix = true;
          }
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

    // ParentStudent의 relation 필드도 수정
    const relations = await (prisma as any).parentStudent.findMany({
      select: { id: true, relation: true },
    });

    const relationFixes: { id: string; old: string; fixed: string }[] = [];
    for (const rel of relations) {
      if (rel.relation && !/^[\uAC00-\uD7AF\s]+$/.test(rel.relation) && rel.relation !== '부모') {
        await (prisma as any).parentStudent.update({
          where: { id: rel.id },
          data: { relation: '부모' },
        });
        relationFixes.push({ id: rel.id, old: rel.relation, fixed: '부모' });
      }
    }

    return NextResponse.json({
      message: `Fixed ${fixes.length} parent names and ${relationFixes.length} relations`,
      fixes,
      relationFixes,
    });
  } catch (error) {
    console.error('Fix encoding error:', error);
    return NextResponse.json({ error: 'Failed to fix encoding' }, { status: 500 });
  }
}
