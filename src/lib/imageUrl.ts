/**
 * 이미지 URL을 <img src> 에 바로 넣어도 안정적으로 로드되도록 정규화.
 *
 * - Google Drive "uc?export=view" / "thumbnail?id=" 형식은 CORS/로그인 리다이렉트
 *   문제로 브라우저에서 빈칸으로 뜨는 경우가 많으므로 서버 proxy 로 치환.
 * - base64 data URL, http(s) 일반 URL, 상대 경로는 그대로 반환.
 *
 * 사용처: PDF/프린트 HTML 생성, on-screen <img>, 학부모 앱 등
 */

const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com'];

function isDriveUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:')) return false;
  try {
    const u = new URL(url);
    return DRIVE_HOSTS.includes(u.host);
  } catch {
    return false;
  }
}

/**
 * URL 문자열에서 Google Drive file id 를 추출.
 * src/lib/googleDrive.ts 의 extractFileId 와 동일 로직이지만,
 * 클라이언트 번들에 googleDrive.ts(서버 전용) 를 끌어오지 않으려고 별도 정의.
 */
export function extractDriveFileIdClient(url: string): string | null {
  if (!url) return null;
  // https://drive.google.com/uc?export=view&id=FILE_ID
  // https://drive.google.com/thumbnail?id=FILE_ID
  const m1 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // https://drive.google.com/file/d/FILE_ID/view
  const m2 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

/**
 * 이미지 URL 을 안전하게 변환한다.
 *
 *   data:image/...           → 그대로
 *   /api/...                 → 그대로
 *   https://drive.google.com → /api/drive-image?id=FILE_ID
 *   기타                      → 그대로
 */
export function toRenderableImageSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:')) return url;
  if (!isDriveUrl(url)) return url;
  const id = extractDriveFileIdClient(url);
  if (!id) return url;
  return `/api/drive-image?id=${encodeURIComponent(id)}`;
}
