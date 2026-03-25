// @ts-nocheck
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface Student { id: string; name: string; studentNumber: string; }
interface Classroom { id: string; name: string; }
interface WrongAnswer { id: string; studentId: string; classroomId: string; testName: string; problemNumber: number; problemImage: string | null; status: string; round: number; createdAt: string; student: { id: string; name: string; studentNumber: string }; classroom: { id: string; name: string }; testPaperId: string | null; }
interface WrongAnswerTest { id: string; studentId: string; classroomId: string; round: number; status: string; createdAt: string; gradedAt: string | null; student: { id: string; name: string; studentNumber: string }; classroom: { id: string; name: string }; items: Array<{ id: string; wrongAnswerId: string; isCorrect: boolean | null; wrongAnswer: WrongAnswer }>; }
interface Stats { totalActive: number; totalMastered: number; totalTests: number; pendingTests: number; masteryRate: number; }
interface TestPaper { id: string; name: string; classroomId: string; totalProblems: number; createdAt: string; classroom: { id: string; name: string }; pages: Array<{ id: string; pageNumber: number; imageUrl: string }>; _count: { wrongAnswers: number }; }

export default function WrongAnswersPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [tests, setTests] = useState<WrongAnswerTest[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  const [testName, setTestName] = useState('');
  const [problemNumbers, setProblemNumbers] = useState('');
  const [gradingTest, setGradingTest] = useState<WrongAnswerTest | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});

  // Test papers state
  const [testPapers, setTestPapers] = useState<TestPaper[]>([]);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfName, setPdfName] = useState('');
  const [pdfTotalProblems, setPdfTotalProblems] = useState('');
  const [selectedTestPaper, setSelectedTestPaper] = useState('');
  const [viewingPaper, setViewingPaper] = useState<TestPaper | null>(null);
  const [driveFolders, setDriveFolders] = useState<{id:string,name:string,mimeType:string}[]>([]);
  const [driveFiles, setDriveFiles] = useState<{id:string,name:string,mimeType:string}[]>([]);
  const [selectedDriveFolder, setSelectedDriveFolder] = useState('');
  const [selectedDriveFile, setSelectedDriveFile] = useState('');
  const [processingStatus, setProcessingStatus] = useState<'idle'|'loading'|'downloading'|'processing'|'uploading'|'done'>('idle');
  const [croppedProblems, setCroppedProblems] = useState<{num:number,blob:Blob,preview:string,answer:string}[]>([]);
  const [parsedAnswers, setParsedAnswers] = useState<Record<string,string>>({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [answerKeyImage, setAnswerKeyImage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchClassrooms = useCallback(async () => {
    try {
      const res = await fetch('/api/classes');
      if (res.ok) setClassrooms(await res.json());
    } catch {}
  }, []);

  const fetchStudents = useCallback(async (classroomId: string) => {
    try {
      const res = await fetch(`/api/students?classroomId=${classroomId}`);
      if (res.ok) {
        const data = await res.json();
        setStudents(Array.isArray(data) ? data : data.students || []);
      }
    } catch {}
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const res = await fetch(`/api/wrong-answers/stats?${params}`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchWrongAnswers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const res = await fetch(`/api/wrong-answers?${params}`);
      if (res.ok) setWrongAnswers(await res.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchTests = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      if (selectedStudent) params.set('studentId', selectedStudent);
      const res = await fetch(`/api/wrong-answers/tests?${params}`);
      if (res.ok) setTests(await res.json());
    } catch {}
  }, [selectedClassroom, selectedStudent]);

  const fetchTestPapers = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedClassroom) params.set('classroomId', selectedClassroom);
      const res = await fetch(`/api/test-papers?${params}`);
      if (res.ok) setTestPapers(await res.json());
    } catch {}
  }, [selectedClassroom]);

  useEffect(() => { fetchClassrooms(); }, [fetchClassrooms]);
  useEffect(() => {
    if (selectedClassroom) {
      fetchStudents(selectedClassroom);
      fetchTestPapers();
    }
  }, [selectedClassroom, fetchStudents, fetchTestPapers]);
  useEffect(() => {
    fetchStats();
    fetchWrongAnswers();
    fetchTests();
  }, [fetchStats, fetchWrongAnswers, fetchTests]);

  const handleRecord = async () => {
    if (!selectedStudent || !selectedClassroom || !testName || !problemNumbers) {
      showToast('모든 필드를 입력해주세요.', 'error');
      return;
    }
    setLoading(true);
    try {
      const nums = problemNumbers.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
      if (nums.length === 0) {
        showToast('문제 번호를 올바르게 입력해주세요.', 'error');
        return;
      }
      const body: Record<string, unknown> = {
        studentId: selectedStudent,
        classroomId: selectedClassroom,
        testName,
        problemNumbers: nums,
      };
      if (selectedTestPaper) body.testPaperId = selectedTestPaper;
      const res = await fetch('/api/wrong-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        showToast(`${nums.length}개 오답이 기록되었습니다.`);
        setProblemNumbers('');
        setTestName('');
        fetchWrongAnswers();
        fetchStats();
      } else {
        const err = await res.json();
        showToast(err.error || '오답 기록 실패', 'error');
      }
    } catch {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTest = async () => {
    if (!selectedStudent || !selectedClassroom) {
      showToast('반과 학생을 선택해주세요.', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/wrong-answers/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent, classroomId: selectedClassroom }),
      });
      if (res.ok) {
        showToast('오답 테스트가 생성되었습니다.');
        fetchTests();
      } else {
        const err = await res.json();
        showToast(err.error || '테스트 생성 실패', 'error');
      }
    } catch {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleGrade = async () => {
    if (!gradingTest) return;
    setLoading(true);
    try {
      const results = gradingTest.items.map(item => ({
        testItemId: item.id,
        isCorrect: gradeResults[item.id] ?? false,
      }));
      const res = await fetch(`/api/wrong-answers/tests/${gradingTest.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });
      if (res.ok) {
        showToast('채점이 완료되었습니다.');
        setGradingTest(null);
        setGradeResults({});
        fetchTests();
        fetchWrongAnswers();
        fetchStats();
      } else {
        showToast('채점 실패', 'error');
      }
    } catch {
      showToast('오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      showToast('PDF 파일만 업로드 가능합니다.', 'error');
      return;
    }
    setUploadingPdf(true);
    setPdfPages([]);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const pages: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport }).promise;
        pages.push(canvas.toDataURL('image/png'));
      }
      setPdfPages(pages);
      setPdfName(file.name.replace('.pdf', ''));
      showToast(`${pages.length}페이지 추출 완료`);
    } catch (err) {
      console.error(err);
      showToast('PDF 처리 중 오류가 발생했습니다.', 'error');
    } finally {
      setUploadingPdf(false);
    }
  };

  const fetchDriveFolders = () => {
    fetch('/api/google-drive?action=list')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.error) {
          console.error('Drive API error:', data.error);
          showToast('Drive 연결 오류: ' + (typeof data.error === 'string' ? data.error : 'API 오류가 발생했습니다'), 'error');
          return;
        }
        if (data.files) {
          const folders = data.files.filter((f: {mimeType:string}) => f.mimeType === 'application/vnd.google-apps.folder');
          setDriveFolders(folders);
          if (folders.length === 0) {
            showToast('서비스 계정에 공유된 Drive 폴더가 없습니다. Google Drive에서 폴더를 공유해주세요.', 'error');
          }
        } else {
          showToast('Drive에서 폴더를 찾을 수 없습니다', 'error');
        }
      })
      .catch(err => {
        console.error(err);
        showToast('Drive 폴더 목록을 가져올 수 없습니다: ' + err.message, 'error');
      });
  };

  const fetchDriveFilesInFolder = (folderId: string) => {
    setSelectedDriveFolder(folderId);
    setSelectedDriveFile('');
    setCroppedProblems([]);
    setAnswerKeyImage('');
    fetch(`/api/google-drive?action=list&folderId=${folderId}`)
      .then(r => r.json())
      .then(data => {
        if (data.files) {
          setDriveFiles(data.files.filter((f: {mimeType:string}) => f.mimeType === 'application/pdf'));
        }
      })
      .catch(err => {
        console.error(err);
        showToast('PDF 파일 처리에 실패했습니다', 'error');
      });
  };

  const processPDFFromDrive = (fileId: string) => {
    setSelectedDriveFile(fileId);
    setProcessingStatus('downloading');
    setUploadProgress(10);
    setCroppedProblems([]);
    setParsedAnswers({});
    setAnswerKeyImage('');

    fetch(`/api/google-drive?action=download&fileId=${fileId}`)
      .then(r => r.arrayBuffer())
      .then(arrayBuffer => {
        setProcessingStatus('processing');
        setUploadProgress(30);
        return import('pdfjs-dist').then(pdfjsLib => {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
          return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        });
      })
      .then(pdf => {
        const totalPages = pdf.numPages;
        const lastPageIdx = totalPages;
        const contentPages = totalPages - 1;

        // Render last page (answer key) as IMAGE instead of text extraction
        return pdf.getPage(lastPageIdx).then((lastPage: any) => {
          const viewport = lastPage.getViewport({ scale: 2.0 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          return lastPage.render({ canvasContext: ctx, viewport }).promise.then(() => {
            const answerImageDataUrl = canvas.toDataURL('image/png');
            setAnswerKeyImage(answerImageDataUrl);
            return { pdf, contentPages };
          });
        });
      })
      .then(({ pdf, contentPages }) => {
        const allProblems: {num:number,blob:Blob,preview:string,answer:string}[] = [];
        let processed = 0;

        // Auto-trim: find content boundaries in a canvas region
        const findContentBounds = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
          const imageData = ctx.getImageData(0, 0, w, h);
          const data = imageData.data;
          const threshold = 230;
          const minPixels = Math.floor(w * 0.008);

          let topY = 0;
          for (let y = 0; y < h; y++) {
            let count = 0;
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              if (data[idx] < threshold || data[idx+1] < threshold || data[idx+2] < threshold) count++;
            }
            if (count > minPixels) { topY = y; break; }
          }

          let bottomY = h;
          for (let y = h - 1; y >= 0; y--) {
            let count = 0;
            for (let x = 0; x < w; x++) {
              const idx = (y * w + x) * 4;
              if (data[idx] < threshold || data[idx+1] < threshold || data[idx+2] < threshold) count++;
            }
            if (count > minPixels) { bottomY = y; break; }
          }

          let leftX = 0;
          for (let x = 0; x < w; x++) {
            let count = 0;
            for (let y = topY; y <= bottomY; y++) {
              const idx = (y * w + x) * 4;
              if (data[idx] < threshold || data[idx+1] < threshold || data[idx+2] < threshold) count++;
            }
            if (count > 2) { leftX = x; break; }
          }

          let rightX = w;
          for (let x = w - 1; x >= 0; x--) {
            let count = 0;
            for (let y = topY; y <= bottomY; y++) {
              const idx = (y * w + x) * 4;
              if (data[idx] < threshold || data[idx+1] < threshold || data[idx+2] < threshold) count++;
            }
            if (count > 2) { rightX = x; break; }
          }

          const pad = 15;
          return {
            topY: Math.max(0, topY - pad),
            bottomY: Math.min(h, bottomY + pad),
            leftX: Math.max(0, leftX - pad),
            rightX: Math.min(w, rightX + pad),
          };
        };

        const processPage = (pageIdx: number): Promise<void> => {
          if (pageIdx > contentPages) {
            setCroppedProblems(allProblems.sort((a, b) => a.num - b.num));
            setProcessingStatus('done');
            setUploadProgress(100);
            return Promise.resolve();
          }

          return pdf.getPage(pageIdx).then((page: any) => {
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d')!;

            return page.render({ canvasContext: ctx, viewport }).promise.then(() => {
              const hw = Math.floor(viewport.width / 2);
              const hh = Math.floor(viewport.height / 2);
              const n = (pageIdx - 1) * 4;

              // Correct order: left column first (top-bottom), then right column (top-bottom)
              // TL(1) -> BL(2) -> TR(3) -> BR(4)
              const quadrants = [
                { num: n + 1, x: 0, y: 0 },
                { num: n + 2, x: 0, y: hh },
                { num: n + 3, x: hw, y: 0 },
                { num: n + 4, x: hw, y: hh },
              ];

              const cropPromises = quadrants.map(q => {
                const rawCanvas = document.createElement('canvas');
                rawCanvas.width = hw;
                rawCanvas.height = hh;
                const rawCtx = rawCanvas.getContext('2d')!;
                rawCtx.drawImage(canvas, q.x, q.y, hw, hh, 0, 0, hw, hh);

                const bounds = findContentBounds(rawCtx, hw, hh);
                const cropW = bounds.rightX - bounds.leftX;
                const cropH = bounds.bottomY - bounds.topY;

                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = cropW > 0 ? cropW : hw;
                finalCanvas.height = cropH > 0 ? cropH : hh;
                const finalCtx = finalCanvas.getContext('2d')!;
                finalCtx.fillStyle = '#ffffff';
                finalCtx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                finalCtx.drawImage(
                  rawCanvas,
                  bounds.leftX, bounds.topY, cropW, cropH,
                  0, 0, cropW, cropH
                );

                return new Promise<void>((resolve) => {
                  finalCanvas.toBlob((blob) => {
                    if (blob) {
                      allProblems.push({
                        num: q.num,
                        blob,
                        preview: URL.createObjectURL(blob),
                        answer: '',
                      });
                    }
                    resolve();
                  }, 'image/png');
                });
              });

              return Promise.all(cropPromises).then(() => {
                processed++;
                setUploadProgress(30 + Math.floor((processed / contentPages) * 60));
                return processPage(pageIdx + 1);
              });
            });
          });
        };

        return processPage(1);
      })
      .catch(err => {
        console.error(err);
        showToast('PDF 파일을 처리할 수 없습니다.', 'error');
        setProcessingStatus('idle');
        setUploadProgress(0);
      });
  };

  const handleSaveTestPaper = () => {
    if (!selectedClassroom || croppedProblems.length === 0) {
      showToast('반을 선택하고 PDF를 처리해주세요.', 'error');
      return;
    }
    setProcessingStatus('uploading');
    setUploadProgress(0);

    const selectedFile = driveFiles.find(f => f.id === selectedDriveFile);
    const paperName = selectedFile ? selectedFile.name.replace('.pdf', '') : 'test-paper';

    const formData = new FormData();
    formData.append('name', paperName);
    formData.append('classroomId', selectedClassroom);
    formData.append('totalProblems', String(croppedProblems.length));
    formData.append('answers', JSON.stringify(parsedAnswers));

    croppedProblems.sort((a, b) => a.num - b.num).forEach((p, i) => {
      formData.append('images', p.blob, `problem-${i + 1}.png`);
    });

    // Also upload answer key image if available
    if (answerKeyImage) {
      fetch(answerKeyImage)
        .then(r => r.blob())
        .then(answerBlob => {
          formData.append('answerKeyImage', answerBlob, 'answer-key.png');
          return fetch('/api/test-papers', { method: 'POST', body: formData });
        })
        .then(res => {
          if (res.ok) {
            showToast('시험지가 저장되었습니다.');
            setCroppedProblems([]);
            setParsedAnswers({});
            setSelectedDriveFile('');
            setProcessingStatus('idle');
            setUploadProgress(0);
            setAnswerKeyImage('');
            fetchTestPapers();
          } else {
            res.json().then(err => showToast(err.error || '저장 실패', 'error'));
          }
        })
        .catch(err => {
          console.error(err);
          showToast('저장에 실패했습니다.', 'error');
        })
        .finally(() => { setProcessingStatus('idle'); });
    } else {
      fetch('/api/test-papers', { method: 'POST', body: formData })
        .then(res => {
          if (res.ok) {
            showToast('시험지가 저장되었습니다.');
            setCroppedProblems([]);
            setParsedAnswers({});
            setSelectedDriveFile('');
            setProcessingStatus('idle');
            setUploadProgress(0);
            setAnswerKeyImage('');
            fetchTestPapers();
          } else {
            res.json().then(err => showToast(err.error || '저장 실패', 'error'));
          }
        })
        .catch(err => {
          console.error(err);
          showToast('저장에 실패했습니다.', 'error');
        })
        .finally(() => { setProcessingStatus('idle'); });
    }
  };

  const handleDeleteTestPaper = async (id: string) => {
    if (!confirm('이 시험지를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/test-papers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('시험지가 삭제되었습니다.');
        fetchTestPapers();
      } else {
        showToast('삭제 실패', 'error');
      }
    } catch {
      showToast('오류가 발생했습니다.', 'error');
    }
  };

  const tabs = [
    { id: 'dashboard', label: '대시보드' },
    { id: 'upload', label: '시험지 업로드' },
    { id: 'record', label: '오답 기록' },
    { id: 'test', label: '오답 테스트' },
    { id: 'review', label: '오답 현황' },
  ];

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">오답 관리</h1>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'}`}>
          {toast.message}
        </div>
      )}

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4 mb-6">
        <select
          value={selectedClassroom}
          onChange={e => { setSelectedClassroom(e.target.value); setSelectedStudent(''); }}
          className="border rounded-lg px-3 py-2 bg-white">
          <option value="">반 선택</option>
          {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={selectedStudent}
          onChange={e => setSelectedStudent(e.target.value)}
          className="border rounded-lg px-3 py-2 bg-white"
          disabled={!selectedClassroom}>
          <option value="">학생 선택 (전체)</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.studentNumber})</option>)}
        </select>
      </div>

      {/* 대시보드 탭 */}
      {activeTab === 'dashboard' && (
        <div>
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-red-600">{stats.totalActive}</div>
                <div className="text-sm text-red-500 mt-1">활성 오답</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{stats.totalMastered}</div>
                <div className="text-sm text-green-500 mt-1">완료</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.totalTests}</div>
                <div className="text-sm text-blue-500 mt-1">총 테스트</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                <div className="text-3xl font-bold text-yellow-600">{stats.pendingTests}</div>
                <div className="text-sm text-yellow-500 mt-1">채점 대기</div>
              </div>
            </div>
          )}
          {stats && (
            <div className="bg-white border rounded-xl p-4">
              <div className="flex justify-between mb-2">
                <span className="font-medium">숙달률</span>
                <span className="font-bold text-blue-600">{stats.masteryRate}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div className="bg-blue-600 h-4 rounded-full transition-all" style={{ width: `${stats.masteryRate}%` }}></div>
              </div>
            </div>
          )}
          {testPapers.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold mb-3">최근 업로드된 시험지</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {testPapers.slice(0, 4).map(tp => (
                  <div key={tp.id} className="bg-white border rounded-xl p-4 flex justify-between items-center">
                    <div>
                      <div className="font-medium">{tp.name}</div>
                      <div className="text-sm text-gray-500">{tp.classroom.name} | {tp.totalProblems}문제 | {tp.pages.length}페이지</div>
                    </div>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">오답 {tp._count.wrongAnswers}건</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 시험지 업로드 탭 */}
      {activeTab === 'upload' && (
        <div className="space-y-6">
          {/* Step 1: Select Classroom */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">반 선택</h3>
            <select
              value={selectedClassroom}
              onChange={(e) => setSelectedClassroom(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg"
            >
              <option value="">반을 선택하세요</option>
              {classrooms.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Step 2: Google Drive Folder */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-4">Google Drive 폴더 선택</h3>
            <button
              onClick={() => fetchDriveFolders()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-4"
            >
              Drive 폴더 불러오기
            </button>
            {driveFolders.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {driveFolders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => fetchDriveFilesInFolder(folder.id)}
                    className={`px-3 py-2 rounded-lg border text-sm ${selectedDriveFolder === folder.id ? 'bg-blue-100 border-blue-500' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
                  >
                    {folder.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: PDF File Selection */}
          {driveFiles.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">PDF 파일 선택</h3>
              <div className="space-y-2">
                {driveFiles.map((file) => (
                  <button
                    key={file.id}
                    onClick={() => processPDFFromDrive(file.id)}
                    disabled={processingStatus !== 'idle' && processingStatus !== 'done'}
                    className={`w-full text-left px-4 py-3 rounded-lg border ${selectedDriveFile === file.id ? 'bg-green-50 border-green-500' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'} disabled:opacity-50`}
                  >
                    {file.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {processingStatus !== 'idle' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  {processingStatus === 'downloading' && '다운로드 중...'}
                  {processingStatus === 'processing' && '처리 중...'}
                  {processingStatus === 'uploading' && '업로드 중...'}
                  {processingStatus === 'done' && '완료!'}
                </span>
                <span className="text-sm text-gray-500">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-blue-600 h-3 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          {/* Step 4: Preview cropped problems */}
          {croppedProblems.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">잘린 문제 총 ({croppedProblems.length}개)</h3>
                <button
                  onClick={handleSaveTestPaper}
                  disabled={!selectedClassroom || processingStatus === 'uploading'}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                >
                  저장
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {croppedProblems.sort((a, b) => a.num - b.num).map((p) => (
                  <div key={p.num} className="border rounded-lg p-2">
                    <div className="text-xs font-medium text-gray-500 mb-1">문제 {p.num}</div>
                    <img src={p.preview} alt={`문제 ${p.num}`} className="w-full rounded" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Answer Key Image */}
          {answerKeyImage && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">정답지 (마지막 페이지)</h3>
              <div className="border rounded-lg overflow-hidden">
                <img src={answerKeyImage} alt="정답지" className="w-full" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
