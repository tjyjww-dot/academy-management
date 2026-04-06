import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const KEY = 'examPrep.settings';

export async function GET() {
  try {
    const row = await (prisma as any).appSetting.findUnique({ where: { key: KEY } });
    if (!row) return NextResponse.json(null);
    try { return NextResponse.json(JSON.parse(row.value)); }
    catch { return NextResponse.json(null); }
  } catch (e) {
    return NextResponse.json(null);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const value = JSON.stringify(body);
    await (prisma as any).appSetting.upsert({
      where: { key: KEY },
      update: { value },
      create: { key: KEY, value },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
