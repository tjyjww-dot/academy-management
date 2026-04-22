'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button, Card, Badge, Pill, Stat, SectionHeader, Divider } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { hapticLight, hapticSelection, hapticMedium, hapticHeavy, hapticSuccess } from '@/lib/haptics';

type TabKey = 'lesson' | 'students';

export default function ClassDetailPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.id as string;

  const [classroom, setClassroom] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [activeTab, setActiveTab] = useState<TabKey>('students');
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
  const [personalNotes, setPersonalNotes] = useState<Record<string, string>>({});
  const [reportSent, setReportSent] = useState<Set<string>>(new Set());

  // 시험 관련 state
  const [testName, setTestName] = useState('');
  const [maxScore, setMaxScore] = useState('100');

  // 원생 검색 관련 state
  const [studentSearch, setStudentSearch] = useState('');
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [allClassrooms, setAllClassrooms] = useState<any[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // attitude 필드에서 등급과 메모를 분리하는 헬퍼 함수
  const parseAttitude = (attitude: string | null | undefined): { grade: string; memo: string } => {
    if (!attitude) return { grade: '', memo: '' };
    const idx = attitude.indexOf('::');
    if (idx === -1) return { grade: attitude, memo: '' };
    return { grade: attitude.substring(0, idx), memo: attitude.substring(idx + 2) };
  };

  // 등급과 메모를 합치는 헬퍼 함수
  const combineAttitude = (grade: string, memo: string): string => {
    if (!memo) return grade;
    return grade + '::' + memo;
  };

  const fetchDaily = useCallback(async () => {
    try {
      setLoading(true);
      // 날짜별 전송 상태를 localStorage에서 복원 (저장 후에도 유지)
      try {
        const key = 'reportSent::' + classId + '::' + selectedDate;
        const raw = localStorage.getItem(key);
        if (raw) {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) setReportSent(new Set(arr));
          else setReportSent(new Set());
        } else {
          setReportSent(new Set());
        }
      } catch { setReportSent(new Set()); }
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
        // 출결 데이터가 있으면 그 값을 사용, 없으면 빈 상태로 (기본 출석 체크 안 함)
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

      // 이전 과제 중복 제거 (제목+날짜 기준)
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
        // content가 JSON 형식이면 progressNote 추출, 아니면 그대로 사용 (레거시 호환)
        let loadedProgressNote = '';
        if (data.dailyReports[0]?.content) {
          try {
            const parsed = JSON.parse(data.dailyReports[0].content);
            if (parsed && typeof parsed === 'object' && parsed.progressNote !== undefined) {
              let _note = parsed.progressNote || '';
              if (typeof _note === 'string' && _note.startsWith('{')) {
                try { const inner = JSON.parse(_note); if (inner && inner.progressNote !== undefined) { _note = inner.progressNote || ''; } } catch {}
              }
              loadedProgressNote = _note;
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
        setAnnouncement(data.dailyReports[0].specialNote || data.prevAnnouncement || '');
        const pshMap: Record<string, string> = {};
        const pspMap: Record<string, string> = {};
        const pnMap: Record<string, string> = {};
        data.dailyReports.forEach((dr: any) => {
          if (dr.homework) pshMap[dr.studentId] = dr.homework;
           if (dr.content) { try { const _p = JSON.parse(dr.content); let _n = (_p && typeof _p === 'object') ? (_p.progressNote || '') : dr.content; if (typeof _n === 'string' && _n.startsWith('{')) { try { const _i = JSON.parse(_n); if (_i && _i.progressNote !== undefined) _n = _i.progressNote || ''; } catch {} } pspMap[dr.studentId] = _n; if (_p && typeof _p === 'object' && _p.personalNote) pnMap[dr.studentId] = _p.personalNote; } catch { pspMap[dr.studentId] = dr.content; } }
        });
        setPerStudentHomeworkMap(pshMap);
        setPerStudentProgressMap(pspMap);
        setPersonalNotes(pnMap);
      } else {
        setProgressNote('');
        setHomework('');
        setAnnouncement(data.prevAnnouncement || '');
        // 날짜 이동 시 학생별 숙제/진도/전달사항이 이전 날짜 값으로 잔존하지 않도록 초기화
        setPerStudentHomeworkMap({});
        setPerStudentProgressMap({});
        setPersonalNotes({});
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

      // 시험 범위와 만점을 공통으로 설정
      // 1순위: API에서 반환한 savedTestName/savedMaxScore (DailyReport에 저장된 값)
      // 2순위: 기존 Grade 레코드에서 가져온 값
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

  // 전체 학생 목록 가져오기 (원생 검색용)
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
    (async () => {
      try {
        const r = await fetch('/api/classes');
        if (r.ok) {
          const d = await r.json();
          setAllClassrooms(d.classrooms || d || []);
        }
      } catch {}
    })();
  }, []);

  // 검색 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 원생 추가 함수
  const addStudentToClass = async (studentId: string) => {
    try {
      const res = await fetch('/api/classes/' + classId + '/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        hapticSuccess();
        alert('원생이 추가되었습니다!');
        setStudentSearch('');
        setShowSearchDropdown(false);
        fetchDaily();
      } else {
        const errData = await res.json();
        alert(errData.error || '추가 실패');
      }
    } catch {
      alert('원생 추가에 실패했습니다.');
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const attendanceData = Object.entries(attendance).map(([studentId, val]) => ({
        studentId, status: val.status, remarks: val.remarks
      }));
      const isCustomClass = classroom.name?.includes('맞춤') || classroom.subject?.name?.includes('맞춤');
      const gradesData = Object.entries(grades).map(([studentId, val]) => ({
        studentId,
        score: val.score,
        maxScore: isCustomClass ? (val.maxScore || '100') : maxScore,
        testName: isCustomClass ? (val.testName || '') : testName
      }));
      // 과제 등급과 메모를 합쳐서 전송
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
          perStudentNote: Object.entries(personalNotes).map(([studentId, note]) => ({ studentId, note })),
          testName,
          maxScore,
        }),
      });
      if (!res.ok) throw new Error('Failed');
      hapticSuccess();
      alert('저장되었습니다!');
      fetchDaily();
    } catch {
      alert('저장에 실패했습니다.');
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
    const pn = personalNotes[student.id] || '';

    if (isCustomClass) {
      // 맞춤반 리포트 - 개별 숙제/진도
      const studentHomework = perStudentHomeworkMap[student.id] || '-';
      const studentProgress = perStudentProgressMap[student.id] || '-';
      return '[수학탐구] ' + student.name + ' 학생 수업 리포트\n\n' +
        '\u2B50 오늘의 테스트\n' +
        '- 시험 범위 : ' + (g?.testName || '-') + '\n' +
        '- 점수 : ' + (g?.score || '-') + ' / ' + (g?.maxScore || '-') + '\n\n' +
        '\uD83D\uDCDA 과제 완성도\n' +
        '- 등급 : ' + ag + '\n' +
        ' (A: 완벽 / B: 양호 / C: 보통 / D: 미흡 / X: 미제출)\n' +
        (am ? '- 메모 : ' + am + '\n' : '') +
        '\n' +
        '\u25FC 오늘 수업 진도\n' +
        '- ' + studentProgress + '\n\n' +
        '\uD83D\uDCDD 오늘의 숙제\n' +
        '- ' + studentHomework + '\n\n' +
        (pn ? '\u2709\uFE0F 전달사항\n- ' + pn + '\n\n' : '') +
        '\uD83D\uDCE2 공지사항\n' +
        '- ' + (announcement || '-');
    }

    // 정규반 리포트
    return '[수학탐구] ' + student.name + ' 학생 수업 리포트\n\n' +
      '\u2B50 오늘의 테스트\n' +
      '- 시험 범위 : ' + (g?.testName || '-') + '\n' +
      '- 점수 : ' + (g?.score || '-') + ' / ' + (g?.maxScore || '-') + '\n' +
      '- 평균 : ' + avgScore + ' / 최고점 : ' + highScore + ' / 최저점 : ' + lowScore + '\n\n' +
      '\uD83D\uDCDA 과제 완성도\n' +
      '- 등급 : ' + ag + '\n' +
      ' (A: 완벽 / B: 양호 / C: 보통 / D: 미흡 / X: 미제출)\n' +
      (am ? '- 메모 : ' + am + '\n' : '') +
      '\n' +
      '\u25FC 오늘 수업 진도\n' +
      '- ' + (progressNote || '-') + '\n\n' +
      '\uD83C\uDFA5 오늘 수업 영상\n' +
      '- 제목 : ' + (videoTitle || '-') + '\n' +
      '- 링크 : ' + (videoUrl || '-') + '\n\n' +
      '\uD83D\uDCDD 오늘의 숙제\n' +
      '- ' + (homework || prevAssignmentForHomework || '-') + '\n\n' +
      (pn ? '\u2709\uFE0F 전달사항\n- ' + pn + '\n\n' : '') +
      '\uD83D\uDCE2 공지사항\n' +
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
    setReportSent(prev => {
      const next = new Set(prev).add(student.id);
      try {
        const key = 'reportSent::' + classId + '::' + selectedDate;
        localStorage.setItem(key, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    // Send push notification to parents & student
    try {
      const res = await fetch('/api/classes/' + classId + '/daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          sendPushNotification: { studentId: student.id, studentName: student.name },
        }),
      });
      if (!res.ok) {
        console.error('Push API returned non-OK', res.status);
      }
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
          title: selectedDate + ' 상담 메모',
          description: counselingNote,
          counselingType: 'TEACHER_INITIATED'
        })
      });
      hapticSuccess();
      alert('상담 메모가 저장되었습니다.');
      setCounselingStudent(null);
      setCounselingNote('');
    } catch {
      alert('상담 저장 실패');
    }
  };

  // 원생 반에서 제거
  const removeStudentFromClass = async (studentId: string, studentName: string) => {
    if (!confirm(studentName + ' 학생을 이 반에서 제거하시겠습니까?')) return;
    try {
      const res = await fetch('/api/classes/' + classId + '/enroll', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      if (res.ok) {
        alert('제거되었습니다.');
        fetchDaily();
      } else {
        alert('제거 실패');
      }
    } catch {
      alert('제거에 실패했습니다.');
    }
  };

  if (loading) return (
    <div className="p-8 text-center text-mute">로딩 중...</div>
  );
  if (error) return (
    <div className="p-8 text-center" style={{ color: 'var(--color-danger)' }}>{error}</div>
  );
  if (!classroom) return (
    <div className="p-6">
      <EmptyState
        size="md"
        icon="📭"
        title="반 정보를 찾을 수 없습니다"
        description="이미 삭제되었거나 접근 권한이 없는 반입니다. 반 목록에서 다시 선택해 주세요."
        asCard
      />
    </div>
  );

  const students = classroom.enrollments.map((e: any) => e.student).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || '', 'ko'));
  const isCustomClass = classroom.name?.includes('맞춤') || classroom.subject?.name?.includes('맞춤');

  // 검색 필터링 (이미 등록된 학생 제외)
  const enrolledIds = new Set(students.map((s: any) => s.id));
  const filteredSearchStudents = allStudents.filter((s: any) =>
    !enrolledIds.has(s.id) &&
    (s.name?.includes(studentSearch) || s.phone?.includes(studentSearch))
  );

  // 시험 통계 계산
  const todayScores = students
    .map((s: any) => parseFloat(grades[s.id]?.score || ''))
    .filter((v: number) => !isNaN(v));
  const avgScore = todayScores.length > 0
    ? (todayScores.reduce((a: number, b: number) => a + b, 0) / todayScores.length).toFixed(1)
    : '-';
  const highScore = todayScores.length > 0 ? Math.max(...todayScores) : '-';
  const lowScore = todayScores.length > 0 ? Math.min(...todayScores) : '-';

  const allReportsSent = students.length > 0 && students.every((s: any) => reportSent.has(s.id));
  const presentCount = students.filter((s: any) => attendance[s.id]?.status === 'PRESENT').length;
  const lateCount = students.filter((s: any) => attendance[s.id]?.status === 'LATE').length;
  const absentCount = students.filter((s: any) => attendance[s.id]?.status === 'ABSENT').length;

  const shiftDate = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      {/* 상단 헤더 카드 */}
      <Card padding="md" className="mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* 좌측: 반 정보 */}
          <div className="flex items-center gap-3 flex-wrap min-w-0">
            <button
              onClick={() => { hapticLight(); router.push('/classes'); }}
              onPointerDown={() => hapticLight()}
              className="press inline-flex items-center justify-center w-9 h-9 text-mute hover:text-ink"
              style={{ borderRadius: 'var(--radius-btn)' }}
              aria-label="목록으로"
            >
              {'\u2190'}
            </button>
            <div className="min-w-0">
              <div className="text-eyebrow mb-0.5">CLASSROOM</div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-[22px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>
                  {classroom.name}
                </h1>
                {classroom.subject?.name && (
                  <Badge tone={isCustomClass ? 'gold' : 'accent'} size="md">
                    {classroom.subject.name}
                  </Badge>
                )}
              </div>
            </div>
            <div className="relative">
              <select
                value={classroom.id}
                onChange={(e) => {
                  const newId = e.target.value;
                  if (newId && newId !== classroom.id) router.push(`/classes/${newId}`);
                }}
                className="appearance-none bg-surface-2 text-[13px] text-ink-2 font-medium pl-3 pr-8 h-9 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                style={{ borderRadius: 'var(--radius-btn)', border: '1px solid var(--color-border)' }}
              >
                {allClassrooms.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.subject?.name ? ` (${c.subject.name})` : ''}
                  </option>
                ))}
                {!allClassrooms.find((c: any) => c.id === classroom.id) && (
                  <option value={classroom.id}>{classroom.name}</option>
                )}
              </select>
              <span aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-mute text-[10px]">▾</span>
            </div>
          </div>

          {/* 우측: 날짜 네비 + 저장 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => shiftDate(-1)}
              onPointerDown={() => hapticSelection()}
              className="press inline-flex items-center justify-center w-9 h-9 bg-surface-2 text-ink-2 hover:bg-border"
              style={{ borderRadius: 'var(--radius-btn)' }}
              aria-label="이전 날짜"
            >
              {'\u25C0'}
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-surface text-ink text-[13px] font-medium px-3 h-9 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent num-tabular"
              style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
            />
            <button
              onClick={() => shiftDate(1)}
              onPointerDown={() => hapticSelection()}
              className="press inline-flex items-center justify-center w-9 h-9 bg-surface-2 text-ink-2 hover:bg-border"
              style={{ borderRadius: 'var(--radius-btn)' }}
              aria-label="다음 날짜"
            >
              {'\u25B6'}
            </button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
            >
              오늘
            </Button>
            <Button
              variant="accent"
              size="md"
              onClick={handleSave}
              loading={saving}
              leftIcon={<span aria-hidden>💾</span>}
            >
              {saving ? '저장 중' : '저장'}
            </Button>
          </div>
        </div>

        {/* 탭 네비 */}
        <div className="mt-4 flex items-center gap-1 overflow-x-auto -mx-1 px-1 pb-1">
          <Pill
            active={activeTab === 'students'}
            onClick={() => setActiveTab('students')}
            count={students.length}
          >
            학생별
          </Pill>
          <Pill
            active={activeTab === 'lesson'}
            onClick={() => setActiveTab('lesson')}
          >
            오늘 수업
          </Pill>
          <div className="ml-auto flex items-center gap-2 pr-1">
            <Badge tone="success" size="sm" dot>출석 {presentCount}</Badge>
            {lateCount > 0 && <Badge tone="warn" size="sm" dot>지각 {lateCount}</Badge>}
            {absentCount > 0 && <Badge tone="danger" size="sm" dot>결석 {absentCount}</Badge>}
          </div>
        </div>
      </Card>

      {/* ============= Tab: 학생별 ============= */}
      {activeTab === 'students' && (
        <div key="tab-students" className="anim-tab-in space-y-4">
          {/* 원생 검색 카드 */}
          <Card padding="sm" className="relative" ref={searchRef}>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[220px] relative">
                <input
                  type="text"
                  placeholder="원생 이름 또는 전화번호로 검색하여 추가"
                  value={studentSearch}
                  onChange={(e) => { setStudentSearch(e.target.value); setShowSearchDropdown(true); }}
                  onFocus={() => setShowSearchDropdown(true)}
                  className="w-full bg-surface text-ink text-[13px] px-3 h-10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                />
                {showSearchDropdown && studentSearch.trim().length > 0 && filteredSearchStudents.length > 0 && (
                  <div
                    className="anim-pop-in absolute left-0 right-0 top-full mt-2 max-h-64 overflow-y-auto bg-surface z-40"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-sh2)' }}
                  >
                    {filteredSearchStudents.slice(0, 8).map((s: any) => (
                      <button
                        key={s.id}
                        onClick={() => addStudentToClass(s.id)}
                        onPointerDown={() => hapticLight()}
                        className="press w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-2"
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-ink truncate">{s.name}</div>
                          <div className="text-[11px] text-mute truncate">{s.phone || '-'}{s.school ? ' · ' + s.school : ''}</div>
                        </div>
                        <span className="text-[11px] text-accent font-semibold shrink-0">+ 추가</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="text-[12px] text-mute">재적 {students.length}명</div>
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  const unsent = students.filter((s: any) => !reportSent.has(s.id));
                  if (unsent.length === 0) return;
                  if (!confirm(unsent.length + '명에게 알림을 전송하시겠습니까?')) return;
                  for (const s of unsent) { await copyReport(s); }
                }}
                disabled={allReportsSent}
                leftIcon={<span aria-hidden>{allReportsSent ? '✓' : '📢'}</span>}
              >
                {allReportsSent ? '전체 전송 완료' : '전체 리포트 전송'}
              </Button>
            </div>
          </Card>

          {/* 학생 테이블 */}
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className={`w-full text-[13px] ${isCustomClass ? 'min-w-[1100px]' : 'min-w-[900px]'}`}>
                <thead
                  className="text-[12px] font-semibold tracking-wide"
                  style={{ background: 'var(--color-surface-2)', color: 'var(--color-ink-2)', borderBottom: '1px solid var(--color-border)' }}
                >
                  <tr>
                    <th className="p-3 text-left">학생</th>
                    <th className="p-3 text-center">출결 · 메모</th>
                    <th className="p-3 text-center">{isCustomClass ? '시험 · 점수' : '점수'}</th>
                    <th className="p-3 text-center">과제 · 메모</th>
                    {isCustomClass && <th className="p-3 text-center">숙제</th>}
                    {isCustomClass && <th className="p-3 text-center">진도</th>}
                    <th className="p-3 text-center">전달사항</th>
                    <th className="p-3 text-center">리포트</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((s: any, rowIdx: number) => (
                    <tr
                      key={s.id}
                      className="hover:bg-surface-2"
                      style={{ borderTop: rowIdx === 0 ? undefined : '1px solid var(--color-border)' }}
                    >
                      {/* 학생 정보 */}
                      <td className="p-3 align-top">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => { hapticLight(); setCounselingStudent(s); setCounselingNote(''); }}
                            className="press text-[13.5px] font-semibold text-accent hover:text-accent-2"
                          >
                            {s.name}
                          </button>
                          {s.school && <span className="text-[11px] text-mute">({s.school})</span>}
                          <button
                            onClick={() => { hapticHeavy(); removeStudentFromClass(s.id, s.name); }}
                            className="press text-[11px] ml-0.5"
                            style={{ color: 'var(--color-danger)' }}
                            title="반에서 제거"
                            aria-label="반에서 제거"
                          >
                            {'\u2716'}
                          </button>
                        </div>
                        <div className="text-[11px] text-mute mt-0.5">{s.phone ? '학생 ' + s.phone : '학생 -'}</div>
                        {classroom.enrollments.find((e: any) => e.student.id === s.id)?.student?.parentPhone && (
                          <div className="text-[11px] text-mute">학부모 {classroom.enrollments.find((e: any) => e.student.id === s.id)?.student?.parentPhone}</div>
                        )}
                      </td>

                      {/* 출결 */}
                      <td className="p-3 align-top">
                        <div className="flex gap-1 justify-center mb-1.5 flex-wrap">
                          {([
                            { value: 'PRESENT', label: '출석', tone: 'success' as const },
                            { value: 'LATE',    label: '지각', tone: 'warn' as const },
                            { value: 'ABSENT',  label: '결석', tone: 'danger' as const },
                          ]).map(opt => {
                            const active = attendance[s.id]?.status === opt.value;
                            return (
                              <button
                                key={opt.value}
                                onPointerDown={() => hapticSelection()}
                                onClick={() => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], status: active ? '' : opt.value } }))}
                                className="press px-2.5 h-7 text-[11.5px] font-semibold"
                                style={{
                                  borderRadius: 'var(--radius-btn)',
                                  border: active
                                    ? `1px solid var(--color-${opt.tone})`
                                    : '1px solid var(--color-border)',
                                  background: active
                                    ? `var(--color-${opt.tone})`
                                    : 'var(--color-surface)',
                                  color: active ? '#fff' : 'var(--color-ink-2)'
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          placeholder="메모"
                          value={attendance[s.id]?.remarks || ''}
                          onChange={(e) => setAttendance(prev => ({ ...prev, [s.id]: { ...prev[s.id], remarks: e.target.value } }))}
                          className="bg-surface text-[12px] text-ink px-2 h-8 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                        />
                      </td>

                      {/* 점수 */}
                      {isCustomClass ? (
                        <td className="p-3 align-top">
                          <input
                            type="text"
                            placeholder="시험범위"
                            value={grades[s.id]?.testName || ''}
                            onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], testName: e.target.value } }))}
                            className="bg-surface text-[12px] text-ink px-2 h-8 w-full mb-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                          />
                          <div className="flex gap-1 items-center">
                            <input type="number" placeholder="점수" value={grades[s.id]?.score || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))}
                              className="bg-surface text-[12px] text-ink px-2 h-8 w-14 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent num-tabular"
                              style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }} />
                            <span className="text-mute text-[12px]">/</span>
                            <input type="number" placeholder="100" value={grades[s.id]?.maxScore || '100'} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], maxScore: e.target.value } }))}
                              className="bg-surface text-[12px] text-ink px-2 h-8 w-14 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent num-tabular"
                              style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }} />
                          </div>
                        </td>
                      ) : (
                        <td className="p-3 align-top text-center">
                          <input type="number" placeholder="점수" value={grades[s.id]?.score || ''} onChange={(e) => setGrades(prev => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value } }))}
                            className="bg-surface text-[13px] text-ink px-2 h-9 w-20 mx-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-accent num-tabular text-center"
                            style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }} />
                        </td>
                      )}

                      {/* 과제 */}
                      <td className="p-3 align-top">
                        <div className="flex gap-1 justify-center mb-1.5 flex-wrap">
                          {['A','B','C','D','X'].map(g => {
                            const active = assignmentGrades[s.id] === g;
                            return (
                              <button
                                key={g}
                                onPointerDown={() => hapticSelection()}
                                onClick={() => setAssignmentGrades(prev => ({ ...prev, [s.id]: active ? '' : g }))}
                                className="press w-7 h-7 text-[12px] font-bold"
                                style={{
                                  borderRadius: 'var(--radius-btn)',
                                  border: active ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                                  background: active ? 'var(--color-accent)' : 'var(--color-surface)',
                                  color: active ? '#fff' : 'var(--color-ink-2)'
                                }}
                              >{g}</button>
                            );
                          })}
                        </div>
                        <input
                          type="text"
                          placeholder="과제 메모"
                          value={assignmentMemos[s.id] || ''}
                          onChange={(e) => setAssignmentMemos(prev => ({ ...prev, [s.id]: e.target.value }))}
                          className="bg-surface text-[12px] text-ink px-2 h-8 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                        />
                      </td>

                      {/* 맞춤반 숙제 · 진도 */}
                      {isCustomClass && (
                        <td className="p-3 align-top">
                          <input type="text" placeholder="숙제 입력" value={perStudentHomeworkMap[s.id] || ''}
                            onChange={(e) => setPerStudentHomeworkMap(prev => ({ ...prev, [s.id]: e.target.value }))}
                            className="bg-surface text-[12px] text-ink px-2 h-8 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }} />
                        </td>
                      )}
                      {isCustomClass && (
                        <td className="p-3 align-top">
                          <input type="text" placeholder="진도 입력" value={perStudentProgressMap[s.id] || ''}
                            onChange={(e) => setPerStudentProgressMap(prev => ({ ...prev, [s.id]: e.target.value }))}
                            className="bg-surface text-[12px] text-ink px-2 h-8 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                            style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }} />
                        </td>
                      )}

                      {/* 전달사항 */}
                      <td className="p-3 align-top">
                        <input type="text" placeholder="전달사항"
                          value={personalNotes[s.id] || ''}
                          onChange={(e) => setPersonalNotes(prev => ({ ...prev, [s.id]: e.target.value }))}
                          className="bg-surface text-[12px] text-ink px-2 h-8 w-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }} />
                      </td>

                      {/* 리포트 버튼 */}
                      <td className="p-3 align-middle text-center">
                        {reportSent.has(s.id) ? (
                          <Badge tone="success" size="md" dot>전송됨</Badge>
                        ) : (
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => copyReport(s)}
                            leftIcon={<span aria-hidden>🔔</span>}
                          >
                            알림
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={isCustomClass ? 8 : 6} className="p-4">
                        <EmptyState
                          size="sm"
                          icon="👥"
                          title="아직 등록된 원생이 없습니다"
                          description="위 검색창에서 원생을 찾아 반에 추가해 주세요."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* ============= Tab: 오늘 수업 ============= */}
      {activeTab === 'lesson' && (
        <div key="tab-lesson" className="anim-tab-in space-y-4">
          {/* 시험 정보 + 통계 */}
          {!isCustomClass && (
            <Card padding="md">
              <SectionHeader
                eyebrow="TODAY TEST"
                title="시험 정보"
                description="입력한 시험 범위와 총점은 이 반 모든 학생에게 동일하게 적용됩니다."
              />
              <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-3 items-stretch">
                <div>
                  <div className="text-[11.5px] font-medium text-mute mb-1.5 tracking-wide">시험 범위</div>
                  <input
                    type="text"
                    placeholder="예: 수학 상 · 도형의 이동"
                    value={testName}
                    onChange={(e) => {
                      setTestName(e.target.value);
                      const newGrades = { ...grades };
                      students.forEach((s: any) => {
                        if (newGrades[s.id]) {
                          newGrades[s.id] = { ...newGrades[s.id], testName: e.target.value };
                        }
                      });
                      setGrades(newGrades);
                    }}
                    className="bg-surface text-ink text-[13px] px-3 h-10 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                  />
                </div>
                <div>
                  <div className="text-[11.5px] font-medium text-mute mb-1.5 tracking-wide">총점</div>
                  <input
                    type="number"
                    placeholder="100"
                    value={maxScore}
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
                    className="bg-surface text-ink text-[13px] px-3 h-10 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent num-tabular"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                  />
                </div>
                <Stat label="평균" value={avgScore} unit={avgScore !== '-' ? '점' : undefined} />
                <Stat label="최고" value={highScore} unit={highScore !== '-' ? '점' : undefined} />
                <Stat label="최저" value={lowScore} unit={lowScore !== '-' ? '점' : undefined} />
              </div>
            </Card>
          )}

          {/* 영상 · 숙제 · 진도 (정규반만) */}
          {!isCustomClass && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card padding="md">
                <SectionHeader eyebrow="VIDEO" title="수업 영상" />
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="영상 제목"
                    value={videoTitle}
                    onChange={(e) => setVideoTitle(e.target.value)}
                    className="bg-surface text-ink text-[13px] px-3 h-10 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                  />
                  <input
                    type="text"
                    placeholder="YouTube 링크"
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    className="bg-surface text-ink text-[13px] px-3 h-10 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                  />
                </div>
              </Card>
              <Card padding="md">
                <SectionHeader eyebrow="HOMEWORK" title="오늘의 숙제" />
                <textarea
                  value={homework}
                  onChange={(e) => setHomework(e.target.value)}
                  placeholder="오늘의 숙제 내용"
                  rows={3}
                  className="bg-surface text-ink text-[13px] px-3 py-2 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                />
              </Card>
              <Card padding="md">
                <SectionHeader eyebrow="PROGRESS" title="수업 진도" />
                <textarea
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                  placeholder="오늘 수업 진도"
                  rows={3}
                  className="bg-surface text-ink text-[13px] px-3 py-2 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                />
              </Card>
              <Card padding="md">
                <SectionHeader eyebrow="NOTICE" title="공지사항" description="저장 후에도 지울 때까지 계속 유지됩니다." />
                <textarea
                  value={announcement}
                  onChange={(e) => setAnnouncement(e.target.value)}
                  placeholder="반 공지"
                  rows={3}
                  className="bg-surface text-ink text-[13px] px-3 py-2 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
                />
              </Card>
            </div>
          )}

          {/* 맞춤반: 공지만 */}
          {isCustomClass && (
            <Card padding="md">
              <SectionHeader eyebrow="NOTICE" title="공지사항" description="맞춤반은 숙제 · 진도 · 점수를 학생별로 '학생별' 탭에서 입력합니다." />
              <textarea
                value={announcement}
                onChange={(e) => setAnnouncement(e.target.value)}
                placeholder="반 공지"
                rows={3}
                className="bg-surface text-ink text-[13px] px-3 py-2 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
                style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
              />
            </Card>
          )}

          {/* 이전 과제 */}
          {prevAssignments.length > 0 && (
            <Card padding="md">
              <SectionHeader eyebrow="PREVIOUS" title="이전 과제" />
              <div className="space-y-2">
                {prevAssignments.slice(0, 3).map((a: any, idx: number) => (
                  <div
                    key={a.id || idx}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-surface-2"
                    style={{ borderRadius: 'var(--radius-btn)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge tone="gold" size="sm">{a.assignmentDate}</Badge>
                      <span className="text-[13px] font-semibold text-ink truncate">{a.title}</span>
                    </div>
                    {a.description && (
                      <span className="text-[11.5px] text-mute truncate max-w-[50%] text-right">{a.description}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* 상담 모달 */}
      {counselingStudent && (
        <div
          className="fixed inset-0 flex items-end md:items-center justify-center z-50 p-4"
          style={{ background: 'rgba(14,14,12,0.4)' }}
          onClick={() => setCounselingStudent(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="anim-sheet-up bg-surface w-full max-w-md p-5"
            style={{ borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-sh3)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-eyebrow mb-0.5">COUNSELING</div>
                <h3 className="text-[18px] font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>
                  {counselingStudent.name} 상담 메모
                </h3>
              </div>
              <button
                onClick={() => { hapticLight(); setCounselingStudent(null); }}
                className="press w-8 h-8 inline-flex items-center justify-center text-mute hover:text-ink"
                style={{ borderRadius: 'var(--radius-btn)' }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <div className="text-[12px] text-mute mb-3">
              학생 전화 {counselingStudent.phone || '-'}
              {counselingStudent.studentNumber ? ' · 학번 ' + counselingStudent.studentNumber : ''}
            </div>
            <Divider className="mb-3" />
            <textarea
              value={counselingNote}
              onChange={(e) => setCounselingNote(e.target.value)}
              placeholder="상담 내용을 입력하세요..."
              rows={6}
              className="bg-surface text-ink text-[13px] px-3 py-2 w-full mb-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent resize-y"
              style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-btn)' }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => setCounselingStudent(null)}>
                취소
              </Button>
              <Button
                variant="accent"
                size="md"
                onClick={handleSaveCounseling}
                disabled={!counselingNote.trim()}
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
