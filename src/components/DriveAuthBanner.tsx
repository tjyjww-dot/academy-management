'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * Google Drive OAuth 연결 상태 배너.
 *
 * - authSource === 'oauth' : 정상 → 배너 숨김
 * - authSource === 'service' 또는 'none' : 시험지/오답 이미지가 깨질 수 있음 → 경고 표시
 *
 * Drive 연결이 끊기면 모든 시험지/오답 이미지가 404 가 되므로,
 * 원장님이 즉시 인지할 수 있도록 모든 관리자 페이지 상단에 노출한다.
 */
export default function DriveAuthBanner({ role }: { role: string | null | undefined }) {
  const [source, setSource] = useState<'oauth' | 'service' | 'none' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (role !== 'ADMIN') return;
    let cancelled = false;
    fetch('/api/admin/drive-oauth/status', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return;
        setSource(data?.authSource ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [role]);

  if (role !== 'ADMIN') return null;
  if (!source || source === 'oauth') return null;
  if (dismissed) return null;

  return (
    <div
      role="alert"
      style={{
        background: '#fff7ed',
        borderBottom: '1px solid #f59e0b',
        color: '#9a3412',
        padding: '10px 14px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
      }}
    >
      <span style={{ fontWeight: 700 }}>⚠ Google Drive 연결이 끊겼습니다.</span>
      <span style={{ flex: 1, minWidth: 200 }}>
        시험지·오답 이미지가 학부모앱·테스트지에서 보이지 않을 수 있습니다. Drive 연결 페이지에서
        다시 인증해 주세요.
      </span>
      <Link
        href="/drive-settings"
        style={{
          background: '#9a3412',
          color: '#fff',
          padding: '6px 14px',
          borderRadius: 8,
          fontSize: 12,
          fontWeight: 700,
          textDecoration: 'none',
        }}
      >
        Drive 다시 연결
      </Link>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="이 알림 숨기기"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9a3412',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '0 6px',
        }}
      >
        ×
      </button>
    </div>
  );
}
