'use client';

import { useEffect, useState } from 'react';

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
  response: string | null;
  responseByName: string | null;
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
  const [receivedRequests, setReceivedRequests] = useState<TaskRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'new' | 'sent' | 'received'>('new');

  // 답장 모달 상태
  const [selectedRequest, setSelectedRequest] = useState<TaskRequest | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);

  // 보낸 요청 상세 모달
  const [viewingRequest, setViewingRequest] = useState<TaskRequest | null>(null);

  useEffect(() => {
    // /api/auth/me에서 현재 로그인한 사용자 정보를 가져옴
    const fetchUserInfo = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUserInfo({
              userId: data.user.id,
              role: data.user.role,
              name: data.user.name,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch user info:', err);
      }
    };
    fetchUserInfo();
    fetchUsers();
    fetchSentRequests();
    fetchReceivedRequests();
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

  const fetchReceivedRequests = async () => {
    try {
      const res = await fetch('/api/task-requests?received=true');
      if (res.ok) {
        const data = await res.json();
        setReceivedRequests(Array.isArray(data) ? data : data.taskRequests || []);
      }
    } catch (err) {
      console.error('Failed to fetch received requests:', err);
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

  const handleRespond = async () => {
    if (!selectedRequest || !responseText.trim()) return;
    setResponding(true);
    try {
      const res = await fetch(`/api/task-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isCompleted: true,
          response: responseText,
        }),
      });
      if (res.ok) {
        setSelectedRequest(null);
        setResponseText('');
        fetchReceivedRequests();
        fetchSentRequests();
      }
    } catch (err) {
      console.error('Error responding:', err);
    } finally {
      setResponding(false);
    }
  };

  const handleQuickComplete = async (requestId: string) => {
    try {
      const res = await fetch(`/api/task-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isCompleted: true,
          response: '확인했습니다.',
        }),
      });
      if (res.ok) {
        fetchReceivedRequests();
        fetchSentRequests();
      }
    } catch (err) {
      console.error('Error completing:', err);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('이 요청을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/task-requests/${requestId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        fetchSentRequests();
        fetchReceivedRequests();
      }
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  // 자기 자신을 제외한 사용자 목록
  const filteredUsers = users.filter(u => u.id !== userInfo?.userId);

  const pendingReceived = receivedRequests.filter(r => !r.isCompleted);
  const completedReceived = receivedRequests.filter(r => r.isCompleted);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">요청사항</h1>
      </div>

      {/* 탭 메뉴 */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('new')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition ${
            activeTab === 'new' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          새 요청
        </button>
        <button
          onClick={() => setActiveTab('received')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition relative ${
            activeTab === 'received' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          받은 요청
          {pendingReceived.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
              {pendingReceived.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition ${
            activeTab === 'sent' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          보낸 요청
        </button>
      </div>

      {/* 새 요청 등록 */}
      {activeTab === 'new' && (
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
                  {filteredUsers.map((user) => (
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
      )}

      {/* 받은 요청 목록 */}
      {activeTab === 'received' && (
        <div className="space-y-6">
          {/* 대기중인 요청 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">📨 대기 중인 요청 ({pendingReceived.length})</h2>
            </div>
            <div className="p-6">
              {pendingReceived.length === 0 ? (
                <p className="text-center text-gray-500 py-8">대기 중인 요청이 없습니다.</p>
              ) : (
                <div className="space-y-3">
                  {pendingReceived.map((req) => (
                    <div
                      key={req.id}
                      className="border border-yellow-200 bg-yellow-50 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-700">
                              대기중
                            </span>
                            <h4 className="font-semibold text-gray-900">{req.title}</h4>
                          </div>
                          {req.description && (
                            <p className="text-sm text-gray-600 mb-2">{req.description}</p>
                          )}
                          <p className="text-xs text-gray-500">
                            보낸 사람: {req.createdByName} · {formatDate(req.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button
                            onClick={() => { setSelectedRequest(req); setResponseText(''); }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
                          >
                            답장
                          </button>
                          <button
                            onClick={() => handleQuickComplete(req.id)}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition whitespace-nowrap"
                          >
                            확인
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 완료된 요청 */}
          {completedReceived.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-500">완료된 요청 ({completedReceived.length})</h2>
              </div>
              <div className="p-6">
                <div className="space-y-3">
                  {completedReceived.map((req) => (
                    <div
                      key={req.id}
                      className="border border-green-200 bg-green-50 rounded-lg p-4 opacity-75"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                          완료
                        </span>
                        <h4 className="font-semibold text-gray-700 line-through">{req.title}</h4>
                      </div>
                      {req.response && (
                        <div className="mt-2 p-2 bg-white rounded border border-green-100">
                          <p className="text-sm text-gray-700">💬 {req.response}</p>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        보낸 사람: {req.createdByName} · {formatDate(req.createdAt)}
                        {req.completedAt && ` · 완료: ${formatDate(req.completedAt)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 보낸 요청 목록 */}
      {activeTab === 'sent' && (
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
              <div className="space-y-3">
                {sentRequests.map((task) => (
                  <div
                    key={task.id}
                    className={`p-4 border rounded-lg cursor-pointer hover:shadow-md transition ${
                      task.isCompleted ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
                    }`}
                    onClick={() => setViewingRequest(task)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
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
                        {task.isCompleted && task.response && (
                          <div className="mt-2 p-2 bg-white rounded border border-green-100">
                            <p className="text-sm text-gray-700">
                              💬 <span className="font-medium">{task.responseByName || task.targetUserName}</span>: {task.response}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          대상: {task.targetUserName || '-'} · {formatDate(task.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                        className="ml-2 p-1.5 text-gray-400 hover:text-red-500 transition"
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 답장 모달 */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900">요청 답장</h3>
                <button
                  onClick={() => { setSelectedRequest(null); setResponseText(''); }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500 mb-1">
                  보내 사람: {selectedRequest.createdByName} · {formatDate(selectedRequest.createdAt)}
                </p>
                <h4 className="font-semibold text-gray-900 mb-1">{selectedRequest.title}</h4>
                {selectedRequest.description && (
                  <p className="text-sm text-gray-600">{selectedRequest.description}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">답장 내용</label>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="답장 내용을 입력하세요..."
                  className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={4}
                />
              </div>

              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleRespond}
                  disabled={responding || !responseText.trim()}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {responding ? '전송 중...' : '답장 보내고 완료'}
                </button>
                <button
                  onClick={() => handleQuickComplete(selectedRequest.id).then(() => { setSelectedRequest(null); setResponseText(''); })}
                  className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  바로 완료
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 보낸 요청 상세 보기 모달 */}
      {viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900">요청 상세</h3>
                <button
                  onClick={() => setViewingRequest(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    viewingRequest.isCompleted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {viewingRequest.isCompleted ? '완료' : '대기중'}
                  </span>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">내가 보낸 요청</p>
                  <h4 className="font-semibold text-gray-900">{viewingRequest.title}</h4>
                  {viewingRequest.description && (
                    <p className="text-sm text-gray-600 mt-1">{viewingRequest.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    대상: {viewingRequest.targetUserName} · {formatDate(viewingRequest.createdAt)}
                  </p>
                </div>

                {viewingRequest.isCompleted && (
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      💬 {viewingRequest.responseByName || viewingRequest.targetUserName}의 답장
                    </p>
                    <p className="text-sm text-gray-800">
                      {viewingRequest.response || '(답장 없이 완료됨)'}
                    </p>
                    {viewingRequest.completedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        완료: {formatDate(viewingRequest.completedAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setViewingRequest(null)}
                className="w-full mt-4 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

