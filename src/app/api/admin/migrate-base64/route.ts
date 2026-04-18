import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, getTokenFromCookies } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  getAccessToken,
  ensureFolderPath,
  uploadFile,
} from '@/lib/googleDrive';

/**
 * POST /api/admin/migrate-base64
 * 관리자 전용 · DB 에 저장된 레거시 base64 data URL 이미지를 Google Drive 로 옮긴다.
 *
 * Body (JSON):
 *   {
 *     limit?: number       // 한 번에 처리할 최대 건수. 기본 20, 최대 50.
 *     dryRun?: boolean     // true 면 스캔만 하고 실제 업로드/DB 업데이트 안 함.
 *     skipPaperPages?: boolean
 *     skipWrongAnswer?: boolean
 *   }
 *
 * Response:
 *   {
 *     ok: true,
 *     processed: number,
 *     successful: number,
 *     failed: number,
 *     totalBytes: number,
 *     remainingPaperPages: number,
 *     remainingWrongAnswers: number,
 *     log: Array<{ model, id, column, driveUrl?, error?, sizeBytes }>
 *   }
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

type LogEntry = {
  model: 'TestPaperPage' | 'WrongAnswer';
  id: string;
  column: 'imageUrl' | 'answerImageUrl' | 'problemImage';
  driveId?: string;
  driveUrl?: string;
  sizeBytes: number;
  error?: string;
};

function decodeDataUrl(
  dataUrl: string
): { mimeType: string; ext: string; buffer: Buffer } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mimeType = m[1] || 'image/png';
  const buffer = Buffer.from(m[2], 'base64');
  const ext = mimeType.split('/')[1] || 'png';
  return { mimeType, ext, buffer };
}

export async function POST(request: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────
  const token = getTokenFromCookies(request);
  if (!token)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const decoded = verifyToken(token);
  if (!decoded || decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Parse options ───────────────────────────────────────────────
  let body: {
    limit?: number;
    dryRun?: boolean;
    skipPaperPages?: boolean;
    skipWrongAnswer?: boolean;
  } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const limit = Math.min(Math.max(body.limit ?? 20, 1), 50);
  const dryRun = !!body.dryRun;
  const skipPaperPages = !!body.skipPaperPages;
  const skipWrongAnswer = !!body.skipWrongAnswer;

  const log: LogEntry[] = [];
  let totalBytes = 0;
  let processed = 0;

  // ── Drive auth (skip if dry-run) ────────────────────────────────
  let accessToken = '';
  let folderId: string | undefined;
  if (!dryRun) {
    try {
      accessToken = await getAccessToken();
    } catch (e: any) {
      return NextResponse.json(
        {
          error:
            'Drive 인증 실패: ' +
            (e?.message || 'unknown') +
            ' — /drive-settings 에서 Google 계정을 연결해 주세요.',
        },
        { status: 500 }
      );
    }
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    folderId = await ensureFolderPath(
      accessToken,
      ['수탐학원', '시험지', '_migrated'],
      rootFolderId
    );
  }

  const shouldStop = () => processed >= limit;

  // ── 1) TestPaperPage (imageUrl, answerImageUrl) ─────────────────
  if (!skipPaperPages) {
    // limit 건만 필요하므로 DB 에서도 prefix 필터 + take 로 최소만 가져옴
    // (Prisma 는 startsWith 지원. Postgres 인덱스 없어도 수천건 수준은 OK)
    const pages = await prisma.testPaperPage.findMany({
      where: {
        OR: [
          { imageUrl: { startsWith: 'data:' } },
          { answerImageUrl: { startsWith: 'data:' } },
        ],
      },
      select: { id: true, imageUrl: true, answerImageUrl: true },
      take: limit * 2, // 한 행에 2컬럼일 수 있으니 여유있게
    });

    for (const pg of pages) {
      if (shouldStop()) break;
      for (const col of ['imageUrl', 'answerImageUrl'] as const) {
        if (shouldStop()) break;
        const v = (pg as any)[col] as string | null;
        if (!v || !v.startsWith('data:')) continue;

        const decoded = decodeDataUrl(v);
        if (!decoded) {
          log.push({
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            sizeBytes: v.length,
            error: 'invalid-data-url',
          });
          continue;
        }
        totalBytes += decoded.buffer.length;

        if (dryRun) {
          log.push({
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            sizeBytes: decoded.buffer.length,
          });
          processed++;
          continue;
        }

        try {
          const fileName = `${Date.now()}-migrated-page-${pg.id}-${col}.${decoded.ext}`;
          const upl = await uploadFile(
            accessToken,
            fileName,
            decoded.buffer,
            decoded.mimeType,
            folderId
          );
          await prisma.testPaperPage.update({
            where: { id: pg.id },
            data: { [col]: upl.url } as any,
          });
          log.push({
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            driveId: upl.id,
            driveUrl: upl.url,
            sizeBytes: decoded.buffer.length,
          });
          processed++;
        } catch (e: any) {
          log.push({
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            sizeBytes: decoded.buffer.length,
            error: String(e?.message || e),
          });
        }
      }
    }
  }

  // ── 2) WrongAnswer.problemImage ─────────────────────────────────
  if (!skipWrongAnswer && !shouldStop()) {
    const answers = await prisma.wrongAnswer.findMany({
      where: { problemImage: { startsWith: 'data:' } },
      select: { id: true, problemImage: true },
      take: limit - processed,
    });

    for (const wa of answers) {
      if (shouldStop()) break;
      const v = wa.problemImage as string | null;
      if (!v || !v.startsWith('data:')) continue;
      const decoded = decodeDataUrl(v);
      if (!decoded) {
        log.push({
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          sizeBytes: v.length,
          error: 'invalid-data-url',
        });
        continue;
      }
      totalBytes += decoded.buffer.length;

      if (dryRun) {
        log.push({
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          sizeBytes: decoded.buffer.length,
        });
        processed++;
        continue;
      }

      try {
        const fileName = `${Date.now()}-migrated-wa-${wa.id}.${decoded.ext}`;
        const upl = await uploadFile(
          accessToken,
          fileName,
          decoded.buffer,
          decoded.mimeType,
          folderId
        );
        await prisma.wrongAnswer.update({
          where: { id: wa.id },
          data: { problemImage: upl.url },
        });
        log.push({
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          driveId: upl.id,
          driveUrl: upl.url,
          sizeBytes: decoded.buffer.length,
        });
        processed++;
      } catch (e: any) {
        log.push({
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          sizeBytes: decoded.buffer.length,
          error: String(e?.message || e),
        });
      }
    }
  }

  // ── 남은 건수 집계 ──────────────────────────────────────────────
  const [remainingPaperPages, remainingWrongAnswers] = await Promise.all([
    prisma.testPaperPage.count({
      where: {
        OR: [
          { imageUrl: { startsWith: 'data:' } },
          { answerImageUrl: { startsWith: 'data:' } },
        ],
      },
    }),
    prisma.wrongAnswer.count({
      where: { problemImage: { startsWith: 'data:' } },
    }),
  ]);

  const successful = log.filter((e) => e.driveUrl).length;
  const failed = log.filter((e) => e.error).length;

  return NextResponse.json({
    ok: true,
    dryRun,
    processed,
    successful,
    failed,
    totalBytes,
    totalMB: +(totalBytes / 1024 / 1024).toFixed(2),
    remainingPaperPages,
    remainingWrongAnswers,
    log,
  });
}
