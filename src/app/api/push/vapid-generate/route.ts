import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromCookies, verifyToken } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const token = getTokenFromCookies(request);
    if (!token) return NextResponse.json({ error: '인증되지 않음' }, { status: 401 });
    const decoded = verifyToken(token) as any;
    if (!decoded || decoded.role !== 'ADMIN') {
      return NextResponse.json({ error: '관리자만 접근 가능' }, { status: 403 });
    }
    const webpush = await import('web-push');
    const vapidKeys = webpush.generateVAPIDKeys();
    return NextResponse.json({
      message: '아래 키를 Vercel 환경변수에 설정하세요',
      publicKey: vapidKeys.publicKey,
      privateKey: vapidKeys.privateKey,
      instructions: {
        step1: 'Vercel 대시보드: https://vercel.com/dashboard',
        step2: 'academy-management 프로젝트 > Settings > Environment Variables',
        step3_public: 'NEXT_PUBLIC_VAPID_PUBLIC_KEY = (위 publicKey)',
        step3_private: 'VAPID_PRIVATE_KEY = (위 privateKey)',
        step4: 'Redeploy 실행',
      },
    });
  } catch (error) {
    console.error('VAPID generate error:', error);
    return NextResponse.json({ error: 'VAPID 키 생성 실패' }, { status: 500 });
  }
}
