import { NextRequest } from 'next/server';
import { verifyToken } from './auth';

/**
 * 모바일 앱용 Bearer 토큰 인증 헬퍼
 * Authorization: Bearer <token> 헤더에서 토큰을 추출하고 검증합니다.
 */
export function getMobileUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);
  return verifyToken(token);
}

/**
 * 모바일 인증이 필요한 API에서 사용하는 가드
 * 인증 실패 시 { error, status } 반환, 성공 시 { user } 반환
 */
export function requireMobileAuth(request: NextRequest) {
  const user = getMobileUser(request);

  if (!user) {
    return { error: '인증이 필요합니다.', status: 401, user: null };
  }

  return { error: null, status: 200, user };
}
