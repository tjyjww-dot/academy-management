/**
 * base64 → Google Drive 이관 공용 로직
 *
 * - 관리자 수동 이관 (/api/admin/migrate-base64)
 * - 매일 새벽 3시 크론 자동 이관 (/api/cron/auto-migrate-base64)
 *
 * 두 엔드포인트가 동일한 로직을 공유하도록 여기로 추출.
 */

import { prisma } from './prisma';
import { getAccessToken, ensureFolderPath, uploadFile } from './googleDrive';

export type MigrateBatchOptions = {
  /** 한 번에 처리할 최대 건수. 기본 20, 최대 50. */
  limit?: number;
  /** true 면 스캔만 하고 실제 업로드/DB 업데이트 안 함. */
  dryRun?: boolean;
  skipPaperPages?: boolean;
  skipWrongAnswer?: boolean;
  /** 기본 45초. 크론에서 더 짧게 조정 가능. */
  timeBudgetMs?: number;
};

export type MigrateBatchLogEntry = {
  model: 'TestPaperPage' | 'WrongAnswer';
  id: string;
  column: 'imageUrl' | 'answerImageUrl' | 'problemImage';
  driveId?: string;
  driveUrl?: string;
  sizeBytes: number;
  error?: string;
};

export type MigrateBatchResult = {
  ok: true;
  dryRun: boolean;
  processed: number;
  successful: number;
  failed: number;
  totalBytes: number;
  totalMB: number;
  remainingPaperPages: number;
  remainingWrongAnswers: number;
  timeBudgetExceeded: boolean;
  elapsedMs: number;
  log: MigrateBatchLogEntry[];
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

/**
 * base64 이미지 한 배치를 Drive 로 이관.
 * - limit 건수만큼 처리하거나 시간 예산 초과 시 조기 종료.
 * - 실패해도 원본 DB 는 그대로 보존됨 (UPDATE 는 성공한 건만).
 */
export async function runMigrationBatch(
  opts: MigrateBatchOptions = {}
): Promise<MigrateBatchResult> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const dryRun = !!opts.dryRun;
  const skipPaperPages = !!opts.skipPaperPages;
  const skipWrongAnswer = !!opts.skipWrongAnswer;
  const TIME_BUDGET_MS = opts.timeBudgetMs ?? 45_000;

  const log: MigrateBatchLogEntry[] = [];
  let totalBytes = 0;
  let processed = 0;
  let timeBudgetExceeded = false;

  const startedAt = Date.now();
  const overBudget = () => Date.now() - startedAt > TIME_BUDGET_MS;

  // Drive 인증 (dry-run 이면 스킵)
  let accessToken = '';
  let folderId: string | undefined;
  if (!dryRun) {
    accessToken = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    folderId = await ensureFolderPath(
      accessToken,
      ['수탐학원', '시험지', '_migrated'],
      rootFolderId
    );
  }

  const shouldStop = () => {
    if (processed >= limit) return true;
    if (overBudget()) {
      timeBudgetExceeded = true;
      return true;
    }
    return false;
  };

  // ── 1) TestPaperPage (imageUrl, answerImageUrl) ─────────────────
  if (!skipPaperPages) {
    const pages = await prisma.testPaperPage.findMany({
      where: {
        OR: [
          { imageUrl: { startsWith: 'data:' } },
          { answerImageUrl: { startsWith: 'data:' } },
        ],
      },
      select: { id: true, imageUrl: true, answerImageUrl: true },
      take: limit * 2,
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
      take: Math.max(1, limit - processed),
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

  return {
    ok: true,
    dryRun,
    processed,
    successful,
    failed,
    totalBytes,
    totalMB: +(totalBytes / 1024 / 1024).toFixed(2),
    remainingPaperPages,
    remainingWrongAnswers,
    timeBudgetExceeded,
    elapsedMs: Date.now() - startedAt,
    log,
  };
}
