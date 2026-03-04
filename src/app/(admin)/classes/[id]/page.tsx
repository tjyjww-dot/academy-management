'use client';

import { useEffect, useState, useCallback } from 'react';
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

  // Attendance: { [studentId]: { status, remarks } }
  const [attendance, setAttendance] = useState<Record<string, { status: string; remarks: string }>>({});
  // Grades: { [studentId]: { score, maxScore, testName } }
  const [grades, setGrades] = useState<Record<string, { score: string; maxScore: string; testName: string }>>({});
  // Grade history for stats
  const [gradeHistory, setGradeHistory] = useState<Record<string, any[]>>({});
  // Assignment grades: { [studentId]: grade }
  const [assignmentGrades, setAssignmentGrades] = useState<Record<string, string>>({});
  // Previous assignments
  const [prevAssignments, setPrevAssignments] = useState<any[]>([]);
  // New assignment
  const [newAssignmentTitle, setNewAssignmentTitle] = useState('');
  const [newAssignmentDesc, setNewAssignmentDesc] = useState('');
  // Video
  const [videoTitle, setVideoTitle] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  // Daily report fields
  const [progressNote, setProgressNote] = useState('');
  const [homework, setHomework] = useState('');
  const [announcement, setAnnouncement] = useState('');
  // Counseling
  const [counselingStudent, setCounselingStudent] = useState<any>(null);
  const [counselingNote, setCounselingNote] = useState('');
  // Report
  const [reportCopied, setReportCopied] = useState<string | null>(null);
  const fetchDaily = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/classes/' + classId + '/daily?date=' + selectedDate);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      setClassroom(data.classroom);

      // Map attendance
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

      setAttendance(attMap);
      setGrades(grMap);
      setAssignmentGrades(agMap);

      // Grade history
      const histMap: Record<string, any[]> = {};
      data.allGrades.forEach((g: any) => {
        if (!histMap[g.studentId]) histMap[g.studentId] = [];
        histMap[g.studentId].push(g);
      });
      setGradeHistory(histMap);

      setPrevAssignments(data.prevAssignments || []);

      // Load daily report common fields from first report
      if (data.dailyReports.length > 0) {
        setProgressNote(data.dailyReports[0].content || '');
        setHomework(data.dailyReports[0].homework || '');
        setAnnouncement(data.dailyReports[0].specialNote || '');
      } else {
        setProgressNote(''); setHomework(''); setAnnouncement('');
      }

      // Load video
      if (data.videos && data.videos.length > 0) {
        setVideoTitle(data.videos[0].title || '');
        setVideoUrl(data.videos[0].videoUrl || '');
      } else {
        setVideoTitle(''); setVideoUrl('');
      }

      // Load today assignment
      if (data.todayAssignments && data.todayAssignments.length > 0) {
        setNewAssignmentTitle(data.todayAssignments[0].title || '');
        setNewAssignmentDesc(data.todayAssignments[0].description || '');
      } else {
        setNewAssignmentTitle(''); setNewAssignmentDesc('');
      }

    } catch (err) {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [classId, selectedDate]);

  useEffect(() => { fetchDaily(); }, [fetchDaily]);
  const handleSave = async () => {
    try {
      setSaving(true);
      const attendanceData = Object.entries(attendance).map(([studentId, val]) => ({
        studentId, status: val.status, remarks: val.remarks,
      }));
      const gradesData = Object.entries(grades).map(([studentId, val]) => ({
        studentId, score: val.score, maxScore: val.maxScore, testName: val.testName || '',
      }));
      const assignmentGradesArr = Object.entries(assignmentGrades).map(([studentId, grade]) => ({
        studentId, grade,
      }));
      const res = await fetch('/api/classes/' + classId + '/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate, attendanceData, gradesData,
          assignmentGrades: assignmentGradesArr,
          newAssignment: newAssignmentTitle ? { title: newAssignmentTitle, description: newAssignmentDesc } : null,
          videoData: videoUrl ? { title: videoTitle, videoUrl } : null,
          progressNote, homework, announcement,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      alert('\uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4!');
      fetchDaily();
    } catch { alert('\uc800\uc7a5\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4.'); }
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
    return '[\uc218\ud559\ud0d0\uad6c] ' + student.name + ' \ud559\uc0dd \uc218\uc5c5 \ub9ac\ud3ec\ud2b8\n\n' +
      '\u2b50 \uc624\ub298\uc758 \ud14c\uc2a4\ud2b8\n' +
      '- \uc2dc\ud5d8 \ubc94\uc704 : ' + (g?.testName || '-') + '\n' +
      '- \uc810\uc218 : ' + (g?.score || '-') + ' / ' + (g?.maxScore || '-') + '\n' +
      '- \ucd5c\uace0\uc810 : ' + stats.max + ' / \ucd5c\uc800\uc810 : ' + stats.min + '\n\n' +
      '\ud83d\udcda \uacfc\uc81c \uc644\uc131\ub3c4\n' +
      '- \ub4f1\uae09 : ' + ag + '\n' +
      '  (A: \uc644\ubcbd / B: \uc591\ud638 / C: \ubcf4\ud1b5 / D: \ubbf8\ud761 / X: \ubbf8\uc81c\ucd9c)\n\n' +
      '\u25fc \uc624\ub298 \uc218\uc5c5 \uc9c4\ub3c4\n' +
      '- ' + (progressNote || '-') + '\n\n' +
      '\ud83c\udfa5 \uc624\ub298 \uc218\uc5c5 \uc601\uc0c1\n' +
      '- \uc81c\ubaa9 : ' + (videoTitle || '-') + '\n' +
      '- \ub9c1\ud06c : ' + (videoUrl || '-') + '\n\n' +
      '\ud83d\udcdd \uc624\ub298\uc758 \uc219\uc81c\n' +
      '- ' + (homework || '-') + '\n\n' +
      '\ud83d\udce2 \uacf5\uc9c0\uc0ac\ud56d\n' +
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
      await fetch('/api/counseling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: counselingStudent.id,
          title: selectedDate + ' \uc0c1\ub2f4 \uba54\ubaa8',
          description: counselingNote,
          counselingType: 'TEACHER_INITIATED',
        }),
      });
      alert('\uc0c1\ub2f4 \uba54\ubaa8\uac00 \uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4.');
      setCounselingStudent(null);
      setCounselingNote('');
    } catch { alert('\uc0c1\ub2f4 \uc800\uc7a5 \uc2e4\ud328'); }
  };
  if (loading) return <div className="p-8 text-center">\ub85c\ub529 \uc911...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!classroom) return <div className="p-8 text-center">\ub370\uc774\ud130\uac00 \uc5c6\uc2b5\ub2c8\ub2e4</div>;

  const students = classroom.enrollments.map((e: any) => e.student);

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/classes')} className="text-gray-400 hover:text-white">
            \u2190 \ubaa9\ub85d
          </button>
          <h1 className="text-2xl font-bold">{classroom.name}</h1>
          <span className="text-gray-400">{classroom.subject?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() - 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }} className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600">\u25c0</button>
          <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white" />
          <button onClick={() => {
            const d = new Date(selectedDate);
            d.setDate(d.getDate() + 1);
            setSelectedDate(d.toISOString().split('T')[0]);
          }} className="px-2 py-1 bg-gray-700 rounded hover:bg-gray-600">\u25b6</button>
          <button onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-500 text-sm">\uc624\ub298</button>
        </div>
      </div>

      {/* Previous Assignments */}
      {prevAssignments.length > 0 && (
        <div className="mb-6 bg-gray-800 rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-3">\ud83d\udcda \uc774\uc804 \uacfc\uc81c</h2>
          <div className="space-y-2">
            {prevAssignments.map((a: any) => (
              <div key={a.id} className="flex justify-between items-center bg-gray-700 rounded p-2 text-sm">
                <span>{a.assignmentDate} - {a.title}</span>
                <span className="text-gray-400">{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Student Table */}
      <div className="mb-6 bg-gray-800 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-700">
            <tr>
              <th className="p-3 text-left">\ud559\uc0dd</th>
              <th className="p-3 text-center">\ucd9c\uacb0</th>
              <th className="p-3 text-center">\ucd9c\uacb0\uba54\ubaa8</th>
              <th className="p-3 text-center">\uc2dc\ud5d8\ubc94\uc704</th>
              <th className="p-3 text-center">\uc810\uc218</th>
              <th className="p-3 text-center">\ub9cc\uc810</th>
              <th className="p-3 text-center">\ud3c9\uade0/\ucd5c\uace0/\ucd5c\uc800</th>
              <th className="p-3 text-center">\uacfc\uc81c</th>
              <th className="p-3 text-center">\ub9ac\ud3ec\ud2b8</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s: any) => {
              const stats = getStats(s.id);
              return (
                <tr key={s.id} className="border-t border-gray-700 hover:bg-gray-750">
                  <td className="p-3">
                    <button onClick={() => { setCounselingStudent(s); setCounselingNote(''); }}
                      className="text-blue-400 hover:text-blue-300 font-medium">{s.name}</button>
                    <div className="text-xs text-gray-400">{s.phone || '-'}</div>
                  </td>
                  <td className="p-3 text-center">
                    <select value={attendance[s.id]?.status || 'PRESENT'}
                      onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: e.target.value } }))}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">
                      <option value="PRESENT">\ucd9c\uc11d</option>
                      <option value="LATE">\uc9c0\uac01</option>
                      <option value="ABSENT">\uacb0\uc11d</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <input type="text" placeholder="\uba54\ubaa8"
                      value={attendance[s.id]?.remarks || ''}
                      onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], remarks: e.target.value } }))}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-20" />
                  </td>
                  <td className="p-3">
                    <input type="text" placeholder="\ubc94\uc704"
                      value={grades[s.id]?.testName || ''}
                      onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], testName: e.target.value } }))}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-20" />
                  </td>
                  <td className="p-3">
                    <input type="number" placeholder="\uc810\uc218"
                      value={grades[s.id]?.score || ''}
                      onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-16" />
                  </td>
                  <td className="p-3">
                    <input type="number" placeholder="100"
                      value={grades[s.id]?.maxScore || '100'}
                      onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], maxScore: e.target.value } }))}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs w-16" />
                  </td>
                  <td className="p-3 text-center text-xs text-gray-300">
                    {stats.avg} / {stats.max} / {stats.min}
                  </td>
                  <td className="p-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {['A','B','C','D','X'].map(g => (
                        <button key={g} onClick={() => setAssignmentGrades(prev => ({ ...prev, [s.id]: g }))}
                          className={'px-2 py-1 rounded text-xs ' + (assignmentGrades[s.id] === g ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600')}>
                          {g}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-center">
                    <button onClick={() => copyReport(s)}
                      className={'px-3 py-1 rounded text-xs ' + (reportCopied === s.id ? 'bg-green-600' : 'bg-purple-600 hover:bg-purple-500')}>
                      {reportCopied === s.id ? '\ubcf5\uc0ac\ub428!' : '\ubcf5\uc0ac'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Assignment & Video Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3">\ud83d\udcdd \uc624\ub298\uc758 \uacfc\uc81c</h3>
          <input type="text" placeholder="\uacfc\uc81c \uc81c\ubaa9" value={newAssignmentTitle}
            onChange={(e) => setNewAssignmentTitle(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-2" />
          <input type="text" placeholder="\uacfc\uc81c \uc124\uba85" value={newAssignmentDesc}
            onChange={(e) => setNewAssignmentDesc(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3">\ud83c\udfa5 \uc218\uc5c5 \uc601\uc0c1</h3>
          <input type="text" placeholder="\uc601\uc0c1 \uc81c\ubaa9" value={videoTitle}
            onChange={(e) => setVideoTitle(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-2" />
          <input type="text" placeholder="YouTube \ub9c1\ud06c" value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
        </div>
      </div>

      {/* Progress / Homework / Announcement */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">\u25fc \uc218\uc5c5 \uc9c4\ub3c4</h3>
          <textarea value={progressNote} onChange={(e) => setProgressNote(e.target.value)}
            placeholder="\uc624\ub298 \uc218\uc5c5 \uc9c4\ub3c4 \ub0b4\uc6a9" rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">\ud83d\udcdd \uc219\uc81c</h3>
          <textarea value={homework} onChange={(e) => setHomework(e.target.value)}
            placeholder="\uc624\ub298\uc758 \uc219\uc81c" rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-2">\ud83d\udce2 \uacf5\uc9c0\uc0ac\ud56d</h3>
          <textarea value={announcement} onChange={(e) => setAnnouncement(e.target.value)}
            placeholder="\uacf5\uc9c0\uc0ac\ud56d" rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end mb-6">
        <button onClick={handleSave} disabled={saving}
          className="px-8 py-3 bg-green-600 hover:bg-green-500 disabled:bg-gray-600 rounded-lg font-semibold text-lg">
          {saving ? '\uc800\uc7a5 \uc911...' : '\ud83d\udcbe \uc804\uccb4 \uc800\uc7a5'}
        </button>
      </div>
      {/* Counseling Modal */}
      {counselingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">
              {counselingStudent.name} - \uc0c1\ub2f4 \uba54\ubaa8
            </h3>
            <div className="text-sm text-gray-400 mb-2">
              \ud559\uc0dd \uc804\ud654: {counselingStudent.phone || '-'} | \ud559\ubc88: {counselingStudent.studentNumber || '-'}
            </div>
            <textarea value={counselingNote} onChange={(e) => setCounselingNote(e.target.value)}
              placeholder="\uc0c1\ub2f4 \ub0b4\uc6a9\uc744 \uc785\ub825\ud558\uc138\uc694..." rows={5}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4" />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCounselingStudent(null)}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-500">\ucde8\uc18c</button>
              <button onClick={handleSaveCounseling}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500">\uc800\uc7a5</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
