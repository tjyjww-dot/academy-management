# 수학탐구 학원 - 웹 ↔ 모바일 API 연동 보고서

**작업일**: 2026년 2월 26일

---

## 작업 개요

웹 관리 시스템(academy-management)과 모바일 앱(academy-mobile)을 연동하기 위해 모바일 전용 API 엔드포인트를 생성하고, 인증 시스템을 통합했습니다.

---

## 수정/생성된 파일 목록

### 웹 관리 시스템 (academy-management)

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/lib/mobile-auth.ts` | **신규** | 모바일 Bearer 토큰 인증 헬퍼 |
| `src/app/api/auth/login/route.ts` | **수정** | 모바일 앱에 토큰을 body로 반환 + CORS 지원 |
| `src/app/api/auth/me/route.ts` | **수정** | Bearer 토큰 인증 지원 추가 |
| `src/middleware.ts` | **수정** | /api/mobile 경로 허용 + CORS 헤더 |
| `next.config.ts` | **수정** | Turbopack 빌드 설정 |
| `src/app/api/mobile/children/route.ts` | **신규** | 학부모 자녀 목록 API |
| `src/app/api/mobile/dashboard/route.ts` | **신규** | 학생 대시보드 API |
| `src/app/api/mobile/student/[id]/grades/route.ts` | **신규** | 학생 성적 조회 API |
| `src/app/api/mobile/student/[id]/attendance/route.ts` | **신규** | 학생 출결 조회 API |
| `src/app/api/mobile/student/[id]/assignments/route.ts` | **신규** | 학생 과제 조회 API |
| `src/app/api/mobile/announcements/route.ts` | **신규** | 공지사항 조회 API |
| `src/app/api/mobile/counseling/route.ts` | **신규** | 상담 조회/신청 API |

### 모바일 앱 (academy-mobile)

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/services/api.ts` | **수정** | X-Client-Type: mobile 헤더 추가 |

---

## API 엔드포인트 상세

### 인증 (기존 API 확장)

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | `/api/auth/login` | 로그인 (모바일: token을 body에 포함) | - |
| GET | `/api/auth/me` | 내 정보 조회 (Bearer 토큰 지원) | Bearer |

### 모바일 전용 API (신규)

| Method | 경로 | 설명 | 인증 |
|--------|------|------|------|
| GET | `/api/mobile/children` | 학부모의 자녀 목록 | Bearer |
| GET | `/api/mobile/dashboard?studentId=xxx` | 학생 대시보드 (성적, 출결, 과제, 공지) | Bearer |
| GET | `/api/mobile/student/:id/grades` | 학생 성적 목록 (classroomId 필터 가능) | Bearer |
| GET | `/api/mobile/student/:id/attendance` | 학생 출결 기록 (month 필터 가능) | Bearer |
| GET | `/api/mobile/student/:id/assignments` | 학생 과제 목록 + 제출 현황 | Bearer |
| GET | `/api/mobile/announcements` | 공지사항 목록 (학부모/학생용) | Bearer |
| GET | `/api/mobile/counseling` | 상담 요청 목록 | Bearer |
| POST | `/api/mobile/counseling` | 상담 신청 | Bearer |

---

## 인증 흐름

```
[모바일 앱]                           [웹 서버]
    |                                     |
    |-- POST /api/auth/login ------------>|
    |   (email, password)                 |
    |   Header: X-Client-Type: mobile     |
    |                                     |
    |<-- { token, user } ----------------|
    |                                     |
    |-- GET /api/mobile/children -------->|
    |   Header: Authorization: Bearer xxx |
    |                                     |
    |<-- [{ id, name, classrooms }] ------|
```

---

## 모바일 앱 ↔ API 매핑

| 모바일 앱 화면 | API 호출 | 상태 |
|---------------|---------|------|
| 홈 (대시보드) | `/api/mobile/dashboard` | ✅ 연동 완료 |
| 출결 | `/api/mobile/student/:id/attendance` | ✅ 연동 완료 |
| 성적 | `/api/mobile/student/:id/grades` | ✅ 연동 완료 |
| 공지사항 | `/api/mobile/announcements` | ✅ 연동 완료 |
| 과제 | `/api/mobile/student/:id/assignments` | ✅ 연동 완료 |
| 상담 | `/api/mobile/counseling` | ✅ 연동 완료 |
| 로그인 | `/api/auth/login` | ✅ 연동 완료 |
| 프로필 | `/api/auth/me` | ✅ 연동 완료 |

---

## 다음 단계

1. **Vercel 재배포** - 웹 관리 시스템을 Vercel에 다시 배포하면 모바일 앱이 실서버와 연동됩니다
2. **테스트 데이터** - Seed API(`/api/seed`)를 호출하여 테스트용 학부모/학생 계정 생성
3. **모바일 앱 빌드** - `npm start`로 Expo 개발 서버 실행 후 실제 기기에서 테스트
4. **푸시 알림** - Expo Notifications를 활용한 실시간 알림 구현 (Phase 2)
