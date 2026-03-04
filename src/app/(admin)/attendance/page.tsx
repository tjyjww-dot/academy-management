'use client';

import { useEffect, useState } from 'react';

interface AbsentRecord {
  id: string;
  studentId: string;
  classroomId: string;
  date: string;
  status: string;
  remarks: string | null;
  studentName: string;
  studentNumber: string;
  studentPhone: string | null;
  parentPhone: string | null;
  classroomName: string;
  subjectName: string | null;
}

export default function AttendancePage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [absentRecords, setAbsentRecords] = useState<AbsentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRemarks, setEditingRemarks] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const fetchAbsentStudents = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/attendance/absent?date=${date}`);
      if (response.ok) {
        const data = await response.json();
        setAbsentRecords(data);
        const remarks: Record<string, string> = {};
        data.forEach((r: AbsentRecord) => {
          remarks[r.id] = r.remarks || '';
        });
        setEditingRemarks(remarks);
      }
    } catch (err) {
      console.error('Failed to fetch absent students:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAbsentStudents();
  }, [date]);

  const handleSaveRemarks = async (recordId: string) => {
    try {
      setSavingId(recordId);
      const response = await fetch('/api/attendance/absent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recordId,
          remarks: editingRemarks[recordId] || '',
        }),
      });
      if (response.ok) {
        setSaveSuccess(recordId);
        setTimeout(() => setSaveSuccess(null), 2000);
        // Update local state
        setAbsentRecords(prev =>
          prev.map(r => r.id === recordId ? { ...r, remarks: editingRemarks[recordId] || null } : r)
        );
      }
    } catch (err) {
      console.error('Failed to save remarks:', err);
      alert('저장에 실패했습니다.');
    } finally {
      setSavingId(null);
    }
  };

  // Group by classroom
  const groupedByClass = absentRecords.reduce((acc, record) => {
    const key = record.classroomName;
    if (!acc[key]) acc[key] = [];
    acc[key].push(record);
    return acc;
  }, {} as Record<string, AbsentRecord[]>);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">출결관리</h1>
            <p className="text-gray-600 mt-1">결석 학생 목록 및 보충 계획 관리</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">날짜:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-red-600">{absentRecords.length}</span>
              <span className="text-gray-600">명 결석</span>
            </div>
            <div className="text-sm text-gray-500">
              {Object.keys(groupedByClass).length}개 반에서 결석자 발생
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-xs text-gray-600">보충 입력 완료</span>
              <span className="inline-block w-3 h-3 rounded-full bg-red-400 ml-2"></span>
              <span className="text-xs text-gray-600">미입력</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">로딩 중...</div>
        ) : absentRecords.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-4xl mb-4">{'\u2705'}</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">결석 학생이 없습니다</h3>
            <p className="text-gray-500">{date} 날짜에 결석으로 체크된 학생이 없습니다.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedByClass).map(([className, records]) => (
              <div key={className} className="bg-white rounded-lg shadow">
                <div className="px-4 sm:px-6 py-4 border-b bg-gray-50 rounded-t-lg">
                  <h2 className="font-semibold text-gray-900">
                    {className}
                    <span className="ml-2 text-sm font-normal text-red-600">
                      결석 {records.length}명
                    </span>
                  </h2>
                </div>
                <div className="divide-y">
                  {records.map((record) => (
                    <div key={record.id} className="p-4 sm:p-6">
                      <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-shrink-0 sm:w-48">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full ${record.remarks ? 'bg-green-500' : 'bg-red-400'}`}></span>
                            <span className="font-semibold text-gray-900">{record.studentName}</span>
                          </div>
                          <p className="text-sm text-gray-500 ml-5">학번: {record.studentNumber}</p>
                          {record.parentPhone && (
                            <p className="text-sm text-gray-500 ml-5">학부모: {record.parentPhone}</p>
                          )}
                          <span className={`inline-block mt-1 ml-5 px-2 py-0.5 text-xs rounded ${
                            record.status === 'EXCUSED_ABSENT' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {record.status === 'EXCUSED_ABSENT' ? '사유결석' : '결석'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            보충 계획 메모
                          </label>
                          <textarea
                            value={editingRemarks[record.id] || ''}
                            onChange={(e) => setEditingRemarks(prev => ({
                              ...prev,
                              [record.id]: e.target.value
                            }))}
                            placeholder="보충 수업 계획을 입력하세요 (예: 3/5 화요일 4시 보충 예정)"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                            rows={2}
                          />
                          <div className="flex justify-end mt-2">
                            <button
                              onClick={() => handleSaveRemarks(record.id)}
                              disabled={savingId === record.id}
                              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                                saveSuccess === record.id
                                  ? 'bg-green-600 text-white'
                                  : 'bg-blue-600 text-white hover:bg-blue-700'
                              } disabled:opacity-50`}
                            >
                              {savingId === record.id ? '저장 중...' : saveSuccess === record.id ? '\u2713 저장됨' : '저장'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
