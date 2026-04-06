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
}

const COLUMN_COUNT = 21; // 3주

function addDays(iso: string, days: number): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatMD(iso: string): string {
  if (!iso) return '';
  const [, m, d] = iso.split('-');
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function isBetween(target: string, start: string, end: string): boolean {
  if (!target || !start) return false;
  if (!end) return target === start;
  return target >= start && target <= end;
}

export default function ExamPrepPage() {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [semester, setSemester] = useState<number>(1);
  const [examType, setExamType] = useState<string>('MIDTERM');
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const [students, setStudents] = useState<Student[]>([]);
  const [entries, setEntries] = useState<Record<string, ExamPrepEntry>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const dateColumns = useMemo(() => {
    return Array.from({ length: COLUMN_COUNT }, (_, i) => addDays(startDate, i));
  }, [startDate]);

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

  const updateEntry = (studentId: string, patch: Partial<ExamPrepEntry>) => {
    setEntries((prev) => {
      const existing = prev[studentId] || {
        id: '',
        studentId,
        testRange: '',
        examStartDate: '',
        examEndDate: '',
        mathExamDate: '',
        mathExamTime: '',
        prepDate: '',
      };
      return { ...prev, [studentId]: { ...existing, ...patch } };
    });
  };

  const saveEntry = async (studentId: string) => {
    const e = entries[studentId];
    if (!e) return;
    setSaving(true);
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
        }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setEntries((prev) => ({ ...prev, [studentId]: updated }));
    } catch {
      alert('저장 실패');
    } finally {
      setSaving(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const s of students) {
        const e = entries[s.id];
        if (!e) continue;
        await fetch('/api/exam-prep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year,
            semester,
            examType,
            studentId: s.id,
            testRange: e.testRange,
            examStartDate: e.examStartDate,
            examEndDate: e.examEndDate,
            mathExamDate: e.mathExamDate,
            mathExamTime: e.mathExamTime,
            prepDate: e.prepDate,
          }),
        });
      }
      await fetchData();
      alert('저장되었습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">📅 직전대비</h1>

      {/* 셀렉터 바 */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">연도</label>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10))}
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
            value={semester}
            onChange={(e) => setSemester(parseInt(e.target.value, 10))}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
          >
            <option value={1}>1학기</option>
            <option value={2}>2학기</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">시험 종류</label>
          <select
            value={examType}
            onChange={(e) => setExamType(e.target.value)}
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
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded px-3 py-2 text-gray-900"
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

      {/* 범례 */}
      <div className="bg-white rounded-lg shadow p-3 mb-4 flex flex-wrap gap-4 text-xs">
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 bg-orange-400 rounded"></span>
          <span className="text-gray-700">시험일정</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 bg-teal-400 rounded"></span>
          <span className="text-gray-700">수학시험일</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 bg-yellow-300 rounded"></span>
          <span className="text-gray-700">직전대비 날짜</span>
        </div>
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
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">학교</th>
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">학년</th>
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">시험범위</th>
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">시험일정</th>
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">수학시험</th>
                <th className="px-2 py-2 text-left text-gray-700 font-semibold whitespace-nowrap">직전대비</th>
                {dateColumns.map((d) => (
                  <th
                    key={d}
                    className="px-1 py-2 text-center text-gray-700 font-semibold whitespace-nowrap border-l"
                  >
                    {formatMD(d)}
                  </th>
                ))}
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const e = entries[s.id] || {
                  id: '',
                  studentId: s.id,
                  testRange: '',
                  examStartDate: '',
                  examEndDate: '',
                  mathExamDate: '',
                  mathExamTime: '',
                  prepDate: '',
                };
                return (
                  <tr key={s.id} className="border-b hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-2 py-1 font-medium text-gray-900 whitespace-nowrap">
                      {s.name}
                    </td>
                    <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.school || '-'}</td>
                    <td className="px-2 py-1 text-gray-700 whitespace-nowrap">{s.grade || '-'}</td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={e.testRange || ''}
                        onChange={(ev) => updateEntry(s.id, { testRange: ev.target.value })}
                        placeholder="삼,사,피"
                        className="w-24 border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={e.examStartDate || ''}
                          onChange={(ev) =>
                            updateEntry(s.id, { examStartDate: ev.target.value })
                          }
                          className="border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                        />
                        <span className="text-xs text-gray-500">~</span>
                        <input
                          type="date"
                          value={e.examEndDate || ''}
                          onChange={(ev) => updateEntry(s.id, { examEndDate: ev.target.value })}
                          className="border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                        />
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={e.mathExamDate || ''}
                          onChange={(ev) => updateEntry(s.id, { mathExamDate: ev.target.value })}
                          className="border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                        />
                        <input
                          type="text"
                          value={e.mathExamTime || ''}
                          onChange={(ev) => updateEntry(s.id, { mathExamTime: ev.target.value })}
                          placeholder="5시"
                          className="w-12 border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                        />
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        value={e.prepDate || ''}
                        onChange={(ev) => updateEntry(s.id, { prepDate: ev.target.value })}
                        className="border border-gray-200 rounded px-1 py-1 text-xs text-gray-900"
                      />
                    </td>
                    {dateColumns.map((d) => {
                      const inExam = isBetween(
                        d,
                        e.examStartDate || '',
                        e.examEndDate || e.examStartDate || ''
                      );
                      const isMath = d && e.mathExamDate === d;
                      const isPrep = d && e.prepDate === d;
                      let bg = '';
                      let label = '';
                      if (isMath) {
                        bg = 'bg-teal-400 text-white';
                        label = e.mathExamTime || '시';
                      } else if (isPrep) {
                        bg = 'bg-yellow-300 text-gray-900';
                        label = '수';
                      } else if (inExam) {
                        bg = 'bg-orange-400';
                      }
                      return (
                        <td
                          key={d}
                          className={`px-1 py-1 text-center text-xs border-l ${bg}`}
                        >
                          {label}
                        </td>
                      );
                    })}
                    <td className="px-1 py-1">
                      <button
                        onClick={() => saveEntry(s.id)}
                        disabled={saving}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        저장
                      </button>
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && !loading && (
                <tr>
                  <td colSpan={7 + COLUMN_COUNT + 1} className="px-4 py-6 text-center text-gray-500">
                    학생이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
