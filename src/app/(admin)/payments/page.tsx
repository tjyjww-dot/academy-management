'use client';

import { useEffect, useState, useCallback } from 'react';

interface Payment {
  id: string;
  studentId: string;
  yearMonth: string;
  tuitionFee: number;
  specialFee: number;
  otherFee: number;
  totalFee: number;
  remarks: string | null;
  status: string;
  student?: { name: string; studentNumber: string; grade: string; school: string };
}

interface StudentPaymentRow {
  studentId: string;
  studentName: string;
  studentNumber: string;
  grade: string;
  school: string;
  payment: Payment | null;
}

interface StudentHistory {
  id: string;
  name: string;
  studentNumber: string;
  grade: string;
  payments: Payment[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '대기',
  INPUT_DONE: '입력완료',
  SENT: '발송완료',
  PAID: '입금완료',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700',
  INPUT_DONE: 'bg-yellow-100 text-yellow-800',
  SENT: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
};

const STATUS_FLOW = ['PENDING', 'INPUT_DONE', 'SENT', 'PAID'];

function formatCurrency(amount: number) {
  return amount.toLocaleString('ko-KR') + '원';
}

function getNextStatus(current: string): string | null {
  const idx = STATUS_FLOW.indexOf(current);
  if (idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1];
  return null;
}

function getNextStatusLabel(current: string): string | null {
  const next = getNextStatus(current);
  return next ? STATUS_LABELS[next] : null;
}

export default function PaymentsPage() {
  const [activeTab, setActiveTab] = useState<'monthly' | 'search'>('monthly');
  const [yearMonth, setYearMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [rows, setRows] = useState<StudentPaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    tuitionFee: number; specialFee: number; otherFee: number; remarks: string;
  }>({ tuitionFee: 0, specialFee: 0, otherFee: 0, remarks: '' });
  const [showPaid, setShowPaid] = useState(false);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<StudentHistory[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<StudentHistory | null>(null);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments?yearMonth=${yearMonth}`);
      const json = await res.json();
      setRows(json.data || []);
    } catch (error) {
      console.error('Failed to fetch payments:', error);
    } finally {
      setLoading(false);
    }
  }, [yearMonth]);

  useEffect(() => {
    if (activeTab === 'monthly') {
      fetchPayments();
    }
  }, [fetchPayments, activeTab]);

  const handleSave = async (studentId: string) => {
    try {
      const res = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          yearMonth,
          tuitionFee: editData.tuitionFee,
          specialFee: editData.specialFee,
          otherFee: editData.otherFee,
          remarks: editData.remarks,
          status: 'INPUT_DONE',
        }),
      });
      if (res.ok) {
        setEditingRow(null);
        fetchPayments();
      }
    } catch (error) {
      console.error('Failed to save:', error);
    }
  };

  const handleStatusAdvance = async (paymentId: string, currentStatus: string) => {
    const nextStatus = getNextStatus(currentStatus);
    if (!nextStatus) return;

    try {
      const res = await fetch(`/api/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        fetchPayments();
      }
    } catch (error) {
      console.error('Failed to advance status:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/payments/history?search=${encodeURIComponent(searchQuery)}`);
      const json = await res.json();
      setSearchResults(json.data || []);
      setSelectedStudent(null);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const startEdit = (row: StudentPaymentRow) => {
    setEditingRow(row.studentId);
    setEditData({
      tuitionFee: row.payment?.tuitionFee || 0,
      specialFee: row.payment?.specialFee || 0,
      otherFee: row.payment?.otherFee || 0,
      remarks: row.payment?.remarks || '',
    });
  };

  const filteredRows = showPaid
    ? rows
    : rows.filter((r) => r.payment?.status !== 'PAID');

  const changeMonth = (delta: number) => {
    const [y, m] = yearMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setYearMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const summaryStats = {
    total: rows.length,
    inputDone: rows.filter((r) => r.payment?.status === 'INPUT_DONE').length,
    sent: rows.filter((r) => r.payment?.status === 'SENT').length,
    paid: rows.filter((r) => r.payment?.status === 'PAID').length,
    pending: rows.filter((r) => !r.payment || r.payment.status === 'PENDING').length,
    totalAmount: rows.reduce((sum, r) => sum + (r.payment?.totalFee || 0), 0),
    paidAmount: rows.filter((r) => r.payment?.status === 'PAID').reduce((sum, r) => sum + (r.payment?.totalFee || 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">수강료 수납</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('monthly')}
          className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'monthly'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          월별 수납 관리
        </button>
        <button
          onClick={() => setActiveTab('search')}
          className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          학생별 내역 조회
        </button>
      </div>

      {activeTab === 'monthly' && (
        <>
          {/* Month Selector + Stats */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => changeMonth(-1)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h2 className="text-xl font-bold text-gray-900">
                  {yearMonth.replace('-', '년 ')}월
                </h2>
                <button
                  onClick={() => changeMonth(1)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={showPaid}
                  onChange={(e) => setShowPaid(e.target.checked)}
                  className="rounded border-gray-300"
                />
                입금완료 항목 표시
              </label>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-sm text-gray-500">전체 학생</p>
                <p className="text-2xl font-bold text-gray-900">{summaryStats.total}명</p>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 text-center">
                <p className="text-sm text-yellow-600">입력완료</p>
                <p className="text-2xl font-bold text-yellow-700">{summaryStats.inputDone}명</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <p className="text-sm text-blue-600">발송완료</p>
                <p className="text-2xl font-bold text-blue-700">{summaryStats.sent}명</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-sm text-green-600">입금완료</p>
                <p className="text-2xl font-bold text-green-700">{summaryStats.paid}명</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 text-center">
                <p className="text-sm text-purple-600">미처리</p>
                <p className="text-2xl font-bold text-purple-700">{summaryStats.pending}명</p>
              </div>
            </div>
          </div>

          {/* Payment Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-12">
                <svg className="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {showPaid ? '해당 월에 재원 중인 학생이 없습니다.' : '처리할 수납 항목이 없습니다. (모두 입금완료 처리됨)'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">학생</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">수강료</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">특강비</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">기타비용</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">총액</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">비고</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">상태</th>
                      <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">처리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row) => {
                      const isEditing = editingRow === row.studentId;
                      const payment = row.payment;
                      const currentStatus = payment?.status || 'PENDING';

                      return (
                        <tr key={row.studentId} className="hover:bg-gray-50 transition-colors">
                          {/* Student Info */}
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{row.studentName}</p>
                              <p className="text-xs text-gray-500">{row.grade} · {row.school}</p>
                            </div>
                          </td>

                          {/* Fee Fields */}
                          {isEditing ? (
                            <>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={editData.tuitionFee || ''}
                                  onChange={(e) => setEditData({ ...editData, tuitionFee: Number(e.target.value) || 0 })}
                                  className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={editData.specialFee || ''}
                                  onChange={(e) => setEditData({ ...editData, specialFee: Number(e.target.value) || 0 })}
                                  className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="number"
                                  value={editData.otherFee || ''}
                                  onChange={(e) => setEditData({ ...editData, otherFee: Number(e.target.value) || 0 })}
                                  className="w-28 px-2 py-1.5 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-blue-600">
                                  {formatCurrency(editData.tuitionFee + editData.specialFee + editData.otherFee)}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={editData.remarks}
                                  onChange={(e) => setEditData({ ...editData, remarks: e.target.value })}
                                  className="w-36 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                  placeholder="메모"
                                />
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right text-sm text-gray-700">
                                {payment ? formatCurrency(payment.tuitionFee) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-700">
                                {payment ? formatCurrency(payment.specialFee) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-gray-700">
                                {payment ? formatCurrency(payment.otherFee) : '-'}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className="font-bold text-gray-900">
                                  {payment ? formatCurrency(payment.totalFee) : '-'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600 max-w-[150px] truncate">
                                {payment?.remarks || '-'}
                              </td>
                            </>
                          )}

                          {/* Status Badge */}
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[currentStatus]}`}>
                              {STATUS_LABELS[currentStatus]}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isEditing ? (
                                <>
                                  <button
                                    onClick={() => handleSave(row.studentId)}
                                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
                                  >
                                    저장
                                  </button>
                                  <button
                                    onClick={() => setEditingRow(null)}
                                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-300 transition-colors"
                                  >
                                    취소
                                  </button>
                                </>
                              ) : (
                                <>
                                  {(!payment || currentStatus === 'PENDING') && (
                                    <button
                                      onClick={() => startEdit(row)}
                                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
                                    >
                                      입력
                                    </button>
                                  )}
                                  {payment && currentStatus === 'INPUT_DONE' && (
                                    <>
                                      <button
                                        onClick={() => startEdit(row)}
                                        className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-300 transition-colors"
                                      >
                                        수정
                                      </button>
                                      <button
                                        onClick={() => handleStatusAdvance(payment.id, currentStatus)}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
                                      >
                                        발송처리
                                      </button>
                                    </>
                                  )}
                                  {payment && currentStatus === 'SENT' && (
                                    <button
                                      onClick={() => handleStatusAdvance(payment.id, currentStatus)}
                                      className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors"
                                    >
                                      입금확인
                                    </button>
                                  )}
                                  {payment && currentStatus === 'PAID' && (
                                    <span className="text-xs text-green-600 font-medium">완료</span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Box */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">학생 검색</h2>
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="학생 이름을 입력하세요"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="px-6 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {searchLoading ? '검색중...' : '검색'}
              </button>
            </div>
          </div>

          {/* Search Results */}
          {searchResults.length > 0 && !selectedStudent && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="font-semibold text-gray-900">검색 결과 ({searchResults.length}명)</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {searchResults.map((student) => (
                  <button
                    key={student.id}
                    onClick={() => setSelectedStudent(student)}
                    className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors text-left"
                  >
                    <div>
                      <p className="font-medium text-gray-900">{student.name}</p>
                      <p className="text-sm text-gray-500">학번: {student.studentNumber} · {student.grade}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">
                        납부 기록 {student.payments.length}건
                      </span>
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Student Payment History */}
          {selectedStudent && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="text-sm text-blue-600 hover:text-blue-800 mb-1 flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    목록으로
                  </button>
                  <h3 className="text-lg font-bold text-gray-900">{selectedStudent.name} 납부 내역</h3>
                  <p className="text-sm text-gray-500">학번: {selectedStudent.studentNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">총 납부액</p>
                  <p className="text-xl font-bold text-blue-600">
                    {formatCurrency(
                      selectedStudent.payments
                        .filter((p) => p.status === 'PAID')
                        .reduce((sum, p) => sum + p.totalFee, 0)
                    )}
                  </p>
                </div>
              </div>

              {selectedStudent.payments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">납부 내역이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">연월</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">수강료</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">특강비</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">기타</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600">총액</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">비고</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600">상태</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {selectedStudent.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {p.yearMonth.replace('-', '년 ')}월
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-700">
                            {formatCurrency(p.tuitionFee)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-700">
                            {formatCurrency(p.specialFee)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-700">
                            {formatCurrency(p.otherFee)}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-gray-900">
                            {formatCurrency(p.totalFee)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{p.remarks || '-'}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                              {STATUS_LABELS[p.status]}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {searchResults.length === 0 && searchQuery && !searchLoading && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
