'use client';

import { useEffect, useState } from 'react';

interface EntranceTest {
  id: string;
  name: string;
  school: string | null;
  grade: string | null;
  parentPhone: string;
  testDate: string;
  testTime: string;
  status: string;
  notes: string | null;
  priorLevel: string | null;
  testScore: string | null;
  counselingNotes: string | null;
  createdAt: string;
}

const statusLabel: Record<string, string> = {
  SCHEDULED: '}(',
  COMPLETED: 'D�',
  CANCELLED: '�',
};

const statusColor: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
};

const GRADE_OPTIONS = [
  '� 1YD', '� 2YD', '� 3YD', '� 4YD', '� 5YD', '� 6YD',
  '� 1YD', '� 2YD', '� 3YD',
  '�� 1YD', '�� 2YD', '�� 3YD',
  '0�',
];

const TIME_OPTIONS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00',
];

const emptyForm = {
  name: '',
  school: '',
  grade: '',
  parentPhone: '',
  testDate: '',
  testTime: '',
  notes: '',
  priorLevel: '',
  testScore: '',
  counselingNotes: '',
};

export default function EntranceTestPage() {
  const [tests, setTests] = useState<EntranceTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [form, setForm] = useState(emptyForm);

  // 
