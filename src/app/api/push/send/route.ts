import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';
import { sendWebPushToStudent, sendWebPushToRole } from '@/lib/web-push-notification';

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    const decoded = verifyToken(token) as any;
    if (!decoded || !['ADMIN', 'TEACHER'].includes(decoded.role)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }
    const body = await request.json();
    const { studentId, targetRole, title, message, url } = body;
    if (!title || !message) return NextResponse.json({ error: '제목과 메시지 필수' }, { status: 400 });
    let result;
    if (studentId) result = await sendWebPushToStudent(studentId, title, message, url);
    else if (targetRole) result = await sendWebPushToRole(targetRole, title, message, url);
    else return NextResponse.json({ error: 'studentId 또는 targetRole 필수' }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Push send error:', error);
    return NextResponse.json({ error: '알림 발송 실패' }, { status: 500 });
  }
}
