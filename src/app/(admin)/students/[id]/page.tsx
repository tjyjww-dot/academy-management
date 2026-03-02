'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: string;
  name: string;
  studentNumber: string;
  dateOfBirth: string | null;
  phone: string | null;
  parentPhone: string | null;
  school: string | null;
  grade: string | null;
  status: string;
  registrationDate: string;
  withdrawalReason: string | null;
  withdrawalDate: string | null;
  parentStudents: any[];
  enrollments: any[];
  grades: any[];
  attendanceRecords: any[];
}

const statusMap: Record<string, string> = {
  ACTIVE: '재원',
  COMPLETED: '수료',
  WITHDRAWN: '퇴원',
};

const attendanceStatusMap: Record<string, string> = {
  PRESENT: '출석',
  ABSENT: '결석',
  LATE: '지각',
  EARLY_LEAVE: '조퇴',
};

export default function StudentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const studentId = params.id as string;

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [editData, setEditData] = useState<Partial<Student>>({});
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);
  const [withdrawalReason, setWithdrawalReason] = useState('');

  const fetchStudent = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/students/${studentId}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setStudent(data);
      setEditData(data);
    } catch (err) {
      setError('원생 정보를 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudent();
  }, [studentId]);

  const handleEditChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setEditData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = async () => {
    // Check if status is being changed to WITHDRAWN
    if (editData.status === 'WITHDRAWN' && student?.status !== 'WITHDRAWN') {
      setShowWithdrawalModal(true);
      return;
    }

    await performSave();
  };

  const performSave = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const response = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editData.name,
          dateOfBirth: editData.dateOfBirth,
          phone: editData.phone,
          parentPhone: editData.parentPhone,
          school: editData.school,
          grade: editData.grade,
          status: editData.status,
          ...(editData.status === 'WITHDRAWN' && {
            withdrawalReason: withdrawalReason,
            withdrawalDate: today,
          }),
        }),
      });

      if (!response.ok) throw new Error('Failed to update');

      const updated = await response.json();
      setStudent(updated);
      setIsEditing(false);
      setShowWithdrawalModal(false);
      setWithdrawalReason('');
    } catch (err) {
      alert('저장에 실패했습니다.');
      console.error(err);
    }
  };

  const handleWithdrawalConfirm = () => {
    performSave();
  };

  const handleWithdrawalCancel = () => {
    // Reset status to original value
    setEditData((prev) => ({
      ...prev,
      status: student?.status || 'ACTIVE',
    }));
    setShowWithdrawalModal(false);
    setWithdrawalReason('');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-red-600">{error || '원생을 찾을 수 없습니다.'}</p>
          <Link href="/admin/students">
            <button className="mt-4 text-blue-600 hover:text-blue-800">← 원생 목록</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <Link href="/admin/students">
          <button className="mb-6 text-blue-600 hover:text-blue-800 font-medium">
            ← 원생 목록
          </button>
        </Link>

        <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{student.name}</h1>
              <p className="text-gray-600 text-lg mt-2">학번: {student.studentNumber}</p>
            </div>
            <button
              onClick={() => {
                if (isEditing) {
                  setEditData(student);
                } else {
                  setEditData(student);
                }
                setIsEditing(!isEditing);
              }}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                isEditing
                  ? 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {isEditing ? '취소' : '수정'}
            </button>
          </div>

          {isEditing && (
            <div className="mt-6 space-y-4 border-t pt-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  이름
                </label>
                <input
                  type="text"
                  name="name"
                  value={editData.name || ''}
                  onChange={handleEditChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    생년월일
                  </label>
                  <input
                    type="date"
                    name="dateOfBirth"
                    value={editData.dateOfBirth || ''}
                    onChange={handleEditChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    연락처
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={editData.phone || ''}
                    onChange={handleEditChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  학부모 연락처
                </label>
                <input
                  type="tel"
                  name="parentPhone"
                  value={editData.parentPhone || ''}
                  onChange={handleEditChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="010-0000-0000"
                />
                <p className="mt-1 text-xs text-gray-500">학부모 앱 로그인에 사용됩니다.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    학교
                  </label>
                  <input
                    type="text"
                    name="school"
                    value={editData.school || ''}
                    onChange={handleEditChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    학년
                  </label>
                  <input
                    type="text"
                    name="grade"
                    value={editData.grade || ''}
                    onChange={handleEditChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  상태
                </label>
                <select
                  name="status"
                  value={editData.status || 'ACTIVE'}
                  onChange={handleEditChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ACTIVE">재원</option>
                  <option value="COMPLETED">수료</option>
                  <option value="WITHDRAWN">퇴원</option>
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  onClick={handleSave}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                >
                  저장
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition font-medium"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {!isEditing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 border-t pt-6">
              <div>
                <p className="text-sm text-gray-600">생년월일</p>
                <p className="text-lg font-medium text-gray-900">
                  {student.dateOfBirth || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">연락처</p>
                <p className="text-lg font-medium text-gray-900">
                  {student.phone || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">학부모 연락처</p>
                <p className="text-lg font-medium text-gray-900">
                  {student.parentPhone || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">학교</p>
                <p className="text-lg font-medium text-gray-900">
                  {student.school || '-'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">학년</p>
                <p className="text-lg font-medium text-gray-900">
                  {student.grade || '-'}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b flex">
            {[
              { id: 'basic', label: '기본정보' },
              { id: 'classes', label: '수강반' },
              { id: 'grades', label: '성적' },
              { id: 'attendance', label: '출결' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-4 py-4 text-center font-medium transition border-b-2 ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-blue-600'
                    : 'text-gray-600 border-transparent hover:text-gray-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {activeTab === 'basic' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">기본정보</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">이름:</span>
                    <span className="font-medium text-gray-900">{student.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">학번:</span>
                    <span className="font-medium text-gray-900">{student.studentNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">상태:</span>
                    <span className="font-medium text-gray-900">
                      {statusMap[student.status] || student.status}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">등록일:</span>
                    <span className="font-medium text-gray-900">
                      {new Date(student.registrationDate).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                  {student.status === 'WITHDRAWN' && (
                    <>
                      <div className="border-t pt-3 mt-3">
                        <div className="flex justify-between">
                          <span className="text-gray-600">퇴원일:</span>
                          <span className="font-medium text-gray-900">
                            {student.withdrawalDate
                              ? new Date(student.withdrawalDate).toLocaleDateString('ko-KR')
                              : '-'}
                          </span>
                        </div>
                      </div>
                      {student.withdrawalReason && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">퇴원 사유:</span>
                          <span className="font-medium text-gray-900 text-right max-w-xs">
                            {student.withdrawalReason}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">보호자:</span>
                    <span className="font-medium text-gray-900">
                      {student.parentStudents.length > 0
                        ? student.parentStudents.map((ps) => ps.parent.name).join(', ')
                        : '-'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'classes' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">수강반</h3>
                {student.enrollments.length === 0 ? (
                  <p className="text-gray-500">수강 중인 반이 없습니다.</p>
                ) : (
                  <div className="space-y-4">
                    {student.enrollments.map((enrollment) => {
                      if (!enrollment.classroom) return null;
                      return (
                        <div key={enrollment.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-gray-900">
                                {enrollment.classroom.name}
                              </p>
                              <p className="text-sm text-gray-600">
                                {enrollment.classroom.subject?.name ?? '-'}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                등록일: {new Date(enrollment.enrollmentDate).toLocaleDateString('ko-KR')}
                              </p>
                            </div>
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                              {enrollment.status === 'ACTIVE' ? '수강중' : '수료'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'grades' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">성적</h3>
                {student.grades.length === 0 ? (
                  <p className="text-gray-500">성적 기록이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6 sm:mx-0">
                    <table className="w-full min-w-max sm:min-w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            과목
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            시험명
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            점수
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            시험일
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {student.grades.map((grade) => (
                          <tr key={grade.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {grade.classroom.subject.name}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {grade.testName}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {grade.score} / {grade.maxScore}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {grade.testDate}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'attendance' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">출결</h3>
                {student.attendanceRecords.length === 0 ? (
                  <p className="text-gray-500">출결 기록이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto -mx-6 sm:mx-0">
                    <table className="w-full min-w-max sm:min-w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            과목
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            날짜
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            상태
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            체크인
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {student.attendanceRecords.map((record) => (
                          <tr key={record.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm text-gray-900">
                              {record.classroom.subject.name}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {record.date}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                record.status === 'PRESENT'
                                  ? 'bg-green-100 text-green-800'
                                  : record.status === 'ABSENT'
                                  ? 'bg-red-100 text-red-800'
                                  : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {attendanceStatusMap[record.status] || record.status}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {record.checkInTime || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {showWithdrawalModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
            <div className="bg-white rounded-lg shadow-lg p-4 sm:p-6 max-w-md w-full">
              <h2 className="text-xl font-bold text-gray-900 mb-4">퇴원 처리</h2>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  퇴원 사유
                </label>
                <textarea
                  value={withdrawalReason}
                  onChange={(e) => setWithdrawalReason(e.target.value)}
                  placeholder="퇴원 사유를 입력해주세요 (선택사항)"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={4}
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleWithdrawalConfirm}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-medium"
                >
                  확인
                </button>
                <button
                  onClick={handleWithdrawalCancel}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition font-medium"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
