'use client';
// @ts-nocheck

import { useState, useEffect, useCallback, useRef } from 'react';

/* ============================================================
   Types
   ============================================================ */
interface ClassroomOption { id: string; name: string; subjectName?: string; }
interface StudentOption { id: string; name: string; studentNumber: string | null; }
interface TestPaperRecord {
  id: string; name: string; classroomId: string; totalProblems: number;
  answers: string | null; createdAt: string;
  classroom: { id: string; name: string };
  pages: { id: string; pageNumber: number; imageUrl: string }[];
  _count?: { wrongAnswers: number };
}
interface WrongAnswerRecord {
  id: string; studentId: string; classroomId: string; testName: string;
  problemNumber: number; problemImage: string | null; status: string;
  round: number; createdAt: string;
  student: { id: string; name: string; studentNumber: string | null };
  classroom: { id: string; name: string };
}
interface WrongAnswerTestRecord {
  id: string; studentId: string; classroomId: string; round: number;
  status: string; createdAt: string; gradedAt: string | null;
  student: { id: string; name: string; studentNumber: string | null };
  classroom: { id: string; name: string };
  items: { id: string; wrongAnswerId: string; isCorrect: boolean | null;
    wrongAnswer: WrongAnswerRecord }[];
}
interface Stats { totalActive: number; totalMastered: number; totalTests: number;
  pendingTests: number; masteryRate: number; }
// PDF extraction types
interface ExtractedProblem {
  id: string; number: number; pageNumber: number;
  imageDataUrl: string; bbox: any;
  answerPageNumber?: number; answerImageDataUrl?: string;
}

/* ============================================================
   Main Page Component
   ============================================================ */
export default function WrongAnswersPage() {
  // Global state
  const [classrooms, setClassrooms] = useState<ClassroomOption[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState('');
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'answers' | 'register' | 'tests'>('upload');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [loading, setLoading] = useState(false);

  // Test Papers
  const [testPapers, setTestPapers] = useState<TestPaperRecord[]>([]);
  const [allTestPapers, setAllTestPapers] = useState<TestPaperRecord[]>([]);

  // Wrong answers
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswerRecord[]>([]);
  const [tests, setTests] = useState<WrongAnswerTestRecord[]>([]);
  const [stats, setStats] = useState<Stats>({ totalActive: 0, totalMastered: 0, totalTests: 0, pendingTests: 0, masteryRate: 0 });

  // Upload tab: student for 맞춤반
  const [uploadStudent, setUploadStudent] = useState('');
  const [uploadStudents, setUploadStudents] = useState<StudentOption[]>([]);

  // PDF Upload / Extract state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [extractState, setExtractState] = useState<'idle' | 'loading' | 'detecting' | 'extracting' | 'done' | 'saving' | 'saved' | 'error'>('idle');
  const [extractProgress, setExtractProgress] = useState({ current: 0, total: 0, message: '' });
  const [extractedProblems, setExtractedProblems] = useState<ExtractedProblem[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [problemPageRange, setProblemPageRange] = useState({ start: 1, end: 1 });
  const [answerPageRange, setAnswerPageRange] = useState({ start: 1, end: 1 });
  const [workbookName, setWorkbookName] = useState('');
  const [selectedProblem, setSelectedProblem] = useState<ExtractedProblem | null>(null);
  const [extractError, setExtractError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Register wrong answers state
  const [regClassroom, setRegClassroom] = useState('');
  const [regStudent, setRegStudent] = useState('');
  const [regTestPaper, setRegTestPaper] = useState('');
  const [regTestName, setRegTestName] = useState('');
  const [regProblemNumbers, setRegProblemNumbers] = useState('');
  const [regSelectedProblems, setRegSelectedProblems] = useState<Set<number>>(new Set());
  const [registering, setRegistering] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);

  // Test creation modal
  const [testCreateModal, setTestCreateModal] = useState<{ studentId: string; studentName: string; activeCount: number; classroomId?: string } | null>(null);
  const [testCreateCount, setTestCreateCount] = useState(0);

  // Grading modal
  const [gradingTest, setGradingTest] = useState<WrongAnswerTestRecord | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});

  // Filter classroom for answers/tests tabs
  const [filterClassroom, setFilterClassroom] = useState('');

  useEffect(() => { fetchClassrooms(); fetchAllTestPapers(); }, []);

  // When tab changes, reload data for the selected classroom
  useEffect(() => {
    if (regClassroom) {
      fetchTestPapersForClassroom(regClassroom);
      fetchStudentsForClassroom(regClassroom);
      if (activeTab === 'answers' || activeTab === 'tests') {
        // Sync filterClassroom with regClassroom when switching tabs
        if (!filterClassroom) setFilterClassroom(regClassroom);
        fetchDataForClassroom(filterClassroom || regClassroom);
      }
    } else if (activeTab === 'answers' || activeTab === 'tests') {
      // Load all data even without classroom selection
      fetchDataForClassroom('');
    }
  }, [activeTab]);

  // Helper: check if a classroom is 맞춤반
  const isCustomClass = (classroomId: string) => {
    const c = classrooms.find(cl => cl.id === classroomId);
    return c?.subjectName === '맞춤반';
  };

  // Load students for upload tab when 맞춤반 selected
  const fetchUploadStudents = async (classroomId: string) => {
    if (!classroomId) { setUploadStudents([]); return; }
    try {
      const res = await fetch(`/api/students?classroomId=${classroomId}&status=재원&limit=200`);
      if (res.ok) {
        const data = await res.json();
        setUploadStudents((data.students || []).map((s: any) => ({
          id: s.id, name: s.name || '', studentNumber: s.studentNumber || null,
        })));
      }
    } catch (e) { console.error(e); }
  };

  const showMsg = (msg: string, type: 'success' | 'error' = 'success') => {
    setMessage(msg); setMessageType(type);
    setTimeout(() => setMessage(''), 4000);
  };

  /* ============================================================
     Data Fetching
     ============================================================ */
  const fetchClassrooms = async () => {
    try {
      const res = await fetch('/api/classes');
      if (res.ok) {
        const data = await res.json();
        setClassrooms((Array.isArray(data) ? data : []).map((c: any) => ({ id: c.id, name: c.name, subjectName: c.subject?.name || '' })));
      }
    } catch (e) { console.error(e); }
  };

  const fetchStudentsForClassroom = async (classroomId: string) => {
    if (!classroomId) { setStudents([]); return; }
    try {
      // Use /api/students with classroomId filter for reliable student loading
      const res = await fetch(`/api/students?classroomId=${classroomId}&status=재원&limit=200`);
      if (res.ok) {
        const data = await res.json();
        const list = (data.students || []).map((s: any) => ({
          id: s.id, name: s.name || '',
          studentNumber: s.studentNumber || null,
        }));
        setStudents(list);
        console.log(`[students] Loaded ${list.length} students for classroom ${classroomId}`);
      } else {
        console.error('[students] API error:', res.status);
        // Fallback: try enrollment-based approach
        const res2 = await fetch(`/api/classes/${classroomId}`);
        if (res2.ok) {
          const cd = await res2.json();
          setStudents((cd.enrollments || []).map((e: any) => ({
            id: e.student?.id || e.studentId, name: e.student?.name || '',
            studentNumber: e.student?.studentNumber || null,
          })));
        }
      }
    } catch (e) { console.error('[students] Fetch error:', e); }
  };

  const fetchDataForClassroom = async (id: string) => {
    try {
      const classroomParam = id ? `?classroomId=${id}` : '';
      const [waRes, testRes, statsRes] = await Promise.all([
        fetch(`/api/wrong-answers${classroomParam}`),
        fetch(`/api/wrong-answers/tests${classroomParam}`),
        fetch(`/api/wrong-answers/stats${classroomParam}`),
      ]);
      if (waRes.ok) { const d = await waRes.json(); setWrongAnswers(Array.isArray(d) ? d : []); }
      if (testRes.ok) { const d = await testRes.json(); setTests(Array.isArray(d) ? d : []); }
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) { console.error(e); }
  };

  const fetchTestPapersForClassroom = async (classroomId: string) => {
    if (!classroomId) { setTestPapers([]); return; }
    try {
      const tpRes = await fetch(`/api/test-papers?classroomId=${classroomId}`);
      if (tpRes.ok) setTestPapers(await tpRes.json());
    } catch (e) { console.error(e); }
  };

  const fetchAllTestPapers = async () => {
    try {
      const res = await fetch('/api/test-papers?summary=true');
      if (res.ok) setAllTestPapers(await res.json());
    } catch (e) { console.error(e); }
  };

  /* ============================================================
     PDF Upload & Problem Extraction
     ============================================================ */
  const autoDetectPageRanges = async (f: File) => {
    try {
      const { loadPdf, getPageTextItems } = await import('@/lib/pdfExtractor');
      const pdf = await loadPdf(f);
      const numPages = pdf.numPages;
      setTotalPages(numPages);

      // Auto-detect answer pages: scan from last page backward for "N) 답" or "N)" patterns
      let answerStartPage = numPages; // default: last page is the answer page
      for (let p = numPages; p >= Math.max(1, numPages - 5); p--) {
        try {
          const { items } = await getPageTextItems(pdf, p);
          // Check for answer patterns: "N) 답" (text-based) or few readable text items with "N)" (image-based)
          const ansPatterns = items.filter((t: any) =>
            t.text.match(/^\d{1,2}\)\s*답/) || t.text.match(/^\d{1,2}\)\s*$/)
          );
          // Also check: pages with very few readable items but answer-page headers
          const hasAnswerHeader = items.some((t: any) =>
            t.text.includes('테스트') || t.text.includes('답지') || t.text.includes('정답')
          );
          const hasAnswerContent = ansPatterns.length >= 2 || (hasAnswerHeader && items.length < 100);

          if (hasAnswerContent && p < numPages) {
            answerStartPage = p; // Extend answer range backward
          } else if (p === numPages && (ansPatterns.length >= 1 || hasAnswerHeader)) {
            answerStartPage = p; // Last page has answers
          } else {
            break; // No more answer pages
          }
        } catch { break; }
      }

      // For image-based answer PDFs (very few readable text items on last page),
      // also check if last page has many small images (answer number glyphs)
      if (answerStartPage === numPages) {
        try {
          const lastPage = await pdf.getPage(numPages);
          const lastVp = lastPage.getViewport({ scale: 1.0 });
          const opList = await lastPage.getOperatorList();
          let imgCount = 0;
          for (let i = 0; i < opList.fnArray.length; i++) {
            if (opList.fnArray[i] === 85) imgCount++; // paintImageXObject
          }
          if (imgCount >= 10) {
            answerStartPage = numPages; // Confirmed: last page has answer images
          }
        } catch { /* ignore */ }
      }

      setProblemPageRange({ start: 1, end: Math.max(1, answerStartPage - 1) });
      setAnswerPageRange({ start: answerStartPage, end: numPages });
    } catch { /* ignore */ }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === 'application/pdf') {
      setPdfFile(f);
      setExtractedProblems([]);
      setExtractState('idle');
      setWorkbookName(f.name.replace('.pdf', ''));
      autoDetectPageRanges(f);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const f = e.dataTransfer.files?.[0];
    if (f && f.type === 'application/pdf') {
      setPdfFile(f);
      setExtractedProblems([]);
      setExtractState('idle');
      setWorkbookName(f.name.replace('.pdf', ''));
      autoDetectPageRanges(f);
    } else {
      showMsg('PDF 파일을 선택해주세요', 'error');
    }
  };

  const handleExtract = useCallback(async () => {
    if (!pdfFile) return;
    try {
      setExtractState('detecting');
      setExtractProgress({ current: 0, total: 0, message: '문제와 답지를 감지하고 있습니다...' });
      setExtractedProblems([]);
      setExtractError('');
      setDebugInfo(null);

      const { loadPdf, detectAllProblems, detectAnswersOnPages, extractAllProblemImages, extractAnswerImages, matchProblemsToAnswers } = await import('@/lib/pdfExtractor');
      const pdf = await loadPdf(pdfFile);

      // Collect debug info
      const debug = { pages: [] as any[] };

      // Step 1: Detect problems
      setExtractProgress({ current: 0, total: 0, message: '문제 페이지에서 문제를 감지 중...' });
      const detected = await detectAllProblems(pdf, problemPageRange.start, problemPageRange.end, debug);

      // Step 2: Detect answers (client-side pdfjs-dist)
      setExtractProgress({ current: 0, total: 0, message: '답지 페이지에서 답을 감지 중...' });
      let answersDetected = await detectAnswersOnPages(pdf, answerPageRange.start, answerPageRange.end, debug, detected.length);

      // Save debug info
      setDebugInfo({ ...debug, problemCount: detected.length, answerCount: answersDetected.length });

      // Step 2.5: If client-side detection failed or got few answers, try server-side extraction
      let serverAnswers: Record<string, string> = {};
      const detectedAnswerCount = answersDetected.length;
      const expectedMinAnswers = Math.max(3, detected.length * 0.5);

      if (detectedAnswerCount < expectedMinAnswers && pdfFile) {
        setExtractProgress({ current: 0, total: 0, message: `클라이언트 감지 ${detectedAnswerCount}개. 서버에서 답 추출 시도 중...` });
        try {
          const serverFormData = new FormData();
          serverFormData.append('file', pdfFile);
          serverFormData.append('answerStartPage', String(answerPageRange.start));
          serverFormData.append('answerEndPage', String(answerPageRange.end));
          serverFormData.append('totalProblems', String(detected.length));

          const serverRes = await fetch('/api/test-papers/extract-answers', {
            method: 'POST',
            body: serverFormData,
          });
          if (serverRes.ok) {
            const serverData = await serverRes.json();
            if (serverData.answers && Object.keys(serverData.answers).length > detectedAnswerCount) {
              serverAnswers = serverData.answers;
              console.log('[extract] Server extracted', Object.keys(serverAnswers).length, 'answers vs client', detectedAnswerCount);
              setDebugInfo((prev: any) => ({
                ...prev,
                serverExtraction: true,
                serverAnswerCount: Object.keys(serverAnswers).length,
                serverRawText: serverData.rawText,
              }));
            }
          }
        } catch (e) {
          console.error('Server answer extraction failed:', e);
        }
      }

      if (detected.length === 0) {
        setExtractError('문제를 감지하지 못했습니다. 아래 디버그 정보를 확인해주세요.');
        setExtractState('error');
        setShowDebug(true);
        return;
      }

      // Step 3: Extract problem images
      setExtractProgress({ current: 0, total: detected.length, message: `${detected.length}개 문제 발견. 문제 이미지 추출 중...` });
      setExtractState('extracting');
      const problemImages = await extractAllProblemImages(pdf, detected, 2.0, (cur, tot) => {
        setExtractProgress({ current: cur, total: tot, message: `문제 이미지 추출 중... (${cur}/${tot})` });
      });

      // Step 4: Extract answer images (if client detected answers)
      let answerImages: any[] = [];
      if (answersDetected.length > 0) {
        setExtractProgress({ current: 0, total: answersDetected.length, message: `${answersDetected.length}개 답 발견. 답 이미지 추출 중...` });
        answerImages = await extractAnswerImages(pdf, answersDetected, 2.0, (cur, tot) => {
          setExtractProgress({ current: cur, total: tot, message: `답 이미지 추출 중... (${cur}/${tot})` });
        });
      }

      // Step 4.5: Render answer page images for reference
      setExtractProgress({ current: 0, total: 0, message: '답지 페이지 이미지 추출 중...' });
      const { renderPageToCanvas } = await import('@/lib/pdfExtractor');
      const answerPageImages: string[] = [];
      for (let ap = answerPageRange.start; ap <= answerPageRange.end; ap++) {
        const canvas = await renderPageToCanvas(pdf, ap, 2.0);
        answerPageImages.push(canvas.toDataURL('image/png'));
      }
      setDebugInfo((prev: any) => ({
        ...prev,
        answerPageImages,
        answerDetectionFailed: answersDetected.length < expectedMinAnswers && Object.keys(serverAnswers).length < expectedMinAnswers,
      }));

      // Step 5: Match - combine client + server answers
      setExtractProgress({ current: 0, total: 0, message: '문제와 답지를 매칭 중...' });
      const matched = matchProblemsToAnswers(problemImages, answerImages);

      // Attach answer text from server or client detection
      const useServer = Object.keys(serverAnswers).length > detectedAnswerCount;
      for (const m of matched) {
        if (useServer && serverAnswers[String(m.number)]) {
          (m as any).answerText = serverAnswers[String(m.number)];
          // Mark as "server matched" even without answer image
          if (!m.answerPageNumber) {
            (m as any).answerText = serverAnswers[String(m.number)];
            (m as any).serverMatched = true;
          }
        } else {
          const detectedAns = answersDetected.find(a => a.problemNumber === m.number);
          if (detectedAns) (m as any).answerText = detectedAns.answerText;
        }
      }

      setExtractedProblems(matched);
      setExtractState('done');
    } catch (err: any) {
      setExtractError('추출 오류: ' + err.message);
      setExtractState('error');
    }
  }, [pdfFile, problemPageRange, answerPageRange]);

  const handleSaveTestPaper = useCallback(async () => {
    if (!regClassroom || extractedProblems.length === 0) {
      showMsg('반을 선택하고 문제를 추출해주세요', 'error'); return;
    }
    if (isCustomClass(regClassroom) && !uploadStudent) {
      showMsg('맞춤반은 학생을 선택해주세요', 'error'); return;
    }

    setExtractState('saving');
    setExtractProgress({ current: 0, total: extractedProblems.length, message: '시험지 저장 중...' });

    try {
      const { dataURLtoBlob } = await import('@/lib/pdfExtractor');

      // Upload each problem image to Google Drive via API
      const formData = new FormData();
      formData.append('name', workbookName || pdfFile?.name || 'Untitled');
      formData.append('classroomId', regClassroom);
      if (uploadStudent) formData.append('studentId', uploadStudent);
      formData.append('totalProblems', String(extractedProblems.length));

      // Build answers JSON from matching
      const answersObj: Record<string, string> = {};
      extractedProblems.forEach(p => {
        if (p.answerPageNumber) answersObj[String(p.number)] = `p.${p.answerPageNumber}`;
      });
      formData.append('answers', JSON.stringify(answersObj));

      // Upload problem images with actual problem numbers
      const problemNumbers: number[] = [];
      const dataUrls: string[] = [];
      for (let i = 0; i < extractedProblems.length; i++) {
        const p = extractedProblems[i];
        const blob = dataURLtoBlob(p.imageDataUrl);
        const file = new File([blob], `problem-${p.number}.png`, { type: 'image/png' });
        formData.append('images', file);
        problemNumbers.push(p.number);
        dataUrls.push(p.imageDataUrl);
        setExtractProgress({ current: i + 1, total: extractedProblems.length, message: `이미지 업로드 중 (${i + 1}/${extractedProblems.length})` });
      }
      // Send actual problem numbers so pages get correct pageNumber
      formData.append('problemNumbers', JSON.stringify(problemNumbers));
      // Send base64 data URLs as fallback when Google Drive upload fails
      formData.append('dataUrls', JSON.stringify(dataUrls));

      const res = await fetch('/api/test-papers', { method: 'POST', body: formData });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');

      showMsg(`시험지 "${workbookName}"가 저장되었습니다 (${extractedProblems.length}문제)`);
      setExtractState('saved');

      // Refresh test papers (both classroom-specific and global)
      await Promise.all([
        fetchTestPapersForClassroom(regClassroom),
        fetchAllTestPapers(),
      ]);
    } catch (err: any) {
      showMsg('저장 실패: ' + err.message, 'error');
      setExtractState('done');
    }
  }, [regClassroom, uploadStudent, extractedProblems, workbookName, pdfFile]);

  const handleDeleteTestPaper = async (id: string) => {
    if (!confirm('이 시험지를 삭제하시겠습니까? 연결된 오답이 있으면 이미지가 사라집니다.')) return;
    try {
      const res = await fetch(`/api/test-papers/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      showMsg('시험지가 삭제되었습니다');
      await Promise.all([
        fetchAllTestPapers(),
        regClassroom ? fetchTestPapersForClassroom(regClassroom) : Promise.resolve(),
      ]);
    } catch (err: any) {
      showMsg('삭제 실패: ' + err.message, 'error');
    }
  };

  /* ============================================================
     Wrong Answer Registration
     ============================================================ */
  const handleRegisterWrongAnswers = async () => {
    if (!regStudent || !regTestName) {
      showMsg('학생과 시험명을 입력해주세요', 'error'); return;
    }
    // Use toggle-selected problems if test paper is selected, otherwise parse text input
    let nums: number[];
    if (regTestPaper && regSelectedProblems.size > 0) {
      nums = Array.from(regSelectedProblems).sort((a, b) => a - b);
    } else {
      nums = regProblemNumbers.split(/[,\s]+/).map(n => parseInt(n.trim())).filter(n => !isNaN(n) && n > 0);
    }
    if (nums.length === 0) { showMsg('틀린 문제를 선택해주세요', 'error'); return; }

    setRegistering(true);
    try {
      const res = await fetch('/api/wrong-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: regStudent, classroomId: regClassroom,
          testName: regTestName, problemNumbers: nums,
          testPaperId: regTestPaper || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      showMsg(`${nums.length}개 오답이 등록되었습니다`);
      setRegProblemNumbers('');
      setRegSelectedProblems(new Set());
      setRegSuccess(true);
      // 등록 완료 상태를 유지 (자동으로 사라지지 않음, 새 등록 시작 시 리셋)
      if (regClassroom) await fetchDataForClassroom(regClassroom);
    } catch (err: any) {
      showMsg(err.message || '오답 등록 실패', 'error');
    } finally { setRegistering(false); }
  };

  const handleDeleteWrongAnswer = async (id: string) => {
    if (!confirm('이 오답을 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/wrong-answers/${id}`, { method: 'DELETE' });
      if (res.ok) { showMsg('삭제됨'); if (filterClassroom) await fetchDataForClassroom(filterClassroom); }
    } catch { showMsg('삭제 실패', 'error'); }
  };

  const generateTestPDF = (test: WrongAnswerTestRecord) => {
    // Shuffle items randomly
    const shuffled = [...test.items].sort(() => Math.random() - 0.5);

    // Build problem entries with image URLs
    const problems = shuffled.map((item, idx) => {
      const wa = item.wrongAnswer as any;
      // Find problem image from testPaper pages (pageNumber = problemNumber)
      let imgUrl = '';
      if (wa.testPaper?.pages) {
        const page = wa.testPaper.pages.find((p: any) => p.pageNumber === wa.problemNumber);
        if (page) imgUrl = page.imageUrl;
      }
      if (!imgUrl && wa.problemImage) imgUrl = wa.problemImage;
      return { num: idx + 1, originalNum: wa.problemNumber, testName: wa.testName, imgUrl };
    });

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<title>오답 테스트 - ${test.student.name}</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; color: #222; background: #fff; padding: 10px; }
  .header { text-align: center; border-bottom: 2px solid #222; padding-bottom: 8px; margin-bottom: 12px; }
  .header h1 { font-size: 20px; margin-bottom: 4px; }
  .info-row { display: flex; justify-content: center; gap: 16px; font-size: 12px; color: #555; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .row-gap { margin-top: 20px; }
  .problem { border: 1px solid #bbb; border-radius: 6px; overflow: hidden; page-break-inside: avoid; display: flex; flex-direction: column; min-height: 280px; }
  .problem-header { display: flex; align-items: center; justify-content: space-between; padding: 6px 10px; background: #f3f4f6; border-bottom: 1px solid #ddd; font-size: 12px; }
  .problem-header .num { font-weight: bold; font-size: 16px; color: #2563eb; }
  .problem-header .source { color: #999; font-size: 10px; }
  .problem-body { padding: 8px; text-align: center; flex: 1; display: flex; align-items: center; justify-content: center; }
  .problem-body img { max-width: 100%; max-height: 220px; object-fit: contain; }
  .problem-body .no-img { color: #ccc; padding: 20px; font-size: 11px; }
  .answer-area { border-top: 1px dashed #ccc; padding: 6px 10px; min-height: 55px; }
  .answer-area span { font-size: 11px; color: #aaa; }
  .page-break { page-break-after: always; }
  .score-box { margin-top: 16px; text-align: right; font-size: 15px; font-weight: bold; }
  .score-box span { border: 2px solid #222; padding: 4px 16px; border-radius: 6px; }
  .footer { margin-top: 16px; text-align: center; font-size: 10px; color: #bbb; }
  .btn-bar { display: flex; gap: 10px; justify-content: center; margin-bottom: 12px; }
  .btn-bar button { padding: 10px 28px; font-size: 15px; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
  .btn-pdf { background: #2563eb; color: #fff; }
  .btn-back { background: #6b7280; color: #fff; }
  @media print { .no-print { display: none !important; } body { padding: 0; } }
</style>
</head><body>
<div class="no-print btn-bar">
  <button class="btn-back" onclick="window.close()">← 뒤로가기</button>
  <button class="btn-pdf" onclick="window.print()">PDF 저장</button>
</div>
<div class="header">
  <h1>오답 테스트</h1>
  <div class="info-row">
    <span><b>이름:</b> ${test.student.name}</span>
    <span><b>반:</b> ${test.classroom.name}</span>
    <span><b>회차:</b> ${test.round}회</span>
    <span><b>날짜:</b> ${today}</span>
    <span><b>총 ${problems.length}문항</b></span>
  </div>
</div>
<div class="grid">
${problems.map((p, idx) => `
<div class="problem">
  <div class="problem-header">
    <span class="num">${p.num}</span>
    <span class="source">${p.testName} #${p.originalNum}</span>
  </div>
  <div class="problem-body">
    ${p.imgUrl ? `<img src="${p.imgUrl}" alt="문제 ${p.num}" crossorigin="anonymous" />` : '<div class="no-img">문제 이미지 없음</div>'}
  </div>
  <div class="answer-area"><span>답:</span></div>
</div>${(idx + 1) % 2 === 0 && idx < problems.length - 1 ? '</div><div class="row-gap"></div><div class="grid">' : ''}`).join('')}
</div>
<div class="score-box">점수: <span>&nbsp;&nbsp;&nbsp;&nbsp;/ ${problems.length}</span></div>
<div class="footer">수학탐구 오답관리 시스템</div>
</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const openTestCreateModal = (studentId: string, studentName: string, activeCount: number, classroomId?: string) => {
    setTestCreateModal({ studentId, studentName, activeCount, classroomId: classroomId || filterClassroom || '' });
    setTestCreateCount(activeCount); // default to all
  };

  const handleCreateTest = async () => {
    if (!testCreateModal) return;
    const { studentId, classroomId } = testCreateModal;
    const cId = classroomId || filterClassroom || regClassroom || '';
    if (!cId) { showMsg('반을 선택해주세요', 'error'); return; }
    try {
      const res = await fetch('/api/wrong-answers/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, classroomId: cId, maxCount: testCreateCount }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      const test = await res.json();
      showMsg('테스트가 생성되었습니다');
      setTestCreateModal(null);
      if (filterClassroom) await fetchDataForClassroom(filterClassroom);
      generateTestPDF(test);
      setActiveTab('tests');
    } catch (err: any) { showMsg(err.message || '테스트 생성 실패', 'error'); }
  };

  const handleDeleteTest = async (testId: string) => {
    if (!confirm('이 테스트를 삭제하시겠습니까?')) return;
    try {
      const res = await fetch(`/api/wrong-answers/tests/${testId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      // 즉시 UI에서 제거
      setTests(prev => prev.filter(t => t.id !== testId));
      showMsg('테스트가 삭제되었습니다');
      // 서버에서 최신 데이터 다시 불러오기 (filterClassroom 유무와 관계없이)
      await fetchDataForClassroom(filterClassroom);
    } catch { showMsg('테스트 삭제 실패', 'error'); }
  };

  const handleStartGrading = (test: WrongAnswerTestRecord) => {
    setGradingTest(test);
    const init: Record<string, boolean> = {};
    test.items.forEach(i => { init[i.wrongAnswerId] = i.isCorrect ?? false; });
    setGradeResults(init);
  };

  const handleSubmitGrade = async () => {
    if (!gradingTest) return;
    try {
      const results = Object.entries(gradeResults).map(([wrongAnswerId, isCorrect]) => ({ wrongAnswerId, isCorrect }));
      const res = await fetch(`/api/wrong-answers/tests/${gradingTest.id}/grade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) throw new Error('Failed');
      showMsg('채점 완료');
      setGradingTest(null);
      if (filterClassroom) await fetchDataForClassroom(filterClassroom);
    } catch { showMsg('채점 실패', 'error'); }
  };

  // Group wrong answers by student
  const groupedByStudent = wrongAnswers.reduce((acc, wa) => {
    if (!acc[wa.studentId]) acc[wa.studentId] = { name: wa.student.name, items: [] };
    acc[wa.studentId].items.push(wa);
    return acc;
  }, {} as Record<string, { name: string; items: WrongAnswerRecord[] }>);

  /* ============================================================
     Render
     ============================================================ */
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">오답 관리</h1>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${
          messageType === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{message}</div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        {[
          { key: 'upload' as const, label: '시험지 업로드' },
          { key: 'register' as const, label: '오답 등록' },
          { key: 'answers' as const, label: '오답 목록' },
          { key: 'tests' as const, label: '테스트 관리' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{tab.label}</button>
        ))}
      </div>

      {loading && activeTab !== 'upload' ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* ========== TAB: UPLOAD ========== */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              {/* PDF Upload */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-gray-800 mb-3">PDF 시험지 업로드</h3>

                <label
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`block border-2 border-dashed rounded-lg p-6 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}>
                  <div className="text-3xl mb-2">📁</div>
                  <p className="text-gray-600 text-sm">PDF 파일을 클릭하거나 드래그해서 업로드하세요</p>
                  <p className="text-xs text-gray-400 mt-1">수학 교재, 시험지 등의 PDF</p>
                  <input type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />
                </label>

                {pdfFile && (
                  <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200 flex items-center gap-2">
                    <span className="text-lg">✅</span>
                    <span className="font-medium text-green-800 text-sm">{pdfFile.name}</span>
                    <span className="text-xs text-green-600">({(pdfFile.size / 1024 / 1024).toFixed(1)}MB)</span>
                  </div>
                )}
              </div>

              {/* Page Range Settings */}
              {pdfFile && totalPages > 0 && extractState !== 'detecting' && extractState !== 'extracting' && extractState !== 'saving' && (
                <div className="bg-white rounded-xl border p-5">
                  <h3 className="font-semibold text-gray-800 mb-4">페이지 범위 설정</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Problem pages */}
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3">문제 페이지 범위</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">시작 페이지</label>
                          <input type="number" min={1} max={totalPages} value={problemPageRange.start}
                            onChange={e => setProblemPageRange(p => ({ ...p, start: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-blue-700 mb-1">끝 페이지</label>
                          <input type="number" min={1} max={totalPages} value={problemPageRange.end}
                            onChange={e => setProblemPageRange(p => ({ ...p, end: Math.min(totalPages, parseInt(e.target.value) || totalPages) }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                        </div>
                        <p className="text-xs text-blue-600">선택: {problemPageRange.start} ~ {problemPageRange.end}페이지</p>
                      </div>
                    </div>

                    {/* Answer pages */}
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <h4 className="text-sm font-semibold text-green-900 mb-3">답지 페이지 범위</h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-green-700 mb-1">시작 페이지</label>
                          <input type="number" min={1} max={totalPages} value={answerPageRange.start}
                            onChange={e => setAnswerPageRange(p => ({ ...p, start: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-green-700 mb-1">끝 페이지</label>
                          <input type="number" min={1} max={totalPages} value={answerPageRange.end}
                            onChange={e => setAnswerPageRange(p => ({ ...p, end: Math.min(totalPages, parseInt(e.target.value) || totalPages) }))}
                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500" />
                        </div>
                        <p className="text-xs text-green-600">선택: {answerPageRange.start} ~ {answerPageRange.end}페이지</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">시험지 이름</label>
                      <input type="text" value={workbookName} onChange={e => setWorkbookName(e.target.value)}
                        placeholder="예: 3월 모의고사"
                        className="w-full max-w-md px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                    </div>

                    <button onClick={handleExtract}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors">
                      🔍 문제 및 답지 추출 시작
                    </button>
                  </div>
                </div>
              )}

              {/* Progress */}
              {(extractState === 'detecting' || extractState === 'extracting' || extractState === 'saving') && (
                <div className="bg-white rounded-xl border p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                    <span className="text-sm text-gray-600">{extractProgress.message}</span>
                  </div>
                  {extractProgress.total > 0 && (
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(extractProgress.current / extractProgress.total) * 100}%` }}></div>
                    </div>
                  )}
                </div>
              )}

              {/* Error */}
              {extractState === 'error' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-red-700 text-sm">{extractError}</p>
                  <button onClick={() => setExtractState('idle')} className="mt-2 text-sm text-red-600 underline">다시 시도</button>
                </div>
              )}

              {/* Extracted Results */}
              {extractState === 'done' && extractedProblems.length > 0 && (
                <>
                  {/* Problem Gallery with Answers */}
                  <div className="bg-white rounded-xl border p-5">
                    <div className="mb-4">
                      <h3 className="font-semibold text-gray-800 mb-2">추출된 문제 및 답: {extractedProblems.length}개</h3>
                      <p className="text-xs text-gray-500">문제 번호, 문제 이미지, 매칭된 답 이미지를 확인하세요.</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {extractedProblems.map(p => (
                        <div key={p.id} className="border rounded-lg p-3 hover:shadow-md transition-shadow">
                          <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-bold text-blue-600 text-lg">{p.number}번</span>
                              <span className="text-xs text-gray-400">p.{p.pageNumber}</span>
                            </div>
                            {!p.answerPageNumber && (
                              <div className="text-xs bg-yellow-50 text-yellow-700 border border-yellow-200 rounded px-2 py-1">
                                답 미매칭
                              </div>
                            )}
                          </div>

                          <div className="bg-gray-50 rounded overflow-hidden mb-2">
                            <img src={p.imageDataUrl} alt={`문제 ${p.number}`} className="w-full object-contain max-h-40 cursor-pointer hover:opacity-75" onClick={() => setSelectedProblem(p)} />
                          </div>

                          {p.answerImageDataUrl ? (
                            <div className="bg-green-50 rounded overflow-hidden border border-green-200">
                              <img src={p.answerImageDataUrl} alt={`답 ${p.number}`} className="w-full object-contain max-h-24" />
                              <div className="text-xs text-green-600 text-center py-1">
                                {(() => {
                                  const txt = (p as any).answerText || '';
                                  // Hide garbled text (contains □, tofu, or only non-readable chars)
                                  const isReadable = txt && !/^[\s\d)\(\-]*$/.test(txt) && !/[\u25A1\uFFFD]/.test(txt) && /[a-zA-Z0-9가-힣①②③④⑤+\-=<>]/.test(txt);
                                  return isReadable ? <span className="font-semibold mr-1">답: {txt}</span> : null;
                                })()}
                                <span>p.{p.answerPageNumber}</span>
                              </div>
                            </div>
                          ) : (p as any).answerText ? (
                            <div className="bg-blue-50 rounded border border-blue-200 p-2">
                              <div className="text-xs text-blue-700 text-center">
                                <span className="font-semibold">답: {(p as any).answerText}</span>
                                {(p as any).serverMatched && <span className="ml-1 text-blue-500">(서버 추출)</span>}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-yellow-50 rounded border border-yellow-200 p-2 text-center">
                              <span className="text-xs text-yellow-600">답 미매칭</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Answer Page Fallback - shown when answer detection fails */}
                  {debugInfo?.answerDetectionFailed && debugInfo?.answerPageImages?.length > 0 && (
                    <div className="bg-white rounded-xl border p-5">
                      <h3 className="font-semibold text-orange-700 mb-2">⚠️ 답지 자동 감지 실패</h3>
                      <p className="text-sm text-gray-600 mb-3">답지 페이지에서 답을 자동으로 감지하지 못했습니다. 아래 답지 이미지를 참고하여 확인해주세요.</p>
                      <div className="space-y-4">
                        {debugInfo.answerPageImages.map((img: string, idx: number) => (
                          <div key={idx} className="border rounded-lg overflow-hidden">
                            <div className="bg-orange-50 px-3 py-1 text-sm font-medium text-orange-700">답지 페이지 {answerPageRange.start + idx}</div>
                            <img src={img} alt={`답지 페이지 ${idx + 1}`} className="w-full object-contain" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save Settings */}
                  <div className={`rounded-xl border p-5 ${extractState === 'done' ? 'bg-yellow-50 border-yellow-400 ring-2 ring-yellow-300' : 'bg-white'}`}>
                    <h3 className="font-semibold text-gray-800 mb-1">시험지 저장</h3>
                    {extractState === 'done' && (
                      <p className="text-sm text-yellow-700 mb-3 font-medium">⬇️ 아래에서 반을 선택하고 저장 버튼을 눌러주세요!</p>
                    )}
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">반 선택</label>
                        <select value={regClassroom} onChange={e => {
                          const val = e.target.value;
                          setRegClassroom(val);
                          setUploadStudent('');
                          if (val) {
                            fetchTestPapersForClassroom(val);
                            if (isCustomClass(val)) fetchUploadStudents(val);
                          }
                        }}
                          className="w-full max-w-md px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">반을 선택하세요</option>
                          {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}{c.subjectName === '맞춤반' ? ' (맞춤)' : ''}</option>)}
                        </select>
                      </div>

                      {regClassroom && isCustomClass(regClassroom) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">학생 선택 <span className="text-xs text-purple-600">(맞춤반)</span></label>
                          <select value={uploadStudent} onChange={e => setUploadStudent(e.target.value)}
                            className="w-full max-w-md px-4 py-2.5 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 bg-white">
                            <option value="">학생을 선택하세요</option>
                            {uploadStudents.map(s => <option key={s.id} value={s.id}>{s.name}{s.studentNumber ? ` (${s.studentNumber})` : ''}</option>)}
                          </select>
                        </div>
                      )}

                      {extractState === 'saved' ? (
                        <div className="w-full px-5 py-4 bg-green-50 border-2 border-green-500 rounded-lg text-center">
                          <div className="text-green-700 font-bold text-lg mb-1">✅ 시험지 저장 완료!</div>
                          <p className="text-green-600 text-sm">오답 등록 탭에서 이 시험지를 선택할 수 있습니다.</p>
                          <button onClick={() => { setExtractState('idle'); setPdfFile(null); setExtractedProblems([]); setWorkbookName(''); }}
                            className="mt-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                            새 시험지 업로드
                          </button>
                        </div>
                      ) : (
                        <button onClick={handleSaveTestPaper}
                          disabled={extractState === 'saving'}
                          className={`w-full px-5 py-2.5 rounded-lg font-medium transition-colors ${
                            extractState === 'saving'
                              ? 'bg-gray-400 text-white cursor-not-allowed'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}>
                          {extractState === 'saving' ? '⏳ 저장 중...' : '💾 시험지 저장 (DB)'}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ===== Uploaded Test Paper List ===== */}
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">📋 업로드된 시험지 목록</h3>
                  <button onClick={fetchAllTestPapers} className="text-sm text-blue-600 hover:text-blue-700 hover:underline">새로고침</button>
                </div>
                {allTestPapers.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-3xl mb-2">📄</div>
                    <p className="text-sm">업로드된 시험지가 없습니다.</p>
                    <p className="text-xs mt-1">위에서 PDF를 업로드하면 여기에 나타납니다.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                          <th className="pb-2 pr-3">시험지명</th>
                          <th className="pb-2 pr-3">반</th>
                          <th className="pb-2 pr-3 text-center">문제수</th>
                          <th className="pb-2 pr-3 text-center">이미지</th>
                          <th className="pb-2 pr-3">학생</th>
                          <th className="pb-2 pr-3">업로드 날짜</th>
                          <th className="pb-2 pr-3 text-center">오답</th>
                          <th className="pb-2 text-center">삭제</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allTestPapers.map(tp => (
                          <tr key={tp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                            <td className="py-2.5 pr-3 font-medium text-gray-800">{tp.name}</td>
                            <td className="py-2.5 pr-3 text-gray-600">{tp.classroom?.name || '-'}</td>
                            <td className="py-2.5 pr-3 text-center">{tp.totalProblems}</td>
                            <td className="py-2.5 pr-3 text-center">
                              {tp.pages.length > 0 ? (
                                <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
                                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>{tp.pages.length}장
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium">
                                  <span className="w-2 h-2 bg-red-400 rounded-full"></span>없음
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 pr-3 text-gray-500 text-xs">{(tp as any).student?.name || '-'}</td>
                            <td className="py-2.5 pr-3 text-gray-400 text-xs">{new Date(tp.createdAt).toLocaleDateString('ko-KR')}</td>
                            <td className="py-2.5 pr-3 text-center">
                              {(tp._count?.wrongAnswers || 0) > 0 ? (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">{tp._count?.wrongAnswers}</span>
                              ) : (
                                <span className="text-gray-300 text-xs">0</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center">
                              <button
                                onClick={() => handleDeleteTestPaper(tp.id)}
                                className="px-2.5 py-1 text-xs text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition-all"
                                title="시험지 삭제">
                                삭제
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="mt-3 text-xs text-gray-400 text-right">총 {allTestPapers.length}개 시험지</div>
                  </div>
                )}
              </div>

              {/* Debug Info Panel */}
              {debugInfo && (
                <div className="bg-white rounded-xl border p-5 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-800">
                      디버그 정보 (문제: {debugInfo.problemCount}개, 답: {debugInfo.answerCount}개)
                    </h3>
                    <button onClick={() => setShowDebug(!showDebug)} className="text-sm text-blue-600 hover:underline">
                      {showDebug ? '접기' : '펼치기'}
                    </button>
                  </div>
                  {showDebug && debugInfo.pages && debugInfo.pages.map((pg: any, idx: number) => (
                    <div key={idx} className="mb-4 border rounded p-3 bg-gray-50 text-xs font-mono overflow-x-auto">
                      <div className="font-bold text-sm mb-2">
                        📄 페이지 {pg.pageNum} | {pg.isTwoColumn ? '2단' : '1단'} | 폭:{pg.pageWidth}px
                        {pg.isTwoColumn && ` | 경계:${pg.columnBoundary}px`}
                        | 텍스트:{pg.totalItems}개 (좌:{pg.leftItems} 우:{pg.rightItems})
                      </div>
                      {pg.detectedProblems?.length > 0 && (
                        <div className="text-green-700 mb-1">
                          ✅ 감지된 문제: {pg.detectedProblems.map((d: any) => `${d.number}번(y:${d.y},col:${d.column},${d.method||''})`).join(', ')}
                        </div>
                      )}
                      {pg.detectedAnswers?.length > 0 && (
                        <div className="text-blue-700 mb-1">
                          📝 감지된 답: {pg.detectedAnswers.map((d: any) => `${d.number}번(y:${d.y},col:${d.column})${d.text ? '→'+d.text : ''}`).join(', ')}
                        </div>
                      )}
                      <details>
                        <summary className="cursor-pointer text-gray-600 hover:text-gray-800">텍스트 라인 보기 ({pg.lines?.length || 0}줄)</summary>
                        <div className="mt-1 max-h-60 overflow-y-auto">
                          {pg.lines?.map((ln: any, li: number) => (
                            <div key={li} className="py-0.5 border-b border-gray-200">
                              <span className="text-gray-400">[{ln.column}|y:{ln.y}]</span> {ln.text}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========== TAB: REGISTER ========== */}
          {activeTab === 'register' && (
            <div className="max-w-2xl">
              <div className="bg-white rounded-xl border p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">오답 등록</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">반 선택</label>
                    <select value={regClassroom} onChange={e => {
                      setRegClassroom(e.target.value);
                      setRegStudent('');
                      if (e.target.value) {
                        fetchStudentsForClassroom(e.target.value);
                        fetchTestPapersForClassroom(e.target.value);
                      }
                    }}
                      className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                      <option value="">반을 선택하세요</option>
                      {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {regClassroom && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">학생</label>
                        <select value={regStudent} onChange={e => setRegStudent(e.target.value)}
                          className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">학생을 선택하세요</option>
                          {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">시험지 선택</label>
                        <select value={regTestPaper} onChange={e => {
                          const val = e.target.value;
                          setRegTestPaper(val);
                          setRegSelectedProblems(new Set());
                          if (val) {
                            const tp = testPapers.find(t => t.id === val) || allTestPapers.find(t => t.id === val);
                            if (tp) setRegTestName(tp.name);
                          } else {
                            setRegTestName('');
                          }
                        }}
                          className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                          <option value="">시험지를 선택하세요</option>
                          {testPapers.length > 0 && (
                            <optgroup label="📋 이 반 시험지">
                              {testPapers.map(tp => <option key={tp.id} value={tp.id}>{tp.name} ({tp.totalProblems}문제)</option>)}
                            </optgroup>
                          )}
                          {(() => {
                            const otherTps = allTestPapers.filter(tp => tp.classroomId !== regClassroom);
                            if (otherTps.length > 0) return (
                              <optgroup label="📁 다른 반 시험지">
                                {otherTps.map(tp => <option key={tp.id} value={tp.id}>{tp.name} ({tp.totalProblems}문제) [{tp.classroom?.name}]</option>)}
                              </optgroup>
                            );
                            return null;
                          })()}
                        </select>
                        {testPapers.length === 0 && allTestPapers.length === 0 && (
                          <p className="text-xs text-orange-500 mt-1">시험지가 없습니다. &apos;시험지 업로드&apos; 탭에서 먼저 시험지를 업로드해주세요.</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">시험명</label>
                        <input type="text" value={regTestName} onChange={e => setRegTestName(e.target.value)}
                          placeholder={regTestPaper ? '시험지 이름이 자동 입력됩니다' : '예: 3월 모의고사'}
                          readOnly={!!regTestPaper}
                          className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${regTestPaper ? 'bg-gray-50 text-gray-600' : ''}`} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          틀린 문제 번호
                          {regTestPaper && regSelectedProblems.size > 0 && (
                            <span className="ml-2 text-red-500 font-normal">({regSelectedProblems.size}개 선택)</span>
                          )}
                        </label>
                        {regTestPaper ? (() => {
                          const tp = testPapers.find(t => t.id === regTestPaper) || allTestPapers.find(t => t.id === regTestPaper);
                          const total = tp?.totalProblems || 0;
                          return (
                            <div>
                              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border">
                                {Array.from({ length: total }, (_, i) => i + 1).map(num => {
                                  const isSelected = regSelectedProblems.has(num);
                                  return (
                                    <button key={num} type="button"
                                      onClick={() => {
                                        setRegSelectedProblems(prev => {
                                          const next = new Set(prev);
                                          if (next.has(num)) next.delete(num); else next.add(num);
                                          return next;
                                        });
                                      }}
                                      className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                                        isSelected
                                          ? 'bg-red-500 text-white shadow-md scale-105'
                                          : 'bg-white text-gray-700 border border-gray-300 hover:border-red-300 hover:bg-red-50'
                                      }`}>
                                      {num}
                                    </button>
                                  );
                                })}
                              </div>
                              {regSelectedProblems.size > 0 && (
                                <div className="mt-2 flex items-center justify-between">
                                  <p className="text-sm text-gray-500">
                                    선택: {Array.from(regSelectedProblems).sort((a, b) => a - b).join(', ')}
                                  </p>
                                  <button type="button" onClick={() => setRegSelectedProblems(new Set())}
                                    className="text-xs text-gray-400 hover:text-red-500 underline">전체 해제</button>
                                </div>
                              )}
                            </div>
                          );
                        })() : (
                          <input type="text" value={regProblemNumbers} onChange={e => setRegProblemNumbers(e.target.value)}
                            placeholder="시험지를 선택하거나 직접 입력 (예: 3, 7, 12, 15)"
                            className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500" />
                        )}
                      </div>
                      {regSuccess ? (
                        <div className="space-y-3">
                          <div className="w-full py-4 bg-green-50 border-2 border-green-400 rounded-lg text-center">
                            <div className="text-green-700 font-bold text-lg mb-1">✅ 오답 등록 완료!</div>
                            <p className="text-green-600 text-sm">오답 목록 탭에서 확인할 수 있습니다.</p>
                          </div>
                          <button onClick={() => { setRegSuccess(false); setRegStudent(''); setRegTestPaper(''); setRegTestName(''); setRegSelectedProblems(new Set()); }}
                            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">
                            새 오답 등록하기
                          </button>
                        </div>
                      ) : (
                        <button onClick={handleRegisterWrongAnswers} disabled={registering}
                          className="w-full py-2.5 text-white rounded-lg font-medium transition-all bg-red-600 hover:bg-red-700 disabled:opacity-50">
                          {registering ? '등록 중...' : '오답 등록'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========== TAB: ANSWERS ========== */}
          {activeTab === 'answers' && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">반 선택 (선택사항)</label>
                <select value={filterClassroom} onChange={async e => {
                  const val = e.target.value;
                  setFilterClassroom(val);
                  setLoading(true);
                  await fetchDataForClassroom(val);
                  setLoading(false);
                }}
                  className="w-full max-w-md px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">전체 반</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {Object.keys(groupedByStudent).length === 0 ? (
                <div className="text-center py-12 text-gray-500">{filterClassroom ? '선택한 반에 등록된 오답이 없습니다.' : '등록된 오답이 없습니다.'}</div>
              ) : (
                Object.entries(groupedByStudent).map(([studentId, { name, items }]) => {
                  const active = items.filter(i => i.status === 'ACTIVE');
                  const mastered = items.filter(i => i.status === 'MASTERED');
                  return (
                    <div key={studentId} className="mb-6 bg-white rounded-xl border overflow-hidden">
                      <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b">
                        <div>
                          <span className="font-semibold text-gray-800">{name}</span>
                          <span className="ml-3 text-sm text-gray-500">활성: {active.length} / 마스터: {mastered.length}</span>
                        </div>
                        {active.length > 0 && (
                          <button onClick={() => openTestCreateModal(studentId, name, active.length, active[0]?.classroomId)}
                            className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                            테스트 생성
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 py-3">
                        {items.map(wa => (
                          <div key={wa.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs ${
                            wa.status === 'MASTERED'
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-white border-gray-200 text-gray-700'
                          }`}>
                            <span className="font-bold text-blue-600">{wa.problemNumber}번</span>
                            <span className="text-gray-400">{wa.testName}</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              wa.status === 'ACTIVE' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                            }`}>{wa.status === 'ACTIVE' ? '미해결' : '마스터'}</span>
                            <span className="text-gray-400">{wa.round}회</span>
                            <button onClick={() => handleDeleteWrongAnswer(wa.id)} className="text-red-300 hover:text-red-500 ml-0.5">✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ========== TAB: TESTS ========== */}
          {activeTab === 'tests' && (
            <div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">반 선택 (선택사항)</label>
                <select value={filterClassroom} onChange={async e => {
                  const val = e.target.value;
                  setFilterClassroom(val);
                  setLoading(true);
                  await fetchDataForClassroom(val);
                  setLoading(false);
                }}
                  className="w-full max-w-md px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">전체 반</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {tests.length === 0 ? (
                <div className="text-center py-12 text-gray-500">생성된 테스트가 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {tests.map(test => (
                    <div key={test.id} className="bg-white rounded-xl border p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="font-semibold text-gray-800">{test.student.name}</span>
                          <span className="ml-3 text-sm text-gray-500">{test.round}회차 | {test.items.length}문항</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            test.status === 'GRADED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>{test.status === 'GRADED' ? '채점완료' : '채점대기'}</span>
                          <button onClick={() => generateTestPDF(test)}
                            className="px-4 py-1.5 bg-gray-600 text-white text-sm rounded-lg hover:bg-gray-700">테스트지 출력</button>
                          {test.status === 'PENDING' && (
                            <button onClick={() => handleStartGrading(test)}
                              className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">채점하기</button>
                          )}
                          <button onClick={() => handleDeleteTest(test.id)}
                            className="px-3 py-1.5 text-red-400 hover:text-red-600 text-sm">삭제</button>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">
                        생성: {new Date(test.createdAt).toLocaleDateString('ko-KR')}
                        {test.gradedAt && ` | 채점: ${new Date(test.gradedAt).toLocaleDateString('ko-KR')}`}
                      </div>
                      {test.status === 'GRADED' && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {test.items.map(item => (
                            <span key={item.id} className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold ${
                              item.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>{item.wrongAnswer.problemNumber}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Problem Detail Modal */}
      {selectedProblem && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedProblem(null)}>
          <div className="bg-white rounded-xl max-w-3xl max-h-[90vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{selectedProblem.number}번 문제 (p.{selectedProblem.pageNumber})</h3>
              <button onClick={() => setSelectedProblem(null)} className="text-gray-400 hover:text-gray-600 text-2xl">✕</button>
            </div>
            <img src={selectedProblem.imageDataUrl} alt={`문제 ${selectedProblem.number}`} className="w-full" />
          </div>
        </div>
      )}

      {/* Test Create Modal */}
      {testCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-1">테스트 생성</h3>
            <p className="text-sm text-gray-500 mb-4">{testCreateModal.studentName} - 활성 오답 {testCreateModal.activeCount}개</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">출제 문항수</label>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].filter(n => n <= testCreateModal.activeCount).map(n => (
                  <button key={n} onClick={() => setTestCreateCount(n)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      testCreateCount === n ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>{n}문항</button>
                ))}
                <button onClick={() => setTestCreateCount(testCreateModal.activeCount)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    testCreateCount === testCreateModal.activeCount ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>전체 ({testCreateModal.activeCount})</button>
              </div>
              <p className="text-xs text-gray-400 mt-2">문제 순서는 랜덤으로 섞입니다</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setTestCreateModal(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleCreateTest} disabled={testCreateCount === 0}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                생성 및 출력
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grading Modal */}
      {gradingTest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-1">채점</h3>
            <p className="text-sm text-gray-500 mb-4">{gradingTest.student.name} - {gradingTest.round}회차</p>
            <div className="space-y-3">
              {gradingTest.items.map(item => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 rounded-full font-semibold text-sm">
                      {item.wrongAnswer.problemNumber}
                    </span>
                    <span className="text-sm text-gray-600">{item.wrongAnswer.testName}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setGradeResults(p => ({ ...p, [item.wrongAnswerId]: true }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        gradeResults[item.wrongAnswerId] === true ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-50'
                      }`}>O</button>
                    <button onClick={() => setGradeResults(p => ({ ...p, [item.wrongAnswerId]: false }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                        gradeResults[item.wrongAnswerId] === false ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                      }`}>X</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setGradingTest(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50">취소</button>
              <button onClick={handleSubmitGrade}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700">채점 완료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
