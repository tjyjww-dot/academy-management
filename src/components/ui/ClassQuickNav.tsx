'use client';

/**
 * ClassQuickNav · 반 빠른 이동 드롭다운
 *
 * 관리자 레이아웃 상단 · 원생 검색창 옆에 배치.
 *  - 클릭 시 현재 운영중인 반 목록 드롭다운이 열림
 *  - 행 클릭 → /classes/{id} 로 바로 이동
 *  - ↑/↓ / Enter / Esc 키보드 네비게이션
 *  - 간단한 이름/담당 선생님 검색 입력 지원
 *  - 애플 감성 press + haptic + anim-pop-in
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hapticLight, hapticSelection } from '@/lib/haptics';

type ClassHit = {
  id: string;
  name: string;
  status: string;
  schedule: string | null;
  subject: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null;
  enrollmentCount: number;
};

export default function ClassQuickNav() {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* 최초 열람 시 1회 로드 · 이후 open 될 때마다 새로고침 */
  const loadClasses = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/classes?status=ACTIVE');
      if (!res.ok) throw new Error('fail');
      const data = await res.json();
      const list: ClassHit[] = Array.isArray(data) ? data : [];
      // 가장 많이 등록된 반이 위로 오도록 정렬
      list.sort((a, b) => (b.enrollmentCount || 0) - (a.enrollmentCount || 0));
      setClasses(list);
      setLoaded(true);
    } catch {
      setClasses([]);
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  const toggleOpen = () => {
    const next = !open;
    hapticLight();
    setOpen(next);
    if (next) {
      setHighlighted(0);
      if (!loaded) loadClasses();
      else loadClasses(); // 매번 새로고침 (신설 반 즉시 반영)
      // 검색 입력에 포커스
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  /* 바깥 클릭 시 닫기 */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* 필터링 */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return classes;
    return classes.filter((c) => {
      const pool = [
        c.name,
        c.subject?.name || '',
        c.teacher?.name || '',
        c.schedule || '',
      ]
        .join(' ')
        .toLowerCase();
      return pool.includes(q);
    });
  }, [classes, query]);

  useEffect(() => {
    setHighlighted(0);
  }, [query, open]);

  const selectClass = (cls: ClassHit) => {
    hapticSelection();
    setOpen(false);
    setQuery('');
    router.push(`/classes/${cls.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filtered[highlighted];
      if (target) selectClass(target);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 트리거 버튼 */}
      <button
        type="button"
        aria-label="반 빠른 이동"
        aria-haspopup="listbox"
        aria-expanded={open}
        onPointerDown={() => hapticLight()}
        onClick={toggleOpen}
        className="press press-subtle h-9 rounded-lg flex items-center gap-2 transition-colors"
        style={{
          background: 'var(--color-surface-2)',
          border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`,
          color: 'var(--color-ink-2)',
          padding: '0 10px',
          minWidth: 128,
        }}
      >
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{ color: 'var(--color-mute)' }}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 7h18M3 12h18M3 17h18"
          />
        </svg>
        <span
          className="text-[13px] font-medium flex-1 text-left"
          style={{ letterSpacing: '-0.01em', color: 'var(--color-ink)' }}
        >
          반 이동
        </span>
        <svg
          className="w-3.5 h-3.5 shrink-0 transition-transform"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{
            color: 'var(--color-mute)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 드롭다운 */}
      {open && (
        <div
          className="absolute right-0 mt-1.5 rounded-xl overflow-hidden anim-pop-in"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow:
              '0 8px 24px rgba(14,14,12,0.08), 0 2px 6px rgba(14,14,12,0.04)',
            width: 320,
            maxHeight: 440,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* 검색 입력 */}
          <div
            className="flex items-center gap-2 px-3 h-10 shrink-0"
            style={{ borderBottom: '1px solid var(--color-border)' }}
          >
            <svg
              className="w-4 h-4 shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ color: 'var(--color-mute)' }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z"
              />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="반 이름 · 선생님 검색"
              aria-label="반 이름 검색"
              className="bg-transparent outline-none text-[13px] flex-1 min-w-0"
              style={{ color: 'var(--color-ink)', letterSpacing: '-0.01em' }}
            />
            {query && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onPointerDown={() => hapticLight()}
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="press shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-border)', color: 'var(--color-mute)' }}
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>

          {/* 목록 */}
          <div style={{ overflowY: 'auto' }} role="listbox" aria-label="반 목록">
            {loading && (
              <div
                className="px-4 py-4 text-[12.5px]"
                style={{ color: 'var(--color-mute)' }}
              >
                불러오는 중…
              </div>
            )}

            {!loading && filtered.length === 0 && (
              <div
                className="px-4 py-6 text-center text-[12.5px]"
                style={{ color: 'var(--color-mute)' }}
              >
                {loaded ? '해당 조건의 반이 없습니다' : '반 정보가 없습니다'}
              </div>
            )}

            {!loading && filtered.length > 0 && (
              <ul className="py-1">
                {filtered.map((c, i) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={i === highlighted}
                      onPointerDown={() => hapticLight()}
                      onMouseEnter={() => setHighlighted(i)}
                      onClick={() => selectClass(c)}
                      className="press press-subtle w-full text-left flex items-center gap-3 px-3 py-2.5"
                      style={{
                        background:
                          i === highlighted ? 'rgba(31,58,95,0.06)' : 'transparent',
                      }}
                    >
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={{
                          background: 'var(--color-gold-soft)',
                          color: 'var(--color-accent)',
                        }}
                      >
                        {c.subject?.name?.[0] || c.name[0] || '반'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[13px] font-semibold truncate"
                            style={{
                              color: 'var(--color-ink)',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {c.name}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0"
                            style={{
                              background: 'var(--color-surface-2)',
                              color: 'var(--color-mute)',
                              border: '1px solid var(--color-border)',
                            }}
                          >
                            {c.enrollmentCount}명
                          </span>
                        </div>
                        <div
                          className="text-[11.5px] truncate mt-0.5"
                          style={{ color: 'var(--color-mute)' }}
                        >
                          {c.teacher?.name ? `${c.teacher.name} 선생님` : '담당 미지정'}
                          {c.schedule ? ` · ${c.schedule}` : ''}
                        </div>
                      </div>
                      <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        style={{ color: 'var(--color-mute-2)' }}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 푸터 */}
          <div
            className="px-3 py-2 text-[10.5px] flex items-center justify-between shrink-0"
            style={{
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-mute-2)',
            }}
          >
            <span>↑↓ 이동 · Enter 선택 · Esc 닫기</span>
            {!loading && classes.length > 0 && <span>{classes.length}개 반</span>}
          </div>
        </div>
      )}
    </div>
  );
}
