'use client';
// @ts-nocheck

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { hapticSelection, hapticMedium, hapticLight, hapticHeavy } from '@/lib/haptics';
import { Button, Card, Badge, Stepper, SectionHeader } from '@/components/ui';
import { EmptyState } from '@/components/ui/EmptyState';
import { toRenderableImageSrc } from '@/lib/imageUrl';

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
  testPaper?: {
    id?: string;
    name?: string;
    answers?: string | null;
    pages?: { id?: string; pageNumber: number; imageUrl: string; answerImageUrl?: string | null }[];
  } | null;
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
   Helpers
   ============================================================ */
/**
 * 시드 기반 셔플 — 같은 seed → 같은 결과 순서.
 * 이것으로 PDF 출력과 채점 화면의 문제 순서를 동일하게 맞춘다.
 */
function seededShuffle<T>(array: T[], seed: string): T[] {
  const arr = [...array];
  // FNV-1a hash → 32bit 초기 상태
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = (h >>> 0) || 1;
  const rand = () => {
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ============================================================
   Main Page Component
   ============================================================ */
export default function WrongAnswersPage() {
  const router = useRouter();
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
  // 서버에서 추출한 텍스트 정답 맵 (problemNumber → "①", "1", "A" 등)
  // - 이미지 정답 추출 실패 시에도 채점 시 텍스트 정답을 표시하기 위해 저장
  const [serverTextAnswers, setServerTextAnswers] = useState<Record<string, string>>({});

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
  const [testCreateModal, setTestCreateModal] = useState<{ studentId: string; studentName: string; activeCount: number; classroomId?: string; testNameGroups: { testName: string; count: number }[] } | null>(null);
  const [testCreateCount, setTestCreateCount] = useState(0);
  const [selectedTestNames, setSelectedTestNames] = useState<Set<string>>(new Set());

  // Grading modal
  const [gradingTest, setGradingTest] = useState<WrongAnswerTestRecord | null>(null);
  const [gradeResults, setGradeResults] = useState<Record<string, boolean>>({});
  const [showGradeAnswer, setShowGradeAnswer] = useState<Set<string>>(new Set());
  // 채점 화면의 문제 순서 — PDF 출력과 동일한 순서를 보장하기 위해 seededShuffle 사용
  const gradingItemsOrdered = useMemo(() => {
    if (!gradingTest) return [];
    return seededShuffle(gradingTest.items, gradingTest.id);
  }, [gradingTest]);

  // Filter classroom for answers/tests tabs
  const [filterClassroom, setFilterClassroom] = useState('');

  // 오답 목록 일괄 삭제 — 선택 모드
  const [wrongSelectMode, setWrongSelectMode] = useState(false);
  const [selectedWrongIds, setSelectedWrongIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // 시험지 정답 직접 입력 모달 — 기존 시험지에 정답이 없을 때 수동 입력용
  const [answerEditModal, setAnswerEditModal] = useState<{
    id: string; name: string; totalProblems: number; text: string; saving: boolean;
  } | null>(null);

  useEffect(() => { fetchClassrooms(); fetchAllTestPapers(); }, []);

  // When tab changes, reload data for the selected classroom
  useEffect(() => {
    if (regClassroom) {
      fetchTestPapersForClassroom(regClassroom);
      fetchStudentsForClassroom(regClassroom);
    }
    if (activeTab === 'answers' || activeTab === 'tests') {
      // 탭 진입 시 filterClassroom 기준으로 데이터 로드
      const classId = filterClassroom || regClassroom || '';
      if (!filterClassroom && regClassroom) setFilterClassroom(regClassroom);
      fetchDataForClassroom(classId);
    }
  }, [activeTab]);

  // 반 필터 변경 시 데이터 다시 로드
  useEffect(() => {
    if (activeTab === 'answers' || activeTab === 'tests') {
      setLoading(true);
      fetchDataForClassroom(filterClassroom).finally(() => setLoading(false));
    }
  }, [filterClassroom]);

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

  const fetchSeqRef = useRef(0);
  const fetchDataForClassroom = async (id: string) => {
    const seq = ++fetchSeqRef.current;
    try {
      const classroomParam = id ? `?classroomId=${id}` : '';
      const [waRes, testRes, statsRes] = await Promise.all([
        fetch(`/api/wrong-answers${classroomParam}`),
        fetch(`/api/wrong-answers/tests${classroomParam}`),
        fetch(`/api/wrong-answers/stats${classroomParam}`),
      ]);
      // 경합 방지: 이 호출이 가장 최신이 아닌 경우 결과 무시
      if (seq !== fetchSeqRef.current) return;
      if (waRes.ok) { const d = await waRes.json(); if (seq === fetchSeqRef.current) setWrongAnswers(Array.isArray(d) ? d : []); }
      if (testRes.ok) { const d = await testRes.json(); if (seq === fetchSeqRef.current) setTests(Array.isArray(d) ? d : []); }
      if (statsRes.ok) { const d = await statsRes.json(); if (seq === fetchSeqRef.current) setStats(d); }
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

      // ============================================================
      // 페이지별 "답지 여부" 판별 (heuristic)
      //   - 문제 페이지: 긴 지문 텍스트가 많음 (longChars ≥ ~200)
      //   - 답지 페이지:
      //       (a) 텍스트 기반: "N)" 답 번호가 많고(≥8), 긴 지문이 거의 없음(<100자)
      //       (b) 이미지 기반: 숫자 이미지가 많고(≥15), 긴 지문 없음
      //   ※ 문제 페이지에도 "정답 : ____" 입력란이 있어서
      //     "정답/테스트/답지" 같은 키워드만으로는 판별 불가 → 사용하지 않음.
      // ============================================================
      const pageIsAnswer = new Array<boolean>(numPages + 1).fill(false);

      for (let p = 1; p <= numPages; p++) {
        try {
          const { items } = await getPageTextItems(pdf, p);
          const longItems = items.filter((t: any) => t.text.trim().length >= 15);
          const totalLongChars = longItems.reduce((s: number, t: any) => s + t.text.trim().length, 0);
          const ansPatterns = items.filter((t: any) =>
            /^\d{1,2}\)\s*$/.test(t.text) ||
            /^\d{1,2}\)\s*답/.test(t.text) ||
            /^\d{1,2}\)(?:\s|\()/.test(t.text)
          );

          // 긴 지문이 많으면 무조건 문제 페이지
          const looksLikeProblem = totalLongChars >= 150 || longItems.length >= 5;
          if (looksLikeProblem) { pageIsAnswer[p] = false; continue; }

          // 텍스트 기반 답지
          if (ansPatterns.length >= 8 && totalLongChars < 100) {
            pageIsAnswer[p] = true; continue;
          }

          // 이미지 기반 답지 (숫자 이미지 다수)
          try {
            const page = await pdf.getPage(p);
            const opList = await page.getOperatorList();
            let imgCount = 0;
            for (let i = 0; i < opList.fnArray.length; i++) {
              if (opList.fnArray[i] === 85) imgCount++; // paintImageXObject
            }
            if (imgCount >= 15 && totalLongChars < 100) {
              pageIsAnswer[p] = true; continue;
            }
          } catch { /* ignore */ }

          pageIsAnswer[p] = false;
        } catch { pageIsAnswer[p] = false; }
      }

      // 뒤에서부터 연속된 답지 페이지를 찾음. 중간에 끊기면 거기서 멈춤.
      let answerStartPage = numPages + 1;
      for (let p = numPages; p >= 2; p--) {
        if (pageIsAnswer[p]) answerStartPage = p;
        else break;
      }

      // 감지 실패 시 기존 fallback: 마지막 페이지를 답지로
      if (answerStartPage > numPages) answerStartPage = numPages;
      // 안전장치: 최소 1페이지는 문제로 유지
      if (answerStartPage < 2) answerStartPage = 2;

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
            // 서버에서 추출한 텍스트 정답을 전역 상태로 저장 (채점 화면 폴백용)
            if (serverData.answers && Object.keys(serverData.answers).length > 0) {
              const mapped: Record<string, string> = {};
              Object.entries(serverData.answers as Record<string, any>).forEach(([k, v]) => {
                if (v != null && typeof v === 'string') mapped[String(k)] = v;
              });
              setServerTextAnswers(mapped);
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

      // Build answers JSON — prefer server-extracted TEXT answers (e.g. "①", "1", "A")
      // so the grading modal can fall back to showing text even if image extraction failed.
      // Fallback to page reference "p.X" only when no text answer was extracted for that problem.
      const answersObj: Record<string, string> = {};
      Object.entries(serverTextAnswers).forEach(([num, ans]) => {
        if (ans && typeof ans === 'string') answersObj[String(num)] = ans;
      });
      extractedProblems.forEach(p => {
        if (!answersObj[String(p.number)] && p.answerPageNumber) {
          answersObj[String(p.number)] = `p.${p.answerPageNumber}`;
        }
      });
      formData.append('answers', JSON.stringify(answersObj));

      // Upload problem images with actual problem numbers
      // NOTE: 과거에는 Drive 업로드 실패 시 대비용 base64(dataUrls/answerDataUrls)를 함께 전송했으나,
      // 이 폴백이 Neon DB에 수 MB base64를 누적 저장해 네트워크 egress를 고갈시키는 원인이었다.
      // 2026-04-17 이후 서버는 Drive 업로드 실패 시 500을 반환하므로 base64 전송을 전면 제거한다.
      const problemNumbers: number[] = [];
      for (let i = 0; i < extractedProblems.length; i++) {
        const p = extractedProblems[i];
        const blob = dataURLtoBlob(p.imageDataUrl);
        const file = new File([blob], `problem-${p.number}.png`, { type: 'image/png' });
        formData.append('images', file);
        problemNumbers.push(p.number);

        // 정답 이미지도 함께 전송 (blob만, base64 전송 없음)
        if (p.answerImageDataUrl) {
          const ansBlob = dataURLtoBlob(p.answerImageDataUrl);
          const ansFile = new File([ansBlob], `answer-${p.number}.png`, { type: 'image/png' });
          formData.append('answerImages', ansFile);
        } else {
          // 정답 이미지가 없는 문제는 빈 파일로 순서 유지
          const emptyBlob = new Blob([], { type: 'image/png' });
          formData.append('answerImages', new File([emptyBlob], `answer-${p.number}-empty.png`, { type: 'image/png' }));
        }

        setExtractProgress({ current: i + 1, total: extractedProblems.length, message: `이미지 업로드 중 (${i + 1}/${extractedProblems.length})` });
      }
      // Send actual problem numbers so pages get correct pageNumber
      formData.append('problemNumbers', JSON.stringify(problemNumbers));

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

  /**
   * 정답 직접 입력 모달 열기 — 기존 시험지의 testPaper.answers (JSON) 를
   * 사용자가 편집할 수 있는 텍스트 형태로 변환해 모달을 연다.
   * "p.X" 형태의 페이지 참조는 빈 칸으로 보여 수동으로 덮어쓸 수 있게 한다.
   */
  const openAnswerEditor = async (tp: TestPaperRecord) => {
    let existing: Record<string, string> = {};
    try {
      const res = await fetch(`/api/test-papers/${tp.id}`);
      if (res.ok) {
        const full = await res.json();
        if (full?.answers) {
          try { existing = JSON.parse(full.answers); } catch {}
        }
      }
    } catch {}
    const total = tp.totalProblems || tp.pages?.length || 0;
    const lines: string[] = [];
    for (let n = 1; n <= total; n++) {
      const raw = existing[String(n)];
      // "p.X" 는 유효한 텍스트 정답이 아니므로 빈 칸으로
      const display = raw && !raw.startsWith('p.') ? raw : '';
      lines.push(`${n}. ${display}`);
    }
    setAnswerEditModal({
      id: tp.id,
      name: tp.name,
      totalProblems: total,
      text: lines.join('\n'),
      saving: false,
    });
  };

  /**
   * 정답 입력 모달 저장 — textarea 내용을 파싱해서 answers JSON 으로 PATCH 한다.
   * 지원 포맷:
   *   "1. ①"
   *   "1: ①"
   *   "1) ①"
   *   "1 ①"  (공백 구분)
   * 각 라인에서 "번호" + "구분자" + "답" 형태를 추출한다.
   * 원형 숫자(①-⑩) 는 그대로 저장한다 (숫자도 그대로 저장).
   */
  const saveAnswerEditor = async () => {
    if (!answerEditModal) return;
    setAnswerEditModal(prev => prev ? { ...prev, saving: true } : prev);
    try {
      const map: Record<string, string> = {};
      const lines = answerEditModal.text.split('\n');
      for (const raw of lines) {
        const line = raw.trim();
        if (!line) continue;
        // "1. 답" / "1: 답" / "1) 답" / "1 답"
        const m = line.match(/^(\d{1,3})\s*[.:)]?\s+(.+)$/);
        if (m) {
          const num = m[1];
          const ans = m[2].trim();
          if (ans) map[num] = ans;
        }
      }
      const res = await fetch(`/api/test-papers/${answerEditModal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: JSON.stringify(map) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      showMsg(`정답 저장 완료 (${Object.keys(map).length}개)`);
      setAnswerEditModal(null);
      // 오답 데이터도 새로 고침 — 채점 모달이 바로 반영되도록
      await Promise.all([
        fetchAllTestPapers(),
        filterClassroom ? fetchDataForClassroom(filterClassroom) : Promise.resolve(),
      ]);
    } catch (err: any) {
      showMsg('정답 저장 실패: ' + err.message, 'error');
      setAnswerEditModal(prev => prev ? { ...prev, saving: false } : prev);
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

  // 체크박스 선택 토글
  const toggleSelectWrong = (id: string) => {
    setSelectedWrongIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // 학생 단위 전체 선택/해제 토글
  const toggleSelectStudentAll = (studentIds: string[]) => {
    setSelectedWrongIds(prev => {
      const next = new Set(prev);
      const allSelected = studentIds.every(id => next.has(id));
      if (allSelected) {
        studentIds.forEach(id => next.delete(id));
      } else {
        studentIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  // 선택 모드 종료 + 선택 해제
  const exitSelectMode = () => {
    setWrongSelectMode(false);
    setSelectedWrongIds(new Set());
  };

  // 일괄 삭제 실행
  const handleBulkDeleteWrongAnswers = async () => {
    const ids = Array.from(selectedWrongIds);
    if (ids.length === 0) return;
    if (!confirm(`${ids.length}개의 오답을 삭제하시겠습니까? (되돌릴 수 없습니다)`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/wrong-answers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      hapticMedium();
      showMsg(`${data.deleted ?? ids.length}개 삭제됨`);
      exitSelectMode();
      if (filterClassroom) await fetchDataForClassroom(filterClassroom);
    } catch {
      showMsg('일괄 삭제 실패', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  const generateTestPDF = (test: WrongAnswerTestRecord) => {
    // 시드 기반 셔플 — test.id 로 고정. 채점 모달과 동일한 순서 보장.
    const shuffled = seededShuffle(test.items, test.id);

    // Build problem entries with image URLs
    const problems = shuffled.map((item, idx) => {
      const wa = item.wrongAnswer as any;
      let imgUrl = '';
      if (wa.testPaper?.pages) {
        const page = wa.testPaper.pages.find((p: any) => p.pageNumber === wa.problemNumber);
        if (page) imgUrl = page.imageUrl;
      }
      if (!imgUrl && wa.problemImage) imgUrl = wa.problemImage;
      return { num: idx + 1, originalNum: wa.problemNumber, testName: wa.testName, imgUrl };
    });
    // 4문제씩 페이지로 나눔
    const PROBLEMS_PER_PAGE = 4;
    const pages: typeof problems[] = [];
    for (let i = 0; i < problems.length; i += PROBLEMS_PER_PAGE) {
      pages.push(problems.slice(i, i + PROBLEMS_PER_PAGE));
    }
    // 빈 슬롯을 채우는 플레이스홀더 (마지막 페이지가 4개 미만일 경우)
    const fillEmptySlots = (arr: typeof problems) => {
      const filled = [...arr];
      while (filled.length < PROBLEMS_PER_PAGE) {
        filled.push({ num: -1, originalNum: 0, testName: '', imgUrl: '' });
      }
      return filled;
    };

    const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const totalPages = pages.length;
    // about:blank 창에서도 /api/drive-image 같은 상대 URL이 해석되도록 base href 를 명시한다.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<base href="${origin}/">
<title>오답 테스트 - ${test.student.name}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
    color: #1a1a1a;
    background: #e5e7eb;
  }

  /* 상단 컨트롤 바 (화면에서만 표시) */
  .no-print.btn-bar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 10px;
    justify-content: center;
    padding: 14px;
    background: rgba(229,231,235,0.94);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border-bottom: 1px solid #d1d5db;
  }
  .btn-bar button {
    padding: 10px 24px;
    font-size: 14px;
    border: none;
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    font-family: inherit;
  }
  .btn-pdf { background: #1f3a5f; color: #fff; }
  .btn-back { background: #6b7280; color: #fff; }

  /* 페이지 — A4 정확한 크기 */
  .test-page {
    width: 210mm;
    height: 297mm;
    padding: 12mm 10mm;
    background: #fff;
    page-break-after: always;
    display: flex;
    flex-direction: column;
    margin: 14px auto;
    box-shadow: 0 4px 18px rgba(0,0,0,0.12);
    border-radius: 4px;
  }
  .test-page:last-of-type { page-break-after: auto; }

  /* 페이지 헤더 */
  .page-header {
    flex: 0 0 auto;
    border-bottom: 1.5px solid #222;
    padding-bottom: 7px;
    margin-bottom: 9px;
  }
  .page-header .header-main {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .page-header .brand-logo {
    flex: 0 0 auto;
    height: 34px;
    width: auto;
    max-width: 180px;
    object-fit: contain;
    object-position: left center;
    /* logo-horizontal.png 은 우측에 여백이 크므로 가변 너비로 잘라낸다 */
  }
  .page-header .header-right {
    flex: 1 1 auto;
    min-width: 0;
  }
  .page-header .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .page-header h1 {
    font-size: 17px;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #111;
  }
  .page-header .meta {
    font-size: 11px;
    color: #666;
    font-weight: 600;
  }
  .page-header .info-row {
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    font-size: 11.5px;
    color: #333;
  }
  .page-header .info-row b { color: #111; font-weight: 700; }

  /* 2 × 2 문제 그리드 */
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 4mm;
  }

  .problem {
    display: flex;
    flex-direction: column;
    border: 1.5px solid #333;
    border-radius: 5px;
    overflow: hidden;
    min-height: 0;
    background: #fff;
  }
  .problem.empty {
    border: 1.5px dashed #d1d5db;
    background: #fafafa;
  }
  .problem-header {
    flex: 0 0 auto;
    padding: 5px 10px;
    background: #f3f4f6;
    border-bottom: 1px solid #c9c9c9;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .problem-header .num {
    font-size: 15px;
    font-weight: 800;
    color: #1f3a5f;
  }
  .problem-header .source {
    color: #888;
    font-size: 10px;
    font-weight: 500;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .problem-body {
    flex: 0 0 50mm;
    padding: 4px;
    border-bottom: 1.5px dashed #bbb;
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .problem-body img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .problem-body .no-img {
    color: #bbb;
    font-size: 11px;
  }

  /* 풀이 공간 — 페이지 남은 공간을 모두 차지 */
  .answer-area {
    flex: 1;
    min-height: 0;
    padding: 7px 11px 6px;
    position: relative;
    font-size: 11px;
    color: #999;
  }
  .answer-label {
    font-size: 10.5px;
    color: #666;
    font-weight: 600;
    margin-bottom: 3px;
    letter-spacing: 0.02em;
  }
  .answer-label .ans-box {
    display: inline-block;
    border: 1px solid #aaa;
    border-radius: 4px;
    padding: 1px 30px;
    margin-left: 6px;
    min-width: 60px;
    color: transparent;
  }

  /* 마지막 페이지 점수 박스 */
  .last-footer {
    flex: 0 0 auto;
    margin-top: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .score-box { font-size: 13px; font-weight: 700; color: #222; }
  .score-box .box {
    border: 2px solid #222;
    padding: 3px 16px;
    border-radius: 6px;
    margin-left: 6px;
    display: inline-block;
    min-width: 60px;
    text-align: center;
    color: transparent;
  }
  .foot-text { font-size: 10px; color: #bbb; }

  @media print {
    html, body { background: #fff; }
    .no-print { display: none !important; }
    .test-page {
      margin: 0;
      box-shadow: none;
      border-radius: 0;
      width: 210mm;
      height: 297mm;
    }
  }
</style>
</head><body>
<div class="no-print btn-bar">
  <button class="btn-back" onclick="window.close()">← 뒤로가기</button>
  <button class="btn-pdf" onclick="window.print()">PDF 저장</button>
</div>

${pages.map((pageProblems, pageIdx) => {
  const isLastPage = pageIdx === totalPages - 1;
  const slots = fillEmptySlots(pageProblems);
  return `
<section class="test-page">
  <div class="page-header">
    <div class="header-main">
      <img class="brand-logo" src="${origin}/logo-horizontal.png" alt="수학탐구학원" />
      <div class="header-right">
        <div class="title-row">
          <h1>오답 테스트 · ${test.student.name}</h1>
          <span class="meta">${pageIdx + 1} / ${totalPages} 페이지</span>
        </div>
        <div class="info-row">
          <span><b>반</b> ${test.classroom.name}</span>
          <span><b>회차</b> ${test.round}회</span>
          <span><b>날짜</b> ${today}</span>
          <span><b>총 ${problems.length}문항</b></span>
        </div>
      </div>
    </div>
  </div>
  <div class="grid">
    ${slots.map(p => {
      if (p.num < 0) {
        return `<div class="problem empty"></div>`;
      }
      return `
    <div class="problem">
      <div class="problem-header">
        <span class="num">${p.num}</span>
        <span class="source">${p.testName} #${p.originalNum}</span>
      </div>
      <div class="problem-body">
        ${p.imgUrl ? `<img src="${toRenderableImageSrc(p.imgUrl)}" alt="문제 ${p.num}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\\'no-img\\'>이미지 로드 실패</div>')" />` : '<div class="no-img">문제 이미지 없음</div>'}
      </div>
      <div class="answer-area">
        <div class="answer-label">답<span class="ans-box">·</span></div>
      </div>
    </div>`;
    }).join('')}
  </div>
  ${isLastPage ? `
  <div class="last-footer">
    <div class="foot-text">수학탐구 오답관리 시스템</div>
    <div class="score-box">점수 <span class="box">/ ${problems.length}</span></div>
  </div>` : ''}
</section>`;
}).join('')}

</body></html>`;

    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const openTestCreateModal = (studentId: string, studentName: string, activeCount: number, classroomId?: string) => {
    // 학생의 활성 오답을 시험지명별로 그룹화
    const studentActive = wrongAnswers.filter(wa => wa.studentId === studentId && wa.status === 'ACTIVE');
    const nameMap: Record<string, number> = {};
    for (const wa of studentActive) {
      nameMap[wa.testName] = (nameMap[wa.testName] || 0) + 1;
    }
    const testNameGroups = Object.entries(nameMap)
      .map(([testName, count]) => ({ testName, count }))
      .sort((a, b) => b.count - a.count);

    setTestCreateModal({ studentId, studentName, activeCount, classroomId: classroomId || filterClassroom || '', testNameGroups });
    setSelectedTestNames(new Set()); // 기본: 전체 선택 안 함 (= 전체 출제)
    setTestCreateCount(activeCount); // default to all
  };

  const handleCreateTest = async () => {
    if (!testCreateModal) return;
    const { studentId, classroomId } = testCreateModal;
    const cId = classroomId || filterClassroom || regClassroom || '';
    if (!cId) { showMsg('반을 선택해주세요', 'error'); return; }
    try {
      const payload: any = { studentId, classroomId: cId, maxCount: testCreateCount };
      // 특정 시험지 선택 시 testNames 전달
      if (selectedTestNames.size > 0) {
        payload.testNames = Array.from(selectedTestNames);
      }
      const res = await fetch('/api/wrong-answers/tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
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
    // 즉시 UI에서 제거 (서버 응답 전)
    setTests(prev => prev.filter(t => t.id !== testId));
    try {
      const res = await fetch(`/api/wrong-answers/tests/${testId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('삭제 실패');
      showMsg('테스트가 삭제되었습니다');
    } catch {
      showMsg('테스트 삭제 실패', 'error');
      // 실패 시 데이터 다시 불러오기
      await fetchDataForClassroom(filterClassroom);
    }
  };

  const handleStartGrading = (test: WrongAnswerTestRecord) => {
    setGradingTest(test);
    const init: Record<string, boolean> = {};
    test.items.forEach(i => { init[i.wrongAnswerId] = i.isCorrect ?? false; });
    setGradeResults(init);
    setShowGradeAnswer(new Set());
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

  // 마스터(MASTERED) 된 오답은 마스터 시점 이후 60일 동안만 목록에 남는다 (서버 GET 에서 이미 필터링됨).
  // 60일 이후에는 cron(/api/cron/cleanup-mastered)이 DB 에서 영구 삭제한다.
  // → 학생 카드에는 ACTIVE + 최근 60일 이내 MASTERED 항목이 함께 표시된다.
  const visibleGroupedByStudent = groupedByStudent;

  /* ============================================================
     Render
     ============================================================ */
  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <h1 className="text-[22px] md:text-2xl font-bold text-ink" style={{ letterSpacing: '-0.02em' }}>오답 관리</h1>
        <select
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) router.push(`/classes/${id}`);
          }}
          className="press press-subtle px-3 py-1.5 text-sm font-medium rounded-full cursor-pointer focus:outline-none focus-visible:ring-2"
          style={{
            background: 'var(--color-info-bg)',
            color: 'var(--color-accent)',
            border: '1px solid var(--color-border)',
            transition: 'background-color 200ms var(--ease-apple-inout)',
          }}
          title="반관리 페이지로 바로 이동"
        >
          <option value="">🏠 반관리로 이동...</option>
          {classrooms.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{c.subjectName === '맞춤반' ? ' (맞춤)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      {message && (
        <div
          className="anim-pop-in mb-4 p-3 rounded-[12px] text-sm font-medium flex items-center gap-2"
          style={{
            background: messageType === 'success' ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
            color: messageType === 'success' ? 'var(--color-success)' : 'var(--color-danger)',
            border: `1px solid ${messageType === 'success' ? 'var(--color-success)' : 'var(--color-danger)'}`,
          }}
        >
          <span aria-hidden>{messageType === 'success' ? '✓' : '!'}</span>
          <span>{message}</span>
        </div>
      )}

      {/* Tabs (segmented pill style, tokenized) */}
      <div
        className="flex gap-1 mb-6 overflow-x-auto p-1 rounded-[14px]"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
        role="tablist"
      >
        {[
          { key: 'upload' as const, label: '시험지 업로드' },
          { key: 'register' as const, label: '오답 등록' },
          { key: 'answers' as const, label: '오답 목록' },
          { key: 'tests' as const, label: '테스트 관리' },
        ].map(tab => {
          const on = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={on}
              onPointerDown={() => hapticSelection()}
              onClick={() => setActiveTab(tab.key)}
              className="press press-subtle px-4 py-2 text-[13.5px] font-semibold rounded-[10px] whitespace-nowrap min-h-[40px]"
              style={{
                background: on ? 'var(--color-surface)' : 'transparent',
                color: on ? 'var(--color-accent)' : 'var(--color-ink-2)',
                boxShadow: on ? 'var(--shadow-sh1)' : 'none',
                transition:
                  'background-color 200ms var(--ease-apple-inout), color 200ms var(--ease-apple-inout), box-shadow 200ms var(--ease-apple-inout)',
                letterSpacing: '-0.01em',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {loading && activeTab !== 'upload' ? (
        <div className="flex justify-center py-12">
          <div
            className="animate-spin rounded-full h-8 w-8"
            style={{ borderBottom: '2px solid var(--color-accent)' }}
          />
        </div>
      ) : (
        <>
          {/* ========== TAB: UPLOAD ========== */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              {/* ===== Upload Flow Stepper ===== */}
              {(() => {
                const uploadStep =
                  !pdfFile ? 0 :
                  (extractState === 'detecting' || extractState === 'extracting') ? 2 :
                  (extractState === 'done' || extractState === 'saving' || extractState === 'saved') ? 3 :
                  1;
                const uploadCompletedUntil =
                  !pdfFile ? -1 :
                  extractState === 'saved' ? 3 :
                  (extractState === 'done' || extractState === 'saving') ? 2 :
                  (extractState === 'detecting' || extractState === 'extracting') ? 1 :
                  0;
                return (
                  <Card padding="md" elevation="sh1">
                    <Stepper
                      steps={[
                        { label: '업로드', description: 'PDF 선택' },
                        { label: '범위 설정', description: '문제·답지' },
                        { label: '추출', description: '자동 감지' },
                        { label: '저장', description: '반 지정' },
                      ]}
                      current={uploadStep}
                      completedUntil={uploadCompletedUntil}
                    />
                  </Card>
                );
              })()}

              {/* ===== Step 1: PDF Upload ===== */}
              <Card padding="md">
                <SectionHeader title="PDF 시험지 업로드" description="수학 교재·시험지 PDF 를 드래그하거나 클릭하여 선택하세요." />

                <label
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className="block border-2 border-dashed p-8 text-center transition-colors cursor-pointer press press-subtle"
                  style={{
                    borderRadius: 'var(--radius-card)',
                    borderColor: isDragging ? 'var(--color-accent)' : 'var(--color-border-2)',
                    background: isDragging ? 'var(--color-info-bg)' : 'var(--color-surface-2)',
                  }}>
                  <div className="text-3xl mb-2" aria-hidden>📁</div>
                  <p className="text-sm text-ink-2 font-medium">PDF 파일을 클릭하거나 드래그해서 업로드하세요</p>
                  <p className="text-xs text-mute mt-1">수학 교재, 시험지 등의 PDF</p>
                  <input type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" />
                </label>

                {pdfFile && (
                  <div
                    className="mt-3 p-3 flex items-center gap-2"
                    style={{
                      borderRadius: 'var(--radius-btn)',
                      background: 'var(--color-success-bg)',
                      border: '1px solid var(--color-success)',
                    }}>
                    <Badge tone="success" variant="solid" size="sm">선택됨</Badge>
                    <span className="font-medium text-sm truncate" style={{ color: 'var(--color-success)' }}>
                      {pdfFile.name}
                    </span>
                    <span className="text-xs ml-auto shrink-0" style={{ color: 'var(--color-success)' }}>
                      {(pdfFile.size / 1024 / 1024).toFixed(1)}MB
                    </span>
                  </div>
                )}
              </Card>

              {/* ===== Step 2: Page Range Settings ===== */}
              {pdfFile && totalPages > 0 && extractState !== 'detecting' && extractState !== 'extracting' && extractState !== 'saving' && (
                <Card padding="md" className="anim-pop-in">
                  <SectionHeader title="페이지 범위 설정" description={`총 ${totalPages}페이지 · 문제와 답지 페이지 구간을 각각 지정하세요.`} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Problem pages */}
                    <div
                      className="p-4"
                      style={{
                        borderRadius: 'var(--radius-card)',
                        background: 'var(--color-info-bg)',
                        border: '1px solid var(--color-accent)',
                      }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge tone="accent" variant="solid" size="sm">문제</Badge>
                        <span className="text-xs font-semibold text-accent">문제 페이지 범위</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium mb-1 text-accent">시작</label>
                          <input type="number" min={1} max={totalPages} value={problemPageRange.start}
                            onChange={e => setProblemPageRange(p => ({ ...p, start: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="w-full px-3 py-2 text-sm border bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                            style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-border)' }} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium mb-1 text-accent">끝</label>
                          <input type="number" min={1} max={totalPages} value={problemPageRange.end}
                            onChange={e => setProblemPageRange(p => ({ ...p, end: Math.min(totalPages, parseInt(e.target.value) || totalPages) }))}
                            className="w-full px-3 py-2 text-sm border bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                            style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-border)' }} />
                        </div>
                      </div>
                      <p className="text-xs mt-2 text-accent">{problemPageRange.start} ~ {problemPageRange.end} 페이지</p>
                    </div>

                    {/* Answer pages */}
                    <div
                      className="p-4"
                      style={{
                        borderRadius: 'var(--radius-card)',
                        background: 'var(--color-success-bg)',
                        border: '1px solid var(--color-success)',
                      }}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge tone="success" variant="solid" size="sm">답지</Badge>
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-success)' }}>답지 페이지 범위</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-success)' }}>시작</label>
                          <input type="number" min={1} max={totalPages} value={answerPageRange.start}
                            onChange={e => setAnswerPageRange(p => ({ ...p, start: Math.max(1, parseInt(e.target.value) || 1) }))}
                            className="w-full px-3 py-2 text-sm border bg-surface focus:outline-none focus:ring-2"
                            style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-border)' }} />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium mb-1" style={{ color: 'var(--color-success)' }}>끝</label>
                          <input type="number" min={1} max={totalPages} value={answerPageRange.end}
                            onChange={e => setAnswerPageRange(p => ({ ...p, end: Math.min(totalPages, parseInt(e.target.value) || totalPages) }))}
                            className="w-full px-3 py-2 text-sm border bg-surface focus:outline-none focus:ring-2"
                            style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-border)' }} />
                        </div>
                      </div>
                      <p className="text-xs mt-2" style={{ color: 'var(--color-success)' }}>{answerPageRange.start} ~ {answerPageRange.end} 페이지</p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-ink-2 mb-1.5">시험지 이름</label>
                      <input type="text" value={workbookName} onChange={e => setWorkbookName(e.target.value)}
                        placeholder="예: 3월 모의고사"
                        className="w-full max-w-md px-3 py-2 text-sm border bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                        style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-border)' }} />
                    </div>

                    <Button variant="accent" size="md" onClick={handleExtract}>
                      문제 및 답지 추출 시작
                    </Button>
                  </div>
                </Card>
              )}

              {/* ===== Step 3: Extraction Progress ===== */}
              {(extractState === 'detecting' || extractState === 'extracting' || extractState === 'saving') && (
                <Card padding="md" className="anim-pop-in">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="animate-spin w-5 h-5"
                      style={{
                        borderRadius: '999px',
                        border: '2px solid var(--color-border)',
                        borderTopColor: 'var(--color-accent)',
                      }}
                      aria-hidden
                    />
                    <span className="text-sm font-medium text-ink-2">{extractProgress.message || '처리 중...'}</span>
                  </div>
                  {extractProgress.total > 0 && (
                    <div className="w-full h-1.5 mt-2" style={{ background: 'var(--color-surface-2)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        className="h-full"
                        style={{
                          background: 'var(--color-accent)',
                          borderRadius: '999px',
                          width: `${(extractProgress.current / extractProgress.total) * 100}%`,
                          transition: 'width 300ms var(--ease-apple-inout)',
                        }}
                      />
                    </div>
                  )}
                </Card>
              )}

              {/* ===== Error ===== */}
              {extractState === 'error' && (
                <Card
                  padding="md"
                  className="anim-pop-in"
                  style={{ background: 'var(--color-danger-bg)', borderColor: 'var(--color-danger)' }}>
                  <div className="flex items-start gap-2">
                    <Badge tone="danger" variant="solid" size="sm">오류</Badge>
                    <p className="text-sm flex-1" style={{ color: 'var(--color-danger)' }}>{extractError}</p>
                  </div>
                  <Button variant="secondary" size="sm" className="mt-3" onClick={() => setExtractState('idle')}>
                    다시 시도
                  </Button>
                </Card>
              )}

              {/* ===== Extracted Results ===== */}
              {extractState === 'done' && extractedProblems.length > 0 && (
                <>
                  {/* Problem Gallery */}
                  <Card padding="md" className="anim-pop-in">
                    <SectionHeader
                      title={`추출된 문제 및 답: ${extractedProblems.length}개`}
                      description="문제 번호, 문제 이미지, 매칭된 답 이미지를 확인하세요."
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {extractedProblems.map(p => (
                        <Card
                          key={p.id}
                          padding="sm"
                          interactive
                          onClick={() => setSelectedProblem(p)}
                          className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-lg text-accent num-tabular">{p.number}번</span>
                            <span className="text-[11px] text-mute num-tabular">p.{p.pageNumber}</span>
                          </div>
                          {!p.answerPageNumber && (
                            <Badge tone="warn" variant="soft" size="sm">답 미매칭</Badge>
                          )}

                          <div
                            className="overflow-hidden"
                            style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius-btn)' }}>
                            <img
                              src={p.imageDataUrl}
                              alt={`문제 ${p.number}`}
                              className="w-full object-contain max-h-40"
                            />
                          </div>

                          {p.answerImageDataUrl ? (
                            <div
                              style={{
                                background: 'var(--color-success-bg)',
                                border: '1px solid var(--color-success)',
                                borderRadius: 'var(--radius-btn)',
                                overflow: 'hidden',
                              }}>
                              <img src={p.answerImageDataUrl} alt={`답 ${p.number}`} className="w-full object-contain max-h-24" />
                              <div className="text-[10.5px] text-center py-0.5 font-medium" style={{ color: 'var(--color-success)' }}>
                                정답 이미지
                              </div>
                            </div>
                          ) : (
                            <div
                              className="p-2 text-center"
                              style={{
                                background: 'var(--color-warn-bg)',
                                border: '1px solid var(--color-warn)',
                                borderRadius: 'var(--radius-btn)',
                              }}>
                              <span className="text-[11px] font-medium" style={{ color: 'var(--color-warn)' }}>정답 이미지 없음</span>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  </Card>

                  {/* Answer Page Fallback */}
                  {debugInfo?.answerDetectionFailed && debugInfo?.answerPageImages?.length > 0 && (
                    <Card padding="md" style={{ background: 'var(--color-warn-bg)', borderColor: 'var(--color-warn)' }}>
                      <div className="flex items-start gap-2 mb-3">
                        <Badge tone="warn" variant="solid" size="sm">주의</Badge>
                        <div className="flex-1">
                          <h3 className="font-semibold text-[15px]" style={{ color: 'var(--color-warn)' }}>답지 자동 감지 실패</h3>
                          <p className="text-sm text-ink-2 mt-0.5">답지 페이지에서 답을 자동으로 감지하지 못했습니다. 아래 답지 이미지를 참고하여 확인해주세요.</p>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {debugInfo.answerPageImages.map((img: string, idx: number) => (
                          <div
                            key={idx}
                            className="overflow-hidden"
                            style={{ border: '1px solid var(--color-warn)', borderRadius: 'var(--radius-card)' }}>
                            <div
                              className="px-3 py-1 text-sm font-medium"
                              style={{ background: 'var(--color-warn-bg)', color: 'var(--color-warn)' }}>
                              답지 페이지 {answerPageRange.start + idx}
                            </div>
                            <img src={img} alt={`답지 페이지 ${idx + 1}`} className="w-full object-contain bg-surface" />
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* ===== Step 4: Save Settings ===== */}
                  <Card
                    padding="md"
                    className="anim-pop-in"
                    style={
                      extractState === 'done'
                        ? { background: 'var(--color-gold-soft)', borderColor: 'var(--color-gold)' }
                        : undefined
                    }>
                    <SectionHeader
                      title="시험지 저장"
                      description={extractState === 'done' ? '반을 선택하고 저장 버튼을 눌러주세요.' : undefined}
                    />

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-ink-2 mb-1.5">반 선택</label>
                        <select value={regClassroom} onChange={e => {
                          const val = e.target.value;
                          setRegClassroom(val);
                          setUploadStudent('');
                          if (val) {
                            fetchTestPapersForClassroom(val);
                            if (isCustomClass(val)) fetchUploadStudents(val);
                          }
                        }}
                          className="w-full max-w-md px-4 py-2.5 text-sm border bg-surface focus:outline-none focus:ring-2 focus:ring-accent"
                          style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-border)' }}>
                          <option value="">반을 선택하세요</option>
                          {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}{c.subjectName === '맞춤반' ? ' (맞춤)' : ''}</option>)}
                        </select>
                      </div>

                      {regClassroom && isCustomClass(regClassroom) && (
                        <div>
                          <label className="block text-sm font-medium text-ink-2 mb-1.5">
                            학생 선택 <Badge tone="gold" variant="soft" size="sm" className="ml-1">맞춤반</Badge>
                          </label>
                          <select value={uploadStudent} onChange={e => setUploadStudent(e.target.value)}
                            className="w-full max-w-md px-4 py-2.5 text-sm border bg-surface focus:outline-none focus:ring-2"
                            style={{ borderRadius: 'var(--radius-btn)', borderColor: 'var(--color-gold)' }}>
                            <option value="">학생을 선택하세요</option>
                            {uploadStudents.map(s => <option key={s.id} value={s.id}>{s.name}{s.studentNumber ? ` (${s.studentNumber})` : ''}</option>)}
                          </select>
                        </div>
                      )}

                      {extractState === 'saved' ? (
                        <div
                          className="w-full px-5 py-4 text-center"
                          style={{
                            background: 'var(--color-success-bg)',
                            border: '1.5px solid var(--color-success)',
                            borderRadius: 'var(--radius-card)',
                          }}>
                          <div className="flex items-center justify-center gap-2 mb-1">
                            <Badge tone="success" variant="solid" size="sm">완료</Badge>
                            <span className="font-bold text-lg" style={{ color: 'var(--color-success)' }}>시험지 저장 완료</span>
                          </div>
                          <p className="text-sm mb-3" style={{ color: 'var(--color-success)' }}>
                            오답 등록 탭에서 이 시험지를 선택할 수 있습니다.
                          </p>
                          <Button
                            variant="accent"
                            size="sm"
                            onClick={() => { setExtractState('idle'); setPdfFile(null); setExtractedProblems([]); setWorkbookName(''); }}>
                            새 시험지 업로드
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="accent"
                          size="lg"
                          fullWidth
                          loading={extractState === 'saving'}
                          disabled={extractState === 'saving'}
                          onClick={handleSaveTestPaper}>
                          {extractState === 'saving' ? '저장 중...' : '시험지 저장'}
                        </Button>
                      )}
                    </div>
                  </Card>
                </>
              )}

              {/* ===== Uploaded Test Paper List ===== */}
              <div className="bg-white rounded-xl border p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-800">📋 업로드된 시험지 목록</h3>
                  <button onClick={fetchAllTestPapers} className="text-sm text-blue-600 hover:text-blue-700 hover:underline">새로고침</button>
                </div>
                {allTestPapers.length === 0 ? (
                  <EmptyState
                    size="sm"
                    icon="📄"
                    title="업로드된 시험지가 없습니다"
                    description="위에서 PDF를 업로드하면 여기에 나타납니다."
                  />
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
                          <th className="pb-2 text-center">관리</th>
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
                              <div className="flex items-center gap-1 justify-center">
                                <button
                                  onClick={() => openAnswerEditor(tp)}
                                  className="press press-subtle px-2.5 py-1 text-xs text-blue-600 hover:text-white hover:bg-blue-600 border border-blue-200 hover:border-blue-600 rounded-lg transition-all"
                                  title="정답 직접 입력 / 수정">
                                  답 입력
                                </button>
                                <button
                                  onClick={() => handleDeleteTestPaper(tp.id)}
                                  className="press press-subtle px-2.5 py-1 text-xs text-red-500 hover:text-white hover:bg-red-500 border border-red-200 hover:border-red-500 rounded-lg transition-all"
                                  title="시험지 삭제">
                                  삭제
                                </button>
                              </div>
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
            <div key="tab-register" className="anim-tab-in space-y-6 max-w-3xl">
              {/* Register Flow Stepper */}
              {(() => {
                const hasClassroom = !!regClassroom;
                const hasStudentAndPaper = hasClassroom && !!regStudent && (!!regTestPaper || !!regProblemNumbers.trim());
                const hasProblems = hasStudentAndPaper && (regSelectedProblems.size > 0 || regProblemNumbers.trim().length > 0);
                const regStep = regSuccess ? 3 : !hasClassroom ? 0 : !hasStudentAndPaper ? 1 : !hasProblems ? 2 : 2;
                const regCompletedUntil =
                  regSuccess ? 3 :
                  hasProblems ? 1 :
                  hasStudentAndPaper ? 0 :
                  hasClassroom ? -1 :
                  -1;
                return (
                  <Card padding="md" elevation="sh1">
                    <Stepper
                      steps={[
                        { label: '학생 지정', description: '반·학생 선택' },
                        { label: '문제 선택', description: '시험지·번호' },
                        { label: '등록', description: '확정' },
                      ]}
                      current={regStep > 2 ? 2 : regStep}
                      completedUntil={regCompletedUntil}
                    />
                  </Card>
                );
              })()}

              {/* Step 1 — 학생 지정 Card */}
              <Card padding="lg" elevation="sh1">
                <SectionHeader title="학생 지정" description="오답을 등록할 반과 학생을 고르세요" className="mb-3" />
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>반</label>
                    <select
                      value={regClassroom}
                      onChange={e => {
                        setRegClassroom(e.target.value);
                        setRegStudent('');
                        if (e.target.value) {
                          fetchStudentsForClassroom(e.target.value);
                          fetchTestPapersForClassroom(e.target.value);
                        }
                      }}
                      className="w-full px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      <option value="">반을 선택하세요</option>
                      {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>학생</label>
                    <select
                      value={regStudent}
                      onChange={e => setRegStudent(e.target.value)}
                      disabled={!regClassroom}
                      className="w-full px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2 disabled:opacity-60"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      <option value="">{regClassroom ? '학생을 선택하세요' : '먼저 반을 선택하세요'}</option>
                      {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
              </Card>

              {/* Step 2 — 문제 선택 Card */}
              <Card padding="lg" elevation="sh1" className={!regClassroom || !regStudent ? 'opacity-60 pointer-events-none select-none' : ''}>
                <SectionHeader title="문제 선택" description="시험지를 고르고 틀린 문제 번호를 체크하세요" className="mb-3" />

                <div className="mt-3 space-y-3">
                  <div>
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>시험지</label>
                    <select
                      value={regTestPaper}
                      onChange={e => {
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
                      className="w-full px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-ink)',
                      }}
                    >
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
                      <p className="text-xs mt-1.5" style={{ color: 'var(--color-warn)' }}>
                        시험지가 없습니다. &apos;시험지 업로드&apos; 탭에서 먼저 시험지를 업로드해주세요.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>시험명</label>
                    <input
                      type="text"
                      value={regTestName}
                      onChange={e => setRegTestName(e.target.value)}
                      placeholder={regTestPaper ? '시험지 이름이 자동 입력됩니다' : '예: 3월 모의고사'}
                      readOnly={!!regTestPaper}
                      className="w-full px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2"
                      style={{
                        background: regTestPaper ? 'var(--color-surface-2)' : 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: regTestPaper ? 'var(--color-ink-2)' : 'var(--color-ink)',
                      }}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>
                      틀린 문제 번호
                      {regTestPaper && regSelectedProblems.size > 0 && (
                        <Badge tone="danger" size="sm">{regSelectedProblems.size}개 선택</Badge>
                      )}
                    </label>

                    {regTestPaper ? (() => {
                      const tp = testPapers.find(t => t.id === regTestPaper) || allTestPapers.find(t => t.id === regTestPaper);
                      const total = tp?.totalProblems || 0;
                      return (
                        <div>
                          <div
                            className="flex flex-wrap gap-2 p-3 rounded-[12px]"
                            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
                          >
                            {Array.from({ length: total }, (_, i) => i + 1).map(num => {
                              const isSelected = regSelectedProblems.has(num);
                              return (
                                <button
                                  key={num}
                                  type="button"
                                  onPointerDown={() => hapticSelection()}
                                  onClick={() => {
                                    setRegSelectedProblems(prev => {
                                      const next = new Set(prev);
                                      if (next.has(num)) next.delete(num); else next.add(num);
                                      return next;
                                    });
                                  }}
                                  className="press press-strong w-10 h-10 rounded-[10px] text-sm font-semibold num-tabular"
                                  style={{
                                    background: isSelected ? 'var(--color-danger)' : 'var(--color-surface)',
                                    color: isSelected ? '#fff' : 'var(--color-ink)',
                                    border: isSelected ? '1px solid var(--color-danger)' : '1px solid var(--color-border)',
                                    boxShadow: isSelected ? 'var(--shadow-sh1)' : 'none',
                                    transition:
                                      'background-color 180ms var(--ease-apple-inout), color 180ms var(--ease-apple-inout), border-color 180ms var(--ease-apple-inout)',
                                  }}
                                >
                                  {num}
                                </button>
                              );
                            })}
                          </div>
                          {regSelectedProblems.size > 0 && (
                            <div className="mt-2 flex items-center justify-between">
                              <p className="text-[12px]" style={{ color: 'var(--color-ink-2)' }}>
                                선택: {Array.from(regSelectedProblems).sort((a, b) => a - b).join(', ')}
                              </p>
                              <button
                                type="button"
                                onPointerDown={() => hapticLight()}
                                onClick={() => setRegSelectedProblems(new Set())}
                                className="press text-[12px] underline"
                                style={{ color: 'var(--color-mute)' }}
                              >
                                전체 해제
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })() : (
                      <input
                        type="text"
                        value={regProblemNumbers}
                        onChange={e => setRegProblemNumbers(e.target.value)}
                        placeholder="시험지를 선택하거나 직접 입력 (예: 3, 7, 12, 15)"
                        className="w-full px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2"
                        style={{
                          background: 'var(--color-surface)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-ink)',
                        }}
                      />
                    )}
                  </div>
                </div>
              </Card>

              {/* Step 3 — 등록 Card */}
              {regSuccess ? (
                <Card
                  padding="lg"
                  elevation="sh1"
                  className="anim-pop-in"
                  style={{ background: 'var(--color-success-bg)', borderColor: 'var(--color-success)' }}
                >
                  <div className="text-center py-2">
                    <div className="inline-flex items-center gap-2 mb-2">
                      <Badge tone="success" size="md">완료</Badge>
                      <span className="text-[17px] font-bold" style={{ color: 'var(--color-success)' }}>오답 등록 완료!</span>
                    </div>
                    <p className="text-sm mb-4" style={{ color: 'var(--color-ink-2)' }}>오답 목록 탭에서 확인할 수 있습니다.</p>
                    <Button
                      variant="accent"
                      size="lg"
                      fullWidth
                      onClick={() => {
                        setRegSuccess(false);
                        setRegStudent('');
                        setRegTestPaper('');
                        setRegTestName('');
                        setRegSelectedProblems(new Set());
                      }}
                    >
                      새 오답 등록하기
                    </Button>
                  </div>
                </Card>
              ) : (
                <Card padding="lg" elevation="sh1">
                  <SectionHeader title="등록" description="입력한 내용을 확인하고 등록하세요" className="mb-3" />
                  <div className="mt-3">
                    <Button
                      variant="accent"
                      size="lg"
                      fullWidth
                      onClick={handleRegisterWrongAnswers}
                      disabled={registering || !regClassroom || !regStudent || !(regTestPaper || regProblemNumbers.trim())}
                      loading={registering}
                    >
                      {registering ? '등록 중...' : '오답 등록'}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          )}

          {/* ========== TAB: ANSWERS ========== */}
          {activeTab === 'answers' && (
            <div key="tab-answers" className="anim-tab-in space-y-4" style={{ paddingBottom: wrongSelectMode ? 96 : 0 }}>
              <Card padding="md" elevation="sh1">
                <div className="flex items-end justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>반 선택 <span style={{ color: 'var(--color-mute)' }}>(선택사항)</span></label>
                    <select
                      value={filterClassroom}
                      onChange={e => setFilterClassroom(e.target.value)}
                      className="w-full max-w-md px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        color: 'var(--color-ink)',
                      }}
                    >
                      <option value="">전체 반</option>
                      {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  {Object.keys(visibleGroupedByStudent).length > 0 && (
                    wrongSelectMode ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={exitSelectMode}
                      >
                        선택 취소
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => { hapticLight(); setWrongSelectMode(true); }}
                      >
                        선택 모드
                      </Button>
                    )
                  )}
                </div>
              </Card>

              {Object.keys(visibleGroupedByStudent).length === 0 ? (
                <EmptyState
                  size="md"
                  icon="📝"
                  title={
                    filterClassroom
                      ? '선택한 반에 등록된 오답이 없습니다'
                      : '등록된 오답이 없습니다'
                  }
                  description="'오답 등록' 탭에서 학생별 틀린 문제를 등록하면 여기에 모입니다."
                  asCard
                />
              ) : (
                Object.entries(visibleGroupedByStudent).map(([studentId, { name, items }]) => {
                  const active = items.filter(i => i.status === 'ACTIVE');
                  const mastered = items.filter(i => i.status === 'MASTERED');
                  // 선택 모드의 "전체 선택" 대상은 ACTIVE(미해결) 항목만 — 마스터 항목은 수동으로 개별 선택만 가능.
                  const studentItemIds = active.map(i => i.id);
                  const allStudentSelected = studentItemIds.length > 0 && studentItemIds.every(id => selectedWrongIds.has(id));
                  const someStudentSelected = studentItemIds.some(id => selectedWrongIds.has(id));
                  return (
                    <Card key={studentId} padding="none" elevation="sh1" className="overflow-hidden">
                      <div
                        className="flex items-center justify-between px-5 py-3.5 gap-2"
                        style={{
                          background: 'var(--color-surface-2)',
                          borderBottom: '1px solid var(--color-border)',
                        }}
                      >
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="font-semibold text-ink" style={{ letterSpacing: '-0.01em' }}>{name}</span>
                          <Badge tone="warn" size="sm">미해결 {active.length}</Badge>
                          <Badge tone="success" size="sm">마스터 {mastered.length}</Badge>
                        </div>
                        {wrongSelectMode ? (
                          <button
                            type="button"
                            onPointerDown={() => hapticSelection()}
                            onClick={() => toggleSelectStudentAll(studentItemIds)}
                            className="press press-subtle text-[12px] font-semibold rounded-[8px] px-2.5 py-1.5"
                            style={{
                              background: allStudentSelected ? 'var(--color-accent)' : 'var(--color-surface)',
                              color: allStudentSelected ? '#fff' : 'var(--color-ink-2)',
                              border: `1px solid ${allStudentSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                              minHeight: 32,
                            }}
                            aria-label={allStudentSelected ? `${name} 전체 선택 해제` : `${name} 전체 선택`}
                          >
                            {allStudentSelected ? '전체 해제' : someStudentSelected ? '전체 선택' : '전체 선택'}
                          </button>
                        ) : (
                          active.length > 0 && (
                            <Button
                              variant="accent"
                              size="sm"
                              onClick={() => openTestCreateModal(studentId, name, active.length, active[0]?.classroomId)}
                            >
                              테스트 생성
                            </Button>
                          )
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-4 py-3">
                        {/* 오답 목록은 ACTIVE + 최근 60일 이내 MASTERED 항목을 함께 표시한다.
                            MASTERED 항목은 녹색으로 구분되며, 60일 이후 cron 이 영구 삭제한다. */}
                        {items.map(wa => {
                          const isSelected = selectedWrongIds.has(wa.id);
                          const isMastered = wa.status === 'MASTERED';
                          if (wrongSelectMode) {
                            return (
                              <button
                                type="button"
                                key={wa.id}
                                onPointerDown={() => hapticSelection()}
                                onClick={() => toggleSelectWrong(wa.id)}
                                className="press press-subtle inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs"
                                style={{
                                  background: isSelected
                                    ? 'var(--color-danger-bg)'
                                    : (isMastered ? 'var(--color-success-bg)' : 'var(--color-surface)'),
                                  color: isSelected
                                    ? 'var(--color-danger)'
                                    : (isMastered ? 'var(--color-success)' : 'var(--color-ink)'),
                                  border: `1px solid ${isSelected
                                    ? 'var(--color-danger)'
                                    : (isMastered ? 'var(--color-success)' : 'var(--color-border)')}`,
                                  minHeight: 32,
                                  transition: 'background-color var(--dur-base) var(--ease-apple-inout), border-color var(--dur-base) var(--ease-apple-inout), color var(--dur-base) var(--ease-apple-inout)',
                                }}
                                aria-pressed={isSelected}
                                aria-label={`${wa.problemNumber}번 ${wa.testName} ${isSelected ? '선택 해제' : '선택'}`}
                              >
                                <span
                                  aria-hidden="true"
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-[4px] shrink-0"
                                  style={{
                                    background: isSelected ? 'var(--color-danger)' : 'transparent',
                                    border: `1.5px solid ${isSelected ? 'var(--color-danger)' : 'var(--color-mute)'}`,
                                    color: '#fff',
                                    fontSize: 10,
                                    lineHeight: 1,
                                  }}
                                >
                                  {isSelected ? '✓' : ''}
                                </span>
                                <span className="font-bold num-tabular" style={{ color: isSelected ? 'var(--color-danger)' : 'var(--color-accent)' }}>{wa.problemNumber}번</span>
                                <span style={{ color: 'var(--color-mute)' }}>{wa.testName}</span>
                                <Badge tone={wa.status === 'ACTIVE' ? 'warn' : 'success'} size="sm">
                                  {wa.status === 'ACTIVE' ? '미해결' : '마스터'}
                                </Badge>
                                <span className="num-tabular" style={{ color: 'var(--color-mute)' }}>{wa.round}회</span>
                              </button>
                            );
                          }
                          return (
                            <div
                              key={wa.id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs"
                              style={{
                                background: isMastered ? 'var(--color-success-bg)' : 'var(--color-surface)',
                                color: isMastered ? 'var(--color-success)' : 'var(--color-ink)',
                                border: `1px solid ${isMastered ? 'var(--color-success)' : 'var(--color-border)'}`,
                              }}
                            >
                              <span className="font-bold num-tabular" style={{ color: 'var(--color-accent)' }}>{wa.problemNumber}번</span>
                              <span style={{ color: 'var(--color-mute)' }}>{wa.testName}</span>
                              <Badge tone={wa.status === 'ACTIVE' ? 'warn' : 'success'} size="sm">
                                {wa.status === 'ACTIVE' ? '미해결' : '마스터'}
                              </Badge>
                              <span className="num-tabular" style={{ color: 'var(--color-mute)' }}>{wa.round}회</span>
                              <button
                                onPointerDown={() => hapticHeavy()}
                                onClick={() => handleDeleteWrongAnswer(wa.id)}
                                className="press ml-0.5 w-6 h-6 rounded-full flex items-center justify-center"
                                style={{ color: 'var(--color-mute)' }}
                                title="삭제"
                                aria-label="삭제"
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  );
                })
              )}

              {/* 일괄 삭제 고정 하단바 */}
              {wrongSelectMode && (
                <div
                  className="fixed bottom-0 left-0 right-0 z-40 anim-sheet-up"
                  style={{
                    background: 'rgba(255,255,255,0.94)',
                    backdropFilter: 'saturate(180%) blur(14px)',
                    WebkitBackdropFilter: 'saturate(180%) blur(14px)',
                    borderTop: '1px solid var(--color-border)',
                    boxShadow: 'var(--shadow-sh2)',
                  }}
                >
                  <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold" style={{ color: 'var(--color-ink)', letterSpacing: '-0.01em' }}>
                        <span className="num-tabular" style={{ color: selectedWrongIds.size > 0 ? 'var(--color-danger)' : 'var(--color-mute)' }}>
                          {selectedWrongIds.size}
                        </span>
                        개 선택됨
                      </div>
                      <div className="text-[11px] hidden sm:block" style={{ color: 'var(--color-mute)' }}>
                        삭제할 오답을 탭해 선택하세요
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="md" onClick={exitSelectMode} disabled={bulkDeleting}>
                        취소
                      </Button>
                      <Button
                        variant="danger"
                        size="md"
                        onClick={handleBulkDeleteWrongAnswers}
                        disabled={selectedWrongIds.size === 0 || bulkDeleting}
                      >
                        {bulkDeleting ? '삭제 중…' : `${selectedWrongIds.size}개 삭제`}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========== TAB: TESTS ========== */}
          {activeTab === 'tests' && (
            <div key="tab-tests" className="anim-tab-in space-y-4">
              <Card padding="md" elevation="sh1">
                <label className="block text-[12px] font-semibold mb-1.5" style={{ color: 'var(--color-ink-2)' }}>반 선택 <span style={{ color: 'var(--color-mute)' }}>(선택사항)</span></label>
                <select
                  value={filterClassroom}
                  onChange={e => setFilterClassroom(e.target.value)}
                  className="w-full max-w-md px-4 py-2.5 rounded-[10px] text-sm focus:outline-none focus-visible:ring-2"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-ink)',
                  }}
                >
                  <option value="">전체 반</option>
                  {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Card>

              {tests.length === 0 ? (
                <EmptyState
                  size="md"
                  icon="🎯"
                  title="생성된 테스트가 없습니다"
                  description="오답이 등록된 학생에 대해 '테스트 생성'으로 복습 시험을 만들어 보세요."
                  asCard
                />
              ) : (
                <div className="space-y-3">
                  {tests.map(test => {
                    const graded = test.status === 'GRADED';
                    const correctCount = graded ? test.items.filter(it => it.isCorrect).length : 0;
                    return (
                      <Card key={test.id} padding="lg" elevation="sh1">
                        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="font-semibold text-ink" style={{ letterSpacing: '-0.01em' }}>{test.student.name}</span>
                            <Badge tone="neutral" size="sm">{test.round}회차</Badge>
                            <Badge tone="neutral" size="sm">{test.items.length}문항</Badge>
                            <Badge tone={graded ? 'success' : 'warn'} size="sm">
                              {graded ? '채점완료' : '채점대기'}
                            </Badge>
                            {graded && (
                              <Badge tone="accent" size="sm">
                                {correctCount}/{test.items.length}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <Button variant="secondary" size="sm" onClick={() => generateTestPDF(test)}>
                              테스트지 출력
                            </Button>
                            <Button variant="accent" size="sm" onClick={() => handleStartGrading(test)}>
                              {test.status === 'PENDING' ? '채점하기' : '채점 수정'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTest(test.id)}
                              style={{ color: 'var(--color-danger)' }}
                            >
                              삭제
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs" style={{ color: 'var(--color-mute)' }}>
                          생성: {new Date(test.createdAt).toLocaleDateString('ko-KR')}
                          {test.gradedAt && ` · 채점: ${new Date(test.gradedAt).toLocaleDateString('ko-KR')}`}
                        </div>
                        {graded && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {test.items.map(item => (
                              <span
                                key={item.id}
                                className="inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-semibold num-tabular"
                                style={{
                                  background: item.isCorrect ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                                  color: item.isCorrect ? 'var(--color-success)' : 'var(--color-danger)',
                                  border: `1px solid ${item.isCorrect ? 'var(--color-success)' : 'var(--color-danger)'}`,
                                }}
                              >
                                {item.wrongAnswer.problemNumber}
                              </span>
                            ))}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Problem Detail Modal */}
      {selectedProblem && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onClick={() => setSelectedProblem(null)}
        >
          <div
            className="anim-sheet-up max-w-3xl max-h-[90vh] overflow-auto p-6 rounded-[16px]"
            style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sh3)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-ink" style={{ letterSpacing: '-0.01em' }}>
                {selectedProblem.number}번 문제 <span style={{ color: 'var(--color-mute)', fontWeight: 500 }}>(p.{selectedProblem.pageNumber})</span>
              </h3>
              <button
                onPointerDown={() => hapticLight()}
                onClick={() => setSelectedProblem(null)}
                className="press w-10 h-10 rounded-full flex items-center justify-center text-2xl"
                style={{ color: 'var(--color-mute)' }}
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <img
              src={selectedProblem.imageDataUrl}
              alt={`문제 ${selectedProblem.number}`}
              className="w-full rounded-[10px]"
              style={{ border: '1px solid var(--color-border)' }}
            />
          </div>
        </div>
      )}

      {/* Test Create Modal */}
      {testCreateModal && (() => {
        // 선택된 시험지의 총 오답 수 계산
        const filteredTotal = selectedTestNames.size > 0
          ? testCreateModal.testNameGroups.filter(g => selectedTestNames.has(g.testName)).reduce((s, g) => s + g.count, 0)
          : testCreateModal.activeCount;
        const effectiveCount = Math.min(testCreateCount, filteredTotal);

        return (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="anim-sheet-up max-w-md w-full p-6 max-h-[85vh] overflow-y-auto rounded-[16px]"
            style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sh3)' }}
          >
            <h3 className="text-lg font-bold text-ink mb-1" style={{ letterSpacing: '-0.01em' }}>테스트 생성</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-2)' }}>
              {testCreateModal.studentName} <span style={{ color: 'var(--color-mute)' }}>·</span> 활성 오답 {testCreateModal.activeCount}개
            </p>

            {/* 시험지 선택 */}
            {testCreateModal.testNameGroups.length > 1 && (
              <div className="mb-4">
                <label className="block text-[12px] font-semibold mb-2" style={{ color: 'var(--color-ink-2)' }}>
                  시험지 선택 <span style={{ color: 'var(--color-mute)', fontWeight: 500 }}>(미선택 시 전체)</span>
                </label>
                <div
                  className="rounded-[10px] max-h-48 overflow-y-auto"
                  style={{ border: '1px solid var(--color-border)' }}
                >
                  {testCreateModal.testNameGroups.map(g => {
                    const isChecked = selectedTestNames.has(g.testName);
                    return (
                      <label
                        key={g.testName}
                        className="press press-subtle flex items-center gap-3 px-3 py-2.5 cursor-pointer"
                        style={{
                          background: isChecked ? 'var(--color-info-bg)' : 'transparent',
                          borderBottom: '1px solid var(--color-border)',
                          transition: 'background-color 180ms var(--ease-apple-inout)',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            hapticSelection();
                            setSelectedTestNames(prev => {
                              const next = new Set(prev);
                              if (next.has(g.testName)) next.delete(g.testName);
                              else next.add(g.testName);
                              const newTotal = next.size > 0
                                ? testCreateModal.testNameGroups.filter(tg => next.has(tg.testName)).reduce((s, tg) => s + tg.count, 0)
                                : testCreateModal.activeCount;
                              setTestCreateCount(newTotal);
                              return next;
                            });
                          }}
                          className="w-4 h-4 rounded"
                          style={{ accentColor: 'var(--color-accent)' }}
                        />
                        <span className="flex-1 text-sm truncate" style={{ color: 'var(--color-ink)' }}>{g.testName}</span>
                        <span className="text-xs num-tabular whitespace-nowrap" style={{ color: 'var(--color-mute)' }}>{g.count}문제</span>
                      </label>
                    );
                  })}
                </div>
                {selectedTestNames.size > 0 && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-xs" style={{ color: 'var(--color-accent)' }}>
                      {selectedTestNames.size}개 시험지 선택 → {filteredTotal}문제
                    </p>
                    <button
                      onPointerDown={() => hapticLight()}
                      onClick={() => { setSelectedTestNames(new Set()); setTestCreateCount(testCreateModal.activeCount); }}
                      className="press text-xs underline"
                      style={{ color: 'var(--color-mute)' }}
                    >
                      선택 초기화
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 출제 문항수 */}
            <div className="mb-4">
              <label className="block text-[12px] font-semibold mb-2" style={{ color: 'var(--color-ink-2)' }}>출제 문항수</label>
              <div className="flex flex-wrap gap-2">
                {[5, 10, 15, 20].filter(n => n <= filteredTotal).map(n => (
                  <button
                    key={n}
                    onPointerDown={() => hapticSelection()}
                    onClick={() => setTestCreateCount(n)}
                    className="press press-strong px-4 py-2 rounded-[10px] text-sm font-semibold min-h-[44px]"
                    style={{
                      background: testCreateCount === n ? 'var(--color-accent)' : 'var(--color-surface-2)',
                      color: testCreateCount === n ? '#fff' : 'var(--color-ink-2)',
                      boxShadow: testCreateCount === n ? 'var(--shadow-sh1)' : 'none',
                      border: testCreateCount === n ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                      transition: 'background-color 180ms var(--ease-apple-inout), color 180ms var(--ease-apple-inout)',
                    }}
                  >
                    {n}문항
                  </button>
                ))}
                <button
                  onPointerDown={() => hapticSelection()}
                  onClick={() => setTestCreateCount(filteredTotal)}
                  className="press press-strong px-4 py-2 rounded-[10px] text-sm font-semibold min-h-[44px]"
                  style={{
                    background: testCreateCount === filteredTotal ? 'var(--color-accent)' : 'var(--color-surface-2)',
                    color: testCreateCount === filteredTotal ? '#fff' : 'var(--color-ink-2)',
                    boxShadow: testCreateCount === filteredTotal ? 'var(--shadow-sh1)' : 'none',
                    border: testCreateCount === filteredTotal ? '1px solid var(--color-accent)' : '1px solid var(--color-border)',
                    transition: 'background-color 180ms var(--ease-apple-inout), color 180ms var(--ease-apple-inout)',
                  }}
                >
                  전체 ({filteredTotal})
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-mute)' }}>문제 순서는 랜덤으로 섞입니다</p>
            </div>
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setTestCreateModal(null)}
              >
                취소
              </Button>
              <Button
                variant="accent"
                size="md"
                fullWidth
                disabled={effectiveCount === 0}
                onClick={handleCreateTest}
              >
                생성 및 출력{effectiveCount > 0 ? ` (${effectiveCount}문제)` : ''}
              </Button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Grading Modal */}
      {gradingTest && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="anim-sheet-up max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto rounded-[16px]"
            style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sh3)' }}
          >
            <h3 className="text-lg font-bold text-ink mb-1" style={{ letterSpacing: '-0.01em' }}>채점</h3>
            <p className="text-sm mb-4" style={{ color: 'var(--color-ink-2)' }}>
              {gradingTest.student.name} <span style={{ color: 'var(--color-mute)' }}>·</span> {gradingTest.round}회차
            </p>
            <div className="space-y-3">
              {gradingItemsOrdered.map((item, idx) => {
                const val = gradeResults[item.wrongAnswerId];
                const wa = item.wrongAnswer;
                const page = wa.testPaper?.pages?.find((p: any) => p.pageNumber === wa.problemNumber);
                const problemImg = page?.imageUrl || wa.problemImage || null;
                const answerImg = page?.answerImageUrl || null;
                // 텍스트 정답 폴백: 이미지 정답이 없을 때 testPaper.answers JSON 에서 텍스트 정답 읽기
                // "p.X" (페이지 참조) 는 표시하지 않고, "①", "1", "A" 등 실제 답만 표시한다.
                let answerText: string | null = null;
                if (!answerImg && wa.testPaper?.answers) {
                  try {
                    const ansMap = JSON.parse(wa.testPaper.answers) as Record<string, string>;
                    const raw = ansMap[String(wa.problemNumber)];
                    if (raw && typeof raw === 'string' && !raw.startsWith('p.')) {
                      answerText = raw;
                    }
                  } catch {}
                }
                const hasAnswer = !!(answerImg || answerText);
                const isAnswerShown = showGradeAnswer.has(wa.id);
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-btn)',
                      overflow: 'hidden',
                      background: 'var(--color-surface)',
                    }}
                  >
                    {/* Header — PDF 출력과 동일한 순번(1,2,3...) 표시, 원본 문제번호는 부가정보로 */}
                    <div
                      className="px-3 py-2 flex items-center justify-between gap-2"
                      style={{
                        background: 'var(--color-surface-2)',
                        borderBottom: '1px solid var(--color-border)',
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full font-semibold text-xs num-tabular shrink-0"
                          style={{ background: 'var(--color-accent)', color: '#fff' }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-xs truncate" style={{ color: 'var(--color-ink-2)', fontWeight: 500 }}>
                          {wa.testName} <span style={{ color: 'var(--color-mute)' }}>#{wa.problemNumber}</span>
                        </span>
                      </div>
                    </div>

                    {/* Problem Image */}
                    {problemImg ? (
                      <div className="p-2">
                        <img
                          src={toRenderableImageSrc(problemImg)}
                          alt={`문제 ${wa.problemNumber}`}
                          className="w-full object-contain max-h-80"
                          style={{ borderRadius: 'var(--radius-chip)' }}
                        />
                      </div>
                    ) : (
                      <div className="p-4 text-center" style={{ color: 'var(--color-mute)', fontSize: 13 }}>
                        문제 이미지가 없습니다
                      </div>
                    )}

                    {/* O / X Grading Buttons */}
                    <div
                      className="flex gap-2 px-3 py-2"
                      style={{ borderTop: '1px solid var(--color-border)' }}
                    >
                      <button
                        type="button"
                        onPointerDown={() => hapticSelection()}
                        onClick={() => setGradeResults(p => ({ ...p, [item.wrongAnswerId]: true }))}
                        className="press press-strong flex-1 h-11 rounded-[10px] text-base font-bold"
                        style={{
                          background: val === true ? 'var(--color-success)' : 'var(--color-surface-2)',
                          color: val === true ? '#fff' : 'var(--color-ink-2)',
                          border: val === true ? '1px solid var(--color-success)' : '1px solid var(--color-border)',
                          transition: 'background-color 180ms var(--ease-apple-inout), color 180ms var(--ease-apple-inout)',
                        }}
                        aria-label="정답 처리"
                      >
                        O
                      </button>
                      <button
                        type="button"
                        onPointerDown={() => hapticSelection()}
                        onClick={() => setGradeResults(p => ({ ...p, [item.wrongAnswerId]: false }))}
                        className="press press-strong flex-1 h-11 rounded-[10px] text-base font-bold"
                        style={{
                          background: val === false ? 'var(--color-danger)' : 'var(--color-surface-2)',
                          color: val === false ? '#fff' : 'var(--color-ink-2)',
                          border: val === false ? '1px solid var(--color-danger)' : '1px solid var(--color-border)',
                          transition: 'background-color 180ms var(--ease-apple-inout), color 180ms var(--ease-apple-inout)',
                        }}
                        aria-label="오답 처리"
                      >
                        X
                      </button>
                    </div>

                    {/* Answer Reveal Toggle */}
                    {hasAnswer ? (
                      <button
                        type="button"
                        onPointerDown={() => hapticSelection()}
                        onClick={() =>
                          setShowGradeAnswer(prev => {
                            const next = new Set(prev);
                            next.has(wa.id) ? next.delete(wa.id) : next.add(wa.id);
                            return next;
                          })
                        }
                        className="w-full text-center py-3 press press-subtle"
                        style={{
                          minHeight: 44,
                          background: isAnswerShown ? 'var(--color-surface-2)' : 'var(--color-success-bg)',
                          borderTop: `1px solid ${isAnswerShown ? 'var(--color-border)' : 'var(--color-success-bg)'}`,
                          transition: 'background-color var(--dur-base) var(--ease-apple-inout), border-color var(--dur-base) var(--ease-apple-inout)',
                        }}
                        aria-label={isAnswerShown ? '정답 숨기기' : '정답 보기'}
                        aria-expanded={isAnswerShown}
                      >
                        <span
                          style={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: isAnswerShown ? 'var(--color-mute)' : 'var(--color-success)',
                            letterSpacing: '-0.01em',
                            transition: 'color var(--dur-base) var(--ease-apple-inout)',
                          }}
                        >
                          {isAnswerShown ? '▲ 정답 숨기기' : '▼ 정답 확인'}
                        </span>
                      </button>
                    ) : (
                      <div
                        className="w-full text-center py-2"
                        style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-mute)', fontSize: 12 }}
                      >
                        정답이 등록되지 않았습니다
                      </div>
                    )}

                    {/* Answer Image (revealed) — 이미지 우선, 없으면 텍스트 폴백 */}
                    {isAnswerShown && answerImg && (
                      <div
                        className="p-2 anim-pop-in"
                        style={{ background: 'var(--color-success-bg)', borderTop: '1px solid var(--color-success-bg)' }}
                      >
                        <img
                          src={toRenderableImageSrc(answerImg)}
                          alt={`정답 ${wa.problemNumber}`}
                          className="w-full object-contain max-h-96"
                          style={{ borderRadius: 'var(--radius-chip)' }}
                        />
                      </div>
                    )}
                    {isAnswerShown && !answerImg && answerText && (
                      <div
                        className="px-4 py-5 anim-pop-in text-center"
                        style={{ background: 'var(--color-success-bg)', borderTop: '1px solid var(--color-success-bg)' }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-success)', marginBottom: 6, letterSpacing: '0.02em' }}>
                          정답
                        </div>
                        <div
                          style={{
                            fontSize: 28,
                            fontWeight: 800,
                            color: 'var(--color-success)',
                            letterSpacing: '-0.01em',
                            wordBreak: 'break-all',
                          }}
                        >
                          {answerText}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" size="md" fullWidth onClick={() => setGradingTest(null)}>
                취소
              </Button>
              <Button variant="accent" size="md" fullWidth onClick={handleSubmitGrade}>
                채점 완료
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 정답 직접 입력 모달 ===== */}
      {answerEditModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50 p-4"
          style={{ background: 'rgba(0,0,0,0.55)' }}
        >
          <div
            className="anim-sheet-up max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto rounded-[16px]"
            style={{ background: 'var(--color-surface)', boxShadow: 'var(--shadow-sh3)' }}
          >
            <h3 className="text-lg font-bold text-ink mb-1" style={{ letterSpacing: '-0.01em' }}>
              정답 입력
            </h3>
            <p className="text-sm mb-3" style={{ color: 'var(--color-ink-2)' }}>
              <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{answerEditModal.name}</span>
              <span style={{ color: 'var(--color-mute)' }}> · 총 {answerEditModal.totalProblems}문제</span>
            </p>
            <div
              className="mb-3 px-3 py-2.5 rounded-[10px] text-xs"
              style={{
                background: 'var(--color-accent-bg, rgba(59,130,246,0.08))',
                color: 'var(--color-ink-2)',
                lineHeight: 1.5,
                border: '1px solid var(--color-border)',
              }}
            >
              <strong>입력 예시:</strong>
              <br />
              <span style={{ fontFamily: 'monospace' }}>1. ①</span>
              <br />
              <span style={{ fontFamily: 'monospace' }}>2. 3</span>
              <br />
              <span style={{ fontFamily: 'monospace' }}>3: A</span>
              <br />
              <span style={{ color: 'var(--color-mute)' }}>
                &bull; 각 줄에 "문제번호 + 구분자(. : ) 공백) + 답" 을 입력하세요.
                <br />
                &bull; 답은 ①~⑤, 1~5, A~E 등 자유롭게 가능합니다.
                <br />
                &bull; 빈 칸은 건너뛰어 저장되지 않습니다.
              </span>
            </div>
            <textarea
              value={answerEditModal.text}
              onChange={e =>
                setAnswerEditModal(prev => prev ? { ...prev, text: e.target.value } : prev)
              }
              className="w-full font-mono text-sm"
              style={{
                minHeight: 320,
                padding: 12,
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-btn)',
                background: 'var(--color-surface-2)',
                color: 'var(--color-ink)',
                resize: 'vertical',
                lineHeight: 1.7,
              }}
              placeholder={'1. ①\n2. ③\n...'}
              disabled={answerEditModal.saving}
              autoFocus
            />
            <div className="flex gap-3 mt-5">
              <Button
                variant="secondary"
                size="md"
                fullWidth
                onClick={() => setAnswerEditModal(null)}
                disabled={answerEditModal.saving}
              >
                취소
              </Button>
              <Button
                variant="accent"
                size="md"
                fullWidth
                onClick={saveAnswerEditor}
                disabled={answerEditModal.saving}
              >
                {answerEditModal.saving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
