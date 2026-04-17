'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { Stat } from '@/components/ui/Stat';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { hapticLight, hapticMedium, hapticSelection } from '@/lib/haptics';

interface DashboardStats {
  totalStudents: number;
  totalClassrooms: number;
  todayAttendance: number;
  pendingCounseling: number;
  todayTests: number;
}

interface Announcement {
  id: string;
  title: string;
  content: string;
  targetRole?: string;
  expiryDate?: string | null;
  createdAt: string;
}

interface EntranceTest {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  parentPhone: string;
  testDate: string;
  testTime: string | null;
}

interface TaskRequest {
  id: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  createdByName: string;
  createdAt: string;
}

interface CounselingItem {
  id: string;
  title: string;
  description: string | null;
  counselingType: string;
  status: string;
  preferredDate: string | null;
  sessionDate: string | null;
  sessionNotes: string | null;
  adminNotes: string | null;
  createdAt: string;
  student: { id: string; name: string };
  parent: { name: string } | null;
  createdByName?: string | null;
}

interface ParentMemo {
  id: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  student: { id: string; name: string };
  author: { name: string };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingTests, setUpcomingTests] = useState<EntranceTest[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [pendingCounselingRequests, setPendingCounselingRequests] = useState<any[]>([]);
  const [absentWithoutMemo, setAbsentWithoutMemo] = useState<any[]>([]);
  const [recentAbsentWithMemo, setRecentAbsentWithMemo] = useState<any[]>([]);
  const [absentMemoDraft, setAbsentMemoDraft] = useState<Record<string, string>>({});
  const [recentCounseling, setRecentCounseling] = useState<CounselingItem[]>([]);
  const [userRole, setUserRole] = useState<string>('');
  const [parentMemos, setParentMemos] = useState<ParentMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemo, setSelectedMemo] = useState<ParentMemo | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);
  const [showAnnModal, setShowAnnModal] = useState(false);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [annForm, setAnnForm] = useState({ title: '', content: '', targetRole: 'ALL', expiryDate: '' });

  const openNewAnn = () => {
    setEditingAnn(null);
    setAnnForm({ title: '', content: '', targetRole: 'ALL', expiryDate: '' });
    setShowAnnModal(true);
  };

  const openEditAnn = (a: Announcement) => {
    setEditingAnn(a);
    setAnnForm({
      title: a.title,
      content: a.content,
      targetRole: a.targetRole || 'ALL',
      expiryDate: a.expiryDate || '',
    });
    setShowAnnModal(true);
  };

  const refreshAnnouncements = async () => {
    const res = await fetch('/api/announcements');
    if (res.ok) {
      const data = await res.json();
      setAnnouncements(data || []);
    }
  };

  const saveAnn = async () => {
    if (!annForm.title || !annForm.content) {
      alert('제목과 내용을 입력해주세요.');
      return;
    }
    try {
      const url = editingAnn ? `/api/announcements/${editingAnn.id}` : '/api/announcements';
      const method = editingAnn ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: annForm.title,
          content: annForm.content,
          targetRole: annForm.targetRole,
          expiryDate: annForm.expiryDate || null,
        }),
      });
      if (!res.ok) throw new Error();
      setShowAnnModal(false);
      await refreshAnnouncements();
    } catch {
      alert('저장에 실패했습니다.');
    }
  };

  const deleteAnn = async () => {
    if (!editingAnn) return;
    if (!confirm('이 공지를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/announcements/${editingAnn.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setShowAnnModal(false);
      await refreshAnnouncements();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/dashboard');
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats);
          setAnnouncements(data.announcements || []);
          setRecentCounseling(data.recentCounseling || []);
          setUserRole(data.userRole || '');
          setUpcomingTests(data.upcomingTests || []);
          setTaskRequests(data.taskRequests || []);
          setPendingCounselingRequests(data.pendingCounselingRequests || []);
          setAbsentWithoutMemo(data.absentWithoutMemo || []);
          setRecentAbsentWithMemo(data.recentAbsentWithMemo || []);
          setParentMemos(data.parentMemos || []);
        }
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboard();
  }, []);
  const handleToggleComplete = async (id: string, isCompleted: boolean) => {
    try {
      const res = await fetch(`/api/task-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });
      if (!res.ok) {
        console.error('Toggle failed:', res.status, res.statusText);
        alert('처리에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      // 서버 저장 성공 후에만 UI 업데이트
      if (!isCompleted) {
        // 읽음처리(완료) 시 목록에서 제거
        setTaskRequests(prev => prev.filter(tr => tr.id !== id));
      } else {
        setTaskRequests(prev =>
          prev.map(tr => tr.id === id ? { ...tr, isCompleted: !isCompleted } : tr)
        );
      }
    } catch (err) {
      console.error('Toggle error:', err);
      alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleMarkAsRead = async (memoId: string) => {
    try {
      const res = await fetch(`/api/memos/${memoId}/read`, { method: 'PUT' });
      if (!res.ok) {
        console.error('Mark as read failed:', res.status);
        alert('읽음 처리에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      setParentMemos(prev => prev.filter(m => m.id !== memoId));
    } catch (err) {
      console.error('Mark as read error:', err);
      alert('네트워크 오류가 발생했습니다. 다시 시도해주세요.');
    }
  };

  const handleReply = async () => {
    if (!selectedMemo || !replyContent.trim()) return;
    setReplying(true);
    try {
      const res = await fetch('/api/memos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedMemo.student.id,
          content: replyContent,
          isFromParent: false,
          parentMemoId: selectedMemo.id,
        }),
      });
      if (res.ok) {
        await handleMarkAsRead(selectedMemo.id);
        setSelectedMemo(null);
        setReplyContent('');
      }
    } catch (err) {
      console.error('Reply error:', err);
    } finally {
      setReplying(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    return date.toLocaleDateString('ko-KR');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--color-surface-2)' }}>
        <p className="text-[13px]" style={{ color: 'var(--color-mute)' }}>로딩 중...</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface-2)' }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <SectionHeader
          eyebrow="DASHBOARD"
          title="운영 현황"
          description={`${new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}`}
        />

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <Stat
              label="재적 원생"
              value={stats.totalStudents}
              unit="명"
            />
            <Stat
              label="운영 반"
              value={stats.totalClassrooms}
              unit="개"
            />
            <Stat
              label="오늘 출석"
              value={stats.todayAttendance}
              unit="명"
              hint={stats.totalStudents > 0 ? `${Math.round((stats.todayAttendance / stats.totalStudents) * 100)}%` : undefined}
            />
            <Stat
              label="오늘 테스트"
              value={stats.todayTests}
              unit="건"
            />
          </div>
        )}

        <Card padding="md" className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-eyebrow mb-1">NOTICE</div>
              <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>공지사항</h2>
            </div>
            <button
              type="button"
              onPointerDown={() => hapticMedium()}
              onClick={openNewAnn}
              className="press press-strong w-9 h-9 flex items-center justify-center rounded-full text-[18px] leading-none"
              style={{
                background: 'var(--color-accent)',
                color: '#fff',
                boxShadow: '0 0 0 2px var(--color-gold-soft)',
              }}
              title="새 공지 작성"
            >
              +
            </button>
          </div>
          {announcements.length === 0 ? (
            <EmptyState
              size="sm"
              icon="📢"
              title="등록된 공지가 없습니다"
              description="오른쪽 위 + 버튼으로 새 공지를 작성하세요."
            />
          ) : (
            <div className="space-y-2">
              {announcements.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onPointerDown={() => hapticLight()}
                  onClick={() => openEditAnn(a)}
                  className="press press-subtle w-full text-left rounded-lg px-3 py-2.5"
                  style={{
                    background: 'var(--color-surface-2)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div className="flex justify-between items-start gap-3">
                    <h3 className="text-[14px] font-semibold text-ink truncate" style={{ letterSpacing: '-0.01em' }}>{a.title}</h3>
                    <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--color-mute)' }}>
                      {new Date(a.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-[12.5px] mt-1 line-clamp-2" style={{ color: 'var(--color-mute)' }}>{a.content}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        {showAnnModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">
                {editingAnn ? '공지 수정' : '새 공지 작성'}
              </h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm text-gray-700 mb-1">제목</label>
                  <input
                    type="text"
                    value={annForm.title}
                    onChange={(e) => setAnnForm({ ...annForm, title: e.target.value })}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-700 mb-1">내용</label>
                  <textarea
                    value={annForm.content}
                    onChange={(e) => setAnnForm({ ...annForm, content: e.target.value })}
                    rows={5}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">대상</label>
                    <select
                      value={annForm.targetRole}
                      onChange={(e) => setAnnForm({ ...annForm, targetRole: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                    >
                      <option value="ALL">전체</option>
                      <option value="PARENT">학부모</option>
                      <option value="INSTRUCTOR">강사</option>
                      <option value="DESK">데스크</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">만료일</label>
                    <input
                      type="date"
                      value={annForm.expiryDate}
                      onChange={(e) => setAnnForm({ ...annForm, expiryDate: e.target.value })}
                      className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-between mt-6">
                <div>
                  {editingAnn && (
                    <button
                      type="button"
                      onPointerDown={() => hapticMedium()}
                      onClick={deleteAnn}
                      className="press press-strong min-h-[44px] px-4 py-2 rounded-lg text-[13px] font-semibold"
                      style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onPointerDown={() => hapticLight()}
                    onClick={() => setShowAnnModal(false)}
                    className="press min-h-[44px] px-4 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', border: '1px solid var(--color-border)' }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onPointerDown={() => hapticMedium()}
                    onClick={saveAnn}
                    className="press press-strong min-h-[44px] px-4 py-2 rounded-lg text-[13px] font-semibold"
                    style={{ background: 'var(--color-accent)', color: '#fff' }}
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-col">
        {/* 최근 1주일 상담 내용 (관리자/데스크만) */}
        {(userRole === 'ADMIN' || userRole === 'DESK') && (
          <Card padding="md" className="order-3 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-eyebrow mb-1">COUNSELING · 7 DAYS</div>
                <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>최근 상담 내용</h2>
              </div>
              <Link
                href="/counseling"
                onPointerDown={() => hapticSelection()}
                className="press text-[12px] font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                전체 보기 →
              </Link>
            </div>
            {recentAbsentWithMemo.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="warn" variant="soft" size="sm" dot>결석 메모</Badge>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-mute)' }}>{recentAbsentWithMemo.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {recentAbsentWithMemo.map((ar) => (
                    <div
                      key={ar.id}
                      className="rounded-lg p-3"
                      style={{ background: 'var(--color-warn-bg)', border: '1px solid var(--color-warn-bg)' }}
                    >
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <Badge tone="warn" variant="solid" size="sm">{ar.student?.name}</Badge>
                        <span className="text-[11px]" style={{ color: 'var(--color-mute)' }}>{ar.classroom?.name}</span>
                        <span className="text-[11px]" style={{ color: 'var(--color-mute-2)' }}>{ar.date}</span>
                      </div>
                      <p className="text-[13px] text-ink">{ar.remarks}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {recentCounseling.length === 0 ? (
              <EmptyState
                size="sm"
                icon="💬"
                title="최근 상담이 없습니다"
                description="최근 1주일간 접수된 신규 상담이 없습니다."
              />
            ) : (
              <div className="space-y-1.5">
                {recentCounseling.map((c) => {
                  const statusTone: 'warn' | 'accent' | 'success' | 'neutral' =
                    c.status === 'PENDING' ? 'warn' :
                    c.status === 'CONFIRMED' ? 'accent' :
                    c.status === 'COMPLETED' ? 'success' : 'neutral';
                  const statusLabel =
                    c.status === 'PENDING' ? '대기' :
                    c.status === 'CONFIRMED' ? '확정' :
                    c.status === 'COMPLETED' ? '완료' : '취소';
                  const teacher = (c.student as any)?.enrollments?.[0]?.classroom?.teacher?.name;
                  return (
                    <Link
                      key={c.id}
                      href={`/counseling?id=${c.id}`}
                      onPointerDown={() => hapticLight()}
                      className="press press-subtle block rounded-lg p-3"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <Badge tone={statusTone} variant="soft" size="sm">{statusLabel}</Badge>
                            <Badge tone="accent" variant="soft" size="sm">{c.student.name}</Badge>
                            <span className="text-[11px]" style={{ color: 'var(--color-mute)' }}>
                              {c.counselingType === 'VISIT' ? '방문상담' : '전화상담'}
                            </span>
                            {teacher && <Badge tone="gold" variant="soft" size="sm">{teacher} 선생님</Badge>}
                          </div>
                          <p className="text-[13.5px] font-semibold text-ink truncate" style={{ letterSpacing: '-0.01em' }}>{c.title}</p>
                          {c.description && <p className="text-[12.5px] mt-0.5 line-clamp-1" style={{ color: 'var(--color-mute)' }}>{c.description}</p>}
                          {c.sessionNotes && (
                            <p
                              className="text-[12.5px] rounded-md px-2 py-1 mt-1 line-clamp-2"
                              style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}
                            >
                              {c.sessionNotes}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-2 shrink-0">
                          <p className="text-[11px]" style={{ color: 'var(--color-mute-2)' }}>{new Date(c.createdAt).toLocaleDateString('ko-KR')}</p>
                          {c.parent ? (
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-mute-2)' }}>학부모: {c.parent.name}</p>
                          ) : c.createdByName ? (
                            <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-mute-2)' }}>입력: {c.createdByName}</p>
                          ) : null}
                          {c.preferredDate && <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-accent)' }}>희망: {c.preferredDate}</p>}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        <div className="order-1 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mb-6">
          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-eyebrow mb-1">UPCOMING</div>
                <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>임박한 입학테스트</h2>
              </div>
              <Link
                href="/entrance-test"
                onPointerDown={() => hapticSelection()}
                className="press text-[12px] font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                전체 보기 →
              </Link>
            </div>
            {upcomingTests.length === 0 ? (
              <EmptyState
                size="sm"
                icon="🎯"
                title="예정된 입학테스트가 없습니다"
                description="새 입학테스트는 '입학테스트' 메뉴에서 추가할 수 있어요."
              />
            ) : (
              <div className="space-y-2">
                {upcomingTests.map((test) => (
                  <div
                    key={test.id}
                    className="rounded-lg p-3"
                    style={{
                      background: 'var(--color-surface-2)',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-ink" style={{ letterSpacing: '-0.01em' }}>{test.name}</p>
                        <p className="text-[12px] mt-0.5" style={{ color: 'var(--color-mute)' }}>
                          {test.school || ''} {test.grade || ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[13px] font-semibold" style={{ color: 'var(--color-accent)' }}>{test.testDate}</p>
                        {test.testTime && <p className="text-[11px]" style={{ color: 'var(--color-mute)' }}>{test.testTime}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card padding="md">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-eyebrow mb-1">INBOX</div>
                <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>받은 요청사항</h2>
              </div>
              <Link
                href="/requests"
                onPointerDown={() => hapticSelection()}
                className="press text-[12px] font-semibold"
                style={{ color: 'var(--color-accent)' }}
              >
                전체 보기 →
              </Link>
            </div>

            {parentMemos.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="warn" variant="soft" size="sm" dot>학부모/학생 메모</Badge>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-mute)' }}>{parentMemos.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {parentMemos.map((memo) => (
                    <div
                      key={memo.id}
                      className="press press-subtle rounded-lg p-3 cursor-pointer"
                      style={{ background: 'var(--color-warn-bg)', border: '1px solid var(--color-warn-bg)' }}
                      onPointerDown={() => hapticLight()}
                      onClick={() => setSelectedMemo(memo)}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge tone="warn" variant="solid" size="sm">{memo.student.name}</Badge>
                            <span className="text-[11px]" style={{ color: 'var(--color-mute)' }}>{memo.author.name}</span>
                          </div>
                          <p className="text-[13px] mt-1 line-clamp-2 text-ink">{memo.content}</p>
                        </div>
                        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--color-mute-2)' }}>{formatTime(memo.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingCounselingRequests.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="accent" variant="soft" size="sm" dot>상담 요청</Badge>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-mute)' }}>{pendingCounselingRequests.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {pendingCounselingRequests.map((cr) => (
                    <Link
                      key={cr.id}
                      href={`/counseling?id=${cr.id}`}
                      onPointerDown={() => hapticLight()}
                      className="press press-subtle block rounded-lg p-3"
                      style={{ background: 'var(--color-info-bg)', border: '1px solid var(--color-info-bg)' }}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <Badge tone="warn" variant="soft" size="sm">대기중</Badge>
                            <Badge tone="accent" variant="soft" size="sm">{cr.student?.name}</Badge>
                            <span className="text-[11px]" style={{ color: 'var(--color-mute)' }}>{cr.counselingType === 'VISIT' ? '방문상담' : '전화상담'}</span>
                          </div>
                          <p className="text-[13.5px] font-semibold text-ink truncate" style={{ letterSpacing: '-0.01em' }}>{cr.title}</p>
                          {cr.description && <p className="text-[12.5px] mt-0.5 line-clamp-2" style={{ color: 'var(--color-mute)' }}>{cr.description}</p>}
                          {cr.parent?.name && <p className="text-[11px] mt-1" style={{ color: 'var(--color-mute-2)' }}>학부모: {cr.parent.name}</p>}
                        </div>
                        <span className="text-[11px] whitespace-nowrap" style={{ color: 'var(--color-mute-2)' }}>{new Date(cr.createdAt).toLocaleDateString('ko-KR')}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {absentWithoutMemo.length > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="danger" variant="soft" size="sm" dot>결석 메모 미작성</Badge>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-mute)' }}>{absentWithoutMemo.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {absentWithoutMemo.map((ar) => (
                    <div
                      key={ar.id}
                      className="rounded-lg p-3"
                      style={{ background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-bg)' }}
                    >
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        <Badge tone="danger" variant="solid" size="sm">{ar.student?.name}</Badge>
                        <span className="text-[11px]" style={{ color: 'var(--color-mute)' }}>{ar.classroom?.name}</span>
                        <span className="text-[11px]" style={{ color: 'var(--color-mute-2)' }}>{ar.date}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={absentMemoDraft[ar.id] ?? ''}
                          onChange={(e) => setAbsentMemoDraft((prev) => ({ ...prev, [ar.id]: e.target.value }))}
                          placeholder="결석 사유를 입력하세요"
                          className="flex-1 rounded-lg px-2.5 py-1.5 text-[13px]"
                          style={{
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-ink)',
                          }}
                        />
                        <button
                          type="button"
                          onPointerDown={() => hapticMedium()}
                          onClick={async () => {
                            const memo = absentMemoDraft[ar.id];
                            if (!memo || !memo.trim()) { alert('메모를 입력해주세요.'); return; }
                            const res = await fetch('/api/attendance', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: ar.id, remarks: memo.trim() }),
                            });
                            if (res.ok) {
                              const saved = { ...ar, remarks: memo.trim() };
                              setAbsentWithoutMemo((prev) => prev.filter((x) => x.id !== ar.id));
                              setRecentAbsentWithMemo((prev) => [saved, ...prev]);
                              setAbsentMemoDraft((prev) => { const n = { ...prev }; delete n[ar.id]; return n; });
                            } else {
                              alert('저장 실패');
                            }
                          }}
                          className="press press-strong px-3 py-1.5 text-[12px] font-semibold rounded-lg"
                          style={{ background: 'var(--color-danger)', color: '#fff' }}
                        >
                          저장
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {taskRequests.length === 0 && parentMemos.length === 0 && pendingCounselingRequests.length === 0 && absentWithoutMemo.length === 0 ? (
              <EmptyState
                size="sm"
                icon="📥"
                tone="success"
                title="받은 요청이 없습니다"
                description="학부모 메모 · 상담 요청 · 결석 메모 · 업무 요청이 모두 처리되었습니다."
              />
            ) : taskRequests.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Badge tone="info" variant="soft" size="sm" dot>업무 요청</Badge>
                  <span className="text-[11px] font-medium" style={{ color: 'var(--color-mute)' }}>{taskRequests.length}건</span>
                </div>
                <div className="space-y-1.5">
                  {taskRequests.map((tr) => (
                    <Link
                      key={tr.id}
                      href="/requests"
                      onPointerDown={() => hapticLight()}
                      className="press press-subtle block rounded-lg p-3"
                      style={{ background: 'var(--color-gold-soft)', border: '1px solid #E8DBC2' }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge tone="warn" variant="soft" size="sm">대기중</Badge>
                        <p className="text-[13.5px] font-semibold text-ink" style={{ letterSpacing: '-0.01em' }}>{tr.title}</p>
                      </div>
                      {tr.description && <p className="text-[12.5px] mt-1 line-clamp-1" style={{ color: 'var(--color-mute)' }}>{tr.description}</p>}
                      <p className="text-[11px] mt-1" style={{ color: 'var(--color-mute-2)' }}>{tr.createdByName} · {new Date(tr.createdAt).toLocaleDateString('ko-KR')}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
        <Card padding="md" className="order-2 mb-6">
          <div className="mb-4">
            <div className="text-eyebrow mb-1">CALENDAR</div>
            <h2 className="text-[17px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>학원 캘린더</h2>
          </div>
          <div
            className="w-full overflow-hidden hidden md:block"
            style={{ height: '700px', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }}
          >
            <iframe src="https://calendar.google.com/calendar/embed?src=7d275bd3aedc88033443bbd1624a0524bdb06083eb0fdfe0cabf5804e6d2b148%40group.calendar.google.com&ctz=Asia%2FSeoul&mode=MONTH&showTitle=0&showNav=1&showPrint=0&showTabs=0" style={{ border: 0, width: '100%', height: '100%' }} frameBorder="0" scrolling="no" />
          </div>
          <div
            className="md:hidden w-full overflow-hidden"
            style={{ position: 'relative', paddingBottom: '85%', borderRadius: 'var(--radius-card)', border: '1px solid var(--color-border)' }}
          >
            <iframe src="https://calendar.google.com/calendar/embed?src=7d275bd3aedc88033443bbd1624a0524bdb06083eb0fdfe0cabf5804e6d2b148%40group.calendar.google.com&ctz=Asia%2FSeoul&mode=MONTH&showTitle=0&showNav=1&showPrint=0&showTabs=0" style={{ border: 0, position: 'absolute', top: 0, left: 0, width: '250%', height: '250%', transform: 'scale(0.4)', transformOrigin: 'top left' }} frameBorder="0" scrolling="no" />
          </div>
        </Card>
        </div>
      </div>

      {selectedMemo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900">메모 상세</h3>
                <button onClick={() => { setSelectedMemo(null); setReplyContent(''); }} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">{selectedMemo.student.name}</span>
                  <span className="text-sm text-gray-500">({selectedMemo.author.name})</span>
                  <span className="text-xs text-gray-400 ml-auto">{new Date(selectedMemo.createdAt).toLocaleString('ko-KR')}</span>
                </div>
                <p className="text-gray-800 whitespace-pre-wrap">{selectedMemo.content}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">답장 작성</label>
                <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="답장 내용을 입력하세요..." className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" rows={4} />
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  type="button"
                  onPointerDown={() => hapticMedium()}
                  onClick={handleReply}
                  disabled={replying || !replyContent.trim()}
                  className="press press-strong flex-1 min-h-[44px] py-2.5 rounded-lg text-[13.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: 'var(--color-accent)', color: '#fff' }}
                >
                  {replying ? '전송 중...' : '답장 보내기'}
                </button>
                <button
                  type="button"
                  onPointerDown={() => hapticLight()}
                  onClick={() => handleMarkAsRead(selectedMemo.id).then(() => { setSelectedMemo(null); setReplyContent(''); })}
                  className="press min-h-[44px] px-4 py-2.5 rounded-lg text-[13px] font-semibold"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', border: '1px solid var(--color-border)' }}
                >
                  읽음 처리
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

