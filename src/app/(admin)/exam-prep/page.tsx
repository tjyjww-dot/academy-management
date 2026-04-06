'use client';

import { useEffect, useMemo, useState } from 'react';

interface Student {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
}

interface ExamPrepEntry {
  id: string;
  studentId: string;
  testRange: string | null;
  examStartDate: string | null;
  examEndDate: string | null;
  mathExamDate: string | null;
  mathExamTime: string | null;
  prepDate: string | null;
  prepTime: string | null;
}

type PaintMode = 'exam' | 'math' | 'prep';

function addDays(iso: string, days: number): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function diffDays(startIso: string, endIso: string): number {
  if (!startIso || !endIso) return 0;
  const s = new Date(startIso + 'T00:00:00').getTime();
  const e = new Date(endIso + 'T00:00:00').getTime();
  return Math.floor((e - s) / 86400000);
}

function formatMD(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
function getWeekday(iso: string): number {
  if (!iso) return -1;
  return new Date(iso + 'T00:00:00').getDay();
}

function isBetween(target: string, start: string, end: string): boolean {
  if (!target || !start) return false;
  if (!end) return target === start;
  return target >= start && target <= end;
}

// 30분 단위 시간 옵션 (08:00 ~ 23:00)
const TIME_OPTIONS: string[] = (() => {
  const arr: string[] = [];
  for (let h = 8; h <= 23; h++) {
    arr.push(`${String(h).padStart(2, '0')}:00`);
    arr.push(`${String(h).padStart(2, '0')}:30`);
  }
  return arr;
})();

export default function ExamPrepPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [semester, setSemester] = useState<number>(1);
  const [examType, setExamType] = useState<string>('MIDTERM');

  const today = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(() => addDays(today, 20));
  // 대상 학년 (중1, 중2, 중3, 고1) - 다중 선택
  const ALL_TARGET_GRADES = ['중1', '중2', '중3', '고1'];
  const [targetGrades, setTargetGrades] = useState<string[]>([...ALL_TARGET_GRADES]);

  // 설정 입력용 Draft 상태 (저장 버튼 누를 때 applied로 반영)
  const [draftYear, setDraftYear] = useState<number>(year);
  const [draftSemester, setDraftSemester] = useState<number>(semester);
  const [draftExamType, setDraftExamType] = useState<string>(examType);
  const [draftStartDate, setDraftStartDate] = useState<string>(startDate);
  const [draftEndDate, setDraftEndDate] = useState<string>(endDate);
  const [draftTargetGrades, setDraftTargetGrades] = useState<string[]>([...ALL_TARGET_GRADES]);

  // 저장된 설정 불러오기 (서버 우선, localStorage 폴백)
  const applySettings = (s: any) => {
    if (!s || typeof s !== 'object') return;
    if (typeof s.year === 'number') { setYear(s.year); setDraftYear(s.year); }
    if (typeof s.semester === 'number') { setSemester(s.semester); setDraftSemester(s.semester); }
    if (typeof s.examType === 'string') { setExamType(s.examType); setDraftExamType(s.examType); }
    if (typeof s.startDate === 'string') { setStartDate(s.startDate); setDraftStartDate(s.startDate); }
    if (typeof s.endDate === 'string') { setEndDate(s.endDate); setDraftEndDate(s.endDate); }
    if (Array.isArray(s.targetGrades)) { setTargetGrades(s.targetGrades); setDraftTargetGrades(s.targetGrades); }
  };
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/exam-prep/settings', { cache: 'no-store' });
        if (res.ok) {
          const s = await res.json();
          if (s) { applySettings(s); return; }
        }
      } catch {}
      try {
        const raw = localStorage.getItem('examPrep.settings');
        if (raw) applySettings(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const saveSettings = async () => {
    setYear(draftYear);
    setSemester(draftSemester);
    setExamType(draftExamType);
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);
    setTargetGrades(draftTargetGrades);
    const payload = {
      year: draftYear,
      semester: draftSemester,
      examType: draftExamType,
      startDate: draftStartDate,
      endDate: draftEndDate,
      targetGrades: draftTargetGrades,
    };
    try { localStorage.setItem('examPrep.settings', JSON.stringify(payload)); } catch {}
    try {
      await fetch('/api/exam-prep/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {}
  };

  const toggleDraftGrade = (g: string) => {
    setDraftTargetGrades((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]
    );
  };

  const [schoolFilter, setSchoolFilter] = useState<string>('ALL');
  const [gradeFilter, setGradeFilter] = useState<string>('ALL');
  const [nameSearch, setNameSearch] = useState<string>('');
  const [mode, setMode] = useState<PaintMode>('exam');

  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Record<string, ExamPrepEntry>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // 시험일정 모드 두번클릭용 임시 상태
  const [examPending, setExamPending] = useState<Record<string, string>>({});

  // 시간 선택 모달
  const [timeModal, setTimeModal] = useState<{
    studentId: string;
    date: string;
    kind: 'math' | 'prep';
  } | null>(null);
  const [tempTime, setTempTime] = useState<string>('17:00');

  const dateColumns = useMemo(() => {
    if (!startDate || !endDate) return [] as string[];
    const days = diffDays(startDate, endDate);
    if (days < 0) return [startDate];
    const len = Math.min(days + 1, 60);
    return Array.from({ length: len }, (_, i) => addDays(startDate, i));
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/exam-prep?year=${year}&semester=${semester}&examType=${examType}`
      );
      if (res.ok) {
        const data = await res.json();
        setStudents(data.students || []);
        const map: Record<string, ExamPrepEntry> = {};
        for (const e of data.entries || []) map[e.studentId] = e;
        setEntries(map);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, semester, examType]);

  const schools = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.school) set.add(s.school);
    });
    return Array.from(set).sort();
  }, [students]);

  // 초6(초등학교 학생) 제외 + 학교 필터
  const displayStudents = useMemo(() => {
    return students.filter((s) => {
      if (s.school && s.school.includes('초')) return false;
      // 대상 학년 필터 (다중 선택). 선택된 학년만 표시
      if (targetGrades.length > 0) {
        if (!s.grade || !targetGrades.includes(s.grade)) return false;
      } else {
        return false;
      }
      if (schoolFilter !== 'ALL' && s.school !== schoolFilter) return false;
      if (gradeFilter !== 'ALL' && s.grade !== gradeFilter) return false;
      if (nameSearch && !s.name.includes(nameSearch.trim())) return false;
      return true;
    });
  }, [students, schoolFilter, gradeFilter, nameSearch, targetGrades]);

  const grades = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.grade && !(s.school && s.school.includes('초'))) set.add(s.grade);
    });
    return Array.from(set).sort();
  }, [students]);

  const getEntry = (studentId: string): ExamPrepEntry => {
    return (
      entries[studentId] || {
        id: '',
        studentId,
        testRange: '',
        examStartDate: '',
        examEndDate: '',
        mathExamDate: '',
        mathExamTime: '',
        prepDate: '',
        prepTime: '',
      }
    );
  };

  const updateEntry = (studentId: string, patch: Partial<ExamPrepEntry>) => {
    setEntries((prev) => {
      const existing = prev[studentId] || getEntry(studentId);
      return { ...prev, [studentId]: { ...existing, ...patch } };
    });
  };

  const persist = async (studentId: string, entryOverride?: Partial<ExamPrepEntry>) => {
    const base = getEntry(studentId);
    const e = { ...base, ...(entryOverride || {}) };
    try {
      const res = await fetch('/api/exam-prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          semester,
          examType,
          studentId,
          testRange: e.testRange,
          examStartDate: e.examStartDate,
          examEndDate: e.examEndDate,
          mathExamDate: e.mathExamDate,
          mathExamTime: e.mathExamTime,
          prepDate: e.prepDate,
          prepTime: e.prepTime,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setEntries((prev) => ({ ...prev, [studentId]: updated }));
      }
    } catch {
      // ignore
    }
  };

  const handleCellClick = (studentId: string, date: string) => {
    const e = getEntry(studentId);
    if (mode === 'exam') {
      // 기존 범위 안을 클릭하면 삭제
      if (
        e.examStartDate &&
        isBetween(date, e.examStartDate, e.examEndDate || e.examStartDate) &&
        !examPending[studentId]
      ) {
        const patch = { examStartDate: '', examEndDate: '' };
        updateEntry(studentId, patch);
        persist(studentId, patch);
        return;
      }
      const pending = examPending[studentId];
      if (!pending) {
        setExamPending({ ...examPending, [studentId]: date });
        const patch = { examStartDate: date, examEndDate: date };
        updateEntry(studentId, patch);
        persist(studentId, patch);
      } else {
        const [s, en] = [pending, date].sort();
        const patch = { examStartDate: s, examEndDate: en };
        updateEntry(studentId, patch);
        persist(studentId, patch);
        const next = { ...examPending };
        delete next[studentId];
        setExamPending(next);
      }
    } else if (mode === 'math') {
      if (e.mathExamDate === date) {
        const patch = { mathExamDate: '', mathExamTime: '' };
        updateEntry(studentId, patch);
        persist(studentId, patch);
        return;
      }
      const patch = { mathExamDate: date, mathExamTime: '' };
      updateEntry(studentId, patch);
      persist(studentId, patch);
    } else if (mode === 'prep') {
      if (e.prepDate === date) {
        const patch = { prepDate: '', prepTime: '' };
        updateEntry(studentId, patch);
        persist(studentId, patch);
        return;
      }
      setTempTime(e.prepTime || '17:00');
      setTimeModal({ studentId, date, kind: 'prep' });
    }
  };

  const confirmTimeModal = () => {
    if (!timeModal) return;
    const { studentId, date, kind } = timeModal;
    const patch: Partial<ExamPrepEntry> =
      kind === 'math'
        ? { mathExamDate: date, mathExamTime: tempTime }
        : { prepDate: date, prepTime: tempTime };
    updateEntry(studentId, patch);
    persist(studentId, patch);
    setTimeModal(null);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const s of displayStudents) {
        const e = entries[s.id];
        if (!e) continue;
        await persist(s.id);
      }
      alert('저장되었습니다.');
    } finally {
      setSaving(false);
    }
  };

  const modeColor = (m: PaintMode) =>
    mode === m
      ? m === 'exam'
        ? 'bg-orange-500 text-white'
        : m === 'math'
        ? 'bg-teal-500 text-white'
        : 'bg-yellow-400 text-gray-900'
      : 'bg-gray-100 text-gray-700';

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">📅 직전대비</h1>

      {/* 셀렉터 바 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">연도</label>
          <select
            value={draftYear}
            onChange={(e) => setDraftYear(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
          >
            {[2025, 2026, 2027, 2028].map((y) => (
              <option key={y} value={y}>
                {y}년
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">학기</label>
          <select
            value={draftSemester}
            onChange={(e) => setDraftSemester(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
          >
            <option value={1}>1학기</option>
            <option value={2}>2학기</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">시험 학년 (다중)</label>
          <div className="flex items-center gap-1">
            {ALL_TARGET_GRADES.map((g) => {
              const active = draftTargetGrades.includes(g);
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => toggleDraftGrade(g)}
                  className={`px-2 py-2 rounded text-sm border ${
                    active
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">시험 종류</label>
          <select
            value={draftExamType}
            onChange={(e) => setDraftExamType(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
          >
            <option value="MIDTERM">중간고사</option>
            <option value="FINAL">기말고사</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">달력 시작일</label>
          <input
            type="date"
            value={draftStartDate}
            onChange={(e) => setDraftStartDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">달력 종료일</label>
          <input
            type="date"
            value={draftEndDate}
            onChange={(e) => setDraftEndDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
          />
        </div>
        <button
          onClick={saveSettings}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 font-semibold"
        >
          설정 저장
        </button>
        <div>
          <label className="block text-xs text-gray-600 mb-1">이름 검색</label>
          <input
            type="text"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
            placeholder="학생 이름"
            className="border border-gray-300 rounded px-3 py-2 text-gray-900 w-32"
          />
        </div>
        <button
          onClick={saveAll}
          disabled={saving}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? '저장 중...' : '전체 저장'}
        </button>
      </div>

      {/* 모드 선택 */}
      <div className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-700 mr-2">입력 모드:</span>
        <button
          onClick={() => setMode('exam')}
          className={`px-3 py-1.5 rounded text-sm font-semibold ${modeColor('exam')}`}
        >
          시험일정
        </button>
        <button
          onClick={() => setMode('math')}
          className={`px-3 py-1.5 rounded text-sm font-semibold ${modeColor('math')}`}
        >
          수학시험
        </button>
        <button
          onClick={() => setMode('prep')}
          className={`px-3 py-1.5 rounded text-sm font-semibold ${modeColor('prep')}`}
        >
          직전대비
        </button>
        <span className="ml-3 text-xs text-gray-500">
          {mode === 'exam' &&
            '※ 시험 첫날과 마지막날을 두 번 클릭하면 기간이 주황색으로 표시됩니다. (같은 칸 다시 클릭 시 삭제)'}
          {mode === 'math' && '※ 칸을 클릭하면 수학시험일로 표시됩니다. (같은 칸 다시 클릭 시 삭제)'}
          {mode === 'prep' &&
            '※ 칸을 클릭하면 시간을 선택할 수 있고 노란색 "직보"로 표시됩니다.'}
        </span>
      </div>

      {/* 표 */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-gray-500">불러오는 중...</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 border-b">
                <th className="sticky left-0 bg-gray-100 px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">
                  이름
                </th>
                <th className="pl-2 pr-0 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">
                  <select
                    value={schoolFilter}
                    onChange={(e) => setSchoolFilter(e.target.value)}
                    className="border border-gray-300 rounded px-1 py-1 text-xs text-gray-900 font-semibold"
                  >
                    <option value="ALL">학교 (전체)</option>
                    {schools
                      .filter((sc) => !sc.includes('초'))
                      .map((sc) => (
                        <option key={sc} value={sc}>
                          {sc}
                        </option>
                      ))}
                  </select>
                </th>
                <th className="pl-0 pr-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">
                  <select
                    value={gradeFilter}
                    onChange={(e) => setGradeFilter(e.target.value)}
                    className="border border-gray-300 rounded px-1 py-1 text-xs text-gray-900 font-semibold"
                  >
                    <option value="ALL">학년 (전체)</option>
                    {grades.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">
                  시험범위
                </th>
                {dateColumns.map((d) => {
                  const wd = getWeekday(d);
                  const isWeekend = wd === 0 || wd === 6;
                  return (
                    <th
                      key={d}
                      className={`px-1 py-2 text-center text-gray-700 font-semibold whitespace-nowrap border-l min-w-[48px] ${
                        isWeekend ? 'bg-sky-100' : ''
                      }`}
                    >
                      <div>{formatMD(d)}</div>
                      <div className="text-[10px] text-gray-500">({WEEKDAYS[wd]})</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {displayStudents.map((s) => {
                const e = getEntry(s.id);
                return (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-2 py-1 font-medium text-gray-900 whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="pl-2 pr-0 py-1 text-gray-700 whitespace-nowrap">
                      {s.school || '-'}
                    </td>
                    <td className="pl-1 pr-2 py-1 text-gray-700 whitespace-nowrap">
                      {s.grade || '-'}
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={e.testRange || ''}
                        onChange={(ev) => updateEntry(s.id, { testRange: ev.target.value })}
                        onBlur={() => persist(s.id)}
                        placeholder="삼,사,피"
                        className="w-48 border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                      />
                    </td>
                    {dateColumns.map((d) => {
                      const inExam = isBetween(
                        d,
                        e.examStartDate || '',
                        e.examEndDate || e.examStartDate || ''
                      );
                      const isMath = !!(d && e.mathExamDate === d);
                      const isPrep = !!(d && e.prepDate === d);
                      const wd = getWeekday(d);
                      const isWeekend = wd === 0 || wd === 6;
                      let bg = isWeekend ? 'bg-sky-100' : '';
                      let label: React.ReactNode = '';
                      if (isPrep) {
                        bg = 'bg-yellow-300 text-gray-900';
                        label = (
                          <div className="leading-tight">
                            <div className="font-bold">직보</div>
                            {e.prepTime && <div className="text-[10px]">{e.prepTime}</div>}
                          </div>
                        );
                      } else if (isMath) {
                        bg = 'bg-teal-400 text-white';
                        label = <div className="font-bold">수학</div>;
                      } else if (inExam) {
                        bg = 'bg-orange-400';
                      }
                      return (
                        <td
                          key={d}
                          onClick={() => handleCellClick(s.id, d)}
                          className={`px-1 py-1 text-center text-xs border-l cursor-pointer select-none ${bg}`}
                        >
                          {label}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {displayStudents.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={4 + dateColumns.length}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* 시간 선택 모달 */}
      {timeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-80">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              {timeModal.kind === 'math' ? '수학시험 시간' : '직전대비 시간'} 선택
            </h3>
            <p className="text-xs text-gray-500 mb-3">{timeModal.date}</p>
            <select
              value={tempTime}
              onChange={(e) => setTempTime(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-gray-900 mb-4"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setTimeModal(null)}
                className="px-3 py-1.5 text-sm bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={confirmTimeModal}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
