import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function keyOf(year: string, semester: string, examType: string) {
  return `examPrep.instructors.${year}.${semester}.${examType}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year') || '';
  const semester = searchParams.get('semester') || '';
  const examType = searchParams.get('examType') || '';
  if (!year || !semester || !examType) {
    return NextResponse.json({});
  }
  try {
    const row = await (prisma as any).appSetting.findUnique({
      where: { key: keyOf(year, semester, examType) },
    });
    if (!row) return NextResponse.json({});
    try {
      return NextResponse.json(JSON.parse(row.value));
    } catch {
      return NextResponse.json({});
    }
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { year, semester, examType, map } = body || {};
    if (!year || !semester || !examType || typeof map !== 'object') {
      return NextResponse.json({ error: 'Bad request' }, { status: 400 });
    }
    const key = keyOf(String(year), String(semester), String(examType));
    const value = JSON.stringify(map);
    await (prisma as any).appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
