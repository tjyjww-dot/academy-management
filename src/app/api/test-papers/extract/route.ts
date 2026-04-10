import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';

// pdf-parse를 dynamic import로 로드 (ESM 호환)
async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * POST /api/test-papers/extract
 * PDF 파일을 업로드하면 텍스트를 추출하고 문항-정답 매핑을 자동으로 생성합니다.
 *
 * 지원하는 정답 패턴:
 * - "1. ③" 또는 "1. 3" (번호. 정답)
 * - "1) ③" 또는 "1) 3"
 * - "1번 ③" 또는 "1번: 3"
 * - 정답표 형태: 연속된 숫자 매핑
 * - OMR 형태: "①②③④⑤" 에서 정답 표시
 */
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
    const file = formData.get('file') as File;
    const totalProblems = parseInt(formData.get('totalProblems') as string) || 0;

    if (!file) {
      return NextResponse.json({ error: 'PDF 파일을 업로드해주세요' }, { status: 400 });
    }

    // PDF 텍스트 추출
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let rawText = '';
    try {
      rawText = await parsePdf(buffer);
    } catch (pdfError: any) {
      console.error('PDF parse error:', pdfError?.message);
      return NextResponse.json({
        error: 'PDF 텍스트를 추출할 수 없습니다. 이미지 기반 PDF인 경우 수동으로 입력해주세요.',
        rawText: ''
      }, { status: 422 });
    }

    // 텍스트 정리
    const text = rawText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    // 원형 숫자를 일반 숫자로 변환
    const circleToNum: Record<string, string> = {
      '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5',
      '⑥': '6', '⑦': '7', '⑧': '8', '⑨': '9', '⑩': '10',
    };

    // 정답 추출 시도 (여러 패턴)
    const answers: Record<number, string> = {};

    // 패턴 1: "정답" 또는 "답" 키워드가 있는 섹션 찾기
    const answerSectionPatterns = [
      /정\s*답[\s\S]*$/i,
      /답\s*안[\s\S]*$/i,
      /answer[\s\S]*$/i,
      /채점\s*기준[\s\S]*$/i,
    ];

    let answerSection = '';
    for (const pattern of answerSectionPatterns) {
      const match = text.match(pattern);
      if (match) {
        answerSection = match[0];
        break;
      }
    }

    // 작업할 텍스트 (정답 섹션이 있으면 그것, 없으면 전체)
    const workingText = answerSection || text;

    // 패턴 2: "번호. 정답" 또는 "번호) 정답" 형태 매칭
    // 예: "1. ③", "1. 3", "1) ②", "1번 4", "1번: ③"
    const answerPatterns = [
      // "1. ③" 또는 "1. 3"
      /(\d{1,2})\s*[.)]\s*([①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2})/g,
      // "1번 ③" 또는 "1번: 3" 또는 "1번 : ③"
      /(\d{1,2})\s*번\s*:?\s*([①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2})/g,
      // "1 - ③" 또는 "1 - 3"
      /(\d{1,2})\s*[-–—]\s*([①②③④⑤⑥⑦⑧⑨⑩]|\d{1,2})/g,
    ];

    for (const pattern of answerPatterns) {
      const matches = workingText.matchAll(pattern);
      for (const match of matches) {
        const problemNum = parseInt(match[1]);
        let answer = match[2];
        // 원형 숫자를 일반 숫자로 변환
        if (circleToNum[answer]) {
          answer = circleToNum[answer];
        }
        if (problemNum >= 1 && problemNum <= (totalProblems || 100) && !answers[problemNum]) {
          answers[problemNum] = answer;
        }
      }
    }

    // 패턴 3: 정답표 형태 (연속된 숫자들)
    // "1 2 3 4 5 | ③ ① ④ ② ⑤" 같은 형태
    if (Object.keys(answers).length === 0) {
      // 원형 숫자가 연속으로 나오는 패턴 찾기
      const circlePattern = /([①②③④⑤⑥⑦⑧⑨⑩][\s,]*){3,}/g;
      const circleMatches = workingText.match(circlePattern);
      if (circleMatches) {
        for (const circleMatch of circleMatches) {
          const circles = circleMatch.match(/[①②③④⑤⑥⑦⑧⑨⑩]/g);
          if (circles) {
            circles.forEach((c, idx) => {
              const num = idx + 1;
              if (num <= (totalProblems || 100) && !answers[num]) {
                answers[num] = circleToNum[c] || c;
              }
            });
          }
        }
      }
    }

    // 패턴 4: 일반 숫자가 연속으로 나오는 정답표
    // 정답 섹션에서 "3 1 4 2 5 2 3 1 4 5" 같은 형태
    if (Object.keys(answers).length === 0 && answerSection) {
      const nums = answerSection.match(/\b([1-5])\b/g);
      if (nums && nums.length >= 5) {
        nums.forEach((n, idx) => {
          const problemNum = idx + 1;
          if (problemNum <= (totalProblems || 100) && !answers[problemNum]) {
            answers[problemNum] = n;
          }
        });
      }
    }

    const extractedCount = Object.keys(answers).length;

    return NextResponse.json({
      success: true,
      rawText: text.substring(0, 3000), // 미리보기용 (3000자 제한)
      answers,
      extractedCount,
      totalProblems,
      message: extractedCount > 0
        ? `${extractedCount}개 문항의 정답이 자동 추출되었습니다.`
        : 'PDF에서 정답을 자동 추출하지 못했습니다. 수동으로 입력해주세요.',
    });
  } catch (error: any) {
    console.error('PDF extraction error:', error?.message || error, error?.stack);
    return NextResponse.json({
      error: `PDF 분석 실패: ${error?.message || '서버 오류'}`
    }, { status: 500 });
  }
}
