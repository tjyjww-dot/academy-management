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
      const res = await fetch(`/api/task-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });
      if (!res.ok) {
        console.error('Toggle failed:', res.status, res.statusText);
        alert('ì²ë¦¬ì ì¤í¨íìµëë¤. ë¤ì ìëí´ì£¼ì¸ì.');
        return;
      }
      // ìë² ì ì¥ ì±ê³µ íìë§ UI ìë°ì´í¸
      if (!isCompleted) {
        // ì½ìì²ë¦¬(ìë£) ì ëª©ë¡ìì ì ê±°
        setTaskRequests(prev => prev.filter(tr => tr.id !== id));
      } else {
        setTaskRequests(prev =>
          prev.map(tr => tr.id === id ? { ...tr, isCompleted: !isCompleted } : tr)
        );
      }
    } catch (err) {
      console.error('Toggle error:', err);
      alert('ë¤í¸ìí¬ ì¤ë¥ê° ë°ìíìµëë¤. ë¤ì ìëí´ì£¼ì¸ì.');
    }
  };

  const handleMarkAsRead = async (memoId: string) => {
    try {
      const res = await fetch(`/api/memos/${memoId}/read`, { method: 'PUT' });
      if (!res.ok) {
        console.error('Mark as read failed:', res.status);
        alert('ì½ì ì²ë¦¬ì ì¤í¨íìµëë¤. ë¤ì ìëí´ì£¼ì¸ì.');
        return;
      }
      setParentMemos(prev => prev.filter(m => m.id !== memoId));
    } catch (err) {
      console.error('Mark as read error:', err);
      alert('ë¤í¸ìí¬ ì¤ë¥ê° ë°ìíìµëë¤. ë¤ì ìëí´ì£¼ì¸ì.');
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
    if (minutes < 60) return `${minutes}ë¶ ì `;
    if (hours < 24) return `${hours}ìê° ì `;
    return date.toLocaleDateString('ko-KR');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">ë¡ë© ì¤...</p>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6">ëìë³´ë</h1>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-blue-500">
              <p className="text-sm text-gray-600">ì´ ììì</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalStudents}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-green-500">
              <p className="text-sm text-gray-600">Ü ë°ì</p>
              <p className="text-2xl font-bold text-gray-900">{stats.totalClassrooms}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-purple-500">
              <p className="text-sm text-gray-600">ì¤ë ì¶ì</pp>
              <p className="text-2xl font-bold text-gray-900">{stats.todayAttendance}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-red-500">
              <p className="text-sm text-gray-600">ì¤ë íì¤í¸</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayTests}</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">ð¢ ê³µì§ì¬í­</h2>
            <Link href="/notifications" className="text-sm text-blue-600 hover:text-blue-800">ì ì²´ ë³´ê¸° â</Link>
          </div>
          {announcements.length === 0 ? (
            <p className="text-gray-500 text-center py-4">ê³µì§ì¬í­ì´ ììµëë¤.</p>
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
              <h2 className="text-lg font-bold text-gray-900">ð ìë°í ìííì¤í¸</h2>
              <Link href="/entrance-test" className="text-sm text-blue-600 hover:text-blue-800">ì ì²´ ë³´ê¸° â</Link>
            </div>
            {upcomingTests.length === 0 ? (
              <p className="text-gray-500 text-center py-4">ìì ë ìííì¤í¸ê° ììµëë¤.</p>
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
              <h2 className="text-lg font-bold text-gray-900">ð¨ ë°ì ìì²­ì¬í­</h2>
              <Link href="/requests" className="text-sm text-blue-600 hover:text-blue-800">ì ì²´ ë³´ê¸° â</Link>
            </div>

            {parentMemos.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-orange-600 mb-2">ð íë¶ëª¨/íì ë©ëª¨ ({parentMemos.length})</h3>
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
              <p className="text-gray-500 text-center py-4">ìì²­ì¬í­ì´ ììµëë¤.</p>
            ) : taskRequests.length > 0 && (
              <div>
                {parentMemos.length > 0 && <h3 className="text-sm font-semibold text-blue-600 mb-2">ð ìë¬´ ìì²­</h3>}
                <div className="space-y-3">
                  {taskRequests.map((tr) => (
                    <Link key={tr.id} href="/requests" className="flex items-start gap-3 border border-yellow-200 bg-yellow-50 rounded-lg p-3 hover:shadow-md transition">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">ëê¸°ì¤</span>
                          <p className="font-medium text-gray-900">{tr.title}</p>
                        </div>
                        {tr.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{tr.description}</p>}
                        <p className="text-xs text-gray-400 mt-1">{tr.createdByName} Â· {new Date(tr.createdAt).toLocaleDateString('ko-KR')}</p>
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
                <h3 className="text-lg font-bold text-gray-900">ë©ëª¨ ìì¸</h3>
                <button onClick={() => { setSelectedMemo(null); setReplyContent(''); }} className="text-gray-400 hover:text-gray-600 text-xl">â</button>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">ëµì¥ ìì±</label>
                <textarea value={replyContent} onChange={(e) => setReplyContent(e.target.value)} placeholder="ëµì¥ ë´ì©ì ìë ¥íì¸ì..." className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none" rows={4} />
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleReply} disabled={replying || !replyContent.trim()} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                  {replying ? 'ì ì¡ ì¤...' : 'ëµì¥ ë³´ë´ê¸°'}
                </button>
                <button onClick={() => handleMarkAsRead(selectedMemo.id).then(() => { setSelectedMemo(null); setReplyContent(''); })} className="px-4 py-2.5 border border-gray-300 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors">
                  ì½ì ì²ë¦¬
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
