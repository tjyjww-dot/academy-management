'use client';

import { useEffect, useState, useCallback } from 'react';

interface Payment {
  id: string;
  studentId: string;
  yearMonth: string;
  tuitionFee: number;
  specialFee: number;
  otherFee: number;
  totalFee: number;
  remarks: string | null;
  status: string;
  student?: { name: string; studentNumber: string; grade: string; school: string };
}

interface StudentPaymentRow {
  studentId: string;
  studentName: string;
  studentNumber: string;
  grade: string;
  school: string;
  payment: Payment | null;
}

interface StudentHistory {
  id: string;
  name: string;
  studentNumber: string;
  grade: string;
  payments: Payment[];
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: '
