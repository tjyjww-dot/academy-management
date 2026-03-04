'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const [classroom, setClassroom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendance, setAttendance] = useState<Record<string, { status: string; remarks: string }>>({});
  const [grades, setGrades] = useState<Record<string, { score: string; maxScore: string; testName: string }>>({});
  const [gradeHistory, setGradeHistory] = useState<Record<string, any[]>>({});
  const [assignmentGrades, setAssignmentGrades] = useState<Record<string, string>>({});
  const [prevAssignments, setPrevAssignments] = useState<any[]>([]);
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDesc, setNewAssignmentDesc] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [homework, setHomework] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [counselingStudent, setCounselingStudent] = useState<any>(null);
  const [counselingNote, setCounselingNote] = useState('');
  const [reportCopied, setReportCopied] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const fetchDaily = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/classes/' + classId + '/daily?date=' + selectedDate);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setClassroom(data.classroom);
      const attMap: Record<string, { status: string; remarks: string }> = {};
      const grMap: Record<string, { score: string; maxScore: string; testName: string }> = {};
      const agMap: Record<string, string> = {};
      data.classroom.enrollments.forEach((e: any) => {
        const att = data.attendance.find((a: any) => a.studentId === e.student.id);
        attMap[e.student.id] = { status: att?.status || 'PRESENT', remarks: att?.remarks || '' };
        const gr = data.grades.find((g: any) => g.studentId === e.student.id);
        grMap[e.student.id] = { score: gr?.score?.toString() || '', maxScore: gr?.maxScore?.toString() || '100', testName: gr?.testName || '' };
        const dr = data.dailyReports.find((d: any) => d.studentId === e.student.id);
        agMap[e.student.id] = dr?.attitude || '';
      });
      setAttendance(attMap); setGrades(grMap); setAssignmentGrades(agMap);
      const histMap: Record<string, any[]> = {};
      data.allGrades.forEach((g: any) => { if (!histMap[g.studentId]) histMap[g.studentId] = []; histMap[g.studentId].push(g); });
      setGradeHistory(histMap);
      setPrevAssignments(data.prevAssignments || []);
      if (data.dailyReports.length > 0) { setProgressNote(data.dailyReports[0].content || ''); setHomework(data.dailyReports[0].homework || ''); setAnnouncement(data.dailyReports[0].specialNote || ''); }
      else { setProgressNote(''); setHomework(''); setAnnouncement(''); }
      if (data.videos && data.videos.length > 0) { setVideoTitle(data.videos[0].title || ''); setVideoUrl(data.videos[0].videoUrl || ''); }
      else { setVideoTitle(''); setVideoUrl(''); }
      if (data.todayAssignments && data.todayAssignments.length > 0) { setNewAssignmentTitle(data.todayAssignments[0].title || ''); setNewAssignmentDesc(data.todayAssignments[0].description || ''); }
      else { setNewAssignmentTitle(''); setNewAssignmentDesc(''); }
    } catch (err) { setError('Failed to load data'); }
    finally { setLoading(false); }
  }, [classId, selectedDate]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  useEffect(() => {
    const fetchAllStudents = async () => {
      try {
        const res = await fetch('/api/students');
        if (res.ok) { const data = await res.json(); setAllStudents(data.students || data || []); }
      } catch {}
    };
    fetchAllStudents();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowSearchDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addStudentToClass = async (studentId: string) => {
    try {
      const res = await fetch('/api/classes/' + classId + '/enroll', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) { alert('원생이 추가되었습니다!'); setStudentSearch(''); setShowSearchDropdown(false); fetchDaily(); }
      else { const errData = await res.json(); alert(errData.error || '추가 실패'); }
    } catch { alert('원생 추가에 실패했습니다.'); }
  };
  const handleSave = async () => {
    try {
      setSaving(true);
      const attendanceData = Object.entries(attendance).map(([studentId, val]) => ({ studentId, status: val.status, remarks: val.remarks }));
      const gradesData = Object.entries(grades).map(([studentId, val]) => ({ studentId, score: val.score, maxScore: val.maxScore, testName: val.testName || '' }));
      const assignmentGradesArr = Object.entries(assignmentGrades).map(([studentId, grade]) => ({ studentId, grade }));
      const res = await fetch('/api/classes/' + classId + '/daily', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, attendanceData, gradesData, assignmentGrades: assignmentGradesArr,
          newAssignment: newAssignmentTitle ? { title: newAssignmentTitle, description: newAssignmentDesc } : null,
          videoData: videoUrl ? { title: videoTitle, videoUrl } : null, progressNote, homework, announcement }),
      });
      if (!res.ok) throw new Error('Failed');
      alert('저장되었습니다!'); fetchDaily();
    } catch { alert('저장에 실패했습니다.'); }
    finally { setSaving(false); }
  };

  const getStats = (studentId: string) => {
    const hist = gradeHistory[studentId] || [];
    const scores = hist.map(h => h.score);
    return {
      avg: scores.length ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1) : '-',
      max: scores.length ? Math.max(...scores) : '-',
      min: scores.length ? Math.min(...scores) : '-',
    };
  };
  const generateReport = (student: any) => {
    const g = grades[student.id];
    const stats = getStats(student.id);
    const ag = assignmentGrades[student.id] || '-';
    return '[수학탐구] ' + student.name + ' 학생 수업 리포트\n\n' +
      '⭐ 오늘의 테스트\n' +
      '- 시험 범위 : ' + (g?.testName || '-') + '\n' +
      '- 점수 : ' + (g?.score || '-') + ' / ' + (g?.maxScore || '-') + '\n' +
      '- 최고점 : ' + stats.max + ' / 최저점 : ' + stats.min + '\n\n' +
      '📚 과제 완성도\n' +
      '- 등급 : ' + ag + '\n' +
      '  (A: 완벽 / B: 양호 / C: 보통 / D: 미흡 / X: 미제출)\n\n' +
      '◼ 오늘 수업 진도\n' +
      '- ' + (progressNote || '-') + '\n\n' +
      '🎥 오늘 수업 영상\n' +
      '- 제목 : ' + (videoTitle || '-') + '\n' +
      '- 링크 : ' + (videoUrl || '-') + '\n\n' +
      '📝 오늘의 숙제\n' +
      '- ' + (homework || '-') + '\n\n' +
      '📢 공지사항\n' +
      '- ' + (announcement || '-');
  };

  const copyReport = async (student: any) => {
    const report = generateReport(student);
    try { await navigator.clipboard.writeText(report); }
    catch { const ta = document.createElement('textarea'); ta.value = report; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
    setReportCopied(student.id);
    setTimeout(() => setReportCopied(null), 2000);
  };

  const handleSaveCounseling = async () => {
    if (!counselingStudent || !counselingNote.trim()) return;
    try {
      await fetch('/api/counseling', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: counselingStudent.id, title: selectedDate + ' 상담 메모',
          description: counselingNote, counselingType: 'TEACHER_INITIATED' }) });
      alert('상담 메모가 저장되었습니다.');
      setCounselingStudent(null); setCounselingNote('');
    } catch { alert('상담 저장 실패'); }
  };
  if (loading) return <div className="p-8 text-center">로딩 중...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!classroom) return <div className="p-8 text-center">데이터가 없습니다</div>;
  const students = classroom.enrollments.map((e: any) => e.student);

  const enrolledIds = new Set(students.map((s: any) => s.id));
  const filteredSearchStudents = allStudents.filter((s: any) =>
    !enrolledIds.has(s.id) &&
    (s.name?.includes(studentSearch) || s.phone?.includes(studentSearch))
  );

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/classes')} className="text-gray-500 hover:text-gray-900 font-medium">← 목록</button>
          <h1 className="text-3xl font-black text-gray-900">{classroom.name}</h1>
          <span className="text-gray-600 font-semibold text-lg">{classroom.subject?.name}</span>
          <div className="relative" ref={searchRef}>
            <input type="text" placeholder="원생 검색/추가..." value={studentSearch}
              onChange={(e) => { setStudentSearch(e.target.value); setShowSearchDropdown(e.target.value.length > 0); }}
              onFocus={() => { if (studentSearch.length > 0) setShowSearchDropdown(true); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-900" />
            {showSearchDropdown && filteredSearchStudents.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56 max-h-48 overflow-y-auto">
                {filteredSearchStudents.slice(0, 8).map((s: any) => (
                  <button key={s.id} onClick={() => addStudentToClass(s.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800 flex justify-between items-center">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.phone || ''}</span>
                  </button>))}
              </div>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">◀</button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-white border border-gray-300 rounded px-3 py-1 text-gray-900" />
          <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">▶</button>
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">오늘</button>
          <button onClick={handleSave} disabled={saving}
            className="px-5 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold text-sm ml-2">
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </div>

      {prevAssignments.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">📚 이전 과제</h2>
          <div className="space-y-2">
            {prevAssignments.map((a: any) => (
              <div key={a.id} className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded p-2 text-sm text-gray-800">
                <span>{a.assignmentDate} - {a.title}</span>
                <span className="text-gray-500">{a.description}</span>
              </div>))}
          </div>
        </div>)}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-blue-50 border-b border-blue-100">
            <tr>
              <th className="p-3 text-left text-gray-700 font-semibold">학생</th>
              <th className="p-3 text-center text-gray-700 font-semibold">출결</th>
              <th className="p-3 text-center text-gray-700 font-semibold">메모</th>
              <th className="p-3 text-center text-gray-700 font-semibold">시험범위</th>
              <th className="p-3 text-center text-gray-700 font-semibold">점수</th>
              <th className="p-3 text-center text-gray-700 font-semibold">만점</th>
              <th className="p-3 text-center text-gray-700 font-semibold">평균/최고/최저</th>
              <th className="p-3 text-center text-gray-700 font-semibold">과제</th>
              <th className="p-3 text-center text-gray-700 font-semibold">리포트</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s: any) => {
              const stats = getStats(s.id);
              return (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <button onClick={() => { setCounselingStudent(s); setCounselingNote(''); }} className="text-blue-600 hover:text-blue-800 font-semibold">{s.name}</button>
                    <div className="text-xs text-gray-400">{s.phone || '-'}</div>
                  </td>
                  <td className="p-3 text-center">
                    <select value={attendance[s.id]?.status || 'PRESENT'} onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800">
                      <option value="PRESENT">출석</option><option value="LATE">지각</option><option value="ABSENT">결석</option>
                    </select>
                  </td>
                  <td className="p-3"><input type="text" placeholder="메모" value={attendance[s.id]?.remarks || ''} onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], remarks: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-20" /></td>
                  <td className="p-3"><input type="text" placeholder="범위" value={grades[s.id]?.testName || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], testName: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-20" /></td>
                  <td className="p-3"><input type="number" placeholder="점수" value={grades[s.id]?.score || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-16" /></td>
                  <td className="p-3"><input type="number" placeholder="100" value={grades[s.id]?.maxScore || '100'} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], maxScore: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-16" /></td>
                  <td className="p-3 text-center text-xs text-gray-600">{stats.avg} / {stats.max} / {stats.min}</td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {['A','B','C','D','X'].map(g => (
                        <button key={g} onClick={() => setAssignmentGrades(prev => ({ ...prev, [s.id]: g }))} className={'px-2 py-1 rounded text-xs ' + (assignmentGrades[s.id] === g ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200')}>{g}</button>))}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => copyReport(s)} className={'px-3 py-1 rounded text-xs ' + (reportCopied === s.id ? 'bg-green-500 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white')}>{reportCopied === s.id ? '복사됨!' : '복사'}</button>
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3 text-gray-800">📝 오늘의 과제</h3>
          <input type="text" placeholder="과제 제목" value={newAssignmentTitle} onChange={(e) => setNewAssignmentTitle(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800 mb-2" />
          <input type="text" placeholder="과제 설명" value={newAssignmentDesc} onChange={(e) => setNewAssignmentDesc(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3 text-gray-800">🎥 수업 영상</h3>
          <input type="text" placeholder="영상 제목" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800 mb-2" />
          <input type="text" placeholder="YouTube 링크" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">◼ 수업 진도</h3>
          <textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="오늘 수업 진도 내용" rows={3} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">📝 숙제</h3>
          <textarea value={homework} onChange={(e) => setHomework(e.target.value)} placeholder="오늘의 숙제" rows={3} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">📢 공지사항</h3>
          <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="공지사항" rows={3} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
      </div>
      {counselingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">{counselingStudent.name} - 상담 메모</h3>
            <div className="text-sm text-gray-500 mb-2">학생 전화: {counselingStudent.phone || '-'} | 학번: {counselingStudent.studentNumber || '-'}</div>
            <textarea value={counselingNote} onChange={(e) => setCounselingNote(e.target.value)} placeholder="상담 내용을 입력하세요..." rows={5} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800 mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCounselingStudent(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">취소</button>
              <button onClick={handleSaveCounseling} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">저장</button>
            </div>
          </div>
        </div>)}
    </div>
  );
}
