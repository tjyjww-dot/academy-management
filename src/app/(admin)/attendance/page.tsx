'use client';

import { useState, useEffect, useCallback } from 'react';

interface Student {
  id: string;
  name: string;
}

interface AttendanceRecord {
  studentId: string;
  status: string;
  checkInTime?: string;
  remarks?: string;
}

interface ClassroomOption {
  id: string;
  name: string;
}

const SESSION_DATE_KEY = 'attendance_selectedDate';
const SESSION_CLASSROOM_KEY = 'attendance_selectedClassroom';

function getToday() {
  return new Date().toISOString().split('T')[0];
}

export default function AttendancePage() {
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [students, setStudents] = useState<Student[]>([]);
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({ present: 0, absent: 0, late: 0, early: 0, excused: 0 });

  // 초기 마운트 시 세션스토리지에서 이전 선택값 복원
  useEffect(() => {
    const savedDate = sessionStorage.getItem(SESSION_DATE_KEY);
    const savedClassroom = sessionStorage.getItem(SESSION_CLASSROOM_KEY);
    if (savedDate) {
      setSelectedDate(savedDate);
    }
    if (savedClassroom) {
      setSelectedClassroom(savedClassroom);
    }
    fetchClassrooms();
  }, []);

  const fetchClassrooms = async () => {
    try {
      const res = await fetch('/api/classes');
      const data = await res.json();
      setClassrooms(data);
    } catch (error) {
      console.error('Failed to fetch classrooms:', error);
    }
  };

  // 날짜 또는 교실이 변경되면 출결 데이터 다시 불러오기
  const fetchAttendance = useCallback(async (classroomId: string, date: string) => {
    if (!classroomId) return;
    setLoading(true);
    try {
      const [classRes, attendanceRes] = await Promise.all([
        fetch(`/api/classes/${classroomId}`),
        fetch(`/api/attendance?classroomId=${classroomId}&date=${date}`),
      ]);

      const classroom = await classRes.json();
      const attendanceData = await attendanceRes.json();

      setStudents(classroom.enrollments.map((e: any) => e.student));

      const attendanceMap: Record<string, AttendanceRecord> = {};
      attendanceData.forEach((record: any) => {
        attendanceMap[record.studentId] = {
          studentId: record.studentId,
          status: record.status || 'PRESENT',
          checkInTime: record.checkInTime || '',
          remarks: record.remarks || '',
        };
      });

      classroom.enrollments.forEach((enrollment: any) => {
        if (!attendanceMap[enrollment.studentId]) {
          attendanceMap[enrollment.studentId] = {
            studentId: enrollment.studentId,
            status: 'PRESENT',
            checkInTime: '',
            remarks: '',
          };
        }
      });

      setAttendance(attendanceMap);
      updateStats(attendanceMap);
    } catch (error) {
      console.error('Failed to fetch attendance:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // 교실 변경 시
  const handleClassroomChange = (classroomId: string) => {
    setSelectedClassroom(classroomId);
    sessionStorage.setItem(SESSION_CLASSROOM_KEY, classroomId);
    if (classroomId) {
      fetchAttendance(classroomId, selectedDate);
    } else {
      setStudents([]);
      setAttendance({});
    }
  };

  // 날짜 변경 시 → 데이터 자동 재로딩
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    sessionStorage.setItem(SESSION_DATE_KEY, date);
    if (selectedClassroom) {
      fetchAttendance(selectedClassroom, date);
    }
  };

  // 교실 복원 후 데이터 불러오기 (세션스토리지에서 복원된 경우)
  useEffect(() => {
    if (selectedClassroom && classrooms.length > 0) {
      fetchAttendance(selectedClassroom, selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classrooms]);

  const handleStatusChange = (studentId: string, status: string) => {
    const newAttendance = {
      ...attendance,
      [studentId]: {
        ...attendance[studentId],
        status,
        checkInTime: status === '출석' ? new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '',
      },
    };
    setAttendance(newAttendance);
    updateStats(newAttendance);
  };

  const handleRemarksChange = (studentId: string, remarks: string) => {
    setAttendance({
      ...attendance,
      [studentId]: {
        ...attendance[studentId],
        remarks,
      },
    });
  };

  const updateStats = (attendanceMap: Record<string, AttendanceRecord>) => {
    const newStats = { present: 0, absent: 0, late: 0, early: 0, excused: 0 };
    Object.values(attendanceMap).forEach((record) => {
      if (record.status === '출석') newStats.present++;
      else if (record.status === '결석') newStats.absent++;
      else if (record.status === '지각') newStats.late++;
      else if (record.status === '조퇴') newStats.early++;
      else if (record.status === '사유결석') newStats.excused++;
    });
    setStats(newStats);
  };

  const handleSave = async () => {
    if (!selectedClassroom) {
      setMessage('교실을 선택하세요');
      return;
    }

    setSaving(true);
    try {
      const records = Object.entries(attendance).map(([studentId, record]) => ({
        studentId,
        status: record.status === '출석' ? 'PRESENT'
          : record.status === '결석' ? 'ABSENT'
          : record.status === '지각' ? 'LATE'
          : record.status === '조퇴' ? 'EARLY_LEAVE'
          : 'EXCUSED',
        checkInTime: record.checkInTime || null,
        remarks: record.remarks || null,
      }));

      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classroomId: selectedClassroom,
          date: selectedDate,
          records,
        }),
      });

      if (res.ok) {
        setMessage('저장되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('저장 실패');
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const statusButtons = [
    { label: '출석', color: 'bg-green-500', key: '출석' },
    { label: '결석', color: 'bg-red-500', key: '결석' },
    { label: '지각', color: 'bg-yellow-500', key: '지각' },
    { label: '조퇴', color: 'bg-orange-500', key: '조퇴' },
    { label: '사유결석', color: 'bg-gray-500', key: '사유결석' },
  ];

  const selectedClassroomName = classrooms.find(c => c.id === selectedClassroom)?.name || '';

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">출결 관리</h1>

        {/* 교실·날짜 선택 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                교실 선택
              </label>
              <select
                value={selectedClassroom}
                onChange={(e) => handleClassroomChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">-- 교실 선택 --</option>
                {classrooms.map((classroom) => (
                  <option key={classroom.id} value={classroom.id}>
                    {classroom.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                날짜 선택
              </label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {selectedClassroom && (
            <p className="text-sm text-blue-600 mt-2">
              📋 {selectedClassroomName} ·{' '}
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', {
                year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
              })} 출결
            </p>
          )}
        </div>

        {/* 출결 표 */}
        {selectedClassroom && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            {loading ? (
              <p className="text-center text-gray-500 py-8">로딩 중...</p>
            ) : students.length === 0 ? (
              <p className="text-center text-gray-500 py-8">등록된 학생이 없습니다</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">학생명</th>
                        <th className="px-4 py-2 text-left font-semibold">상태</th>
                        <th className="px-4 py-2 text-left font-semibold">체크인 시간</th>
                        <th className="px-4 py-2 text-left font-semibold">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((student) => {
                        const record = attendance[student.id];
                        return (
                          <tr key={student.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium">{student.name}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2">
                                {statusButtons.map((btn) => (
                                  <button
                                    key={btn.key}
                                    onClick={() => handleStatusChange(student.id, btn.key)}
                                    className={`px-3 py-1 rounded text-white text-xs font-medium transition ${
                                      record?.status === btn.key
                                        ? btn.color
                                        : 'bg-gray-300 hover:bg-gray-400'
                                    }`}
                                  >
                                    {btn.label}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {record?.checkInTime || '-'}
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                placeholder="비고"
                                value={record?.remarks || ''}
                                onChange={(e) => handleRemarksChange(student.id, e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-blue-500"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50"
                  >
                    {saving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 출결 현황 */}
        {selectedClassroom && !loading && students.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">출결 현황</h2>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-green-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{stats.present}</div>
                <div className="text-sm text-gray-600">출석</div>
              </div>
              <div className="bg-red-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
                <div className="text-sm text-gray-600">결석</div>
              </div>
              <div className="bg-yellow-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-yellow-600">{stats.late}</div>
                <div className="text-sm text-gray-600">지각</div>
              </div>
              <div className="bg-orange-100 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-600">{stats.early}</div>
                <div className="text-sm text-gray-600">조퇴</div>
              </div>
              <div className="bg-gray-200 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-gray-700">{stats.excused}</div>
                <div className="text-sm text-gray-600">사유결석</div>
              </div>
            </div>
          </div>
        )}

        {/* 토스트 메시지 */}
        {message && (
          <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg text-white ${
            message.includes('실패') || message.includes('오류') ? 'bg-red-500' : 'bg-green-500'
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
