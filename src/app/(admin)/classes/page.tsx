'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Classroom {
  id: string;
  name: string;
  subjectId: string;
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
  enrollmentCount: number;
}

interface Subject {
  id: string;
  name: string;
}

interface Teacher {
  id: string;
  name: string;
  email: string;
}

export default function ClassesPage() {
  const router = useRouter();
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    subjectId: '',
    teacherId: '',
    schedule: '',
    maxCapacity: 20,
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const [classRes, subjectsRes, teachersRes] = await Promise.all([
        fetch('/api/classes'),
        fetch('/api/subjects'),
        fetch('/api/teachers'),
      ]);

      if (!classRes.ok || !subjectsRes.ok || !teachersRes.ok) {
        throw new Error('Failed to fetch');
      }

      const classData = await classRes.json();
      const subjectsData = await subjectsRes.json();
      const teachersData = await teachersRes.json();

      setClassrooms(classData);
      setSubjects(subjectsData);
      setTeachers(teachersData);
    } catch (err) {
      setError('데이터를 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'maxCapacity' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.subjectId || !formData.teacherId) {
      alert('필수 항목을 입력해주세요.');
      return;
    }

    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) throw new Error('Failed to create');

      setShowModal(false);
      setFormData({
        name: '',
        subjectId: '',
        teacherId: '',
        schedule: '',
        maxCapacity: 20,
      });
      fetchData();
    } catch (err) {
      alert('반 추가에 실패했습니다.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`${name} 반을 삭제하시겠습니까?`)) {
      try {
        const response = await fetch(`/api/classes/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete');
        fetchData();
      } catch (err) {
        alert('삭제에 실패했습니다.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">반 관리</h1>
          <button
            onClick={() => setShowModal(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            반 추가
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">로딩 중...</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {classrooms.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500">반이 없습니다.</p>
              </div>
            ) : (
              classrooms.map((classroom) => (
                <div
                  key={classroom.id}
                  className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition cursor-pointer"
                  onClick={() => router.push(`/admin/classes/${classroom.id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-xl font-semibold text-gray-900">
                        {classroom.name}
                      </h3>
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-sm text-gray-600">과목</p>
                          <p className="font-medium text-gray-900">
                            {classroom.subject.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">담당강사</p>
                          <p className="font-medium text-gray-900">
                            {classroom.teacher.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">수강인원</p>
                          <p className="font-medium text-gray-900">
                            {classroom.enrollmentCount}/{classroom.maxCapacity}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">시간표</p>
                          <p className="font-medium text-gray-900">
                            {classroom.schedule || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(classroom.id, classroom.name)}
                        className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition font-medium"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">새 반 추가</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    반 이름 *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 수학 초급"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    과목 *
                  </label>
                  <select
                    name="subjectId"
                    value={formData.subjectId}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">과목 선택</option>
                    {subjects.map((subject) => (
                      <option key={subject.id} value={subject.id}>
                        {subject.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    담당강사 *
                  </label>
                  <select
                    name="teacherId"
                    value={formData.teacherId}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">강사 선택</option>
                    {teachers.map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>
                        {teacher.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    시간표
                  </label>
                  <input
                    type="text"
                    name="schedule"
                    value={formData.schedule}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="예: 월수금 15:00-17:00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    정원
                  </label>
                  <input
                    type="number"
                    name="maxCapacity"
                    value={formData.maxCapacity}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                  />
                </div>

                <div className="flex gap-2 pt-4">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
                  >
                    추가
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition font-medium"
                  >
                    취소
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
