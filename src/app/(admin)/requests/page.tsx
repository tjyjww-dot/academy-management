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

  // ëµì¥ ëª¨ë¬ ìí
  const [selectedRequest, setSelectedRequest] = useState<TaskRequest | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);

  // ë³´ë¸ ìì²­ ìì¸ ëª¨ë¬
  const [viewingRequest, setViewingRequest] = useState<TaskRequest | null>(null);

  useEffect(() => {
    const userInfoStr = localStorage.getItem('userInfo');
    if (userInfoStr) {
      setUserInfo(JSON.parse(userInfoStr));
    }
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
      setSubmitError('ì ëª©ê³¼ ëìì ì íí´ì£¼ì¸ì.');
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
      setSubmitSuccess('ìì²­ì´ ë±ë¡ëììµëë¤!');
      setTimeout(() => setSubmitSuccess(''), 3000);
      fetchSentRequests();
    } catch (err) {
      console.error('Error submitting task request:', err);
      setSubmitError('ìì²­ì¬í­ ë±ë¡ ì¤ ì¤ë¥ê° ë°ìíìµëë¤.');
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
          response: 'íì¸íìµëë¤.',
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
    if (!confirm('ì´ ìì²­ì ì­ì íìê² ìµëê¹?')) return;
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

  // ìê¸° ìì ì ì ì¸í ì¬ì©ì ëª©ë¡
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
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">ìì²­ì¬í­</h1>
      </div>

      {/* í­ ë©ë´ */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setActiveTab('new')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition ${
            activeTab === 'new' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          ì ìì²­
        </button>
        <button
          onClick={() => setActiveTab('received')}
          className={`flex-1 py-2.5 px-4 rounded-md text-sm font-medium transition relative ${
            activeTab === 'received' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          ë°ì ìì²­
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
          ë³´ë¸ ìì²­
        </button>
      </div>

      {/* ì ìì²­ ë±ë¡ */}
      {activeTab === 'new' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">ð ì ìì²­ ë±ë¡</h2>
          </div>
          <div className="p-6">
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ìì²­ ë´ì© <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="ìì²­ ì ëª©ì ìë ¥í´ì£¼ì¸ì"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ìì¸ ë´ì©
                </label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="ì¶ê° ì¤ëªì´ íìíë©´ ìë ¥í´ì£¼ì¸ì"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ëì ì í <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">ìì²­ ëìì ì ííì¸ì</option>
                  {filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role === 'ADMIN' ? 'ê´ë¦¬ì' : user.role === 'TEACHER' ? 'ê°ì¬' : 'ë°ì¤í¬'})
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
                {submitting ? 'ë±ë¡ ì¤...' : 'ìì²­ ë±ë¡'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ë°ì ìì²­ ëª©ë¡ */}
      {activeTab === 'received' && (
        <div className="space-y-6">
          {/* ëê¸°ì¤ì¸ ìì²­ */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">ð¨ ëê¸° ì¤ì¸ ìì²­ ({pendingReceived.length})</h2>
            </div>
            <div className="p-6">
              {pendingReceived.length === 0 ? (
                <p className="text-center text-gray-500 py-8">ëê¸° ì¤ì¸ ìì²­ì´ ììµëë¤.</p>
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
                              ëê¸°ì¤
                            </span>
                            <h4 className="font-semibold text-gray-900">{req.title}</h4>
                          </div>
                          {req.description && (
                            <p className="text-sm text-gray-600 mb-2">{req.description}</p>
                          )}
                          <p className="text-xs text-gray-500">
                            ë³´ë¸ ì¬ë: {req.createdByName} Â· {formatDate(req.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-3">
                          <button
                            onClick={() => { setSelectedRequest(req); setResponseText(''); }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
                          >
                            ëµì¥
                          </button>
                          <button
                            onClick={() => handleQuickComplete(req.id)}
                            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition whitespace-nowrap"
                          >
                            íì¸
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ìë£ë ìì²­ */}
          {completedReceived.length > 0 && (
            <div className="bg-white rounded-lg shadow">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-500">ìë£ë ìì²­ ({completedReceived.length})</h2>
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
                          ìë£
                        </span>
                        <h4 className="font-semibold text-gray-700 line-through">{req.title}</h4>
                      </div>
                      {req.response && (
                        <div className="mt-2 p-2 bg-white rounded border border-green-100">
                          <p className="text-sm text-gray-700">ð¬ {req.response}</p>
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        ë³´ë¸ ì¬ë: {req.createdByName} Â· {formatDate(req.createdAt)}
                        {req.completedAt && ` Â· ìë£: ${formatDate(req.completedAt)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ë³´ë¸ ìì²­ ëª©ë¡ */}
      {activeTab === 'sent' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">ð ë³´ë¸ ìì²­ ëª©ë¡</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <p className="text-center text-gray-500 py-8">ë¡ë© ì¤...</p>
            ) : sentRequests.length === 0 ? (
              <p className="text-center text-gray-500 py-8">ë³´ë¸ ìì²­ì´ ììµëë¤.</p>
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
                            {task.isCompleted ? 'ìë£' : 'ëê¸°ì¤'}
                          </span>
                          <h4 className="font-semibold text-gray-900">{task.title}</h4>
                        </div>
                        {task.description && (
                          <p className="text-sm text-gray-600 mb-1">{task.description}</p>
                        )}
                        {task.isCompleted && task.response && (
                          <div className="mt-2 p-2 bg-white rounded border border-green-100">
                            <p className="text-sm text-gray-700">
                              ð¬ <span className="font-medium">{task.responseByName || task.targetUserName}</span>: {task.response}
                            </p>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          ëì: {task.targetUserName || '-'} Â· {formatDate(task.createdAt)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                        className="ml-2 p-1.5 text-gray-400 hover:text-red-500 transition"
                        title="ì­ì "
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

      {/* ëµì¥ ëª¨ë¬ */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900">ìì²­ ëµì¥</h3>
                <button
                  onClick={() => { setSelectedRequest(null); setResponseText(''); }}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  â
                </button>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-500 mb-1">
                  ë³´ë¸ ì¬ë: {selectedRequest.createdByName} Â· {formatDate(selectedRequest.createdAt)}
                </p>
                <h4 className="font-semibold text-gray-900 mb-1">{selectedRequest.title}</h4>
                {selectedRequest.description && (
                  <p className="text-sm text-gray-600">{selectedRequest.description}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ëµì¥ ë´ì©</label>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="ëµì¥ ë´ì©ì ìë ¥íì¸ì..."
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
                  {responding ? 'ì ì¡ ì¤...' : 'ëµì¥ ë³´ë´ê³  ìë£'}
                </button>
                <button
                  onClick={() => handleQuickComplete(selectedRequest.id).then(() => { setSelectedRequest(null); setResponseText(''); })}
                  className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  ë°ë¡ ìë£
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ë³´ë¸ ìì²­ ìì¸ ë³´ê¸° ëª¨ë¬ */}
      {viewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-gray-900">ìì²­ ìì¸</h3>
                <button
                  onClick={() => setViewingRequest(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl"
                >
                  â
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    viewingRequest.isCompleted ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {viewingRequest.isCompleted ? 'ìë£' : 'ëê¸°ì¤'}
                  </span>
                </div>

                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-1">ë´ê° ë³´ë¸ ìì²­</p>
                  <h4 className="font-semibold text-gray-900">{viewingRequest.title}</h4>
                  {viewingRequest.description && (
                    <p className="text-sm text-gray-600 mt-1">{viewingRequest.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">
                    ëì: {viewingRequest.targetUserName} Â· {formatDate(viewingRequest.createdAt)}
                  </p>
                </div>

                {viewingRequest.isCompleted && (
                  <div className="bg-green-50 rounded-lg p-4">
                    <p className="text-xs text-gray-500 mb-1">
                      ð¬ {viewingRequest.responseByName || viewingRequest.targetUserName}ì ëµì¥
                    </p>
                    <p className="text-sm text-gray-800">
                      {viewingRequest.response || '(ëµì¥ ìì´ ìë£ë¨)'}
                    </p>
                    {viewingRequest.completedAt && (
                      <p className="text-xs text-gray-500 mt-2">
                        ìë£: {formatDate(viewingRequest.completedAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setViewingRequest(null)}
                className="w-full mt-4 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
              >
                ë«ê¸°
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
