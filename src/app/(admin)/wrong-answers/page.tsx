'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { toast } from '@/components/ui/use-toast';

// Set up PDF.js worker
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

// Types
interface Student {
  id: string;
  name: string;
  classId: string;
}

interface Classroom {
  id: string;
  name: string;
  grade: number;
}

interface WrongAnswer {
  id: string;
  studentId: string;
  testPaperId: string;
  problemNumber: number;
  imageUrl: string;
  status: 'pending' | 'completed';
  createdAt: string;
}

interface Test {
  id: string;
  studentId: string;
  roundNumber: number;
  problems: string[];
  score?: number;
  gradedAt?: string;
}

interface TestPaper {
  id: string;
  name: string;
  totalProblems: number;
  imageUrls: string[];
  answers: Record<string, string>;
  createdAt: string;
}

interface Statistics {
  activeWrongAnswers: number;
  completedTests: number;
  totalTests: number;
  pendingGrades: number;
  masteryRate: number;
}

interface GradeItem {
  roundNumber: number;
  studentId: string;
}

interface CroppedProblem {
  problemNumber: number;
  imageBlob: Blob;
  answer: string;
  preview?: string;
}

interface DriveFolder {
  id: string;
  name: string;
}

interface DriveFile {
  id: string;
  name: string;
}

interface ParsedAnswers {
  [key: string]: string;
}

export default function WrongAnswersPage() {
  // State for tabs
  const [activeTab, setActiveTab] = useState<'list' | 'upload' | 'manage'>('list');

  // State for 시험지 목록 tab
  const [testPapers, setTestPapers] = useState<TestPaper[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string>('');
  const [selectedStudent, setSelectedStudent] = useState<string>('');
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [statistics, setStatistics] = useState<Statistics>({
    activeWrongAnswers: 0,
    completedTests: 0,
    totalTests: 0,
    pendingGrades: 0,
    masteryRate: 0,
  });
  const [tests, setTests] = useState<Test[]>([]);
  const [gradeIndex, setGradeIndex] = useState<number | null>(null);
  const [gradeMarks, setGradeMarks] = useState<{ [key: number]: boolean }>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // State for 시험지 업로드 tab - Google Drive Integration
  const [driveFolders, setDriveFolders] = useState<DriveFolder[]>([]);
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'loading' | 'downloading' | 'processing' | 'done'>('idle');
  const [croppedProblems, setCroppedProblems] = useState<CroppedProblem[]>([]);
  const [parsedAnswers, setParsedAnswers] = useState<ParsedAnswers>({});
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // Fetch initial data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const [classroomsRes, studentsRes, testPapersRes, wrongAnswersRes, testsRes, statsRes] =
          await Promise.all([
            fetch('/api/classrooms'),
            fetch('/api/students'),
            fetch('/api/test-papers'),
            fetch('/api/wrong-answers'),
            fetch('/api/tests'),
            fetch('/api/statistics'),
          ]);

        if (classroomsRes.ok) setClassrooms(await classroomsRes.json());
        if (studentsRes.ok) setStudents(await studentsRes.json());
        if (testPapersRes.ok) setTestPapers(await testPapersRes.json());
        if (wrongAnswersRes.ok) setWrongAnswers(await wrongAnswersRes.json());
        if (testsRes.ok) setTests(await testsRes.json());
        if (statsRes.ok) setStatistics(await statsRes.json());
      } catch (error) {
        console.error('Failed to fetch initial data:', error);
        toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
      }
    };

    fetchInitialData();
  }, []);

  // Fetch Google Drive folders when upload tab is opened
  useEffect(() => {
    if (activeTab === 'upload' && driveFolders.length === 0) {
      fetchGoogleDriveFolders();
    }
  }, [activeTab]);

  // Fetch Google Drive folders
  const fetchGoogleDriveFolders = async () => {
    try {
      setProcessingStatus('loading');
      const response = await fetch('/api/google-drive?action=list');
      if (!response.ok) throw new Error('Failed to fetch folders');
      const data = await response.json();
      setDriveFolders(data.folders || []);
      setProcessingStatus('idle');
    } catch (error) {
      console.error('Error fetching Google Drive folders:', error);
      toast({ title: 'Error', description: 'Failed to load Google Drive folders', variant: 'destructive' });
      setProcessingStatus('idle');
    }
  };

  // Fetch files in selected Google Drive folder
  const fetchDriveFiles = async (folderId: string) => {
    try {
      setProcessingStatus('loading');
      const response = await fetch(`/api/google-drive?action=list&folderId=${folderId}`);
      if (!response.ok) throw new Error('Failed to fetch files');
      const data = await response.json();
      setDriveFiles(data.files || []);
      setSelectedFile('');
      setCroppedProblems([]);
      setParsedAnswers({});
      setProcessingStatus('idle');
    } catch (error) {
      console.error('Error fetching Google Drive files:', error);
      toast({ title: 'Error', description: 'Failed to load files from folder', variant: 'destructive' });
      setProcessingStatus('idle');
    }
  };

  // ===== Smart Cropping Helpers =====

  /** canvas.toBlob을 Promise로 변환 */
  const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

  /** 픽셀 행의 평균 밝기를 계산 (imageData 전체를 받아 효율적으로 처리) */
  const getRowBrightness = (
    data: Uint8ClampedArray, imgWidth: number,
    y: number, x1: number, x2: number, step: number = 3
  ): number => {
    let total = 0, count = 0;
    for (let x = x1; x < x2; x += step) {
      const idx = (y * imgWidth + x) * 4;
      total += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      count++;
    }
    return count > 0 ? total / count : 255;
  };

  /** 픽셀 열의 평균 밝기를 계산 */
  const getColBrightness = (
    data: Uint8ClampedArray, imgWidth: number,
    x: number, y1: number, y2: number, step: number = 3
  ): number => {
    let total = 0, count = 0;
    for (let y = y1; y < y2; y += step) {
      const idx = (y * imgWidth + x) * 4;
      total += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      count++;
    }
    return count > 0 ? total / count : 255;
  };

  /**
   * 특정 범위 내에서 가장 큰 수평 여백(흰색 띄)의 중심 y좌표를 찾음
   * 문제와 문제 사이의 경계를 찾는 핵심 로직
   */
  const findLargestHorizontalGap = (
    data: Uint8ClampedArray, imgWidth: number,
    x1: number, x2: number, scanTop: number, scanBottom: number,
    threshold: number = 245, minGapHeight: number = 10
  ): number => {
    let bestGapCenter = Math.floor((scanTop + scanBottom) / 2);
    let bestGapSize = 0;
    let gapStart = -1;

    for (let y = scanTop; y < scanBottom; y++) {
      const brightness = getRowBrightness(data, imgWidth, y, x1, x2);
      if (brightness >= threshold) {
        if (gapStart === -1) gapStart = y;
      } else {
        if (gapStart !== -1) {
          const gapSize = y - gapStart;
          if (gapSize > bestGapSize && gapSize >= minGapHeight) {
            bestGapSize = gapSize;
            bestGapCenter = Math.floor((gapStart + y) / 2);
          }
        }
        gapStart = -1;
      }
    }
    // 마지막 gap 체크
    if (gapStart !== -1) {
      const gapSize = scanBottom - gapStart;
      if (gapSize > bestGapSize && gapSize >= minGapHeight) {
        bestGapCenter = Math.floor((gapStart + scanBottom) / 2);
      }
    }

    return bestGapCenter;
  };

  /** 콘텐츠가 시작/끝나는 y좌표를 찾아서 여백을 트리밍 */
  const findContentBounds = (
    data: Uint8ClampedArray, imgWidth: number,
    x1: number, x2: number, y1: number, y2: number,
    threshold: number = 250
  ): { top: number; bottom: number } => {
    let top = y1;
    for (let y = y1; y < y2; y++) {
      if (getRowBrightness(data, imgWidth, y, x1, x2) < threshold) {
        top = y;
        break;
      }
    }
    let bottom = y2;
    for (let y = y2 - 1; y >= y1; y--) {
      if (getRowBrightness(data, imgWidth, y, x1, x2) < threshold) {
        bottom = y + 1;
        break;
      }
    }
    return { top, bottom };
  };

  /**
   * PDF 텍스트에서 문제 번호의 캔버스 좌표를 찾음
   * 문제 번호 패턴: 단독 숫자 (1~50) 또는 "번호." 형태
   */
  const findProblemNumberPositions = async (
    page: any, viewport: any
  ): Promise<{ num: number; x: number; y: number }[]> => {
    try {
      const textContent = await page.getTextContent();
      const positions: { num: number; x: number; y: number; fontSize: number }[] = [];

      for (const item of textContent.items as any[]) {
        const str = (item.str || '').trim();
        // 단독 문제 번호 매칭 (1~50)
        const match = str.match(/^(\d{1,2})$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num >= 1 && num <= 50) {
            const tx = item.transform[4];
            const ty = item.transform[5];
            const fontSize = Math.abs(item.transform[0]); // 폰트 크기 추정
            const [cx, cy] = viewport.convertToViewportPoint(tx, ty);
            positions.push({ num, x: cx, y: cy, fontSize });
          }
        }
      }

      // 같은 번호가 여러 번 나올 수 있으므로, 가장 큰 폰트의 것을 선택
      const uniquePositions = new Map<number, { num: number; x: number; y: number; fontSize: number }>();
      for (const pos of positions) {
        const existing = uniquePositions.get(pos.num);
        if (!existing || pos.fontSize > existing.fontSize) {
          uniquePositions.set(pos.num, pos);
        }
      }

      return Array.from(uniquePositions.values())
        .map(({ num, x, y }) => ({ num, x, y }))
        .sort((a, b) => a.num - b.num);
    } catch {
      return [];
    }
  };

  // ===== Main PDF Processing =====

  // Download and process PDF from Google Drive
  const processPDFFile = async (fileId: string, fileName: string) => {
    try {
      setProcessingStatus('downloading');
      setUploadProgress(0);

      // Fetch the PDF file from Google Drive
      const response = await fetch(`/api/google-drive?action=download&fileId=${fileId}`);
      if (!response.ok) throw new Error('Failed to download PDF');

      const arrayBuffer = await response.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

      setProcessingStatus('processing');
      setUploadProgress(10);

      const problems: CroppedProblem[] = [];
      const answers: ParsedAnswers = {};
      const totalPages = pdf.numPages;

      // ★ 먼저 마지막 페이지에서 답안을 추출 (순서 수정)
      const lastPage = await pdf.getPage(totalPages);
      const answerTextContent = await lastPage.getTextContent();
      const textLines = answerTextContent.items.map((item: any) => item.str).join('\n');

      const answerPattern = /(\d+)\)\s*(.+?)(?=\n\d+\)|$)/g;
      let match;
      while ((match = answerPattern.exec(textLines)) !== null) {
        answers[match[1].trim()] = match[2].trim();
      }
      setParsedAnswers(answers);

      // 문제 페이지 처리 (마지막 페이지 제외)
      for (let pageNum = 1; pageNum < totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });

        // 캔버스에 페이지 렌더링
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Failed to get canvas context');

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport }).promise;

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // ===== 스마트 크로핑 시작 =====

        // 1. 전체 이미지 데이터를 한 번에 가져옴 (효율성)
        const fullImageData = context.getImageData(0, 0, imgWidth, imgHeight);
        const pixelData = fullImageData.data;

        // 2. 텍스트에서 문제 번호 좌표 추출
        const textPositions = await findProblemNumberPositions(page, viewport);
        const expectedProblems = [
          4 * (pageNum - 1) + 1,
          4 * (pageNum - 1) + 2,
          4 * (pageNum - 1) + 3,
          4 * (pageNum - 1) + 4,
        ];

        // 3. 세로 열 구분선 찾기 (왼쪽 열 / 오른쪽 열 경계)
        let colDivider = Math.floor(imgWidth / 2); // 기본값: 중앙

        // 텍스트 좌표로 열 구분 시도
        const leftColNums = textPositions.filter(p => p.x < imgWidth * 0.5);
        const rightColNums = textPositions.filter(p => p.x >= imgWidth * 0.5);

        if (leftColNums.length > 0 && rightColNums.length > 0) {
          // 왼쪽 열의 가장 오른쪽 콘텐츠와 오른쪽 열의 가장 왼쪽 콘텐츠 사이
          const leftMax = Math.max(...leftColNums.map(p => p.x));
          const rightMin = Math.min(...rightColNums.map(p => p.x));
          colDivider = Math.floor((leftMax + rightMin) / 2);
        }

        // 픽셀 분석으로 열 구분선 정밀 조정
        const scanCenterX = colDivider;
        const scanRangeX = Math.floor(imgWidth * 0.1);
        let bestColX = colDivider;
        let bestBrightness = 0;

        for (let x = scanCenterX - scanRangeX; x < scanCenterX + scanRangeX; x++) {
          const brightness = getColBrightness(
            pixelData, imgWidth, x,
            Math.floor(imgHeight * 0.05), Math.floor(imgHeight * 0.95)
          );
          if (brightness > bestBrightness) {
            bestBrightness = brightness;
            bestColX = x;
          }
        }
        colDivider = bestColX;

        // 4. 각 열에서 가로 분할선 찾기 (위/아래 문제 경계)
        const scanTopY = Math.floor(imgHeight * 0.25);
        const scanBottomY = Math.floor(imgHeight * 0.75);

        // 텍스트 좌표로 분할 힌트 얻기
        let leftHintY = Math.floor(imgHeight / 2);
        let rightHintY = Math.floor(imgHeight / 2);

        // 왼쪽 열의 아래쪽 문제 번호 위치 → 분할선 힌트
        const leftBottomProblem = textPositions.find(
          p => p.x < colDivider && expectedProblems.includes(p.num) && p.y > imgHeight * 0.3
        );
        if (leftBottomProblem) {
          leftHintY = Math.floor(leftBottomProblem.y - imgHeight * 0.03);
        }

        const rightBottomProblem = textPositions.find(
          p => p.x >= colDivider && expectedProblems.includes(p.num) && p.y > imgHeight * 0.3
        );
        if (rightBottomProblem) {
          rightHintY = Math.floor(rightBottomProblem.y - imgHeight * 0.03);
        }

        // 힌트 근처에서 여백 기반 정밀 분할선 탐색
        const searchRange = Math.floor(imgHeight * 0.15);

        const leftSplitY = findLargestHorizontalGap(
          pixelData, imgWidth,
          0, colDivider,
          Math.max(scanTopY, leftHintY - searchRange),
          Math.min(scanBottomY, leftHintY + searchRange)
        );

        const rightSplitY = findLargestHorizontalGap(
          pixelData, imgWidth,
          colDivider, imgWidth,
          Math.max(scanTopY, rightHintY - searchRange),
          Math.min(scanBottomY, rightHintY + searchRange)
        );

        // 5. 각 영역의 콘텐츠 경계 트리밍 (불필요한 여백 제거)
        const padding = 8;

        const topLeftBounds = findContentBounds(pixelData, imgWidth, 0, colDivider, 0, leftSplitY);
        const bottomLeftBounds = findContentBounds(pixelData, imgWidth, 0, colDivider, leftSplitY, imgHeight);
        const topRightBounds = findContentBounds(pixelData, imgWidth, colDivider, imgWidth, 0, rightSplitY);
        const bottomRightBounds = findContentBounds(pixelData, imgWidth, colDivider, imgWidth, rightSplitY, imgHeight);

        // 6. 크롭 영역 정의 (패딩 포함)
        const regions = [
          { // 왼쪽 위 문제
            x: 0,
            y: Math.max(0, topLeftBounds.top - padding),
            w: colDivider,
            h: Math.min(leftSplitY, topLeftBounds.bottom + padding) - Math.max(0, topLeftBounds.top - padding),
            problemIndex: expectedProblems[0],
          },
          { // 왼쪽 아래 문제
            x: 0,
            y: Math.max(leftSplitY, bottomLeftBounds.top - padding),
            w: colDivider,
            h: Math.min(imgHeight, bottomLeftBounds.bottom + padding) - Math.max(leftSplitY, bottomLeftBounds.top - padding),
            problemIndex: expectedProblems[1],
          },
          { // 오른쪽 위 문제
            x: colDivider,
            y: Math.max(0, topRightBounds.top - padding),
            w: imgWidth - colDivider,
            h: Math.min(rightSplitY, topRightBounds.bottom + padding) - Math.max(0, topRightBounds.top - padding),
            problemIndex: expectedProblems[2],
          },
          { // 오른쪽 아래 문제
            x: colDivider,
            y: Math.max(rightSplitY, bottomRightBounds.top - padding),
            w: imgWidth - colDivider,
            h: Math.min(imgHeight, bottomRightBounds.bottom + padding) - Math.max(rightSplitY, bottomRightBounds.top - padding),
            problemIndex: expectedProblems[3],
          },
        ];

        // 7. 각 영역을 크롭하여 문제 이미지 생성
        for (const region of regions) {
          if (region.w <= 0 || region.h <= 0) continue;

          const cropCanvas = document.createElement('canvas');
          const cropContext = cropCanvas.getContext('2d');
          if (!cropContext) continue;

          cropCanvas.width = region.w;
          cropCanvas.height = region.h;

          cropContext.drawImage(
            canvas,
            region.x, region.y, region.w, region.h,
            0, 0, region.w, region.h
          );

          // ★ await로 blob 생성을 확실히 대기 (기존 콜백 버그 수정)
          const blob = await canvasToBlob(cropCanvas);
          if (blob) {
            const preview = cropCanvas.toDataURL('image/png');
            problems.push({
              problemNumber: region.problemIndex,
              imageBlob: blob,
              answer: answers[region.problemIndex.toString()] || '',
              preview,
            });
          }
        }

        // ===== 스마트 크로핑 끝 =====

        setUploadProgress(10 + (pageNum / totalPages) * 70);
      }

      // 문제를 번호 순으로 정렬
      problems.sort((a, b) => a.problemNumber - b.problemNumber);
      setCroppedProblems(problems);

      setUploadProgress(100);
      setProcessingStatus('done');
      toast({ title: '완료', description: `${problems.length}개 문제가 정밀하게 잘렸습니다`, variant: 'default' });
    } catch (error) {
      console.error('Error processing PDF:', error);
      toast({ title: 'Error', description: 'Failed to process PDF file', variant: 'destructive' });
      setProcessingStatus('idle');
      setUploadProgress(0);
    }
  };

  // Upload cropped problems to Vercel Blob
  const handleUploadProblems = async () => {
    if (croppedProblems.length === 0) {
      toast({ title: 'Error', description: 'No problems to upload', variant: 'destructive' });
      return;
    }

    try {
      setProcessingStatus('loading');
      setUploadProgress(0);

      const imageUrls: string[] = [];

      // Upload each cropped problem image
      for (let i = 0; i < croppedProblems.length; i++) {
        const problem = croppedProblems[i];
        const formData = new FormData();
        formData.append('file', problem.imageBlob, `problem-${problem.problemNumber}.png`);

        const uploadResponse = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!uploadResponse.ok) throw new Error('Failed to upload image');
        const uploadData = await uploadResponse.json();
        imageUrls.push(uploadData.url);

        setUploadProgress(((i + 1) / croppedProblems.length) * 100);
      }

      // Save test paper metadata
      const testPaperData = {
        name: selectedFile.replace('.pdf', ''),
        totalProblems: croppedProblems.length,
        imageUrls,
        answers: parsedAnswers,
      };

      const saveResponse = await fetch('/api/test-papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPaperData),
      });

      if (!saveResponse.ok) throw new Error('Failed to save test paper');

      // Reset state
      setCroppedProblems([]);
      setParsedAnswers({});
      setSelectedFile('');
      setUploadProgress(0);
      setProcessingStatus('idle');

      // Refresh test papers list
      const testPapersRes = await fetch('/api/test-papers');
      if (testPapersRes.ok) {
        setTestPapers(await testPapersRes.json());
      }

      toast({ title: 'Success', description: 'Test paper uploaded successfully', variant: 'default' });
      setActiveTab('list');
    } catch (error) {
      console.error('Error uploading problems:', error);
      toast({ title: 'Error', description: 'Failed to upload test paper', variant: 'destructive' });
      setProcessingStatus('idle');
      setUploadProgress(0);
    }
  };

  // Handle classroom selection
  const handleClassroomChange = (classroomId: string) => {
    setSelectedClassroom(classroomId);
    setSelectedStudent('');
  };

  // Filter students by classroom
  const filteredStudents = selectedClassroom
    ? students.filter((student) => student.classId === selectedClassroom)
    : [];

  // Filter wrong answers by selection
  const filteredWrongAnswers = selectedStudent
    ? wrongAnswers.filter(
        (wa) =>
          wa.studentId === selectedStudent &&
          (selectedClassroom
            ? students.find((s) => s.id === selectedStudent)?.classId === selectedClassroom
            : true)
      )
    : [];

  // Get tests for grading
  const testsToGrade = gradeIndex !== null ? [tests[gradeIndex]] : [];

  const handleGradeSubmit = async () => {
    if (gradeIndex === null) return;

    try {
      const testToUpdate = tests[gradeIndex];
      const score = Object.values(gradeMarks).filter(Boolean).length;

      const response = await fetch(`/api/tests/${testToUpdate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ score, gradedAt: new Date().toISOString() }),
      });

      if (!response.ok) throw new Error('Failed to submit grade');

      // Update local state
      setTests((prev) =>
        prev.map((t) =>
          t.id === testToUpdate.id
            ? { ...t, score, gradedAt: new Date().toISOString() }
            : t
        )
      );

      setGradeIndex(null);
      setGradeMarks({});
      toast({ title: 'Success', description: 'Grade submitted successfully' });
    } catch (error) {
      console.error('Error submitting grade:', error);
      toast({ title: 'Error', description: 'Failed to submit grade', variant: 'destructive' });
    }
  };

  return (
    <div className="w-full h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 p-6">
        <h1 className="text-3xl font-bold text-gray-900">오답 관리 시스템</h1>
        <p className="text-gray-500 mt-1">학생의 오답을 관리하고 복습 테스트를 생성합니다</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <div className="flex gap-8 px-6">
          <button
            onClick={() => setActiveTab('list')}
            className={`py-4 px-2 font-medium border-b-2 transition-colors ${
              activeTab === 'list'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            시험지 목록
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`py-4 px-2 font-medium border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            시험지 업로드
          </button>
          <button
            onClick={() => setActiveTab('manage')}
            className={`py-4 px-2 font-medium border-b-2 transition-colors ${
              activeTab === 'manage'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-900'
            }`}
          >
            오답 관리
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* 시험지 목록 Tab */}
        {activeTab === 'list' && (
          <div className="space-y-6">
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-500 text-sm">활성 오답</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{statistics.activeWrongAnswers}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-500 text-sm">완료된 테스트</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{statistics.completedTests}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-500 text-sm">총 테스트</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{statistics.totalTests}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-500 text-sm">채점 대기중</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{statistics.pendingGrades}</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-500 text-sm">숙달률</p>
                <p className="text-3xl font-bold text-green-600 mt-2">{statistics.masteryRate}%</p>
              </div>
            </div>

            {/* Classroom & Student Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">반 선택</label>
                  <select
                    value={selectedClassroom}
                    onChange={(e) => handleClassroomChange(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">모든 반</option>
                    {classrooms.map((classroom) => (
                      <option key={classroom.id} value={classroom.id}>
                        {classroom.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">학생 선택</label>
                  <select
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={!selectedClassroom}
                  >
                    <option value="">모든 학생</option>
                    {filteredStudents.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Test Papers Grid */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 mb-4">시험지 목록</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {testPapers.map((paper) => (
                  <div key={paper.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="aspect-video bg-gray-100 overflow-hidden">
                      {paper.imageUrls.length > 0 && (
                        <img
                          src={paper.imageUrls[0]}
                          alt={paper.name}
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900">{paper.name}</h3>
                      <p className="text-sm text-gray-500 mt-1">문제 수: {paper.totalProblems}</p>
                      <p className="text-xs text-gray-400 mt-2">
                        {new Date(paper.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {testPapers.length === 0 && (
                <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                  <p className="text-gray-500">업로드된 시험지가 없습니다</p>
                </div>
              )}
            </div>

            {/* Wrong Answers */}
            {selectedStudent && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">오답 기록</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {filteredWrongAnswers.map((wa) => (
                    <div key={wa.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <img
                        src={wa.imageUrl}
                        alt="문제"
                        className="w-full h-24 object-cover"
                      />
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-700">문제 {wa.problemNumber}</p>
                        <span
                          className={`inline-block text-xs px-2 py-1 rounded-full mt-1 ${
                            wa.status === 'completed'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {wa.status === 'completed' ? '완료' : '대기중'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tests for Grading */}
            {tests.length > 0 && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4">채점 대기중인 테스트</h2>
                <div className="space-y-2">
                  {tests
                    .filter((t) => !t.gradedAt)
                    .map((test, index) => (
                      <div
                        key={test.id}
                        className="bg-white rounded-lg border border-gray-200 p-4 flex justify-between items-center"
                      >
                        <div>
                          <p className="font-medium text-gray-900">
                            {students.find((s) => s.id === test.studentId)?.name} - {test.roundNumber}차
                          </p>
                          <p className="text-sm text-gray-500">
                            문제: {test.problems.length}개
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setGradeIndex(index);
                            setGradeMarks({});
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                        >
                          채점하기
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 시험지 업로드 Tab - Google Drive Integration */}
        {activeTab === 'upload' && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Step 1: Folder Selection */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Step 1: 폴더 선택</h2>
              {driveFolders.length === 0 && processingStatus === 'idle' ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">Google Drive 폴더를 불러오지 못했습니다</p>
                  <button
                    onClick={fetchGoogleDriveFolders}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    다시 시도
                  </button>
                </div>
              ) : (
                <div>
                  <select
                    value={selectedFolder}
                    onChange={(e) => {
                      setSelectedFolder(e.target.value);
                      if (e.target.value) {
                        fetchDriveFiles(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">폴더를 선택하세요</option>
                    {driveFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.name}
                      </option>
                    ))}
                  </select>
                  {processingStatus === 'loading' && (
                    <p className="text-gray-500 text-sm mt-2">로딩 중...</p>
                  )}
                </div>
              )}
            </div>

            {/* Step 2: File Selection */}
            {selectedFolder && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Step 2: PDF 파일 선택</h2>
                {driveFiles.length === 0 ? (
                  <p className="text-gray-500">이 폴더에 PDF 파일이 없습니다</p>
                ) : (
                  <select
                    value={selectedFile}
                    onChange={(e) => {
                      setSelectedFile(e.target.value);
                      if (e.target.value) {
                        const file = driveFiles.find((f) => f.id === e.target.value);
                        if (file) {
                          processPDFFile(file.id, file.name);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">PDF 파일을 선택하세요</option>
                    {driveFiles.map((file) => (
                      <option key={file.id} value={file.id}>
                        {file.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Step 3 & 4: Processing & Preview */}
            {selectedFile && processingStatus !== 'idle' && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Step 3: PDF 처리 중</h2>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-gray-700">진행 상황</span>
                      <span className="text-sm font-medium text-gray-700">{Math.round(uploadProgress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-gray-600">
                    {processingStatus === 'downloading' && 'PDF 파일을 다운로드하는 중...'}
                    {processingStatus === 'processing' && 'PDF를 처리하고 문제를 추출하는 중...'}
                    {processingStatus === 'done' && 'PDF 처리가 완료되었습니다!'}
                  </p>
                </div>
              </div>
            )}

            {/* Step 5: Preview & Upload */}
            {processingStatus === 'done' && croppedProblems.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Step 4: 문제 미리보기</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                  {croppedProblems.map((problem) => (
                    <div key={problem.problemNumber} className="border border-gray-200 rounded-lg overflow-hidden">
                      {problem.preview && (
                        <img
                          src={problem.preview}
                          alt={`문제 ${problem.problemNumber}`}
                          className="w-full h-24 object-cover"
                        />
                      )}
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-700">문제 {problem.problemNumber}</p>
                        {problem.answer && (
                          <p className="text-xs text-gray-500 mt-1">답: {problem.answer}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={handleUploadProblems}
                  disabled={processingStatus === 'loading'}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400"
                >
                  {processingStatus === 'loading' ? '업로드 중...' : '시험지 업로드 완료'}
                </button>
              </div>
            )}

            {/* Empty State */}
            {processingStatus === 'idle' && !selectedFile && (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <p className="text-gray-500">위의 단계를 따라 Google Drive에서 PDF 파일을 선택하세요</p>
              </div>
            )}
          </div>
        )}

        {/* 오답 관리 Tab */}
        {activeTab === 'manage' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4">오답 관리</h2>
              <p className="text-gray-500">여기에서 학생들의 오답을 관리하고 복습 테스트를 생성할 수 있습니다</p>
            </div>
          </div>
        )}
      </div>

      {/* Grading Modal */}
      {gradeIndex !== null && testsToGrade.length > 0 && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-screen overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900">
                채점: {students.find((s) => s.id === testsToGrade[0].studentId)?.name}
              </h2>
              <p className="text-gray-500 mt-1">
                {testsToGrade[0].roundNumber}차 복습 테스트
              </p>
            </div>

            <div className="p-6 space-y-4">
              {testsToGrade[0].problems.map((problem, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">문제 {index + 1}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        setGradeMarks((prev) => ({
                          ...prev,
                          [index]: prev[index] ? undefined : true,
                        }))
                      }
                      className={`px-4 py-2 rounded-md font-medium transition-colors ${
                        gradeMarks[index]
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      O
                    </button>
                    <button
                      onClick={() =>
                        setGradeMarks((prev) => ({
                          ...prev,
                          [index]: prev[index] === false ? undefined : false,
                        }))
                      }
                      className={`px-4 py-2 rounded-md font-medium transition-colors ${
                        gradeMarks[index] === false
                          ? 'bg-red-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      X
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setGradeIndex(null);
                  setGradeMarks({});
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300"
              >
                취소
              </button>
              <button
                onClick={handleGradeSubmit}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                채점 완료
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
