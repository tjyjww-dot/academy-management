/**
 * Haptic Feedback · 애플 감성의 미세 진동 유틸리티
 * Web Vibration API 기반 (Android/Chrome 지원; iOS Safari는 미지원이므로 graceful-fallback)
 *
 * 사용 원칙
 *  - 탭 전환 / 토글 / 선택: hapticSelection()  (가장 미세)
 *  - 기본 버튼 · 카드 · Pill 클릭: hapticLight()  (짧고 부드러운 탭)
 *  - 중요한 액션 (제출 · 저장 · 확인): hapticMedium()
 *  - 파괴적 액션 (삭제 · 에러): hapticHeavy()
 *  - 성공 알림: hapticSuccess()
 *  - 실패/경고 알림: hapticWarn()
 *
 * 모든 함수는 silently no-op하며 예외를 던지지 않습니다.
 */

type VibratePattern = number | number[];

function safeVibrate(pattern: VibratePattern): void {
  if (typeof window === 'undefined') return;
  const nav = window.navigator as Navigator & { vibrate?: (p: VibratePattern) => boolean };
  if (!nav || typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(pattern);
  } catch {
    // no-op
  }
}

/** 탭/토글/세그먼트 선택 — 눈치챌 듯 말 듯한 짧은 틱 (≈ UISelectionFeedback) */
export function hapticSelection() {
  safeVibrate(6);
}

/** 일반 버튼/카드/Pill 탭 — 애플 light impact 느낌 */
export function hapticLight() {
  safeVibrate(10);
}

/** 제출/저장/확인 — medium impact */
export function hapticMedium() {
  safeVibrate(18);
}

/** 삭제/에러/파괴적 — heavy impact */
export function hapticHeavy() {
  safeVibrate(28);
}

/** 성공 알림 (double-tap) */
export function hapticSuccess() {
  safeVibrate([10, 40, 14]);
}

/** 경고 알림 (triple-tap) */
export function hapticWarn() {
  safeVibrate([12, 60, 12, 60, 18]);
}

/**
 * 통합 디스패처 — 컴포넌트에서 프롭으로 받아 쓰기 편하도록.
 *   <Button haptic="medium" ... />
 */
export type HapticKind = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warn' | 'none';

export function triggerHaptic(kind: HapticKind = 'light') {
  switch (kind) {
    case 'none':      return;
    case 'selection': return hapticSelection();
    case 'light':     return hapticLight();
    case 'medium':    return hapticMedium();
    case 'heavy':     return hapticHeavy();
    case 'success':   return hapticSuccess();
    case 'warn':      return hapticWarn();
  }
}
