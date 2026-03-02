'use client';

import { useEffect, useState } from 'react';

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
  createdAt: string;
}

const statusLabel: Record<string, string> = {
  SCHEDULED: '예약됨',
  COMPLETED: '완료',
  CANCELLED: '취소',
};

const statusColor: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const GRADE_OPTIONS = [
  '초등 1학년', '초등 2학년', '초등 3학년', '초등 4학년', '초등 5학년', '초등 6학년',
  '중등 1학년', '중등 2학년', '중등 3학년',
  '고등 1학년', '고등 2학년', '고등 3학년',
  '기타',
];

const TIME_OPTIONS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00',
];

const emptyForm = {
  name: '',
  school: '',
  grade: '',
  parentPhone: '',
  testDate: '',
  testTime: '',
  notes: '',
  priorLevel: '',
  testScore: '',
  counselingNotes: '',
};

export default function EntranceTestPage() {
  const [tests, setTests] = useState<EntranceTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState(emptyForm);

  // ── 수정 모달 ──
  const [editingTest, setEditingTest] = useState<EntranceTest | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/entrance-tests');
      const data = await res.json();
      setTests(data);
    } catch (error) {
      console.error('Failed to fetch tests:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
  }, []);

  const handleFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEditFormChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
  };

  // ── 새 예약 등록 ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.parentPhone || !form.testDate || !form.testTime) {
      alert('이름, 학부모 연락처, 테스트 날짜, 시간을 입력해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/entrance-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error('Failed to create');

      setShowModal(false);
      setForm(emptyForm);
      setMessage('예약이 등록되었습니다.');
      setTimeout(() => setMessage(''), 3000);
      fetchTests();
    } catch {
      alert('예약 등록에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── 수정 모달 열기 ──
  const openEditModal = (test: EntranceTest) => {
    setEditingTest(test);
    setEditForm({
      name: test.name,
      school: test.school || '',
      grade: test.grade || '',
      parentPhone: test.parentPhone,
      testDate: test.testDate,
      testTime: test.testTime,
      notes: test.notes || '',
      priorLevel: test.priorLevel || '',
      testScore: test.testScore || '',
      counselingNotes: test.counselingNotes || '',
    });
  };

  // ── 수정 저장 ──
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTest) return;
    if (!editForm.name || !editForm.parentPhone || !editForm.testDate || !editForm.testTime) {
      alert('이름, 학부모 연락처, 테스트 날짜, 시간을 입력해주세요.');
      return;
    }

    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/entrance-tests/${editingTest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          school: editForm.school || null,
          grade: editForm.grade || null,
          parentPhone: editForm.parentPhone,
          testDate: editForm.testDate,
          testTime: editForm.testTime,
          notes: editForm.notes || null,
          priorLevel: editForm.priorLevel || null,
          testScore: editForm.testScore || null,
          counselingNotes: editForm.counselingNotes || null,
        }),
      });

      if (!res.ok) throw new Error('Failed to update');

      setEditingTest(null);
      setMessage('예약이 수정되었습니다.');
      setTimeout(() => setMessage(''), 3000);
      fetchTests();
    } catch {
      alert('수정에 실패했습니다.');
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/entrance-tests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      fetchTests();
    } catch {
      alert('상태 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`${name} 님의 입학테스트 예약을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/entrance-tests/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      fetchTests();
    } catch {
      alert('삭제에 실패했습니다.');
    }
  };

  const filteredTests = tests.filter((t) => {
    const matchStatus = filterStatus === 'ALL' || t.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      (t.school || '').toLowerCase().includes(q) ||
      t.parentPhone.includes(q);
    return matchStatus && matchSearch;
  });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  };

  const today = new Date().toISOString().split('T')[0];
  const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // ── 공통 폼 필드 렌더러 ──
  const renderFormFields = (
    data: typeof emptyForm,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void,
    isEdit = false
  ) => (
    <div className="space-y-4">
      {/* 이름 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          이름 <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          name="name"
          value={data.name}
          onChange={onChange}
          placeholder="학생 이름"
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 학교 + 학년 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">학교</label>
          <input
            type="text"
            name="school"
            value={data.school}
            onChange={onChange}
            placeholder="예: 영희초등학교"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">학년</label>
          <select
            name="grade"
            value={data.grade}
            onChange={onChange}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">선택</option>
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 학부모 연락처 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          학부모 연락처 <span className="text-red-500">*</span>
        </label>
        <input
          type="tel"
          name="parentPhone"
          value={data.parentPhone}
          onChange={onChange}
          placeholder="010-0000-0000"
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* 테스트 날짜 + 시간 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            테스트 날짜 <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            name="testDate"
            value={data.testDate}
            onChange={onChange}
            required
            min={isEdit ? undefined : today}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            테스트 시간 <span className="text-red-500">*</span>
          </label>
          <select
            name="testTime"
            value={data.testTime}
            onChange={onChange}
            required
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">시간 선택</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
        <textarea
          name="notes"
          value={data.notes}
          onChange={onChange}
          placeholder="특이사항, 문의 내용 등..."
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      {/* 선행정도 + 테스트 점수 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">선행정도</label>
          <input
            type="text"
            name="priorLevel"
            value={data.priorLevel}
            onChange={onChange}
            placeholder="예: 초등 수학"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">테스트 점수</label>
          <input
            type="text"
            name="testScore"
            value={data.testScore}
            onChange={onChange}
            placeholder="예: 85점"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* 상담내용 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">상담내용</label>
        <textarea
          name="counselingNotes"
          value={data.counselingNotes}
          onChange={onChange}
          placeholder="상담 내용을 입력해주세요..."
          rows={3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">입학테스트 예약</h1>
            <p className="text-gray-500 mt-1">
              총 {tests.filter(t => t.status === 'SCHEDULED').length}건 예약 중
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium shadow"
          >
            + 새 예약 등록
          </button>
        </div>

        {/* 필터 */}
        <div className="bg-white rounded-lg shadow p-3 sm:p-4 mb-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
          <input
            type="text"
            placeholder="이름, 학교, 연락처 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filterStatus === s
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {s === 'ALL' ? '전체' : statusLabel[s]}
              </button>
            ))}
          </div>
        </div>

        {/* 테스트 목록 */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">로딩 중...</div>
        ) : filteredTests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            예약된 입학테스트가 없습니다.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTests.map((test) => {
              const isToday = test.testDate === today;
              const isSoon = test.testDate > today && test.testDate <= inThreeDays;
              const isPast = test.testDate < today && test.status === 'SCHEDULED';

              return (
                <div
                  key={test.id}
                  className={`bg-white rounded-lg shadow p-5 border-l-4 ${
                    isPast ? 'border-red-400' :
                    isToday ? 'border-orange-400' :
                    isSoon ? 'border-yellow-400' :
                    test.status === 'COMPLETED' ? 'border-green-400' :
                    test.status === 'CANCELLED' ? 'border-gray-300' :
                    'border-blue-400'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-lg font-bold text-gray-900">{test.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[test.status]}`}>
                          {statusLabel[test.status]}
                        </span>
                        {isToday && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white animate-pulse">
                            오늘
                          </span>
                        )}
                        {isSoon && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-white">
                            D-{Math.ceil((new Date(test.testDate + 'T00:00:00').getTime() - new Date(today + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))}
                          </span>
                        )}
                        {isPast && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600">
                            날짜 초과
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-gray-600 mb-3">
                        <div>
                          <span className="font-medium text-gray-500 block text-xs">학교</span>
                          {test.school || '-'}
                        </div>
                        <div>
                          <span className="font-medium text-gray-500 block text-xs">학년</span>
                          {test.grade || '-'}
                        </div>
                        <div>
                          <span className="font-medium text-gray-500 block text-xs">학부모 연락처</span>
                          {test.parentPhone}
                        </div>
                        <div>
                          <span className="font-medium text-gray-500 block text-xs">테스트 일시</span>
                          <span className="font-semibold text-gray-900">
                            {formatDate(test.testDate)} {test.testTime}
                          </span>
                        </div>
                      </div>
                      {(test.priorLevel || test.testScore) && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          {test.priorLevel && (
                            <div>
                              <span className="font-medium text-gray-500 block text-xs">선행정도</span>
                              <span className="text-sm font-semibold text-purple-700">{test.priorLevel}</span>
                            </div>
                          )}
                          {test.testScore && (
                            <div>
                              <span className="font-medium text-gray-500 block text-xs">테스트 점수</span>
                              <span className="text-sm font-semibold text-blue-700">{test.testScore}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {test.notes && (
                        <div className="bg-blue-50 border-l-2 border-blue-400 rounded px-3 py-2 mt-2">
                          <div className="flex items-start gap-2">
                            <span className="text-lg leading-none">📝</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-blue-700 mb-1">메모</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{test.notes}</p>
                            </div>
                          </div>
                        </div>
                      )}
                      {test.counselingNotes && (
                        <div className="bg-green-50 border-l-2 border-green-400 rounded px-3 py-2 mt-2">
                          <div className="flex items-start gap-2">
                            <span className="text-lg leading-none">💬</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-green-700 mb-1">상담내용</p>
                              <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{test.counselingNotes}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap items-start">
                      {/* ✏️ 수정 버튼 */}
                      <button
                        onClick={() => openEditModal(test)}
                        className="px-3 py-1.5 text-sm bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition font-medium"
                      >
                        ✏️ 수정
                      </button>

                      {test.status === 'SCHEDULED' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(test.id, 'COMPLETED')}
                            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                          >
                            완료
                          </button>
                          <button
                            onClick={() => handleStatusChange(test.id, 'CANCELLED')}
                            className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition font-medium"
                          >
                            취소
                          </button>
                        </>
                      )}
                      {test.status !== 'SCHEDULED' && (
                        <button
                          onClick={() => handleStatusChange(test.id, 'SCHEDULED')}
                          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition font-medium"
                        >
                          예약 복구
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(test.id, test.name)}
                        className="px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 새 예약 모달 ─── */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-gray-900">입학테스트 예약 등록</h2>
              <button onClick={() => { setShowModal(false); setForm(emptyForm); }}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleSubmit}>
              {renderFormFields(form, handleFormChange)}
              <div className="flex gap-3 pt-4 mt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                >
                  {submitting ? '등록 중...' : '예약 등록'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(emptyForm); }}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── 수정 모달 ─── */}
      {editingTest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">예약 수정</h2>
                <p className="text-sm text-gray-500 mt-1">{editingTest.name} 님의 예약을 수정합니다</p>
              </div>
              <button onClick={() => setEditingTest(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
            </div>
            <form onSubmit={handleEditSubmit}>
              {renderFormFields(editForm, handleEditFormChange, true)}
              <div className="flex gap-3 pt-4 mt-2">
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium disabled:opacity-50"
                >
                  {editSubmitting ? '저장 중...' : '수정 저장'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTest(null)}
                  className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
                >
                  취소
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 토스트 */}
      {message && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg">
          {message}
        </div>
      )}
    </div>
  );
}
