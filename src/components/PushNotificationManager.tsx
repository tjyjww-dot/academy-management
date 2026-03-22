'use client';

import { useEffect, useState } from 'react';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function PushNotificationManager() {
  const [permission, setPermission] = useState<string>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;
    setPermission(Notification.permission);
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setIsSubscribed(true);
      else if (Notification.permission === 'default') setTimeout(() => setShowBanner(true), 3000);
    });
  }, []);

  const subscribe = async () => {
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;
      const perm = await Notification.requestPermission();
      setPermission(perm);
      setShowBanner(false);
      if (perm !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const subJson = sub.toJSON();
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth } }),
      });
      if (res.ok) setIsSubscribed(true);
    } catch (err) { console.error('Push subscription error:', err); }
  };

  if (isSubscribed || permission === 'denied' || !showBanner) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 32px)', maxWidth: 420,
      background: 'linear-gradient(135deg, #3b82f6, #4f46e5)',
      borderRadius: 16, padding: '16px 20px',
      boxShadow: '0 10px 25px rgba(59,130,246,0.35)', zIndex: 9999,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ fontSize: 28, flexShrink: 0 }}>🔔</div>
      <div style={{ flex: 1 }}>
        <p style={{ color: 'white', fontWeight: 600, fontSize: 14, margin: 0 }}>알림을 받으시겠어요?</p>
        <p style={{ color: 'rgba(191,219,254,1)', fontSize: 12, margin: '4px 0 0' }}>출결, 성적 등 학원 소식을 바로 받아보세요</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button onClick={() => setShowBanner(false)} style={{
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8,
          padding: '8px 12px', color: 'white', fontSize: 12, cursor: 'pointer',
        }}>나중에</button>
        <button onClick={subscribe} style={{
          background: 'white', border: 'none', borderRadius: 8,
          padding: '8px 16px', color: '#3b82f6', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        }}>허용</button>
      </div>
    </div>
  );
}
