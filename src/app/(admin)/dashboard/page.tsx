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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingTests, setUpcomingTests] = useState<EntranceTest[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [loading, setLoading] = useState(true);

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
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: !isCompleted }),
      });
      setTaskRequests(prev =>
        prev.map(tr => tr.id === id ? { ...tr, isCompleted: !isCompleted } : tr)
      );
    } catch (err) {
      console.error('Toggle error:', err);
    }
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

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4 mb-6">
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
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-orange-500">
              <p className="text-sm text-gray-600">상담 대기</p>
              <p className="text-2xl font-bold text-gray-900">{stats.pendingCounseling}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-t-4 border-red-500">
              <p className="text-sm text-gray-600">오늘 테스트</p>
              <p className="text-2xl font-bold text-gray-900">{stats.todayTests}</p>
            </div>
          </div>
        )}

        {/* Announcements - Full Width Top */}
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

        {/* Two Column: Tests + Received Requests */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upcoming Tests */}
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
                        <p className="text-sm text-gray-600">
                          {test.school || ''} {test.grade || ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium text-blue-600">{test.testDate}</p>
                        {test.testTime && (
                          <p className="text-xs text-gray-500">{test.testTime}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Received Requests */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">📨 받은 요청사항</h2>
              <Link href="/requests" className="text-sm text-blue-600 hover:text-blue-800">요청 보내기 →</Link>
            </div>
            {taskRequests.length === 0 ? (
              <p className="text-gray-500 text-center py-4">요청사항이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {taskRequests.map((tr) => (
                  <div key={tr.id} className="flex items-start gap-3 border rounded-lg p-3">
                    <input
                      type="checkbox"
                      checked={tr.isCompleted}
                      onChange={() => handleToggleComplete(tr.id, tr.isCompleted)}
                      className="mt-1 w-4 h-4 text-blue-600 rounded"
                    />
                    <div className="flex-1">
                      <p className={`font-medium ${tr.isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {tr.title}
                      </p>
                      {tr.description && (
                        <p className="text-sm text-gray-500 mt-1">{tr.description}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1">
                        {tr.createdByName} · {new Date(tr.createdAt).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
