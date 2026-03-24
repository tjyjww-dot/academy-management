'use client';

import { useState, useEffect, useCallback } from 'react';

interface Student { id: string; name: string; studentNumber: string; }
interface Classroom { id: string; name: string; }
interface WrongAnswer {
  id: string; studentId: string; classroomId: string; testName: string;
  problemNumber: number; status: string; round: number; createdAt: string;
  student: { id: string; name: string; studentNumber: string };
  classroom: { id: string; name: string };
}
interface WrongAnswerTest {
  id: string; studentId: string; classroomId: string; round: number;
  status: string; createdAt: string; gradedAt: string | null;
  student: { id: string; name: string; studentNumber: string };
  classroom: { id: string; name: string };
  items: Array<{ id: string; wrongAnswerId: string; isCorrect: boolean | null; wrongAnswer: WrongAnswer }>;
}
interface Stats { totalActive: number; totalMastered: number; totalTests: number; pendingTests: number; masteryRate: number; }

export default function WrongAnswersPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'record' | 'test' | 'review'>('dashboard');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [tests, setTests] = useState<WrongAnswerTest[]>([]);
  const [stats, setStats] = useState<Stats>({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });
  const [testName, setTestName] = useState('');
  const [problemNumbers, setProblemNumbers] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [gradingTest, setGradingTest] = useState<WrongAnswerTest | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(data => setClassrooms(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedClassroom) { setStudents([]); return; }
    fetch(`/api/students?classroomId=${selectedClassroom}`)
      .then(r => r.json())
      .then(data => setStudents(Array.isArray(data) ? data : data.students || []))
      .catch(() => {});
  }, [selectedClassroom]);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const r = await fetch(`/api/wrong-answers/stats?${params}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchWrongAnswers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedStudent) params.set('studentId', selectedStudent);
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      params.set('status', 'ALL');
      const r = await fetch(`/api/wrong-answers?${params}`);
      if (r.ok) setWrongAnswers(await r.json());
    } catch {}
  }, [selectedStudent, selectedClassroom]);

  const fetchTests = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedStudent) params.set('studentId', selectedStudent);
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      const r = await fetch(`/api/wrong-answers/tests?${params}`);
      if (r.ok) setTests(await r.json());
    } catch {}
  }, [selectedStudent, selectedClassroom]);

  useEffect(() => { fetchStats(); fetchWrongAnswers(); fetchTests(); }, [fetchStats, fetchWrongAnswers, fetchTests]);

  const handleRecord = async () => {
    if (!selectedStudent || !selectedClassroom || !testName || !problemNumbers) { showToast('모든 항목을 입력해주세요'); return; }
    const nums = problemNumbers.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    if (nums.length === 0) { showToast('유효한 문제 번호를 입력해주세요'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/wrong-answers', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent, classroomId: selectedClassroom, testName, problemNumbers: nums }) });
      if (r.ok) { showToast(`${nums.length}개 오답이 기록되었습니다`); setTestName(''); setProblemNumbers(''); fetchWrongAnswers(); fetchStats(); }
      else { const err = await r.json(); showToast(err.error || '오류가 발생했습니다'); }
    } catch { showToast('서버 오류가 발생했습니다'); }
    setLoading(false);
  };

  const handleGenerateTest = async () => {
    if (!selectedStudent || !selectedClassroom) { showToast('학생과 수업을 선택해주세요'); return; }
    setLoading(true);
    try {
      const r = await fetch('/api/wrong-answers/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent, classroomId: selectedClassroom }) });
      if (r.ok) { showToast('오답 테스트가 생성되었습니다'); fetchTests(); fetchStats(); }
      else { const err = await r.json(); showToast(err.error || '오류가 발생했습니다'); }
    } catch { showToast('서버 오류가 발생했습니다'); }
    setLoading(false);
  };

  const handleGrade = async () => {
    if (!gradingTest) return;
    const results = Object.entries(gradeResults).map(([wrongAnswerId, isCorrect]) => ({ wrongAnswerId, isCorrect }));
    if (results.length !== gradingTest.items.length) { showToast('모든 문제의 정답 여부를 선택해주세요'); return; }
    setLoading(true);
    try {
      const r = await fetch(`/api/wrong-answers/tests/${gradingTest.id}/grade`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }) });
      if (r.ok) { showToast('채점이 완료되었습니다'); setGradingTest(null); setGradeResults({}); fetchTests(); fetchWrongAnswers(); fetchStats(); }
      else { const err = await r.json(); showToast(err.error || '오류가 발생했습니다'); }
    } catch { showToast('서버 오류가 발생했습니다'); }
    setLoading(false);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">오답 관리</h1>
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg overflow-x-auto">
        {([['dashboard','대시보드'],['record','오답 기록'],['test','오답 테스트'],['review','오답 현황']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key as typeof activeTab)}
            className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${activeTab === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">수업 선택</label>
          <select value={selectedClassroom} onChange={(e) => { setSelectedClassroom(e.target.value); setSelectedStudent(''); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="">수업을 선택하세요</option>
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">학생 선택</label>
          <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" disabled={!selectedClassroom}>
            <option value="">학생을 선택하세요</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.studentNumber})</option>)}
          </select>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm border p-4"><div className="text-sm text-gray-500 mb-1">활성 오답</div><div className="text-2xl font-bold text-red-600">{stats.totalActive}</div></div>
            <div className="bg-white rounded-xl shadow-sm border p-4"><div className="text-sm text-gray-500 mb-1">완료 (마스터)</div><div className="text-2xl font-bold text-green-600">{stats.totalMastered}</div></div>
            <div className="bg-white rounded-xl shadow-sm border p-4"><div className="text-sm text-gray-500 mb-1">총 테스트</div><div className="text-2xl font-bold text-blue-600">{stats.totalTests}</div></div>
            <div className="bg-white rounded-xl shadow-sm border p-4"><div className="text-sm text-gray-500 mb-1">채점 대기</div><div className="text-2xl font-bold text-orange-600">{stats.pendingTests}</div></div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="font-semibold text-gray-800 mb-3">학습 완료율</h3>
            <div className="w-full bg-gray-200 rounded-full h-6">
              <div className="bg-gradient-to-r from-blue-500 to-green-500 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold transition-all duration-500"
                style={{ width: `${Math.max(stats.masteryRate, 5)}%` }}>{stats.masteryRate}%</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'record' && (
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-800 mb-4">오답 기록하기</h3>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">시험명</label>
              <input type="text" value={testName} onChange={(e) => setTestName(e.target.value)} placeholder="예: 3월 2주차 일일테스트"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">틀린 문제 번호</label>
              <input type="text" value={problemNumbers} onChange={(e) => setProblemNumbers(e.target.value)} placeholder="예: 3, 7, 12, 15"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              <p className="text-xs text-gray-500 mt-1">쉼표로 구분하여 입력하세요</p></div>
            <button onClick={handleRecord} disabled={loading || !selectedStudent || !selectedClassroom || !testName || !problemNumbers}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
              {loading ? '저장 중...' : '오답 기록'}</button>
          </div>
        </div>
      )}

      {activeTab === 'test' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between">
              <div><h3 className="font-semibold text-gray-800">오답 테스트 생성</h3>
                <p className="text-sm text-gray-500 mt-1">선택한 학생의 활성 오답으로 테스트를 만듭니다</p></div>
              <button onClick={handleGenerateTest} disabled={loading || !selectedStudent || !selectedClassroom}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm">테스트 생성</button>
            </div>
          </div>
          {gradingTest && (
            <div className="bg-white rounded-xl shadow-sm border p-6 ring-2 ring-blue-500">
              <h3 className="font-semibold text-gray-800 mb-4">채점: {gradingTest.student.name} - Round {gradingTest.round}</h3>
              <div className="space-y-3">
                {gradingTest.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium">[{item.wrongAnswer.testName}] {item.wrongAnswer.problemNumber}번</span>
                    <div className="flex gap-2">
                      <button onClick={() => setGradeResults(prev => ({ ...prev, [item.wrongAnswerId]: true }))}
                        className={`px-3 py-1 rounded-md text-sm font-medium ${gradeResults[item.wrongAnswerId] === true ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-green-100'}`}>정답</button>
                      <button onClick={() => setGradeResults(prev => ({ ...prev, [item.wrongAnswerId]: false }))}
                        className={`px-3 py-1 rounded-md text-sm font-medium ${gradeResults[item.wrongAnswerId] === false ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-600 hover:bg-red-100'}`}>오답</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-4">
                <button onClick={handleGrade} disabled={loading} className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300">
                  {loading ? '채점 중...' : '채점 완료'}</button>
                <button onClick={() => { setGradingTest(null); setGradeResults({}); }} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              </div>
            </div>
          )}
          <div className="space-y-3">
            {tests.map(test => (
              <div key={test.id} className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-center justify-between mb-2">
                  <div><span className="font-medium text-gray-800">{test.student.name}</span>
                    <span className="text-sm text-gray-500 ml-2">{test.classroom.name}</span>
                    <span className="text-sm text-gray-400 ml-2">Round {test.round}</span></div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${test.status === 'GRADED' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                      {test.status === 'GRADED' ? '채점 완료' : '채점 대기'}</span>
                    {test.status === 'PENDING' && (
                      <button onClick={() => { setGradingTest(test); setGradeResults({}); }}
                        className="bg-blue-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-blue-700">채점하기</button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-500">문제 {test.items.length}개 | {new Date(test.createdAt).toLocaleDateString('ko-KR')}
                  {test.status === 'GRADED' && test.items.length > 0 && <span className="ml-2">정답률: {Math.round((test.items.filter(i => i.isCorrect).length / test.items.length) * 100)}%</span>}
                </div>
              </div>
            ))}
            {tests.length === 0 && <div className="text-center text-gray-500 py-8">아직 생성된 테스트가 없습니다</div>}
          </div>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="space-y-3">
          {wrongAnswers.length === 0 ? <div className="text-center text-gray-500 py-8">오답 기록이 없습니다</div> :
            wrongAnswers.map(wa => (
              <div key={wa.id} className={`bg-white rounded-xl shadow-sm border p-4 ${wa.status === 'MASTERED' ? 'border-green-200 bg-green-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <div><span className="font-medium text-gray-800">{wa.student.name}</span>
                    <span className="text-sm text-gray-500 ml-2">{wa.classroom.name}</span></div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${wa.status === 'MASTERED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {wa.status === 'MASTERED' ? '완료' : `활성 (Round ${wa.round})`}</span>
                </div>
                <div className="text-sm text-gray-600 mt-1">[{wa.testName}] {wa.problemNumber}번</div>
                <div className="text-xs text-gray-400 mt-1">{new Date(wa.createdAt).toLocaleDateString('ko-KR')} 등록</div>
              </div>
            ))
          }
        </div>
      )}

      {toast && <div className="fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg text-sm z-50">{toast}</div>}
    </div>
  );
          }
