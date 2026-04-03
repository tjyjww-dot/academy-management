'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ClassroomOption {
  id: string;
  name: string;
}

interface TestPaperPage {
  id: string;
  pageNumber: number;
  imageUrl: string;
}

interface TestPaper {
  id: string;
  name: string;
  totalProblems: number;
  answers: string | null;
  createdAt: string;
  classroom: { id: string; name: string };
  pages: TestPaperPage[];
  _count?: { wrongAnswers: number };
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
  const [stats, setStats] = useState<Stats>({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'papers' | 'register' | 'list'>('papers');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');

  // 시험지 관리 state
  const [testPapers, setTestPapers] = useState<TestPaper[]>([]);
  const [paperName, setPaperName] = useState('');
  const [paperTotal, setPaperTotal] = useState('');
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 정답 입력 state (시험지 등록 후 문항-정답 연결)
  const [showAnswerSetup, setShowAnswerSetup] = useState(false);
  const [answerMap, setAnswerMap] = useState<Record<number, string>>({});
  const [editingPaper, setEditingPaper] = useState<TestPaper | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedText, setExtractedText] = useState('');

  // 오답 등록 state
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedPaper, setSelectedPaper] = useState('');
  const [selectedProblems, setSelectedProblems] = useState<Set<number>>(new Set());
  const [regTestName, setRegTestName] = useState('');
  const [regProblemNumbers, setRegProblemNumbers] = useState('');
  const [registering, setRegistering] = useState(false);
  const [registerMode, setRegisterMode] = useState<'paper' | 'manual'>('paper');

  useEffect(() => {
    fetchClassrooms();
  }, []);

  const showMessage = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg);
    setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
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
    setSelectedPaper('');
    setSelectedProblems(new Set());
    if (!classroomId) {
      setWrongAnswers([]);
      setTestPapers([]);
      setStats({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });
      setStudents([]);
      return;
    }

    setLoading(true);
    try {
      const [waRes, papersRes, statsRes, classRes] = await Promise.all([
        fetch(`/api/wrong-answers?classroomId=${classroomId}`),
        fetch(`/api/test-papers?classroomId=${classroomId}`),
        fetch(`/api/wrong-answers/stats?classroomId=${classroomId}`),
        fetch(`/api/classes/${classroomId}`),
      ]);

      if (waRes.ok) {
        const waData = await waRes.json();
        setWrongAnswers(Array.isArray(waData) ? waData : []);
      }
      if (papersRes.ok) {
        const papersData = await papersRes.json();
        setTestPapers(Array.isArray(papersData) ? papersData : []);
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

  // 드래그앤드롭 핸들러
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    if (files.length === 0) {
      showMessage('PDF 파일만 업로드 가능합니다', 'error');
      return;
    }
    setUploadFiles(prev => [...prev, ...files]);
  }, []);

  const removeFile = (index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  };

  // PDF에서 문항-정답 자동 추출
  const extractAnswersFromPdf = async (file: File, totalProblems: number): Promise<Record<number, string>> => {
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('totalProblems', totalProblems.toString());

      const res = await fetch('/api/test-papers/extract', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('Extract failed:', data.error);
        return {};
      }

      if (data.rawText) {
        setExtractedText(data.rawText);
      }

      if (data.extractedCount > 0) {
        showMessage(data.message);
        return data.answers;
      } else {
        showMessage(data.message || 'PDF에서 정답을 자동 추출하지 못했습니다. 수동으로 입력해주세요.');
        return {};
      }
    } catch (error) {
      console.error('Extract error:', error);
      return {};
    } finally {
      setExtracting(false);
    }
  };

  // 시험지 업로드
  const handleUploadPaper = async () => {
    if (!paperName || !paperTotal || !selectedClassroom) {
      showMessage('시험명, 총 문항수, 반을 모두 입력해주세요', 'error');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', paperName);
      formData.append('totalProblems', paperTotal);
      formData.append('classroomId', selectedClassroom);
      uploadFiles.forEach(file => formData.append('images', file));

      const res = await fetch('/api/test-papers', {
        method: 'POST',
        body: formData,
      });

      const responseData = await res.json();

      if (!res.ok) {
        throw new Error(responseData.error || '업로드 실패');
      }

      const newPaper = responseData;
      if (newPaper.uploadWarning) {
        showMessage(`시험지 등록 완료! (${newPaper.uploadWarning}) 정답을 입력해주세요.`);
      } else {
        showMessage('시험지가 등록되었습니다! 정답을 입력해주세요.');
      }

      // 정답 입력 모드로 전환
      const total = parseInt(paperTotal);
      const initialAnswers: Record<number, string> = {};
      for (let i = 1; i <= total; i++) {
        initialAnswers[i] = '';
      }

      // PDF 파일이 있으면 자동 추출 시도
      if (uploadFiles.length > 0) {
        const extracted = await extractAnswersFromPdf(uploadFiles[0], total);
        if (Object.keys(extracted).length > 0) {
          for (const [num, ans] of Object.entries(extracted)) {
            initialAnswers[parseInt(num)] = ans;
          }
        }
      }

      setAnswerMap(initialAnswers);
      setEditingPaper(newPaper);
      setShowAnswerSetup(true);

      setPaperName('');
      setPaperTotal('');
      setUploadFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      handleClassroomChange(selectedClassroom);
    } catch (error: any) {
      showMessage(error.message || '시험지 업로드에 실패했습니다', 'error');
    } finally {
      setUploading(false);
    }
  };

  // 정답 저장
  const handleSaveAnswers = async () => {
    if (!editingPaper) return;

    const answersString = JSON.stringify(answerMap);
    try {
      const res = await fetch(`/api/test-papers/${editingPaper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: answersString }),
      });

      if (!res.ok) throw new Error('저장 실패');

      showMessage('정답이 저장되었습니다');
      setShowAnswerSetup(false);
      setEditingPaper(null);
      setAnswerMap({});
      handleClassroomChange(selectedClassroom);
    } catch (error: any) {
      showMessage(error.message || '정답 저장에 실패했습니다', 'error');
    }
  };

  // 기존 시험지의 정답 편집
  const handleEditAnswers = (paper: TestPaper) => {
    const total = paper.totalProblems;
    let existingAnswers: Record<number, string> = {};
    if (paper.answers) {
      try {
        existingAnswers = JSON.parse(paper.answers);
      } catch {
        existingAnswers = {};
      }
    }
    for (let i = 1; i <= total; i++) {
      if (!existingAnswers[i]) existingAnswers[i] = '';
    }
    setAnswerMap(existingAnswers);
    setEditingPaper(paper);
    setShowAnswerSetup(true);
  };

  // 시험지 삭제
  const handleDeletePaper = async (id: string) => {
    if (!confirm('이 시험지를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/test-papers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed');
      showMessage('시험지가 삭제되었습니다');
      handleClassroomChange(selectedClassroom);
    } catch {
      showMessage('삭제에 실패했습니다', 'error');
    }
  };

  // 문제번호 토글 (시험지 기반 등록)
  const toggleProblem = (num: number) => {
    setSelectedProblems(prev => {
      const next = new Set(prev);
      if (next.has(num)) next.delete(num);
      else next.add(num);
      return next;
    });
  };

  // 오답 등록 (시험지 기반)
  const handleRegisterFromPaper = async () => {
    if (!selectedStudent || !selectedPaper || selectedProblems.size === 0) {
      showMessage('학생, 시험지, 문제를 모두 선택해주세요', 'error');
      return;
    }

    const paper = testPapers.find(p => p.id === selectedPaper);
    if (!paper) return;

    setRegistering(true);
    try {
      const res = await fetch('/api/wrong-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent,
          classroomId: selectedClassroom,
          testName: paper.name,
          problemNumbers: Array.from(selectedProblems).sort((a, b) => a - b),
          testPaperId: paper.id,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed');
      }

      showMessage(`${selectedProblems.size}개 오답이 등록되었습니다`);
      setSelectedProblems(new Set());
      setSelectedStudent('');
      handleClassroomChange(selectedClassroom);
    } catch (error: any) {
      showMessage(error.message || '오답 등록에 실패했습니다', 'error');
    } finally {
      setRegistering(false);
    }
  };

  // 오답 등록 (수동 입력)
  const handleRegisterManual = async () => {
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

  // 오답 삭제
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

  // 학생별 오답 그룹핑
  const groupedByStudent = wrongAnswers.reduce((acc, wa) => {
    const key = wa.studentId;
    if (!acc[key]) acc[key] = { name: wa.student.name, items: [] };
    acc[key].items.push(wa);
    return acc;
  }, {} as Record<string, { name: string; items: WrongAnswer[] }>);

  // 정답 파싱 헬퍼
  const getAnswersFromPaper = (paper: TestPaper): Record<number, string> => {
    if (!paper.answers) return {};
    try {
      return JSON.parse(paper.answers);
    } catch {
      return {};
    }
  };

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
              { key: 'papers' as const, label: '시험지 관리' },
              { key: 'register' as const, label: '오답 등록' },
              { key: 'list' as const, label: '오답 현황' },
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
              {/* ==================== 시험지 관리 탭 ==================== */}
              {activeTab === 'papers' && (
                <div>
                  {/* 정답 입력/확인 모달 */}
                  {showAnswerSetup && editingPaper && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6">
                        <h3 className="text-lg font-bold text-gray-800 mb-2">
                          문항-정답 연결: {editingPaper.name}
                        </h3>
                        <p className="text-sm text-gray-500 mb-4">
                          PDF에서 자동으로 추출된 정답을 확인하고, 필요하면 수정하세요.
                        </p>

                        {/* 추출 진행 중 */}
                        {extracting && (
                          <div className="mb-4 p-4 bg-blue-50 rounded-lg flex items-center gap-3">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                            <span className="text-sm text-blue-700">PDF에서 문항과 정답을 추출하는 중...</span>
                          </div>
                        )}

                        {/* PDF 미리보기 및 추출된 텍스트 */}
                        {editingPaper.pages && editingPaper.pages.length > 0 && (
                          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                            <p className="text-sm font-medium text-gray-700 mb-2">첨부 파일:</p>
                            <div className="flex flex-wrap gap-2">
                              {editingPaper.pages.map((page) => (
                                <a
                                  key={page.id}
                                  href={page.imageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                  </svg>
                                  페이지 {page.pageNumber}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 추출된 원본 텍스트 미리보기 (접이식) */}
                        {extractedText && (
                          <details className="mb-4">
                            <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-800 font-medium">
                              PDF 추출 텍스트 보기 (정답이 올바르게 추출되지 않았을 때 참고)
                            </summary>
                            <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs text-gray-600 max-h-48 overflow-y-auto whitespace-pre-wrap">
                              {extractedText}
                            </pre>
                          </details>
                        )}

                        {/* 정답 입력 그리드 */}
                        <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2 mb-6">
                          {Object.keys(answerMap).sort((a, b) => Number(a) - Number(b)).map((numStr) => {
                            const num = Number(numStr);
                            return (
                              <div key={num} className="flex flex-col items-center">
                                <span className="text-xs font-semibold text-gray-500 mb-1">{num}번</span>
                                <input
                                  type="text"
                                  value={answerMap[num] || ''}
                                  onChange={(e) => {
                                    setAnswerMap(prev => ({ ...prev, [num]: e.target.value }));
                                  }}
                                  placeholder="-"
                                  maxLength={10}
                                  className="w-full text-center px-1 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            );
                          })}
                        </div>

                        {/* 정답 확인 요약 */}
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                          <p className="text-sm font-medium text-blue-800 mb-1">입력된 정답 확인:</p>
                          <div className="text-sm text-blue-700">
                            {Object.entries(answerMap)
                              .filter(([, v]) => v !== '')
                              .sort(([a], [b]) => Number(a) - Number(b))
                              .map(([num, ans]) => `${num}번: ${ans}`)
                              .join('  |  ') || '아직 입력된 정답이 없습니다'}
                          </div>
                          <p className="text-xs text-blue-600 mt-1">
                            입력 완료: {Object.values(answerMap).filter(v => v !== '').length} / {Object.keys(answerMap).length}문항
                          </p>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={handleSaveAnswers}
                            className="flex-1 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                          >
                            정답 저장
                          </button>
                          <button
                            onClick={() => { setShowAnswerSetup(false); setEditingPaper(null); }}
                            className="px-6 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                          >
                            나중에 입력
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 시험지 업로드 */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">시험지 업로드</h3>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">시험명</label>
                          <input
                            type="text"
                            value={paperName}
                            onChange={e => setPaperName(e.target.value)}
                            placeholder="예: 3월 모의고사"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">총 문항수</label>
                          <input
                            type="number"
                            value={paperTotal}
                            onChange={e => setPaperTotal(e.target.value)}
                            placeholder="예: 30"
                            min="1"
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>

                      {/* 드래그앤드롭 PDF 업로드 영역 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          시험지 PDF (선택사항)
                        </label>
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`relative cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                            isDragOver
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'
                          }`}
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept=".pdf,application/pdf"
                            onChange={e => {
                              const files = Array.from(e.target.files || []);
                              setUploadFiles(prev => [...prev, ...files]);
                              if (fileInputRef.current) fileInputRef.current.value = '';
                            }}
                            className="hidden"
                          />
                          <svg className="mx-auto w-12 h-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="text-sm font-medium text-gray-700">
                            {isDragOver ? 'PDF 파일을 놓으세요!' : 'PDF 파일을 드래그하거나 클릭하여 선택'}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">여러 개의 PDF 파일을 업로드할 수 있습니다</p>
                        </div>
                      </div>

                      {/* 선택된 파일 목록 */}
                      {uploadFiles.length > 0 && (
                        <div className="space-y-2">
                          {uploadFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
                              <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 2l5 5h-5V4zM6 20V4h5v7h7v9H6z"/>
                                  <path d="M8 14h3v1H9v1h2v1H9v2H8v-5zm4 0h2c.6 0 1 .4 1 1v1c0 .6-.4 1-1 1h-1v2h-1v-5zm1 2h1v-1h-1v1zm3-2h1.5v1H17v1h1v1h-1v1h-1v-5z"/>
                                </svg>
                                <span className="text-sm text-blue-800 font-medium">{file.name}</span>
                                <span className="text-xs text-blue-600">({(file.size / 1024).toFixed(0)} KB)</span>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                                className="text-red-500 hover:text-red-700 p-1"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={handleUploadPaper}
                        disabled={uploading || !paperName || !paperTotal}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {uploading ? '등록 중...' : '시험지 등록'}
                      </button>
                    </div>
                  </div>

                  {/* 등록된 시험지 목록 */}
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">등록된 시험지</h3>
                  {testPapers.length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
                      등록된 시험지가 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {testPapers.map(paper => {
                        const answers = getAnswersFromPaper(paper);
                        const answeredCount = Object.values(answers).filter(v => v !== '').length;
                        return (
                          <div key={paper.id} className="bg-white rounded-xl border border-gray-200 p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-1">
                                  <h4 className="font-semibold text-gray-800">{paper.name}</h4>
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
                                    {paper.totalProblems}문항
                                  </span>
                                  {answeredCount > 0 && (
                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                                      정답 {answeredCount}/{paper.totalProblems}
                                    </span>
                                  )}
                                  {paper._count && paper._count.wrongAnswers > 0 && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-medium">
                                      오답 {paper._count.wrongAnswers}건
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {new Date(paper.createdAt).toLocaleDateString('ko-KR')} 등록
                                  {paper.pages.length > 0 && ` · PDF ${paper.pages.length}개`}
                                </div>
                                {/* 첨부 파일 링크 */}
                                {paper.pages.length > 0 && (
                                  <div className="flex gap-2 mt-2">
                                    {paper.pages.map(page => (
                                      <a
                                        key={page.id}
                                        href={page.imageUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors"
                                      >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        PDF {page.pageNumber}
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {/* 정답 요약 (있을 경우) */}
                                {answeredCount > 0 && (
                                  <div className="mt-2 text-xs text-gray-500">
                                    정답: {Object.entries(answers)
                                      .filter(([, v]) => v !== '')
                                      .sort(([a], [b]) => Number(a) - Number(b))
                                      .slice(0, 10)
                                      .map(([num, ans]) => `${num}번=${ans}`)
                                      .join(', ')}
                                    {answeredCount > 10 && ` ... 외 ${answeredCount - 10}개`}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2 ml-4">
                                <button
                                  onClick={() => handleEditAnswers(paper)}
                                  className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                >
                                  {answeredCount > 0 ? '정답 수정' : '정답 입력'}
                                </button>
                                <button
                                  onClick={() => handleDeletePaper(paper.id)}
                                  className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium"
                                >
                                  삭제
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ==================== 오답 등록 탭 ==================== */}
              {activeTab === 'register' && (
                <div>
                  {/* 등록 모드 선택 */}
                  <div className="flex gap-3 mb-6">
                    <button
                      onClick={() => setRegisterMode('paper')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        registerMode === 'paper'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      시험지 기반 등록
                    </button>
                    <button
                      onClick={() => setRegisterMode('manual')}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        registerMode === 'manual'
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      수동 입력
                    </button>
                  </div>

                  {/* 학생 선택 (공통) */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">학생 선택</label>
                    <select
                      value={selectedStudent}
                      onChange={(e) => setSelectedStudent(e.target.value)}
                      className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                    >
                      <option value="">학생을 선택하세요</option>
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.studentNumber ? ` (${s.studentNumber})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {registerMode === 'paper' ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-base font-semibold text-gray-800 mb-4">시험지 기반 오답 등록</h3>

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">시험지 선택</label>
                        <select
                          value={selectedPaper}
                          onChange={(e) => { setSelectedPaper(e.target.value); setSelectedProblems(new Set()); }}
                          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white text-gray-800"
                        >
                          <option value="">시험지를 선택하세요</option>
                          {testPapers.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.totalProblems}문항)</option>
                          ))}
                        </select>
                      </div>

                      {selectedPaper && (() => {
                        const paper = testPapers.find(p => p.id === selectedPaper);
                        if (!paper) return null;
                        const answers = getAnswersFromPaper(paper);
                        return (
                          <>
                            <p className="text-sm text-gray-600 mb-3">
                              틀린 문제 번호를 클릭하세요 (선택됨: <span className="font-bold text-red-600">{selectedProblems.size}개</span>)
                            </p>
                            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 mb-4">
                              {Array.from({ length: paper.totalProblems }, (_, i) => i + 1).map(num => (
                                <button
                                  key={num}
                                  onClick={() => toggleProblem(num)}
                                  className={`relative p-2 rounded-lg text-sm font-medium transition-all border ${
                                    selectedProblems.has(num)
                                      ? 'bg-red-500 text-white border-red-600 shadow-sm'
                                      : 'bg-white text-gray-700 border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                                  }`}
                                >
                                  <div>{num}</div>
                                  {answers[num] && (
                                    <div className="text-[10px] opacity-70">({answers[num]})</div>
                                  )}
                                </button>
                              ))}
                            </div>

                            {/* 선택된 문제 요약 */}
                            {selectedProblems.size > 0 && (
                              <div className="mb-4 p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm text-red-700 font-medium">
                                  선택된 오답: {Array.from(selectedProblems).sort((a, b) => a - b).join(', ')}번
                                </p>
                              </div>
                            )}

                            <button
                              onClick={handleRegisterFromPaper}
                              disabled={registering || !selectedStudent || selectedProblems.size === 0}
                              className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                            >
                              {registering ? '등록 중...' : `오답 ${selectedProblems.size}개 등록`}
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-base font-semibold text-gray-800 mb-4">수동 오답 등록</h3>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">시험명</label>
                          <input
                            type="text"
                            value={regTestName}
                            onChange={e => setRegTestName(e.target.value)}
                            placeholder="예: 3월 모의고사"
                            className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">틀린 문제 번호</label>
                          <input
                            type="text"
                            value={regProblemNumbers}
                            onChange={e => setRegProblemNumbers(e.target.value)}
                            placeholder="예: 3, 7, 15, 22"
                            className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <p className="mt-1 text-xs text-gray-500">쉼표로 구분하여 입력하세요</p>
                        </div>
                        <button
                          onClick={handleRegisterManual}
                          disabled={registering || !selectedStudent || !regTestName || !regProblemNumbers}
                          className="px-6 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {registering ? '등록 중...' : '오답 등록'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ==================== 오답 현황 탭 ==================== */}
              {activeTab === 'list' && (
                <div>
                  {Object.keys(groupedByStudent).length === 0 ? (
                    <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
                      등록된 오답이 없습니다.
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {Object.entries(groupedByStudent).map(([studentId, data]) => (
                        <div key={studentId} className="bg-white rounded-xl border border-gray-200">
                          <div className="px-6 py-4 border-b border-gray-100">
                            <h4 className="font-semibold text-gray-800">{data.name}</h4>
                            <div className="flex gap-4 mt-1 text-xs text-gray-500">
                              <span>활성: {data.items.filter(i => i.status === 'ACTIVE').length}개</span>
                              <span>마스터: {data.items.filter(i => i.status === 'MASTERED').length}개</span>
                            </div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">시험명</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">문제번호</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">상태</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">회차</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">등록일</th>
                                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500">관리</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.items.map(wa => (
                                  <tr key={wa.id} className="border-t border-gray-100 hover:bg-gray-50">
                                    <td className="px-4 py-2 text-gray-800">{wa.testName}</td>
                                    <td className="px-4 py-2 text-center text-gray-800">{wa.problemNumber}번</td>
                                    <td className="px-4 py-2 text-center">
                                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                        wa.status === 'ACTIVE'
                                          ? 'bg-red-100 text-red-700'
                                          : 'bg-green-100 text-green-700'
                                      }`}>
                                        {wa.status === 'ACTIVE' ? '활성' : '마스터'}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2 text-center text-gray-600">{wa.round}회</td>
                                    <td className="px-4 py-2 text-center text-gray-500 text-xs">
                                      {new Date(wa.createdAt).toLocaleDateString('ko-KR')}
                                    </td>
                                    <td className="px-4 py-2 text-center">
                                      <button
                                        onClick={() => handleDeleteWrongAnswer(wa.id)}
                                        className="text-red-500 hover:text-red-700 text-xs font-medium"
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
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
