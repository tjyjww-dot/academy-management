/**
 * migrate-base64-to-drive.ts
 * ----------------------------------------------------------------------------
 * DB에 저장된 레거시 base64 data URL 이미지를 Google Drive로 옮기고
 * imageUrl / answerImageUrl / problemImage 컬럼을 Drive 링크로 치환한다.
 *
 * [배경]
 *   - 구버전 /api/test-papers POST 핸들러가 Drive 업로드 실패 시
 *     "data:image/png;base64,..." 를 그대로 TestPaperPage.imageUrl,
 *     TestPaperPage.answerImageUrl, WrongAnswer.problemImage 에 저장했다.
 *   - 학부모 앱이 wrongAnswers 를 매번 불러오면서 수백 MB 규모의 egress 가
 *     발생해 Neon 의 월 전송량을 소진시켰다.
 *
 * [동작]
 *   1) TestPaperPage.imageUrl / answerImageUrl 를 data: URL 기준으로 스캔
 *   2) WrongAnswer.problemImage 도 동일하게 스캔
 *   3) 각 base64 를 Buffer 로 디코드 → Google Drive 업로드
 *   4) 반환된 Drive URL 로 DB 컬럼 교체
 *   5) 처리 내역을 migration-log-<timestamp>.json 으로 기록 (재개/롤백 용)
 *
 * [플래그]
 *   --dry-run           실제 쓰기 없이 얼마나 있는지만 보고
 *   --resume <로그파일> 이전 실행 로그를 읽어 이미 처리한 건 건너뜀
 *   --limit <N>         최대 N개만 처리 (기본: 제한 없음)
 *   --skip-paper-pages  TestPaperPage 는 건너뜀
 *   --skip-wrong-answer WrongAnswer 는 건너뜀
 *   --verbose           매 항목 로그 출력
 *
 * [실행]
 *   npx tsx scripts/migrate-base64-to-drive.ts --dry-run
 *   npx tsx scripts/migrate-base64-to-drive.ts --limit 50 --verbose
 *   npx tsx scripts/migrate-base64-to-drive.ts --resume scripts/migration-log-20260418.json
 *
 * [주의]
 *   - 프로덕션에서는 반드시 dry-run 먼저 실행해 건수를 확인할 것.
 *   - Drive 업로드가 일시적으로 실패하면 재시도 로그에 기록되고 다음 실행에서
 *     --resume 으로 이어받을 수 있다.
 *   - DB 쓰기 전 image_id (drive.id) 와 원본 컬럼명을 로그에 남기므로
 *     수동 롤백도 가능.
 * ----------------------------------------------------------------------------
 */

import { PrismaClient } from '@prisma/client';
import { uploadFile, getAccessToken, ensureFolderPath } from '../src/lib/googleDrive';
import * as fs from 'fs';
import * as path from 'path';

type LogEntry = {
  ts: string;
  model: 'TestPaperPage' | 'WrongAnswer';
  id: string;
  column: 'imageUrl' | 'answerImageUrl' | 'problemImage';
  driveId?: string;
  driveUrl?: string;
  sizeBytes: number;
  error?: string;
};

interface Options {
  dryRun: boolean;
  resume: string | null;
  limit: number | null;
  skipPaperPages: boolean;
  skipWrongAnswer: boolean;
  verbose: boolean;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = {
    dryRun: false,
    resume: null,
    limit: null,
    skipPaperPages: false,
    skipWrongAnswer: false,
    verbose: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--verbose') opts.verbose = true;
    else if (a === '--skip-paper-pages') opts.skipPaperPages = true;
    else if (a === '--skip-wrong-answer') opts.skipWrongAnswer = true;
    else if (a === '--resume') opts.resume = argv[++i];
    else if (a === '--limit') opts.limit = parseInt(argv[++i], 10);
  }
  return opts;
}

const prisma = new PrismaClient();

function decodeDataUrl(
  dataUrl: string
): { mimeType: string; ext: string; buffer: Buffer } | null {
  // "data:image/png;base64,...." 형태
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  const mimeType = m[1] || 'image/png';
  const buffer = Buffer.from(m[2], 'base64');
  const ext = mimeType.split('/')[1] || 'png';
  return { mimeType, ext, buffer };
}

async function uploadDecoded(
  accessToken: string,
  folderId: string,
  label: string,
  decoded: { mimeType: string; ext: string; buffer: Buffer }
) {
  const fileName = `${Date.now()}-migrated-${label}.${decoded.ext}`;
  const result = await uploadFile(
    accessToken,
    fileName,
    decoded.buffer,
    decoded.mimeType,
    folderId
  );
  return result;
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log('== Base64 → Drive 마이그레이션 ==');
  console.log('옵션:', opts);

  // 이전 로그 읽기 (재개 모드)
  const processed = new Set<string>();
  if (opts.resume) {
    try {
      const raw = fs.readFileSync(opts.resume, 'utf-8');
      const prev: LogEntry[] = JSON.parse(raw);
      for (const e of prev) {
        if (e.driveUrl) processed.add(`${e.model}:${e.id}:${e.column}`);
      }
      console.log(`재개: 이전에 처리된 ${processed.size}건 건너뜀`);
    } catch (e) {
      console.error('--resume 로그 읽기 실패:', e);
      process.exit(1);
    }
  }

  const logEntries: LogEntry[] = [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logPath = path.resolve(__dirname, `migration-log-${stamp}.json`);

  let accessToken = '';
  let folderId: string | undefined;
  if (!opts.dryRun) {
    accessToken = await getAccessToken();
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    folderId = await ensureFolderPath(
      accessToken,
      ['수탐학원', '시험지', '_migrated'],
      rootFolderId
    );
    console.log('Drive 폴더 준비 완료:', folderId);
  }

  let processedCount = 0;
  let totalBytes = 0;
  const shouldStop = () => opts.limit !== null && processedCount >= opts.limit;

  // 1) TestPaperPage
  if (!opts.skipPaperPages) {
    console.log('\n[1/2] TestPaperPage 스캔 중…');
    const pages = await prisma.testPaperPage.findMany({
      select: { id: true, imageUrl: true, answerImageUrl: true },
    });
    console.log(`  TestPaperPage 총 ${pages.length}건 로드`);

    for (const pg of pages) {
      if (shouldStop()) break;
      for (const col of ['imageUrl', 'answerImageUrl'] as const) {
        if (shouldStop()) break;
        const v = (pg as any)[col] as string | null;
        if (!v || !v.startsWith('data:')) continue;
        const key = `TestPaperPage:${pg.id}:${col}`;
        if (processed.has(key)) continue;
        const decoded = decodeDataUrl(v);
        if (!decoded) {
          logEntries.push({
            ts: new Date().toISOString(),
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            sizeBytes: v.length,
            error: 'invalid-data-url',
          });
          continue;
        }
        totalBytes += decoded.buffer.length;
        if (opts.verbose) {
          console.log(
            `  - TestPaperPage ${pg.id} ${col}: ${decoded.buffer.length} bytes`
          );
        }
        if (opts.dryRun) {
          processedCount++;
          continue;
        }
        try {
          const upl = await uploadDecoded(accessToken, folderId!, `page-${pg.id}-${col}`, decoded);
          await prisma.testPaperPage.update({
            where: { id: pg.id },
            data: { [col]: upl.url } as any,
          });
          logEntries.push({
            ts: new Date().toISOString(),
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            driveId: upl.id,
            driveUrl: upl.url,
            sizeBytes: decoded.buffer.length,
          });
          processedCount++;
        } catch (e: any) {
          logEntries.push({
            ts: new Date().toISOString(),
            model: 'TestPaperPage',
            id: pg.id,
            column: col,
            sizeBytes: decoded.buffer.length,
            error: String(e?.message || e),
          });
          console.error(`    ✗ 실패: TestPaperPage ${pg.id} ${col}:`, e?.message || e);
        }
        // 중간 저장 (10건마다)
        if (processedCount % 10 === 0) {
          fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2), 'utf-8');
        }
      }
    }
  }

  // 2) WrongAnswer.problemImage
  if (!opts.skipWrongAnswer && !shouldStop()) {
    console.log('\n[2/2] WrongAnswer.problemImage 스캔 중…');
    const answers = await prisma.wrongAnswer.findMany({
      select: { id: true, problemImage: true },
    });
    console.log(`  WrongAnswer 총 ${answers.length}건 로드`);

    for (const wa of answers) {
      if (shouldStop()) break;
      const v = wa.problemImage as string | null;
      if (!v || !v.startsWith('data:')) continue;
      const key = `WrongAnswer:${wa.id}:problemImage`;
      if (processed.has(key)) continue;
      const decoded = decodeDataUrl(v);
      if (!decoded) {
        logEntries.push({
          ts: new Date().toISOString(),
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          sizeBytes: v.length,
          error: 'invalid-data-url',
        });
        continue;
      }
      totalBytes += decoded.buffer.length;
      if (opts.verbose) {
        console.log(`  - WrongAnswer ${wa.id} problemImage: ${decoded.buffer.length} bytes`);
      }
      if (opts.dryRun) {
        processedCount++;
        continue;
      }
      try {
        const upl = await uploadDecoded(accessToken, folderId!, `wa-${wa.id}`, decoded);
        await prisma.wrongAnswer.update({
          where: { id: wa.id },
          data: { problemImage: upl.url },
        });
        logEntries.push({
          ts: new Date().toISOString(),
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          driveId: upl.id,
          driveUrl: upl.url,
          sizeBytes: decoded.buffer.length,
        });
        processedCount++;
      } catch (e: any) {
        logEntries.push({
          ts: new Date().toISOString(),
          model: 'WrongAnswer',
          id: wa.id,
          column: 'problemImage',
          sizeBytes: decoded.buffer.length,
          error: String(e?.message || e),
        });
        console.error(`    ✗ 실패: WrongAnswer ${wa.id}:`, e?.message || e);
      }
      if (processedCount % 10 === 0) {
        fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2), 'utf-8');
      }
    }
  }

  // 최종 로그 저장
  fs.writeFileSync(logPath, JSON.stringify(logEntries, null, 2), 'utf-8');

  const successful = logEntries.filter((e) => e.driveUrl).length;
  const failed = logEntries.filter((e) => e.error).length;
  const totalMB = (totalBytes / 1024 / 1024).toFixed(2);
  console.log('\n=== 완료 ===');
  console.log(`  대상   : ${processedCount}건 (로그 엔트리 ${logEntries.length}건)`);
  console.log(`  성공   : ${successful}건`);
  console.log(`  실패   : ${failed}건`);
  console.log(`  용량   : 약 ${totalMB} MB`);
  if (opts.dryRun) console.log('  모드   : DRY-RUN (실제 쓰기 없음)');
  console.log(`  로그   : ${logPath}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
