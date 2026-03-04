'use client';

import { useState, useRef } from 'react';

export default function BackupPage() {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setMessage('');
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'backup_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage('백업 파일이 다운로드되었습니다.');
      setMessageType('success');
    } catch {
      setMessage('백업 다운로드에 실패했습니다.');
      setMessageType('error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      '주의: 복구를 진행하면 현재 모든 데이터가 백업 파일의 데이터로 교체됩니다.\n\n정말 복구하시겠습니까?'
    );
    if (!confirmed) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsImporting(true);
    setMessage('');
    try {
      const text = await file.text();
      const backup = JSON.parse(text);

      if (!backup.version || !backup.data) {
        throw new Error('올바른 백업 파일이 아닙니다.');
      }

      const res = await fetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: text,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Restore failed');
      }

      setMessage('데이터가 성공적으로 복구되었습니다! (백업 날짜: ' + backup.exportedAt?.slice(0, 10) + ')');
      setMessageType('success');
    } catch (err) {
      setMessage('복구 실패: ' + (err instanceof Error ? err.message : '알 수 없는 오류'));
      setMessageType('error');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">데이터 백업 관리</h1>

      {message && (
        <div className={'mb-6 p-4 rounded-lg ' + (messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200')}>
          {message}
        </div>
      )}

      {/* 백업 다운로드 */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-600">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">백업 다운로드</h2>
            <p className="text-gray-500 text-sm mb-4">
              현재 데이터베이스의 모든 데이터를 JSON 파일로 다운로드합니다.<br />
              회원, 학생, 반, 성적, 출결, 상담, 수납 등 모든 정보가 포함됩니다.
            </p>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isExporting ? '다운로드 중...' : '백업 파일 다운로드'}
            </button>
          </div>
        </div>
      </div>

      {/* 백업 복구 */}
      <div className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-orange-600">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-1">백업 복구</h2>
            <p className="text-gray-500 text-sm mb-2">
              이전에 다운로드한 백업 파일을 업로드하여 데이터를 복구합니다.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
              <p className="text-amber-700 text-sm font-medium">
                ⚠️ 주의: 복구 시 현재 데이터가 모두 삭제되고 백업 파일의 데이터로 교체됩니다.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
              id="backup-file"
            />
            <label
              htmlFor="backup-file"
              className={'inline-block px-6 py-2.5 rounded-lg font-medium cursor-pointer ' + (isImporting ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-orange-500 text-white hover:bg-orange-600')}
            >
              {isImporting ? '복구 진행 중...' : '백업 파일 선택하여 복구'}
            </label>
          </div>
        </div>
      </div>

      {/* 안내 */}
      <div className="bg-gray-50 rounded-xl border p-6">
        <h3 className="font-semibold mb-2">💡 백업 가이드</h3>
        <ul className="text-sm text-gray-600 space-y-1.5">
          <li>• 정기적으로 백업을 다운로드하여 안전한 곳에 보관하세요.</li>
          <li>• 백업 파일은 컴퓨터, USB, 외장하드 등에 저장할 수 있습니다.</li>
          <li>• 데이터 손실 시 백업 파일로 복구할 수 있습니다.</li>
          <li>• 중요한 변경 전에는 반드시 백업을 먼저 진행하세요.</li>
        </ul>
      </div>
    </div>
  );
}
