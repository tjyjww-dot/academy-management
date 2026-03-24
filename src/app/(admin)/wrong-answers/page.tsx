'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Student { id: string; name: string; studentNumber: string; }
interface Classroom { id: string; name: string; }
interface WrongAnswer {
  id: string; studentId: string; classroomId: string; testName: string;
  problemNumber: number; problemImage: string | null; status: string; round: number; createdAt: string;
  student: { id: string; name: string; studentNumber: string };
  classroom: { id: string; name: string };
  testPaperId: string | null;
}
interface WrongAnswerTest {
  id: string; studentId: string; classroomId: string; round: number;
  status: string; createdAt: string; gradedAt: string | null;
  student: { id: string; name: string; studentNumber: string };
  classroom: { id: string; name: string };
  items: Array<{ id: string; wrongAnswerId: string; isCorrect: boolean | null; wrongAnswer: WrongAnswer }>;
}
interface Stats { totalActive: number; totalMastered: number; totalTests: number; pendingTests: number; masteryRate: number; }
interface TestPaper {
  id: string; name: string; classroomId: string; totalProblems: number; createdAt: string;
  classroom: { id: string; name: string };
  pages: Array<{ id: string; pageNumber: number; imageUrl: string }>;
  _count: { wrongAnswers: number };
}

export default function WrongAnswersPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [tests, setTests] = useState<WrongAnswerTest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [testName, setTestName] = useState('');
  const [problemNumbers, setProblemNumbers] = useState('');
  const [gradingTest, setGradingTest] = useState<WrongAnswerTest | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});
  // New state for test papers
  const [testPapers, setTestPapers] = useState<TestPaper[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfName, setPdfName] = useState('');
  const [pdfTotalProblems, setPdfTotalProblems] = useState('');
  const [selectedTestPaper, setSelectedTestPaper] = useState('');
  const [viewingPaper, setViewingPaper] = useState<TestPaper | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchClassrooms = useCallback(async () => {
    try {
      const res = await fetch('/api/classrooms');
      if (res.ok) setClassrooms(await res.json());
    } catch {}
  }, []);

  const fetchStudents = useCallback(async (classroomId: string) => {
    try {
      const res = await fetch(`/api/students?classroomId=${classroomId}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(Array.isArray(data) ? data : data.students || []);
      }
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const res = await fetch(`/api/wrong-answers/stats?${params}`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchWrongAnswers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const res = await fetch(`/api/wrong-answers?${params}`);
      if (res.ok) setWrongAnswers(await res.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchTests = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const res = await fetch(`/api/wrong-answers/tests?${params}`);
      if (res.ok) setTests(await res.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchTestPapers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      const res = await fetch(`/api/test-papers?${params}`);
      if (res.ok) setTestPapers(await res.json());
    } catch {}
  }, [selectedClassroom]);

  useEffect(() => { fetchClassrooms(); }, [fetchClassrooms]);
  useEffect(() => {
    if (selectedClassroom) {
      fetchStudents(selectedClassroom);
      fetchTestPapers();
    }
  }, [selectedClassroom, fetchStudents, fetchTestPapers]);
  useEffect(() => {
    fetchStats(); fetchWrongAnswers(); fetchTests();
  }, [fetchStats, fetchWrongAnswers, fetchTests]);

  const handleRecord = async () => {
    if (!selectedStudent || !selectedClassroom || !testName || !problemNumbers) {
      showToast('모든 필드를 입력해주세요.', 'error'); return;
    }
    setLoading(true);
    try {
      const nums = problemNumbers.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      if (nums.length === 0) { showToast('문제 번호를 올바르게 입력해주세요.', 'error'); return; }

      const body: Record<string, unknown> = {
        studentId: selectedStudent, classroomId: selectedClassroom,
        testName, problemNumbers: nums,
      };
      if (selectedTestPaper) body.testPaperId = selectedTestPaper;

      const res = await fetch('/api/wrong-answers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast(`${nums.length}개 오답이 기록되었습니다.`);
        setProblemNumbers(''); setTestName('');
        fetchWrongAnswers(); fetchStats();
      } else {
        const err = await res.json();
        showToast(err.error || '오답 기록 실패', 'error');
      }
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setLoading(false); }
  };

  const handleGenerateTest = async () => {
    if (!selectedStudent || !selectedClassroom) {
      showToast('반과 학생을 선택해주세요.', 'error'); return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/wrong-answers/tests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent, classroomId: selectedClassroom }),
      });
      if (res.ok) { showToast('오답 테스트가 생성되었습니다.'); fetchTests(); }
      else { const err = await res.json(); showToast(err.error || '테스트 생성 실패', 'error'); }
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setLoading(false); }
  };

  const handleGrade = async () => {
    if (!gradingTest) return;
    setLoading(true);
    try {
      const results = gradingTest.items.map(item => ({
        testItemId: item.id,
        isCorrect: gradeResults[item.id] ?? false,
      }));
      const res = await fetch(`/api/wrong-answers/tests/${gradingTest.id}/grade`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });
      if (res.ok) {
        showToast('채점이 완료되었습니다.');
        setGradingTest(null); setGradeResults({});
        fetchTests(); fetchWrongAnswers(); fetchStats();
      } else { showToast('채점 실패', 'error'); }
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setLoading(false); }
  };

  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      showToast('PDF 파일만 업로드 가능합니다.', 'error'); return;
    }
    setUploadingPdf(true);
    setPdfPages([]);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push(canvas.toDataURL('image/png'));
      }
      setPdfPages(pages);
      setPdfName(file.name.replace('.pdf', ''));
      showToast(`${pages.length}페이지 추출 완료`);
    } catch (err) {
      console.error(err);
      showToast('PDF 처리 중 오류가 발생했습니다.', 'error');
    } finally { setUploadingPdf(false); }
  };

  const handleUploadTestPaper = async () => {
    if (!selectedClassroom || !pdfName || !pdfTotalProblems || pdfPages.length === 0) {
      showToast('모든 필드를 입력하고 PDF를 선택해주세요.', 'error'); return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', pdfName);
      formData.append('classroomId', selectedClassroom);
      formData.append('totalProblems', pdfTotalProblems);
      for (const dataUrl of pdfPages) {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        formData.append('images', blob, `page.png`);
      }
      const res = await fetch('/api/test-papers', { method: 'POST', body: formData });
      if (res.ok) {
        showToast('시험지가 업로드되었습니다.');
        setPdfPages([]); setPdfName(''); setPdfTotalProblems('');
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchTestPapers();
      } else { const err = await res.json(); showToast(err.error || '업로드 실패', 'error'); }
    } catch { showToast('오류가 발생했습니다.', 'error'); }
    finally { setLoading(false); }
  };

  const handleDeleteTestPaper = async (id: string) => {
    if (!confirm('이 시험지를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/test-papers/${id}`, { method: 'DELETE' });
      if (res.ok) { showToast('시험지가 삭제되었습니다.'); fetchTestPapers(); }
      else { showToast('삭제 실패', 'error'); }
    } catch { showToast('오류가 발생했습니다.', 'error'); }
  };

  const tabs = [
    { id: 'dashboard', label: '대시보드' },
    { id: 'upload', label: '시험지 업로드' },
    { id: 'record', label: '오답 기록' },
    { id: 'test', label: '오답 테스트' },
    { id: 'review', label: '오답 현황' },
  ];

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">오답 관리</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 mb-6">
        <select value={selectedClassroom} onChange={e => { setSelectedClassroom(e.target.value); setSelectedStudent(''); }}
          className="border rounded-lg px-3 py-2 bg-white">
          <option value="">반 선택</option>
          {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}
          className="border rounded-lg px-3 py-2 bg-white" disabled={!selectedClassroom}>
          <option value="">학생 선택 (전체)</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.studentNumber})</option>)}
        </select>
      </div>

      {/* 대시보드 탭 */}
      {activeTab === 'dashboard' && (
        <div>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-600">{stats.totalActive}</div>
                <div className="text-sm text-red-500 mt-1">활성 오답</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{stats.totalMastered}</div>
                <div className="text-sm text-green-500 mt-1">완료</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.totalTests}</div>
                <div className="text-sm text-blue-500 mt-1">총 테스트</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats.pendingTests}</div>
                <div className="text-sm text-yellow-500 mt-1">채점 대기</div>
              </div>
            </div>
          )}
          {stats && (
            <div className="bg-white border rounded-xl p-4">
              <div className="flex justify-between mb-2">
                <span className="font-medium">숙달률</span>
                <span className="font-bold text-blue-600">{stats.masteryRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-blue-600 h-4 rounded-full transition-all" style={{ width: `${stats.masteryRate}%` }}></div>
              </div>
            </div>
          )}
          {testPapers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold mb-3">최근 업로드된 시험지</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {testPapers.slice(0, 4).map(tp => (
                  <div key={tp.id} className="bg-white border rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{tp.name}</div>
                      <div className="text-sm text-gray-500">{tp.classroom.name} | {tp.totalProblems}문제 | {tp.pages.length}페이지</div>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">오답 {tp._count.wrongAnswers}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 시험지 업로드 탭 */}
      {activeTab === 'upload' && (
        <div>
          {!selectedClassroom ? (
            <div className="text-center py-12 text-gray-500">반을 먼저 선택해주세요.</div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white border rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4">새 시험지 업로드</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">시험지 이름</label>
                    <input type="text" value={pdfName} onChange={e => setPdfName(e.target.value)}
                      placeholder="예: 3월 24일 일일테스트" className="w-full border rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">총 문제 수</label>
                    <input type="number" value={pdfTotalProblems} onChange={e => setPdfTotalProblems(e.target.value)}
                      placeholder="예: 20" className="w-full border rounded-lg px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PDF 파일 선택</label>
                    <input ref={fileInputRef} type="file" accept=".pdf" onChange={handlePdfSelect}
                      className="w-full border rounded-lg px-3 py-2 bg-white" />
                    {uploadingPdf && <p className="text-blue-600 text-sm mt-1">PDF 처리 중...</p>}
                  </div>
                </div>

                {pdfPages.length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-medium mb-3">미리보기 ({pdfPages.length}페이지)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                      {pdfPages.map((page, i) => (
                        <div key={i} className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">페이지 {i + 1}</div>
                          <img src={page} alt={`페이지 ${i + 1}`} className="w-full" />
                        </div>
                      ))}
                    </div>
                    <button onClick={handleUploadTestPaper} disabled={loading || !pdfName || !pdfTotalProblems}
                      className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
                      {loading ? '업로드 중...' : '시험지 업로드'}
                    </button>
                  </div>
                )}
              </div>

              {testPapers.length > 0 && (
                <div className="bg-white border rounded-xl p-6">
                  <h3 className="text-lg font-bold mb-4">업로드된 시험지 목록</h3>
                  <div className="space-y-3">
                    {testPapers.map(tp => (
                      <div key={tp.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{tp.name}</div>
                            <div className="text-sm text-gray-500 mt-1">
                              {tp.classroom.name} | {tp.totalProblems}문제 | {tp.pages.length}페이지 | 오답 {tp._count.wrongAnswers}건
                            </div>
                            <div className="text-xs text-gray-400 mt-1">{new Date(tp.createdAt).toLocaleDateString('ko-KR')}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={() => setViewingPaper(viewingPaper?.id === tp.id ? null : tp)}
                              className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                              {viewingPaper?.id === tp.id ? '닫기' : '보기'}
                            </button>
                            <button onClick={() => handleDeleteTestPaper(tp.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-medium">삭제</button>
                          </div>
                        </div>
                        {viewingPaper?.id === tp.id && (
                          <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                            {tp.pages.map(page => (
                              <div key={page.id} className="border rounded overflow-hidden">
                                <div className="bg-gray-100 px-2 py-1 text-xs">페이지 {page.pageNumber}</div>
                                <img src={page.imageUrl} alt={`페이지 ${page.pageNumber}`} className="w-full" />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 오답 기록 탭 */}
      {activeTab === 'record' && (
        <div className="bg-white border rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4">오답 기록</h3>
          {!selectedClassroom || !selectedStudent ? (
            <div className="text-center py-8 text-gray-500">반과 학생을 선택해주세요.</div>
          ) : (
            <div className="space-y-4">
              {testPapers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">시험지 선택 (선택사항)</label>
                  <select value={selectedTestPaper} onChange={e => {
                    setSelectedTestPaper(e.target.value);
                    const tp = testPapers.find(t => t.id === e.target.value);
                    if (tp) setTestName(tp.name);
                  }} className="w-full border rounded-lg px-3 py-2 bg-white">
                    <option value="">시험지 없이 기록</option>
                    {testPapers.map(tp => (
                      <option key={tp.id} value={tp.id}>{tp.name} ({tp.totalProblems}문제)</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시험 이름</label>
                <input type="text" value={testName} onChange={e => setTestName(e.target.value)}
                  placeholder="예: 3월 24일 일일테스트" className="w-full border rounded-lg px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">틀린 문제 번호 (쉼표로 구분)</label>
                <input type="text" value={problemNumbers} onChange={e => setProblemNumbers(e.target.value)}
                  placeholder="예: 3, 7, 12, 15" className="w-full border rounded-lg px-3 py-2" />
              </div>
              {selectedTestPaper && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                  선택한 시험지의 이미지가 오답에 자동으로 연결됩니다.
                </div>
              )}
              <button onClick={handleRecord} disabled={loading}
                className="w-full bg-red-600 text-white py-3 rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-300">
                {loading ? '기록 중...' : '오답 기록'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 오답 테스트 탭 */}
      {activeTab === 'test' && (
        <div>
          {!selectedClassroom || !selectedStudent ? (
            <div className="text-center py-8 text-gray-500 bg-white border rounded-xl p-6">반과 학생을 선택해주세요.</div>
          ) : (
            <div className="space-y-4">
              <button onClick={handleGenerateTest} disabled={loading}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300">
                {loading ? '생성 중...' : '오답 테스트 생성'}
              </button>
              {tests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">테스트가 없습니다.</div>
              ) : (
                <div className="space-y-3">
                  {tests.map(test => (
                    <div key={test.id} className="bg-white border rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-medium">{test.student.name}</span>
                          <span className="text-sm text-gray-500 ml-2">Round {test.round}</span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded ${test.status === 'GRADED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {test.status === 'GRADED' ? '채점완료' : '대기중'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500 mb-2">
                        {new Date(test.createdAt).toLocaleDateString('ko-KR')} | {test.items.length}문제
                      </div>
                      {test.status === 'PENDING' && (
                        <button onClick={() => { setGradingTest(test); setGradeResults({}); }}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium">채점하기</button>
                      )}
                      {test.status === 'GRADED' && (
                        <div className="flex gap-1 flex-wrap">
                          {test.items.map(item => (
                            <span key={item.id} className={`w-8 h-8 flex items-center justify-center rounded text-xs font-bold ${item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                              {item.isCorrect ? 'O' : 'X'}
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
        </div>
      )}

      {/* 오답 현황 탭 */}
      {activeTab === 'review' && (
        <div>
          {wrongAnswers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 bg-white border rounded-xl p-6">오답 기록이 없습니다.</div>
          ) : (
            <div className="space-y-3">
              {wrongAnswers.map(wa => (
                <div key={wa.id} className="bg-white border rounded-xl p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{wa.student.name}</div>
                      <div className="text-sm text-gray-600">{wa.testName} - {wa.problemNumber}번</div>
                      <div className="text-xs text-gray-400 mt-1">{wa.classroom.name} | Round {wa.round}</div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded font-medium ${wa.status === 'ACTIVE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                      {wa.status === 'ACTIVE' ? '활성' : '완료'}
                    </span>
                  </div>
                  {wa.problemImage && (
                    <div className="mt-3 border rounded-lg overflow-hidden">
                      <img src={wa.problemImage} alt={`문제 ${wa.problemNumber}`} className="w-full max-h-48 object-contain bg-gray-50" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 채점 모달 */}
      {gradingTest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">채점 - {gradingTest.student.name} (Round {gradingTest.round})</h3>
              <button onClick={() => setGradingTest(null)} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>
            <div className="space-y-3">
              {gradingTest.items.map(item => (
                <div key={item.id} className="border rounded-lg p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-medium">{item.wrongAnswer.testName}</span>
                      <span className="text-gray-500 ml-2">{item.wrongAnswer.problemNumber}번</span>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setGradeResults(prev => ({ ...prev, [item.id]: true }))}
                        className={`px-3 py-1 rounded font-bold ${gradeResults[item.id] === true ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600'}`}>O</button>
                      <button onClick={() => setGradeResults(prev => ({ ...prev, [item.id]: false }))}
                        className={`px-3 py-1 rounded font-bold ${gradeResults[item.id] === false ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600'}`}>X</button>
                    </div>
                  </div>
                  {item.wrongAnswer.problemImage && (
                    <img src={item.wrongAnswer.problemImage} alt="문제" className="mt-2 w-full max-h-32 object-contain rounded border bg-gray-50" />
                  )}
                </div>
              ))}
            </div>
            <button onClick={handleGrade} disabled={loading || gradingTest.items.some(item => gradeResults[item.id] === undefined)}
              className="mt-4 w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300">
              {loading ? '채점 중...' : '채점 완료'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
