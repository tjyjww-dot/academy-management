'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

interface CounselingRequest {
  id: string;
  title: string;
  description?: string;
  parentId?: string;
  studentId: string;
  parent?: { name: string; phone?: string };
  student: { name: string; phone?: string };
  preferredDate?: string;
  status: string;
  adminNotes?: string;
  sessionDate?: string;
  sessionNotes?: string;
  createdByName?: string | null;
  createdAt: string;
}

interface Student {
  id: string;
  name: string;
  phone?: string;
  parentPhone?: string;
  parent?: {
    phone?: string;
  };
}

const statusLabels: Record<string, string> = {
  PENDING: '대기중',
  CONFIRMED: '확정',
  COMPLETED: '완료',
  CANCELLED: '취소',
};

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

export default function CounselingPage() {
  const searchParams = useSearchParams();
  const [counselingRequests, setCounselingRequests] = useState<CounselingRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<CounselingRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [studentData, setStudentData] = useState<Student | null>(null);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Form states
  const [formData, setFormData] = useState({
    status: 'PENDING',
    adminNotes: '',
    sessionDate: '',
    sessionNotes: '',
    title: '',
    description: '',
  });

  useEffect(() => {
    fetchCounselingRequests();

    // Check if studentId is in URL params
    const studentId = searchParams.get('studentId');
    const studentName = searchParams.get('studentName');

    if (studentId && studentName) {
      setIsNewRecord(true);
      fetchStudentData(studentId);
      // Create a new counseling request object for display
      setSelectedRequest({
        id: 'new',
        title: '',
        studentId,
        student: { name: studentName },
        status: 'PENDING',
        adminNotes: '',
        sessionDate: '',
        sessionNotes: '',
        createdAt: new Date().toISOString(),
      });
      setFormData({
        status: 'PENDING',
        adminNotes: '',
        sessionDate: '',
        sessionNotes: '',
        title: '',
        description: '',
      });
    }
  }, [searchParams]);

  const fetchCounselingRequests = async () => {
    setLoading(true);
    try {
      const query = statusFilter !== 'ALL' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/counseling${query}`);
      const data = await res.json();
      setCounselingRequests(data);
    } catch (error) {
      console.error('Failed to fetch counseling requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentData = async (studentId: string) => {
    try {
      const res = await fetch(`/api/students/${studentId}`);
      if (res.ok) {
        const data = await res.json();
        setStudentData(data);
      }
    } catch (error) {
      console.error('Failed to fetch student data:', error);
    }
  };

  const handleSelectRequest = (request: CounselingRequest) => {
    setSelectedRequest(request);
    setFormData({
      status: request.status,
      adminNotes: request.adminNotes || '',
      sessionDate: request.sessionDate || '',
      sessionNotes: request.sessionNotes || '',
      title: request.title || '',
      description: request.description || '',
    });
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setSelectedRequest(null);
  };

  const handleUpdateRequest = async () => {
    if (!selectedRequest) return;

    setSaving(true);
    try {
      // If it's a new record (id === 'new'), create a new counseling entry
      if (selectedRequest.id === 'new') {
        const res = await fetch('/api/counseling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId: selectedRequest.studentId,
            title: formData.title || `${selectedRequest.student.name} 상담`,
            description: formData.description || null,
            sessionNotes: formData.sessionNotes || null,
            adminNotes: formData.adminNotes || null,
            status: formData.status,
            sessionDate: formData.sessionDate || null,
          }),
        });

        if (res.ok) {
          const newRequest = await res.json();
          setCounselingRequests([newRequest, ...counselingRequests]);
          setSelectedRequest(null);
          setIsNewRecord(false);
          setFormData({
            status: 'PENDING',
            adminNotes: '',
            sessionDate: '',
            sessionNotes: '',
            title: '',
            description: '',
          });
          setMessage('상담 기록이 생성되었습니다');
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('저장 실패');
        }
      } else {
        // Update existing record
        const res = await fetch(`/api/counseling/${selectedRequest.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: formData.status,
            adminNotes: formData.adminNotes || null,
            sessionDate: formData.sessionDate || null,
            sessionNotes: formData.sessionNotes || null,
          }),
        });

        if (res.ok) {
          const updatedRequest = await res.json();
          setCounselingRequests(
            counselingRequests.map((r) =>
              r.id === selectedRequest.id ? updatedRequest : r
            )
          );
          setSelectedRequest(updatedRequest);
          setMessage('저장되었습니다');
          setTimeout(() => setMessage(''), 3000);
        } else {
          setMessage('저장 실패');
        }
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  const formatPhoneNumber = (phone?: string) => {
    if (!phone) return '-';
    // Format phone number as XXX-XXXX-XXXX or similar
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
    } else if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
    }
    return phone;
  };

  const statusFilterTabs = [
    { value: 'ALL', label: '전체' },
    { value: 'PENDING', label: '대기중' },
    { value: 'COMPLETED', label: '완료' },
    { value: 'CANCELLED', label: '취소' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-4 md:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">상담 관리</h1>

        {/* Status Filter Tabs */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="flex flex-wrap gap-2">
            {statusFilterTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => handleStatusFilterChange(tab.value)}
                className={`px-4 py-2 rounded-md font-medium transition ${
                  statusFilter === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Requests List */}
          <div className="lg:col-span-1">
            {loading ? (
              <p className="text-center text-gray-500">로딩 중...</p>
            ) : counselingRequests.length === 0 ? (
              <p className="text-center text-gray-500">상담 요청이 없습니다</p>
            ) : (
              <div className="space-y-3">
                {counselingRequests.map((request) => (
                  <div
                    key={request.id}
                    onClick={() => handleSelectRequest(request)}
                    className={`p-4 rounded-lg shadow-md cursor-pointer transition ${
                      selectedRequest?.id === request.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-white hover:shadow-lg'
                    }`}
                  >
                    <h3 className="font-bold text-gray-900 mb-1">{request.title}</h3>
                    {request.parent?.name ? (
                      <p className="text-sm text-gray-600">학부모: {request.parent.name}</p>
                    ) : request.createdByName ? (
                      <p className="text-sm text-gray-600">입력: {request.createdByName}</p>
                    ) : null}
                    <p className="text-sm text-gray-600">학생: {request.student.name}</p>
                    <p className="text-xs text-gray-500 mb-2">
                      요청일: {formatDate(request.createdAt)}
                    </p>
                    <div className="flex gap-2 items-center">
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          statusColors[request.status]
                        }`}
                      >
                        {statusLabels[request.status]}
                      </span>
                      {request.preferredDate && (
                        <span className="text-xs text-gray-600">
                          희망일: {request.preferredDate}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Request Detail */}
          <div className="lg:col-span-2 order-first lg:order-last">
            {selectedRequest ? (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  {isNewRecord ? '새 상담 등록' : '상담 요청 상세'}
                </h2>

                {/* Request Info */}
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {!isNewRecord && (
                      <>
                        <div>
                          <p className="text-xs text-gray-600 mb-1">제목</p>
                          <p className="font-semibold text-gray-900">{selectedRequest.title}</p>
                        </div>
                        {selectedRequest.parent && (
                          <div>
                            <p className="text-xs text-gray-600 mb-1">학부모</p>
                            <p className="font-semibold text-gray-900">
                              {selectedRequest.parent?.name}
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    <div>
                      <p className="text-xs text-gray-600 mb-1">학생</p>
                      <p className="font-semibold text-gray-900">
                        {selectedRequest.student.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600 mb-1">학부모 연락처</p>
                      <p className="font-semibold text-gray-900">
                        {formatPhoneNumber(
                          selectedRequest.parent?.phone ||
                          studentData?.parentPhone ||
                          studentData?.parent?.phone
                        )}
                      </p>
                    </div>
                    {!isNewRecord && (
                      <div>
                        <p className="text-xs text-gray-600 mb-1">요청일</p>
                        <p className="font-semibold text-gray-900">
                          {formatDate(selectedRequest.createdAt)}
                        </p>
                      </div>
                    )}
                  </div>

                  {isNewRecord && studentData && (
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-xs font-semibold text-blue-700 mb-2">📞 연락처 정보</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="text-xs text-gray-600">학생 연락처</p>
                          <p className="font-semibold text-gray-900 text-sm">
                            {formatPhoneNumber(studentData.phone)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-600">학부모 연락처</p>
                          <p className="font-semibold text-gray-900 text-sm">
                            {formatPhoneNumber(studentData.parentPhone || studentData.parent?.phone)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!isNewRecord && selectedRequest.description && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-600 mb-1">상담 내용</p>
                      <p className="text-gray-900">{selectedRequest.description}</p>
                    </div>
                  )}

                  {!isNewRecord && selectedRequest.preferredDate && (
                    <div className="mt-4">
                      <p className="text-xs text-gray-600 mb-1">희망 날짜</p>
                      <p className="text-gray-900">{selectedRequest.preferredDate}</p>
                    </div>
                  )}
                </div>

                {/* Admin Form */}
                <div className="space-y-4">
                  {isNewRecord && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        상담 제목 <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                        placeholder="상담 제목을 입력하세요"
                      />
                    </div>
                  )}

                  {isNewRecord && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        상담 요청 설명
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                        placeholder="상담 요청 설명을 입력하세요 (선택사항)"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      상태
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) =>
                        setFormData({ ...formData, status: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    >
                      <option value="PENDING">대기중</option>
                      <option value="COMPLETED">완료</option>
                      <option value="CANCELLED">취소</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      상담 일시
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.sessionDate}
                      onChange={(e) =>
                        setFormData({ ...formData, sessionDate: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      상담 내용
                    </label>
                    <textarea
                      value={formData.sessionNotes}
                      onChange={(e) =>
                        setFormData({ ...formData, sessionNotes: e.target.value })
                      }
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                      placeholder="상담 내용을 입력하세요"
                    />
                  </div>

                  <button
                    onClick={handleUpdateRequest}
                    disabled={saving || (isNewRecord && !formData.title)}
                    className="w-full px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : isNewRecord ? '상담 등록' : '저장'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-md p-6 text-center text-gray-500">
                상담 요청을 선택하세요
              </div>
            )}
          </div>
        </div>

        {/* Toast Message */}
        {message && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
