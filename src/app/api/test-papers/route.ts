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

    const where: Record<string, unknown> = {};
    if (classroomId) where.classroomId = classroomId;

    const testPapers = await prisma.testPaper.findMany({
      where,
      include: {
        classroom: true,
        pages: { orderBy: { pageNumber: 'asc' } },
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
    if (!decoded || !['ADMIN', 'TEACHER'].includes(decoded.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const name = formData.get('name') as string;
    const classroomId = formData.get('classroomId') as string;
    const totalProblems = parseInt(formData.get('totalProblems') as string);
    const answers = formData.get('answers') as string | null;
    const files = formData.getAll('images') as File[];

    if (!name || !classroomId || !totalProblems) {
      return NextResponse.json({ error: '시험명, 반, 총 문항수를 모두 입력해주세요' }, { status: 400 });
    }

    // Upload files to Google Drive
    const pageData: { pageNumber: number; imageUrl: string }[] = [];
    let uploadWarning = '';

    if (files.length > 0 && files[0].size > 0) {
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file || file.size === 0) continue;
          const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
          const contentType = file.type || (ext === 'pdf' ? 'application/pdf' : 'image/png');
          const fileName = `${Date.now()}-page${i + 1}.${ext}`;
          const result = await uploadFileFromBlob(
            fileName,
            file,
            contentType,
            ['수탐학원', '시험지', name]
          );
          pageData.push({ pageNumber: i + 1, imageUrl: result.url });
        }
      } catch (uploadError: any) {
        console.error('Google Drive upload failed:', uploadError?.message || uploadError);
        uploadWarning = '파일 업로드에 실패했지만 시험지는 등록됩니다.';
      }
    }

    // Create test paper (even if file upload failed)
    const testPaper = await prisma.testPaper.create({
      data: {
        name,
        classroomId,
        uploadedById: decoded.userId,
        totalProblems,
        answers: answers || undefined,
        ...(pageData.length > 0 ? { pages: { create: pageData } } : {}),
      },
      include: {
        pages: { orderBy: { pageNumber: 'asc' } },
        classroom: true
      }
    });

    return NextResponse.json({ ...testPaper, uploadWarning });
  } catch (error: any) {
    console.error('Failed to create test paper:', error?.message || error, error?.stack);
    return NextResponse.json({ error: `시험지 등록 실패: ${error?.message || '서버 오류'}` }, { status: 500 });
  }
}
