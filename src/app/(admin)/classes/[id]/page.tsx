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
  const [assignmentMemos, setAssignmentMemos] = useState<Record<string, string>>({});
  const [prevAssignments, setPrevAssignments] = useState<any[]>([]);
  const [prevAssignmentForHomework, setPrevAssignmentForHomework] = useState('');
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDesc, setNewAssignmentDesc] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [homework, setHomework] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [counselingStudent, setCounselingStudent] = useState<any>(null);
  const [counselingNote, setCounselingNote] = useState('');
  const [perStudentHomeworkMap, setPerStudentHomeworkMap] = useState<Record<string, string>>({});
  const [perStudentProgressMap, setPerStudentProgressMap] = useState<Record<string, string>>({});
  const [reportCopied, setReportCopied] = useState<string | null>(null);

  // ìí ê´ë ¨ state
  const [testName, setTestName] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  // ìì ê²ì ê´ë ¨ state
  const [studentSearch, setStudentSearch] = useState('');
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // attitude íëìì ë±ê¸ê³¼ ë©ëª¨ë¥¼ ë¶ë¦¬íë í¬í¼ í¨ì
  const parseAttitude = (attitude: string | null | undefined): { grade: string; memo: string } => {
    if (!attitude) return { grade: '', memo: '' };
    const idx = attitude.indexOf('::');
    if (idx === -1) return { grade: attitude, memo: '' };
    return { grade: attitude.substring(0, idx), memo: attitude.substring(idx + 2) };
  };

  // ë±ê¸ê³¼ ë©ëª¨ë¥¼ í©ì¹ë í¬í¼ í¨ì
  const combineAttitude = (grade: string, memo: string): string => {
    if (!memo) return grade;
    return grade + '::' + memo;
  };

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
      const amMap: Record<string, string> = {};

      data.classroom.enrollments.forEach((e: any) => {
        const att = data.attendance.find((a: any) => a.studentId === e.student.id);
        // ì¶ê²° ë°ì´í°ê° ìì¼ë©´ ê·¸ ê°ì ì¬ì©, ìì¼ë©´ ë¹ ìíë¡ (ê¸°ë³¸ ì¶ì ì²´í¬ ì í¨)
        attMap[e.student.id] = {
          status: att?.status || '',
          remarks: att?.remarks || ''
        };
        const gr = data.grades.find((g: any) => g.studentId === e.student.id);
        grMap[e.student.id] = { score: gr?.score?.toString() || '', maxScore: gr?.maxScore?.toString() || '100', testName: gr?.testName || '' };
        const dr = data.dailyReports.find((d: any) => d.studentId === e.student.id);
        const parsed = parseAttitude(dr?.attitude);
        agMap[e.student.id] = parsed.grade;
        amMap[e.student.id] = parsed.memo;
      });

      setAttendance(attMap);
      setGrades(grMap);
      setAssignmentGrades(agMap);
      setAssignmentMemos(amMap);

      const histMap: Record<string, any[]> = {};
      data.allGrades.forEach((g: any) => {
        if (!histMap[g.studentId]) histMap[g.studentId] = [];
        histMap[g.studentId].push(g);
      });
      setGradeHistory(histMap);

      // ì´ì  ê³¼ì  ì¤ë³µ ì ê±° (ì ëª©+ë ì§ ê¸°ì¤)
      const uniqueAssignments: any[] = [];
      const seen = new Set<string>();
      (data.prevAssignments || []).forEach((a: any) => {
        const key = a.assignmentDate + '|' + a.title;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueAssignments.push(a);
        }
      });
      setPrevAssignments(uniqueAssignments);
      setPrevAssignmentForHomework(data.prevAssignmentForHomework || '');

      if (data.dailyReports.length > 0) {
        // contentê° JSON íìì´ë©´ progressNote ì¶ì¶, ìëë©´ ê·¸ëë¡ ì¬ì© (ë ê±°ì í¸í)
        let loadedProgressNote = '';
        if (data.dailyReports[0]?.content) {
          try {
            const parsed = JSON.parse(data.dailyReports[0].content);
            if (parsed && typeof parsed === 'object' && parsed.progressNote !== undefined) {
              loadedProgressNote = parsed.progressNote || '';
            }
          } catch {
            const raw = data.dailyReports[0].content;
            if (raw.startsWith('{') || raw.startsWith('[')) {
              loadedProgressNote = '';
            } else {
              loadedProgressNote = raw;
            }
          }
        }
        setProgressNote(loadedProgressNote);
        setHomework(data.dailyReports[0].homework || '');
        setAnnouncement(data.dailyReports[0].specialNote || '');
        const pshMap: Record<string, string> = {};
        const pspMap: Record<string, string> = {};
        data.dailyReports.forEach((dr: any) => {
          if (dr.homework) pshMap[dr.studentId] = dr.homework;
          if (dr.content) pspMap[dr.studentId] = dr.content;
        });
        setPerStudentHomeworkMap(pshMap);
        setPerStudentProgressMap(pspMap);
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

      // ìí ë²ìì ë§ì ì ê³µíµì¼ë¡ ì¤ì 
      // 1ìì: APIìì ë°íí savedTestName/savedMaxScore (DailyReportì ì ì¥ë ê°)
      // 2ìì: ê¸°ì¡´ Grade ë ì½ëìì ê°ì ¸ì¨ ê°
      if (data.savedTestName || data.savedMaxScore) {
        setTestName(data.savedTestName || '');
        setMaxScore(data.savedMaxScore || '100');
      } else {
        const firstGrade = data.grades?.[0];
        if (firstGrade) {
          setTestName(firstGrade.testName || '');
          setMaxScore(firstGrade.maxScore?.toString() || '100');
        } else {
          setTestName('');
          setMaxScore('100');
        }
      }
    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [classId, selectedDate]);

  useEffect(() => {
    fetchDaily();
  }, [fetchDaily]);

  // ì ì²´ íì ëª©ë¡ ê°ì ¸ì¤ê¸° (ìì ê²ìì©)
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

  // ê²ì ëë¡­ë¤ì´ ì¸ë¶ í´ë¦­ ë«ê¸°
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ìì ì¶ê° í¨ì
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
    } catch {
      alert('ìì ì¶ê°ì ì¤í¨íìµëë¤.');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const attendanceData = Object.entries(attendance).map(([studentId, val]) => ({
        studentId, status: val.status, remarks: val.remarks
      }));
      const isCustomClass = classroom.name?.includes('ë§ì¶¤') || classroom.subject?.name?.includes('ë§ì¶¤');
      const gradesData = Object.entries(grades).map(([studentId, val]) => ({
        studentId,
        score: val.score,
        maxScore: isCustomClass ? (val.maxScore || '100') : maxScore,
        testName: isCustomClass ? (val.testName || '') : testName
      }));
      // ê³¼ì  ë±ê¸ê³¼ ë©ëª¨ë¥¼ í©ì³ì ì ì¡
      const assignmentGradesArr = Object.entries(assignmentGrades).map(([studentId, grade]) => ({
        studentId, grade: combineAttitude(grade, assignmentMemos[studentId] || '')
      }));

      const res = await fetch('/api/classes/' + classId + '/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          attendanceData,
          gradesData,
          assignmentGrades: assignmentGradesArr,
          newAssignment: newAssignmentTitle ? { title: newAssignmentTitle, description: newAssignmentDesc } : null,
          videoData: videoUrl ? { title: videoTitle, videoUrl } : null,
          progressNote,
          homework,
          announcement,
          perStudentHomework: Object.entries(perStudentHomeworkMap).map(([studentId, hw]) => ({ studentId, homework: hw })),
          perStudentProgress: Object.entries(perStudentProgressMap).map(([studentId, prog]) => ({ studentId, progress: prog })),
          testName,
          maxScore,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      alert('ì ì¥ëììµëë¤!');
      fetchDaily();
    } catch {
      alert('ì ì¥ì ì¤í¨íìµëë¤.');
    } finally {
      setSaving(false);
    }
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
    const am = assignmentMemos[student.id] || '';
    
    if (isCustomClass) {
      // ë§ì¶¤ë° ë¦¬í¬í¸ - ê°ë³ ìì /ì§ë
      const studentHomework = perStudentHomeworkMap[student.id] || '-';
      const studentProgress = perStudentProgressMap[student.id] || '-';
      return '[ìííêµ¬] ' + student.name + ' íì ìì ë¦¬í¬í¸\n\n' +
        '\u2B50 ì¤ëì íì¤í¸\n' +
        '- ìí ë²ì : ' + (g?.testName || '-') + '\n' +
        '- ì ì : ' + (g?.score || '-') + ' / ' + (g?.maxScore || '-') + '\n\n' +
        '\uD83D\uDCDA ê³¼ì  ìì±ë\n' +
        '- ë±ê¸ : ' + ag + '\n' +
        ' (A: ìë²½ / B: ìí¸ / C: ë³´íµ / D: ë¯¸í¡ / X: ë¯¸ì ì¶)\n' +
        (am ? '- ë©ëª¨ : ' + am + '\n' : '') +
        '\n' +
        '\u25FC ì¤ë ìì ì§ë\n' +
        '- ' + studentProgress + '\n\n' +
        '\uD83D\uDCDD ì¤ëì ìì \n' +
        '- ' + studentHomework + '\n\n' +
        '\uD83D\uDCE2 ê³µì§ì¬í­\n' +
        '- ' + (announcement || '-');
    }
    
    // ì ê·ë° ë¦¬í¬í¸
    return '[ìííêµ¬] ' + student.name + ' íì ìì ë¦¬í¬í¸\n\n' +
      '\u2B50 ì¤ëì íì¤í¸\n' +
      '- ìí ë²ì : ' + (g?.testName || '-') + '\n' +
      '- ì ì : ' + (g?.score || '-') + ' / ' + (g?.maxScore || '-') + '\n' +
      '- íê·  : ' + avgScore + ' / ìµê³ ì  : ' + highScore + ' / ìµì ì  : ' + lowScore + '\n\n' +
      '\uD83D\uDCDA ê³¼ì  ìì±ë\n' +
      '- ë±ê¸ : ' + ag + '\n' +
      ' (A: ìë²½ / B: ìí¸ / C: ë³´íµ / D: ë¯¸í¡ / X: ë¯¸ì ì¶)\n' +
      (am ? '- ë©ëª¨ : ' + am + '\n' : '') +
      '\n' +
      '\u25FC ì¤ë ìì ì§ë\n' +
      '- ' + (progressNote || '-') + '\n\n' +
      '\uD83C\uDFA5 ì¤ë ìì ìì\n' +
      '- ì ëª© : ' + (videoTitle || '-') + '\n' +
      '- ë§í¬ : ' + (videoUrl || '-') + '\n\n' +
      '\uD83D\uDCDD ì¤ëì ìì \n' +
      '- ' + (homework || prevAssignmentForHomework || '-') + '\n\n' +
      '\uD83D\uDCE2 ê³µì§ì¬í­\n' +
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

    // Send push notification to parents
    try {
      await fetch('/api/classes/' + classId + '/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          sendPushNotification: { studentId: student.id, studentName: student.name },
        }),
      });
    } catch (e) { console.error('Push notification send error:', e); }
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
    } catch {
      alert('ìë´ ì ì¥ ì¤í¨');
    }
  };

  // ìì ë°ìì ì ê±°
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
      } else {
        alert('ì ê±° ì¤í¨');
      }
    } catch {
      alert('ì ê±°ì ì¤í¨íìµëë¤.');
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-700">ë¡ë© ì¤...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!classroom) return <div className="p-8 text-center text-gray-700">ë°ì´í°ê° ììµëë¤</div>;

  const students = classroom.enrollments.map((e: any) => e.student);
  const isCustomClass = classroom.name?.includes('ë§ì¶¤') || classroom.subject?.name?.includes('ë§ì¶¤');

  // ê²ì íí°ë§ (ì´ë¯¸ ë±ë¡ë íì ì ì¸)
  const enrolledIds = new Set(students.map((s: any) => s.id));
  const filteredSearchStudents = allStudents.filter((s: any) =>
    !enrolledIds.has(s.id) &&
    (s.name?.includes(studentSearch) || s.phone?.includes(studentSearch))
  );

  // ìí íµê³ ê³ì°
  const todayScores = students
    .map((s: any) => parseFloat(grades[s.id]?.score || ''))
    .filter((v: number) => !isNaN(v));
  const avgScore = todayScores.length > 0
    ? (todayScores.reduce((a: number, b: number) => a + b, 0) / todayScores.length).toFixed(1)
    : '-';
  const highScore = todayScores.length > 0 ? Math.max(...todayScores) : '-';
  const lowScore = todayScores.length > 0 ? Math.min(...todayScores) : '-';

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* í¤ë ìì­ */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/classes')} className="text-gray-500 hover:text-gray-900 font-medium">{'\u2190'} ëª©ë¡</button>
          <h1 className="text-3xl font-black text-gray-900">{classroom.name}</h1>
          <span className="text-gray-600 font-semibold text-lg">{classroom.subject?.name}</span>
          <div className="relative" ref={searchRef}>
            <input
              type="text"
              placeholder="ìì ê²ì/ì¶ê°..."
              value={studentSearch}
              onChange={(e) => {
                setStudentSearch(e.target.value);
                setShowSearchDropdown(e.target.value.length > 0);
              }}
              onFocus={() => { if (studentSearch.length > 0) setShowSearchDropdown(true); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white text-gray-900"
            />
            {showSearchDropdown && filteredSearchStudents.length > 0 && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-56 max-h-48 overflow-y-auto">
                {filteredSearchStudents.slice(0, 8).map((s: any) => (
                  <button
                    key={s.id}
                    onClick={() => addStudentToClass(s.id)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800 flex justify-between items-center"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-xs text-gray-400">{s.phone || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }} className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">{'\u25C0'}</button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white border border-gray-300 rounded px-3 py-1 text-gray-900"
          />
          <button onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }} className="px-2 py-1 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">{'\u25B6'}</button>
          <button
            onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
          >ì¤ë</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-1.5 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg font-semibold text-sm ml-2"
          >
            {saving ? 'ì ì¥ ì¤...' : '\uD83D\uDCBE ì ì¥'}
          </button>
        </div>
      </div>

      {/* ìí ì ë³´ */}
      {!isCustomClass && <div className="mb-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex items-center gap-4 flex-wrap">
        <span className="text-gray-700 font-semibold">ìíë²ì:</span>
        <input type="text" placeholder="ë²ì ìë ¥" value={testName}
          onChange={(e) => {
            setTestName(e.target.value);
            // ëª¨ë  íìì ìíë²ìë¥¼ ëê¸°í
            const newGrades = { ...grades };
            students.forEach((s: any) => {
              if (newGrades[s.id]) {
                newGrades[s.id] = { ...newGrades[s.id], testName: e.target.value };
              }
            });
            setGrades(newGrades);
          }}
          className="bg-white border border-gray-300 rounded px-3 py-1.5 text-gray-800 w-48" />
        <span className="text-gray-700 font-semibold">ì´ì :</span>
        <input type="number" placeholder="100" value={maxScore}
          onChange={(e) => {
            setMaxScore(e.target.value);
            const newGrades = { ...grades };
            students.forEach((s: any) => {
              if (newGrades[s.id]) {
                newGrades[s.id] = { ...newGrades[s.id], maxScore: e.target.value };
              }
            });
            setGrades(newGrades);
          }}
          className="bg-white border border-gray-300 rounded px-3 py-1.5 text-gray-800 w-20" />
        <span className="text-gray-600 text-sm">íê· : {avgScore}</span>
        <span className="text-gray-600 text-sm">ìµê³ : {highScore}</span>
        <span className="text-gray-600 text-sm">ìµì : {lowScore}</span>
      </div>}

      {/* ì´ì  ê³¼ì  (ì¤ë³µ ì ê±°ë¨) */}
      {prevAssignments.length > 0 && (
        <div className="mb-6 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">{'\uD83D\uDCDA'} ì´ì  ê³¼ì </h2>
          <div className="space-y-2">
            {prevAssignments.slice(0, 1).map((a: any, idx: number) => (
              <div key={a.id || idx} className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded p-2 text-sm text-gray-800">
                <span>{a.assignmentDate} - {a.title}</span>
                {a.description && <span className="text-gray-500">{a.description}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* íì íì´ë¸ */}
      <div className="mb-6 bg-white border border-gray-200 rounded-lg overflow-x-auto shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-blue-50 border-b border-blue-100">
            <tr>
              <th className="p-3 text-left text-gray-700 font-semibold">íì</th>
              <th className="p-3 text-center text-gray-700 font-semibold">{isCustomClass ? 'ì¶ê²°/ë©ëª¨' : 'ì¶ê²°'}</th>
              {!isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ë©ëª¨</th>}
              <th className="p-3 text-center text-gray-700 font-semibold">{isCustomClass ? 'ìíë²ì/ì ì' : 'ì ì'}</th>
              <th className="p-3 text-center text-gray-700 font-semibold">{isCustomClass ? 'ê³¼ì /ë©ëª¨' : 'ê³¼ì '}</th>
              {!isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ê³¼ì  ë©ëª¨</th>}
              {isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ìì </th>}
              {isCustomClass && <th className="p-3 text-center text-gray-700 font-semibold">ì§ë</th>}
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
                      <button onClick={() => removeStudentFromClass(s.id, s.name)} className="text-red-400 hover:text-red-600 text-xs ml-1" title="ë°ìì ì ê±°">{'\u2716'}</button>
                    </div>
                    <div className="text-xs text-gray-400">{s.phone ? 'íì ' + s.phone : 'íì -'}</div>
                    {classroom.enrollments.find((e: any) => e.student.id === s.id)?.student?.parentPhone && (
                      <div className="text-xs text-gray-400">íë¶ëª¨ {classroom.enrollments.find((e: any) => e.student.id === s.id)?.student?.parentPhone}</div>
                    )}
                  </td>
                  {isCustomClass ? (
                    <td className="p-3">
                      <div className="flex gap-1 justify-center mb-1">
                        {[
                          { value: 'PRESENT', label: 'ì¶ì', color: 'bg-green-500 text-white' },
                          { value: 'LATE', label: 'ì§ê°', color: 'bg-yellow-500 text-white' },
                          { value: 'ABSENT', label: 'ê²°ì', color: 'bg-red-500 text-white' },
                        ].map(opt => (
                          <button key={opt.value} onClick={() => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: prev[s.id]?.status === opt.value ? '' : opt.value } }))} className={'px-2 py-1 rounded text-xs font-medium ' + (attendance[s.id]?.status === opt.value ? opt.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200')}>{opt.label}</button>
                        ))}
                      </div>
                      <input type="text" placeholder="ë©ëª¨" value={attendance[s.id]?.remarks || ''} onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], remarks: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-full text-gray-800" />
                    </td>
                  ) : (
                    <>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {[
                            { value: 'PRESENT', label: 'ì¶ì', color: 'bg-green-500 text-white' },
                            { value: 'LATE', label: 'ì§ê°', color: 'bg-yellow-500 text-white' },
                            { value: 'ABSENT', label: 'ê²°ì', color: 'bg-red-500 text-white' },
                          ].map(opt => (
                            <button key={opt.value} onClick={() => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: prev[s.id]?.status === opt.value ? '' : opt.value } }))} className={'px-2 py-1 rounded text-xs font-medium ' + (attendance[s.id]?.status === opt.value ? opt.color : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200')}>{opt.label}</button>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <input type="text" placeholder="ë©ëª¨" value={attendance[s.id]?.remarks || ''} onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], remarks: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-32 text-gray-800" />
                      </td>
                    </>
                  )}
                  {isCustomClass ? (
                    <td className="p-3">
                      <input type="text" placeholder="ìíë²ì" value={grades[s.id]?.testName || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], testName: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-full mb-1 text-gray-800" />
                      <div className="flex gap-1 items-center">
                        <input type="number" placeholder="ì ì" value={grades[s.id]?.score || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-14 text-gray-800" />
                        <span className="text-gray-400 text-xs">/</span>
                        <input type="number" placeholder="100" value={grades[s.id]?.maxScore || '100'} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], maxScore: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-14 text-gray-800" />
                      </div>
                    </td>
                  ) : (
                    <td className="p-3">
                      <input type="number" placeholder="ì ì" value={grades[s.id]?.score || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-16 text-gray-800" />
                    </td>
                  )}
                  {isCustomClass ? (
                    <td className="p-3">
                      <div className="flex gap-1 justify-center mb-1">
                        {['A','B','C','D','X'].map(g => (
                          <button key={g} onClick={() => setAssignmentGrades(prev => ({ ...prev, [s.id]: g }))} className={'px-2 py-1 rounded text-xs ' + (assignmentGrades[s.id] === g ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200')}>{g}</button>
                        ))}
                      </div>
                      <input type="text" placeholder="ê³¼ì  ë©ëª¨" value={assignmentMemos[s.id] || ''} onChange={(e) => setAssignmentMemos(prev => ({ ...prev, [s.id]: e.target.value }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-full text-gray-800" />
                    </td>
                  ) : (
                    <>
                      <td className="p-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {['A','B','C','D','X'].map(g => (
                            <button key={g} onClick={() => setAssignmentGrades(prev => ({ ...prev, [s.id]: g }))} className={'px-2 py-1 rounded text-xs ' + (assignmentGrades[s.id] === g ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200')}>{g}</button>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <input type="text" placeholder="ê³¼ì  ë©ëª¨" value={assignmentMemos[s.id] || ''} onChange={(e) => setAssignmentMemos(prev => ({ ...prev, [s.id]: e.target.value }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-28 text-gray-800" />
                      </td>
                    </>
                  )}
                  {isCustomClass && (
                    <td className="p-3">
                      <input type="text" placeholder="ìì  ìë ¥" value={perStudentHomeworkMap[s.id] || ''} onChange={(e) => setPerStudentHomeworkMap(prev => ({ ...prev, [s.id]: e.target.value }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-full text-gray-800" />
                    </td>
                  )}
                  {isCustomClass && (
                    <td className="p-3">
                      <input type="text" placeholder="ì§ë ìë ¥" value={perStudentProgressMap[s.id] || ''} onChange={(e) => setPerStudentProgressMap(prev => ({ ...prev, [s.id]: e.target.value }))} className="bg-white border border-gray-300 rounded px-2 py-1 text-xs w-full text-gray-800" />
                    </td>
                  )}
                  <td className="p-3 text-center">
                    <button onClick={() => copyReport(s)} className={'px-3 py-1 rounded text-xs font-medium ' + (reportCopied === s.id ? 'bg-green-500 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white')}>{reportCopied === s.id ? 'ë³µì¬ë¨!' : 'ë³µì¬'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ìì/ìì  (ë§ì¶¤ë°ììë ì¨ê¹) */}
      {!isCustomClass && <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-3 text-gray-800">{'\uD83C\uDFA5'} ìì ìì</h3>
          <input type="text" placeholder="ìì ì ëª©" value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 mb-2 text-gray-800" />
          <input type="text" placeholder="YouTube ë§í¬" value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">{'\uD83D\uDCDD'} ìì </h3>
          <textarea value={homework} onChange={(e) => setHomework(e.target.value)}
            placeholder="ì¤ëì ìì " rows={3}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
      </div>}

      {/* ì§ë, ê³µì§ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {!isCustomClass && <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">{'\u25FC'} ìì ì§ë</h3>
          <textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)}
            placeholder="ì¤ë ìì ì§ë ë´ì©" rows={3}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <h3 className="font-semibold mb-2 text-gray-800">{'\uD83D\uDCE2'} ê³µì§ì¬í­</h3>
          <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="ê³µì§ì¬í­" rows={3}
            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-gray-800" />
        </div>
      </div>

      {/* ìë´ ëª¨ë¬ */}
      {counselingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-semibold mb-4 text-gray-900">{counselingStudent.name} - ìë´ ë©ëª¨</h3>
            <div className="text-sm text-gray-500 mb-2">íì ì í: {counselingStudent.phone || '-'} | íë²: {counselingStudent.studentNumber || '-'}</div>
            <textarea value={counselingNote} onChange={(e) => setCounselingNote(e.target.value)}
              placeholder="ìë´ ë´ì©ì ìë ¥íì¸ì..." rows={5}
              className="w-full bg-white border border-gray-300 rounded px-3 py-2 mb-4 text-gray-800" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCounselingStudent(null)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">ì·¨ì</button>
              <button onClick={handleSaveCounseling} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">ì ì¥</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
