'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PushNotificationManager from '@/components/PushNotificationManager';
import { Card, Pill, Badge, Stat, SectionHeader, Button, Input, Divider } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { hapticLight, hapticMedium, hapticSelection } from '@/lib/haptics';
import { toRenderableImageSrc } from '@/lib/imageUrl';

export default function ParentPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('notice');
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [showCounselForm, setShowCounselForm] = useState(false);
  const [counselType, setCounselType] = useState('PHONE');
  const [counselDesc, setCounselDesc] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [waStats, setWaStats] = useState<any>(null);
  const [expandedWA, setExpandedWA] = useState<Set<string>>(new Set());
  const [showAnswer, setShowAnswer] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 영구 로그인: localStorage에서 토큰 복원
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
    if (savedToken) {
      const hasAuthCookie = document.cookie.includes('auth-token-js=');
      if (!hasAuthCookie) {
        document.cookie = `auth-token-js=${savedToken}; path=/; max-age=${365*24*60*60}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
      }
    }
    fetch('/api/parent/data')
      .then(r => { if (!r.ok) { router.push('/auth/login'); return null; } return r.json(); })
      .then(d => {
        if (d) {
          setData(d);
          if (d.students?.[0]) { fetchMemos(d.students[0].id); }
          if (d.wrongAnswers) {
            const list = Array.isArray(d.wrongAnswers) ? d.wrongAnswers : [];
            setWrongAnswers(list);
            const active = list.filter((wa: any) => wa.status === 'ACTIVE').length;
            const mastered = list.filter((wa: any) => wa.status === 'MASTERED').length;
            setWaStats({ active, mastered, total: list.length, rate: list.length > 0 ? Math.round(mastered / list.length * 100) : 0 });
          } else if (d.students?.[0]) {
            fetchWrongAnswers(d.students[0].id);
          }
          const tokenMatch = document.cookie.match(/auth-token-js=([^;]+)/);
          if (tokenMatch && typeof window !== 'undefined') {
            localStorage.setItem('auth-token', tokenMatch[1]);
          }
        }
      })
      .catch(() => router.push('/auth/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fetchMemos = (sid: string) => {
    fetch('/api/parent/memo?studentId=' + sid).then(r => r.json()).then(setMemos).catch(() => {});
  };

  const fetchWrongAnswers = (sid: string) => {
    fetch(`/api/wrong-answers?studentId=${sid}`).then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : [];
      setWrongAnswers(list);
      const active = list.filter((wa: any) => wa.status === 'ACTIVE').length;
      const mastered = list.filter((wa: any) => wa.status === 'MASTERED').length;
      setWaStats({ active, mastered, total: list.length, rate: list.length > 0 ? Math.round(mastered / list.length * 100) : 0 });
    }).catch(() => {});
  };

  const sendMemo = async () => {
    if (!newMemo.trim() || !data?.students?.[0]) return;
    await fetch('/api/parent/memo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: data.students[0].id, content: newMemo })
    });
    setNewMemo('');
    fetchMemos(data.students[0].id);
  };

  const submitCounsel = async () => {
    if (!data?.students?.[0]) return;
    await fetch('/api/counseling', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: data.students[0].id,
        title: counselType === 'PHONE' ? '전화상담 요청' : '방문상담 요청',
        description: counselDesc,
        counselingType: counselType
      })
    });
    alert('상담 요청이 접수되었습니다.');
    setShowCounselForm(false);
    setCounselDesc('');
  };

  const handleLogout = async () => {
    if (typeof window !== 'undefined') localStorage.removeItem('auth-token');
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  };

  const parseContent = (content: string) => {
    if (!content || !content.trim()) return '';
    try {
      let parsed = content;
      while (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('"'))) {
        const obj = JSON.parse(parsed);
        if (typeof obj === 'string') {
          parsed = obj;
        } else if (typeof obj === 'object' && obj !== null) {
          if (obj.progressNote && obj.progressNote.trim()) return obj.progressNote.trim();
          if (obj.studentProgress && obj.studentProgress.trim()) return obj.studentProgress.trim();
          if (obj.content && typeof obj.content === 'string' && obj.content.trim()) {
            parsed = obj.content;
            continue;
          }
          const allEmpty = Object.values(obj).every(v => !v || (typeof v === 'string' && !v.trim()));
          if (allEmpty) return '';
          return '';
        } else {
          return String(obj);
        }
      }
      return parsed?.trim() || '';
    } catch {
      return content.trim() || '';
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="flex flex-col items-center gap-4">
        <div style={{
          width: 36, height: 36,
          border: '2.5px solid var(--color-border)',
          borderTopColor: 'var(--color-accent)',
          borderRadius: '50%',
          animation: 'spin 0.9s linear infinite'
        }} />
        <p className="text-caption">불러오는 중</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (!data) return null;
  const s = data.students?.[0];

  const tabs = [
    { id: 'notice',       label: '공지' },
    { id: 'grades',       label: '성적' },
    { id: 'assignment',   label: '과제' },
    { id: 'wrongAnswers', label: '오답' },
    { id: 'homework',     label: '숙제' },
    { id: 'video',        label: '수업영상' },
    { id: 'counsel',      label: '상담' },
  ];

  // 과제완성도 데이터 파싱 (attitude 필드: "GRADE::MEMO" 형식)
  const parseAttitude = (attitude: string) => {
    if (!attitude || !attitude.trim()) return { grade: '', memo: '' };
    const parts = attitude.split('::');
    return { grade: parts[0]?.trim() || '', memo: parts[1]?.trim() || '' };
  };

  const getGradeTone = (grade: string): { tone: 'success' | 'accent' | 'warn' | 'danger' | 'neutral'; label: string } => {
    switch (grade) {
      case 'A': return { tone: 'success', label: '완벽' };
      case 'B': return { tone: 'accent',  label: '잘함' };
      case 'C': return { tone: 'warn',    label: '보통' };
      case 'D': return { tone: 'warn',    label: '미흡' };
      case 'X': return { tone: 'danger',  label: '미제출' };
      default:  return { tone: 'neutral', label: '' };
    }
  };

  // Chart rendering function — navy/gold 라인
  const renderGradeChart = () => {
    if (!data.grades || data.grades.length < 2) return null;
    const chartData = [...data.grades].reverse();
    const W = 600, H = 280;
    const padL = 45, padR = 20, padT = 30, padB = 65;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const yMax = 100;
    const getX = (i: number) => padL + (chartData.length === 1 ? chartW / 2 : (i / (chartData.length - 1)) * chartW);
    const getY = (val: number) => padT + chartH - (val / yMax) * chartH;
    const scoreLine = chartData.map((g: any, i: number) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(g.maxScore > 0 ? g.score / g.maxScore * 100 : g.score)}`).join(' ');
    const avgLine = chartData.filter((g: any) => g.classAverage != null).map((g: any, i: number) => `${i === 0 ? 'M' : 'L'}${getX(chartData.indexOf(g))},${getY(g.classAverage)}`).join(' ');
    return (
      <Card padding="sm" elevation="sh1" className="mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-h3">성적 추이</p>
          <div className="flex items-center gap-4 text-caption">
            <span className="flex items-center gap-1.5">
              <span style={{ width: 16, height: 3, background: 'var(--color-accent)', borderRadius: 2, display: 'inline-block' }} />
              내 점수
            </span>
            <span className="flex items-center gap-1.5">
              <span style={{ width: 16, height: 0, borderTop: '2px dashed var(--color-gold)', display: 'inline-block' }} />
              반 평균
            </span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[0, 25, 50, 75, 100].map(pct => {
            const y = getY(yMax * pct / 100);
            return (
              <g key={pct}>
                <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--color-border)" strokeWidth="1" />
                <text x={padL - 8} y={y + 4} textAnchor="end" fill="var(--color-mute-2)" fontSize="11">{Math.round(yMax * pct / 100)}%</text>
              </g>
            );
          })}
          {avgLine && <path d={avgLine} fill="none" stroke="var(--color-gold)" strokeWidth="2" strokeDasharray="6,3" opacity="0.8" />}
          <path d={scoreLine} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" />
          {chartData.map((g: any, i: number) => (
            <g key={i}>
              <circle cx={getX(i)} cy={getY(g.maxScore > 0 ? g.score / g.maxScore * 100 : g.score)} r="4" fill="var(--color-accent)" />
              {g.classAverage != null && <circle cx={getX(i)} cy={getY(g.classAverage)} r="3" fill="var(--color-gold)" opacity="0.85" />}
              <text x={getX(i)} y={H - padB + 16} textAnchor="middle" fill="var(--color-mute)" fontSize="9" transform={`rotate(-35,${getX(i)},${H - padB + 16})`}>
                {(() => { const maxLen = chartData.length > 10 ? 4 : chartData.length > 6 ? 6 : 8; return g.testName?.length > maxLen ? g.testName.substring(0, maxLen) + '…' : g.testName; })()}
              </text>
              <text x={getX(i)} y={getY(g.maxScore > 0 ? g.score / g.maxScore * 100 : g.score) - 8} textAnchor="middle" fill="var(--color-accent)" fontSize="10" fontWeight="600">{g.maxScore > 0 ? Math.round(g.score / g.maxScore * 100) : g.score}%</text>
            </g>
          ))}
        </svg>
      </Card>
    );
  };

  // 학부모/학생 표시 정리
  const userRoleLabel = data.user.role === 'PARENT' ? '학부모' : '학생';
  const userDisplayName = data.user.name.replace(/\s*학부모\s*$/, '');

  // 히어로 아바타 (학생 이니셜)
  const avatarSize = 76;
  const studentInitial = s?.name ? s.name.trim().charAt(0) : '';

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(250,250,247,0.82)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="max-w-lg mx-auto px-5 h-14 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center w-7 h-7"
              style={{
                background: 'var(--color-accent)',
                color: '#fff',
                borderRadius: 'var(--radius-btn)',
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '-0.02em',
              }}
            >
              수
            </span>
            <h1 className="text-h3" style={{ fontWeight: 700, color: 'var(--color-ink)' }}>수학탐구</h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="neutral" variant="soft" size="sm">
              {userDisplayName} · {userRoleLabel}
            </Badge>
            <button
              onClick={handleLogout}
              className="text-caption hover:text-ink transition-colors px-2 py-1"
              style={{ fontSize: 12 }}
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      {s && (
        <div className="max-w-lg mx-auto px-5 pt-5">
          <div
            className="relative overflow-hidden anim-fade-in"
            style={{
              background: 'linear-gradient(135deg, #1F3A5F 0%, #2D5480 55%, #3B5F87 100%)',
              borderRadius: 'var(--radius-hero)',
              padding: '22px 22px 20px',
              color: '#fff',
              boxShadow: 'var(--shadow-sh2)',
            }}
          >
            {/* 장식 라인 (골드) */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: 0, right: 0, bottom: 0,
                width: 2,
                background: 'linear-gradient(180deg, rgba(169,139,104,0) 0%, rgba(169,139,104,0.85) 50%, rgba(169,139,104,0) 100%)',
              }}
            />
            <div className="flex items-center gap-4">
              {/* 학생 이니셜 아바타 */}
              <div
                className="relative shrink-0 flex items-center justify-center"
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 100%)',
                  border: '1.5px solid rgba(169,139,104,0.75)',
                  boxShadow: 'inset 0 0 0 4px rgba(255,255,255,0.05)',
                }}
              >
                <span
                  className="num-tabular"
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: 'var(--color-gold-soft)',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}
                >
                  {studentInitial}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-eyebrow"
                  style={{ color: 'rgba(243,234,217,0.85)', marginBottom: 4 }}
                >
                  MY STUDENT
                </p>
                <p
                  className="text-h1 truncate"
                  style={{ color: '#fff', fontSize: 24, lineHeight: 1.2, fontWeight: 700 }}
                >
                  {s.name}
                </p>
                <p
                  className="mt-1"
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}
                >
                  {s.school || ''}{s.school && s.grade ? ' · ' : ''}{s.grade ? `${s.grade}학년` : ''}
                </p>
              </div>
            </div>

            {/* Hero KPI 푸터 */}
            {waStats && (
              <div
                className="mt-5 grid grid-cols-3 gap-3 pt-4"
                style={{ borderTop: '1px solid rgba(255,255,255,0.14)' }}
              >
                <div>
                  <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>미해결</p>
                  <p className="num-tabular" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{waStats.active}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>해결</p>
                  <p className="num-tabular" style={{ fontSize: 18, fontWeight: 700, marginTop: 2, color: 'var(--color-gold-soft)' }}>{waStats.mastered}</p>
                </div>
                <div>
                  <p style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.65)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>전체</p>
                  <p className="num-tabular" style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{waStats.total}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pill Tabs — 2행 × 4열 그리드 (전체 한눈에) */}
      <div className="max-w-lg mx-auto px-5 pt-5 pb-1">
        <div className="grid grid-cols-4 gap-1.5">
          {tabs.map(t => (
            <Pill
              key={t.id}
              active={tab === t.id}
              onClick={() => setTab(t.id)}
              className="w-full justify-center px-2"
            >
              {t.label}
            </Pill>
          ))}
        </div>
      </div>

      <div key={tab} className="max-w-lg mx-auto px-5 py-4 pb-10 space-y-4 anim-tab-in">

        {/* 숙제 */}
        {tab === 'homework' && (
          <>
            <SectionHeader eyebrow="HOMEWORK" title="숙제" />
            {data.dailyReports.filter((r: any) => r.homework).length === 0 ? (
              <EmptyState
                size="sm"
                icon="📚"
                title="숙제가 없습니다"
                description="선생님이 숙제를 등록하면 이곳에 표시됩니다."
                asCard
              />
            ) : (
              <div className="space-y-3">
                {data.dailyReports.filter((r: any) => r.homework).map((r: any) => (
                  <Card key={r.id} padding="sm" elevation="sh1">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <Badge tone="warn" variant="soft" size="sm" dot>{r.classroom?.subject?.name}</Badge>
                      </div>
                      <span className="text-caption num-tabular">{r.date}</span>
                    </div>
                    <div
                      className="px-3 py-2.5"
                      style={{ background: 'var(--color-warn-bg)', borderRadius: 'var(--radius-btn)' }}
                    >
                      <p className="text-body whitespace-pre-wrap" style={{ color: 'var(--color-ink-2)' }}>{r.homework}</p>
                    </div>
                    {r.content && parseContent(r.content) && (
                      <div className="mt-2 px-3 py-2.5" style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-btn)' }}>
                        <p className="text-eyebrow" style={{ color: 'var(--color-accent)', marginBottom: 4 }}>수업 진도</p>
                        <p className="text-body" style={{ color: 'var(--color-ink-2)', fontSize: 14 }}>{parseContent(r.content)}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* 공지 */}
        {tab === 'notice' && (() => {
          const isParent = data.user.role === 'PARENT';
          const extractPersonalNote = (content: string | null | undefined): string => {
            if (!content) return '';
            try {
              const p = JSON.parse(content);
              if (p && typeof p === 'object' && p.personalNote) return String(p.personalNote);
            } catch {}
            return '';
          };
          const items = data.dailyReports.filter((r: any) => {
            const hasNotice = !!r.specialNote;
            const hasPersonal = isParent && !!extractPersonalNote(r.content);
            return hasNotice || hasPersonal;
          });
          return (
            <>
              <SectionHeader eyebrow="NOTICE" title="공지" />
              {items.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon="📢"
                  title="공지가 없습니다"
                  description="선생님이 공지를 올리면 이곳에서 바로 확인하실 수 있습니다."
                  asCard
                />
              ) : (
                <div className="space-y-3">
                  {items.map((r: any) => {
                    const personalNote = isParent ? extractPersonalNote(r.content) : '';
                    return (
                      <Card key={r.id} padding="sm" elevation="sh1">
                        <div className="flex justify-between items-center mb-2">
                          <Badge tone="danger" variant="soft" size="sm" dot>{r.classroom?.subject?.name}</Badge>
                          <span className="text-caption num-tabular">{r.date}</span>
                        </div>
                        {r.specialNote && (
                          <div className="px-3 py-2.5" style={{ background: 'var(--color-danger-bg)', borderRadius: 'var(--radius-btn)' }}>
                            <p className="text-eyebrow" style={{ color: 'var(--color-danger)', marginBottom: 4 }}>공지사항</p>
                            <p className="text-body whitespace-pre-wrap" style={{ color: 'var(--color-ink-2)' }}>{r.specialNote}</p>
                          </div>
                        )}
                        {personalNote && (
                          <div className="mt-2 px-3 py-2.5" style={{ background: 'var(--color-gold-soft)', borderRadius: 'var(--radius-btn)' }}>
                            <p className="text-eyebrow" style={{ color: 'var(--color-gold)', marginBottom: 4 }}>전달사항</p>
                            <p className="text-body whitespace-pre-wrap" style={{ color: 'var(--color-ink-2)' }}>{personalNote}</p>
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}

        {/* 성적 */}
        {tab === 'grades' && (
          <>
            <SectionHeader eyebrow="GRADES" title="성적" />
            {renderGradeChart()}
            {data.grades.length === 0 ? (
              <EmptyState
                size="sm"
                icon="📊"
                title="성적 기록이 없습니다"
                description="수업 리포트에 점수가 입력되면 자동으로 쌓입니다."
                asCard
              />
            ) : (
              <div className="space-y-2">
                {data.grades.map((g: any) => {
                  const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : 0;
                  const barColor = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-accent)' : pct >= 40 ? 'var(--color-warn)' : 'var(--color-danger)';
                  return (
                    <Card key={g.id} padding="sm" elevation="sh1">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-h3" style={{ fontSize: 15, fontWeight: 600 }}>{g.testName}</p>
                          <p className="text-caption num-tabular mt-0.5">{g.testDate}</p>
                        </div>
                        <p className="num-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-accent)', letterSpacing: '-0.02em' }}>
                          {g.score}
                          <span style={{ fontSize: 13, color: 'var(--color-mute)', fontWeight: 500 }}>/{g.maxScore}</span>
                        </p>
                      </div>
                      <div style={{ width: '100%', height: 6, background: 'var(--color-surface-2)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: pct + '%',
                          background: barColor,
                          borderRadius: 999,
                          transition: 'width 500ms cubic-bezier(.2,.7,.2,1)',
                        }} />
                      </div>
                      {(g.avgRaw != null || g.highScore != null || g.lowScore != null) && (
                        <div className="flex gap-3 mt-2.5">
                          {g.avgRaw != null && <span className="text-caption num-tabular" style={{ color: 'var(--color-gold)', fontWeight: 600 }}>평균 {g.avgRaw}점</span>}
                          {g.highScore != null && <span className="text-caption num-tabular" style={{ color: 'var(--color-success)', fontWeight: 600 }}>최고 {g.highScore}점</span>}
                          {g.lowScore != null && <span className="text-caption num-tabular" style={{ color: 'var(--color-danger)', fontWeight: 600 }}>최저 {g.lowScore}점</span>}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 과제 완성도 */}
        {tab === 'assignment' && (
          <>
            <SectionHeader eyebrow="ASSIGNMENT" title="과제 완성도" />
            {data.dailyReports.filter((r: any) => {
              const att = parseAttitude(r.attitude || '');
              return att.grade !== '';
            }).length === 0 ? (
              <EmptyState
                size="sm"
                icon="✅"
                title="과제 완성도 기록이 없습니다"
                description="선생님이 과제를 평가하면 이곳에 결과가 모입니다."
                asCard
              />
            ) : (
              <div className="space-y-3">
                {data.dailyReports.filter((r: any) => {
                  const att = parseAttitude(r.attitude || '');
                  return att.grade !== '';
                }).map((r: any) => {
                  const att = parseAttitude(r.attitude || '');
                  const gt = getGradeTone(att.grade);
                  return (
                    <Card key={r.id + '-assign'} padding="sm" elevation="sh1">
                      <div className="flex justify-between items-center mb-3">
                        <Badge tone={gt.tone} variant="soft" size="sm" dot>{r.classroom?.subject?.name}</Badge>
                        <span className="text-caption num-tabular">{r.date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div
                          className="shrink-0 flex flex-col items-center justify-center"
                          style={{
                            width: 56, height: 56,
                            background: `var(--color-${gt.tone === 'neutral' ? 'surface-2' : gt.tone + '-bg'})`,
                            border: `1.5px solid var(--color-${gt.tone === 'neutral' ? 'border' : gt.tone})`,
                            borderRadius: 'var(--radius-btn)',
                          }}
                        >
                          <span
                            className="num-tabular"
                            style={{ fontSize: 22, fontWeight: 700, color: `var(--color-${gt.tone === 'neutral' ? 'mute' : gt.tone})`, lineHeight: 1 }}
                          >
                            {att.grade}
                          </span>
                          <span
                            style={{ fontSize: 9.5, fontWeight: 600, color: `var(--color-${gt.tone === 'neutral' ? 'mute' : gt.tone})`, marginTop: 3, letterSpacing: '0.02em' }}
                          >
                            {gt.label}
                          </span>
                        </div>
                        {att.memo ? (
                          <div className="flex-1 px-3 py-2.5" style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-btn)' }}>
                            <p className="text-eyebrow" style={{ color: 'var(--color-mute)', marginBottom: 3 }}>선생님 메모</p>
                            <p className="text-body" style={{ fontSize: 14, color: 'var(--color-ink-2)' }}>{att.memo}</p>
                          </div>
                        ) : (
                          <div className="flex-1">
                            <p className="text-caption">메모 없음</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 수업영상 */}
        {tab === 'video' && (
          <>
            <SectionHeader eyebrow="VIDEO" title="수업 영상" />
            {!data.videos || data.videos.length === 0 ? (
              <EmptyState
                size="sm"
                icon="🎬"
                title="등록된 수업영상이 없습니다"
                description="선생님이 수업 영상을 등록하면 이곳에서 재생할 수 있습니다."
                asCard
              />
            ) : (
              <div className="space-y-3">
                {data.videos.map((v: any) => {
                  const getYtId = (url: string) => { try { const u = new URL(url); if (u.hostname === 'youtu.be') return u.pathname.slice(1); return u.searchParams.get('v') || ''; } catch { return ''; } };
                  const ytId = getYtId(v.videoUrl || '');
                  return (
                    <a
                      key={v.id}
                      href={v.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onPointerDown={() => hapticLight()}
                      className="block overflow-hidden press press-subtle"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-card)',
                        boxShadow: 'var(--shadow-sh1)',
                        textDecoration: 'none',
                      }}
                    >
                      {ytId && (
                        <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000' }}>
                          <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{
                            position: 'absolute', top: '50%', left: '50%',
                            transform: 'translate(-50%,-50%)',
                            width: 48, height: 48,
                            background: 'rgba(14,14,12,0.75)',
                            borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{ width: 0, height: 0, borderTop: '10px solid transparent', borderBottom: '10px solid transparent', borderLeft: '18px solid white', marginLeft: 4 }} />
                          </div>
                        </div>
                      )}
                      <div className="px-4 py-3">
                        <p className="text-h3" style={{ fontSize: 14, fontWeight: 600 }}>{v.title}</p>
                        <div className="flex items-center gap-2 mt-1 text-caption num-tabular">
                          <span>{v.date}</span>
                          <span style={{ color: 'var(--color-border-2)' }}>·</span>
                          <span>{v.classroom?.subject?.name || v.classroom?.name || ''}</span>
                          {v.duration && (
                            <>
                              <span style={{ color: 'var(--color-border-2)' }}>·</span>
                              <span>{v.duration}</span>
                            </>
                          )}
                        </div>
                        {v.description && (
                          <p className="mt-1.5 line-clamp-2" style={{ fontSize: 12.5, color: 'var(--color-mute)' }}>{v.description}</p>
                        )}
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* 상담 (상담 요청 + 메모 통합) */}
        {tab === 'counsel' && (
          <>
            <SectionHeader eyebrow="COUNSELING" title="상담 요청" />
            {!showCounselForm ? (
              <div className="space-y-3">
                <Card
                  interactive
                  haptic="light"
                  elevation="sh1"
                  padding="none"
                  onClick={() => { setCounselType('PHONE'); setShowCounselForm(true); }}
                  className="w-full text-left"
                  style={{ padding: '18px 20px' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="shrink-0"
                      style={{
                        width: 44, height: 44,
                        background: 'var(--color-info-bg)',
                        color: 'var(--color-accent)',
                        borderRadius: 'var(--radius-btn)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                      }}
                    >
                      ☏
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-h3" style={{ fontSize: 15 }}>전화 상담 요청</p>
                      <p className="text-caption mt-0.5">선생님이 전화를 드립니다</p>
                    </div>
                    <span
                      className="shrink-0"
                      style={{ color: 'var(--color-mute)', fontSize: 16, lineHeight: 1 }}
                      aria-hidden
                    >
                      ›
                    </span>
                  </div>
                </Card>
                <Card
                  interactive
                  haptic="light"
                  elevation="sh1"
                  padding="none"
                  onClick={() => { setCounselType('VISIT'); setShowCounselForm(true); }}
                  className="w-full text-left"
                  style={{ padding: '18px 20px' }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="shrink-0"
                      style={{
                        width: 44, height: 44,
                        background: 'var(--color-gold-soft)',
                        color: 'var(--color-gold)',
                        borderRadius: 'var(--radius-btn)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                      }}
                    >
                      ⌂
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-h3" style={{ fontSize: 15 }}>방문 상담 요청</p>
                      <p className="text-caption mt-0.5">학원에 방문하여 상담</p>
                    </div>
                    <span
                      className="shrink-0"
                      style={{ color: 'var(--color-mute)', fontSize: 16, lineHeight: 1 }}
                      aria-hidden
                    >
                      ›
                    </span>
                  </div>
                </Card>
              </div>
            ) : (
              <Card padding="md" elevation="sh1">
                <div className="flex items-center gap-2 mb-4">
                  <Badge tone="accent" variant="soft" size="md">
                    {counselType === 'PHONE' ? '전화' : '방문'} 상담 요청
                  </Badge>
                </div>
                <textarea
                  value={counselDesc}
                  onChange={e => setCounselDesc(e.target.value)}
                  placeholder="상담 내용을 입력해주세요"
                  rows={4}
                  className="w-full text-body resize-none transition-all outline-none"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-btn)',
                    padding: '12px 14px',
                    color: 'var(--color-ink)',
                  }}
                />
                <div className="flex gap-2 mt-4">
                  <Button variant="ghost" className="flex-1" onClick={() => setShowCounselForm(false)}>
                    취소
                  </Button>
                  <Button variant="primary" className="flex-1" onClick={submitCounsel}>
                    요청하기
                  </Button>
                </div>
              </Card>
            )}

            {/* 구분선 */}
            <div className="pt-2" />
            <Divider />

            {/* 메모 섹션 (상담 탭 하단) */}
            <SectionHeader eyebrow="MEMO" title="선생님과 메모" />
            <div
              className="px-4 py-3"
              style={{
                background: 'var(--color-info-bg)',
                border: '1px solid var(--color-info-bg)',
                borderRadius: 'var(--radius-btn)',
                color: 'var(--color-accent)',
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            >
              선생님께 간단히 전달하실 말씀을 입력해주시면, 확인 후 답장 드리겠습니다.
            </div>
            <Card padding="sm" className="max-h-96 overflow-y-auto space-y-3">
              {memos.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon="💬"
                  title="메모가 없습니다"
                  description="아래 입력창에 메시지를 남기면 선생님께 바로 전달됩니다."
                />
              ) : (
                memos.map((m: any) => (
                  <div
                    key={m.id}
                    className={'max-w-[85%] px-4 py-2.5 ' + (m.isFromParent ? 'ml-auto text-white' : 'mr-auto')}
                    style={{
                      background: m.isFromParent ? 'var(--color-accent)' : 'var(--color-surface-2)',
                      color: m.isFromParent ? '#fff' : 'var(--color-ink-2)',
                      borderRadius: m.isFromParent
                        ? '18px 18px 4px 18px'
                        : '18px 18px 18px 4px',
                    }}
                  >
                    <p style={{ fontSize: 14, lineHeight: 1.55 }}>{m.content}</p>
                    <p
                      className="mt-1.5"
                      style={{
                        fontSize: 10.5,
                        color: m.isFromParent ? 'rgba(255,255,255,0.7)' : 'var(--color-mute)',
                        letterSpacing: '0.02em',
                      }}
                    >
                      {m.author?.name}
                    </p>
                  </div>
                ))
              )}
            </Card>
            <div className="flex gap-2">
              <Input
                value={newMemo}
                onChange={e => setNewMemo(e.target.value)}
                placeholder="메모를 입력하세요..."
                onKeyDown={e => e.key === 'Enter' && sendMemo()}
                className="flex-1"
              />
              <Button variant="primary" disabled={!newMemo.trim()} onClick={sendMemo}>
                전송
              </Button>
            </div>
          </>
        )}

        {/* 오답목록 */}
        {tab === 'wrongAnswers' && (
          <>
            <SectionHeader eyebrow="WRONG ANSWERS" title="오답 목록" />
            {waStats && (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="미해결" value={waStats.active} unit="문항" />
                <Stat label="해결" value={waStats.mastered} unit="문항" />
              </div>
            )}

            {/* 연습테스트 생성 */}
            {waStats && waStats.active > 0 && (
              <Card padding="sm" style={{ background: 'var(--color-surface-2)' }} borderless>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="text-eyebrow" style={{ color: 'var(--color-accent)' }}>PRACTICE TEST</p>
                    <p className="text-body" style={{ fontSize: 13, color: 'var(--color-ink-2)', marginTop: 2 }}>연습용 시험지를 생성합니다</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[5, 10, waStats.active].filter((n: number, i: number, arr: number[]) => n <= waStats.active && arr.indexOf(n) === i).map((cnt: number) => (
                      <Button
                        key={cnt}
                        variant="secondary"
                        size="sm"
                        haptic="medium"
                        onClick={async () => {
                          try {
                            const sid = data.students[0].id;
                            const classroomId = wrongAnswers.find((wa: any) => wa.status === 'ACTIVE')?.classroomId;
                            if (!classroomId) return;
                            const res = await fetch('/api/wrong-answers/tests', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ studentId: sid, classroomId, maxCount: cnt, isParentTest: true }),
                            });
                            if (!res.ok) throw new Error('생성 실패');
                            const test = await res.json();
                            const shuffled = test.items.sort(() => Math.random() - 0.5);
                            const problems = shuffled.map((item: any, idx: number) => {
                              const wa = item.wrongAnswer;
                              let imgUrl = '';
                              if (wa.testPaper?.pages) {
                                const page = wa.testPaper.pages.find((p: any) => p.pageNumber === wa.problemNumber);
                                if (page) imgUrl = page.imageUrl;
                              }
                              if (!imgUrl && wa.problemImage) imgUrl = wa.problemImage;
                              return { num: idx + 1, originalNum: wa.problemNumber, testName: wa.testName, imgUrl };
                            });
                            const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
                            const origin = typeof window !== 'undefined' ? window.location.origin : '';
                            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${origin}/"><title>연습 테스트 - ${s?.name}</title>
<style>@page{size:A4;margin:12mm 10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Pretendard Variable','Malgun Gothic',sans-serif;color:#0E0E0C;background:#fff;padding:10px}.header{text-align:center;border-bottom:1.5px solid #1F3A5F;padding-bottom:10px;margin-bottom:14px}.header h1{font-size:20px;margin-bottom:4px;letter-spacing:-0.02em}.info-row{display:flex;justify-content:center;gap:16px;font-size:12px;color:#6B6A63}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.row-gap{margin-top:20px}.problem{border:1px solid #E8E6DF;border-radius:10px;overflow:hidden;page-break-inside:avoid;display:flex;flex-direction:column;min-height:280px}.problem-header{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#F4F3EE;border-bottom:1px solid #E8E6DF;font-size:12px}.problem-header .num{font-weight:700;font-size:16px;color:#1F3A5F}.problem-header .source{color:#9A998F;font-size:10px}.problem-body{padding:8px;text-align:center;flex:1;display:flex;align-items:center;justify-content:center}.problem-body img{max-width:100%;max-height:220px;object-fit:contain}.problem-body .no-img{color:#D8D5CB;padding:20px;font-size:11px}.answer-area{border-top:1px dashed #D8D5CB;padding:6px 10px;min-height:55px}.answer-area span{font-size:11px;color:#9A998F}.page-break{page-break-after:always}.footer{margin-top:16px;text-align:center;font-size:10px;color:#9A998F}.btn-bar{display:flex;gap:10px;justify-content:center;margin-bottom:12px}.btn-bar button{padding:10px 28px;font-size:14px;border:none;border-radius:10px;cursor:pointer;font-weight:600;letter-spacing:-0.01em}.btn-pdf{background:#1F3A5F;color:#fff}.btn-back{background:#6B6A63;color:#fff}@media print{.no-print{display:none!important}body{padding:0}}</style></head><body>
<div class="no-print btn-bar"><button class="btn-back" onclick="window.close()">← 뒤로가기</button><button class="btn-pdf" onclick="window.print()">PDF 저장</button></div>
<div class="header"><h1>연습 테스트</h1><div class="info-row"><span><b>이름:</b> ${s?.name}</span><span><b>날짜:</b> ${today}</span><span><b>총 ${problems.length}문항</b></span></div></div>
<div class="grid">${problems.map((p: any, idx: number) => `<div class="problem"><div class="problem-header"><span class="num">${p.num}</span><span class="source">${p.testName} #${p.originalNum}</span></div><div class="problem-body">${p.imgUrl ? `<img src="${toRenderableImageSrc(p.imgUrl)}" />` : '<div class="no-img">문제 이미지 없음</div>'}</div><div class="answer-area"><span>답:</span></div></div>${(idx + 1) % 2 === 0 && idx < problems.length - 1 ? '</div><div class="row-gap"></div><div class="grid">' : ''}`).join('')}</div>
<div class="footer">수학탐구 오답관리 시스템 — 연습용</div></body></html>`;
                            const w = window.open('', '_blank');
                            if (w) { w.document.write(html); w.document.close(); }
                            await fetch(`/api/wrong-answers/tests/${test.id}`, { method: 'DELETE' }).catch(() => {});
                          } catch (e) { alert('테스트 생성에 실패했습니다'); }
                        }}
                        style={{ color: 'var(--color-accent)' }}
                      >
                        {cnt === waStats.active ? `전체 ${cnt}` : `${cnt}문항`}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {wrongAnswers.length === 0 ? (
              <EmptyState
                size="sm"
                icon="📝"
                title="등록된 오답이 없습니다"
                description="시험지가 등록되면 틀린 문제를 모아 연습 시험을 만들 수 있어요."
                asCard
              />
            ) : (
              <div className="space-y-2">
                {Object.entries(
                  wrongAnswers.reduce<Record<string, any[]>>((acc, wa) => {
                    if (!acc[wa.testName]) acc[wa.testName] = [];
                    acc[wa.testName].push(wa);
                    return acc;
                  }, {})
                ).map(([testName, items]) => {
                  const activeCnt = items.filter((i: any) => i.status === 'ACTIVE').length;
                  const masteredCnt = items.filter((i: any) => i.status === 'MASTERED').length;
                  const isOpen = expandedWA.has(testName);
                  return (
                    <Card key={testName} padding="none" elevation="sh1">
                      <button
                        onPointerDown={() => hapticSelection()}
                        onClick={() =>
                          setExpandedWA(prev => {
                            const next = new Set(prev);
                            next.has(testName) ? next.delete(testName) : next.add(testName);
                            return next;
                          })
                        }
                        className="w-full flex items-center justify-between p-4 text-left press press-subtle"
                        style={{ borderRadius: 'var(--radius-card)' }}
                      >
                        <div className="min-w-0">
                          <p className="text-h3" style={{ fontSize: 14.5, fontWeight: 600 }}>{testName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {activeCnt > 0 && <Badge tone="danger" variant="soft" size="sm">미해결 {activeCnt}</Badge>}
                            {masteredCnt > 0 && <Badge tone="success" variant="soft" size="sm">해결 {masteredCnt}</Badge>}
                          </div>
                        </div>
                        <span
                          style={{
                            color: 'var(--color-mute)',
                            fontSize: 12,
                            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform var(--dur-base) var(--ease-apple-inout)',
                            display: 'inline-block',
                          }}
                        >
                          ▼
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 anim-tab-in">
                          <Divider className="mb-3" />
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {items
                              .sort((a: any, b: any) => a.problemNumber - b.problemNumber)
                              .map((wa: any) => (
                                <span
                                  key={wa.id}
                                  className="num-tabular"
                                  style={{
                                    background: wa.status === 'ACTIVE' ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                                    color: wa.status === 'ACTIVE' ? 'var(--color-danger)' : 'var(--color-success)',
                                    fontSize: 11.5,
                                    fontWeight: 600,
                                    padding: '3px 9px',
                                    borderRadius: 'var(--radius-chip)',
                                    letterSpacing: '-0.01em',
                                  }}
                                >
                                  {wa.problemNumber}번{wa.round > 1 ? ` (${wa.round}회)` : ''}
                                </span>
                              ))}
                          </div>
                          {items.some((wa: any) => wa.testPaper?.pages?.length > 0) && (
                            <div className="space-y-3">
                              <p className="text-caption" style={{ color: 'var(--color-mute)', fontWeight: 500 }}>문제를 풀고 정답을 확인하세요</p>
                              {items
                                .filter((wa: any) => wa.status === 'ACTIVE')
                                .sort((a: any, b: any) => a.problemNumber - b.problemNumber)
                                .map((wa: any) => {
                                  const page = wa.testPaper?.pages?.find((p: any) => p.pageNumber === wa.problemNumber);
                                  const imgUrl = page?.imageUrl || wa.problemImage;
                                  const answerImgUrl = page?.answerImageUrl || null;
                                  if (!imgUrl && !answerImgUrl) return null;
                                  const isAnswerShown = showAnswer.has(wa.id);
                                  return (
                                    <div
                                      key={wa.id}
                                      style={{
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-btn)',
                                        overflow: 'hidden',
                                      }}
                                    >
                                      <div
                                        className="px-3 py-2 flex items-center gap-2"
                                        style={{
                                          background: 'var(--color-surface-2)',
                                          borderBottom: '1px solid var(--color-border)',
                                        }}
                                      >
                                        <span
                                          className="num-tabular"
                                          style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-accent)' }}
                                        >
                                          {wa.problemNumber}번
                                        </span>
                                      </div>
                                      {imgUrl && (
                                        <div className="p-2" style={{ background: 'var(--color-surface)' }}>
                                          <img
                                            src={toRenderableImageSrc(imgUrl)}
                                            alt={`문제 ${wa.problemNumber}`}
                                            className="w-full object-contain max-h-72"
                                            style={{ borderRadius: 'var(--radius-chip)' }}
                                          />
                                        </div>
                                      )}
                                      {answerImgUrl ? (
                                        <button
                                          type="button"
                                          onPointerDown={() => hapticSelection()}
                                          onClick={() =>
                                            setShowAnswer(prev => {
                                              const next = new Set(prev);
                                              next.has(wa.id) ? next.delete(wa.id) : next.add(wa.id);
                                              return next;
                                            })
                                          }
                                          className="w-full text-center py-3 press press-subtle"
                                          style={{
                                            minHeight: 44,
                                            background: isAnswerShown ? 'var(--color-surface-2)' : 'var(--color-success-bg)',
                                            borderTop: `1px solid ${isAnswerShown ? 'var(--color-border)' : 'var(--color-success-bg)'}`,
                                            transition: 'background-color var(--dur-base) var(--ease-apple-inout), border-color var(--dur-base) var(--ease-apple-inout)',
                                          }}
                                        >
                                          <span
                                            style={{
                                              fontSize: 13,
                                              fontWeight: 700,
                                              color: isAnswerShown ? 'var(--color-mute)' : 'var(--color-success)',
                                              letterSpacing: '-0.01em',
                                              transition: 'color var(--dur-base) var(--ease-apple-inout)',
                                            }}
                                          >
                                            {isAnswerShown ? '▲ 정답 숨기기' : '▼ 정답 확인'}
                                          </span>
                                        </button>
                                      ) : (
                                        <div
                                          className="w-full text-center py-2"
                                          style={{ borderTop: '1px solid var(--color-border)' }}
                                        >
                                          <span className="text-caption">정답 이미지가 등록되지 않았습니다</span>
                                        </div>
                                      )}
                                      {isAnswerShown && answerImgUrl && (
                                        <div className="p-2 anim-pop-in" style={{ background: 'var(--color-success-bg)', borderTop: '1px solid var(--color-success-bg)' }}>
                                          <img
                                            src={toRenderableImageSrc(answerImgUrl)}
                                            alt={`정답 ${wa.problemNumber}`}
                                            className="w-full object-contain max-h-96"
                                            style={{ borderRadius: 'var(--radius-chip)' }}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}

      </div>
      <PushNotificationManager />
    </div>
  );
}
