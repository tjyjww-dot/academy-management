'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { hapticSelection, hapticLight } from '@/lib/haptics';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

type NavItem = { href: string; label: string; icon: string };
type NavGroup = { title?: string; items: NavItem[] };

// 카테고리 기반 네비게이션 — 운영 / 학습 / 커뮤니케이션
const navGroups: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: '대시보드', icon: 'dashboard' },
    ],
  },
  {
    title: '학원 운영',
    items: [
      { href: '/entrance-test', label: '입학테스트 예약', icon: 'entrance' },
      { href: '/students', label: '원생관리', icon: 'students' },
      { href: '/classes', label: '반관리', icon: 'classrooms' },
      { href: '/payments', label: '수강료 수납', icon: 'payments' },
    ],
  },
  {
    title: '학습 관리',
    items: [
      { href: '/wrong-answers', label: '오답관리', icon: 'wrongAnswers' },
      { href: '/exam-prep', label: '직전대비', icon: 'examPrep' },
    ],
  },
  {
    title: '커뮤니케이션',
    items: [
      { href: '/requests', label: '요청사항', icon: 'requests' },
    ],
  },
];

const adminOnlyGroup: NavGroup = {
  title: '시스템',
  items: [
    { href: '/signup-requests', label: '가입신청 관리', icon: 'signup' },
    { href: '/backup', label: '데이터 백업', icon: 'backup' },
  ],
};

function getIcon(name: string) {
  const icons: Record<string, React.ReactNode> = {
    dashboard: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-3m0 0l7-4 7 4M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9m-9 3l3 3m0 0l3-3m-3 3V7" />
      </svg>
    ),
    entrance: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    students: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6 5.87v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2m8-10a4 4 0 11-8 0 4 4 0 018 0zm8 0a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    classrooms: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5.581m0 0H9m0 0h5.581M9 12h.01M9 16h.01" />
      </svg>
    ),
    payments: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    wrongAnswers: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v2m0 4h.01M5.07 19H19a2 2 0 001.75-2.97l-7-12a2 2 0 00-3.5 0l-7 12A2 2 0 005.07 19z" />
      </svg>
    ),
    examPrep: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    requests: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    signup: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
      </svg>
    ),
    backup: (
      <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </svg>
    ),
  };
  return icons[name] || null;
}

function roleLabel(role: string) {
  switch (role) {
    case 'ADMIN':   return '원장';
    case 'TEACHER': return '강사';
    case 'DESK':    return '데스크';
    case 'PARENT':  return '학부모';
    case 'STUDENT': return '학생';
    default: return role;
  }
}

function roleTone(role: string): 'accent' | 'gold' | 'neutral' {
  if (role === 'ADMIN') return 'accent';
  if (role === 'TEACHER' || role === 'DESK') return 'gold';
  return 'neutral';
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          router.push('/auth/login');
          return;
        }
        const data = await response.json();
        setUser(data.user);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        router.push('/auth/login');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    try {
      hapticLight();
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/auth/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--color-surface-2)' }}>
        <div className="text-center">
          <div
            className="inline-block w-10 h-10 rounded-full animate-spin"
            style={{
              border: '3px solid var(--color-border)',
              borderTopColor: 'var(--color-accent)',
            }}
          />
          <p className="mt-4 text-[13px]" style={{ color: 'var(--color-mute)' }}>로딩 중...</p>
        </div>
      </div>
    );
  }

  const renderNavGroup = (group: NavGroup) => (
    <div key={group.title ?? 'root'} className="mb-5">
      {group.title && (
        <div
          className="px-3 mb-2 text-[10.5px] font-semibold uppercase"
          style={{ color: 'var(--color-mute-2)', letterSpacing: '0.08em' }}
        >
          {group.title}
        </div>
      )}
      <div className="space-y-0.5">
        {group.items.map((link) => {
          const isActive = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onPointerDown={() => hapticSelection()}
              onClick={() => setSidebarOpen(false)}
              className="press relative flex items-center gap-3 px-3 py-2.5 rounded-[10px] transition-colors"
              style={{
                color: isActive ? 'var(--color-accent)' : 'var(--color-ink-2)',
                background: isActive ? 'rgba(31,58,95,0.07)' : 'transparent',
                fontWeight: isActive ? 600 : 500,
              }}
            >
              {isActive && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
                  style={{
                    width: 3,
                    height: 18,
                    background: 'var(--color-gold)',
                  }}
                />
              )}
              <span className="shrink-0" style={{ color: isActive ? 'var(--color-accent)' : 'var(--color-mute)' }}>
                {getIcon(link.icon)}
              </span>
              <span className="text-[13.5px]" style={{ letterSpacing: '-0.01em' }}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-surface-2)' }}>
      {/* Skip to main content (키보드 접근성) */}
      <a href="#admin-main" className="skip-link">본문으로 건너뛰기</a>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(14,14,12,0.4)' }}
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        id="admin-sidebar"
        aria-label="주요 메뉴"
        className={`fixed inset-y-0 left-0 z-50 w-64 transition-transform ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0 md:relative`}
        style={{
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          transitionDuration: 'var(--dur-base, 220ms)',
          transitionTimingFunction: 'var(--ease-apple-inout)',
        }}
      >
        <div className="flex flex-col h-full">
          {/* Logo/Title */}
          <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div
              className="text-[10.5px] font-semibold uppercase mb-1"
              style={{ color: 'var(--color-gold)', letterSpacing: '0.12em' }}
            >
              Suhak Tamgu
            </div>
            <div className="flex items-baseline gap-2">
              <h2
                className="text-[22px] font-bold"
                style={{ color: 'var(--color-ink)', letterSpacing: '-0.02em' }}
              >
                수학탐구
              </h2>
              <span className="text-[11px] font-medium" style={{ color: 'var(--color-mute)' }}>
                운영 콘솔
              </span>
            </div>
            <div
              className="mt-3"
              style={{
                height: 1,
                background: 'linear-gradient(to right, var(--color-gold), transparent)',
                width: 48,
              }}
            />
          </div>

          {/* Navigation Links */}
          <nav className="flex-1 px-3 py-5 overflow-y-auto">
            {navGroups.map(renderNavGroup)}

            {user?.role === 'ADMIN' && (
              <>
                <div
                  className="my-3"
                  style={{ height: 1, background: 'var(--color-border)' }}
                />
                {renderNavGroup(adminOnlyGroup)}
              </>
            )}
          </nav>

          {/* User card + Logout */}
          <div className="px-4 pt-3 pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
            {user && (
              <div className="flex items-center gap-3 px-2 py-2 mb-2">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                  style={{
                    background: 'var(--color-accent)',
                    color: '#fff',
                    boxShadow: '0 0 0 2px var(--color-gold-soft)',
                  }}
                >
                  {user.name[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[13px] font-semibold truncate"
                    style={{ color: 'var(--color-ink)', letterSpacing: '-0.01em' }}
                  >
                    {user.name}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: 'var(--color-mute)' }}>
                    {user.email}
                  </div>
                </div>
              </div>
            )}
            <button
              type="button"
              onPointerDown={() => hapticLight()}
              onClick={handleLogout}
              className="press w-full flex items-center justify-center gap-2 py-2.5 rounded-[10px] text-[13px] font-medium"
              style={{
                color: 'var(--color-mute)',
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                letterSpacing: '-0.01em',
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col w-full min-w-0">
        {/* Top Header Bar */}
        <header
          className="h-14 flex items-center justify-between px-4 md:px-6 sticky top-0 z-40"
          style={{
            background: 'rgba(255,255,255,0.88)',
            backdropFilter: 'saturate(180%) blur(14px)',
            WebkitBackdropFilter: 'saturate(180%) blur(14px)',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          {/* Hamburger Menu for Mobile */}
          <button
            type="button"
            aria-label={sidebarOpen ? '메뉴 닫기' : '메뉴 열기'}
            aria-expanded={sidebarOpen}
            aria-controls="admin-sidebar"
            onPointerDown={() => hapticLight()}
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="press md:hidden p-2 h-11 w-11 rounded-lg flex items-center justify-center"
            style={{ color: 'var(--color-ink-2)' }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="flex-1 md:flex-none" />

          {/* User Info */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right">
                <p
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--color-ink)', letterSpacing: '-0.01em' }}
                >
                  {user.name}
                </p>
                <div className="mt-0.5 flex justify-end">
                  <Badge tone={roleTone(user.role)} variant="soft" size="sm">
                    {roleLabel(user.role)}
                  </Badge>
                </div>
              </div>
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0"
                style={{
                  background: 'var(--color-accent)',
                  color: '#fff',
                  boxShadow: '0 0 0 2px var(--color-gold-soft)',
                }}
              >
                {user.name[0]}
              </div>
            </div>
          )}
        </header>

        {/* Page Content */}
        <main id="admin-main" tabIndex={-1} className="flex-1 p-3 sm:p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
