'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Student {
  id: string;
  name: string;
  studentNumber: string;
  school: string | null;
  grade: string | null;
  phone: string | null;
  status: string;
  registrationDate: string;
  parentStudents: any[];
  enrollments: any[];
}

const statusMap: Record<string, string> = {
  ACTIVE: '재원',
  COMPLETED: '수료',
  WITHDRAWN: '퇴원',
};

const statusColorMap: Record<string, string> = {
  재원: 'bg-green-100 text-green-800',
  수료: 'bg-blue-100 text-blue-800',
  퇴원: 'bg-red-100 text-red-800',
};

export default function StudentsPage() {
  const router = useRouter();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('전체');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const filters = ['전체', '재원', '수료', '퇴원'];

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (statusFilter !== '전체') params.append('status', statusFilter);
      params.append('page', page.toString());
      params.append('limit', '10');

      const response = await fetch(`/api/students?${params}`);
      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      setStudents(data.students);
      setTotalPages(data.pages);
    } catch (err) {
      setError('원생 데이터를 불러오는데 실패했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStudents();
  }, [page, statusFilter, searchQuery]);

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`${name} 원생을 삭제하시겠습니까?`)) {
      try {
        const response = await fetch(`/api/students/${id}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete');
        fetchStudents();
      } catch (err) {
        alert('삭제에 실패했습니다.');
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-6 sm:py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">원생 관리</h1>
          <Link href="/admin/students/new">
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              원생 등록
            </button>
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        <div className="mb-6 bg-white p-3 sm:p-4 rounded-lg shadow">
          <input
            type="text"
            placeholder="이름으로 검색..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6 flex gap-2 bg-white p-3 sm:p-4 rounded-lg shadow overflow-x-auto">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => {
                setStatusFilter(filter);
                setPage(1);
              }}
              className={`px-4 py-2 rounded-lg transition ${
                statusFilter === filter
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">로딩 중...</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto -mx-3 sm:mx-0">
                <table className="w-full min-w-max sm:min-w-full">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">번호</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">이름</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">학교</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">학년</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">연락처</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">상태</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">등록일</th>
                      <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                          원생이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      students.map((student) => (
                        <tr
                          key={student.id}
                          className="border-b hover:bg-gray-50 cursor-pointer transition"
                          onClick={() => router.push(`/admin/students/${student.id}`)}
                        >
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {student.studentNumber}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {student.name}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {student.school || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {student.grade || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {student.phone || '-'}
                          </td>
                          <td className="px-6 py-4 text-sm">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColorMap[statusMap[student.status] || '']}`}>
                              {statusMap[student.status] || student.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-600">
                            {new Date(student.registrationDate).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleDelete(student.id, student.name)}
                              className="text-red-600 hover:text-red-900 font-medium"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-6 flex justify-center gap-2 sm:gap-4 flex-wrap">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                이전
              </button>
              <span className="px-4 py-2 text-gray-700">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                다음
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
