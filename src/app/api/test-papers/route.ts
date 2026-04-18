import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { uploadFileFromBlob } from '@/lib/googleDrive';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const classroomId = searchParams.get('classroomId');
    const summary = searchParams.get('summary') === 'true';

    const studentId = searchParams.get('studentId');
    const where: Record<string, unknown> = {};
    if (classroomId) where.classroomId = classroomId;
    if (studentId) where.studentId = studentId;

    const testPapers = await prisma.testPaper.findMany({
      where,
      include: {
        classroom: true,
        student: { select: { id: true, name: true, studentNumber: true } },
        pages: summary
          ? { select: { id: true, pageNumber: true }, orderBy: { pageNumber: 'asc' as const } }
          : { orderBy: { pageNumber: 'asc' as const } },
        _count: { select: { wrongAnswers: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(testPapers);
  } catch (error) {
    console.error('Failed to fetch test papers:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decoded = verifyToken(token);
    if (!decoded || ['PARENT', 'STUDENT'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const classroomId = formData.get('classroomId') as string;
    const studentId = formData.get('studentId') as string | null;
    const totalProblems = parseInt(formData.get('totalProblems') as string);
    const answers = formData.get('answers') as string | null;
    const files = formData.getAll('images') as File[];
    // Parse actual problem numbers if provided
    let problemNumbers: number[] = [];
    try {
      const pnStr = formData.get('problemNumbers') as string;
      if (pnStr) problemNumbers = JSON.parse(pnStr);
    } catch {}

    // NOTE (2026-04-18): 서비스 계정의 Google Drive 저장 용량 문제(storageQuotaExceeded)로
    // 업로드가 전부 실패하는 상태가 확인되었다 → Drive 업로드 실패 시 일시적으로
    // base64 data URL 폴백을 복원한다. 학부모 API(/api/parent/data)에는 이미 base64 차단
    // 가드가 있어 이집소트(egress) 폭증은 막혀있다. 근본 해결(OAuth or Blob)은 추후 작업.
    // dataUrls/answerDataUrls 는 구 프론트엔드 호환용으로 계속 수신하되 DB에는 저장하지 않는다.
    let legacyDataUrlCount = 0;
    try {
      const duStr = formData.get('dataUrls') as string;
      if (duStr) {
        const parsed = JSON.parse(duStr);
        if (Array.isArray(parsed)) legacyDataUrlCount += parsed.length;
      }
    } catch {}
    try {
      const aduStr = formData.get('answerDataUrls') as string;
      if (aduStr) {
        const parsed = JSON.parse(aduStr);
        if (Array.isArray(parsed)) legacyDataUrlCount += parsed.length;
      }
    } catch {}
    if (legacyDataUrlCount > 0) {
      console.warn(`[test-papers] Legacy base64 fallback fields received (${legacyDataUrlCount} entries) — ignored. 클라이언트 업데이트가 필요합니다.`);
    }

    // 정답 이미지 처리
    const answerFiles = formData.getAll('answerImages') as File[];

    if (!name || !classroomId || !totalProblems) {
      return NextResponse.json({ error: '시험명, 반, 총 문항수를 모두 입력해주세요' }, { status: 400 });
    }

    // Upload files to Google Drive — Drive 실패 시 base64 폴백(응급 복구).
    const pageData: { pageNumber: number; imageUrl: string; answerImageUrl?: string }[] = [];
    let fallbackCount = 0; // Drive 실패로 base64 로 떨어진 횟수 (모니터링용)

    if (files.length > 0 && files[0].size > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file || file.size === 0) continue;
        const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
        const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/png');
        // Use actual problem number as pageNumber for correct image mapping
        const pNum = problemNumbers[i] || (i + 1);
        const fileName = `${Date.now()}-problem${pNum}.${ext}`;
        let imageUrl: string;
        try {
          const result = await uploadFileFromBlob(
            fileName,
            file,
            contentType,
            ['수탐학원', '시험지', name]
          );
          imageUrl = result.url;
        } catch (uploadError: any) {
          console.warn(
            `[test-papers] Drive 업로드 실패 → base64 폴백 (${fileName}): ${uploadError?.message || uploadError}`
          );
          const buf = Buffer.from(await file.arrayBuffer());
          imageUrl = `data:${contentType};base64,${buf.toString('base64')}`;
          fallbackCount++;
        }
        pageData.push({ pageNumber: pNum, imageUrl });
      }
    }

    // 정답 이미지 업로드 — Drive 실패 시 base64 폴백
    const answerImageMap: Record<number, string> = {};
    if (answerFiles.length > 0) {
      for (let i = 0; i < answerFiles.length; i++) {
        const file = answerFiles[i];
        const pNum = problemNumbers[i] || (i + 1);
        // 빈 파일(정답 이미지 없는 문제)은 건너뛰되 인덱스는 유지
        if (!file || file.size === 0) continue;
        const fileName = `${Date.now()}-answer${pNum}.png`;
        let answerUrl: string;
        try {
          const result = await uploadFileFromBlob(fileName, file, 'image/png', ['수탐학원', '시험지', name, '정답']);
          answerUrl = result.url;
        } catch (e: any) {
          console.warn(
            `[test-papers] 정답 Drive 업로드 실패 → base64 폴백 (${fileName}): ${e?.message || e}`
          );
          const buf = Buffer.from(await file.arrayBuffer());
          answerUrl = `data:image/png;base64,${buf.toString('base64')}`;
          fallbackCount++;
        }
        answerImageMap[pNum] = answerUrl;
      }
    }
    if (fallbackCount > 0) {
      console.warn(
        `[test-papers] 총 ${fallbackCount}건이 base64 폴백으로 저장됨. Drive 쿼터/권한 확인 필요.`
      );
    }
    // pageData에 정답 이미지 URL 매핑
    for (const pd of pageData) {
      if (answerImageMap[pd.pageNumber]) {
        pd.answerImageUrl = answerImageMap[pd.pageNumber];
      }
    }

    // Create test paper (even if file upload failed)
    const testPaper = await prisma.testPaper.create({
      data: {
        name,
        classroomId,
        uploadedById: decoded.userId,
        studentId: studentId || undefined,
        totalProblems,
        answers: answers || undefined,
        ...(pageData.length > 0 ? { pages: { create: pageData } } : {}),
      },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
        classroom: true
      }
    });

    return NextResponse.json(testPaper);
  } catch (error: any) {
    console.error('Failed to create test paper:', error?.message || error, error?.stack);
    return NextResponse.json({ error: `시험지 등록 실패: ${error?.message || '서버 오류'}` }, { status: 500 });
  }
}
