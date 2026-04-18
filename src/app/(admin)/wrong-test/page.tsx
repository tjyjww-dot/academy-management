'use client';

import { useEffect, useState } from 'react';
import { toRenderableImageSrc } from '@/lib/imageUrl';

interface Classroom { id: string; name: string; }
interface Student { id: string; name: string; }
interface WrongAnswerItem {
  id: string; wrongAnswerId: string; isCorrect: boolean | null;
  wrongAnswer: {
    id: string; testName: string; problemNumber: number; problemImage: string | null;
    testPaper?: { pages: { imageUrl: string; pageNumber: number }[] } | null;
  };
}
interface WrongTest {
  id: string; studentId: string; round: number; status: string;
  createdAt: string; gradedAt: string | null; gradedBy: string | null;
  student: { id: string; name: string; };
  classroom: { id: string; name: string; };
  items: WrongAnswerItem[];
}

export default function WrongTestPage() {
  const [tab, setTab] = useState<'create' | 'list' | 'grade'>('create');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [tests, setTests] = useState<WrongTest[]>([]);
  const [creating, setCreating] = useState(false);
  const [gradingTest, setGradingTest] = useState<WrongTest | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});
  const [grading, setGrading] = useState(false);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(data => {
      setClassrooms(Array.isArray(data) ? data : data.classes || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedClassroom) {
      fetchStudents();
      fetchTests();
      fetchStats();
    }
  }, [selectedClassroom]);

  const fetchStudents = () => {
    fetch(`/api/students?classId=${selectedClassroom}`)
      .then(r => r.json()).then(data => {
        setStudents(Array.isArray(data) ? data : data.students || []);
      }).catch(() => {});
  };

  const fetchTests = () => {
    let url = `/api/wrong-answers/tests?classroomId=${selectedClassroom}`;
    if (selectedStudent) url += `&studentId=${selectedStudent}`;
    fetch(url).then(r => r.json()).then(data => {
      setTests(Array.isArray(data) ? data : []);
    }).catch(() => {});
  };

  const fetchStats = () => {
    let url = `/api/wrong-answers/stats?classroomId=${selectedClassroom}`;
    if (selectedStudent) url += `&studentId=${selectedStudent}`;
    fetch(url).then(r => r.json()).then(setStats).catch(() => {});
  };

  useEffect(() => {
    if (selectedClassroom) {
      fetchTests();
      fetchStats();
    }
  }, [selectedStudent]);

  // 테스트 생성
  const handleCreateTest = async () => {
    if (!selectedStudent || !selectedClassroom) {
      alert('학생과 반을 선택해주세요.');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/wrong-answers/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent, classroomId: selectedClassroom }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '테스트 생성 실패');
      }
      alert('오답테스트가 생성되었습니다.');
      fetchTests();
      fetchStats();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setCreating(false);
    }
  };

  // 인쇄
  const handlePrint = (test: WrongTest) => {
    const items = test.items.sort((a, b) => a.wrongAnswer.problemNumber - b.wrongAnswer.problemNumber);
    const win = window.open('', '_blank');
    if (!win) return;

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<base href="${origin}/">
<title>오답테스트 - ${test.student.name}</title>
<style>
  @media print { @page { size: A4 portrait; margin: 15mm; } }
  body { font-family: 'Malgun Gothic', sans-serif; max-width: 210mm; margin: 0 auto; padding: 20px; }
  .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { font-size: 20px; margin: 0; }
  .header p { font-size: 14px; color: #666; margin: 5px 0 0; }
  .info { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 14px; }
  .problem { margin-bottom: 20px; page-break-inside: avoid; border: 1px solid #ddd; padding: 12px; border-radius: 4px; }
  .problem-header { font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #333; }
  .problem img { max-width: 100%; height: auto; }
  .problem .source { font-size: 12px; color: #888; }
  .btn-bar { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
  .btn-bar button { padding: 10px 28px; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
  .btn-pdf { background: #2563eb; color: #fff; }
  .btn-back { background: #6b7280; color: #fff; }
  @media print { .btn-bar { display: none; } }
</style></head><body>
  <div class="header">
    <h1>수탐 오답테스트</h1>
    <p>${test.student.name} | ${test.classroom.name} | ${new Date(test.createdAt).toLocaleDateString('ko-KR')}</p>
  </div>
  <div class="info">
    <span>총 ${items.length}문항</span>
    <span>Round ${test.round}</span>
  </div>
  ${items.map((item, idx) => {
    const wa = item.wrongAnswer;
    const matchedPage = wa.testPaper?.pages?.find((p: any) => p.pageNumber === wa.problemNumber);
    const imgUrl = matchedPage?.imageUrl || wa.problemImage || '';
    return `<div class="problem">
      <div class="problem-header">${idx + 1}번 (원본: ${wa.testName} ${wa.problemNumber}번)</div>
      ${imgUrl ? `<img src="${toRenderableImageSrc(imgUrl)}" alt="문제 이미지" />` : '<p style="color:#999">이미지 없음</p>'}
      <div class="source">${wa.testName}</div>
    </div>`;
  }).join('')}
  <div class="btn-bar"><button class="btn-back" onclick="window.close()">← 뒤로가기</button><button class="btn-pdf" onclick="window.print()">PDF 저장</button></div>
</body></html>`;

    win.document.write(html);
    win.document.close();
  };

  // 채점 시작
  const startGrading = (test: WrongTest) => {
    setGradingTest(test);
    setGradeResults({});
    setTab('grade');
  };

  // 채점 토글
  const toggleGrade = (wrongAnswerId: string) => {
    setGradeResults(prev => {
      const next = { ...prev };
      if (next[wrongAnswerId] === true) delete next[wrongAnswerId];
      else next[wrongAnswerId] = true;
      return next;
    });
  };

  // 채점 제출
  const handleSubmitGrade = async () => {
    if (!gradingTest) return;
    setGrading(true);
    try {
      const results = gradingTest.items.map(item => ({
        wrongAnswerId: item.wrongAnswerId,
        isCorrect: gradeResults[item.wrongAnswerId] === true,
      }));

      const res = await fetch(`/api/wrong-answers/tests/${gradingTest.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) throw new Error('채점 실패');

      const correctCount = results.filter(r => r.isCorrect).length;
      alert(`채점 완료! ${results.length}문항 중 ${correctCount}문항 정답\n맞은 문제는 오답 목록에서 제외됩니다.`);
      setGradingTest(null);
      setGradeResults({});
      setTab('list');
      fetchTests();
      fetchStats();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGrading(false);
    }
  };

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">오답테스트</h1>

      {/* 반 선택 */}
      <div className="mb-4 flex flex-wrap gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">반 선택</label>
          <select className="border border-gray-300 rounded-lg px-3 py-2 w-48"
            value={selectedClassroom} onChange={e => { setSelectedClassroom(e.target.value); setSelectedStudent(''); }}>
            <option value="">반을 선택하세요</option>
            {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {selectedClassroom && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">학생 선택</label>
            <select className="border border-gray-300 rounded-lg px-3 py-2 w-48"
              value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}>
              <option value="">전체 학생</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.totalActive}</p>
            <p className="text-sm text-red-500">미해결 오답</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.totalMastered}</p>
            <p className="text-sm text-green-500">해결 완료</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-blue-600">{stats.totalTests}</p>
            <p className="text-sm text-blue-500">총 테스트</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-purple-600">{stats.masteryRate?.toFixed(0) || 0}%</p>
            <p className="text-sm text-purple-500">습득률</p>
          </div>
        </div>
      )}

      {selectedClassroom && (
        <>
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            <button className={tabClass('create')} onClick={() => setTab('create')}>시험지 생성</button>
            <button className={tabClass('list')} onClick={() => setTab('list')}>테스트 목록</button>
            <button className={tabClass('grade')} onClick={() => setTab('grade')}>채점</button>
          </div>

          {/* 시험지 생성 */}
          {tab === 'create' && (
            <div className="bg-white rounded-lg border p-4 space-y-4">
              <h3 className="font-semibold text-gray-800">오답테스트 생성</h3>
              <p className="text-sm text-gray-500">
                선택한 학생의 미해결 오답으로 자동 시험지를 생성합니다.
              </p>
              {!selectedStudent ? (
                <p className="text-amber-600 text-sm">학생을 선택해주세요.</p>
              ) : (
                <>
                  <p className="text-sm text-gray-700">
                    <strong>{students.find(s => s.id === selectedStudent)?.name}</strong> 학생의
                    미해결 오답 <strong className="text-red-600">{stats?.totalActive || 0}개</strong>로 테스트를 생성합니다.
                  </p>
                  <button
                    onClick={handleCreateTest}
                    disabled={creating || !stats?.totalActive}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creating ? '생성 중...' : '테스트 생성'}
                  </button>
                </>
              )}
            </div>
          )}

          {/* 테스트 목록 */}
          {tab === 'list' && (
            <div className="space-y-3">
              {tests.length === 0 ? (
                <div className="bg-white rounded-lg border p-6 text-center text-gray-500">
                  생성된 테스트가 없습니다.
                </div>
              ) : (
                tests.map(test => (
                  <div key={test.id} className="bg-white rounded-lg border p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="font-semibold text-gray-800">
                          {test.student.name} - Round {test.round}
                        </p>
                        <p className="text-sm text-gray-500">
                          {test.items.length}문항 | {new Date(test.createdAt).toLocaleDateString('ko-KR')} |
                          <span className={`ml-1 ${test.status === 'GRADED' ? 'text-green-600' : test.status === 'PENDING' ? 'text-amber-600' : 'text-gray-500'}`}>
                            {test.status === 'GRADED' ? '채점완료' : test.status === 'PENDING' ? '대기중' : test.status}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePrint(test)}
                          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >인쇄</button>
                        {test.status === 'PENDING' && (
                          <button
                            onClick={() => startGrading(test)}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
                          >채점</button>
                        )}
                      </div>
                    </div>
                    {test.status === 'GRADED' && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {test.items.sort((a, b) => a.wrongAnswer.problemNumber - b.wrongAnswer.problemNumber).map(item => (
                          <span key={item.id}
                            className={`px-2 py-0.5 rounded text-xs ${item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {item.wrongAnswer.problemNumber}번 {item.isCorrect ? '○' : '×'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 채점 */}
          {tab === 'grade' && (
            <div className="bg-white rounded-lg border p-4 space-y-4">
              {!gradingTest ? (
                <div className="text-center text-gray-500 py-6">
                  <p>테스트 목록에서 채점할 테스트를 선택해주세요.</p>
                  <button onClick={() => setTab('list')}
                    className="mt-2 text-blue-600 hover:underline text-sm">테스트 목록으로 이동</button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-gray-800">
                    {gradingTest.student.name} - Round {gradingTest.round} 채점
                  </h3>
                  <p className="text-sm text-gray-500">맞은 문제를 클릭하세요. (초록색 = 정답)</p>
                  <div className="flex flex-wrap gap-3">
                    {gradingTest.items
                      .sort((a, b) => a.wrongAnswer.problemNumber - b.wrongAnswer.problemNumber)
                      .map(item => (
                        <button key={item.id}
                          onClick={() => toggleGrade(item.wrongAnswerId)}
                          className={`w-16 h-16 rounded-lg text-sm font-medium transition-colors border-2 ${gradeResults[item.wrongAnswerId]
                            ? 'bg-green-500 text-white border-green-600'
                            : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                        >
                          <div>{item.wrongAnswer.problemNumber}번</div>
                          <div className="text-xs">{gradeResults[item.wrongAnswerId] ? '○ 정답' : '× 오답'}</div>
                        </button>
                      ))}
                  </div>
                  <div className="flex items-center gap-4 pt-2">
                    <p className="text-sm text-gray-600">
                      정답: <strong className="text-green-600">{Object.values(gradeResults).filter(Boolean).length}</strong> /
                      오답: <strong className="text-red-600">{gradingTest.items.length - Object.values(gradeResults).filter(Boolean).length}</strong>
                    </p>
                    <button
                      onClick={handleSubmitGrade}
                      disabled={grading}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {grading ? '제출 중...' : '채점 제출'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
