'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');
  const email = searchParams.get('email');

  const [loginTab, setLoginTab] = useState<'parent' | 'staff'>('parent');
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneStep, setPhoneStep] = useState<'PHONE' | 'SELECT'>('PHONE');
  const [students, setStudents] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentName, setStudentName] = useState('');
  const [realName, setRealName] = useState('');
  const [nameSubmitted, setNameSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isWebView, setIsWebView] = useState(false);
  const [autoLoginChecking, setAutoLoginChecking] = useState(true);

  // 영구 로그인: 저장된 토큰이 있으면 자동으로 로그인 시도
  useEffect(() => {
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
    if (savedToken) {
      // 토큰 만료 확인 (클라이언트측에서도 체크하여 불필요한 요청 방지)
      try {
        const payload = JSON.parse(atob(savedToken.split('.')[1]));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          // 만료된 토큰 정리
          localStorage.removeItem('auth-token');
          document.cookie = 'auth-token-js=; path=/; max-age=0';
          setAutoLoginChecking(false);
          return;
        }
      } catch {
        localStorage.removeItem('auth-token');
        document.cookie = 'auth-token-js=; path=/; max-age=0';
        setAutoLoginChecking(false);
        return;
      }

      const hasAuthCookie = document.cookie.includes('auth-token-js=');
      if (!hasAuthCookie) {
        document.cookie = `auth-token-js=${savedToken}; path=/; max-age=${365*24*60*60}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
      }
      fetch('/api/parent/data')
        .then(r => {
          if (r.ok) { router.push('/parent'); return; }
          // 인증 실패 시 만료된 토큰 정리
          localStorage.removeItem('auth-token');
          document.cookie = 'auth-token-js=; path=/; max-age=0';
          setAutoLoginChecking(false);
        })
        .catch(() => {
          localStorage.removeItem('auth-token');
          document.cookie = 'auth-token-js=; path=/; max-age=0';
          setAutoLoginChecking(false);
        });
    } else {
      setAutoLoginChecking(false);
    }

    // 안전장치: 5초 후에도 로딩이면 강제로 로그인 폼 표시
    const safetyTimer = setTimeout(() => setAutoLoginChecking(false), 5000);
    return () => clearTimeout(safetyTimer);
  }, [router]);

  useEffect(() => {
    const ua = navigator.userAgent || '';
    const webviewPatterns = [/KAKAOTALK/i, /NAVER/i, /Line/i, /Instagram/i, /FB_IAB/i, /FBAN/i, /Twitter/i, /wv\)/i, /WebView/i, /\bSamsungBrowser\/\d/i];
    const isWV = webviewPatterns.some(p => p.test(ua)) || (ua.includes('iPhone') && !ua.includes('Safari')) || (ua.includes('Android') && ua.includes('Version/'));
    setIsWebView(isWV);
  }, []);

  const openInExternalBrowser = () => {
    const url = window.location.href;
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      window.location.href = 'intent://' + url.replace(/https?:\/\//, '') + '#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(url) + ';end';
    } else { window.open(url, '_system'); }
  };

  useEffect(() => { fetch('/api/seed', { method: 'POST' }).catch(() => {}); }, []);

  const formatPhone = (v: string) => {
    const n = v.replace(/[^0-9]/g, '');
    if (n.length <= 3) return n;
    if (n.length <= 7) return n.slice(0,3)+'-'+n.slice(3);
    return n.slice(0,3)+'-'+n.slice(3,7)+'-'+n.slice(7,11);
  };

  const handlePhoneSubmit = async () => {
    if (!phone.trim()) { setPhoneError('전화번호를 입력해주세요.'); return; }
    setPhoneLoading(true); setPhoneError('');
    try {
      const res = await fetch('/api/auth/phone-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.replace(/-/g, '') }) });
      const data = await res.json();
      if (!res.ok) { setPhoneError(data.error); return; }
      if (data.step === 'SELECT_STUDENT') { setStudents(data.students); setPhoneStep('SELECT'); }
    } catch { setPhoneError('오류가 발생했습니다.'); } finally { setPhoneLoading(false); }
  };

  const handleStudentLogin = async () => {
    if (!selectedStudent || !studentName.trim()) { setPhoneError('학생 이름을 입력해주세요.'); return; }
    setPhoneLoading(true); setPhoneError('');
    try {
      const res = await fetch('/api/auth/phone-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone.replace(/-/g, ''), studentId: selectedStudent.id, studentName: studentName.trim(), loginType: selectedStudent.loginAs }) });
      const data = await res.json();
      if (!res.ok) { setPhoneError(data.error); return; }
      if (data.step === 'LOGIN_SUCCESS') {
        document.cookie = `auth-token-js=${data.token}; path=/; max-age=${365*24*60*60}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
        if (typeof window !== 'undefined') localStorage.setItem('auth-token', data.token);
        router.push(data.user.role === 'PARENT' || data.user.role === 'STUDENT' ? '/parent' : '/dashboard');
      }
    } catch { setPhoneError('로그인에 실패했습니다.'); } finally { setPhoneLoading(false); }
  };

  const handleGoogleLogin = () => { window.location.href = '/api/auth/google'; };

  const handleNameSubmit = async () => {
    if (!realName.trim() || !email) return;
    setIsSubmitting(true);
    try { const res = await fetch('/api/auth/update-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, name: realName.trim() }) }); if (res.ok) setNameSubmitted(true); } catch {} finally { setIsSubmitting(false); }
  };

  if (autoLoginChecking) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="flex flex-col items-center gap-3"><div style={{width:32,height:32,border:'3px solid #3b82f6',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}}/><p className="text-sm text-gray-500">자동 로그인 확인 중...</p><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div></div>);
  }

  if (error === 'not_approved' && email && !nameSubmitted) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow-md"><div className="text-center"><h1 className="text-3xl font-bold text-gray-900">수학탐구</h1><p className="mt-2 text-gray-600">직원 가입 신청</p></div><input type="text" value={email} disabled className="w-full px-3 py-2 border rounded-lg bg-gray-100 text-gray-500" /><input type="text" value={realName} onChange={(e) => setRealName(e.target.value)} placeholder="실명을 입력해주세요" className="w-full px-3 py-2 border rounded-lg" onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()} /><button onClick={handleNameSubmit} disabled={!realName.trim() || isSubmitting} className="w-full py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400">{isSubmitting ? '처리 중...' : '가입 신청'}</button></div></div>);
  }

  if (error === 'not_approved' && nameSubmitted) {
    return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="max-w-md w-full space-y-6 p-8 bg-white rounded-lg shadow-md"><h1 className="text-3xl font-bold text-gray-900 text-center">수학탐구</h1><div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded text-sm">가입 신청이 완료되었습니다.</div></div></div>);
  }

  return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md"><div className="text-center mb-6"><h1 className="text-3xl font-bold text-gray-900">수학탐구</h1></div>

    <div className="flex mb-6 bg-gray-100 rounded-lg p-1">
      <button onClick={() => { setLoginTab('parent'); setPhoneError(''); }} className={'flex-1 py-2.5 rounded-md text-sm font-semibold transition ' + (loginTab === 'parent' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500')}>학부모 · 학생</button>
      <button onClick={() => { setLoginTab('staff'); setPhoneError(''); }} className={'flex-1 py-2.5 rounded-md text-sm font-semibold transition ' + (loginTab === 'staff' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500')}>직원</button>
    </div>

    {phoneError && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4 text-sm">{phoneError}</div>}

    {loginTab === 'parent' && <div className="space-y-4">
      {phoneStep === 'PHONE' && <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="010-0000-0000" maxLength={13} className="w-full px-4 py-3 border rounded-lg text-lg" onKeyDown={(e) => e.key === 'Enter' && handlePhoneSubmit()} />
          <p className="mt-1 text-xs text-gray-500">학원에 등록된 전화번호를 입력하세요</p>
        </div>
        <button onClick={handlePhoneSubmit} disabled={phoneLoading} className="w-full py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 font-medium">{phoneLoading ? '확인 중...' : '로그인'}</button>
      </>}

      {phoneStep === 'SELECT' && <>
        {/* Enhanced student selection guide */}
        <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-4 text-center" style={{animation:'pulse-border 2s ease-in-out infinite'}}>
          <style>{`
            @keyframes pulse-border { 0%,100%{border-color:#93c5fd;box-shadow:0 0 0 0 rgba(59,130,246,0.3)} 50%{border-color:#3b82f6;box-shadow:0 0 0 8px rgba(59,130,246,0)} }
            @keyframes bounce-arrow { 0%,100%{transform:translateY(0)} 50%{transform:translateY(6px)} }
          `}</style>
          <p className="text-blue-700 font-bold text-base mb-1">⬇️ 아래 학생 이름을 터치하세요</p>
          <p className="text-blue-500 text-sm">본인 확인을 위해 학생을 선택해주세요</p>
          <div style={{fontSize:24,animation:'bounce-arrow 1.2s ease-in-out infinite',marginTop:4}}>👇</div>
        </div>

        <div className="space-y-2">
          {students.map((s: any) => <button key={s.id} onClick={() => { setSelectedStudent(s); setStudentName(''); }}
            className={'w-full p-4 border-2 rounded-xl text-left transition-all ' + (selectedStudent?.id === s.id ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50')}
            style={{WebkitTapHighlightColor:'transparent'}}>
            <div className="font-semibold text-lg">{s.name}</div>
          </button>)}
        </div>

        {selectedStudent && <div className="space-y-2 mt-2">
          <label className="block text-sm font-medium text-gray-700">학생 전체 이름을 입력해주세요</label>
          <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="학생 전체 이름" className="w-full px-4 py-3 border-2 border-blue-200 rounded-xl text-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all" onKeyDown={(e) => e.key === 'Enter' && handleStudentLogin()} />
        </div>}

        <div className="flex gap-2 mt-3">
          <button onClick={() => {setPhoneStep('PHONE'); setSelectedStudent(null);}} className="flex-1 py-3 border rounded-lg font-medium text-gray-600 hover:bg-gray-50">뒤로</button>
          <button onClick={handleStudentLogin} disabled={!selectedStudent||!studentName.trim()||phoneLoading} className="flex-1 py-3 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 font-medium">{phoneLoading?'...':'로그인'}</button>
        </div>
      </>}
    </div>}

    {loginTab === 'staff' && <div className="space-y-4">
      {isWebView && <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm mb-3">
        <p className="font-semibold mb-1">⚠️ 앱 내 브라우저에서는 Google 로그인이 불가합니다</p>
        <p className="text-xs mb-2">카카오톡, 네이버 등 앱 내 브라우저에서 접속하셨습니다.</p>
        <button onClick={openInExternalBrowser} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">크롬/사파리에서 열기</button>
      </div>}
      <button onClick={handleGoogleLogin} disabled={isWebView} className={"w-full flex items-center justify-center gap-3 px-4 py-3 border rounded-lg " + (isWebView ? "bg-gray-100 opacity-50 cursor-not-allowed" : "bg-white hover:bg-gray-50")}>
        <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.12"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53"/></svg>
        <span className="text-gray-700 font-medium">Google로 로그인</span>
      </button>
      <p className="text-center text-xs text-gray-500">승인된 구글 계정으로만 로그인</p>
    </div>}

  </div></div>);
}

export default function LoginPage() {
  return (<Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="text-gray-500">로딩 중...</div></div>}><LoginContent /></Suspense>);
}
