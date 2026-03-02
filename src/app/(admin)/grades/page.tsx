'use client';

import { useState, useEffect, useMemo } from 'react';

interface Student {
  id: string;
  name: string;
}

interface GradeRecord {
  id: string;
  studentId: string;
  studentName: string;
  testName: string;
  score: number;
  maxScore: number;
  testDate: string;
  remarks?: string;
}

interface ClassroomOption {
  id: string;
  name: string;
}

export default function GradesPage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [testName, setTestName] = useState('');
  const [testDate, setTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [grades, setGrades] = useState<GradeRecord[]>([]);
  const [filterTestName, setFilterTestName] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

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
    setFilterTestName('');
    setLoading(true);
    try {
      const res = await fetch(`/api/classes/${classroomId}`);
      const classroom = await res.json();
      setStudents(classroom.enrollments.map((e: any) => e.student));

      const gradesRes = await fetch(`/api/grades?classroomId=${classroomId}`);
      const gradesData = await gradesRes.json();
      const gradesWithNames = gradesData.map((g: any) => ({
        ...g,
        studentName: g.student.name,
      }));
      setGrades(gradesWithNames);

      const scoreMap: Record<string, number> = {};
      classroom.enrollments.forEach((enrollment: any) => {
        scoreMap[enrollment.studentId] = 0;
      });
      setScores(scoreMap);
    } catch (error) {
      console.error('Failed to fetch classroom data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreChange = (studentId: string, score: string) => {
    setScores({
      ...scores,
      [studentId]: parseFloat(score) || 0,
    });
  };

  const handleSaveGrades = async () => {
    if (!selectedClassroom || !testName || !testDate) {
      setMessage('모든 필드를 입력하세요');
      return;
    }

    setSaving(true);
    try {
      const gradesData = Object.entries(scores)
        .filter(([, score]) => score > 0)
        .map(([studentId, score]) => ({
          studentId,
          score,
          maxScore: 100,
          remarks: '',
        }));

      const res = await fetch('/api/grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId: selectedClassroom,
          testName,
          testDate,
          grades: gradesData,
        }),
      });

      if (res.ok) {
        const newGrades = await res.json();
        const savedTestName = testName;
        const newGradesWithNames = newGrades.map((g: any) => ({
          ...g,
          studentName: g.student.name,
        }));

        setGrades((prev) => [...prev, ...newGradesWithNames]);
        setScores(Object.fromEntries(students.map((s) => [s.id, 0])));
        setTestName('');
        setFilterTestName(savedTestName);
        setMessage('저장되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('저장 실패');
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGrade = async (gradeId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/grades/${gradeId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setGrades(grades.filter((g) => g.id !== gradeId));
        setMessage('삭제되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('삭제 실패');
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    }
  };

  // useMemo로 필터링된 성적 (참조 안정성 보장)
  const filteredGrades = useMemo(
    () =>
      filterTestName
        ? grades.filter((g) => g.testName === filterTestName)
        : grades,
    [grades, filterTestName]
  );

  // useMemo로 통계 계산 (무한 루프 방지, 정확한 반영)
  const stats = useMemo(() => {
    if (filteredGrades.length === 0) {
      return { average: 0, highest: 0, lowest: 0 };
    }
    const scoreValues = filteredGrades.map((g) => g.score);
    const average = scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length;
    const highest = Math.max(...scoreValues);
    const lowest = Math.min(...scoreValues);
    return {
      average: Math.round(average * 100) / 100,
      highest,
      lowest,
    };
  }, [filteredGrades]);

  const uniqueTestNames = useMemo(
    () => Array.from(new Set(grades.map((g) => g.testName))),
    [grades]
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">성적 관리</h1>

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
            {/* Score Input Section */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">성적 입력</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <input
                  type="text"
                  placeholder="시험명"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                />
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                />
              </div>

              {loading ? (
                <p className="text-center text-gray-500">로딩 중...</p>
              ) : (
                <>
                  <div className="overflow-x-auto mb-4">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left font-semibold">학생명</th>
                          <th className="px-4 py-2 text-left font-semibold">점수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((student) => (
                          <tr key={student.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3">{student.name}</td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                max={100}
                                value={scores[student.id] || 0}
                                onChange={(e) => handleScoreChange(student.id, e.target.value)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-blue-500"
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <button
                    onClick={handleSaveGrades}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '일괄 저장'}
                  </button>
                </>
              )}
            </div>

            {/* Grades Query Section */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">성적 조회</h2>

              {uniqueTestNames.length > 0 && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    시험명 필터
                  </label>
                  <select
                    value={filterTestName}
                    onChange={(e) => setFilterTestName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">-- 모든 시험 --</option>
                    {uniqueTestNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Stats */}
              {filteredGrades.length > 0 && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-blue-100 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {stats.average}
                    </div>
                    <div className="text-sm text-gray-600">평균</div>
                  </div>
                  <div className="bg-green-100 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {stats.highest}
                    </div>
                    <div className="text-sm text-gray-600">최고점</div>
                  </div>
                  <div className="bg-red-100 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {stats.lowest}
                    </div>
                    <div className="text-sm text-gray-600">최저점</div>
                  </div>
                </div>
              )}

              {/* Grades Table */}
              {filteredGrades.length === 0 ? (
                <p className="text-center text-gray-500">성적이 없습니다</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">학생명</th>
                        <th className="px-4 py-2 text-left font-semibold">시험명</th>
                        <th className="px-4 py-2 text-left font-semibold">점수</th>
                        <th className="px-4 py-2 text-left font-semibold">만점</th>
                        <th className="px-4 py-2 text-left font-semibold">비율(%)</th>
                        <th className="px-4 py-2 text-left font-semibold">날짜</th>
                        <th className="px-4 py-2 text-left font-semibold">삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredGrades.map((grade) => (
                        <tr key={grade.id} className="border-b hover:bg-gray-50">
                          <td className="px-4 py-3">{grade.studentName}</td>
                          <td className="px-4 py-3">{grade.testName}</td>
                          <td className="px-4 py-3">{grade.score}</td>
                          <td className="px-4 py-3">{grade.maxScore}</td>
                          <td className="px-4 py-3">
                            {Math.round((grade.score / grade.maxScore) * 100)}
                          </td>
                          <td className="px-4 py-3">{grade.testDate}</td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDeleteGrade(grade.id)}
                              className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
                            >
                              삭제
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
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
