import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

/**
 * POST /api/test-papers/extract-answers
 * PDF를 업로드하면 답지 페이지에서 답을 추출합니다.
 * pdf-parse를 사용하여 서버에서 텍스트를 추출하므로
 * pdfjs-dist보다 폰트 호환성이 높습니다.
 */
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
    const file = formData.get('file') as File;
    const answerStartPage = parseInt(formData.get('answerStartPage') as string) || 1;
    const answerEndPage = parseInt(formData.get('answerEndPage') as string) || 0;
    const totalProblems = parseInt(formData.get('totalProblems') as string) || 0;

    if (!file) {
      return NextResponse.json({ error: 'PDF 파일이 필요합니다' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // pdf-parse로 전체 텍스트 추출 (페이지별)
    const pdfParse = (await import('pdf-parse')).default;

    // 페이지별 텍스트 추출을 위한 커스텀 렌더
    const pageTexts: Record<number, string> = {};
    let currentPage = 0;

    const data = await pdfParse(buffer, {
      pagerender: async function (pageData: any) {
        currentPage++;
        const textContent = await pageData.getTextContent();
        // 텍스트 아이템을 Y좌표별로 그룹화하여 라인 순서로 합침
        const items = textContent.items as any[];

        if (items.length === 0) return '';

        // Y좌표로 정렬 (PDF 좌표계: 아래에서 위로)
        // 같은 라인의 아이템은 X좌표로 정렬
        interface PosItem {
          text: string;
          x: number;
          y: number;
        }

        const posItems: PosItem[] = items
          .filter((item: any) => item.str && item.str.trim())
          .map((item: any) => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
          }));

        if (posItems.length === 0) return '';

        // Y좌표별 라인 그룹화 (비슷한 Y는 같은 라인)
        const yThreshold = 5;
        const lineGroups: PosItem[][] = [];
        const sortedByY = [...posItems].sort((a, b) => b.y - a.y); // 위에서 아래로

        let currentLine: PosItem[] = [sortedByY[0]];
        let currentY = sortedByY[0].y;

        for (let i = 1; i < sortedByY.length; i++) {
          if (Math.abs(sortedByY[i].y - currentY) <= yThreshold) {
            currentLine.push(sortedByY[i]);
          } else {
            lineGroups.push(currentLine);
            currentLine = [sortedByY[i]];
            currentY = sortedByY[i].y;
          }
        }
        lineGroups.push(currentLine);

        // 각 라인 내에서 X좌표로 정렬하고 텍스트 합침
        const lineTexts = lineGroups.map(group => {
          group.sort((a, b) => a.x - b.x);
          return group.map(item => item.text).join(' ');
        });

        const pageText = lineTexts.join('\n');
        pageTexts[currentPage] = pageText;
        return pageText;
      }
    });

    // 답지 페이지 텍스트만 수집
    const endPage = answerEndPage || Object.keys(pageTexts).length;
    let answerText = '';
    const pageDebug: { page: number; text: string }[] = [];

    for (let p = answerStartPage; p <= endPage; p++) {
      const text = pageTexts[p] || '';
      answerText += text + '\n';
      pageDebug.push({ page: p, text: text.substring(0, 500) });
    }

    // 답 추출 - 다양한 패턴 시도
    const answers: Record<number, string> = {};
    const lines = answerText.split('\n').map(l => l.trim()).filter(l => l);

    // 원형 숫자 변환 맵
    const circleToNum: Record<string, string> = {
      '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
      '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
    };

    for (const line of lines) {
      // 패턴 1: "N) 답" (가장 일반적)
      let m = line.match(/^(\d{1,3})\s*\)\s*(.+)$/);
      if (m) {
        const num = parseInt(m[1]);
        let ans = m[2].trim();
        // 원형 숫자 변환
        Object.entries(circleToNum).forEach(([circle, digit]) => {
          ans = ans.replace(new RegExp(circle, 'g'), digit);
        });
        if (num >= 1 && num <= 100) answers[num] = ans;
        continue;
      }

      // 패턴 2: "N. 답" (마침표)
      m = line.match(/^(\d{1,3})\.\s+(.+)$/);
      if (m) {
        const num = parseInt(m[1]);
        let ans = m[2].trim();
        Object.entries(circleToNum).forEach(([circle, digit]) => {
          ans = ans.replace(new RegExp(circle, 'g'), digit);
        });
        if (num >= 1 && num <= 100 && ans.length < 50) answers[num] = ans;
        continue;
      }

      // 패턴 3: 한 줄에 여러 답 "N) 답  N) 답"
      const multiPattern = /(\d{1,3})\s*\)\s*([^0-9\n]+?)(?=\s+\d{1,3}\s*\)|$)/g;
      let mm;
      while ((mm = multiPattern.exec(line)) !== null) {
        const num = parseInt(mm[1]);
        let ans = mm[2].trim();
        Object.entries(circleToNum).forEach(([circle, digit]) => {
          ans = ans.replace(new RegExp(circle, 'g'), digit);
        });
        if (num >= 1 && num <= 100 && ans && !answers[num]) answers[num] = ans;
      }
    }

    // 두 번째 패스: 라인 쌍으로 분리된 경우 처리
    // (PDF가 "1)" 와 "①, ③" 를 별도 라인으로 추출하는 경우)
    if (Object.keys(answers).length < 3) {
      for (let i = 0; i < lines.length; i++) {
        const numMatch = lines[i].match(/^(\d{1,3})\s*\)?\s*$/);
        if (numMatch && i + 1 < lines.length) {
          const num = parseInt(numMatch[1]);
          let ans = lines[i + 1].trim();
          Object.entries(circleToNum).forEach(([circle, digit]) => {
            ans = ans.replace(new RegExp(circle, 'g'), digit);
          });
          if (num >= 1 && num <= 100 && ans.length < 50) {
            answers[num] = ans;
          }
        }
      }
    }

    // 세 번째 패스: 전체 텍스트에서 일괄 추출 시도
    if (Object.keys(answers).length < 3) {
      const allText = answerText.replace(/\n/g, ' ');
      const globalPattern = /(\d{1,3})\s*\)\s*([^\d\n][^)\n]*?)(?=\s*\d{1,3}\s*\)|$)/g;
      let gm;
      while ((gm = globalPattern.exec(allText)) !== null) {
        const num = parseInt(gm[1]);
        let ans = gm[2].trim();
        Object.entries(circleToNum).forEach(([circle, digit]) => {
          ans = ans.replace(new RegExp(circle, 'g'), digit);
        });
        if (num >= 1 && num <= 100 && ans && !answers[num]) answers[num] = ans;
      }
    }

    return NextResponse.json({
      success: true,
      answers,
      extractedCount: Object.keys(answers).length,
      totalProblems,
      rawText: answerText.substring(0, 3000),
      pageDebug,
      message: Object.keys(answers).length > 0
        ? `${Object.keys(answers).length}개 답이 추출되었습니다.`
        : '답을 자동 추출하지 못했습니다.',
    });
  } catch (error: any) {
    console.error('Answer extraction error:', error);
    return NextResponse.json({
      error: `답 추출 실패: ${error?.message || '서버 오류'}`,
    }, { status: 500 });
  }
}
