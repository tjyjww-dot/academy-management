import { prisma } from './prisma';

export async function sendWebPushToStudent(
  studentId: string,
  title: string,
  body: string,
  url?: string
) {
  try {
    const webpush = await import('web-push');
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) {
      console.warn('VAPID keys not configured. Skipping web push.');
      return { sent: 0, error: 'VAPID keys not configured' };
    }
    webpush.setVapidDetails('mailto:admin@sutam.kr', vapidPublicKey, vapidPrivateKey);

    const parentStudents = await prisma.parentStudent.findMany({
      where: { studentId },
      select: { parentId: true },
    });
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: { userId: true },
    });
    const userIds = [
      ...parentStudents.map(ps => ps.parentId),
      ...(student?.userId ? [student.userId] : []),
    ];
    if (userIds.length === 0) return { sent: 0 };

    const subscriptions = await prisma.webPushSubscription.findMany({
      where: { userId: { in: userIds }, isActive: true },
    });
    if (subscriptions.length === 0) return { sent: 0 };

    const payload = JSON.stringify({ title, body, url: url || '/parent', tag: 'student-' + studentId });
    let sent = 0;
    const failed: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) failed.push(sub.id);
        console.error('Web push send error:', err.statusCode || err.message);
      }
    }
    if (failed.length > 0) {
      await prisma.webPushSubscription.updateMany({
        where: { id: { in: failed } },
        data: { isActive: false },
      });
    }
    return { sent, failed: failed.length };
  } catch (error) {
    console.error('sendWebPushToStudent error:', error);
    return { sent: 0 };
  }
}

export async function sendWebPushToRole(
  targetRole: string,
  title: string,
  body: string,
  url?: string
) {
  try {
    const webpush = await import('web-push');
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) return { sent: 0 };
    webpush.setVapidDetails('mailto:admin@sutam.kr', vapidPublicKey, vapidPrivateKey);

    const subscriptions = await prisma.webPushSubscription.findMany({
      where: targetRole === 'ALL' ? { isActive: true } : { isActive: true, user: { role: targetRole } },
    });
    if (subscriptions.length === 0) return { sent: 0 };

    const payload = JSON.stringify({ title, body, url: url || '/' });
    let sent = 0;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await prisma.webPushSubscription.update({ where: { id: sub.id }, data: { isActive: false } });
        }
      }
    }
    return { sent };
  } catch (error) {
    console.error('sendWebPushToRole error:', error);
    return { sent: 0 };
  }
}
