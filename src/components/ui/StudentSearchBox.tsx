'use client';

/**
 * StudentSearchBox · 원생 전용 검색창
 *
 * 상단 헤더의 '이동 · 검색' 자리를 대체하는 원생 이름 검색 입력창.
 *  - 입력 시 /api/students?q=… 로 자동완성 드롭다운
 *  - 클릭 또는 Enter 로 /students/{id} 상세 페이지로 이동
 *  - ↑/↓ 키보드 네비게이션 · ESC 로 닫기
 *  - 햅틱 피드백 포함
 *  - 학번/학교/학년 부가 정보 표시
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hapticLight, hapticSelection } from '@/lib/haptics';

type StudentHit = {
  id: string;
  name: string;
  studentNumber: string;
  school: string | null;
  grade: string | null;
  status: string;
  phone: string | null;
  parentPhone: string | null;
};

const statusMap: Record<string, string> = {
  ACTIVE: '재원',
  COMPLETED: '수료',
  WITHDRAWN: '퇴원',
};

const statusTone: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-slate-100 text-slate-700',
  WITHDRAWN: 'bg-rose-100 text-rose-700',
};

export default function StudentSearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StudentHit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* 쿼리 변경 시 디바운스 후 검색 */
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      // 이전 요청 취소
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(
          `/api/students?q=${encodeURIComponent(q)}&limit=10`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error('fail');
        const data = await res.json();
        const list: StudentHit[] = Array.isArray(data?.students) ? data.students : [];
        setResults(list);
        setHighlighted(0);
        setOpen(true);
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          setResults([]);
          setOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  /* 바깥 클릭 시 드롭다운 닫기 */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectStudent = (student: StudentHit) => {
    hapticSelection();
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(`/students/${student.id}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) {
      // 검색어는 있는데 결과가 아직 없을 때 Enter 무시
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = results[highlighted];
      if (target) selectStudent(target);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* 입력창 컨테이너 */}
      <div
        className="h-9 rounded-lg flex items-center gap-2 transition-colors"
        style={{
          background: 'var(--color-surface-2)',
          border: `1px solid ${open ? 'var(--color-accent)' : 'var(--color-border)'}`,
          color: 'var(--color-mute)',
          padding: '0 10px 0 12px',
          minWidth: 200,
        }}
      >
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
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
          onFocus={() => {
            hapticLight();
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="원생 이름 검색"
          aria-label="원생 이름 검색"
          className="bg-transparent outline-none text-[13px] flex-1 min-w-0"
          style={{
            color: 'var(--color-ink)',
            letterSpacing: '-0.01em',
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onPointerDown={() => hapticLight()}
            onClick={() => {
              setQuery('');
              setResults([]);
              setOpen(false);
              inputRef.current?.focus();
            }}
            className="press shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: 'var(--color-border)',
              color: 'var(--color-mute)',
            }}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* 드롭다운 */}
      {open && (
        <div
          className="absolute right-0 mt-1.5 rounded-xl overflow-hidden anim-pop-in"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            boxShadow:
              '0 8px 24px rgba(14,14,12,0.08), 0 2px 6px rgba(14,14,12,0.04)',
            width: 340,
            maxHeight: 420,
            overflowY: 'auto',
            zIndex: 50,
          }}
        >
          {loading && (
            <div
              className="px-4 py-4 text-[12.5px]"
              style={{ color: 'var(--color-mute)' }}
            >
              검색 중…
            </div>
          )}

          {!loading && results.length === 0 && (
            <div
              className="px-4 py-6 text-center text-[12.5px]"
              style={{ color: 'var(--color-mute)' }}
            >
              검색 결과가 없습니다
            </div>
          )}

          {!loading && results.length > 0 && (
            <ul className="py-1">
              {results.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onPointerDown={() => hapticLight()}
                    onMouseEnter={() => setHighlighted(i)}
                    onClick={() => selectStudent(s)}
                    className="press press-subtle w-full text-left flex items-center gap-3 px-3 py-2.5"
                    style={{
                      background:
                        i === highlighted ? 'rgba(31,58,95,0.06)' : 'transparent',
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold shrink-0"
                      style={{
                        background: 'var(--color-accent)',
                        color: '#fff',
                      }}
                    >
                      {s.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-[13px] font-semibold truncate"
                          style={{ color: 'var(--color-ink)', letterSpacing: '-0.01em' }}
                        >
                          {s.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            statusTone[s.status] || 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {statusMap[s.status] || s.status}
                        </span>
                      </div>
                      <div
                        className="text-[11.5px] truncate mt-0.5"
                        style={{ color: 'var(--color-mute)' }}
                      >
                        {s.studentNumber}
                        {s.school ? ` · ${s.school}` : ''}
                        {s.grade ? ` · ${s.grade}` : ''}
                      </div>
                    </div>
                    <svg
                      className="w-4 h-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      style={{ color: 'var(--color-mute-2)' }}
                      aria-hidden="true"
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

          <div
            className="px-3 py-2 text-[10.5px] flex items-center justify-between"
            style={{
              borderTop: '1px solid var(--color-border)',
              background: 'var(--color-surface-2)',
              color: 'var(--color-mute-2)',
            }}
          >
            <span>↑↓ 이동 · Enter 선택 · Esc 닫기</span>
            {!loading && results.length > 0 && (
              <span>{results.length}명</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
