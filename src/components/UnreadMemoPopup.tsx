'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

interface Memo {
  id: string;
  content: string;
  createdAt: string;
  student: { name: string; id: string };
  author: { name: string };
}

export default function UnreadMemoPopup() {
  const { data: session } = useSession();
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [replyContent, setReplyContent] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (session?.user?.role === 'ADMIN' || session?.user?.role === 'INSTRUCTOR') {
      fetchUnreadMemos();
    }
  }, [session]);

  const fetchUnreadMemos = async () => {
    try {
      const res = await fetch('/api/memos');
      if (res.ok) {
        const data = await res.json();
        if (data.length > 0) {
          setMemos(data);
          setIsOpen(true);
        }
      }
    } catch (error) {
      console.error('Failed to fetch unread memos:', error);
    }
  };

  const handleReply = async (memoId: string) => {
    const content = replyContent[memoId];
    if (!content?.trim()) return;

    setSending((prev) => ({ ...prev, [memoId]: true }));
    try {
      const res = await fetch(`/api/memos/${memoId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });

      if (res.ok) {
        setMemos((prev) => prev.filter((m) => m.id !== memoId));
        setReplyContent((prev) => {
          const next = { ...prev };
          delete next[memoId];
          return next;
        });
      }
    } catch (error) {
      console.error('Failed to send reply:', error);
    } finally {
      setSending((prev) => ({ ...prev, [memoId]: false }));
    }
  };

  const handleClose = async (memoId: string) => {
    try {
      await fetch(`/api/memos/${memoId}/read`, { method: 'PATCH' });
      setMemos((prev) => prev.filter((m) => m.id !== memoId));
    } catch (error) {
      console.error('Failed to mark memo as read:', error);
    }
  };

  const handleCloseAll = () => {
    memos.forEach((m) => {
      fetch(`/api/memos/${m.id}/read`, { method: 'PATCH' });
    });
    setMemos([]);
    setIsOpen(false);
  };

  if (!isOpen || memos.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden">
        <div className="p-4 bg-blue-600 text-white flex justify-between items-center">
          <h2 className="text-lg font-bold">
            \uD83D\uDCEC \uC77D\uC9C0 \uC54A\uC740 \uD559\uBD80\uBAA8 \uBA54\uBAA8 ({memos.length}\uAC74)
          </h2>
          <button
            onClick={handleCloseAll}
            className="text-white/80 hover:text-white text-sm"
          >
            \uBAA8\uB450 \uC77D\uC74C \uCC98\uB9AC
          </button>
        </div>
        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-4">
          {memos.map((memo) => (
            <div key={memo.id} className="border rounded-xl p-4 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-semibold text-blue-700">{memo.student.name}</span>
                  <span className="text-gray-500 text-sm ml-2">({memo.author.name})</span>
                </div>
                <span className="text-xs text-gray-400">
                  {new Date(memo.createdAt).toLocaleDateString('ko-KR')}
                </span>
              </div>
              <p className="text-gray-800 mb-3 whitespace-pre-wrap">{memo.content}</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={replyContent[memo.id] || ''}
                  onChange={(e) =>
                    setReplyContent((prev) => ({ ...prev, [memo.id]: e.target.value }))
                  }
                  placeholder="\uB2F5\uC7A5\uC744 \uC785\uB825\uD558\uC138\uC694..."
                  className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <button
                  onClick={() => handleReply(memo.id)}
                  disabled={sending[memo.id] || !replyContent[memo.id]?.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {sending[memo.id] ? '...' : '\uB2F5\uC7A5'}
                </button>
                <button
                  onClick={() => handleClose(memo.id)}
                  className="text-gray-400 hover:text-gray-600 px-2 py-2 text-sm"
                >
                  \uB2EB\uAE30
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
