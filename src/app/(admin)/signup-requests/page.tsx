'use client';

import { useEffect, useState } from 'react';

// ── 앱 가입신청 (학생/학부모 모바일 앱) ──────────────────────────────
interface SignupRequest {
  id: string;
  studentName: string;
  school: string | null;
  grade: string | null;
  parentName: string | null;
  parentPhone: string;
  studentPhone: string | null;
  message: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
}

// ── 회원 가입신청 (웹 관리자 Google/이메일 가입) ──────────────────────
interface WebUser {
  id: string;
  email: string;
  name: string;
  role: string;
  phone: string | null;
  image: string | null;
  provider: string;
  isApproved: boolean;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: 'TEACHER', label: '강사' },
  { value: 'DESK', label: '데스크' },
  { value: 'ADMIN', label: '관리자' },
];

const roleLabel: Record<string, string> = {
  ADMIN: '관리자',
  TEACHER: '강사',
  DESK: '데스크',
  PARENT: '학부모',
  STUDENT: '학생',
};

const roleColor: Record<string, string> = {
  ADMIN: 'bg-purple-100 text-purple-700',
  TEACHER: 'bg-blue-100 text-blue-700',
  DESK: 'bg-green-100 text-green-700',
};

const providerColor: Record<string, string> = {
  google: 'text-red-500',
  email: 'text-gray-500',
};

const statusLabel: Record<string, string> = {
  PENDING: '대기중',
  APPROVED: '승인',
  REJECTED: '거절',
};

const statusColor: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function SignupRequestsPage() {
  const [activeTab, setActiveTab] = useState<'app' | 'member'>('app');

  // ── 앱 가입신청 state ──
  const [requests, setRequests] = useState<SignupRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<SignupRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processingRequest, setProcessingRequest] = useState(false);

  // ── 회원 가입신청 state ──
  const [webUsers, setWebUsers] = useState<WebUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [selectedUser, setSelectedUser] = useState<WebUser | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>('TEACHER');
  const [processingUser, setProcessingUser] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  useEffect(() => {
    fetchRequests();
    fetchWebUsers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchRequests();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  // ── 앱 가입신청 함수 ──────────────────────────────────────────────
  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await fetch(`/api/signup-requests?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests);
      }
    } catch (err) {
      console.error('Failed to fetch signup requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setProcessingRequest(true);
    try {
      const res = await fetch(`/api/signup-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminNotes }),
      });
      if (res.ok) {
        setSelectedRequest(null);
        setAdminNotes('');
        fetchRequests();
      }
    } catch (err) {
      console.error('Failed to update:', err);
    } finally {
      setProcessingRequest(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/signup-requests/${id}`, { method: 'DELETE' });
      if (res.ok) fetchRequests();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  // ── 회원 가입신청 함수 ────────────────────────────────────────────
  const fetchWebUsers = async () => {
    try {
      setLoadingUsers(true);
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setWebUsers(data.users);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenApproveModal = (user: WebUser) => {
    setSelectedUser(user);
    setSelectedRole(user.role || 'TEACHER');
  };

  const handleApproveUser = async () => {
    if (!selectedUser) return;
    setProcessingUser(true);
    try {
      const res = await fetch(`/api/users/${selectedUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isApproved: true, role: selectedRole }),
      });
      if (res.ok) {
        setSelectedUser(null);
        fetchWebUsers();
      } else {
        const errData = await res.json();
        alert(errData.error || '승인에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to approve user:', err);
    } finally {
      setProcessingUser(false);
    }
  };

  const handleRejectUser = async (userId: string) => {
    if (!confirm('이 회원의 가입신청을 거절하시겠습니까? 계정이 삭제됩니다.')) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setSelectedUser(null);
        fetchWebUsers();
      }
    } catch (err) {
      console.error('Failed to reject user:', err);
    }
  };

  // ── 이름 수정 ──────────────────────────────────────────────────
  const handleStartEditName = (user: WebUser) => {
    setEditingUserId(user.id);
    setEditingName(user.name || '');
  };

  const handleCancelEditName = () => {
    setEditingUserId(null);
    setEditingName('');
  };

  const handleSaveUserName = async () => {
    if (!editingUserId || editingName.trim().length === 0) {
      alert('이름을 입력해주세요.');
      return;
    }
    try {
      const res = await fetch(`/api/users/${editingUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      if (res.ok) {
        setEditingUserId(null);
        setEditingName('');
        fetchWebUsers();
      } else {
        const errData = await res.json();
        alert(errData.error || '이름 변경에 실패했습니다.');
      }
    } catch (err) {
      console.error('Failed to update user name:', err);
      alert('이름 변경에 실패했습니다.');
    }
  };

  // ── 유틸 ─────────────────────────────────────────────────────────
  const formatPhone = (phone: string) => {
    if (phone.length === 11) return `${phone.slice(0, 3)}-${phone.slice(3, 7)}-${phone.slice(7)}`;
    return phone;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' });
  };

  const pendingAppCount = requests.filter(r => r.status === 'PENDING').length;
  const pendingMemberCount = webUsers.filter(u => !u.isApproved).length;

  const approvedUsers = webUsers.filter(u => u.isApproved);
  const pendingUsers = webUsers.filter(u => !u.isApproved);

  const filteredApprovedUsers = approvedUsers.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">가입신청 관리</h1>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('app')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'app'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📋 앱 가입신청
          {pendingAppCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {pendingAppCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('member')}
          className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'member'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔐 회원 가입신청
          {pendingMemberCount > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
              {pendingMemberCount}
            </span>
          )}
        </button>
      </div>

      {/* ──────────────── 앱 가입신청 탭 ──────────────── */}
      {activeTab === 'app' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base font-semibold text-gray-700">🧑 가입 신청 목록</span>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4">
            {(['', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                {s === '' ? '전체' : statusLabel[s]}
              </button>
            ))}
          </div>

          {/* List */}
          {loadingRequests ? (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <p className="text-4xl mb-3">🙅</p>
              <p className="text-gray-500">가입신청이 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="bg-white rounded-xl border border-gray-200 p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-bold text-gray-900">{req.studentName}</h3>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusColor[req.status]}`}>
                          {statusLabel[req.status]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div><span className="text-gray-400">학교</span><p className="text-gray-700 font-medium">{req.school || '-'}</p></div>
                        <div><span className="text-gray-400">학년</span><p className="text-gray-700 font-medium">{req.grade || '-'}</p></div>
                        <div><span className="text-gray-400">학부모</span><p className="text-gray-700 font-medium">{req.parentName || '-'}</p></div>
                        <div><span className="text-gray-400">학부모 연락처</span><p className="text-gray-700 font-medium">{formatPhone(req.parentPhone)}</p></div>
                      </div>
                      {req.studentPhone && <p className="text-sm text-gray-500 mt-1">학생 연락처: {formatPhone(req.studentPhone)}</p>}
                      {req.message && (
                        <div className="mt-2 bg-gray-50 rounded-lg p-3">
                          <span className="text-xs text-gray-400">요청사항</span>
                          <p className="text-sm text-gray-700">{req.message}</p>
                        </div>
                      )}
                      {req.adminNotes && (
                        <div className="mt-2 bg-blue-50 rounded-lg p-3">
                          <span className="text-xs text-blue-400">관리자 메모</span>
                          <p className="text-sm text-blue-700">{req.adminNotes}</p>
                        </div>
                      )}
                      <p className="text-xs text-gray-400 mt-2">신청일: {formatDate(req.createdAt)}</p>
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {req.status === 'PENDING' && (
                        <button
                          onClick={() => { setSelectedRequest(req); setAdminNotes(''); }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                        >
                          처리
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteRequest(req.id)}
                        className="px-4 py-2 text-red-500 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ──────────────── 회원 가입신청 탭 ──────────────── */}
      {activeTab === 'member' && (
        <div>
          {/* 승인 대기 중 */}
          <div className="mb-8">
            <h2 className="text-base font-bold text-gray-800 mb-1">⏳ 승인 대기 중</h2>
            <p className="text-sm text-gray-500 mb-4">
              웹 관리자 페이지에서 계정을 생성한 사용자 중 아직 승인되지 않은 목록입니다.
            </p>

            {loadingUsers ? (
              <div className="text-center py-8 text-gray-400">로딩 중...</div>
            ) : pendingUsers.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-gray-200">
                <p className="text-4xl mb-2">✅</p>
                <p className="text-gray-500 text-sm">대기 중인 가입신청이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div key={user.id} className="bg-white rounded-xl border border-orange-100 shadow-sm p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {user.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={user.image} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                            {(user.name || user.email)[0].toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${roleColor[user.role] || 'bg-gray-100 text-gray-600'}`}>
                              {roleLabel[user.role] || user.role}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">승인 대기</span>
                          </div>
                          <p className="text-sm text-gray-700">
                            📧 {user.email}
                            {user.name && <span className="ml-2 font-medium text-gray-900">({user.name})</span>}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            가입: {formatDate(user.createdAt)} ·{' '}
                            <span className={`font-medium ${providerColor[user.provider] || 'text-gray-500'}`}>
                              {user.provider === 'google' ? 'Google' : '이메일'}
                            </span>
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenApproveModal(user)}
                          className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
                        >
                          승인
                        </button>
                        <button
                          onClick={() => handleRejectUser(user.id)}
                          className="px-5 py-2 text-red-500 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-50 transition-colors"
                        >
                          거절
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 가입된 회원 목록 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-gray-800">👤 가입된 회원 목록</h2>
              <span className="text-sm text-gray-500">총 {approvedUsers.length}명</span>
            </div>

            {/* 검색 */}
            <div className="relative mb-3">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔍</span>
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="이름 또는 이메일 검색..."
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-xs"
              />
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">이름</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">이메일</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">역할</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">연락처</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">가입방법</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">가입일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredApprovedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-400">회원이 없습니다.</td>
                    </tr>
                  ) : (
                    filteredApprovedUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {editingUserId === user.id ? (
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveUserName();
                                if (e.key === 'Escape') handleCancelEditName();
                              }}
                              onBlur={handleSaveUserName}
                              autoFocus
                              className="w-full border border-blue-400 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : (
                            <span className="flex items-center gap-1.5 group">
                              {user.name || '-'}
                              <button
                                onClick={() => handleStartEditName(user)}
                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-600 transition-all"
                                title="이름 수정"
                              >
                                ✏️
                              </button>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-600">{user.email}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${roleColor[user.role] || 'bg-gray-100 text-gray-600'}`}>
                            {roleLabel[user.role] || user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{user.phone ? formatPhone(user.phone) : '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`font-medium text-sm ${providerColor[user.provider] || 'text-gray-500'}`}>
                            {user.provider === 'google' ? 'Google' : '이메일'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">{formatDate(user.createdAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── 앱 가입신청 처리 모달 ──────────────── */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              가입신청 처리 - {selectedRequest.studentName}
            </h3>
            <div className="mb-4 bg-gray-50 rounded-lg p-3 text-sm">
              <p><strong>학교:</strong> {selectedRequest.school || '-'} / <strong>학년:</strong> {selectedRequest.grade || '-'}</p>
              <p><strong>학부모:</strong> {selectedRequest.parentName || '-'} ({formatPhone(selectedRequest.parentPhone)})</p>
              {selectedRequest.message && <p className="mt-1"><strong>요청사항:</strong> {selectedRequest.message}</p>}
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">관리자 메모 (선택)</label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="메모를 입력하세요..."
                rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleStatusChange(selectedRequest.id, 'APPROVED')} disabled={processingRequest} className="flex-1 py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50">승인</button>
              <button onClick={() => handleStatusChange(selectedRequest.id, 'REJECTED')} disabled={processingRequest} className="flex-1 py-2.5 bg-red-500 text-white rounded-lg text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50">거절</button>
              <button onClick={() => { setSelectedRequest(null); setAdminNotes(''); }} className="px-4 py-2.5 text-gray-500 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">취소</button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── 회원 승인 모달 (역할 선택) ──────────────── */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">회원 가입 승인</h3>
            <p className="text-sm text-gray-500 mb-5">승인 전 역할을 선택해주세요.</p>

            {/* 회원 정보 */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-4 mb-5">
              {selectedUser.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={selectedUser.image} alt={selectedUser.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-lg">
                  {(selectedUser.name || selectedUser.email)[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-gray-900">{selectedUser.name || '(이름 없음)'}</p>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {selectedUser.provider === 'google' ? '🔴 Google 가입' : '📧 이메일 가입'} · {formatDate(selectedUser.createdAt)}
                </p>
              </div>
            </div>

            {/* 역할 선택 */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                역할 선택 <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {ROLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSelectedRole(opt.value)}
                    className={`py-3 rounded-xl text-sm font-semibold border-2 transition-all ${
                      selectedRole === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <button
                onClick={handleApproveUser}
                disabled={processingUser}
                className="flex-1 py-3 bg-green-600 text-white rounded-xl text-sm font-bold hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {processingUser
                  ? '처리 중...'
                  : `✅ ${ROLE_OPTIONS.find(o => o.value === selectedRole)?.label}(으)로 승인`}
              </button>
              <button
                onClick={() => setSelectedUser(null)}
                className="px-5 py-3 text-gray-500 border border-gray-200 rounded-xl text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
