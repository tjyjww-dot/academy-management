// User Roles
export const ROLES = {
  ADMIN: '관리자',
  TEACHER: '강사',
  PARENT: '학부모',
} as const;

// Student Status
export const STUDENT_STATUS = {
  ACTIVE: '재원',
  GRADUATED: '수료',
  WITHDRAWN: '퇴원',
} as const;

// Attendance Status
export const ATTENDANCE_STATUS = {
  PRESENT: '출석',
  ABSENT: '결석',
  LATE: '지각',
  EARLY_LEAVE: '조퇴',
  EXCUSED: '사유결석',
} as const;

// Counseling Status
export const COUNSELING_STATUS = {
  PENDING: '대기중',
  CONFIRMED: '확정',
  COMPLETED: '완료',
  CANCELLED: '취소',
} as const;

// Sidebar Menu Items
export const SIDEBAR_MENU = [
  {
    label: '대시보드',
    href: '/admin/dashboard',
    icon: 'dashboard',
  },
  {
    label: '학생 관리',
    href: '/admin/students',
    icon: 'students',
  },
  {
    label: '반 관리',
    href: '/admin/classes',
    icon: 'classes',
  },
  {
    label: '성적 관리',
    href: '/admin/grades',
    icon: 'grades',
  },
  {
    label: '출석 관리',
    href: '/admin/attendance',
    icon: 'attendance',
  },
  {
    label: '과제 관리',
    href: '/admin/assignments',
    icon: 'assignments',
  },
  {
    label: '상담 관리',
    href: '/admin/counseling',
    icon: 'counseling',
  },
  {
    label: '알림',
    href: '/admin/notifications',
    icon: 'notifications',
  },
] as const;
