'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface Classroom {
  id: string;
  name: string;
  subject: {
    id: string;
    name: string;
  };
  teacher: {
    id: string;
    name: string;
  };
  schedule: string | null;
  maxCapacity: number;
  status: string;
  enrollments: any[];
  grades: any[];
  assignments: any[];
}

interface Student {
  id: string;
  name: string;
  studentNumber: string;
  school: string | null;
  grade: string | null;
}

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('students');
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<Partial<Classroom>>({});

  const fetchData = async () => {
    try {
      setLoading(true);
      const [classRes, studentsRes] = await Promise.all([
        fetch(`/api/classes/${classId}`),
        fetch('/api/students?limit=1000'),
      ]);

      if (!classRes.ok || !studentsRes.ok) throw new Error('Failed to fetch');

      const classData = await classRes.json();
      const studentsData = await studentsRes.json();

      setClassroom(classData);
      setEditData(classData);
      setAllStudents(studentsData.students);
    } catch (err) {
      setError('데이터를 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [classId]);

  const enrolledStudentIds = classroom?.enrollments.map((e: any) => e.studentId) || [];
  const availableStudents = allStudents.filter(
    (s) => !enrolledStudentIds.includes(s.id)
  );

  const handleAddStudent = async (studentId: string) => {
    try {
      const response = await fetch(`/api/classes/${classId}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });

      if (!response.ok) throw new Error('Failed to enroll');

      setShowAddModal(false);
      setSearchQuery('');
      fetchData();
    } catch (err) {
      alert('수강생 추가에 실패했습니다.');
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (confirm('수강생을 제거하시겠습니까?')) {
      try {
        const response = await fetch(`/api/classes/${classId}/enroll`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId }),
        });

        if (!response.ok) throw new Error('Failed to remove');
        fetchData();
      } catch (err) {
        alert('제거에 실패했습니다.');
      }
    }
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setEditData((prev) => ({
      ...prev,
      [name]: name === 'maxCapacity' ? parseInt(value) : value,
    }));
  };

  const handleSave = async () => {
    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editData.name,
          schedule: editData.schedule,
          maxCapacity: editData.maxCapacity,
          status: editData.status,
        }),
      });

      if (!response.ok) throw new Error('Failed to update');

      const updated = await response.json();
      setClassroom(updated);
      setIsEditing(false);
    } catch (err) {
      alert('저장에 실패했습니다.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">로딩 중...</p>
      </div>
    );
  }

  if (!classroom) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <p className="text-red-600">{error || '반을 찾을 수 없습니다.'}</p>
          <Link href="/admin/classes">
            <button className="mt-4 text-blue-600 hover:text-blue-800">← 반 목록</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <Link href="/admin/classes">
          <button className="mb-6 text-blue-600 hover:text-blue-800 font-medium">
            ← 반 목록
          </button>
        </Link>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{classroom.name}</h1>
              <div className="mt-2 space-y-1">
                <p className="text-gray-600">과목: {classroom.subject.name}</p>
                <p className="text-gray-600">담당강사: {classroom.teacher.name}</p>
                <p className="text-gray-600">
                  수강인원: {classroom.enrollments.length}/{classroom.maxCapacity}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (isEditing) {
                  setEditData(classroom);
                } else {
                  setEditData(classroom);
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
                  반 이름
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
                    시간표
                  </label>
                  <input
                    type="text"
                    name="schedule"
                    value={editData.schedule || ''}
                    onChange={handleEditChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    정원
                  </label>
                  <input
                    type="number"
                    name="maxCapacity"
                    value={editData.maxCapacity || 0}
                    onChange={handleEditChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
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
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="border-b flex">
            {[
              { id: 'students', label: '수강생' },
              { id: 'grades', label: '성적' },
              { id: 'assignments', label: '과제' },
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
            {activeTab === 'students' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">수강생 관리</h3>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    수강생 추가
                  </button>
                </div>

                {classroom.enrollments.length === 0 ? (
                  <p className="text-gray-500">수강생이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            이름
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            학번
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            학교
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            학년
                          </th>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            작업
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {classroom.enrollments.map((enrollment) => (
                          <tr key={enrollment.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              <Link
                                href={`/admin/counseling?studentId=${enrollment.student.id}&studentName=${encodeURIComponent(enrollment.student.name)}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {enrollment.student.name}
                              </Link>
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {enrollment.student.studentNumber}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {enrollment.student.school || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm text-gray-600">
                              {enrollment.student.grade || '-'}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <button
                                onClick={() => handleRemoveStudent(enrollment.studentId)}
                                className="text-red-600 hover:text-red-900 font-medium"
                              >
                                제거
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'grades' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">성적 관리</h3>
                {classroom.grades.length === 0 ? (
                  <p className="text-gray-500">성적 기록이 없습니다.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">
                            학생
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
                        {classroom.grades.map((grade) => (
                          <tr key={grade.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2 text-sm font-medium text-gray-900">
                              {grade.student.name}
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

            {activeTab === 'assignments' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">과제 관리</h3>
                {classroom.assignments.length === 0 ? (
                  <p className="text-gray-500">과제가 없습니다.</p>
                ) : (
                  <div className="space-y-4">
                    {classroom.assignments.map((assignment) => (
                      <div key={assignment.id} className="border rounded-lg p-4">
                        <h4 className="font-semibold text-gray-900">
                          {assignment.title}
                        </h4>
                        <p className="text-sm text-gray-600 mt-1">
                          {assignment.description}
                        </p>
                        <div className="flex justify-between mt-2 text-sm text-gray-600">
                          <span>제출: {assignment.submissions.length}명</span>
                          <span>마감: {assignment.dueDate}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'attendance' && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">출결 관리</h3>
                <p className="text-gray-500">출결 기능은 준비 중입니다.</p>
              </div>
            )}
          </div>
        </div>

        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-3 sm:p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">수강생 추가</h2>

              <input
                type="text"
                placeholder="이름으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
              />

              <div className="max-h-96 overflow-y-auto border rounded-lg">
                {availableStudents.filter((s) =>
                  s.name.toLowerCase().includes(searchQuery.toLowerCase())
                ).length === 0 ? (
                  <p className="p-4 text-gray-500 text-center">
                    추가할 수 있는 수강생이 없습니다.
                  </p>
                ) : (
                  availableStudents
                    .filter((s) =>
                      s.name.toLowerCase().includes(searchQuery.toLowerCase())
                    )
                    .map((student) => (
                      <div
                        key={student.id}
                        className="flex justify-between items-center p-3 border-b hover:bg-gray-50"
                      >
                        <div>
                          <p className="font-medium text-gray-900">{student.name}</p>
                          <p className="text-sm text-gray-600">
                            {student.studentNumber}
                          </p>
                        </div>
                        <button
                          onClick={() => handleAddStudent(student.id)}
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm font-medium"
                        >
                          추가
                        </button>
                      </div>
                    ))
                )}
              </div>

              <button
                onClick={() => setShowAddModal(false)}
                className="w-full mt-4 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition font-medium"
              >
                닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
