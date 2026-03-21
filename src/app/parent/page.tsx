'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ParentPage() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('report');
  const [memos, setMemos] = useState<any[]>([]);
  const [newMemo, setNewMemo] = useState('');
  const [showCounselForm, setShowCounselForm] = useState(false);
  const [counselType, setCounselType] = useState('PHONE');
  const [counselDesc, setCounselDesc] = useState('');

  useEffect(() => {
    fetch('/api/parent/data').then(r => { if (!r.ok) { router.push('/auth/login'); return null; } return r.json(); }).then(d => { if (d) { setData(d); if (d.students?.[0]) fetchMemos(d.students[0].id); } }).catch(() => router.push('/auth/login')).finally(() => setLoading(false));
  }, [router]);

  const fetchMemos = (sid: string) => { fetch('/api/parent/memo?studentId=' + sid).then(r => r.json()).then(setMemos).catch(() => {}); };
  const sendMemo = async () => { if (!newMemo.trim() || !data?.students?.[0]) return; await fetch('/api/parent/memo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: data.students[0].id, content: newMemo }) }); setNewMemo(''); fetchMemos(data.students[0].id); };
  const submitCounsel = async () => { if (!data?.students?.[0]) return; await fetch('/api/counseling', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: data.students[0].id, title: counselType === 'PHONE' ? '전화상담 요청' : '방문상담 요청', description: counselDesc, counselingType: counselType }) }); alert('상담 요청이 접수되었습니다.'); setShowCounselForm(false); setCounselDesc(''); };
  const handleLogout = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.push('/auth/login'); };
  const getYtId = (url: string) => { const m = url.match(/(?:youtu\.be\/|v=)([^&]+)/); return m ? m[1] : null; };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p>로딩 중...</p></div>;
  if (!data) return null;
  const s = data.students?.[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b sticky top-0 z-40 px-4 py-3 flex justify-between items-center"><h1 className="text-xl font-bold">수학탐구</h1><div className="flex items-center gap-3"><span className="text-sm text-gray-600">{data.user.name}</span><button onClick={handleLogout} className="text-xs text-red-500 border border-red-300 px-2 py-1 rounded">로그아웃</button></div></div>
      {s && <div className="bg-blue-600 text-white p-4"><p className="font-bold text-lg">{s.name}</p><p className="text-sm opacity-80">{s.school||''} {s.grade?s.grade+'학년':''}</p></div>}
      <div className="flex overflow-x-auto border-b bg-white">{[{id:'report',l:'리포트'},{id:'grades',l:'성적/출결'},{id:'notice',l:'공지'},{id:'video',l:'수업영상'},{id:'counsel',l:'상담요청'},{id:'memo',l:'메모'}].map(t=><button key={t.id} onClick={()=>setTab(t.id)} className={'flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 '+(tab===t.id?'text-blue-600 border-blue-600':'text-gray-500 border-transparent')}>{t.l}</button>)}</div>
      <div className="p-4 max-w-2xl mx-auto">
        {tab==='report'&&<div className="space-y-4"><h2 className="text-lg font-bold">데일리 리포트</h2>{data.dailyReports.length===0?<p className="text-gray-500 text-sm">최근 리포트가 없습니다.</p>:data.dailyReports.map((r:any)=><div key={r.id} className="bg-white border rounded-lg p-4 shadow-sm"><div className="flex justify-between mb-2"><span className="text-sm font-medium text-blue-600">{r.classroom?.subject?.name}</span><span className="text-xs text-gray-400">{r.date}</span></div>{r.content&&<div className="mb-2"><p className="text-xs text-gray-500">수업진도</p><p className="text-sm">{r.content}</p></div>}{r.homework&&<div className="mb-2"><p className="text-xs text-gray-500">숙제</p><p className="text-sm font-medium">{r.homework}</p></div>}{r.specialNote&&<div><p className="text-xs text-gray-500">공지</p><p className="text-sm">{r.specialNote}</p></div>}</div>)}</div>}
        {tab==='grades'&&<div className="space-y-6"><div><h2 className="text-lg font-bold mb-3">성적</h2>{data.grades.length===0?<p className="text-gray-500 text-sm">성적 기록이 없습니다.</p>:<div className="space-y-2">{data.grades.map((g:any)=><div key={g.id} className="bg-white border rounded-lg p-3 flex justify-between"><div><p className="text-sm font-medium">{g.testName}</p><p className="text-xs text-gray-400">{g.testDate}</p></div><p className="text-lg font-bold text-blue-600">{g.score}<span className="text-sm text-gray-400">/{g.maxScore}</span></p></div>)}</div>}</div><div><h2 className="text-lg font-bold mb-3">출결</h2>{data.attendance.length===0?<p className="text-gray-500 text-sm">출결 기록이 없습니다.</p>:<div className="space-y-2">{data.attendance.map((a:any)=><div key={a.id} className="bg-white border rounded-lg p-3 flex justify-between"><div><p className="text-sm">{a.date}</p><p className="text-xs text-gray-400">{a.classroom?.subject?.name}</p></div><span className={'px-2 py-1 rounded text-xs font-medium '+(a.status==='PRESENT'?'bg-green-100 text-green-800':a.status==='ABSENT'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800')}>{a.status==='PRESENT'?'출석':a.status==='ABSENT'?'결석':'지각'}</span></div>)}</div>}</div></div>}
        {tab==='notice'&&<div className="space-y-4"><h2 className="text-lg font-bold">공지사항</h2>{data.announcements.length===0?<p className="text-gray-500 text-sm">공지가 없습니다.</p>:data.announcements.map((a:any)=><div key={a.id} className="bg-white border rounded-lg p-4"><p className="font-medium">{a.title}</p><p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{a.content}</p><p className="text-xs text-gray-400 mt-2">{new Date(a.publishDate).toLocaleDateString('ko-KR')}</p></div>)}</div>}
        {tab==='video'&&<div className="space-y-4"><h2 className="text-lg font-bold">수업 영상</h2>{data.videos.length===0?<p className="text-gray-500 text-sm">영상이 없습니다.</p>:data.videos.map((v:any)=>{const yi=getYtId(v.videoUrl);return <div key={v.id} className="bg-white border rounded-lg overflow-hidden">{yi?<iframe className="w-full aspect-video" src={'https://www.youtube.com/embed/'+yi} allowFullScreen/>:<a href={v.videoUrl} target="_blank" className="block p-4 text-blue-600">{v.videoUrl}</a>}<div className="p-3"><p className="font-medium text-sm">{v.title}</p><p className="text-xs text-gray-400">{v.date}</p></div></div>})}</div>}
        {tab==='counsel'&&<div className="space-y-4"><h2 className="text-lg font-bold">상담 요청</h2>{!showCounselForm?<div className="space-y-3"><button onClick={()=>{setCounselType('PHONE');setShowCounselForm(true)}} className="w-full p-4 bg-white border rounded-lg text-left hover:bg-blue-50"><p className="font-medium">📞 전화 상담 요청</p><p className="text-sm text-gray-500">선생님이 전화를 드립니다</p></button><button onClick={()=>{setCounselType('VISIT');setShowCounselForm(true)}} className="w-full p-4 bg-white border rounded-lg text-left hover:bg-green-50"><p className="font-medium">🏫 방문 상담 요청</p><p className="text-sm text-gray-500">학원에 방문하여 상담</p></button></div>:<div className="bg-white border rounded-lg p-4 space-y-3"><p className="font-medium">{counselType==='PHONE'?'전화':'방문'} 상담 요청</p><textarea value={counselDesc} onChange={e=>setCounselDesc(e.target.value)} placeholder="상담 내용을 입력해주세요" rows={3} className="w-full border rounded-lg px-3 py-2 text-sm"/><div className="flex gap-2"><button onClick={()=>setShowCounselForm(false)} className="flex-1 py-2 border rounded-lg text-sm">취소</button><button onClick={submitCounsel} className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm">요청하기</button></div></div>}</div>}
        {tab==='memo'&&<div className="space-y-4"><h2 className="text-lg font-bold">메모</h2><div className="bg-white border rounded-lg p-4 space-y-3 max-h-96 overflow-y-auto">{memos.length===0?<p className="text-gray-500 text-sm text-center">메모가 없습니다</p>:memos.map((m:any)=><div key={m.id} className={'p-3 rounded-lg max-w-[80%] '+(m.isFromParent?'bg-blue-100 ml-auto':'bg-gray-100 mr-auto')}><p className="text-sm">{m.content}</p><p className="text-xs text-gray-400 mt-1">{m.author?.name}</p></div>)}</div><div className="flex gap-2"><input type="text" value={newMemo} onChange={e=>setNewMemo(e.target.value)} placeholder="메모를 입력하세요..." className="flex-1 border rounded-lg px-3 py-2 text-sm" onKeyDown={e=>e.key==='Enter'&&sendMemo()}/><button onClick={sendMemo} disabled={!newMemo.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-gray-400">전송</button></div></div>}
      </div>
    </div>
  );
}
