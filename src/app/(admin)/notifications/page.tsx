'use client';

import { useState, useEffect } from 'react';

interface Announcement {
  id: string;
  title: string;
  content: string;
  targetRole: string;
  isActive: boolean;
  publishDate: string;
  expiryDate?: string;
}

const targetRoleLabels: Record<string, string> = {
  ALL: '전체',
  PARENT: '학부모',
  TEACHER: '강사',
};

export default function NotificationsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    targetRole: 'ALL',
    expiryDate: '',
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      setAnnouncements(data);
    } catch (error) {
      console.error('Failed to fetch announcements:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (announcement?: Announcement) => {
    if (announcement) {
      setEditingId(announcement.id);
      setFormData({
        title: announcement.title,
        content: announcement.content,
        targetRole: announcement.targetRole,
        expiryDate: announcement.expiryDate || '',
      });
    } else {
      setEditingId(null);
      setFormData({
        title: '',
        content: '',
        targetRole: 'ALL',
        expiryDate: '',
      });
    }
    setShowModal(true);
  };

  const handleSaveAnnouncement = async () => {
    if (!formData.title || !formData.content) {
      setMessage('모든 필드를 입력하세요');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        // Update
        const res = await fetch(`/api/announcements/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (res.ok) {
          const updated = await res.json();
          setAnnouncements(
            announcements.map((a) => (a.id === editingId ? updated : a))
          );
          setMessage('수정되었습니다');
        } else {
          setMessage('수정 실패');
        }
      } else {
        // Create
        const res = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });

        if (res.ok) {
          const created = await res.json();
          setAnnouncements([created, ...announcements]);
          setMessage('등록되었습니다');
        } else {
          setMessage('등록 실패');
        }
      }

      setShowModal(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      setMessage('오류가 발생했습니다');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const res = await fetch(`/api/announcements/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setAnnouncements(announcements.filter((a) => a.id !== id));
        setMessage('삭제되었습니다');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('삭제 실패');
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    }
  };

  const handleToggleActive = async (announcement: Announcement) => {
    try {
      const res = await fetch(`/api/announcements/${announcement.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: announcement.title,
          content: announcement.content,
          targetRole: announcement.targetRole,
          isActive: !announcement.isActive,
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        setAnnouncements(
          announcements.map((a) =>
            a.id === announcement.id ? updated : a
          )
        );
        setMessage(
          !announcement.isActive ? '활성화되었습니다' : '비활성화되었습니다'
        );
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (error) {
      setMessage('오류가 발생했습니다');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR');
  };

  const getContentPreview = (content: string, length: number = 100) => {
    return content.length > length
      ? content.substring(0, length) + '...'
      : content;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">공지 관리</h1>

        {/* Create Button */}
        <div className="mb-6">
          <button
            onClick={() => handleOpenModal()}
            className="px-6 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition"
          >
            공지 작성
          </button>
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-screen overflow-y-auto">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingId ? '공지 수정' : '공지 작성'}
              </h2>

              <input
                type="text"
                placeholder="제목"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-blue-500"
              />

              <select
                value={formData.targetRole}
                onChange={(e) =>
                  setFormData({ ...formData, targetRole: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-blue-500"
              >
                <option value="ALL">전체</option>
                <option value="PARENT">학부모</option>
                <option value="TEACHER">강사</option>
              </select>

              <textarea
                placeholder="내용"
                value={formData.content}
                onChange={(e) =>
                  setFormData({ ...formData, content: e.target.value })
                }
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4 focus:outline-none focus:ring-blue-500"
              />

              <input
                type="date"
                value={formData.expiryDate}
                onChange={(e) =>
                  setFormData({ ...formData, expiryDate: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md mb-6 focus:outline-none focus:ring-blue-500"
                placeholder="만료 날짜 (선택사항)"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-md font-medium hover:bg-gray-400 transition"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveAnnouncement}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Announcements List */}
        {loading ? (
          <p className="text-center text-gray-500">로딩 중...</p>
        ) : announcements.length === 0 ? (
          <p className="text-center text-gray-500">공지가 없습니다</p>
        ) : (
          <div className="space-y-4">
            {announcements.map((announcement) => (
              <div
                key={announcement.id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-bold text-gray-900">
                        {announcement.title}
                      </h3>
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${
                          announcement.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {announcement.isActive ? '활성' : '비활성'}
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                        {targetRoleLabels[announcement.targetRole]}
                      </span>
                    </div>

                    <p className="text-gray-600 text-sm mb-2">
                      {getContentPreview(announcement.content)}
                    </p>

                    <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                      <span>작성일: {formatDate(announcement.publishDate)}</span>
                      {announcement.expiryDate && (
                        <span>만료일: {announcement.expiryDate}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleToggleActive(announcement)}
                      className={`px-3 py-1 rounded text-xs font-medium transition ${
                        announcement.isActive
                          ? 'bg-gray-300 text-gray-900 hover:bg-gray-400'
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {announcement.isActive ? '비활성' : '활성'}
                    </button>
                    <button
                      onClick={() => handleOpenModal(announcement)}
                      className="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDeleteAnnouncement(announcement.id)}
                      className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Toast Message */}
        {message && (
          <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
