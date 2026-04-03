'use client';

import { useState, useEffect, useRef } from 'react';

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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || '업로드 실패');
      }

      showMessage('시험지가 업로드되었습니다');
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
              {/* Tab: 시험지 관리 */}
              {activeTab === 'papers' && (
                <div>
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
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          시험지 이미지 (선택사항)
                        </label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={e => setUploadFiles(Array.from(e.target.files || []))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          시험지 페이지 이미지를 업로드하세요. 여러 장 선택 가능합니다.
                        </p>
                      </div>
                      {uploadFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {uploadFiles.map((file, i) => (
                            <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs">
                              {file.name}
                            </span>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={handleUploadPaper}
                        disabled={uploading || !paperName || !paperTotal}
                        className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {uploading ? '업로드 중...' : '시험지 등록'}
                      </button>
                    </div>
                  </div>

                  {/* 등록된 시험지 목록 */}
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">등록된 시험지</h3>
                  {testPapers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-white rounded-xl border border-gray-200">
                      등록된 시험지가 없습니다.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {testPapers.map(paper => (
                        <div key={paper.id} className="bg-white rounded-xl border border-gray-200 p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-800">{paper.name}</h4>
                              <p className="text-sm text-gray-500 mt-1">
                                {paper.totalProblems}문항 | 이미지 {paper.pages.length}장
                              </p>
                              <p className="text-xs text-gray-400 mt-1">
                                {new Date(paper.createdAt).toLocaleDateString('ko-KR')}
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeletePaper(paper.id)}
                              className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                            >
                              삭제
                            </button>
                          </div>
                          {paper.pages.length > 0 && (
                            <div className="mt-3 flex gap-2 overflow-x-auto">
                              {paper.pages.map(page => (
                                <img
                                  key={page.id}
                                  src={page.imageUrl}
                                  alt={`${paper.name} 페이지 ${page.pageNumber}`}
                                  className="h-20 w-auto rounded border border-gray-200 cursor-pointer hover:opacity-80"
                                  onClick={() => window.open(page.imageUrl, '_blank')}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab: 오답 등록 */}
              {activeTab === 'register' && (
                <div className="max-w-2xl">
                  {/* 등록 방식 선택 */}
                  <div className="flex gap-2 mb-6">
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

                  {registerMode === 'paper' ? (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">시험지 기반 오답 등록</h3>
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
                          <label className="block text-sm font-medium text-gray-700 mb-1">시험지</label>
                          <select
                            value={selectedPaper}
                            onChange={e => { setSelectedPaper(e.target.value); setSelectedProblems(new Set()); }}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white"
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
                          return (
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                틀린 문제를 클릭하세요 ({selectedProblems.size}개 선택)
                              </label>
                              <div className="flex flex-wrap gap-2">
                                {Array.from({ length: paper.totalProblems }, (_, i) => i + 1).map(num => (
                                  <button
                                    key={num}
                                    onClick={() => toggleProblem(num)}
                                    className={`w-11 h-11 rounded-lg text-sm font-medium transition-all ${
                                      selectedProblems.has(num)
                                        ? 'bg-red-500 text-white shadow-md scale-110'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>
                              {selectedProblems.size > 0 && (
                                <p className="mt-2 text-sm text-red-600">
                                  선택된 문제: {Array.from(selectedProblems).sort((a, b) => a - b).join(', ')}
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        <button
                          onClick={handleRegisterFromPaper}
                          disabled={registering || !selectedStudent || !selectedPaper || selectedProblems.size === 0}
                          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {registering ? '등록 중...' : `오답 ${selectedProblems.size}개 등록`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-gray-200 p-6">
                      <h3 className="text-lg font-semibold text-gray-800 mb-4">수동 오답 등록</h3>
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
                          onClick={handleRegisterManual}
                          disabled={registering}
                          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {registering ? '등록 중...' : '오답 등록'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab: 오답 현황 */}
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
            </>
          )}
        </>
      )}
    </div>
  );
}
