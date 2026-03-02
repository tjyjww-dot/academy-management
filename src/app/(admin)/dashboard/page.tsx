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
  testTime: string;
  status: string;
  notes: string | null;
  priorLevel: string | null;
  testScore: string | null;
  counselingNotes: string | null;
}

interface TaskRequest {
  id: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdByName: string;
  targetRole: string;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UserInfo {
  userId: string;
  role: string;
  name: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingTests, setUpcomingTests] = useState<EntranceTest[]>([]);
  const [taskRequests, setTaskRequests] = useState<TaskRequest[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form states
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Get user info from localStorage (set during login)
        const userInfoStr = localStorage.getItem('userInfo');
        if (userInfoStr) {
          const info = JSON.parse(userInfoStr);
          setUserInfo(info);
        }

        const response = await fetch('/api/dashboard');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard data');
        }
        const data = await response.json();
        setStats(data.stats);
        setAnnouncements(data.announcements);
        setUpcomingTests(data.upcomingTests || []);
        setTaskRequests(data.taskRequests || []);
      } catch (err) {
        console.error('Error fetching dashboard:', err);
        setError('대시보드 데이터를 불러올 수 없습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const handleRoleToggle = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleSubmitTaskRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || selectedRoles.length === 0 || !userInfo) {
      setSubmitError('제목과 대상을 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');

    try {
      // Submit each selected role separately
      for (const role of selectedRoles) {
        const response = await fetch('/api/task-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: taskTitle,
            description: taskDescription,
            targetRole: role,
            createdBy: userInfo.userId,
            createdByName: userInfo.name,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to submit task request');
        }
      }

      // Reset form
      setTaskTitle('');
      setTaskDescription('');
      setSelectedRoles([]);

      // Refresh task requests
      const dashboardResponse = await fetch('/api/dashboard');
      const data = await dashboardResponse.json();
      setTaskRequests(data.taskRequests || []);
    } catch (err) {
      console.error('Error submitting task request:', err);
      setSubmitError('요청사항 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteTask = async (taskId: string) => {
    if (!userInfo) return;

    try {
      const response = await fetch(`/api/task-requests/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isCompleted: true,
          completedBy: userInfo.userId,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to complete task');
      }

      // Refresh task requests
      const dashboardResponse = await fetch('/api/dashboard');
      const data = await dashboardResponse.json();
      setTaskRequests(data.taskRequests || []);
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block">
            <svg
              className="animate-spin h-12 w-12 text-blue-600"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <p className="mt-4 text-gray-600">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const today = new Date().toISOString().split('T')[0];
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const formatTestDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
  };

  const getDaysUntil = (dateStr: string) => {
    const diff = Math.ceil(
      (new Date(dateStr + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
    );
    if (diff === 0) return '오늘';
    if (diff === 1) return '내일';
    return `D-${diff}`;
  };

  const statCards = [
    {
      title: '총 원생수',
      value: stats?.totalStudents || 0,
      color: '#2563eb',
      icon: '👥',
      href: '/students',
    },
    {
      title: '총 반수',
      value: stats?.totalClassrooms || 0,
      color: '#16a34a',
      icon: '📚',
      href: '/classes',
    },
    {
      title: '오늘 출석',
      value: stats?.todayAttendance || 0,
      color: '#7c3aed',
      icon: '✓',
      href: '/attendance',
    },
    {
      title: '상담 대기',
      value: stats?.pendingCounseling || 0,
      color: '#ea580c',
      icon: '💬',
      href: '/counseling',
    },
    {
      title: '오늘 테스트',
      value: stats?.todayTests || 0,
      color: '#0891b2',
      icon: '📋',
      href: '/entrance-test',
    },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">대시보드</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((card, index) => (
          <Link key={index} href={card.href}>
            <div
              className="bg-white rounded-lg shadow p-5 border-l-4 hover:shadow-md transition cursor-pointer"
              style={{ borderLeftColor: card.color }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-xs font-medium">{card.title}</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                </div>
                <div className="text-3xl">{card.icon}</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── 요청사항 섹션 ── */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-bold text-gray-900">📝 요청사항</h2>
        </div>

        {/* 요청 등록 폼 */}
        <div className="px-6 py-6 border-b border-gray-200">
          <form onSubmit={handleSubmitTaskRequest}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                요청 내용 *
              </label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="요청 제목을 입력해주세요"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                상세 내용
              </label>
              <textarea
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
                placeholder="추가 설명이 필요하면 입력해주세요"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                대상 역할 선택 *
              </label>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes('TEACHER')}
                    onChange={() => handleRoleToggle('TEACHER')}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">강사(TEACHER)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes('DESK')}
                    onChange={() => handleRoleToggle('DESK')}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">데스크(DESK)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRoles.includes('ADMIN')}
                    onChange={() => handleRoleToggle('ADMIN')}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">관리자(ADMIN)</span>
                </label>
              </div>
            </div>

            {submitError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? '등록 중...' : '요청 등록'}
            </button>
          </form>
        </div>

        {/* 내게 온 요청사항 */}
        <div className="px-6 py-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">내게 온 요청사항</h3>
          {taskRequests.length === 0 ? (
            <p className="text-center text-gray-500 py-8">요청사항이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {taskRequests.map((task) => (
                <div
                  key={task.id}
                  className={`p-4 border rounded-lg transition-all ${
                    task.isCompleted
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-blue-50 border-blue-200 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4
                          className={`font-semibold ${
                            task.isCompleted
                              ? 'text-gray-500 line-through'
                              : 'text-gray-900'
                          }`}
                        >
                          {task.title}
                        </h4>
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {task.targetRole === 'TEACHER'
                            ? '강사'
                            : task.targetRole === 'DESK'
                            ? '데스크'
                            : '관리자'}
                        </span>
                      </div>
                      {task.description && (
                        <p
                          className={`text-sm mb-2 ${
                            task.isCompleted
                              ? 'text-gray-400 line-through'
                              : 'text-gray-600'
                          }`}
                        >
                          {task.description}
                        </p>
                      )}
                      <p className="text-xs text-gray-500">
                        요청자: {task.createdByName} •{' '}
                        {new Date(task.createdAt).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex-shrink-0">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={task.isCompleted}
                          onChange={() => handleCompleteTask(task.id)}
                          className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <span className="text-sm font-medium text-gray-600">
                          {task.isCompleted ? '완료됨' : '완료'}
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ── 임박한 입학테스트 ── */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">📋 임박한 입학테스트</h2>
            <Link href="/entrance-test">
              <span className="text-sm text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
                전체 보기 →
              </span>
            </Link>
          </div>

          <div className="divide-y divide-gray-100">
            {upcomingTests.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                예정된 입학테스트가 없습니다.
              </div>
            ) : (
              upcomingTests.map((test) => {
                const isToday = test.testDate === today;
                const isSoon = test.testDate > today && test.testDate <= inThreeDays;
                const daysLabel = getDaysUntil(test.testDate);

                return (
                  <div key={test.id} className="px-6 py-4 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-semibold text-gray-900">{test.name}</span>
                          {test.grade && (
                            <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                              {test.grade}
                            </span>
                          )}
                          {test.school && (
                            <span className="text-xs text-gray-500">{test.school}</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          📞 {test.parentPhone}
                        </p>
                        {(test.priorLevel || test.testScore) && (
                          <div className="flex gap-3 mt-1">
                            {test.priorLevel && (
                              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                                선행: {test.priorLevel}
                              </span>
                            )}
                            {test.testScore && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                점수: {test.testScore}
                              </span>
                            )}
                          </div>
                        )}
                        {test.notes && (
                          <div className="bg-blue-50 border-l-2 border-blue-300 rounded px-2 py-1.5 mt-2">
                            <p className="text-xs font-semibold text-blue-700 mb-0.5">📝 메모</p>
                            <p className="text-xs text-gray-700 line-clamp-2 whitespace-pre-wrap break-words">{test.notes}</p>
                          </div>
                        )}
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                          {formatTestDate(test.testDate)} {test.testTime}
                        </p>
                        <span
                          className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full mt-1 ${
                            isToday
                              ? 'bg-orange-500 text-white'
                              : isSoon
                              ? 'bg-yellow-400 text-gray-900'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {daysLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {upcomingTests.length > 0 && (
            <div className="px-6 py-3 bg-gray-50 rounded-b-lg text-center">
              <Link href="/entrance-test">
                <span className="text-sm text-blue-600 hover:text-blue-800 font-medium cursor-pointer">
                  + 새 예약 등록하기
                </span>
              </Link>
            </div>
          )}
        </div>

        {/* ── 최근 공지사항 ── */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">📢 최근 공지사항</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {announcements.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                공지사항이 없습니다.
              </div>
            ) : (
              announcements.map((announcement) => (
                <div key={announcement.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-gray-900 mb-1">
                        {announcement.title}
                      </h3>
                      <p className="text-gray-600 text-sm line-clamp-2">
                        {announcement.content}
                      </p>
                    </div>
                    <time className="text-xs text-gray-400 whitespace-nowrap">
                      {new Date(announcement.createdAt).toLocaleDateString('ko-KR')}
                    </time>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
