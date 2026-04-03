'use client';

import { useState, useEffect } from 'react';

interface ClassroomOption {
  id: string;
  name: string;
}

interface WrongAnswer {
  id: string;
  studentId: string;
  classroomId: string;
  testName: string;
  problemNumber: number;
  problemImage: string | null;
  status: string;
  round: number;
  createdAt: string;
  student: { id: string; name: string; studentNumber: string | null };
  classroom: { id: string; name: string };
  testPaper?: { id: string; name: string; pages: { imageUrl: string }[] } | null;
}

interface WrongAnswerTest {
  id: string;
  studentId: string;
  classroomId: string;
  round: number;
  status: string;
  createdAt: string;
  gradedAt: string | null;
  student: { id: string; name: string; studentNumber: string | null };
  classroom: { id: string; name: string };
  items: { id: string; wrongAnswerId: string; isCorrect: boolean | null; wrongAnswer: WrongAnswer }[];
}

interface Stats {
  totalActive: number;
  totalMastered: number;
  totalTests: number;
  pendingTests: number;
  masteryRate: number;
}

interface StudentOption {
  id: string;
  name: string;
  studentNumber: string | null;
}

export default function WrongAnswersPage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [tests, setTests] = useState<WrongAnswerTest[]>([]);
  const [stats, setStats] = useState<Stats>({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'tests' | 'register'>('list');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // Register tab state
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [regTestName, setRegTestName] = useState('');
  const [regProblemNumbers, setRegProblemNumbers] = useState('');
  const [registering, setRegistering] = useState(false);

  // Grade modal state
  const [gradingTest, setGradingTest] = useState<WrongAnswerTest | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3000);
  };

  const fetchClassrooms = async () => {
    try {
      const res = await fetch('/api/classes');
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      setClassrooms(list.map((c: any) => ({ id: c.id, name: c.name })));
    } catch (error) {
      console.error('Failed to fetch classrooms:', error);
      showMessage('반 목록을 불러오지 못했습니다', 'error');
    }
  };

  const handleClassroomChange = async (classroomId: string) => {
    setSelectedClassroom(classroomId);
    if (!classroomId) {
      setWrongAnswers([]);
      setTests([]);
      setStats({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });
      setStudents([]);
      return;
    }

    setLoading(true);
    try {
      const [waRes, testRes, statsRes, classRes] = await Promise.all([
        fetch(`/api/wrong-answers?classroomId=${classroomId}`),
        fetch(`/api/wrong-answers/tests?classroomId=${classroomId}`),
        fetch(`/api/wrong-answers/stats?classroomId=${classroomId}`),
        fetch(`/api/classes/${classroomId}`),
      ]);

      if (waRes.ok) {
        const waData = await waRes.json();
        setWrongAnswers(Array.isArray(waData) ? waData : []);
      }
      if (testRes.ok) {
        const testData = await testRes.json();
        setTests(Array.isArray(testData) ? testData : []);
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      if (classRes.ok) {
        const classData = await classRes.json();
        const enrolledStudents = (classData.enrollments || []).map((e: any) => ({
          id: e.student?.id || e.studentId,
          name: e.student?.name || '',
          studentNumber: e.student?.studentNumber || null,
        }));
        setStudents(enrolledStudents);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showMessage('데이터를 불러오지 못했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterWrongAnswers = async () => {
    if (!selectedStudent || !regTestName || !regProblemNumbers) {
      showMessage('모든 필드를 입력해주세요', 'error');
      return;
    }

    const nums = regProblemNumbers.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    if (nums.length === 0) {
      showMessage('유효한 문제 번호를 입력해주세요', 'error');
      return;
    }

    setRegistering(true);
    try {
      const res = await fetch('/api/wrong-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent,
          classroomId: selectedClassroom,
          testName: regTestName,
          problemNumbers: nums,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }

      showMessage(`${nums.length}개 오답이 등록되었습니다`);
      setRegTestName('');
      setRegProblemNumbers('');
      setSelectedStudent('');
      handleClassroomChange(selectedClassroom);
    } catch (error: any) {
      showMessage(error.message || '오답 등록에 실패했습니다', 'error');
    } finally {
      setRegistering(false);
    }
  };

  const handleDeleteWrongAnswer = async (id: string) => {
    if (!confirm('이 오답을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/wrong-answers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      showMessage('삭제되었습니다');
      handleClassroomChange(selectedClassroom);
    } catch {
      showMessage('삭제에 실패했습니다', 'error');
    }
  };

  const handleCreateTest = async (studentId: string) => {
    try {
      const res = await fetch('/api/wrong-answers/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, classroomId: selectedClassroom }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }
      showMessage('테스트가 생성되었습니다');
      handleClassroomChange(selectedClassroom);
    } catch (error: any) {
      showMessage(error.message || '테스트 생성에 실패했습니다', 'error');
    }
  };

  const handleStartGrading = (test: WrongAnswerTest) => {
    setGradingTest(test);
    const initial: Record<string, boolean> = {};
    test.items.forEach(item => {
      initial[item.wrongAnswerId] = item.isCorrect ?? false;
    });
    setGradeResults(initial);
  };

  const handleSubmitGrade = async () => {
    if (!gradingTest) return;
    try {
      const results = Object.entries(gradeResults).map(([wrongAnswerId, isCorrect]) => ({
        wrongAnswerId,
        isCorrect,
      }));

      const res = await fetch(`/api/wrong-answers/tests/${gradingTest.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });

      if (!res.ok) throw new Error('Failed');
      showMessage('채점이 완료되었습니다');
      setGradingTest(null);
      handleClassroomChange(selectedClassroom);
    } catch {
      showMessage('채점에 실패했습니다', 'error');
    }
  };

  // Group wrong answers by student
  const groupedByStudent = wrongAnswers.reduce((acc, wa) => {
    const key = wa.studentId;
    if (!acc[key]) acc[key] = { name: wa.student.name, items: [] };
    acc[key].items.push(wa);
    return acc;
  }, {} as Record<string, { name: string; items: WrongAnswer[] }>);

  const activeWrongAnswers = wrongAnswers.filter(wa => wa.status === 'ACTIVE');
  const masteredWrongAnswers = wrongAnswers.filter(wa => wa.status === 'MASTERED');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">오답 관리</h1>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {message}
        </div>
      )}

      {/* Classroom selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">반 선택</label>
        <select
          value={selectedClassroom}
          onChange={(e) => handleClassroomChange(e.target.value)}
          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800"
        >
          <option value="">반을 선택하세요</option>
          {classrooms.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {selectedClassroom && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-red-50 rounded-xl p-4 border border-red-100">
              <div className="text-2xl font-bold text-red-600">{stats.totalActive}</div>
              <div className="text-sm text-gray-600">활성 오답</div>
            </div>
            <div className="bg-green-50 rounded-xl p-4 border border-green-100">
              <div className="text-2xl font-bold text-green-600">{stats.totalMastered}</div>
              <div className="text-sm text-gray-600">완료 (마스터)</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <div className="text-2xl font-bold text-blue-600">{stats.totalTests}</div>
              <div className="text-sm text-gray-600">총 테스트</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-4 border border-purple-100">
              <div className="text-2xl font-bold text-purple-600">{stats.masteryRate}%</div>
              <div className="text-sm text-gray-600">마스터율</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            {[
              { key: 'list' as const, label: '오답 목록' },
              { key: 'tests' as const, label: '테스트 관리' },
              { key: 'register' as const, label: '오답 등록' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Tab: Wrong Answer List */}
              {activeTab === 'list' && (
                <div>
                  {Object.keys(groupedByStudent).length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      이 반에 등록된 오답이 없습니다.
                    </div>
                  ) : (
                    Object.entries(groupedByStudent).map(([studentId, { name, items }]) => {
                      const active = items.filter(i => i.status === 'ACTIVE');
                      const mastered = items.filter(i => i.status === 'MASTERED');
                      return (
                        <div key={studentId} className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
                          <div className="flex items-center justify-between px-5 py-4 bg-gray-50 border-b border-gray-200">
                            <div>
                              <span className="font-semibold text-gray-800">{name}</span>
                              <span className="ml-3 text-sm text-gray-500">
                                활성: {active.length} / 마스터: {mastered.length}
                              </span>
                            </div>
                            {active.length > 0 && (
                              <button
                                onClick={() => handleCreateTest(studentId)}
                                className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                              >
                                테스트 생성
                              </button>
                            )}
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2.5 text-left text-gray-600 font-medium">시험명</th>
                                  <th className="px-4 py-2.5 text-left text-gray-600 font-medium">문제번호</th>
                                  <th className="px-4 py-2.5 text-left text-gray-600 font-medium">상태</th>
                                  <th className="px-4 py-2.5 text-left text-gray-600 font-medium">회차</th>
                                  <th className="px-4 py-2.5 text-left text-gray-600 font-medium">등록일</th>
                                  <th className="px-4 py-2.5 text-left text-gray-600 font-medium">삭제</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map(wa => (
                                  <tr key={wa.id} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2.5 text-gray-800">{wa.testName}</td>
                                    <td className="px-4 py-2.5">
                                      <span className="inline-flex items-center justify-center w-8 h-8 bg-red-100 text-red-700 rounded-full font-semibold text-sm">
                                        {wa.problemNumber}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                                        wa.status === 'ACTIVE'
                                          ? 'bg-yellow-100 text-yellow-700'
                                          : 'bg-green-100 text-green-700'
                                      }`}>
                                        {wa.status === 'ACTIVE' ? '미해결' : '마스터'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-gray-600">{wa.round}회</td>
                                    <td className="px-4 py-2.5 text-gray-500 text-xs">
                                      {new Date(wa.createdAt).toLocaleDateString('ko-KR')}
                                    </td>
                                    <td className="px-4 py-2.5">
                                      <button
                                        onClick={() => handleDeleteWrongAnswer(wa.id)}
                                        className="text-red-500 hover:text-red-700 text-xs"
                                      >
                                        삭제
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Tab: Tests */}
              {activeTab === 'tests' && (
                <div>
                  {tests.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      생성된 테스트가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {tests.map(test => (
                        <div key={test.id} className="bg-white rounded-xl border border-gray-200 p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <span className="font-semibold text-gray-800">{test.student.name}</span>
                              <span className="ml-3 text-sm text-gray-500">
                                {test.round}회차 | {test.items.length}문항
                              </span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                test.status === 'GRADED'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}>
                                {test.status === 'GRADED' ? '채점완료' : '채점대기'}
                              </span>
                              {test.status === 'PENDING' && (
                                <button
                                  onClick={() => handleStartGrading(test)}
                                  className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                >
                                  채점하기
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-gray-500">
                            생성: {new Date(test.createdAt).toLocaleDateString('ko-KR')}
                            {test.gradedAt && ` | 채점: ${new Date(test.gradedAt).toLocaleDateString('ko-KR')}`}
                          </div>
                          {test.status === 'GRADED' && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {test.items.map(item => (
                                <span
                                  key={item.id}
                                  className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${
                                    item.isCorrect
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {item.wrongAnswer.problemNumber}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: Register */}
              {activeTab === 'register' && (
                <div className="max-w-lg">
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">오답 등록</h3>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">학생</label>
                        <select
                          value={selectedStudent}
                          onChange={e => setSelectedStudent(e.target.value)}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                          <option value="">학생을 선택하세요</option>
                          {students.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">시험명</label>
                        <input
                          type="text"
                          value={regTestName}
                          onChange={e => setRegTestName(e.target.value)}
                          placeholder="예: 3월 모의고사"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          틀린 문제 번호 (쉼표로 구분)
                        </label>
                        <input
                          type="text"
                          value={regProblemNumbers}
                          onChange={e => setRegProblemNumbers(e.target.value)}
                          placeholder="예: 3, 7, 12, 15"
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <button
                        onClick={handleRegisterWrongAnswers}
                        disabled={registering}
                        className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {registering ? '등록 중...' : '오답 등록'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Grading Modal */}
      {gradingTest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-1">채점</h3>
            <p className="text-sm text-gray-500 mb-4">
              {gradingTest.student.name} - {gradingTest.round}회차
            </p>

            <div className="space-y-3">
              {gradingTest.items.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full font-semibold text-sm">
                      {item.wrongAnswer.problemNumber}
                    </span>
                    <span className="text-sm text-gray-600">{item.wrongAnswer.testName}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setGradeResults(prev => ({ ...prev, [item.wrongAnswerId]: true }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        gradeResults[item.wrongAnswerId] === true
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-green-50'
                      }`}
                    >
                      O
                    </button>
                    <button
                      onClick={() => setGradeResults(prev => ({ ...prev, [item.wrongAnswerId]: false }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        gradeResults[item.wrongAnswerId] === false
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                      }`}
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setGradingTest(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSubmitGrade}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
              >
                채점 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
