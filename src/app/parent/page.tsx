'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PushNotificationManager from '@/components/PushNotificationManager';

export default function ParentPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('homework');
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [showCounselForm, setShowCounselForm] = useState(false);
  const [counselType, setCounselType] = useState('PHONE');
  const [counselDesc, setCounselDesc] = useState('');

  useEffect(() => {
    fetch('/api/parent/data')
      .then(r => { if (!r.ok) { router.push('/auth/login'); return null; } return r.json(); })
      .then(d => { if (d) { setData(d); if (d.students?.[0]) fetchMemos(d.students[0].id); } })
      .catch(() => router.push('/auth/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fetchMemos = (sid: string) => {
    fetch('/api/parent/memo?studentId=' + sid).then(r => r.json()).then(setMemos).catch(() => {});
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
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  };

  const parseContent = (content: string) => {
    if (!content) return '';
    try {
      let parsed = content;
      while (typeof parsed === 'string' && (parsed.startsWith('{') || parsed.startsWith('"'))) {
        const obj = JSON.parse(parsed);
        if (typeof obj === 'string') {
          parsed = obj;
        } else if (typeof obj === 'object' && obj !== null) {
          if (obj.progressNote) return obj.progressNote;
          if (obj.studentProgress) return obj.studentProgress;
          if (obj.content) {
            parsed = obj.content;
            continue;
          }
          return content;
        } else {
          return String(obj);
        }
      }
      return parsed || content;
    } catch {
      return content;
    }
  };

  const getYtId = (url: string) => {
    const m = url.match(/(?:youtu\.be\/|v=)([^&]+)/);
    return m ? m[1] : null;
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
    {id:'homework',label:'숙제',icon:'📝'},
    {id:'notice',label:'공지',icon:'📢'},
    {id:'grades',label:'성적',icon:'📊'},
    {id:'attendance',label:'출결',icon:'📅'},
    {id:'video',label:'수업영상',icon:'🎬'},
    {id:'counsel',label:'상담요청',icon:'💬'},
    {id:'memo',label:'메모',icon:'💭'}
  ];

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
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={"flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 "+(tab===t.id?'text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200/60')}
              style={tab===t.id?{background:'linear-gradient(135deg,#3b82f6,#4f46e5)',boxShadow:'0 4px 12px rgba(59,130,246,0.25)'}:{}}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
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
                {r.content && (
                  <div className="mt-2 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs font-semibold text-blue-500 mb-1">수업진도</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{parseContent(r.content)}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>)}

        {tab==='notice'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">공지</h2>
          {data.dailyReports.filter((r:any) => r.specialNote).length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">공지가 없습니다.</p></div>
          ):(
            data.dailyReports.filter((r:any) => r.specialNote).map((r:any)=>(
              <div key={r.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"/>
                    <span className="text-sm font-semibold text-slate-700">{r.classroom?.subject?.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{r.date}</span>
                </div>
                <div className="rounded-xl p-3" style={{background:'#fff1f2'}}>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.specialNote}</p>
                </div>
              </div>
            ))
          )}
        </div>)}

        {tab==='grades'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">성적</h2>
          {renderGradeChart()}
          {data.grades.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">성적 기록이 없습니다.</p></div>
          ):(
            <div className="space-y-2">{data.grades.map((g:any)=>{const pct=g.maxScore>0?Math.round((g.score/g.maxScore)*100):0;return(
              <div key={g.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div><p className="text-sm font-semibold text-slate-700">{g.testName}</p><p className="text-xs text-slate-400 mt-0.5">{g.testDate}{g.classAverage != null && <span className="ml-2 text-orange-500">반평균 {g.classAverage}점</span>}</p></div>
                  <p className="text-xl font-bold text-blue-600">{g.score}<span className="text-sm text-slate-400 font-normal">/{g.maxScore}</span></p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{width:pct+'%',background:pct>=80?'linear-gradient(to right,#4ade80,#10b981)':pct>=60?'linear-gradient(to right,#60a5fa,#3b82f6)':pct>=40?'linear-gradient(to right,#fbbf24,#f59e0b)':'linear-gradient(to right,#f87171,#ef4444)'}}/></div>
              </div>
            );})}</div>
          )}
        </div>)}

        {tab==='attendance'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">출결</h2>
          {data.attendance.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">출결 기록이 없습니다.</p></div>
          ):(
            <div className="space-y-2">{data.attendance.map((a:any)=>(
              <div key={a.id} className="bg-white rounded-2xl px-4 py-3 border border-slate-100 shadow-sm flex justify-between items-center">
                <div><p className="text-sm font-medium text-slate-700">{a.date}</p><p className="text-xs text-slate-400">{a.classroom?.subject?.name}</p></div>
                <span className={"px-3 py-1 rounded-full text-xs font-semibold "+(a.status==='PRESENT'?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-600')}
                  style={a.status==='PRESENT'?{boxShadow:'inset 0 0 0 1px rgba(16,185,129,0.2)'}:a.status==='ABSENT'?{boxShadow:'inset 0 0 0 1px rgba(239,68,68,0.2)'}:{background:'#fffbeb',color:'#d97706',boxShadow:'inset 0 0 0 1px rgba(217,119,6,0.2)'}}>
                  {a.status==='PRESENT'?'출석':a.status==='ABSENT'?'결석':'지각'}
                </span>
              </div>
            ))}</div>
          )}
        </div>)}

        {tab==='video'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">수업 영상</h2>
          {data.videos.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">영상이 없습니다.</p></div>
          ):(
            data.videos.map((v:any)=>{const yi=getYtId(v.videoUrl);return(
              <div key={v.id} className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                {yi?(<iframe className="w-full aspect-video" src={'https://www.youtube.com/embed/'+yi} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share" style={{maxHeight:'100vh'}}/>):(<a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="block p-4 text-blue-600 hover:bg-blue-50 transition-colors">🔗 {v.videoUrl}</a>)}
                <div className="p-4"><p className="font-semibold text-sm text-slate-700">{v.title}</p><p className="text-xs text-slate-400 mt-1">{v.date}</p></div>
              </div>
            );})
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

      </div>
      <PushNotificationManager />
    </div>
  );
}'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PushNotificationManager from '@/components/PushNotificationManager';

export default function ParentPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('homework');
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [showCounselForm, setShowCounselForm] = useState(false);
  const [counselType, setCounselType] = useState('PHONE');
  const [counselDesc, setCounselDesc] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<any[]>([]);
  const [wrongAnswerTests, setWrongAnswerTests] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/parent/data')
      .then(r => { if (!r.ok) { router.push('/auth/login'); return null; } return r.json(); })
      .then(d => { if (d) { setData(d); if (d.students?.[0]) {
            fetchMemos(d.students[0].id);
            fetchWrongAnswers(d.students[0].id);
          } } })
      .catch(() => router.push('/auth/login'))
      .finally(() => setLoading(false));
  }, [router]);

  const fetchMemos = (sid: string) => {
    fetch('/api/parent/memo?studentId=' + sid).then(r => r.json()).then(setMemos).catch(() => {});
  };

  const fetchWrongAnswers = (sid: string) => {
    fetch('/api/wrong-answers?studentId=' + sid).then(r => r.json()).then(data => {
      setWrongAnswers(data.wrongAnswers || []);
    }).catch(() => {});
    fetch('/api/wrong-answers/tests?studentId=' + sid).then(r => r.json()).then(data => {
      setWrongAnswerTests(data.tests || []);
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
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  };

  const getYtId = (url: string) => {
    const m = url.match(/(?:youtu\.be\/|v=)([^&]+)/);
    return m ? m[1] : null;
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
    {id:'homework',label:'숙제',icon:'📝'},
    {id:'notice',label:'공지',icon:'📢'},
    {id:'grades',label:'성적',icon:'📊'},
    {id:'attendance',label:'출결',icon:'📅'},
    {id:'video',label:'수업영상',icon:'🎬'},
    {id:'counsel',label:'상담요청',icon:'💬'},
    {id:'wrongAnswers',label:'오답관리',icon:'✅'},
    {id:'memo',label:'메모',icon:'💭'}
  ];

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
        <div className="flex gap-1.5 overflow-x-auto pb-1" style={{scrollbarWidth:'none',msOverflowStyle:'none'}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              className={"flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 "+(tab===t.id?'text-white shadow-md':'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200/60')}
              style={tab===t.id?{background:'linear-gradient(135deg,#3b82f6,#4f46e5)',boxShadow:'0 4px 12px rgba(59,130,246,0.25)'}:{}}>
              <span className="mr-1.5">{t.icon}</span>{t.label}
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
                {r.content && (
                  <div className="mt-2 rounded-xl p-3 bg-slate-50">
                    <p className="text-xs font-semibold text-blue-500 mb-1">수업진도</p>
                    <p className="text-sm text-slate-600 leading-relaxed">{r.content}</p>
                  </div>
                )}
              </div>
            ))
          )}
        </div>)}

        {tab==='notice'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">공지</h2>
          {data.dailyReports.filter((r:any) => r.specialNote).length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">공지가 없습니다.</p></div>
          ):(
            data.dailyReports.filter((r:any) => r.specialNote).map((r:any)=>(
              <div key={r.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-rose-500"/>
                    <span className="text-sm font-semibold text-slate-700">{r.classroom?.subject?.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{r.date}</span>
                </div>
                <div className="rounded-xl p-3" style={{background:'#fff1f2'}}>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{r.specialNote}</p>
                </div>
              </div>
            ))
          )}
        </div>)}

        {tab==='grades'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">성적</h2>
          {renderGradeChart()}
          {data.grades.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">성적 기록이 없습니다.</p></div>
          ):(
            <div className="space-y-2">{data.grades.map((g:any)=>{const pct=g.maxScore>0?Math.round((g.score/g.maxScore)*100):0;return(
              <div key={g.id} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div><p className="text-sm font-semibold text-slate-700">{g.testName}</p><p className="text-xs text-slate-400 mt-0.5">{g.testDate}{g.classAverage != null && <span className="ml-2 text-orange-500">반평균 {g.classAverage}점</span>}</p></div>
                  <p className="text-xl font-bold text-blue-600">{g.score}<span className="text-sm text-slate-400 font-normal">/{g.maxScore}</span></p>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500" style={{width:pct+'%',background:pct>=80?'linear-gradient(to right,#4ade80,#10b981)':pct>=60?'linear-gradient(to right,#60a5fa,#3b82f6)':pct>=40?'linear-gradient(to right,#fbbf24,#f59e0b)':'linear-gradient(to right,#f87171,#ef4444)'}}/></div>
              </div>
            );})}</div>
          )}
        </div>)}

        {tab==='attendance'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">출결</h2>
          {data.attendance.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">출결 기록이 없습니다.</p></div>
          ):(
            <div className="space-y-2">{data.attendance.map((a:any)=>(
              <div key={a.id} className="bg-white rounded-2xl px-4 py-3 border border-slate-100 shadow-sm flex justify-between items-center">
                <div><p className="text-sm font-medium text-slate-700">{a.date}</p><p className="text-xs text-slate-400">{a.classroom?.subject?.name}</p></div>
                <span className={"px-3 py-1 rounded-full text-xs font-semibold "+(a.status==='PRESENT'?'bg-emerald-50 text-emerald-600':'bg-red-50 text-red-600')}
                  style={a.status==='PRESENT'?{boxShadow:'inset 0 0 0 1px rgba(16,185,129,0.2)'}:a.status==='ABSENT'?{boxShadow:'inset 0 0 0 1px rgba(239,68,68,0.2)'}:{background:'#fffbeb',color:'#d97706',boxShadow:'inset 0 0 0 1px rgba(217,119,6,0.2)'}}>
                  {a.status==='PRESENT'?'출석':a.status==='ABSENT'?'결석':'지각'}
                </span>
              </div>
            ))}</div>
          )}
        </div>)}

        {tab==='video'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">수업 영상</h2>
          {data.videos.length===0?(
            <div className="bg-white rounded-2xl p-8 text-center border border-slate-100"><p className="text-slate-400 text-sm">영상이 없습니다.</p></div>
          ):(
            data.videos.map((v:any)=>{const yi=getYtId(v.videoUrl);return(
              <div key={v.id} className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm">
                {yi?(<iframe className="w-full aspect-video" src={'https://www.youtube.com/embed/'+yi} allowFullScreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen; web-share" style={{maxHeight:'100vh'}}/>):(<a href={v.videoUrl} target="_blank" rel="noopener noreferrer" className="block p-4 text-blue-600 hover:bg-blue-50 transition-colors">🔗 {v.videoUrl}</a>)}
                <div className="p-4"><p className="font-semibold text-sm text-slate-700">{v.title}</p><p className="text-xs text-slate-400 mt-1">{v.date}</p></div>
              </div>
            );})
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

        

        {tab==='wrongAnswers'&&(<div className="space-y-4">
          <h2 className="text-base font-bold text-slate-800 px-1">오답 관리</h2>
          
          {/* Active Wrong Answers */}
          <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-red-500"/>
              <p className="text-sm font-semibold text-slate-700">틀린 문제 ({wrongAnswers.filter((w:any) => w.status === 'ACTIVE').length}개)</p>
            </div>
            {wrongAnswers.filter((w:any) => w.status === 'ACTIVE').length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">현재 틀린 문제가 없습니다 🎉</p>
            ) : (
              <div className="space-y-2">
                {wrongAnswers.filter((w:any) => w.status === 'ACTIVE').map((w:any) => (
                  <div key={w.id} className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-red-50 border border-red-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{w.testName} - {w.problemNumber}번</p>
                      <p className="text-xs text-slate-400 mt-0.5">{w.classroom?.name} · {w.round}회차</p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-600 font-medium">오답</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mastered Wrong Answers */}
          {wrongAnswers.filter((w:any) => w.status === 'MASTERED').length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-500"/>
                <p className="text-sm font-semibold text-slate-700">마스터한 문제 ({wrongAnswers.filter((w:any) => w.status === 'MASTERED').length}개)</p>
              </div>
              <div className="space-y-2">
                {wrongAnswers.filter((w:any) => w.status === 'MASTERED').map((w:any) => (
                  <div key={w.id} className="flex justify-between items-center px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{w.testName} - {w.problemNumber}번</p>
                      <p className="text-xs text-slate-400 mt-0.5">{w.classroom?.name}</p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-600 font-medium">완료 ✓</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Wrong Answer Tests */}
          {wrongAnswerTests.length > 0 && (
            <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-blue-500"/>
                <p className="text-sm font-semibold text-slate-700">오답 테스트 이력</p>
              </div>
              <div className="space-y-2">
                {wrongAnswerTests.map((t:any) => (
                  <div key={t.id} className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-medium text-slate-700">{t.round}회차 오답 테스트</p>
                      <span className={"text-xs px-2.5 py-1 rounded-full font-medium " + (t.status === 'GRADED' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600')}>
                        {t.status === 'GRADED' ? '채점 완료' : '채점 대기 (선생님이 채점합니다)'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{new Date(t.createdAt).toLocaleDateString('ko-KR')} · {t.items?.length || 0}문제</p>
                    {t.status === 'GRADED' && t.items && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {t.items.map((item:any, idx:number) => (
                          <span key={idx} className={"w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold " + (item.isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600')}>
                            {item.isCorrect ? 'O' : 'X'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>)}

        {tab==='memo'&&(<div className="space-y-3">
          <h2 className="text-base font-bold text-slate-800 px-1">메모</h2>
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

      </div>
      <PushNotificationManager />
    </div>
  );
}
