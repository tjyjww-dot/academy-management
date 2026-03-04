'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const email = searchParams.get('email');
  const [realName, setRealName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const callSeed = async () => {
      try {
        await fetch('/api/seed', { method: 'POST' });
      } catch (err) {
        console.log('Seed call completed or not needed');
      }
    };
    callSeed();
  }, []);

  const getErrorMessage = (errorCode: string | null) => {
    switch (errorCode) {
      case 'no_code': return '구글 인증 코드를 받지 못했습니다.';
      case 'token_failed': return '구글 인증 토큰 발급에 실패했습니다.';
      case 'no_email': return '구글 계정에서 이메일을 가져올 수 없습니다.';
      case 'not_approved': return null;
      case 'callback_failed': return '로그인 처리 중 오류가 발생했습니다.';
      default: return null;
    }
  };

  const errorMessage = getErrorMessage(error);

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  const handleNameSubmit = async () => {
    if (!realName.trim() || !email) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/update-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: realName.trim() }),
      });
      if (res.ok) {
        setNameSubmitted(true);
      }
    } catch (err) {
      console.error('Failed to update name:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error === 'not_approved' && email && !nameSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">수학탐구</h1>
            <p className="mt-2 text-gray-600">회원 가입 신청</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
            구글 로그인이 완료되었습니다. 실명을 입력해주세요.
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
            <input type="text" value={email} disabled className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">실명</label>
            <input type="text" value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="실명을 입력해주세요" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()} />
          </div>
          <button onClick={handleNameSubmit} disabled={!realName.trim() || isSubmitting} className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed">
            {isSubmitting ? '처리 중...' : '가입 신청'}
          </button>
        </div>
      </div>
    );
  }

  if (error === 'not_approved' && nameSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow-md">
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">수학탐구</h1>
            <p className="mt-2 text-gray-600">학원 관리 시스템</p>
          </div>
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            가입 신청이 완료되었습니다. 관리자 승인 후 로그인할 수 있습니다.
          </div>
          <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 transition-colors">
            <span className="text-gray-700 font-medium">다시 로그인 시도</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">수학탐구</h1>
          <p className="mt-2 text-gray-600">학원 관리 시스템</p>
        </div>
        {errorMessage && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {errorMessage}
          </div>
        )}
        <button onClick={handleGoogleLogin} className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg shadow-sm bg-white hover:bg-gray-50 transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.12" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53" />
          </svg>
          <span className="text-gray-700 font-medium">Google로 로그인</span>
        </button>
        <p className="text-center text-sm text-gray-500">
          승인된 구글 계정으로만 로그인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">로딩 중...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
