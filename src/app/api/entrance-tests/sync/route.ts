import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { randomUUID } from 'crypto';

// Google 스프레드시트에서 CSV 데이터를 가져오는 함수
async function fetchSheetCSV(startRow: number): Promise<string> {
  const SHEET_ID = '1UaOb_EEVRJXuaZ082jZI1tHn_4hJ3RwYqCGWqJV8Zvs';
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&range=A${startRow}:L500`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return res.text();
}

// CSV 한 줄을 파싱 (따옴표 처리 포함)
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// 학교와 학년 분리 (예: "예비 중계중1" → school: "중계중", grade: "중등 1학년")
function parseSchoolGrade(raw: string): { school: string; grade: string } {
  if (!raw) return { school: '', grade: '' };

  const gradePatterns = [
    { regex: /초\s*(\d)/, prefix: '초등', suffix: '학년' },
    { regex: /중\s*(\d)/, prefix: '중등', suffix: '학년' },
    { regex: /고\s*(\d)/, prefix: '고등', suffix: '학년' },
    { regex: /예비\s*초\s*(\d)/, prefix: '예비 초등', suffix: '학년' },
    { regex: /예비\s*중\s*(\d)/, prefix: '예비 중등', suffix: '학년' },
    { regex: /예비\s*고\s*(\d)/, prefix: '예비 고등', suffix: '학년' },
  ];

  let grade = '';
  for (const p of gradePatterns) {
    const m = raw.match(p.regex);
    if (m) {
      grade = `${p.prefix} ${m[1]}${p.suffix}`;
      break;
    }
  }

  // 학교명 추출 (숫자와 예비 등 제거)
  let school = raw
    .replace(/예비\s*/, '')
    .replace(/\d+/g, '')
    .replace(/학년/g, '')
    .replace(/초$|중$|고$/, '')
    .trim();

  // 학교명이 너무 짧으면 원본 사용
  if (school.length < 2) school = raw.replace(/\d+/g, '').trim();

  return { school, grade: grade || raw };
}

// 테스트 날짜/시간 파싱 (자유 형식 한국어)
function parseTestDateTime(raw: string): { testDate: string; testTime: string } {
  if (!raw) return { testDate: '', testTime: '' };

  const now = new Date();
  const currentYear = now.getFullYear();

  // 날짜 파싱
  let month = 0, day = 0, year = currentYear;

  // "2026년 2월 24일" 형식
  const fullDateMatch = raw.match(/(\d{4})\s*년\s*(\d{1,2})\s*[월웡]\s*(\d{1,2})\s*일/);
  if (fullDateMatch) {
    year = parseInt(fullDateMatch[1]);
    month = parseInt(fullDateMatch[2]);
    day = parseInt(fullDateMatch[3]);
  } else {
    // "2월 28일" 또는 "2.28일" 또는 "2/28" 형식
    const dateMatch = raw.match(/(\d{1,2})\s*[월.\-\/]\s*(\d{1,2})\s*일?/);
    if (dateMatch) {
      month = parseInt(dateMatch[1]);
      day = parseInt(dateMatch[2]);
    }
  }

  // 시간 파싱
  let hour = 0;

  // "저녁 6시" / "오후 3시" / "3시" 형식
  const timeMatch = raw.match(/(오전|오후|저녁|아침)?\s*(\d{1,2})\s*시\s*(\d{1,2})?분?/);
  if (timeMatch) {
    hour = parseInt(timeMatch[2]);
    const period = timeMatch[1];
    if (period === '오후' || period === '저녁') {
      if (hour < 12) hour += 12;
    } else if (period === '오전' || period === '아침') {
      if (hour === 12) hour = 0;
    } else {
      // 기본: 학원 운영시간 기준 1~8 → 오후로 판단
      if (hour >= 1 && hour <= 8) hour += 12;
    }
  }

  // 날짜 문자열 생성
  let testDate = '';
  if (month > 0 && day > 0) {
    testDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const minutes = timeMatch?.[3] ? String(parseInt(timeMatch[3])).padStart(2, '0') : '00';
  const testTime = hour > 0 ? `${String(hour).padStart(2, '0')}:${minutes}` : '';

  return { testDate, testTime };
}

// 전화번호 정규화
function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return raw.trim();
}

// ————————————————————————————————————
// POST /api/entrance-tests/sync
// 구글 시트에서 새 예약 데이터를 동기화
// ————————————————————————————————————
export async function POST(request: NextRequest) {
  try {
    // 시크릿 키 인증
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || request.headers.get('x-sync-secret');
    const SYNC_SECRET = process.env.SHEET_SYNC_SECRET || 'sutam-sync-2026';

    if (secret !== SYNC_SECRET) {
      return NextResponse.json({ error: '인증 실패' }, { status: 401 });
    }

    // 마지막으로 처리한 행 번호 조회 (DB에서 동기화 기록 확인)
    // 시트의 타임스탬프를 기준으로 이미 등록된 것 확인
    const existingTests = await prisma.entranceTest.findMany({
      where: { notes: { startsWith: '[시트동기화]' } },
      select: { notes: true },
    });

    const processedTimestamps = new Set(
      existingTests.map((t) => {
        const match = t.notes?.match(/\[시트동기화\]\s*(.+?)$/);
        return match ? match[1].trim() : '';
      }).filter(Boolean)
    );

    // 시트에서 133행부터 데이터 가져오기
    const START_ROW = 133;
    const csvText = await fetchSheetCSV(START_ROW);
    const lines = csvText.split('\n').filter((l) => l.trim());

    const newEntries: any[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);

      // 빈 행이면 건너뛰기
      if (!cols[0] || !cols[1]) continue;

      const timestamp = cols[0] || '';
      const name = cols[1] || '';
      const schoolGradeRaw = cols[2] || '';
      const priorLevel = cols[3] || '';
      const parentPhone = cols[4] || '';
      const testReservation = cols[9] || cols[7] || ''; // J열(인덱스9) 우선, 없으면 H열

      // 이미 처리된 타임스탬프면 건너뛰기
      if (processedTimestamps.has(timestamp)) {
        skipped.push(`${name} (이미 등록됨)`);
        continue;
      }

      // 필수 데이터 확인
      if (!name || !parentPhone) {
        skipped.push(`행 ${START_ROW + i}: 이름 또는 연락처 없음`);
        continue;
      }

      // 테스트 예약 정보가 없으면 건너뛰기
      if (!testReservation) {
        skipped.push(`${name}: 테스트 예약 정보 없음`);
        continue;
      }

      try {
        const { school, grade } = parseSchoolGrade(schoolGradeRaw);
        const { testDate, testTime } = parseTestDateTime(testReservation);
        const normalizedPhone = normalizePhone(parentPhone);

        // 날짜나 시간이 파싱되지 않았으면 비고에 원본 텍스트 기록
        const noteParts = [`[시트동기화] ${timestamp}`];
        if (!testDate || !testTime) {
          noteParts.push(`원본예약: ${testReservation}`);
        }

        await prisma.entranceTest.create({
          data: {
            id: randomUUID(),
            name,
            school: school || null,
            grade: grade || null,
            parentPhone: normalizedPhone,
            testDate: testDate || '미정',
            testTime: testTime || '미정',
            status: 'SCHEDULED',
            priorLevel: priorLevel || null,
            notes: noteParts.join(' | '),
          },
        });

        newEntries.push({
          name,
          school,
          grade,
          parentPhone: normalizedPhone,
          testDate: testDate || '미정',
          testTime: testTime || '미정',
        });
      } catch (err: any) {
        errors.push(`${name}: ${err.message}`);
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        newCount: newEntries.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
      },
      newEntries,
      skipped,
      errors,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Sheet sync error:', error);
    return NextResponse.json(
      { error: '시트 동기화 중 오류 발생', detail: error.message },
      { status: 500 }
    );
  }
}

// GET: 동기화 상태 확인
export async function GET(request: NextRequest) {
  try {
    const syncedTests = await prisma.entranceTest.findMany({
      where: { notes: { startsWith: '[시트동기화]' } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return NextResponse.json({
      totalSynced: syncedTests.length,
      recentSynced: syncedTests.map((t) => ({
        name: t.name,
        testDate: t.testDate,
        testTime: t.testTime,
        parentPhone: t.parentPhone,
        syncNote: t.notes,
        createdAt: t.createdAt,
      })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
