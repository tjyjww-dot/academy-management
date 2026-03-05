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
  const [perStudentHomework, setPerStudentHomework] = useState<Record<string, string>>({});
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [homework, setHomework] = useState('');
  const [prevAssignmentForHomework, setPrevAssignmentForHomework] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [counselingStudent, setCounselingStudent] = useState<any>(null);
  const [counselingNote, setCounselingNote] = useState('');
  const [reportCopied, setReportCopied] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState('');
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [commonTestName, setCommonTestName] = useState('');
  const [commonMaxScore, setCommonMaxScore] = useState('100');
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
      const pshMap: Record<string, string> = {};

      data.classroom.enrollments.forEach((e: any) => {
        const att = data.attendance.find((a: any) => a.studentId === e.student.id);
        attMap[e.student.id] = { status: att?.status || 'PRESENT', remarks: att?.remarks || '' };
        const gr = data.grades.find((g: any) => g.studentId === e.student.id);
        grMap[e.student.id] = { score: gr?.score?.toString() || '', maxScore: gr?.maxScore?.toString() || '100', testName: gr?.testName || '' };
        const dr = data.dailyReports.find((d: any) => d.studentId === e.student.id);
        agMap[e.student.id] = dr?.attitude || '';
        pshMap[e.student.id] = dr?.homework || '';
      });

      setAttendance(attMap);
      setGrades(grMap);
      setAssignmentGrades(agMap);
      setPerStudentHomework(pshMap);

      const histMap: Record<string, any[]> = {};
      data.allGrades.forEach((g: any) => {
        if (!histMap[g.studentId]) histMap[g.studentId] = [];
        histMap[g.studentId].push(g);
      });
      setGradeHistory(histMap);
      setPrevAssignments(data.prevAssignments || []);
      setPrevAssignmentForHomework(data.prevAssignmentForHomework || '');

      if (data.dailyReports.length > 0) {
        setProgressNote(data.dailyReports[0].content || '');
        setHomework(data.dailyReports[0].homework || '');
        setAnnouncement(data.dailyReports[0].specialNote || '');
      } else {
        setProgressNote('');
        setHomework('');
        setAnnouncement('');
      }

      if (data.videos && data.videos.length > 0) {
        setVideoTitle(data.videos[0].title || '');
        setVideoUrl(data.videos[0].videoUrl || '');
      } else {
        setVideoTitle('');
        setVideoUrl('');
      }

      if (data.todayAssignments && data.todayAssignments.length > 0) {
        setNewAssignmentTitle(data.todayAssignments[0].title || '');
        setNewAssignmentDesc(data.todayAssignments[0].description || '');
      } else {
        setNewAssignmentTitle('');
        setNewAssignmentDesc('');
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [classId, selectedDate]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);

  useEffect(() => {
    const fetchAllStudents = async () => {
      try {
        const res = await fetch('/api/students');
        if (res.ok) {
          const data = await res.json();
          setAllStudents(data.students || data || []);
        }
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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        alert('ììì´ ì¶ê°ëììµëë¤!');
        setStudentSearch('');
        setShowSearchDropdown(false);
        fetchDaily();
      } else {
        const errData = await res.json();
        alert(errData.error || 'ì¶ê° ì¤í¨');
      }
    } catch { alert('ìì ì¶ê°ì ì¤í¨íìµëë¤.'); }
  };

  const removeStudentFromClass = async (studentId: string, studentName: string) => {
    if (!confirm(studentName + ' íìì ì´ ë°ìì ì ê±°íìê² ìµëê¹?')) return;
    try {
      const res = await fetch('/api/classes/' + classId + '/enroll', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        alert('ì ê±°ëììµëë¤.');
        fetchDaily();
      } else { alert('ì ê±° ì¤í¨'); }
    } catch { alert('ì ê±°ì ì¤í¨íìµëë¤.'); }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const isCustom = classroom?.subject?.name === 'ë§ì¶¤ë°';

      const attendanceData = Object.entries(attendance).map(([studentId, val]) => ({
        studentId, status: val.status, remarks: val.remarks
      }));

      const gradesData = Object.entries(grades).map(([studentId, val]) => {
        if (!isCustom) {
          return { studentId, score: val.score, maxScore: commonMaxScore, testName: commonTestName };
        }
        return { studentId, score: val.score, maxScore: val.maxScore, testName: val.testName || '' };
      });

      const assignmentGradesArr = Object.entries(assignmentGrades).map(([studentId, grade]) => ({
        studentId, grade
      }));

      const perStudentHomeworkArr = isCustom
        ? Object.entries(perStudentHomework).map(([studentId, hw]) => ({ studentId, homework: hw }))
        : null;

      const res = await fetch('/api/classes/' + classId + '/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          attendanceData,
          gradesData,
          assignmentGrades: assignmentGradesArr,
          newAssignment: (newAssignmentTitle && !isCustom) ? { title: newAssignmentTitle, description: newAssignmentDesc } : null,
          videoData: videoUrl ? { title: videoTitle, videoUrl } : null,
          progressNote,
          homework: isCustom ? '' : homework,
          announcement,
          perStudentHomework: perStudentHomeworkArr,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      alert('ì ì¥ëììµëë¤!');
      fetchDaily();
    } catch { alert('ì ì¥ì ì¤í¨íìµëë¤.'); }
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
    const ag = assignmentGrades[student.id] || '-';
    const isCustom = classroom?.subject?.name === 'ë§ì¶¤ë°';
    const tn = isCustom ? (g?.testName || '-') : (commonTestName || '-');
    const ms = isCustom ? (g?.maxScore || '-') : (commonMaxScore || '-');
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dateStr = dateObj.getFullYear() + 'ë ' + (dateObj.getMonth() + 1) + 'ì ' + dateObj.getDate() + 'ì¼';
    const hwText = isCustom ? (perStudentHomework[student.id] || '-') : (homework || prevAssignmentForHomework || '-');

    return '[ìííêµ¬] ' + student.name + ' íì ìì ë¦¬í¬í¸\n' +
      'ð ' + dateStr + '\n\n' +
      'â­ ì¤ëì íì¤í¸\n' +
      '- ìí ë²ì : ' + tn + '\n' +
      '- ì ì : ' + (g?.score || '-') + ' / ' + ms + '\n' +
      (isCustom ? '' : '- íê·  : ' + currentAvg + ' / ìµê³ ì  : ' + currentMax + ' / ìµì ì  : ' + currentMin + '\n') +
      '\n' +
      'ð ê³¼ì  ìì±ë\n' +
      '- ë±ê¸ : ' + ag + '\n' +
      '  (A: ìë²½ / B: ìí¸ / C: ë³´íµ / D: ë¯¸í¡ / X: ë¯¸ì ì¶)\n\n' +
      'â¼ ì¤ë ìì ì§ë\n' +
      '- ' + (progressNote || '-') + '\n\n' +
      'ð¥ ì¤ë ìì ìì\n' +
      '- ì ëª© : ' + (videoTitle || '-') + '\n' +
      '- ë§í¬ : ' + (videoUrl || '-') + '\n\n' +
      'ð ì¤ëì ìì \n' +
      '- ' + hwText + '\n\n' +
      'ð¢ ê³µì§ì¬í­\n' +
      '- ' + (announcement || '-');
  };

  const copyReport = async (student: any) => {
    const report = generateReport(student);
    try {
      await navigator.clipboard.writeText(report);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = report;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setReportCopied(student.id);
    setTimeout(() => setReportCopied(null), 2000);
  };

  const handleSaveCounseling = async () => {
    if (!counselingStudent || !counselingNote.trim()) return;
    try {
      await fetch('/api/counseling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: counselingStudent.id,
          title: selectedDate + ' ìë´ ë©ëª¨',
          description: counselingNote,
          counselingType: 'TEACHER_INITIATED'
        })
      });
      alert('ìë´ ë©ëª¨ê° ì ì¥ëììµëë¤.');
      setCounselingStudent(null);
      setCounselingNote('');
    } catch { alert('ìë´ ì ì¥ ì¤í¨'); }
  };

  if (loading) return <div className="p-8 text-center">ë¡ë© ì¤...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!classroom) return <div className="p-8 text-center">ë°ì´í°ê° ììµëë¤</div>;

  const students = classroom.enrollments.map((e: any) => e.student);
  const isCustomClass = classroom.subject?.name === 'ë§ì¶¤ë°';
  const enrolledIds = new Set(students.map((s: any) => s.id));
  const filteredSearchStudents = allStudents.filter((s: any) =>
    !enrolledIds.has(s.id) && (s.name?.includes(studentSearch) || s.phone?.includes(studentSearch))
  );

  const currentScores = students.map((s: any) => grades[s.id]?.score).filter(Boolean).map(Number);
  const currentAvg = currentScores.length ? (currentScores.reduce((a: number, b: number) => a + b, 0) / currentScores.length).toFixed(1) : '-';
  const currentMax = currentScores.length ? Math.max(...currentScores).toString() : '-';
  const currentMin = currentScores.length ? Math.min(...currentScores).toString() : '-';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/classes')} className="text-gray-500 hover:text-gray-900 font-medium">â ëª©ë¡</button>
          <h1 className="text-3xl font-black text-gray-900">{classroom.name}</h1>
          <span className={isCustomClass ? 'px-3 py-1 rounded-full text-sm font-bold bg-purple-100 text-purple-700' : 'px-3 py-1 rounded-full text-sm font-bold bg-green-100 text-green-700'}>{classroom.subject?.name}</span>
          <div className="relative" ref={searchRef}>
            <input type="text" placeholder="ìì ê²ì/ì¶ê°..." value={studentSearch}
              onChange={(e) => { setStudentSearch(e.target.value); setShowSearchDropdown(e.target.value.length > 0); }}
              onFocus={() => { if (studentSearch.length > 0) setShowSearchDropdown(true); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-900" />
            {showSearchDropdown && filteredSearchStudents.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56 max-h-48 overflow-y-auto">
                {filteredSearchStudents.slice(0, 8).map((s: any) => (
                  <button key={s.id} onClick={() => addStudentToClass(s.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800 flex justify-between items-center">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.phone || ''}</span>
                  </button>))}
              </div>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">â</button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="bg-white border border-gray-300 rounded px-3 py-1 text-gray-900" />
          <button onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 1); setSelectedDate(d.toISOString().split('T')[0]); }} className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">â¶</button>
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])} className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm">ì¤ë</button>
          <button onClick={handleSave} disabled={saving} className="px-5 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold text-sm ml-2">
            {saving ? 'ì ì¥ ì¤...' : 'ð¾ ì ì¥'}
          </button>
        </div>
      </div>

      {!isCustomClass && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 shadow-sm">
          <div className="flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700">ìíë²ì:</label>
              <input type="text" placeholder="ë²ì ìë ¥" value={commonTestName} onChange={(e) => setCommonTestName(e.target.value)} className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-800 w-40" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-gray-700">ì´ì :</label>
              <input type="number" placeholder="100" value={commonMaxScore} onChange={(e) => setCommonMaxScore(e.target.value)} className="bg-white border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-800 w-20" />
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">íê· : <strong className="text-blue-600">{currentAvg}</strong></span>
              <span className="text-gray-600">ìµê³ : <strong className="text-red-600">{currentMax}</strong></span>
              <span className="text-gray-600">ìµì : <strong className="text-green-600">{currentMin}</strong></span>
            </div>
          </div>
        </div>
      )}

      {prevAssignments.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">ð ì´ì  ê³¼ì </h2>
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
              <th className="p-3 text-left text-gray-700 font-semibold">íì</th>
              <th className="p-3 text-center text-gray-700 font-semibold">ì¶ê²°</th>
              <th className="p-3 text-center text-gray-700 font-semibold">ë©ëª¨</th>
              {isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ìíë²ì</th>}
              <th className="p-3 text-center text-gray-700 font-semibold">ì ì</th>
              {isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ë§ì </th>}
              {isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ê³¼ì ë´ì©</th>}
              <th className="p-3 text-center text-gray-700 font-semibold">ê³¼ì </th>
              <th className="p-3 text-center text-gray-700 font-semibold">ë¦¬í¬í¸</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s: any) => {
              const stats = getStats(s.id);
              return (
                <tr key={s.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setCounselingStudent(s); setCounselingNote(''); }} className="text-blue-600 hover:text-blue-800 font-semibold">{s.name}</button>
                      <button onClick={() => removeStudentFromClass(s.id, s.name)} className="text-red-400 hover:text-red-600 text-xs ml-1" title="ë°ìì ì ê±°">â</button>
                    </div>
                    <div className="text-xs text-gray-400">íì {s.phone || '-'}</div>
                    <div className="text-xs text-gray-400">íë¶ëª¨ {s.parentPhone || '-'}</div>
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      <button onClick={() => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: 'PRESENT' } }))} className={'px-2 py-1 rounded text-xs font-bold ' + (attendance[s.id]?.status === 'PRESENT' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100 border border-gray-200')}>ì¶ì</button>
                      <button onClick={() => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: 'LATE' } }))} className={'px-2 py-1 rounded text-xs font-bold ' + (attendance[s.id]?.status === 'LATE' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-yellow-100 border border-gray-200')}>ì§ê°</button>
                      <button onClick={() => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: 'ABSENT' } }))} className={'px-2 py-1 rounded text-xs font-bold ' + (attendance[s.id]?.status === 'ABSENT' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-100 border border-gray-200')}>ê²°ì</button>
                    </div>
                  </td>
                  <td className="p-3"><input type="text" placeholder="ë©ëª¨" value={attendance[s.id]?.remarks || ''} onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], remarks: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-20" /></td>
                  {isCustomClass && <td className="p-3"><input type="text" placeholder="ë²ì" value={grades[s.id]?.testName || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], testName: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-20" /></td>}
                  <td className="p-3"><input type="number" placeholder="ì ì" value={grades[s.id]?.score || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-16" /></td>
                  {isCustomClass && <td className="p-3"><input type="number" placeholder="100" value={grades[s.id]?.maxScore || '100'} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], maxScore: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-16" /></td>}
                  {isCustomClass && (
                    <td className="p-3"><input type="text" placeholder="ê³¼ì  ë´ì© ìë ¥" value={perStudentHomework[s.id] || ''} onChange={(e) => setPerStudentHomework(prev => ({ ...prev, [s.id]: e.target.value }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 w-28" /></td>
                  )}
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {['A','B','C','D','X'].map(g => (
                        <button key={g} onClick={() => setAssignmentGrades(prev => ({ ...prev, [s.id]: g }))} className={'px-2 py-1 rounded text-xs ' + (assignmentGrades[s.id] === g ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200')}>{g}</button>))}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => copyReport(s)} className={'px-3 py-1 rounded text-xs ' + (reportCopied === s.id ? 'bg-green-500 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white')}>{reportCopied === s.id ? 'ë³µì¬ë¨!' : 'ë³µì¬'}</button>
                  </td>
                </tr>);
            })}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {!isCustomClass && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <h3 className="font-semibold mb-3 text-gray-800">ð ì¤ëì ê³¼ì </h3>
            <input type="text" placeholder="ê³¼ì  ì ëª©" value={newAssignmentTitle} onChange={(e) => setNewAssignmentTitle(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800 mb-2" />
            <input type="text" placeholder="ê³¼ì  ì¤ëª" value={newAssignmentDesc} onChange={(e) => setNewAssignmentDesc(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
          </div>
        )}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3 text-gray-800">ð¥ ìì ìì</h3>
          <input type="text" placeholder="ìì ì ëª©" value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800 mb-2" />
          <input type="text" placeholder="YouTube ë§í¬" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">â¼ ìì ì§ë</h3>
          <textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="ì¤ë ìì ì§ë ë´ì©" rows={3} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
          {!homework && prevAssignmentForHomework && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              📌 지난 수업 과제: {prevAssignmentForHomework}
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">ð ìì </h3>
          <textarea value={homework} onChange={(e) => setHomework(e.target.value)} placeholder={isCustomClass ? 'ë§ì¶¤ë°ì ì íì´ë¸ìì íìë³ë¡ ìë ¥íì¸ì' : 'ì¤ëì ìì '} rows={3} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" disabled={isCustomClass} />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">ð¢ ê³µì§ì¬í­</h3>
          <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="ê³µì§ì¬í­" rows={3} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
      </div>

      {counselingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">{counselingStudent.name} - ìë´ ë©ëª¨</h3>
            <div className="text-sm text-gray-500 mb-2">íì ì í: {counselingStudent.phone || '-'} | íë²: {counselingStudent.studentNumber || '-'}</div>
            <textarea value={counselingNote} onChange={(e) => setCounselingNote(e.target.value)} placeholder="ìë´ ë´ì©ì ìë ¥íì¸ì..." rows={5} className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800 mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCounselingStudent(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">ì·¨ì</button>
              <button onClick={handleSaveCounseling} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">ì ì¥</button>
            </div>
          </div>
        </div>)}
    </div>
  );
}
