'use client';

import { useEffect, useMemo, useState } from 'react';
import { hapticLight, hapticMedium, hapticSelection, hapticSuccess, hapticWarn } from '@/lib/haptics';

/* ──────────────────────────────────────────────────────────
 * 요청사항 페이지
 *  - 기존 업무요청 (TaskRequest) + 신규: 학생 상담 예약 (CounselingRequest)
 *  - 탭: 업무 요청 · 상담 예약 · 받은 요청 · 보낸 요청
 * ────────────────────────────────────────────────────────── */

interface TaskRequest {
  id: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdByName: string;
  targetRole: string;
  targetUserId: string | null;
  targetUserName: string | null;
  isCompleted: boolean;
  completedBy: string | null;
  completedAt: string | null;
  response: string | null;
  responseByName: string | null;
  createdAt: string;
}

interface CounselingItem {
  id: string;
  title: string;
  description?: string | null;
  counselingType: string; // 'PHONE' | 'VISIT'
  status: string;         // PENDING / CONFIRMED / COMPLETED / CANCELLED
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  assignedTeacherId?: string | null;
  visitMessage?: string | null;
  sessionNotes?: string | null;
  adminNotes?: string | null;
  createdAt: string;
  createdByName?: string | null;
  student: { id: string; name: string };
  parent?: { name: string } | null;
}

interface StudentLite {
  id: string;
  name: string;
  school?: string | null;
  grade?: string | null;
  phone?: string | null;
  parentPhone?: string | null;
  enrollments?: Array<{
    status: string;
    classroom?: { id: string; name: string; teacher?: { id: string; name: string } | null } | null;
  }>;
}

interface UserInfo {
  userId: string;
  role: string;
  name: string;
}

interface StaffUser {
  id: string;
  name: string;
  role: string;
}

type Tab = 'new' | 'counseling' | 'received' | 'sent';

export default function RequestsPage() {
  /* 공통 */
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('new');
  const [loading, setLoading] = useState(true);

  /* 업무 요청 (TaskRequest) */
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [sentRequests, setSentRequests] = useState<TaskRequest[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<TaskRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<TaskRequest | null>(null);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);
  const [viewingRequest, setViewingRequest] = useState<TaskRequest | null>(null);

  /* 상담 예약 (CounselingRequest) */
  const [counselingType, setCounselingType] = useState<'PHONE' | 'VISIT'>('PHONE');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<StudentLite[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentLite | null>(null);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [studentLoading, setStudentLoading] = useState(false);
  const [counselingTitle, setCounselingTitle] = useState('');
  const [counselingDesc, setCounselingDesc] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [assignedTeacherId, setAssignedTeacherId] = useState('');
  const [counselingSubmitting, setCounselingSubmitting] = useState(false);
  const [counselingSubmitError, setCounselingSubmitError] = useState('');
  const [counselingSubmitSuccess, setCounselingSubmitSuccess] = useState('');
  const [recentCounseling, setRecentCounseling] = useState<CounselingItem[]>([]);

  const teachers = useMemo(
    () => users.filter((u) => u.role === 'TEACHER' || u.role === 'ADMIN'),
    [users]
  );

  /* ───── 초기 로딩 ───── */
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setUserInfo({
              userId: data.user.id,
              role: data.user.role,
              name: data.user.name,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch user info:', err);
      }
    };
    fetchUserInfo();
    fetchUsers();
    fetchSentRequests();
    fetchReceivedRequests();
    fetchRecentCounseling();
  }, []);

  /* ───── 학생 검색 (debounce) ───── */
  useEffect(() => {
    if (!studentQuery || studentQuery.trim().length < 1) {
      setStudentResults([]);
      return;
    }
    if (selectedStudent && selectedStudent.name === studentQuery) {
      // 이미 선택된 상태면 검색 안 함
      return;
    }
    const t = setTimeout(async () => {
      setStudentLoading(true);
      try {
        const res = await fetch(`/api/students?q=${encodeURIComponent(studentQuery)}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.students || [];
          setStudentResults(list);
        }
      } catch (err) {
        console.error('Student search error:', err);
      } finally {
        setStudentLoading(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [studentQuery, selectedStudent]);

  /* ───── API 호출 ───── */
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(Array.isArray(data) ? data : data.users || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const fetchSentRequests = async () => {
    try {
      const res = await fetch('/api/task-requests?sent=true');
      if (res.ok) {
        const data = await res.json();
        setSentRequests(Array.isArray(data) ? data : data.taskRequests || []);
      }
    } catch (err) {
      console.error('Failed to fetch sent requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReceivedRequests = async () => {
    try {
      const res = await fetch('/api/task-requests?received=true');
      if (res.ok) {
        const data = await res.json();
        setReceivedRequests(Array.isArray(data) ? data : data.taskRequests || []);
      }
    } catch (err) {
      console.error('Failed to fetch received requests:', err);
    }
  };

  const fetchRecentCounseling = async () => {
    try {
      const res = await fetch('/api/counseling?status=PENDING');
      if (res.ok) {
        const data = await res.json();
        const list: CounselingItem[] = Array.isArray(data) ? data : [];
        setRecentCounseling(list.slice(0, 20));
      }
    } catch (err) {
      console.error('Failed to fetch counseling:', err);
    }
  };

  /* ───── 업무 요청 제출 ───── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !selectedUserId || !userInfo) {
      setSubmitError('제목과 대상을 선택해주세요.');
      hapticWarn();
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');
    try {
      const response = await fetch('/api/task-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          description: taskDescription,
          targetUserId: selectedUserId,
        }),
      });
      if (!response.ok) throw new Error('Failed to create task request');
      setTaskTitle('');
      setTaskDescription('');
      setSelectedUserId('');
      setSubmitSuccess('요청이 등록되었습니다!');
      hapticSuccess();
      setTimeout(() => setSubmitSuccess(''), 3000);
      fetchSentRequests();
    } catch (err) {
      console.error('Error submitting task request:', err);
      setSubmitError('요청사항 등록 중 오류가 발생했습니다.');
      hapticWarn();
    } finally {
      setSubmitting(false);
    }
  };

  /* ───── 상담 예약 제출 ───── */
  const handleCounselingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) {
      setCounselingSubmitError('학생을 선택해주세요.');
      hapticWarn();
      return;
    }
    if (!counselingTitle.trim()) {
      setCounselingSubmitError('상담 제목을 입력해주세요.');
      hapticWarn();
      return;
    }
    if (counselingType === 'VISIT' && (!scheduledDate || !scheduledTime)) {
      setCounselingSubmitError('방문상담은 예정일과 시간을 모두 입력해주세요.');
      hapticWarn();
      return;
    }

    setCounselingSubmitting(true);
    setCounselingSubmitError('');
    setCounselingSubmitSuccess('');

    try {
      const body: any = {
        studentId: selectedStudent.id,
        title: counselingTitle,
        description: counselingDesc || null,
        counselingType,
        assignedTeacherId: assignedTeacherId || null,
        status: 'PENDING',
      };
      if (counselingType === 'VISIT') {
        body.scheduledDate = scheduledDate;
        body.scheduledTime = scheduledTime;
        // preferredDate 에도 "2026-04-20 14:30" 형태로 저장해 기존 UI 와의 호환성 확보
        body.preferredDate = `${scheduledDate} ${scheduledTime}`;
      }

      const response = await fetch('/api/counseling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error('Failed to create counseling');

      setCounselingSubmitSuccess(
        counselingType === 'VISIT'
          ? '방문상담이 예약되었습니다. 담당 강사 대시보드의 받은 요청사항에 표시됩니다.'
          : '전화상담이 접수되었습니다. 담당 강사 대시보드의 받은 요청사항에 표시됩니다.'
      );
      hapticSuccess();
      // 폼 초기화
      setSelectedStudent(null);
      setStudentQuery('');
      setCounselingTitle('');
      setCounselingDesc('');
      setScheduledDate('');
      setScheduledTime('');
      setAssignedTeacherId('');
      setCounselingType('PHONE');
      setTimeout(() => setCounselingSubmitSuccess(''), 4000);
      fetchRecentCounseling();
    } catch (err) {
      console.error('Error submitting counseling:', err);
      setCounselingSubmitError('상담 예약 중 오류가 발생했습니다.');
      hapticWarn();
    } finally {
      setCounselingSubmitting(false);
    }
  };

  /* ───── 업무요청 답장/완료/삭제 ───── */
  const handleRespond = async () => {
    if (!selectedRequest || !responseText.trim()) return;
    setResponding(true);
    try {
      const res = await fetch(`/api/task-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: true, response: responseText }),
      });
      if (res.ok) {
        setSelectedRequest(null);
        setResponseText('');
        fetchReceivedRequests();
        fetchSentRequests();
        hapticSuccess();
      }
    } catch (err) {
      console.error('Error responding:', err);
    } finally {
      setResponding(false);
    }
  };

  const handleQuickComplete = async (requestId: string) => {
    try {
      const res = await fetch(`/api/task-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isCompleted: true, response: '확인했습니다.' }),
      });
      if (res.ok) {
        fetchReceivedRequests();
        fetchSentRequests();
        hapticSuccess();
      }
    } catch (err) {
      console.error('Error completing:', err);
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('이 요청을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/task-requests/${requestId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchSentRequests();
        fetchReceivedRequests();
      }
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  /* ───── 파생 ───── */
  const filteredUsers = users.filter((u) => u.id !== userInfo?.userId);
  const pendingReceived = receivedRequests.filter((r) => !r.isCompleted);
  const completedReceived = receivedRequests.filter((r) => r.isCompleted);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const activeClassroomTeacher = selectedStudent?.enrollments?.find(
    (e) => e.status === 'ACTIVE'
  )?.classroom?.teacher;

  // 학생이 바뀌면 담당 강사 기본값을 학생의 반 담당강사로 자동 선택 (수동 변경 가능)
  useEffect(() => {
    if (selectedStudent && !assignedTeacherId && activeClassroomTeacher?.id) {
      setAssignedTeacherId(activeClassroomTeacher.id);
    }
    if (!selectedStudent) {
      setAssignedTeacherId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  /* 상담 제목 자동 제안 */
  useEffect(() => {
    if (selectedStudent && !counselingTitle) {
      setCounselingTitle(
        counselingType === 'VISIT'
          ? `${selectedStudent.name} 학부모 방문상담`
          : `${selectedStudent.name} 학부모 전화상담`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent, counselingType]);

  /* ───── 렌더 ───── */
  const TAB_META: Record<Tab, { label: string; icon: string }> = {
    new: { label: '업무 요청', icon: '📝' },
    counseling: { label: '상담 예약', icon: '📞' },
    received: { label: '받은 요청', icon: '📨' },
    sent: { label: '보낸 요청', icon: '📋' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[22px] sm:text-[26px] font-bold"
          style={{ color: 'var(--color-ink)', letterSpacing: '-0.02em' }}
        >
          요청사항
        </h1>
      </div>

      {/* ───── 탭 메뉴 ───── */}
      <div
        className="flex gap-1 mb-6 p-1 rounded-lg overflow-x-auto"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
      >
        {(['new', 'counseling', 'received', 'sent'] as Tab[]).map((t) => {
          const meta = TAB_META[t];
          const badge = t === 'received' ? pendingReceived.length : 0;
          const isActive = activeTab === t;
          return (
            <button
              key={t}
              onPointerDown={() => hapticSelection()}
              onClick={() => setActiveTab(t)}
              className="press press-subtle relative flex-1 min-w-[88px] py-2.5 px-3 rounded-md text-[13px] font-semibold transition-colors"
              style={{
                background: isActive ? 'var(--color-surface)' : 'transparent',
                color: isActive ? 'var(--color-accent)' : 'var(--color-mute)',
                boxShadow: isActive ? '0 1px 2px rgba(14,14,12,0.06)' : undefined,
              }}
            >
              <span className="mr-1.5">{meta.icon}</span>
              {meta.label}
              {badge > 0 && (
                <span
                  className="absolute -top-1 -right-1 text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold"
                  style={{ background: 'var(--color-danger)', color: '#fff' }}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ───── 업무 요청 ───── */}
      {activeTab === 'new' && (
        <div
          className="rounded-lg anim-tab-in"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <div className="text-eyebrow mb-0.5">TASK REQUEST</div>
            <h2 className="text-[17px] font-bold" style={{ color: 'var(--color-ink)', letterSpacing: '-0.02em' }}>
              📝 새 업무 요청
            </h2>
            <p className="text-[12px] mt-1" style={{ color: 'var(--color-mute)' }}>
              내부 직원 간 업무 요청을 보냅니다. 상담 예약은 <b>상담 예약</b> 탭을 사용하세요.
            </p>
          </div>
          <div className="p-5 sm:p-6">
            <form onSubmit={handleSubmit}>
              <LabeledField label="요청 내용" required>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="요청 제목을 입력해주세요"
                  className="input-apple"
                />
              </LabeledField>
              <LabeledField label="상세 내용">
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  placeholder="추가 설명이 필요하면 입력해주세요"
                  rows={3}
                  className="input-apple resize-none"
                />
              </LabeledField>
              <LabeledField label="대상 선택" required>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="input-apple"
                >
                  <option value="">요청 대상을 선택하세요</option>
                  {filteredUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} ({user.role === 'ADMIN' ? '관리자' : user.role === 'TEACHER' ? '강사' : '데스크'})
                    </option>
                  ))}
                </select>
              </LabeledField>
              {submitError && <NotiBox tone="danger" message={submitError} />}
              {submitSuccess && <NotiBox tone="success" message={submitSuccess} />}
              <button
                type="submit"
                disabled={submitting}
                onPointerDown={() => !submitting && hapticMedium()}
                className="press press-strong w-full min-h-[44px] mt-2 py-2.5 rounded-lg text-[13.5px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: 'var(--color-accent)', color: '#fff' }}
              >
                {submitting ? '등록 중...' : '요청 등록'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ───── 상담 예약 ───── */}
      {activeTab === 'counseling' && (
        <div className="anim-tab-in space-y-6">
          <div
            className="rounded-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="text-eyebrow mb-0.5">COUNSELING · RESERVATION</div>
              <h2 className="text-[17px] font-bold" style={{ color: 'var(--color-ink)', letterSpacing: '-0.02em' }}>
                📞 상담 예약 등록
              </h2>
              <p className="text-[12px] mt-1" style={{ color: 'var(--color-mute)' }}>
                학부모의 방문·전화상담 예약을 접수합니다. 담당 강사 대시보드 &gt; 받은 요청사항에 자동으로 표시됩니다.
              </p>
            </div>
            <div className="p-5 sm:p-6">
              <form onSubmit={handleCounselingSubmit}>
                {/* 상담 유형 세그먼트 컨트롤 */}
                <LabeledField label="상담 유형" required>
                  <div
                    className="flex gap-1 p-1 rounded-lg"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                  >
                    {(
                      [
                        { key: 'PHONE', label: '📞 전화상담', hint: '통화로 상담 진행' },
                        { key: 'VISIT', label: '🏢 방문상담', hint: '학원 방문 · 일시 지정' },
                      ] as const
                    ).map((t) => {
                      const active = counselingType === t.key;
                      return (
                        <button
                          key={t.key}
                          type="button"
                          onPointerDown={() => hapticSelection()}
                          onClick={() => setCounselingType(t.key as 'PHONE' | 'VISIT')}
                          className="press press-subtle flex-1 py-2.5 rounded-md text-[13px] font-semibold transition-colors"
                          style={{
                            background: active ? 'var(--color-surface)' : 'transparent',
                            color: active
                              ? t.key === 'VISIT'
                                ? 'var(--color-gold, #C99A3B)'
                                : 'var(--color-accent)'
                              : 'var(--color-mute)',
                            boxShadow: active ? '0 1px 2px rgba(14,14,12,0.06)' : undefined,
                          }}
                        >
                          <div>{t.label}</div>
                          <div className="text-[11px] font-medium mt-0.5" style={{ color: 'var(--color-mute)' }}>
                            {t.hint}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </LabeledField>

                {/* 학생 검색 */}
                <LabeledField label="학생" required>
                  <div className="relative">
                    <input
                      type="text"
                      value={studentQuery}
                      onChange={(e) => {
                        setStudentQuery(e.target.value);
                        setShowStudentDropdown(true);
                        if (selectedStudent && e.target.value !== selectedStudent.name) {
                          setSelectedStudent(null);
                        }
                      }}
                      onFocus={() => setShowStudentDropdown(true)}
                      onBlur={() => setTimeout(() => setShowStudentDropdown(false), 200)}
                      placeholder="학생 이름 · 학교 · 학부모 전화번호로 검색"
                      className="input-apple"
                    />
                    {showStudentDropdown && studentQuery && studentResults.length > 0 && !selectedStudent && (
                      <div
                        className="absolute left-0 right-0 top-full mt-1 rounded-lg shadow-lg max-h-72 overflow-y-auto z-20"
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                        }}
                      >
                        {studentResults.map((s) => {
                          const classroom = s.enrollments?.find((e) => e.status === 'ACTIVE')?.classroom;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onPointerDown={() => hapticLight()}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setSelectedStudent(s);
                                setStudentQuery(s.name);
                                setShowStudentDropdown(false);
                              }}
                              className="press press-subtle w-full text-left px-3 py-2.5 text-[13px]"
                              style={{ borderBottom: '1px solid var(--color-border)' }}
                            >
                              <div className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                                {s.name}
                              </div>
                              <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--color-mute)' }}>
                                {[s.school, s.grade, classroom?.name, classroom?.teacher?.name ? `${classroom.teacher.name} 선생님` : null]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {studentQuery && !selectedStudent && !studentLoading && studentResults.length === 0 && (
                      <div
                        className="text-[12px] mt-2 px-3 py-2 rounded-md"
                        style={{ color: 'var(--color-mute)', background: 'var(--color-surface-2)' }}
                      >
                        일치하는 학생이 없습니다.
                      </div>
                    )}
                  </div>
                  {selectedStudent && (
                    <div
                      className="mt-2 px-3 py-2.5 rounded-lg flex items-start justify-between gap-3"
                      style={{ background: 'var(--color-info-bg, #E8F1FB)', border: '1px solid var(--color-border)' }}
                    >
                      <div className="text-[12.5px]" style={{ color: 'var(--color-ink)' }}>
                        <div className="font-semibold">✅ {selectedStudent.name}</div>
                        <div className="text-[11.5px] mt-0.5" style={{ color: 'var(--color-mute)' }}>
                          {[selectedStudent.school, selectedStudent.grade].filter(Boolean).join(' · ')}
                          {activeClassroomTeacher?.name && ` · 담당 ${activeClassroomTeacher.name} 선생님`}
                          {selectedStudent.parentPhone && ` · 학부모 ${selectedStudent.parentPhone}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        onPointerDown={() => hapticLight()}
                        onClick={() => {
                          setSelectedStudent(null);
                          setStudentQuery('');
                        }}
                        className="press text-[12px] underline shrink-0"
                        style={{ color: 'var(--color-mute)' }}
                      >
                        변경
                      </button>
                    </div>
                  )}
                </LabeledField>

                {/* 상담 제목 */}
                <LabeledField label="상담 제목" required>
                  <input
                    type="text"
                    value={counselingTitle}
                    onChange={(e) => setCounselingTitle(e.target.value)}
                    placeholder="예: 중간고사 대비 방문상담"
                    className="input-apple"
                  />
                </LabeledField>

                {/* 상세 내용 */}
                <LabeledField label="상담 내용 / 요청 사항">
                  <textarea
                    value={counselingDesc}
                    onChange={(e) => setCounselingDesc(e.target.value)}
                    rows={3}
                    placeholder="학부모가 요청한 상담 주제나 특이사항을 입력하세요 (선택)"
                    className="input-apple resize-none"
                  />
                </LabeledField>

                {/* 방문 일시 (VISIT 전용) */}
                {counselingType === 'VISIT' && (
                  <div className="grid grid-cols-2 gap-3">
                    <LabeledField label="방문 예정일" required>
                      <input
                        type="date"
                        value={scheduledDate}
                        onChange={(e) => {
                          setScheduledDate(e.target.value);
                          // 연/월/일을 모두 선택한 경우(=유효한 값) 자동으로 picker 닫기
                          if (e.target.value) {
                            e.target.blur();
                          }
                        }}
                        className="input-apple"
                      />
                    </LabeledField>
                    <LabeledField label="방문 시간" required>
                      <input
                        type="time"
                        value={scheduledTime}
                        onChange={(e) => {
                          setScheduledTime(e.target.value);
                          // HH:MM 형태로 완성된 순간 picker 를 닫아준다 (날짜 picker 와 동일 UX)
                          if (/^\d{1,2}:\d{2}$/.test(e.target.value)) {
                            e.target.blur();
                          }
                        }}
                        className="input-apple"
                      />
                    </LabeledField>
                  </div>
                )}

                {/* 담당 강사 */}
                <LabeledField
                  label="담당 강사"
                  hint={
                    activeClassroomTeacher?.name
                      ? `학생의 반 담당강사 ${activeClassroomTeacher.name} 선생님이 자동 선택됩니다.`
                      : '상담을 진행할 강사를 선택하세요 (선택)'
                  }
                >
                  <select
                    value={assignedTeacherId}
                    onChange={(e) => setAssignedTeacherId(e.target.value)}
                    className="input-apple"
                  >
                    <option value="">— 미지정 —</option>
                    {teachers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.role === 'ADMIN' ? '관리자' : '강사'})
                      </option>
                    ))}
                  </select>
                </LabeledField>

                {counselingSubmitError && <NotiBox tone="danger" message={counselingSubmitError} />}
                {counselingSubmitSuccess && <NotiBox tone="success" message={counselingSubmitSuccess} />}

                <button
                  type="submit"
                  disabled={counselingSubmitting}
                  onPointerDown={() => !counselingSubmitting && hapticMedium()}
                  className="press press-strong w-full min-h-[44px] mt-2 py-2.5 rounded-lg text-[13.5px] font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background:
                      counselingType === 'VISIT' ? 'var(--color-gold, #C99A3B)' : 'var(--color-accent)',
                    color: '#fff',
                  }}
                >
                  {counselingSubmitting
                    ? '등록 중...'
                    : counselingType === 'VISIT'
                      ? '방문상담 예약 등록'
                      : '전화상담 예약 등록'}
                </button>
              </form>
            </div>
          </div>

          {/* 최근 등록된 상담 예약 */}
          <div
            className="rounded-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--color-border)' }}
            >
              <div>
                <div className="text-eyebrow mb-0.5">PENDING · 최근</div>
                <h3 className="text-[15px] font-bold" style={{ color: 'var(--color-ink)' }}>
                  대기중인 상담 예약
                </h3>
              </div>
              <span className="text-[12px] font-semibold" style={{ color: 'var(--color-mute)' }}>
                {recentCounseling.length}건
              </span>
            </div>
            <div className="p-5">
              {recentCounseling.length === 0 ? (
                <p className="text-center text-[13px] py-6" style={{ color: 'var(--color-mute)' }}>
                  대기중인 상담 예약이 없습니다.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentCounseling.map((c) => {
                    const isVisit = c.counselingType === 'VISIT';
                    return (
                      <a
                        key={c.id}
                        href={`/counseling?id=${c.id}`}
                        onPointerDown={() => hapticLight()}
                        className="press press-subtle block rounded-lg p-3"
                        style={{
                          background: isVisit ? 'var(--color-gold-soft, #F7EDD5)' : 'var(--color-info-bg, #E8F1FB)',
                          border: `1px solid ${isVisit ? '#E8DBC2' : 'rgba(31,58,95,0.15)'}`,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              <span
                                className="text-[10.5px] px-2 py-0.5 rounded-full font-semibold"
                                style={{
                                  background: isVisit
                                    ? 'var(--color-gold, #C99A3B)'
                                    : 'var(--color-accent)',
                                  color: '#fff',
                                }}
                              >
                                {isVisit ? '🏢 방문상담' : '📞 전화상담'}
                              </span>
                              <span
                                className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                                style={{
                                  background: 'var(--color-warn-bg, #FDF3D6)',
                                  color: 'var(--color-warn, #C48A08)',
                                }}
                              >
                                대기중
                              </span>
                              <span className="text-[12px] font-semibold" style={{ color: 'var(--color-ink)' }}>
                                {c.student.name}
                              </span>
                            </div>
                            <p className="text-[13.5px] font-semibold truncate" style={{ color: 'var(--color-ink)' }}>
                              {c.title}
                            </p>
                            {isVisit && (c.scheduledDate || c.scheduledTime) && (
                              <p className="text-[12.5px] mt-1" style={{ color: 'var(--color-ink-2, #333)' }}>
                                📅 <b>{c.scheduledDate}</b> {c.scheduledTime && <>· <b>{c.scheduledTime}</b></>}
                              </p>
                            )}
                            {c.description && (
                              <p
                                className="text-[12px] mt-1 line-clamp-1"
                                style={{ color: 'var(--color-mute)' }}
                              >
                                {c.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[11px]" style={{ color: 'var(--color-mute-2, #888)' }}>
                              {new Date(c.createdAt).toLocaleDateString('ko-KR')}
                            </p>
                            {c.createdByName && (
                              <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-mute-2, #888)' }}>
                                입력: {c.createdByName}
                              </p>
                            )}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───── 받은 요청 ───── */}
      {activeTab === 'received' && (
        <div className="anim-tab-in space-y-6">
          <div
            className="rounded-lg"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h2
                className="text-[17px] font-bold"
                style={{ color: 'var(--color-ink)', letterSpacing: '-0.02em' }}
              >
                📨 대기 중인 요청 ({pendingReceived.length})
              </h2>
            </div>
            <div className="p-5">
              {pendingReceived.length === 0 ? (
                <p className="text-center text-[13px] py-8" style={{ color: 'var(--color-mute)' }}>
                  대기 중인 요청이 없습니다.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {pendingReceived.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg p-4"
                      style={{ background: 'var(--color-warn-bg, #FDF5DF)', border: '1px solid #E7D58E' }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span
                              className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                              style={{
                                background: 'var(--color-warn, #C48A08)',
                                color: '#fff',
                              }}
                            >
                              대기중
                            </span>
                            <h4 className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                              {req.title}
                            </h4>
                          </div>
                          {req.description && (
                            <p className="text-[13px] mb-1" style={{ color: 'var(--color-ink-2, #333)' }}>
                              {req.description}
                            </p>
                          )}
                          <p className="text-[11.5px]" style={{ color: 'var(--color-mute)' }}>
                            보낸 사람: {req.createdByName} · {formatDate(req.createdAt)}
                          </p>
                        </div>
                        <div className="flex gap-2 ml-2 shrink-0">
                          <button
                            onPointerDown={() => hapticLight()}
                            onClick={() => {
                              setSelectedRequest(req);
                              setResponseText('');
                            }}
                            className="press press-subtle px-3 py-1.5 text-[12.5px] font-semibold rounded-lg whitespace-nowrap"
                            style={{ background: 'var(--color-accent)', color: '#fff' }}
                          >
                            답장
                          </button>
                          <button
                            onPointerDown={() => hapticMedium()}
                            onClick={() => handleQuickComplete(req.id)}
                            className="press press-subtle px-3 py-1.5 text-[12.5px] font-semibold rounded-lg whitespace-nowrap"
                            style={{ background: 'var(--color-success, #0E8A3B)', color: '#fff' }}
                          >
                            확인
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {completedReceived.length > 0 && (
            <div
              className="rounded-lg"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <h2 className="text-[15px] font-bold" style={{ color: 'var(--color-mute)' }}>
                  완료된 요청 ({completedReceived.length})
                </h2>
              </div>
              <div className="p-5">
                <div className="space-y-2">
                  {completedReceived.map((req) => (
                    <div
                      key={req.id}
                      className="rounded-lg p-4 opacity-80"
                      style={{
                        background: 'var(--color-success-bg, #E5F4EA)',
                        border: '1px solid #C9E4D2',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                          style={{ background: 'var(--color-success, #0E8A3B)', color: '#fff' }}
                        >
                          완료
                        </span>
                        <h4
                          className="font-semibold line-through"
                          style={{ color: 'var(--color-ink-2, #333)' }}
                        >
                          {req.title}
                        </h4>
                      </div>
                      {req.response && (
                        <div
                          className="mt-2 p-2 rounded-md"
                          style={{ background: 'var(--color-surface)', border: '1px solid #D0E8D8' }}
                        >
                          <p className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
                            💬 {req.response}
                          </p>
                        </div>
                      )}
                      <p className="text-[11px] mt-1" style={{ color: 'var(--color-mute)' }}>
                        보낸 사람: {req.createdByName} · {formatDate(req.createdAt)}
                        {req.completedAt && ` · 완료: ${formatDate(req.completedAt)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ───── 보낸 요청 ───── */}
      {activeTab === 'sent' && (
        <div
          className="rounded-lg anim-tab-in"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <h2
              className="text-[17px] font-bold"
              style={{ color: 'var(--color-ink)', letterSpacing: '-0.02em' }}
            >
              📋 보낸 요청 목록
            </h2>
          </div>
          <div className="p-5">
            {loading ? (
              <p className="text-center text-[13px] py-8" style={{ color: 'var(--color-mute)' }}>
                로딩 중...
              </p>
            ) : sentRequests.length === 0 ? (
              <p className="text-center text-[13px] py-8" style={{ color: 'var(--color-mute)' }}>
                보낸 요청이 없습니다.
              </p>
            ) : (
              <div className="space-y-2">
                {sentRequests.map((task) => (
                  <div
                    key={task.id}
                    className="press press-subtle p-4 rounded-lg cursor-pointer"
                    style={{
                      background: task.isCompleted
                        ? 'var(--color-success-bg, #E5F4EA)'
                        : 'var(--color-warn-bg, #FDF5DF)',
                      border: `1px solid ${task.isCompleted ? '#C9E4D2' : '#E7D58E'}`,
                    }}
                    onPointerDown={() => hapticLight()}
                    onClick={() => setViewingRequest(task)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                            style={{
                              background: task.isCompleted
                                ? 'var(--color-success, #0E8A3B)'
                                : 'var(--color-warn, #C48A08)',
                              color: '#fff',
                            }}
                          >
                            {task.isCompleted ? '완료' : '대기중'}
                          </span>
                          <h4 className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                            {task.title}
                          </h4>
                        </div>
                        {task.description && (
                          <p
                            className="text-[13px] mb-1"
                            style={{ color: 'var(--color-ink-2, #333)' }}
                          >
                            {task.description}
                          </p>
                        )}
                        {task.isCompleted && task.response && (
                          <div
                            className="mt-2 p-2 rounded-md"
                            style={{ background: 'var(--color-surface)', border: '1px solid #D0E8D8' }}
                          >
                            <p className="text-[13px]" style={{ color: 'var(--color-ink-2)' }}>
                              💬 <b>{task.responseByName || task.targetUserName}</b>: {task.response}
                            </p>
                          </div>
                        )}
                        <p className="text-[11px] mt-1" style={{ color: 'var(--color-mute)' }}>
                          대상: {task.targetUserName || '-'} · {formatDate(task.createdAt)}
                        </p>
                      </div>
                      <button
                        aria-label="요청 삭제"
                        onPointerDown={() => hapticLight()}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(task.id);
                        }}
                        className="press ml-2 p-1.5 rounded-md shrink-0"
                        style={{ color: 'var(--color-mute-2, #888)' }}
                        title="삭제"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ───── 답장 모달 ───── */}
      {selectedRequest && (
        <ModalShell onClose={() => { setSelectedRequest(null); setResponseText(''); }}>
          <h3 className="text-[16px] font-bold mb-4" style={{ color: 'var(--color-ink)' }}>
            요청 답장
          </h3>
          <div
            className="rounded-lg p-4 mb-4"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
          >
            <p className="text-[11.5px] mb-1" style={{ color: 'var(--color-mute)' }}>
              보낸 사람: {selectedRequest.createdByName} · {formatDate(selectedRequest.createdAt)}
            </p>
            <h4 className="font-semibold mb-1" style={{ color: 'var(--color-ink)' }}>
              {selectedRequest.title}
            </h4>
            {selectedRequest.description && (
              <p className="text-[13px]" style={{ color: 'var(--color-ink-2, #333)' }}>
                {selectedRequest.description}
              </p>
            )}
          </div>
          <LabeledField label="답장 내용">
            <textarea
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              rows={4}
              placeholder="답장 내용을 입력하세요..."
              className="input-apple resize-none"
            />
          </LabeledField>
          <div className="flex gap-2 mt-4">
            <button
              onPointerDown={() => hapticMedium()}
              onClick={handleRespond}
              disabled={responding || !responseText.trim()}
              className="press press-strong flex-1 min-h-[44px] py-2.5 rounded-lg text-[13.5px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'var(--color-accent)', color: '#fff' }}
            >
              {responding ? '전송 중...' : '답장 보내고 완료'}
            </button>
            <button
              onPointerDown={() => hapticMedium()}
              onClick={() =>
                handleQuickComplete(selectedRequest.id).then(() => {
                  setSelectedRequest(null);
                  setResponseText('');
                })
              }
              className="press min-h-[44px] px-4 py-2.5 rounded-lg text-[13px] font-semibold"
              style={{ background: 'var(--color-success, #0E8A3B)', color: '#fff' }}
            >
              바로 완료
            </button>
          </div>
        </ModalShell>
      )}

      {/* ───── 보낸 요청 상세 모달 ───── */}
      {viewingRequest && (
        <ModalShell onClose={() => setViewingRequest(null)}>
          <h3 className="text-[16px] font-bold mb-4" style={{ color: 'var(--color-ink)' }}>
            요청 상세
          </h3>
          <div className="space-y-3">
            <div>
              <span
                className="text-[11px] px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: viewingRequest.isCompleted
                    ? 'var(--color-success, #0E8A3B)'
                    : 'var(--color-warn, #C48A08)',
                  color: '#fff',
                }}
              >
                {viewingRequest.isCompleted ? '완료' : '대기중'}
              </span>
            </div>
            <div
              className="rounded-lg p-4"
              style={{ background: 'var(--color-info-bg, #E8F1FB)', border: '1px solid rgba(31,58,95,0.15)' }}
            >
              <p className="text-[11.5px] mb-1" style={{ color: 'var(--color-mute)' }}>
                내가 보낸 요청
              </p>
              <h4 className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                {viewingRequest.title}
              </h4>
              {viewingRequest.description && (
                <p className="text-[13px] mt-1" style={{ color: 'var(--color-ink-2, #333)' }}>
                  {viewingRequest.description}
                </p>
              )}
              <p className="text-[11.5px] mt-2" style={{ color: 'var(--color-mute)' }}>
                대상: {viewingRequest.targetUserName} · {formatDate(viewingRequest.createdAt)}
              </p>
            </div>
            {viewingRequest.isCompleted && (
              <div
                className="rounded-lg p-4"
                style={{ background: 'var(--color-success-bg, #E5F4EA)', border: '1px solid #C9E4D2' }}
              >
                <p className="text-[11.5px] mb-1" style={{ color: 'var(--color-mute)' }}>
                  💬 {viewingRequest.responseByName || viewingRequest.targetUserName}의 답장
                </p>
                <p className="text-[13px]" style={{ color: 'var(--color-ink)' }}>
                  {viewingRequest.response || '(답장 없이 완료됨)'}
                </p>
                {viewingRequest.completedAt && (
                  <p className="text-[11.5px] mt-2" style={{ color: 'var(--color-mute)' }}>
                    완료: {formatDate(viewingRequest.completedAt)}
                  </p>
                )}
              </div>
            )}
          </div>
          <button
            onPointerDown={() => hapticLight()}
            onClick={() => setViewingRequest(null)}
            className="press w-full mt-4 min-h-[44px] px-4 py-2.5 rounded-lg text-[13.5px] font-semibold"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-ink-2, #333)',
              border: '1px solid var(--color-border)',
            }}
          >
            닫기
          </button>
        </ModalShell>
      )}

      {/* 공용 애플 스타일 input 스타일 */}
      <style jsx global>{`
        .input-apple {
          width: 100%;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--color-border, #E2E2E2);
          background: var(--color-surface, #fff);
          color: var(--color-ink, #0E0E0C);
          font-size: 13.5px;
          transition:
            border-color 0.12s var(--ease-apple, cubic-bezier(0.4, 0.0, 0.2, 1)),
            box-shadow 0.12s var(--ease-apple, cubic-bezier(0.4, 0.0, 0.2, 1));
        }
        .input-apple:focus-visible {
          outline: none;
          border-color: var(--color-accent, #1F3A5F);
          box-shadow: 0 0 0 3px rgba(31, 58, 95, 0.15);
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────
 * 작은 보조 컴포넌트 (같은 파일에 유지)
 * ────────────────────────────── */
function LabeledField({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3.5">
      <label
        className="block text-[12.5px] font-semibold mb-1.5"
        style={{ color: 'var(--color-ink-2, #333)', letterSpacing: '-0.01em' }}
      >
        {label} {required && <span style={{ color: 'var(--color-danger, #C3392B)' }}>*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[11.5px] mt-1" style={{ color: 'var(--color-mute)' }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function NotiBox({ tone, message }: { tone: 'danger' | 'success'; message: string }) {
  const bg =
    tone === 'danger' ? 'var(--color-danger-bg, #FCEAE6)' : 'var(--color-success-bg, #E5F4EA)';
  const fg = tone === 'danger' ? 'var(--color-danger, #C3392B)' : 'var(--color-success, #0E8A3B)';
  return (
    <div
      className="mb-3 p-2.5 rounded-lg text-[12.5px] anim-pop-in"
      style={{ background: bg, color: fg, border: `1px solid ${fg}33` }}
    >
      {message}
    </div>
  );
}

function ModalShell({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(14,14,12,0.5)' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-2xl max-w-lg w-full anim-sheet-up"
        style={{ background: 'var(--color-surface, #fff)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 sm:p-6">
          <div className="flex justify-end -mt-2 -mr-2 mb-1">
            <button
              aria-label="닫기"
              onClick={onClose}
              className="press w-11 h-11 rounded-full flex items-center justify-center"
              style={{ color: 'var(--color-mute)' }}
            >
              <span aria-hidden="true" className="text-xl">✕</span>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
