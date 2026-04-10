'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PushNotificationManager from '@/components/PushNotificationManager';

export default function ParentPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('notice');
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [showCounselForm, setShowCounselForm] = useState(false);
  const [counselType, setCounselType] = useState('PHONE');
  const [counselDesc, setCounselDesc] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [waStats, setWaStats] = useState<any>(null);
  const [expandedWA, setExpandedWA] = useState<Set<string>>(new Set());

  useEffect(() => {
    // 영구 로그인: localStorage에서 토큰 복원
    const savedToken = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;
    if (savedToken) {
      const hasAuthCookie = document.cookie.includes('auth-token-js=');
      if (!hasAuthCookie) {
        document.cookie = `auth-token-js=${savedToken}; path=/; max-age=${365*24*60*60}; samesite=lax${location.protocol === 'https:' ? '; secure' : ''}`;
      }
    }
    fetch('/api/parent/data')
      .then(r => { if (!r.ok) { router.push('/auth/login'); return null; } return r.json(); })
      .then(d => {
        if (d) {
          setData(d);
          if (d.students?.[0]) { fetchMemos(d.students[0].id); fetchWrongAnswers(d.students[0].id); }
          // 로그인 성공 시 토큰 저장
          const tokenMatch = document.cookie.match(/auth-token-js=([^;]+)/);
          if (tokenMatch && typeof window !== 'undefined') {
            localStorage.setItem('auth-token', tokenMatch[1]);
          }
        }
      })
      .catch(() => router.push('/auth/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fetchMemos = (sid: string) => {
    fetch('/api/parent/memo?studentId=' + sid).then(r => r.json()).then(setMemos).catch(() => {});
  };

  const fetchWrongAnswers = (sid: string) => {
    fetch(`/api/wrong-answers?studentId=${sid}`).then(r => r.json()).then(data => {
      const list = Array.isArray(data) ? data : [];
      setWrongAnswers(list);
      const active = list.filter((wa: any) => wa.status === 'ACTIVE').length;
      const mastered = list.filter((wa: any) => wa.status === 'MASTERED').length;
      setWaStats({ active, mastered, total: list.length, rate: list.length > 0 ? Math.round(mastered / list.length * 100) : 0 });
    }).catch(() => {});
  };

  const sendMemo = async () => {
    if (!newMemo.trim() || !data?.students?.[0]) return;
    await fetch('/api/parent/memo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: data.students[0].id, content: newMemo })
    });
    setNewMemo('');
    fetchMemos(data.students[0].id);
  };

  const submitCounsel = async () => {
    if (!data?.students?.[0]) return;
    await fetch('/api/counseling', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: data.students[0].id,
        title: counselType === 'PHONE' ? '전화상담 요청' : '방문상담 요청',
        description: counselDesc,
        counselingType: counselType
      })
    });
    alert('상담 요청이 접수되었습니다.');
    setShowCounselForm(false);
    setCounselDesc('');
  };

  const handleLogout = async () => {
    if (typeof window !== 'undefined') localStorage.removeItem('auth-token');
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  };

  const parseContent = (content: string) => {
    if (!content || !content.trim()) return '';
    try {
      let parsed = content;
      while (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('"'))) {
        const obj = JSON.parse(parsed);
        if (typeof obj === 'string') {
          parsed = obj;
        } else if (typeof obj === 'object' && obj !== null) {
          // progressNote 필드가 있으면 그것만 반환
          if (obj.progressNote && obj.progressNote.trim()) return obj.progressNote.trim();
          // studentProgress 필드도 확인
          if (obj.studentProgress && obj.studentProgress.trim()) return obj.studentProgress.trim();
          // content 필드도 확인
          if (obj.content && typeof obj.content === 'string' && obj.content.trim()) {
            parsed = obj.content;
            continue;
          }
          // 모든 값이 비어있는 JSON 객체인 경우 빈 문자열 반환
          const allEmpty = Object.values(obj).every(v => !v || (typeof v === 'string' && !v.trim()));
          if (allEmpty) return '';
          return '';
        } else {
          return String(obj);
        }
      }
      return parsed?.trim() || '';
    } catch {
      // JSON 파싱 실패 시 원본 텍스트 반환 (빈 문자열 체크)
      return content.trim() || '';
    }
  };


  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="flex flex-col items-center gap-3">
        <div style={{width:32,height:32,border:'3px solid #3b82f6',borderTopColor:'transparent',borderRadius:'50%',animation:'spin 1s linear infinite'}} />
        <p className="text-sm text-slate-500 font-medium">로딩 중...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (!data) return null;
  const s = data.students?.[0];

  const tabs = [
    {id:'notice',label:'공지',icon:'📢'},
    {id:'grades',label:'성적',icon:'📊'},
    {id:'assignment',label:'과제완성도',icon:'✅'},
    {id:'wrongAnswers',label:'오답목록',icon:'📋'},
    {id:'homework',label:'숙제',icon:'📝'},
    {id:'video',label:'수업영상',icon:'🎥'},
    {id:'counsel',label:'상담요청',icon:'💬'},
    {id:'memo',label:'메모',icon:'💭'}
  ];

  // 과제완성도 데이터 파싱 (attitude 필드: "GRADE::MEMO" 형식)
  const parseAttitude = (attitude: string) => {
    if (!attitude || !attitude.trim()) return { grade: '', memo: '' };
    const parts = attitude.split('::');
    return { grade: parts[0]?.trim() || '', memo: parts[1]?.trim() || '' };
  };

  const getGradeColor = (grade: string) => {
    switch(grade) {
      case 'A': return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' };
      case 'B': return { bg: '#eff6ff', text: '#2563eb', border: '#bfdbfe' };
      case 'C': return { bg: '#fefce8', text: '#ca8a04', border: '#fde68a' };
      case 'D': return { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' };
      case 'X': return { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' };
      default: return { bg: '#f8fafc', text: '#64748b', border: '#e2e8f0' };
    }
  };

  const getGradeLabel = (grade: string) => {
    switch(grade) {
      case 'A': return '완벽';
      case 'B': return '잘함';
      case 'C': return '보통';
      case 'D': return '미흡';
      case 'X': return '미제출';
      default: return '';
    }
  };

  // Chart rendering function
  const renderGradeChart = () => {
    if (!data.grades || data.grades.length < 2) return null;
    const chartData = [...data.grades].reverse();
    const W = 600, H = 280;
    const padL = 45, padR = 20, padT = 30, padB = 65;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;
    const maxVal = Math.max(...chartData.map((g: any) => Math.max(g.score, g.classAverage || 0, g.maxScore || 0)));
    const yMax = 100;
    const getX = (i: number) => padL + (chartData.length === 1 ? chartW / 2 : (i / (chartData.length - 1)) * chartW);
    const getY = (val: number) => padT + chartH - (val / yMax) * chartH;
    const scoreLine = chartData.map((g: any, i: number) => `${i === 0 ? 'M' : 'L'}${getX(i)},${getY(g.maxScore > 0 ? g.score / g.maxScore * 100 : g.score)}`).join(' ');
    const avgLine = chartData.filter((g: any) => g.classAverage != null).map((g: any, i: number) => `${i === 0 ? 'M' : 'L'}${getX(chartData.indexOf(g))},${getY(g.classAverage)}`).join(' ');
    return (
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-slate-700">성적 추이</p>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span style={{width:16,height:3,background:'#3b82f6',borderRadius:2,display:'inline-block'}}/>내 점수</span>
            <span className="flex items-center gap-1.5"><span style={{width:16,height:0,borderTop:'2px dashed #fb923c',display:'inline-block'}}/>반 평균</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[0,25,50,75,100].map(pct => {
            const y = getY(yMax * pct / 100);
            return <g key={pct}><line x1={padL} y1={y} x2={W-padR} y2={y} stroke="#f1f5f9" strokeWidth="1"/><text x={padL-8} y={y+4} textAnchor="end" fill="#94a3b8" fontSize="11">{Math.round(yMax*pct/100)}%</text></g>;
          })}
          {avgLine && <path d={avgLine} fill="none" stroke="#fb923c" strokeWidth="2" strokeDasharray="6,3" opacity="0.7"/>}
          <path d={scoreLine} fill="none" stroke="#3b82f6" strokeWidth="2.5"/>
          {chartData.map((g: any, i: number) => (
            <g key={i}>
              <circle cx={getX(i)} cy={getY(g.maxScore > 0 ? g.score / g.maxScore * 100 : g.score)} r="4" fill="#3b82f6"/>
              {g.classAverage != null && <circle cx={getX(i)} cy={getY(g.classAverage)} r="3" fill="#fb923c" opacity="0.7"/>}
              <text x={getX(i)} y={H-padB+16} textAnchor="middle" fill="#64748b" fontSize="9" transform={`rotate(-35,${getX(i)},${H-padB+16})`}>{(() => { const maxLen = chartData.length > 10 ? 4 : chartData.length > 6 ? 6 : 8; return g.testName?.length > maxLen ? g.testName.substring(0,maxLen)+'…' : g.testName; })()}</text>
              <text x={getX(i)} y={getY(g.maxScore > 0 ? g.score / g.maxScore * 100 : g.score)-8} textAnchor="middle" fill="#3b82f6" fontSize="10" fontWeight="600">{g.maxScore > 0 ? Math.round(g.score / g.maxScore * 100) : g.score}%</text>
            </g>
          ))}
        </svg>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-40">
        <div className="max-w-lg mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-lg font-bold" style={{background:'linear-gradient(to right,#2563eb,#4f46e5)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>수학탐구</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">{data.user.name.replace(/\s*학부모\s*$/, '')} {data.user.role === 'PARENT' ? '학부모' : '학생'}</span>
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1">로그아웃</button>
          </div>
        </div>
      </header>

      {s && (
        <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="rounded-2xl p-5 text-white shadow-lg" style={{background:'linear-gradient(135deg,#3b82f6,#4f46e5)',boxShadow:'0 10px 25px -5px rgba(59,130,246,0.3)'}}>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={{background:'rgba(255,255,255,0.2)',backdropFilter:'blur(4px)'}}>👩‍🎓</div>
              <div>
                <p className="font-bold text-lg tracking-tight">{s.name}</p>
                <p className="text-sm" style={{color:'rgba(191,219,254,1)'}}>{s.school||''} {s.grade?s.grade+'학년':''}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 pt-4">
          <div className="grid grid-cols-4 gap-1.5">
            {tabs.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)}
                className={"px-2 py-2.5 rounded-xl text-xs font-medium transition-all duration-200 text-center "+(tab===t.id?'text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200/60')}
                style={tab===t.id?{background:'linear-gradient(135deg,#3b82f6,#4f46e5)',boxShadow:'0 4px 12px rgba(59,130,246,0.25)'}:{}}>
                <span className="mr-1">{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 pb-8">

        {tab==='homework'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">숙제</h2>
          {data.dailyReports.filter((r:any) => r.homework).length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">숙제가 없습니다.</p></div>
          ):(
            data.dailyReports.filter((r:any) => r.homework).map((r:any)=>(
              <div key={r.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"/>
                    <span className="text-sm font-semibold text-slate-700">{r.classroom?.subject?.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{r.date}</span>
                </div>
                <div className="rounded-xl p-3" style={{background:'#fffbeb'}}>
                  <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap">{r.homework}</p>
                </div>
                {r.content && parseContent(r.content) && (
                  <div className="mt-2 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs font-semibold text-blue-500 mb-1">수업진도</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{parseContent(r.content)}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>)}

        {tab==='notice'&&(()=>{
          const isParent = data.user.role === 'PARENT';
          const extractPersonalNote = (content: string | null | undefined): string => {
            if (!content) return '';
            try {
              const p = JSON.parse(content);
              if (p && typeof p === 'object' && p.personalNote) return String(p.personalNote);
            } catch {}
            return '';
          };
          const items = data.dailyReports.filter((r:any) => {
            const hasNotice = !!r.specialNote;
            const hasPersonal = isParent && !!extractPersonalNote(r.content);
            return hasNotice || hasPersonal;
          });
          return (<div className="space-y-3">
            <h2 className="text-base font-bold text-slate-800 px-1">공지</h2>
            {items.length===0?(
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">공지가 없습니다.</p></div>
            ):(
              items.map((r:any)=>{
                const personalNote = isParent ? extractPersonalNote(r.content) : '';
                return (
                  <div key={r.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-rose-500"/>
                        <span className="text-sm font-semibold text-slate-700">{r.classroom?.subject?.name}</span>
                      </div>
                      <span className="text-xs text-slate-400">{r.date}</span>
                    </div>
                    {r.specialNote && (
                      <div className="rounded-xl p-3" style={{background:'#fff1f2'}}>
                        <p className="text-xs font-semibold text-rose-600 mb-1">📢 공지사항</p>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.specialNote}</p>
                      </div>
                    )}
                    {personalNote && (
                      <div className="rounded-xl p-3 mt-2" style={{background:'#fef9c3'}}>
                        <p className="text-xs font-semibold text-amber-700 mb-1">✉️ 전달사항</p>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{personalNote}</p>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>);
        })()}

        {tab==='grades'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">성적</h2>
          {renderGradeChart()}
          {data.grades.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">성적 기록이 없습니다.</p></div>
          ):(
            <div className="space-y-2">{data.grades.map((g:any)=>{const pct=g.maxScore>0?Math.round((g.score/g.maxScore)*100):0;return(
              <div key={g.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div><p className="text-sm font-semibold text-slate-700">{g.testName}</p><p className="text-xs text-slate-400 mt-0.5">{g.testDate}</p></div>
                  <p className="text-xl font-bold text-blue-600">{g.score}<span className="text-sm text-slate-400 font-normal">/{g.maxScore}</span></p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{width:pct+'%',background:pct>=80?'linear-gradient(to right,#4ade80,#10b981)':pct>=60?'linear-gradient(to right,#60a5fa,#3b82f6)':pct>=40?'linear-gradient(to right,#fbbf24,#f59e0b)':'linear-gradient(to right,#f87171,#ef4444)'}}/></div>
                {(g.avgRaw != null || g.highScore != null || g.lowScore != null) && (
                  <div className="flex gap-3 mt-2">
                    {g.avgRaw != null && <span className="text-xs text-orange-500 font-medium">평균 {g.avgRaw}점</span>}
                    {g.highScore != null && <span className="text-xs text-emerald-500 font-medium">최고 {g.highScore}점</span>}
                    {g.lowScore != null && <span className="text-xs text-red-400 font-medium">최저 {g.lowScore}점</span>}
                  </div>
                )}
              </div>
            );})}</div>
          )}
        </div>)}

        {tab==='assignment'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">과제 완성도</h2>
          {data.dailyReports.filter((r:any) => {
            const att = parseAttitude(r.attitude || '');
            return att.grade !== '';
          }).length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">과제 완성도 기록이 없습니다.</p></div>
          ):(
            data.dailyReports.filter((r:any) => {
              const att = parseAttitude(r.attitude || '');
              return att.grade !== '';
            }).map((r:any)=>{
              const att = parseAttitude(r.attitude || '');
              const gc = getGradeColor(att.grade);
              return(
                <div key={r.id+'-assign'} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{background:gc.text}}/>
                      <span className="text-sm font-semibold text-slate-700">{r.classroom?.subject?.name}</span>
                    </div>
                    <span className="text-xs text-slate-400">{r.date}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center" style={{background:gc.bg,border:`1.5px solid ${gc.border}`}}>
                      <span className="text-xl font-bold" style={{color:gc.text}}>{att.grade}</span>
                      <span className="text-[10px] font-medium" style={{color:gc.text}}>{getGradeLabel(att.grade)}</span>
                    </div>
                    {att.memo && (
                      <div className="flex-1 rounded-xl p-3 bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 mb-0.5">선생님 메모</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{att.memo}</p>
                      </div>
                    )}
                    {!att.memo && (
                      <div className="flex-1">
                        <p className="text-sm text-slate-400">메모 없음</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>)}

        {tab==='video'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">수업영상</h2>
          {!data.videos||data.videos.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">등록된 수업영상이 없습니다.</p></div>
          ):(
            <div className="space-y-3">{data.videos.map((v:any)=>{
              const getYtId=(url:string)=>{try{const u=new URL(url);if(u.hostname==='youtu.be')return u.pathname.slice(1);return u.searchParams.get('v')||'';}catch{return '';}};
              const ytId=getYtId(v.videoUrl||'');
              return(
              <a key={v.id} href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden hover:shadow-md transition-all" style={{textDecoration:'none',WebkitTapHighlightColor:'transparent'}}>
                {ytId&&(<div style={{position:'relative',width:'100%',paddingTop:'56.25%',background:'#000'}}>
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt="" style={{position:'absolute',top:0,left:0,width:'100%',height:'100%',objectFit:'cover'}}/>
                  <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:48,height:48,background:'rgba(0,0,0,0.7)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    <div style={{width:0,height:0,borderTop:'10px solid transparent',borderBottom:'10px solid transparent',borderLeft:'18px solid white',marginLeft:4}}/>
                  </div>
                </div>)}
                <div className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">{v.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-slate-400">{v.date}</span>
                    <span className="text-xs text-slate-300">·</span>
                    <span className="text-xs text-slate-400">{v.classroom?.subject?.name||v.classroom?.name||''}</span>
                    {v.duration&&(<><span className="text-xs text-slate-300">·</span><span className="text-xs text-slate-400">{v.duration}</span></>)}
                  </div>
                  {v.description&&(<p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{v.description}</p>)}
                </div>
              </a>);
            })}</div>
          )}
        </div>)}


        {tab==='counsel'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">상담 요청</h2>
          {!showCounselForm?(
            <div className="space-y-3">
              <button onClick={()=>{setCounselType('PHONE');setShowCounselForm(true);}} className="w-full p-5 bg-white rounded-2xl border border-slate-100 shadow-sm text-left hover:shadow-md hover:border-blue-200 transition-all" style={{WebkitTapHighlightColor:'transparent'}}>
                <div className="flex items-center gap-3"><div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center text-xl">📞</div><div><p className="font-semibold text-slate-700">전화 상담 요청</p><p className="text-sm text-slate-400 mt-0.5">선생님이 전화를 드립니다</p></div></div>
              </button>
              <button onClick={()=>{setCounselType('VISIT');setShowCounselForm(true);}} className="w-full p-5 bg-white rounded-2xl border border-slate-100 shadow-sm text-left hover:shadow-md hover:border-emerald-200 transition-all" style={{WebkitTapHighlightColor:'transparent'}}>
                <div className="flex items-center gap-3"><div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl" style={{background:'#ecfdf5'}}>🏫</div><div><p className="font-semibold text-slate-700">방문 상담 요청</p><p className="text-sm text-slate-400 mt-0.5">학원에 방문하여 상담</p></div></div>
              </button>
            </div>
          ):(
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm space-y-4">
              <div className="flex items-center gap-2"><span className="text-lg">{counselType==='PHONE'?'📞':'🏫'}</span><p className="font-semibold text-slate-700">{counselType==='PHONE'?'전화':'방문'} 상담 요청</p></div>
              <textarea value={counselDesc} onChange={e=>setCounselDesc(e.target.value)} placeholder="상담 내용을 입력해주세요" rows={4} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none transition-all resize-none" style={{background:'#f8fafc'}}/>
              <div className="flex gap-2">
                <button onClick={()=>setShowCounselForm(false)} className="flex-1 py-3 rounded-xl text-sm font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">취소</button>
                <button onClick={submitCounsel} className="flex-1 py-3 rounded-xl text-sm font-medium text-white shadow-md transition-all" style={{background:'linear-gradient(135deg,#3b82f6,#4f46e5)',boxShadow:'0 4px 12px rgba(59,130,246,0.25)'}}>요청하기</button>
              </div>
            </div>
          )}
        </div>)}

        {tab==='memo'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">메모</h2>
          <div className="rounded-xl px-4 py-3 text-xs text-blue-600 leading-relaxed" style={{background:'#eff6ff',border:'1px solid #bfdbfe'}}>
            선생님께 간단히 전달하실 말씀을 입력해주시면, 선생님이 확인 후 답장 드리겠습니다.
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm space-y-3 max-h-96 overflow-y-auto">
            {memos.length===0?(
              <div className="py-8 text-center"><p className="text-slate-400 text-sm">메모가 없습니다</p></div>
            ):(
              memos.map((m:any)=>(
                <div key={m.id} className={"px-4 py-3 rounded-2xl max-w-[85%] "+(m.isFromParent?'ml-auto text-white':'mr-auto text-slate-700')}
                  style={m.isFromParent?{background:'linear-gradient(135deg,#3b82f6,#4f46e5)'}:{background:'#f1f5f9'}}>
                  <p className="text-sm leading-relaxed">{m.content}</p>
                  <p className={"text-xs mt-1.5 "+(m.isFromParent?'opacity-70':'text-slate-400')}>{m.author?.name}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newMemo} onChange={e=>setNewMemo(e.target.value)} placeholder="메모를 입력하세요..." className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none transition-all bg-white" onKeyDown={e=>e.key==='Enter'&&sendMemo()}/>
            <button onClick={sendMemo} disabled={!newMemo.trim()} className="px-5 py-3 rounded-xl text-sm font-medium text-white disabled:opacity-40 transition-all" style={{background:'linear-gradient(135deg,#3b82f6,#4f46e5)',boxShadow:newMemo.trim()?'0 4px 12px rgba(59,130,246,0.25)':'none'}}>전송</button>
          </div>
        </div>)}

        {tab==='wrongAnswers'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">오답목록</h2>
          {waStats && (
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-red-50 rounded-2xl p-3 text-center border border-red-100">
                <p className="text-xl font-bold text-red-600">{waStats.active}</p>
                <p className="text-xs text-red-400">미해결</p>
              </div>
              <div className="bg-green-50 rounded-2xl p-3 text-center border border-green-100">
                <p className="text-xl font-bold text-green-600">{waStats.mastered}</p>
                <p className="text-xs text-green-400">해결</p>
              </div>
              <div className="bg-blue-50 rounded-2xl p-3 text-center border border-blue-100">
                <p className="text-xl font-bold text-blue-600">{waStats.rate}%</p>
                <p className="text-xs text-blue-400">습득률</p>
              </div>
            </div>
          )}
          {/* Practice test generation */}
          {waStats && waStats.active > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-4 border border-blue-100">
              <p className="font-medium text-slate-800 mb-2">연습 테스트 만들기</p>
              <p className="text-xs text-slate-500 mb-3">미해결 오답에서 랜덤으로 출제됩니다</p>
              <div className="flex flex-wrap gap-2">
                {[5, 10, waStats.active].filter((n: number, i: number, arr: number[]) => n <= waStats.active && arr.indexOf(n) === i).map((cnt: number) => (
                  <button key={cnt} onClick={async () => {
                    try {
                      const sid = data.students[0].id;
                      const classroomId = wrongAnswers.find((wa: any) => wa.status === 'ACTIVE')?.classroomId;
                      if (!classroomId) return;
                      const res = await fetch('/api/wrong-answers/tests', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ studentId: sid, classroomId, maxCount: cnt, isParentTest: true }),
                      });
                      if (!res.ok) throw new Error('생성 실패');
                      const test = await res.json();
                      // Generate printable test
                      const shuffled = test.items.sort(() => Math.random() - 0.5);
                      const problems = shuffled.map((item: any, idx: number) => {
                        const wa = item.wrongAnswer;
                        let imgUrl = '';
                        if (wa.testPaper?.pages) {
                          const page = wa.testPaper.pages.find((p: any) => p.pageNumber === wa.problemNumber);
                          if (page) imgUrl = page.imageUrl;
                        }
                        if (!imgUrl && wa.problemImage) imgUrl = wa.problemImage;
                        return { num: idx + 1, originalNum: wa.problemNumber, testName: wa.testName, imgUrl };
                      });
                      const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
                      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>연습 테스트 - ${s?.name}</title>
<style>@page{size:A4;margin:12mm 10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Malgun Gothic',sans-serif;color:#222;background:#fff;padding:10px}.header{text-align:center;border-bottom:2px solid #222;padding-bottom:8px;margin-bottom:12px}.header h1{font-size:20px;margin-bottom:4px}.info-row{display:flex;justify-content:center;gap:16px;font-size:12px;color:#555}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.row-gap{margin-top:20px}.problem{border:1px solid #bbb;border-radius:6px;overflow:hidden;page-break-inside:avoid;display:flex;flex-direction:column;min-height:280px}.problem-header{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:#f3f4f6;border-bottom:1px solid #ddd;font-size:12px}.problem-header .num{font-weight:bold;font-size:16px;color:#2563eb}.problem-header .source{color:#999;font-size:10px}.problem-body{padding:8px;text-align:center;flex:1;display:flex;align-items:center;justify-content:center}.problem-body img{max-width:100%;max-height:220px;object-fit:contain}.problem-body .no-img{color:#ccc;padding:20px;font-size:11px}.answer-area{border-top:1px dashed #ccc;padding:6px 10px;min-height:55px}.answer-area span{font-size:11px;color:#aaa}.page-break{page-break-after:always}.footer{margin-top:16px;text-align:center;font-size:10px;color:#bbb}.btn-bar{display:flex;gap:10px;justify-content:center;margin-bottom:12px}.btn-bar button{padding:10px 28px;font-size:15px;border:none;border-radius:8px;cursor:pointer;font-weight:500}.btn-pdf{background:#2563eb;color:#fff}.btn-back{background:#6b7280;color:#fff}@media print{.no-print{display:none!important}body{padding:0}}</style></head><body>
<div class="no-print btn-bar"><button class="btn-back" onclick="window.close()">← 뒤로가기</button><button class="btn-pdf" onclick="window.print()">PDF 저장</button></div>
<div class="header"><h1>연습 테스트</h1><div class="info-row"><span><b>이름:</b> ${s?.name}</span><span><b>날짜:</b> ${today}</span><span><b>총 ${problems.length}문항</b></span></div></div>
<div class="grid">${problems.map((p: any, idx: number) => `<div class="problem"><div class="problem-header"><span class="num">${p.num}</span><span class="source">${p.testName} #${p.originalNum}</span></div><div class="problem-body">${p.imgUrl ? `<img src="${p.imgUrl}" />` : '<div class="no-img">문제 이미지 없음</div>'}</div><div class="answer-area"><span>답:</span></div></div>${(idx+1)%2===0&&idx<problems.length-1?'</div><div class="row-gap"></div><div class="grid">':''}`).join('')}</div>
<div class="footer">수학탐구 오답관리 시스템 - 연습용</div></body></html>`;
                      const w = window.open('', '_blank');
                      if (w) { w.document.write(html); w.document.close(); }
                      // Delete the temporary test (parent tests are disposable)
                      await fetch(`/api/wrong-answers/tests/${test.id}`, { method: 'DELETE' }).catch(() => {});
                    } catch (e) { alert('테스트 생성에 실패했습니다'); }
                  }}
                    className="px-4 py-2.5 bg-white text-blue-600 border border-blue-200 rounded-xl text-sm font-medium hover:bg-blue-50 transition-all">
                    {cnt === waStats.active ? `전체 (${cnt})` : `${cnt}문항`}
                  </button>
                ))}
              </div>
            </div>
          )}
          {wrongAnswers.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100">
              <p className="text-slate-400 text-sm">등록된 오답이 없습니다.</p>
            </div>
          ) : (
            Object.entries(
              wrongAnswers.reduce<Record<string, any[]>>((acc, wa) => {
                if (!acc[wa.testName]) acc[wa.testName] = [];
                acc[wa.testName].push(wa);
                return acc;
              }, {})
            ).map(([testName, items]) => (
              <div key={testName} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                <button
                  onClick={() => setExpandedWA(prev => {
                    const next = new Set(prev);
                    next.has(testName) ? next.delete(testName) : next.add(testName);
                    return next;
                  })}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div>
                    <p className="font-medium text-slate-800">{testName}</p>
                    <p className="text-xs text-slate-400">
                      미해결 {items.filter((i: any) => i.status === 'ACTIVE').length}개 /
                      해결 {items.filter((i: any) => i.status === 'MASTERED').length}개
                    </p>
                  </div>
                  <span className="text-slate-400">{expandedWA.has(testName) ? '▲' : '▼'}</span>
                </button>
                {expandedWA.has(testName) && (
                  <div className="px-4 pb-4">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {items.sort((a: any, b: any) => a.problemNumber - b.problemNumber).map((wa: any) => (
                        <span key={wa.id}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium ${wa.status === 'ACTIVE' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {wa.problemNumber}번{wa.round > 1 ? ` (${wa.round}회)` : ''}
                        </span>
                      ))}
                    </div>
                    {/* 오답 문제 이미지 보기 */}
                    {items.some((wa: any) => wa.testPaper?.pages?.length > 0) && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-500 mb-1">문제 이미지 확인</p>
                        {items.filter((wa: any) => wa.status === 'ACTIVE').sort((a: any, b: any) => a.problemNumber - b.problemNumber).map((wa: any) => {
                          const page = wa.testPaper?.pages?.find((p: any) => p.pageNumber === wa.problemNumber);
                          const imgUrl = page?.imageUrl || wa.problemImage;
                          if (!imgUrl) return null;
                          return (
                            <div key={wa.id} className="border border-slate-200 rounded-xl overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 border-b border-slate-100">
                                <span className="text-xs font-bold text-blue-600">{wa.problemNumber}번</span>
                                <span className="text-[10px] text-slate-400">{wa.testName}</span>
                              </div>
                              <div className="p-2">
                                <img src={imgUrl} alt={`문제 ${wa.problemNumber}`} className="w-full object-contain max-h-64 rounded" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>)}

      </div>
      <PushNotificationManager />
    </div>
  );
              }
