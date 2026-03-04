'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface TaskRequest {
  id: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdByName: string;
  targetRole: string;
  targetUserId: string | null;
  targetUserName: string | null;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface UserInfo {
  userId: string;
  role: string;
  name: string;
}

export default function RequestsPage() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [users, setUsers] = useState<{id: string; name: string; role: string}[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [sentRequests, setSentRequests] = useState<TaskRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userInfoStr = localStorage.getItem('userInfo');
    if (userInfoStr) {
      setUserInfo(JSON.parse(userInfoStr));
    }
    fetchUsers();
    fetchSentRequests();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchSentRequests = async () => {
    try {
      const res = await fetch('/api/task-requests?sent=true');
      if (res.ok) {
        const data = await res.json();
        setSentRequests(Array.isArray(data) ? data : data.taskRequests || []);
      }
    } catch (err) {
      console.error('Failed to fetch sent requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedUserId || !userInfo) {
      setSubmitError('제목과 대상을 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      const response = await fetch('/api/task-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
          targetUserId: selectedUserId,
        }),
      });

      if (!response.ok) throw new Error('Failed to create task request');

      setTaskTitle('');
      setTaskDescription('');
      setSelectedUserId('');
      setSubmitSuccess('요청이 등록되었습니다!');
      setTimeout(() => setSubmitSuccess(''), 3000);
      fetchSentRequests();
    } catch (err) {
      console.error('Error submitting task request:', err);
      setSubmitError('요청사항 등록 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">요청사항</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 요청 등록 폼 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">📝 새 요청 등록</h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  요청 내용 <span className="text-red-500">*</span>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  대상 선택 <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">요청 대상을 선택하세요</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role === 'ADMIN' ? '관리자' : user.role === 'TEACHER' ? '강사' : '데스크'})
                    </option>
                  ))}
                </select>
              </div>
              {submitError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  {submitError}
                </div>
              )}
              {submitSuccess && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
                  {submitSuccess}
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
        </div>

        {/* 보낸 요청 목록 */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">📋 보낸 요청 목록</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <p className="text-center text-gray-500 py-8">로딩 중...</p>
            ) : sentRequests.length === 0 ? (
              <p className="text-center text-gray-500 py-8">보낸 요청이 없습니다.</p>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {sentRequests.map((task) => (
                  <div
                    key={task.id}
                    className={`p-4 border rounded-lg ${
                      task.isCompleted ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        task.isCompleted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {task.isCompleted ? '완료' : '대기중'}
                      </span>
                      <h4 className="font-semibold text-gray-900">{task.title}</h4>
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-600 mb-1">{task.description}</p>
                    )}
                    <p className="text-xs text-gray-500">
                      대상: {task.targetUserName || '-'} •{' '}
                      {new Date(task.createdAt).toLocaleDateString('ko-KR', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
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
