'use client';

import { useEffect, useState, useRef } from 'react';

interface Classroom { id: string; name: string; }
interface Student { id: string; name: string; studentNumber?: string; }
interface TestPaperPage { id: string; pageNumber: number; imageUrl: string; }
interface TestPaper {
  id: string; name: string; totalProblems: number; createdAt: string;
  classroom: { id: string; name: string; };
  pages: TestPaperPage[];
  _count?: { wrongAnswers: number };
}
interface WrongAnswer {
  id: string; studentId: string; testName: string; problemNumber: number;
  problemImage: string | null; status: string; round: number; createdAt: string;
  student: { id: string; name: string; studentNumber?: string; };
  classroom: { id: string; name: string; };
  testPaper?: TestPaper | null;
}

export default function WrongAnswersPage() {
  const [tab, setTab] = useState<'papers' | 'register' | 'status'>('papers');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');

  // 시험지 관리
  const [testPapers, setTestPapers] = useState<TestPaper[]>([]);
  const [paperName, setPaperName] = useState('');
  const [paperTotal, setPaperTotal] = useState('');
  const [paperImages, setPaperImages] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // 오답 등록
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [selectedPaper, setSelectedPaper] = useState('');
  const [testName, setTestName] = useState('');
  const [wrongNums, setWrongNums] = useState<number[]>([]);
  const [registering, setRegistering] = useState(false);

  // 오답 현황
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : data.classes || [];
      setClassrooms(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedClassroom) {
      fetchTestPapers();
      fetchStudents();
      fetchWrongAnswers();
    }
  }, [selectedClassroom]);

  useEffect(() => {
    if (selectedClassroom) fetchWrongAnswers();
  }, [statusFilter]);

  const fetchTestPapers = () => {
    fetch(`/api/test-papers?classroomId=${selectedClassroom}`)
      .then(r => r.json()).then(setTestPapers).catch(() => {});
  };

  const fetchStudents = () => {
    fetch(`/api/students?classId=${selectedClassroom}`)
      .then(r => r.json()).then(data => {
        const list = Array.isArray(data) ? data : data.students || [];
        setStudents(list);
      }).catch(() => {});
  };

  const fetchWrongAnswers = () => {
    let url = `/api/wrong-answers?classroomId=${selectedClassroom}`;
    if (statusFilter) url += `&status=${statusFilter}`;
    fetch(url).then(r => r.json()).then(data => {
      setWrongAnswers(Array.isArray(data) ? data : []);
    }).catch(() => {});
  };

  // 시험지 업로드
  const handleUploadPaper = async () => {
    if (!paperName || !selectedClassroom || !paperTotal || paperImages.length === 0) {
      alert('시험지 이름, 반, 총 문항수, 이미지를 모두 입력해주세요.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('name', paperName);
      formData.append('classroomId', selectedClassroom);
      formData.append('totalProblems', paperTotal);
      paperImages.forEach(f => formData.append('images', f));

      const res = await fetch('/api/test-papers', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('업로드 실패');
      alert('시험지가 등록되었습니다.');
      setPaperName(''); setPaperTotal(''); setPaperImages([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchTestPapers();
    } catch (e: any) {
      alert(e.message || '업로드 중 오류 발생');
    } finally {
      setUploading(false);
    }
  };

  // 오답 등록
  const toggleWrongNum = (n: number) => {
    setWrongNums(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n].sort((a, b) => a - b));
  };

  const handleRegisterWrong = async () => {
    if (!selectedStudent || !selectedClassroom || !testName || wrongNums.length === 0) {
      alert('학생, 시험명, 오답 번호를 모두 입력해주세요.');
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
          testName,
          problemNumbers: wrongNums,
          testPaperId: selectedPaper || undefined,
        }),
      });
      if (!res.ok) throw new Error('등록 실패');
      alert(`${wrongNums.length}개 오답이 등록되었습니다.`);
      setWrongNums([]);
      fetchWrongAnswers();
    } catch (e: any) {
      alert(e.message || '등록 중 오류 발생');
    } finally {
      setRegistering(false);
    }
  };

  // 오답 삭제
  const handleDeleteWrong = async (id: string) => {
    if (!confirm('이 오답을 삭제하시겠습니까?')) return;
    try {
      await fetch(`/api/wrong-answers/${id}`, { method: 'DELETE' });
      fetchWrongAnswers();
    } catch { }
  };

  // 현재 선택된 시험지의 총 문항수
  const currentPaperTotal = selectedPaper
    ? testPapers.find(p => p.id === selectedPaper)?.totalProblems || 0
    : parseInt(paperTotal) || 30;

  const tabClass = (t: string) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${tab === t ? 'bg-white text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'}`;

  // 학생별 오답 그룹핑
  const groupedByStudent = wrongAnswers.reduce<Record<string, WrongAnswer[]>>((acc, wa) => {
    const key = wa.student?.name || wa.studentId;
    if (!acc[key]) acc[key] = [];
    acc[key].push(wa);
    return acc;
  }, {});

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">오답관리</h1>

      {/* 반 선택 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">반 선택</label>
        <select
          className="w-full md:w-64 border border-gray-300 rounded-lg px-3 py-2"
          value={selectedClassroom}
          onChange={e => setSelectedClassroom(e.target.value)}
        >
          <option value="">반을 선택하세요</option>
          {classrooms.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {selectedClassroom && (
        <>
          {/* 탭 */}
          <div className="flex gap-1 border-b border-gray-200 mb-4">
            <button className={tabClass('papers')} onClick={() => setTab('papers')}>시험지 관리</button>
            <button className={tabClass('register')} onClick={() => setTab('register')}>오답 등록</button>
            <button className={tabClass('status')} onClick={() => setTab('status')}>오답 현황</button>
          </div>

          {/* 시험지 관리 탭 */}
          {tab === 'papers' && (
            <div className="space-y-6">
              <div className="bg-white rounded-lg border p-4 space-y-4">
                <h3 className="font-semibold text-gray-800">새 시험지 등록</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">시험지 이름</label>
                    <input className="w-full border rounded-lg px-3 py-2" placeholder="예: 3월 2주차 테스트"
                      value={paperName} onChange={e => setPaperName(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">총 문항수</label>
                    <input className="w-full border rounded-lg px-3 py-2" type="number" placeholder="예: 25"
                      value={paperTotal} onChange={e => setPaperTotal(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">시험지 이미지 (페이지별)</label>
                  <input ref={fileInputRef} type="file" multiple accept="image/*"
                    className="w-full border rounded-lg px-3 py-2"
                    onChange={e => setPaperImages(Array.from(e.target.files || []))} />
                  {paperImages.length > 0 && (
                    <p className="text-sm text-gray-500 mt-1">{paperImages.length}개 이미지 선택됨</p>
                  )}
                </div>
                <button
                  onClick={handleUploadPaper}
                  disabled={uploading}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploading ? '업로드 중...' : '시험지 등록'}
                </button>
              </div>

              {/* 등록된 시험지 목록 */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="font-semibold text-gray-800 mb-3">등록된 시험지</h3>
                {testPapers.length === 0 ? (
                  <p className="text-gray-500 text-sm">등록된 시험지가 없습니다.</p>
                ) : (
                  <div className="space-y-3">
                    {testPapers.map(tp => (
                      <div key={tp.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium text-gray-800">{tp.name}</p>
                          <p className="text-sm text-gray-500">
                            {tp.totalProblems}문항 | {tp.pages?.length || 0}페이지 |
                            {new Date(tp.createdAt).toLocaleDateString('ko-KR')}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          {tp.pages?.[0] && (
                            <a href={tp.pages[0].imageUrl} target="_blank" rel="noopener noreferrer"
                              className="text-blue-600 text-sm hover:underline">미리보기</a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 오답 등록 탭 */}
          {tab === 'register' && (
            <div className="bg-white rounded-lg border p-4 space-y-4">
              <h3 className="font-semibold text-gray-800">오답 등록</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">학생 선택</label>
                  <select className="w-full border rounded-lg px-3 py-2" value={selectedStudent}
                    onChange={e => setSelectedStudent(e.target.value)}>
                    <option value="">학생을 선택하세요</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">시험지 선택 (선택사항)</label>
                  <select className="w-full border rounded-lg px-3 py-2" value={selectedPaper}
                    onChange={e => {
                      setSelectedPaper(e.target.value);
                      const p = testPapers.find(t => t.id === e.target.value);
                      if (p) setTestName(p.name);
                    }}>
                    <option value="">시험지를 선택하세요</option>
                    {testPapers.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.totalProblems}문항)</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">시험명</label>
                <input className="w-full border rounded-lg px-3 py-2" placeholder="예: 3월 2주차 테스트"
                  value={testName} onChange={e => setTestName(e.target.value)} />
              </div>

              {/* 문항 번호 버튼 */}
              <div>
                <label className="block text-sm text-gray-600 mb-2">
                  틀린 문항 번호 선택 (선택: {wrongNums.length}개)
                </label>
                <div className="flex flex-wrap gap-2">
                  {Array.from({ length: currentPaperTotal }, (_, i) => i + 1).map(n => (
                    <button key={n}
                      onClick={() => toggleWrongNum(n)}
                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-colors ${wrongNums.includes(n)
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {wrongNums.length > 0 && (
                <p className="text-sm text-red-600">
                  선택된 오답: {wrongNums.join(', ')}번
                </p>
              )}

              <button
                onClick={handleRegisterWrong}
                disabled={registering || !selectedStudent || !testName || wrongNums.length === 0}
                className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {registering ? '등록 중...' : '오답 등록'}
              </button>
            </div>
          )}

          {/* 오답 현황 탭 */}
          {tab === 'status' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  onClick={() => setStatusFilter('')}
                  className={`px-3 py-1 rounded-full text-sm ${!statusFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >전체</button>
                <button
                  onClick={() => setStatusFilter('ACTIVE')}
                  className={`px-3 py-1 rounded-full text-sm ${statusFilter === 'ACTIVE' ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >미해결</button>
                <button
                  onClick={() => setStatusFilter('MASTERED')}
                  className={`px-3 py-1 rounded-full text-sm ${statusFilter === 'MASTERED' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                >해결됨</button>
              </div>

              {Object.keys(groupedByStudent).length === 0 ? (
                <div className="bg-white rounded-lg border p-6 text-center text-gray-500">
                  등록된 오답이 없습니다.
                </div>
              ) : (
                Object.entries(groupedByStudent).map(([studentName, answers]) => (
                  <div key={studentName} className="bg-white rounded-lg border p-4">
                    <h3 className="font-semibold text-gray-800 mb-3">
                      {studentName}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        (미해결: {answers.filter(a => a.status === 'ACTIVE').length}개 /
                        해결: {answers.filter(a => a.status === 'MASTERED').length}개)
                      </span>
                    </h3>
                    {/* 시험별 그룹핑 */}
                    {Object.entries(
                      answers.reduce<Record<string, WrongAnswer[]>>((acc, wa) => {
                        if (!acc[wa.testName]) acc[wa.testName] = [];
                        acc[wa.testName].push(wa);
                        return acc;
                      }, {})
                    ).map(([tn, items]) => (
                      <div key={tn} className="mb-3 last:mb-0">
                        <p className="text-sm font-medium text-gray-600 mb-1">{tn}</p>
                        <div className="flex flex-wrap gap-2">
                          {items.sort((a, b) => a.problemNumber - b.problemNumber).map(wa => (
                            <div key={wa.id}
                              className={`relative group px-3 py-1 rounded-full text-sm ${wa.status === 'ACTIVE'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-green-100 text-green-700'}`}
                            >
                              {wa.problemNumber}번
                              {wa.round > 1 && <span className="text-xs ml-1">({wa.round}회)</span>}
                              {wa.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleDeleteWrong(wa.id)}
                                  className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center"
                                >×</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
