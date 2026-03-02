'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// 한글 실명 검증: 2~10자 한글만 허용
const isValidKoreanName = (name: string): boolean => {
  const trimmed = name.trim();
  return /^[가-힣]{2,10}$/.test(trimmed);
};

export default function NewStudentPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    dateOfBirth: '',
    phone: '',
    parentPhone: '',
    school: '',
    grade: '',
    status: 'ACTIVE',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nameError, setNameError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // 이름 필드 변경 시 실시간 검증
    if (name === 'name') {
      if (value.trim() === '') {
        setNameError('');
      } else if (!isValidKoreanName(value)) {
        setNameError('실명을 한글로 입력해주세요. (2~10자, 한글만 가능)');
      } else {
        setNameError('');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setNameError('');

    if (!formData.name.trim()) {
      setNameError('이름은 필수 입력입니다.');
      return;
    }

    if (!isValidKoreanName(formData.name)) {
      setNameError('실명을 한글로 입력해주세요. (2~10자, 한글만 가능, 특수문자/숫자/영문 불가)');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || '원생 등록에 실패했습니다.');
      }

      const newStudent = await response.json();
      router.push(`/admin/students/${newStudent.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/admin/students">
          <button className="mb-6 text-blue-600 hover:text-blue-800 font-medium">
            ← 원생 목록
          </button>
        </Link>

        <div className="bg-white rounded-lg shadow p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">새 원생 등록</h1>

          {error && (
            <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이름 (실명) *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  nameError ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="원생 실명 (한글)"
                required
              />
              {nameError && (
                <p className="mt-1 text-sm text-red-600">{nameError}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                한글 실명만 입력 가능합니다. (예: 김철수, 박영희)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                생년월일
              </label>
              <input
                type="date"
                name="dateOfBirth"
                value={formData.dateOfBirth}
                onChange={handleChange}
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
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="010-0000-0000"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                학부모 연락처
              </label>
              <input
                type="tel"
                name="parentPhone"
                value={formData.parentPhone}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="010-0000-0000"
              />
              <p className="mt-1 text-xs text-gray-500">
                학부모 앱 로그인에 사용됩니다.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                학교
              </label>
              <input
                type="text"
                name="school"
                value={formData.school}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="학교명"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                학년
              </label>
              <input
                type="text"
                name="grade"
                value={formData.grade}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="예: 중1, 고2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                상태
              </label>
              <select
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="ACTIVE">재원</option>
                <option value="COMPLETED">수료</option>
                <option value="WITHDRAWN">퇴원</option>
              </select>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading || !!nameError}
                className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition font-medium"
              >
                {loading ? '등록 중...' : '등록하기'}
              </button>
              <Link href="/admin/students" className="flex-1">
                <button
                  type="button"
                  className="w-full px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition font-medium"
                >
                  취소
                </button>
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
