import { prisma } from './prisma';

interface PushMessage {
  to: string;
  sound: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Expo Push Notification 서비스
 * 특정 역할의 사용자들에게 푸시 알림을 보냅니다.
 */
export async function sendPushToRole(
  targetRole: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
) {
  try {
    // 대상 역할에 해당하는 활성 토큰 조회
    const roleFilter = targetRole === 'ALL'
      ? {} // 전체
      : { user: { role: targetRole } };

    const tokens = await prisma.pushToken.findMany({
      where: {
        isActive: true,
        ...roleFilter,
      },
      select: { token: true },
    });

    if (tokens.length === 0) return { sent: 0 };

    // Expo Push API로 전송
    const messages: PushMessage[] = tokens.map((t) => ({
      to: t.token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    // 100개씩 배치로 전송
    const chunks = chunkArray(messages, 100);
    let sent = 0;

    for (const chunk of chunks) {
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chunk),
        });

        if (response.ok) {
          sent += chunk.length;
        }
      } catch (e) {
        console.error('Push send chunk error:', e);
      }
    }

    return { sent };
  } catch (error) {
    console.error('Send push notification error:', error);
    return { sent: 0 };
  }
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}
