'use client';

import { useState, useEffect } from 'react';

interface Assignment {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  assignmentDate: string;
  submissions: AssignmentSubmission[];
  submissionCount: number;
  totalCount: number;
}

interface AssignmentSubmission {
  id: string;
  studentId: string;
  student: { id: string; name: string };
  status: string;
  score?: number;
  feedback?: string;
  submittedAt?: string;
}

interface ClassroomOption {
  id: string;
  name: string;
}

export default function AssignmentsPage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    assignmentDate: new Date().toISOString().split('T')[0],
  });

  // Submission editing
  const [submissions, setSubmissions] = useState<Record<string, any>>({});

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const fetchClassrooms = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      setClassrooms(data);
    } catch (error) {
      console.error('Failed to fetch classrooms:', error);
    }
  };

  const handleClassroomChange = async (classroomId: string) => {
    setSelectedClassroom(classroomId);
    setSelectedAssignment(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/assignments?classroomId=${classroomId}`);
      const data = await res.json();
      setAssignments(data);
    } catch (error) {
      console.error('Failed to fetch assignments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAssignment = async () => {
    if (!formData.title || !formData.dueDate) {
      setMessage('필수 필드를 입력하세요');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId: selectedClassroom,
          ...formData,
        }),
      });

      if (res.ok) {
        const newAssignment = await res.json();
        setAssignments([...assignments, newAssignment]);
        setFormData({
          title: '',
          description: '',
          dueDate: new Date().toISOString().split('T')[0],
          assignmentDate: new Date().toISOString().split('T')[0],
        });
        setShowModal(false);
        setMessage('과제가 추가되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('과제 생성 실패');
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAssignment = (assignment: Assignment) => {
    setSelectedAssignment(assignment);
    const submissionMap: Record<string, any> = {};
    assignment.submissions.forEach((sub) => {
      submissionMap[sub.studentId] = {
        status: sub.status,
        score: sub.score || '',
        feedback: sub.feedback || '',
      };
    });
    setSubmissions(submissionMap);
  };

  const handleSubmissionChange = (studentId: string, field: string, value: string) => {
    setSubmissions({
      ...submissions,
      [studentId]: {
        ...submissions[studentId],
        [field]: value,
      },
    });
  };

  const handleUpdateSubmission = async (studentId: string) => {
    if (!selectedAssignment) return;

    setSaving(true);
    try {
      const submissionData = submissions[studentId];
      const res = await fetch(
        `/api/assignments/${selectedAssignment.id}/submissions`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            status: submissionData.status,
            score: submissionData.score ? parseFloat(submissionData.score) : undefined,
            feedback: submissionData.feedback || undefined,
          }),
        }
      );

      if (res.ok) {
        setMessage('저장되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('업데이트 실패');
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (assignmentId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/assignments/${assignmentId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAssignments(assignments.filter((a) => a.id !== assignmentId));
        setSelectedAssignment(null);
        setMessage('삭제되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('삭제 실패');
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    }
  };

  const statusOptions = [
    { value: 'NOT_SUBMITTED', label: '미제출' },
    { value: 'SUBMITTED', label: '제출' },
    { value: 'GRADED', label: '채점완료' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">과제 관리</h1>

        {/* Classroom Selection */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            교실 선택
          </label>
          <select
            value={selectedClassroom}
            onChange={(e) => handleClassroomChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">-- 교실 선택 --</option>
            {classrooms.map((classroom) => (
              <option key={classroom.id} value={classroom.id}>
                {classroom.name}
              </option>
            ))}
          </select>
        </div>

        {selectedClassroom && (
          <>
            {/* Create Assignment Button */}
            <div className="mb-6">
              <button
                onClick={() => setShowModal(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition"
              >
                과제 추가
              </button>
            </div>

            {/* Modal */}
            {showModal && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                <div className="bg-white rounded-lg p-6 w-full max-w-md">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">과제 추가</h2>
                  <input
                    type="text"
                    placeholder="과제명"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-blue-500"
                  />
                  <textarea
                    placeholder="설명"
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={formData.assignmentDate}
                    onChange={(e) =>
                      setFormData({ ...formData, assignmentDate: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-blue-500"
                  />
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md mb-6 focus:outline-none focus:ring-blue-500"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-md font-medium hover:bg-gray-400 transition"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleCreateAssignment}
                      disabled={saving}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {saving ? '추가 중...' : '추가'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Assignments List */}
            {loading ? (
              <p className="text-center text-gray-500">로딩 중...</p>
            ) : assignments.length === 0 ? (
              <p className="text-center text-gray-500">과제가 없습니다</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    onClick={() => handleSelectAssignment(assignment)}
                    className={`p-4 rounded-lg shadow-md cursor-pointer transition ${
                      selectedAssignment?.id === assignment.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-white hover:shadow-lg'
                    }`}
                  >
                    <h3 className="font-bold text-gray-900 mb-2">{assignment.title}</h3>
                    <p className="text-sm text-gray-600 mb-2">
                      마감일: {assignment.dueDate}
                    </p>
                    <p className="text-sm text-gray-600 mb-2">
                      제출현황: {assignment.submissionCount}/{assignment.totalCount}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteAssignment(assignment.id);
                      }}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      삭제
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Submissions Detail */}
            {selectedAssignment && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">
                  제출 현황 - {selectedAssignment.title}
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">학생명</th>
                        <th className="px-4 py-2 text-left font-semibold">상태</th>
                        <th className="px-4 py-2 text-left font-semibold">점수</th>
                        <th className="px-4 py-2 text-left font-semibold">피드백</th>
                        <th className="px-4 py-2 text-left font-semibold">저장</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedAssignment.submissions.map((submission) => (
                        <tr key={submission.studentId} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">{submission.student.name}</td>
                          <td className="px-4 py-3">
                            <select
                              value={submissions[submission.studentId]?.status || ''}
                              onChange={(e) =>
                                handleSubmissionChange(
                                  submission.studentId,
                                  'status',
                                  e.target.value
                                )
                              }
                              className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500 text-xs"
                            >
                              {statusOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="number"
                              value={submissions[submission.studentId]?.score || ''}
                              onChange={(e) =>
                                handleSubmissionChange(
                                  submission.studentId,
                                  'score',
                                  e.target.value
                                )
                              }
                              className="w-16 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={submissions[submission.studentId]?.feedback || ''}
                              onChange={(e) =>
                                handleSubmissionChange(
                                  submission.studentId,
                                  'feedback',
                                  e.target.value
                                )
                              }
                              className="w-32 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleUpdateSubmission(submission.studentId)}
                              disabled={saving}
                              className="px-3 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600 transition disabled:opacity-50"
                            >
                              저장
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

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
