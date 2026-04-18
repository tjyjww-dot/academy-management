/**
 * GET /api/drive-image?id=FILE_ID
 * GET /api/drive-image?url=<전체 Drive URL>
 *
 * Google Drive 파일 ID 를 받아서 서버의 OAuth access_token 으로
 * 직접 파일 바이너리를 내려받아 <img> 에 그대로 사용할 수 있는
 * 이미지 스트림으로 리턴.
 *
 * 왜 proxy가 필요한가:
 *   - drive.google.com/uc?export=view&id=... 직접 링크는
 *     브라우저 <img src> 에서 CORS / virus-scan / login redirect 로
 *     바이너리 대신 HTML 을 돌려주기 때문에 이미지가 빈칸으로 표시됨.
 *   - 이 라우트는 /api/... 로 same-origin 요청이라 CORS 없음,
 *     서버가 Drive API(drive.files.get?alt=media) 로 직접 받아 그대로 내려줌.
 *
 * 성능:
 *   - `Cache-Control: public, max-age=31536000, immutable` 로 브라우저/CDN 이 캐시.
 *   - 이미지 내용은 file-id 기준 immutable 이므로 1년 캐시 OK.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getAccessToken, extractFileId } from '@/lib/googleDrive';

export const runtime = 'nodejs';

// 간단한 in-memory LRU: 같은 파일 id를 짧은 시간 내에 반복 요청하는 경우
// Drive API 호출을 줄이기 위함. Lambda 재시작 시 비워짐.
type CacheEntry = { buffer: Buffer; contentType: string; ts: number };
const MEMO: Map<string, CacheEntry> = new Map();
const MEMO_MAX = 50; // 파일 약 1~2MB, 최대 100MB 정도 사용
const MEMO_TTL_MS = 10 * 60 * 1000; // 10분

function memoGet(key: string): CacheEntry | null {
  const hit = MEMO.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > MEMO_TTL_MS) {
    MEMO.delete(key);
    return null;
  }
  // LRU 갱신
  MEMO.delete(key);
  MEMO.set(key, hit);
  return hit;
}

function memoSet(key: string, entry: CacheEntry) {
  if (MEMO.size >= MEMO_MAX) {
    const oldestKey = MEMO.keys().next().value;
    if (oldestKey) MEMO.delete(oldestKey);
  }
  MEMO.set(key, entry);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  let fileId = searchParams.get('id') || '';
  const urlParam = searchParams.get('url');

  if (!fileId && urlParam) {
    const extracted = extractFileId(urlParam);
    if (extracted) fileId = extracted;
  }

  if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
    return NextResponse.json(
      { error: 'Invalid or missing file id' },
      { status: 400 }
    );
  }

  // Memory cache
  const cached = memoGet(fileId);
  if (cached) {
    return new NextResponse(cached.buffer, {
      status: 200,
      headers: {
        'Content-Type': cached.contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Drive-Image-Cache': 'HIT',
      },
    });
  }

  try {
    const accessToken = await getAccessToken();

    const driveRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!driveRes.ok) {
      const errText = await driveRes.text().catch(() => '');
      return NextResponse.json(
        {
          error: 'Drive fetch failed',
          status: driveRes.status,
          detail: errText.slice(0, 500),
        },
        { status: driveRes.status === 404 ? 404 : 502 }
      );
    }

    const contentType =
      driveRes.headers.get('content-type') || 'application/octet-stream';
    const arr = await driveRes.arrayBuffer();
    const buffer = Buffer.from(arr);

    // 이미지 형식만 캐시 (다른 것은 오류일 가능성)
    if (contentType.startsWith('image/')) {
      memoSet(fileId, { buffer, contentType, ts: Date.now() });
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'X-Drive-Image-Cache': 'MISS',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'proxy error', detail: String(e?.message || e) },
      { status: 500 }
    );
  }
}
