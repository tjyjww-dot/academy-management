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

// 쿠키 설정 (localStorage보다 안드로이드에서 더 안정적)
function setCookie(name: string, value: string, days: number) {
  const d = new Date();
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${d.toUTCString()};path=/;SameSite=Lax`;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

async function saveSubscriptionToServer(sub: PushSubscription): Promise<boolean> {
  try {
    const subJson = sub.toJSON();
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: subJson.endpoint, keys: { p256dh: subJson.keys?.p256dh, auth: subJson.keys?.auth } }),
    });
    return res.ok;
  } catch (e) {
    console.error('[push] save to server failed', e);
    return false;
  }
}

async function ensureSubscription(vapidKey: string): Promise<PushSubscription | null> {
  try {
    // 서비스워커 등록 및 활성화 대기
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // 기존 구독 확인
    let sub = await reg.pushManager.getSubscription();

    // 구독이 있지만 VAPID 키가 다를 수 있음 - 유효성 체크
    if (sub) {
      const currentKey = sub.options?.applicationServerKey;
      const expectedKeyArr = urlBase64ToUint8Array(vapidKey);
      if (currentKey) {
        const currentArr = new Uint8Array(currentKey);
        if (currentArr.length !== expectedKeyArr.length ||
          !currentArr.every((v, i) => v === expectedKeyArr[i])) {
          console.log('[push] VAPID key mismatch, resubscribing');
          await sub.unsubscribe();
          sub = null;
        }
      }
    }

    // 구독이 없으면 생성
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    return sub;
  } catch (e) {
    console.error('[push] ensureSubscription error', e);
    return null;
  }
}

export default function PushNotificationManager() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) return;

    const run = async () => {
      const perm = Notification.permission;

      // 이미 권한 허용 상태 → 항상 구독 상태 동기화 (핵심 수정)
      if (perm === 'granted') {
        const sub = await ensureSubscription(vapidKey);
        if (sub) {
          await saveSubscriptionToServer(sub);
          setIsSubscribed(true);
          setCookie('push-dismissed', '1', 365);
          try { localStorage.setItem('push-banner-dismissed', 'true'); } catch {}
        }
        return;
      }

      // 거부 상태 → 배너 숨김
      if (perm === 'denied') {
        setCookie('push-dismissed', '1', 365);
        try { localStorage.setItem('push-banner-dismissed', 'true'); } catch {}
        return;
      }

      // perm === 'default': 사용자가 아직 선택하지 않음
      // 이전에 "나중에"를 눌렀으면 배너 숨김
      if (getCookie('push-dismissed') === '1') return;
      try {
        if (localStorage.getItem('push-banner-dismissed') === 'true') {
          setCookie('push-dismissed', '1', 365);
          return;
        }
      } catch {}

      // 배너 노출 (3초 후)
      setTimeout(() => setShowBanner(true), 3000);
    };

    run();
  }, []);

  function markDismissed() {
    try { localStorage.setItem('push-banner-dismissed', 'true'); } catch {}
    setCookie('push-dismissed', '1', 365);
  }

  const subscribe = async () => {
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;
      setShowBanner(false);
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        markDismissed();
        return;
      }
      const sub = await ensureSubscription(vapidKey);
      if (sub) {
        const saved = await saveSubscriptionToServer(sub);
        if (saved) setIsSubscribed(true);
        markDismissed();
      }
    } catch (err) {
      console.error('Push subscription error:', err);
      setShowBanner(false);
    }
  };

  if (isSubscribed || !showBanner) return null;

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
        <button onClick={() => { markDismissed(); setShowBanner(false); }} style={{
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
