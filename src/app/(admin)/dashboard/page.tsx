'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">대시보드</h1>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-blue-500">
              <p className="text-sm text-gray-600">총 원생수</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-green-500">
              <p className="text-sm text-gray-600">총 반수</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalClassrooms}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-purple-500">
              <p className="text-sm text-gray-600">오늘 출석</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayAttendance}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-red-500">
              <p className="text-sm text-gray-600">오늘 테스트</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayTests}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">📢 공지사항</h2>
            <button
              onClick={openNewAnn}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 text-xl leading-none"
              title="새 공지 작성"
            >
              +
            </button>
          </div>
          {announcements.length === 0 ? (
            <p className="text-gray-500 text-center py-4">공지사항이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openEditAnn(a)}
                  className="w-full text-left border-b pb-3 last:border-b-0 hover:bg-gray-50 rounded px-2 py-1 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-gray-900">{a.title}</h3>
                    <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{a.content}</p>
                </button>
              ))}
            </div>
          )}
        </div>

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
                      onClick={deleteAnn}
                      className="px-4 py-2 rounded bg-red-100 text-red-700 hover:bg-red-200"
                    >
                      삭제
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAnnModal(false)}
                    className="px-4 py-2 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    취소
                  </button>
                  <button
                    onClick={saveAnn}
                    className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 최근 1주일 상담 내용 (관리자/데스크만) */}
        {(userRole === 'ADMIN' || userRole === 'DESK') && <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">💬 최근 상담 내용 <span className="text-sm font-normal text-gray-500">(최근 7일)</span></h2>
            <Link href="/counseling" className="text-sm text-blue-600 hover:text-blue-800">전체 보기 →</Link>
          </div>
          {recentCounseling.length === 0 ? (
            <p className="text-gray-500 text-center py-4">최근 1주일간 신규 상담이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {recentCounseling.map((c) => (
                <Link key={c.id} href={`/counseling`} className="block border rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                          c.status === 'CONFIRMED' ? 'bg-blue-100 text-blue-700' :
                          c.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {c.status === 'PENDING' ? '대기' : c.status === 'CONFIRMED' ? '확정' : c.status === 'COMPLETED' ? '완료' : '취소'}
                        </span>
                        <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">{c.student.name}</span>
                        <span className="text-xs text-gray-500">{c.counselingType === 'VISIT' ? '방문상담' : '전화상담'}</span>
                      </div>
                      <p className="font-medium text-gray-900 truncate">{c.title}</p>
                      {c.description && <p className="text-sm text-gray-600 mt-0.5 line-clamp-1">{c.description}</p>}
                      {c.sessionNotes && (
                        <p className="text-sm text-green-700 bg-green-50 rounded px-2 py-1 mt-1 line-clamp-2">📝 {c.sessionNotes}</p>
                      )}
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className="text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString('ko-KR')}</p>
                      {c.parent ? (
                        <p className="text-xs text-gray-500 mt-0.5">학부모: {c.parent.name}</p>
                      ) : c.createdByName ? (
                        <p className="text-xs text-gray-500 mt-0.5">입력: {c.createdByName}</p>
                      ) : null}
                      {c.preferredDate && <p className="text-xs text-blue-500 mt-0.5">희망: {c.preferredDate}</p>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">📋 임박한 입학테스트</h2>
              <Link href="/entrance-test" className="text-sm text-blue-600 hover:text-blue-800">전체 보기 →</Link>
            </div>
            {upcomingTests.length === 0 ? (
              <p className="text-gray-500 text-center py-4">예정된 입학테스트가 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {upcomingTests.map((test) => (
                  <div key={test.id} className="border rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-gray-900">{test.name}</p>
                        <p className="text-sm text-gray-600">{test.school || ''} {test.grade || ''}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-blue-600">{test.testDate}</p>
                        {test.testTime && <p className="text-xs text-gray-500">{test.testTime}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">📨 받은 요청사항</h2>
              <Link href="/requests" className="text-sm text-blue-600 hover:text-blue-800">전체 보기 →</Link>
            </div>

            {parentMemos.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-orange-600 mb-2">💌 학부모/학생 메모 ({parentMemos.length})</h3>
                <div className="space-y-2">
                  {parentMemos.map((memo) => (
                    <div key={memo.id} className="border border-orange-200 bg-orange-50 rounded-lg p-3 cursor-pointer hover:bg-orange-100 transition-colors" onClick={() => setSelectedMemo(memo)}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-orange-700 bg-orange-200 px-2 py-0.5 rounded-full">{memo.student.name}</span>
                            <span className="text-xs text-gray-500">{memo.author.name}</span>
                          </div>
                          <p className="text-sm text-gray-800 mt-1 line-clamp-2">{memo.content}</p>
                        </div>
                        <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{formatTime(memo.createdAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingCounselingRequests.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-purple-700 mb-2">💬 상담 요청 ({pendingCounselingRequests.length})</h3>
                <div className="space-y-2">
                  {pendingCounselingRequests.map((cr) => (
                    <Link key={cr.id} href="/counseling" className="block border border-purple-200 bg-purple-50 rounded-lg p-3 hover:bg-purple-100 transition-colors">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">대기중</span>
                            <span className="text-xs font-medium text-purple-700 bg-purple-200 px-2 py-0.5 rounded-full">{cr.student?.name}</span>
                            <span className="text-xs text-gray-500">{cr.counselingType === 'VISIT' ? '방문상담' : '전화상담'}</span>
                          </div>
                          <p className="font-medium text-gray-900 truncate">{cr.title}</p>
                          {cr.description && <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{cr.description}</p>}
                          {cr.parent?.name && <p className="text-xs text-gray-500 mt-1">학부모: {cr.parent.name}</p>}
                        </div>
                        <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">{new Date(cr.createdAt).toLocaleDateString('ko-KR')}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {absentWithoutMemo.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-red-600 mb-2">🚨 결석 메모 미작성 ({absentWithoutMemo.length})</h3>
                <div className="space-y-2">
                  {absentWithoutMemo.map((ar) => (
                    <div key={ar.id} className="border border-red-200 bg-red-50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-xs font-medium text-red-700 bg-red-200 px-2 py-0.5 rounded-full">{ar.student?.name}</span>
                        <span className="text-xs text-gray-600">{ar.classroom?.name}</span>
                        <span className="text-xs text-gray-500">{ar.date}</span>
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={absentMemoDraft[ar.id] ?? ''}
                          onChange={(e) => setAbsentMemoDraft((prev) => ({ ...prev, [ar.id]: e.target.value }))}
                          placeholder="결석 사유/메모를 입력하세요"
                          className="flex-1 border border-red-200 rounded px-2 py-1 text-sm text-gray-900"
                        />
                        <button
                          onClick={async () => {
                            const memo = absentMemoDraft[ar.id];
                            if (!memo || !memo.trim()) {
                              alert('메모를 입력해주세요.');
                              return;
                            }
                            const res = await fetch('/api/attendance', {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ id: ar.id, remarks: memo.trim() }),
                            });
                            if (res.ok) {
                              setAbsentWithoutMemo((prev) => prev.filter((x) => x.id !== ar.id));
                              setAbsentMemoDraft((prev) => {
                                const n = { ...prev };
                                delete n[ar.id];
                                return n;
                              });
                            } else {
                              alert('저장 실패');
                            }
                          }}
                          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
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
              <p className="text-gray-500 text-center py-4">요청사항이 없습니다.</p>
            ) : taskRequests.length > 0 && (
              <div>
                {parentMemos.length > 0 && <h3 className="text-sm font-semibold text-blue-600 mb-2">📋 업무 요청</h3>}
                <div className="space-y-3">
                  {taskRequests.map((tr) => (
                    <Link key={tr.id} href="/requests" className="flex items-start gap-3 border border-yellow-200 bg-yellow-50 rounded-lg p-3 hover:shadow-md transition">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">대기중</span>
                          <p className="font-medium text-gray-900">{tr.title}</p>
                        </div>
                        {tr.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{tr.description}</p>}
                        <p className="text-xs text-gray-400 mt-1">{tr.createdByName} · {new Date(tr.createdAt).toLocaleDateString('ko-KR')}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 mt-6">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">Google Calendar</h2>
          {/* 모바일: iframe을 800px 고정 폭으로 렌더링 후 화면에 맞게 축소 / 데스크톱: 100% */}
          <div className="w-full overflow-hidden rounded-lg hidden md:block" style={{ height: "700px" }}>
            <iframe src="https://calendar.google.com/calendar/embed?src=7d275bd3aedc88033443bbd1624a0524bdb06083eb0fdfe0cabf5804e6d2b148%40group.calendar.google.com&ctz=Asia%2FSeoul&mode=MONTH&showTitle=0&showNav=1&showPrint=0&showTabs=0" style={{ border: 0, width: "100%", height: "100%" }} frameBorder="0" scrolling="no" />
          </div>
          <div className="md:hidden w-full overflow-hidden rounded-lg" style={{ position: 'relative', paddingBottom: '85%' }}>
            <iframe src="https://calendar.google.com/calendar/embed?src=7d275bd3aedc88033443bbd1624a0524bdb06083eb0fdfe0cabf5804e6d2b148%40group.calendar.google.com&ctz=Asia%2FSeoul&mode=MONTH&showTitle=0&showNav=1&showPrint=0&showTabs=0" style={{ border: 0, position: 'absolute', top: 0, left: 0, width: '250%', height: '250%', transform: 'scale(0.4)', transformOrigin: 'top left' }} frameBorder="0" scrolling="no" />
          </div>
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
                <button onClick={handleReply} disabled={replying || !replyContent.trim()} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                  {replying ? '전송 중...' : '답장 보내기'}
                </button>
                <button onClick={() => handleMarkAsRead(selectedMemo.id).then(() => { setSelectedMemo(null); setReplyContent(''); })} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                  읽샜 처리
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

