'use client';

import { useEffect, useState } from 'react';
import { hapticLight, hapticMedium, hapticSuccess, hapticWarn } from '@/lib/haptics';

type Status = {
  connected: boolean;
  ownerEmail: string | null;
  connectedAt: string | null;
  authSource: 'oauth' | 'service' | 'none';
} | null;

type MigrationLog = {
  model: 'TestPaperPage' | 'WrongAnswer';
  id: string;
  column: string;
  driveUrl?: string;
  error?: string;
  sizeBytes: number;
};

type MigrationResult = {
  ok: true;
  dryRun: boolean;
  processed: number;
  successful: number;
  failed: number;
  totalMB: number;
  remainingPaperPages: number;
  remainingWrongAnswers: number;
  log: MigrationLog[];
} | null;

export default function DriveSettingsPage() {
  const [status, setStatus] = useState<Status>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // 마이그레이션 상태
  const [migrating, setMigrating] = useState(false);
  const [migResult, setMigResult] = useState<MigrationResult>(null);
  const [remaining, setRemaining] = useState<{ paper: number; wa: number } | null>(null);

  async function fetchRemaining() {
    try {
      const res = await fetch('/api/admin/migrate-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, limit: 1 }),
      });
      if (res.ok) {
        const data = await res.json();
        setRemaining({
          paper: data.remainingPaperPages ?? 0,
          wa: data.remainingWrongAnswers ?? 0,
        });
      }
    } catch {
      /* 무시 */
    }
  }

  async function runMigration(limit: number) {
    if (!confirm(`base64 이미지 ${limit}건을 Google Drive 로 이관할게요. 진행할까요?\n(실패해도 원본 DB 는 보존됩니다.)`)) {
      return;
    }
    hapticMedium();
    setMigrating(true);
    setMigResult(null);
    try {
      const res = await fetch('/api/admin/migrate-base64', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      const data = await res.json();
      if (res.ok) {
        setMigResult(data);
        setRemaining({
          paper: data.remainingPaperPages ?? 0,
          wa: data.remainingWrongAnswers ?? 0,
        });
        if (data.failed === 0 && data.successful > 0) hapticSuccess();
        else if (data.failed > 0) hapticWarn();
      } else {
        alert('마이그레이션 실패: ' + (data.error || '알 수 없는 오류'));
      }
    } catch (e: any) {
      alert('마이그레이션 요청 오류: ' + (e?.message || e));
    } finally {
      setMigrating(false);
    }
  }

  async function fetchStatus() {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/drive-oauth/status', { cache: 'no-store' });
      if (res.ok) {
        setStatus(await res.json());
      } else {
        setStatus(null);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchStatus(); }, []);

  // 연결되면 남은 base64 건수 자동 조회
  useEffect(() => {
    if (status?.connected) fetchRemaining();
  }, [status?.connected]);

  async function handleDisconnect() {
    if (!confirm('Google Drive 연결을 해제하시겠어요? 해제하면 이후 업로드가 다시 base64 폴백으로 저장됩니다.')) {
      return;
    }
    hapticWarn();
    setDisconnecting(true);
    try {
      await fetch('/api/admin/drive-oauth/status', { method: 'DELETE' });
      await fetchStatus();
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = status?.connected === true;
  const source = status?.authSource ?? 'none';

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <header className="mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900">Google Drive 연결</h1>
        <p className="mt-1 text-sm text-gray-600">
          시험지 · 정답 이미지를 저장할 Drive 계정을 연결합니다. 원장님 개인 Google 계정(15GB)을 사용하면 충분합니다.
        </p>
      </header>

      {loading ? (
        <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-sm text-gray-500 animate-pulse">
          상태 확인 중…
        </div>
      ) : (
        <>
          {/* Current status card */}
          <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 mb-4">
            <div className="flex items-start gap-4">
              <StatusBadge connected={connected} source={source} />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-medium text-gray-900">
                  {connected
                    ? 'Drive 연결됨'
                    : source === 'service'
                      ? 'Drive 미연결 (서비스 계정 사용 중)'
                      : 'Drive 미연결'}
                </h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {connected && status?.ownerEmail && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-20">계정</dt>
                      <dd className="text-gray-900 font-medium truncate">{status.ownerEmail}</dd>
                    </div>
                  )}
                  {connected && status?.connectedAt && (
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-20">연결일시</dt>
                      <dd className="text-gray-700">{new Date(status.connectedAt).toLocaleString('ko-KR')}</dd>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <dt className="text-gray-500 w-20">인증 방식</dt>
                    <dd className="text-gray-700">{sourceLabel(source)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </section>

          {/* Action card */}
          {!connected ? (
            <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">연결하기</h3>
              <p className="text-sm text-gray-600 leading-6 mb-4">
                아래 버튼을 누르면 Google 계정 선택 화면이 나옵니다. 원장님 개인 계정
                (예: <code className="px-1.5 py-0.5 bg-gray-100 rounded text-xs">tjyjww@gmail.com</code>)을 선택하고
                Drive 접근을 <strong>허용</strong>해 주세요. 이후 업로드된 이미지는 선택한 계정의 Drive에 저장됩니다.
              </p>
              <a
                href="/api/admin/drive-oauth/init"
                onPointerDown={() => hapticMedium()}
                className="press press-strong inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
                </svg>
                Google 계정으로 Drive 연결
              </a>
            </section>
          ) : (
            <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">관리</h3>
              <p className="text-sm text-gray-600 leading-6 mb-4">
                다른 계정으로 바꾸고 싶으면 먼저 연결을 해제한 뒤 다시 연결하세요.
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/api/admin/drive-oauth/init"
                  onPointerDown={() => hapticLight()}
                  className="press inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  다른 계정으로 바꾸기
                </a>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  onPointerDown={() => hapticLight()}
                  disabled={disconnecting}
                  className="press inline-flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-700 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {disconnecting ? '해제 중…' : '연결 해제'}
                </button>
              </div>
            </section>
          )}

          {/* Migration card (only when connected) */}
          {connected && (
            <section className="bg-white border border-gray-200 rounded-xl p-5 sm:p-6 mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">기존 base64 이미지 이관</h3>
              <p className="text-sm text-gray-600 leading-6 mb-4">
                DB에 남아 있는 오래된 base64 이미지를 Drive로 옮겨 DB 용량과 전송량을 아낍니다.
                실패해도 원본 DB는 보존되며, 여러 번 눌러도 안전합니다.
              </p>

              {remaining && (
                <div className="mb-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                    시험지 페이지: <strong className="text-gray-900 ml-0.5">{remaining.paper}</strong>건 남음
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
                    오답 이미지: <strong className="text-gray-900 ml-0.5">{remaining.wa}</strong>건 남음
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => runMigration(20)}
                  onPointerDown={() => hapticMedium()}
                  disabled={migrating}
                  className="press press-strong inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
                >
                  {migrating ? '이관 중…' : '20건 이관 시작'}
                </button>
                <button
                  type="button"
                  onClick={() => runMigration(50)}
                  onPointerDown={() => hapticMedium()}
                  disabled={migrating}
                  className="press inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200 disabled:opacity-50 transition-colors"
                >
                  50건 이관
                </button>
                <button
                  type="button"
                  onClick={fetchRemaining}
                  onPointerDown={() => hapticLight()}
                  disabled={migrating}
                  className="press inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  남은 건수 새로고침
                </button>
              </div>

              {migResult && (
                <div className={`mt-4 p-3 rounded-lg border text-sm ${migResult.failed > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                  <div className="font-medium mb-2 text-gray-900">
                    {migResult.failed > 0 ? '일부 실패' : '완료'} · 처리 {migResult.processed}건
                  </div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-700">
                    <dt className="text-gray-500">성공</dt><dd>{migResult.successful}건</dd>
                    <dt className="text-gray-500">실패</dt><dd>{migResult.failed}건</dd>
                    <dt className="text-gray-500">이관 용량</dt><dd>{migResult.totalMB} MB</dd>
                    <dt className="text-gray-500">시험지 남음</dt><dd>{migResult.remainingPaperPages}건</dd>
                    <dt className="text-gray-500">오답 남음</dt><dd>{migResult.remainingWrongAnswers}건</dd>
                  </dl>
                  {migResult.failed > 0 && migResult.log.some(l => l.error) && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-amber-800">실패 내역 ({migResult.log.filter(l => l.error).length}건)</summary>
                      <ul className="mt-1 space-y-0.5 text-xs text-amber-900/80 max-h-40 overflow-y-auto">
                        {migResult.log.filter(l => l.error).map((l, i) => (
                          <li key={i} className="font-mono break-all">{l.model}.{l.column} #{l.id}: {l.error}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Help card */}
          <section className="bg-blue-50 border border-blue-100 rounded-xl p-5 sm:p-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">ℹ️ 참고</h3>
            <ul className="text-sm text-blue-900/90 space-y-1.5 leading-6 list-disc pl-5">
              <li>Google이 <strong>처음 한 번</strong>만 동의 화면을 띄우고, 이후에는 자동으로 갱신됩니다.</li>
              <li>저장 위치는 Drive의 <code className="px-1 py-0.5 bg-white/60 rounded text-xs">수탐학원 &gt; 시험지</code> 폴더입니다.</li>
              <li>연결이 안 된 동안에도 업로드는 실패하지 않습니다 — base64 폴백으로 저장되지만 DB 용량이 빨리 찹니다.</li>
              <li>"이전에 이미 허용했는데 다시 동의가 안 나와요" → <a className="underline" href="https://myaccount.google.com/permissions" target="_blank" rel="noopener">Google 계정 권한 페이지</a>에서 "수탐학원" 액세스를 먼저 철회한 뒤 다시 시도.</li>
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function StatusBadge({ connected, source }: { connected: boolean; source: 'oauth' | 'service' | 'none' }) {
  const tone = connected ? 'green' : source === 'service' ? 'amber' : 'gray';
  const palette = {
    green: { bg: 'bg-green-50', ring: 'ring-green-200', dot: 'bg-green-500' },
    amber: { bg: 'bg-amber-50', ring: 'ring-amber-200', dot: 'bg-amber-500' },
    gray: { bg: 'bg-gray-100', ring: 'ring-gray-200', dot: 'bg-gray-400' },
  }[tone];
  return (
    <div className={`shrink-0 w-11 h-11 rounded-full ${palette.bg} ring-1 ${palette.ring} grid place-items-center`}>
      <span className={`w-2.5 h-2.5 rounded-full ${palette.dot}`} />
    </div>
  );
}

function sourceLabel(source: 'oauth' | 'service' | 'none'): string {
  switch (source) {
    case 'oauth':   return '개인 Google 계정 (OAuth refresh token)';
    case 'service': return '서비스 계정 (쿼터 0 — 업로드 실패 예상)';
    case 'none':    return '미설정 (base64 폴백만 사용)';
  }
}
