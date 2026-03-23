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
  const [parentMemos, setParentMemos] = useState<ParentMemo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMemo, setSelectedMemo] = useState<ParentMemo | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [replying, setReplying] = useState(false);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const response = await fetch('/api/dashboard');
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats);
          setAnnouncements(data.announcements || []);
          setUpcomingTests(data.upcomingTests || []);
          setTaskRequests(data.taskRequests || []);
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
      await fetch(`/api/task-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });
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
    }
  };

  const handleMarkAsRead = async (memoId: string) => {
    try {
      await fetch(`/api/memos/${memoId}/read`, { method: 'PUT' });
      setParentMemos(prev => prev.filter(m => m.id !== memoId));
    } catch (err) {
      console.error('Mark as read error:', err);
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
            <Link href="/notifications" className="text-sm text-blue-600 hover:text-blue-800">전체 보기 →</Link>
          </div>
          {announcements.length === 0 ? (
            <p className="text-gray-500 text-center py-4">공지사항이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="border-b pb-3 last:border-b-0">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-gray-900">{a.title}</h3>
                    <span className="text-xs text-gray-500 ml-2 whitespace-nowrap">
                      {new Date(a.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 line-clamp-2">{a.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
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
              <Link href="/requests" className="text-sm text-blue-600 hover:text-blue-800">요청 보내기 →</Link>
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

            {taskRequests.length === 0 && parentMemos.length === 0 ? (
              <p className="text-gray-500 text-center py-4">요청사항이 없습니다.</p>
            ) : taskRequests.length > 0 && (
              <div>
                {parentMemos.length > 0 && <h3 className="text-sm font-semibold text-blue-600 mb-2">📋 업무 요청</h3>}
                <div className="space-y-3">
                  {taskRequests.map((tr) => (
                    <div key={tr.id} className="flex items-start gap-3 border rounded-lg p-3">
                      <input type="checkbox" checked={tr.isCompleted} onChange={() => handleToggleComplete(tr.id, tr.isCompleted)} className="mt-1 w-4 h-4 text-blue-600 rounded" />
                      <div className="flex-1">
                        <p className={`font-medium ${tr.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>{tr.title}</p>
                        {tr.description && <p className="text-sm text-gray-500 mt-1">{tr.description}</p>}
                        <p className="text-xs text-gray-400 mt-1">{tr.createdByName} · {new Date(tr.createdAt).toLocaleDateString('ko-KR')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-3 sm:p-4 md:p-6 mb-4 sm:mb-6 mt-6">
          <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-3 sm:mb-4">Google Calendar</h2>
          <div className="w-full overflow-hidden rounded-lg" style={{ height: "clamp(500px, 60vw, 800px)" }}>
            <iframe src="https://calendar.google.com/calendar/embed?src=7d275bd3aedc88033443bbd1624a0524bdb06083eb0fdfe0cabf5804e6d2b148%40group.calendar.google.com&ctz=Asia%2FSeoul&mode=MONTH&showTitle=0&showNav=1&showPrint=0&showTabs=0" style={{ border: 0, width: "100%", height: "100%" }} frameBorder="0" scrolling="no" />
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
