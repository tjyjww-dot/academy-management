/**
 * run-migrate.ts
 * Custom env loader for the base64→Drive migration script.
 *
 * 문제: 이 프로젝트의 .env.local 은 GOOGLE_SERVICE_ACCOUNT_KEY 를
 *   GOOGLE_SERVICE_ACCOUNT_KEY="{\n  "type": "service_account", ... "private_key": "-----BEGIN PRIVATE KEY-----\nMIIE..."\n}\n"
 * 형태로 저장한다 — 한 줄, 따옴표 이스케이프 없음, `\n` 은 2글자 문자열.
 *
 * 이 포맷은 단순 dotenv 파서도, Next.js 의 @next/env 파서도
 * "그대로 JSON.parse" 하기에는 맞지 않다:
 *   - 단순 dotenv: 내부 `"` 를 문자열 종료로 오인
 *   - @next/env: `\n` 을 실제 개행으로 치환 → private_key 문자열 안에
 *                실제 개행이 들어가버려 JSON.parse 가 "Bad control character"
 *                로 실패
 *
 * 해법: `\n` 을 "문자열 밖" 에서만 실제 개행으로 변환한다.
 *   따옴표로 split 하면 짝수 인덱스 = 문자열 밖, 홀수 인덱스 = 문자열 안.
 *   (private_key 같은 문자열 안에는 내부 `"` 가 없는 포맷이라 동작)
 *
 * 사용: npx tsx scripts/run-migrate.ts -- --limit 20 --verbose
 */
import * as fs from 'fs';
import * as path from 'path';

const projectDir = path.resolve(__dirname, '..');
const envLocal = path.join(projectDir, '.env.local');
const envDefault = path.join(projectDir, '.env');

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, 'utf8');
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine;
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1);
    // 양쪽 따옴표가 있으면 벗겨냄. 내부 `"` 는 본 프로젝트 포맷상 이스케이프되어 있지 않고,
    // split-by-quote 로 후처리할 수 있으므로 그대로 둔다.
    if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function fixServiceAccountJson(raw: string): string {
  // 따옴표로 split: 짝수 = 문자열 밖, 홀수 = 문자열 안
  const parts = raw.split('"');
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      // 문자열 밖: `\n` → 실제 개행 (JSON 은 whitespace 허용)
      parts[i] = parts[i].replace(/\\n/g, '\n');
    }
    // 문자열 안: `\n` 2글자 유지 (JSON 파서가 이를 개행 escape 로 해석)
  }
  return parts.join('"');
}

const fromLocal = parseEnvFile(envLocal);
const fromDefault = parseEnvFile(envDefault);
// .env.local 이 .env 보다 우선
const merged: Record<string, string> = { ...fromDefault, ...fromLocal };

let fixedCount = 0;
for (const [k, v] of Object.entries(merged)) {
  let final = v;
  if (k === 'GOOGLE_SERVICE_ACCOUNT_KEY') {
    final = fixServiceAccountJson(v);
    fixedCount++;
  }
  // 기존 값이 있어도 .env.local 이 우선 (override)
  process.env[k] = final;
}

console.log(`[run-migrate] env loaded: local=${Object.keys(fromLocal).length} default=${Object.keys(fromDefault).length} (service_account fixed=${fixedCount})`);

// sanity check
try {
  JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '{}');
  console.log('[run-migrate] GOOGLE_SERVICE_ACCOUNT_KEY JSON OK');
} catch (e: any) {
  console.error('[run-migrate] GOOGLE_SERVICE_ACCOUNT_KEY JSON still invalid:', e.message);
  process.exit(1);
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./migrate-base64-to-drive');
