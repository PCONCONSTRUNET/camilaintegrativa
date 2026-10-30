'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  Bell,
  Calendar,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Columns3,
  ExternalLink,
  FileText,
  Globe2,
  LayoutDashboard,
  LayoutList,
  LockKeyhole,
  MapPin,
  Menu,
  Monitor,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Settings2,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
  AlertTriangle,
  X,
} from 'lucide-react';
import type { AppointmentStatus, AppointmentSummary, TimeBlock } from '@/lib/domain';
import { STATUS_COLORS, STATUS_LABELS, formatCurrency } from '@/lib/utils';
import { useConfirmDialog } from '@/components/confirm-dialog';
import { AdminNotificationBell } from '@/components/admin-notification-bell';
import { QuickDocumentsModal, type QuickDocumentPrefill } from '@/components/quick-documents-modal';
import { getInstantCache, setInstantCache } from '@/lib/client-cache';
import AgendaSettingsDialog from './agenda-settings-dialog';
import QuickAppointmentDialog, { type QuickAppointmentSlot } from './quick-appointment-dialog';
import TimeBlockDialog from './time-block-dialog';

type AgendaView = 'day' | 'three_days' | 'week' | 'month' | 'year' | 'list';

const CLINIC_TIME_ZONE = 'America/Sao_Paulo';
const WEEK_DAYS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
const MINI_WEEK_DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const SHORT_MONTH_PILLS = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const VIEW_OPTIONS: Array<{ value: AgendaView; label: string }> = [
  { value: 'day', label: 'Dia' },
  { value: 'three_days', label: '3 dias' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'year', label: 'Ano' },
  { value: 'list', label: 'Lista' },
];
const MOBILE_MODEL_OPTIONS: Array<{ value: AgendaView; label: string }> = [
  { value: 'day', label: 'Dia' },
  { value: 'three_days', label: '3 dias' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mês' },
  { value: 'list', label: 'Lista' },
];
const START_HOUR = 0;
const END_HOUR = 24;
const HOUR_HEIGHT = 68;
const SLOT_MINUTES = 30;
const RESIZE_STEP_MINUTES = 15;
const MIN_APPOINTMENT_MINUTES = 15;
const MAX_APPOINTMENT_MINUTES = 480;
const RESIZE_DRAG_THRESHOLD = 4;
const AUTO_SCROLL_EDGE = 48;
const COMPACT_SIDEBAR_QUERY = '(max-width: 900px)';

type ResizeDraft = {
  appointmentId: string;
  durationMinutes: number;
  hasConflict: boolean;
};

type ResizeSession = ResizeDraft & {
  pointerId: number;
  target: HTMLButtonElement;
  startClientY: number;
  lastClientY: number;
  initialScrollTop: number;
  initialDurationMinutes: number;
  maximumDurationMinutes: number;
  moved: boolean;
};

type MoveDraft = {
  appointmentId: string;
  date: string;
  time: string;
  hasConflict: boolean;
};

type MoveSession = {
  appointmentId: string;
};

function subscribeCompactSidebar(callback: () => void) {
  const media = window.matchMedia(COMPACT_SIDEBAR_QUERY);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

function compactSidebarSnapshot() {
  return window.matchMedia(COMPACT_SIDEBAR_QUERY).matches;
}

function compactSidebarServerSnapshot() {
  return false;
}

const eventDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLINIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const eventTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: CLINIC_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function dateFromKey(date: string) {
  return new Date(date + 'T12:00:00Z');
}

function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function shiftDate(date: string, days: number) {
  const next = dateFromKey(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function shiftMonth(date: string, direction: number) {
  const parts = date.split('-').map(Number);
  const target = new Date(Date.UTC(parts[0], parts[1] - 1 + direction, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return year + '-' + String(month).padStart(2, '0') + '-' + String(Math.min(parts[2], lastDay)).padStart(2, '0');
}

function shiftYear(date: string, direction: number) {
  const parts = date.split('-').map(Number);
  const year = parts[0] + direction;
  const lastDay = new Date(Date.UTC(year, parts[1], 0)).getUTCDate();
  return year + '-' + String(parts[1]).padStart(2, '0') + '-' + String(Math.min(parts[2], lastDay)).padStart(2, '0');
}

function startOfWeek(date: string) {
  return shiftDate(date, -dateFromKey(date).getUTCDay());
}

function startOfMonth(date: string) {
  return date.slice(0, 7) + '-01';
}

function endOfMonth(date: string) {
  const parts = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(parts[0], parts[1], 0)).getUTCDate();
  return parts[0] + '-' + String(parts[1]).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
}

function daysBetween(from: string, to: string) {
  return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / 86_400_000);
}

function calendarGridDates(date: string, fixedSixWeeks = false) {
  const first = startOfMonth(date);
  const last = endOfMonth(date);
  const gridStart = shiftDate(first, -dateFromKey(first).getUTCDay());
  const gridEnd = shiftDate(last, 6 - dateFromKey(last).getUTCDay());
  const naturalLength = daysBetween(gridStart, gridEnd) + 1;
  const length = fixedSixWeeks ? 42 : naturalLength;
  return Array.from({ length }, (_, index) => shiftDate(gridStart, index));
}

function getViewRange(view: AgendaView, date: string) {
  if (view === 'day') return { from: date, to: date };
  if (view === 'three_days') return { from: date, to: shiftDate(date, 2) };
  if (view === 'week') {
    const from = startOfWeek(date);
    return { from, to: shiftDate(from, 6) };
  }
  if (view === 'month') {
    const dates = calendarGridDates(date);
    return { from: dates[0], to: dates[dates.length - 1] };
  }
  if (view === 'list') return { from: startOfMonth(date), to: endOfMonth(date) };
  return null;
}

function formatMonthOnly(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
  }).format(dateFromKey(date)).toLowerCase();
}

function rangeKey(view: AgendaView, date: string) {
  const range = getViewRange(view, date);
  return range ? range.from + ':' + range.to : 'year:' + date.slice(0, 4);
}

function eventDateKey(value: string) {
  const parts = eventDateFormatter.formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function timeParts(value: string) {
  const parts = eventTimeFormatter.formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { hour: Number(values.hour), minute: Number(values.minute) };
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatMonthYear(date: string) {
  const label = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(dateFromKey(date));
  return label.replace(/^\p{L}/u, (letter) => letter.toUpperCase());
}

function formatFullDate(date: string, withYear = true) {
  const label = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(dateFromKey(date));
  return label.replace(/^\p{L}/u, (letter) => letter.toUpperCase());
}

function formatCompactDate(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
  }).format(dateFromKey(date)).replaceAll('.', '');
}

function formatDayTitle(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(dateFromKey(date));
}

function toolbarTitle(view: AgendaView, date: string) {
  if (view === 'day') return formatDayTitle(date);
  if (view === 'year') return date.slice(0, 4);
  return formatMonthYear(date);
}

function eventPosition(appointment: AppointmentSummary) {
  const start = timeParts(appointment.startAt);
  const minutesFromStart = start.hour * 60 + start.minute;
  const duration = Math.max(
    MIN_APPOINTMENT_MINUTES,
    (new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000,
  );
  return {
    top: (minutesFromStart / 60) * HOUR_HEIGHT,
    height: Math.max(14, (duration / 60) * HOUR_HEIGHT - 3),
  };
}

function blockScheduleMinute(value: string) {
  const date = eventDateKey(value);
  const time = timeParts(value);
  return scheduleMinute(date, timeFromMinutes(time.hour * 60 + time.minute));
}

function blockOverlapsDate(block: TimeBlock, date: string) {
  const dayStart = scheduleMinute(date, '00:00');
  const dayEnd = scheduleMinute(shiftDate(date, 1), '00:00');
  return blockScheduleMinute(block.startAt) < dayEnd && blockScheduleMinute(block.endAt) > dayStart;
}

function blockPosition(block: TimeBlock, date: string) {
  const dayStart = scheduleMinute(date, '00:00');
  const dayEnd = scheduleMinute(shiftDate(date, 1), '00:00');
  const start = Math.max(dayStart, blockScheduleMinute(block.startAt));
  const end = Math.min(dayEnd, blockScheduleMinute(block.endAt));
  return {
    top: ((start - dayStart) / 60) * HOUR_HEIGHT,
    height: Math.max(18, ((end - start) / 60) * HOUR_HEIGHT - 3),
  };
}

function isAllDayBlock(block: TimeBlock) {
  const start = timeParts(block.startAt);
  const end = timeParts(block.endAt);
  return start.hour === 0
    && start.minute === 0
    && end.hour === 0
    && end.minute === 0
    && eventDateKey(block.startAt) !== eventDateKey(block.endAt);
}

function blockPeriodLabel(block: TimeBlock) {
  if (!isAllDayBlock(block)) {
    return `${formatCompactDate(eventDateKey(block.startAt))}, ${formatTime(block.startAt)} – ${formatCompactDate(eventDateKey(block.endAt))}, ${formatTime(block.endAt)}`;
  }
  const startDate = eventDateKey(block.startAt);
  const inclusiveEndDate = shiftDate(eventDateKey(block.endAt), -1);
  return startDate === inclusiveEndDate
    ? `${formatCompactDate(startDate)} · dia inteiro`
    : `${formatCompactDate(startDate)} – ${formatCompactDate(inclusiveEndDate)} · dias inteiros`;
}

function appointmentDuration(appointment: AppointmentSummary) {
  return Math.round((new Date(appointment.endAt).getTime() - new Date(appointment.startAt).getTime()) / 60_000);
}

function appointmentWithDuration(appointment: AppointmentSummary, durationMinutes: number): AppointmentSummary {
  return {
    ...appointment,
    endAt: new Date(new Date(appointment.startAt).getTime() + durationMinutes * 60_000).toISOString(),
  };
}

function formatDuration(durationMinutes: number) {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (!hours) return minutes + 'min';
  if (!minutes) return hours + 'h';
  return hours + 'h' + String(minutes).padStart(2, '0');
}

function timeFromMinutes(totalMinutes: number) {
  return String(Math.floor(totalMinutes / 60)).padStart(2, '0') + ':' + String(totalMinutes % 60).padStart(2, '0');
}

function minutesFromTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function scheduleMinute(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 60_000) + minutesFromTime(time);
}

async function fetchAppointments(from: string, to: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ from, to });
  const response = await fetch('/api/admin/appointments?' + params, { cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Não foi possível carregar a agenda.');
  return (body.appointments as AppointmentSummary[]).sort((a, b) => a.startAt.localeCompare(b.startAt));
}

async function fetchTimeBlocks(from: string, to: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ from, to });
  const response = await fetch('/api/admin/time-blocks?' + params, { cache: 'no-store', signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? 'Não foi possível carregar os bloqueios.');
  return (body.blocks as TimeBlock[]).sort((left, right) => left.startAt.localeCompare(right.startAt));
}

export default function AgendaClient({ initialDate, canManageAgenda }: { initialDate: string; canManageAgenda: boolean }) {
  const [view, setView] = useState<AgendaView>('week');
  const [anchorDate, setAnchorDate] = useState(initialDate);
  const timeScrollRef = useRef<HTMLDivElement>(null);
  const compactSidebar = useSyncExternalStore(subscribeCompactSidebar, compactSidebarSnapshot, compactSidebarServerSnapshot);
  const didInitMobileViewRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [monthStripOpen, setMonthStripOpen] = useState(false);
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [pickerMonthDate, setPickerMonthDate] = useState(initialDate);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const sidebarOpen = compactSidebar ? mobileSidebarOpen : desktopSidebarOpen;
  const initialCachedAppointments = getInstantCache<AppointmentSummary[]>('admin_agenda_appointments', []);
  const initialCachedBlocks = getInstantCache<TimeBlock[]>('admin_agenda_blocks', []);
  const [appointments, setAppointments] = useState<AppointmentSummary[]>(() => initialCachedAppointments);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>(() => initialCachedBlocks);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [quickSlot, setQuickSlot] = useState<QuickAppointmentSlot | null>(null);
  const [editingAppointment, setEditingAppointment] = useState<AppointmentSummary | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timeBlockOpen, setTimeBlockOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docPrefill, setDocPrefill] = useState<QuickDocumentPrefill | undefined>(undefined);
  const [mobileFabMenuOpen, setMobileFabMenuOpen] = useState(false);
  const [loading, setLoading] = useState(() => initialCachedAppointments.length === 0);
  const [message, setMessage] = useState('');
  const [refreshToken, setRefreshToken] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [resizeDraft, setResizeDraft] = useState<ResizeDraft | null>(null);
  const [resizeSavingId, setResizeSavingId] = useState<string | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveSavingId, setMoveSavingId] = useState<string | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState('');
  const moveSessionRef = useRef<MoveSession | null>(null);
  const closeQuickAppointment = useCallback(() => setQuickSlot(null), []);
  const closeAppointmentEdit = useCallback(() => setEditingAppointment(null), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeTimeBlock = useCallback(() => setTimeBlockOpen(false), []);

  useEffect(() => {
    if (compactSidebar && !didInitMobileViewRef.current) {
      didInitMobileViewRef.current = true;
      setView('day');
    }
  }, [compactSidebar]);

  const visibleRange = useMemo(() => getViewRange(view, anchorDate), [view, anchorDate]);
  const requestKey = visibleRange ? visibleRange.from + ':' + visibleRange.to : 'year:' + anchorDate.slice(0, 4);
  const threeDaysDates = useMemo(
    () => [anchorDate, shiftDate(anchorDate, 1), shiftDate(anchorDate, 2)],
    [anchorDate],
  );
  const weekDates = useMemo(() => {
    const first = startOfWeek(anchorDate);
    return Array.from({ length: 7 }, (_, index) => shiftDate(first, index));
  }, [anchorDate]);
  const monthDates = useMemo(() => calendarGridDates(anchorDate), [anchorDate]);
  const miniDates = useMemo(() => calendarGridDates(anchorDate, true), [anchorDate]);
  const pickerGridDates = useMemo(() => calendarGridDates(pickerMonthDate, true), [pickerMonthDate]);
  const yearMonths = useMemo(
    () => Array.from({ length: 12 }, (_, index) => anchorDate.slice(0, 4) + '-' + String(index + 1).padStart(2, '0') + '-01'),
    [anchorDate],
  );
  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return appointments;
    return appointments.filter(
      (apt) =>
        apt.clientName.toLowerCase().includes(q)
        || apt.serviceName.toLowerCase().includes(q),
    );
  }, [appointments, searchQuery]);
  const appointmentsByDate = useMemo(() => {
    const grouped = new Map<string, AppointmentSummary[]>();
    for (const appointment of filteredAppointments) {
      const date = eventDateKey(appointment.startAt);
      grouped.set(date, [...(grouped.get(date) ?? []), appointment]);
    }
    return grouped;
  }, [filteredAppointments]);
  const blocksByDate = useMemo(() => {
    const grouped = new Map<string, TimeBlock[]>();
    if (!visibleRange) return grouped;
    let date = visibleRange.from;
    while (date <= visibleRange.to) {
      const dayBlocks = timeBlocks.filter((block) => blockOverlapsDate(block, date));
      if (dayBlocks.length) grouped.set(date, dayBlocks);
      date = shiftDate(date, 1);
    }
    return grouped;
  }, [timeBlocks, visibleRange]);
  const listDates = useMemo(
    () => [...new Set([...appointmentsByDate.keys(), ...blocksByDate.keys()])].sort((left, right) => left.localeCompare(right)),
    [appointmentsByDate, blocksByDate],
  );
  const selectedAppointment = appointments.find((appointment) => appointment.id === selectedId) ?? null;
  const selectedBlock = timeBlocks.find((block) => block.id === selectedBlockId) ?? null;
  const nowKey = eventDateKey(now.toISOString());
  const nowParts = timeParts(now.toISOString());
  const nowTop = ((nowParts.hour * 60 + nowParts.minute) / 60) * HOUR_HEIGHT;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function cancelActiveInteraction() {
      const session = resizeSessionRef.current;
      if (session) {
        resizeSessionRef.current = null;
        if (session.target.hasPointerCapture(session.pointerId)) session.target.releasePointerCapture(session.pointerId);
        setResizeDraft(null);
      }
      if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
      if (moveSessionRef.current) {
        moveSessionRef.current = null;
        setMovingId(null);
        setMoveDraft(null);
        setMoveAnnouncement('Movimentação cancelada.');
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      cancelActiveInteraction();
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', cancelActiveInteraction);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', cancelActiveInteraction);
      if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visibleRange) return;
    const controller = new AbortController();
    Promise.all([
      fetchAppointments(visibleRange.from, visibleRange.to, controller.signal),
      fetchTimeBlocks(visibleRange.from, visibleRange.to, controller.signal),
    ])
      .then(([nextAppointments, nextBlocks]) => {
        setAppointments(nextAppointments);
        setTimeBlocks(nextBlocks);
        setInstantCache('admin_agenda_appointments', nextAppointments);
        setInstantCache('admin_agenda_blocks', nextBlocks);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a agenda.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [requestKey, refreshToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (view !== 'day' && view !== 'three_days' && view !== 'week') return;
    const frame = window.requestAnimationFrame(() => {
      timeScrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT, behavior: 'instant' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [view, requestKey]);

  function prepareRange(nextView: AgendaView, nextDate: string) {
    cancelResize();
    cancelMove();
    setMessage('');
    setSelectedId(null);
    setSelectedBlockId(null);
    const nextRange = getViewRange(nextView, nextDate);
    if (!nextRange) {
      setAppointments([]);
      setTimeBlocks([]);
      setLoading(false);
      return;
    }
    if (rangeKey(nextView, nextDate) !== requestKey) {
      setAppointments([]);
      setTimeBlocks([]);
      setLoading(true);
    }
  }

  function selectDate(nextDate: string) {
    if (!isDateKey(nextDate)) return;
    prepareRange(view, nextDate);
    setAnchorDate(nextDate);
  }

  function openDate(nextDate: string, nextView: AgendaView = 'day') {
    if (!isDateKey(nextDate)) return;
    prepareRange(nextView, nextDate);
    setAnchorDate(nextDate);
    setView(nextView);
    if (compactSidebar) setMobileSidebarOpen(false);
  }

  function changeView(nextView: AgendaView) {
    if (compactSidebar) setMobileSidebarOpen(false);
    if (nextView === view) return;
    prepareRange(nextView, anchorDate);
    setView(nextView);
  }

  function changePeriod(direction: -1 | 1) {
    let nextDate = anchorDate;
    if (view === 'day') nextDate = shiftDate(nextDate, direction);
    if (view === 'three_days') nextDate = shiftDate(nextDate, direction * 3);
    if (view === 'week') nextDate = shiftDate(nextDate, direction * 7);
    if (view === 'month' || view === 'list') nextDate = shiftMonth(nextDate, direction);
    if (view === 'year') nextDate = shiftYear(nextDate, direction);
    selectDate(nextDate);
  }

  function goToday() {
    selectDate(initialDate);
  }

  function toggleSidebar() {
    if (compactSidebar) setMobileSidebarOpen((value) => !value);
    else setDesktopSidebarOpen((value) => !value);
  }

  function selectMiniDate(date: string) {
    selectDate(date);
    if (compactSidebar) setMobileSidebarOpen(false);
  }

  function reload() {
    if (!visibleRange) return;
    setMessage('');
    setAppointments([]);
    setTimeBlocks([]);
    setLoading(true);
    setRefreshToken((value) => value + 1);
  }

  function openQuickAppointment(date: string, time: string, bookingKind: 'regular' | 'encaixe' = 'regular') {
    if (bookingKind === 'encaixe' && !canManageAgenda) return;
    cancelMove();
    setSelectedId(null);
    setSelectedBlockId(null);
    setEditingAppointment(null);
    setMessage('');
    setQuickSlot({ date, time, bookingKind });
  }

  function openDefaultQuickAppointment(bookingKind: 'regular' | 'encaixe' = 'regular') {
    let totalMinutes = 9 * 60;
    if (anchorDate === nowKey) {
      totalMinutes = Math.ceil((nowParts.hour * 60 + nowParts.minute) / SLOT_MINUTES) * SLOT_MINUTES;
      totalMinutes = Math.min(totalMinutes, 23 * 60 + 30);
    }
    openQuickAppointment(anchorDate, timeFromMinutes(totalMinutes), bookingKind);
  }

  function finishQuickAppointment() {
    const wasFitIn = quickSlot?.bookingKind === 'encaixe';
    setQuickSlot(null);
    setMessage(wasFitIn ? 'Encaixe criado, com motivo registrado na agenda.' : 'Agendamento criado e incluído na agenda.');
    setAppointments([]);
    setTimeBlocks([]);
    setLoading(true);
    setRefreshToken((value) => value + 1);
  }

  function openEditAppointment(appointment: AppointmentSummary) {
    cancelResize();
    cancelMove();
    setSelectedId(null);
    setSelectedBlockId(null);
    setQuickSlot(null);
    setMessage('');
    setEditingAppointment(appointment);
  }

  function finishAppointmentEdit(updated: AppointmentSummary) {
    setEditingAppointment(null);
    setSelectedId(null);
    setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item));
    setMessage('Agendamento atualizado e histórico registrado.');
    setLoading(true);
    setRefreshToken((value) => value + 1);
  }

  function refreshAfterConflict(conflictMessage?: string) {
    setMessage(conflictMessage ?? 'A agenda mudou em outra tela. Os horários foram atualizados.');
    setAppointments([]);
    setTimeBlocks([]);
    setLoading(true);
    setRefreshToken((value) => value + 1);
  }

  function finishSettings() {
    setSettingsOpen(false);
    reload();
    setMessage('Regras da agenda atualizadas. A disponibilidade pública já usa as novas configurações.');
  }

  function finishTimeBlock() {
    setTimeBlockOpen(false);
    setMessage('Período bloqueado e removido da disponibilidade pública.');
    setAppointments([]);
    setTimeBlocks([]);
    setLoading(true);
    setRefreshToken((value) => value + 1);
  }

  const { confirmDialog, dialogNode } = useConfirmDialog();

  async function deleteTimeBlock(block: TimeBlock) {
    const { confirmed } = await confirmDialog({
      title: 'Remover bloqueio de agenda',
      description: 'O período voltará a seguir as regras normais de disponibilidade para agendamentos.',
      highlightText: block.reason,
      confirmLabel: 'Sim, remover bloqueio',
      cancelLabel: 'Voltar',
      variant: 'danger',
    });
    if (!confirmed) return;
    setMessage('');
    const response = await fetch('/api/admin/time-blocks/' + block.id, { method: 'DELETE' });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? 'Não foi possível remover o bloqueio.');
      return;
    }
    setSelectedBlockId(null);
    setTimeBlocks((items) => items.filter((item) => item.id !== block.id));
    setMessage('Bloqueio removido. O período voltou a seguir a disponibilidade configurada.');
  }

  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const statusUpdatingRef = useRef<string | null>(null);

  async function update(id: string, status: AppointmentStatus) {
    if (statusUpdatingRef.current === id) return;
    if (status === 'cancelado') {
      const targetApt = appointments.find((item) => item.id === id);
      const { confirmed } = await confirmDialog({
        title: 'Cancelar agendamento',
        description: 'Deseja realmente cancelar este agendamento? O horário ficará livre novamente na agenda.',
        highlightText: targetApt ? `${targetApt.clientName} — ${targetApt.serviceName}` : undefined,
        confirmLabel: 'Sim, cancelar',
        cancelLabel: 'Manter agendamento',
        variant: 'danger',
      });
      if (!confirmed) return;
    }
    statusUpdatingRef.current = id;
    setStatusUpdatingId(id);
    setMessage('');
    try {
      const response = await fetch('/api/admin/appointments/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setMessage('Não foi possível atualizar o status.');
        return;
      }
      setMessage('Status atualizado e histórico registrado.');
      setSelectedId(null);
      setAppointments([]);
      setLoading(true);
      setRefreshToken((value) => value + 1);
    } finally {
      statusUpdatingRef.current = null;
      setStatusUpdatingId(null);
    }
  }

  function stopAutoScroll() {
    if (autoScrollFrameRef.current !== null) window.cancelAnimationFrame(autoScrollFrameRef.current);
    autoScrollFrameRef.current = null;
  }

  function cancelResize() {
    const session = resizeSessionRef.current;
    resizeSessionRef.current = null;
    if (session?.target.hasPointerCapture(session.pointerId)) session.target.releasePointerCapture(session.pointerId);
    stopAutoScroll();
    setResizeDraft(null);
  }

  function cancelMove(announce = false) {
    const hadActiveMove = Boolean(moveSessionRef.current || movingId || moveDraft);
    moveSessionRef.current = null;
    setMovingId(null);
    setMoveDraft(null);
    if (announce && hadActiveMove) setMoveAnnouncement('Movimentação cancelada.');
  }

  function canMove(appointment: AppointmentSummary) {
    return !compactSidebar
      && !['concluido', 'cancelado', 'nao_compareceu'].includes(appointment.status);
  }

  function appointmentStartMinute(appointment: AppointmentSummary) {
    const start = timeParts(appointment.startAt);
    return scheduleMinute(eventDateKey(appointment.startAt), timeFromMinutes(start.hour * 60 + start.minute));
  }

  function hasMoveConflict(appointment: AppointmentSummary, date: string, time: string) {
    const start = scheduleMinute(date, time);
    const end = start + appointmentDuration(appointment);
    const appointmentConflict = appointments.some((candidate) => {
      if (candidate.id === appointment.id || ['cancelado', 'nao_compareceu'].includes(candidate.status)) return false;
      const candidateStart = appointmentStartMinute(candidate);
      const candidateEnd = candidateStart + appointmentDuration(candidate);
      return candidateStart < end && candidateEnd > start;
    });
    if (appointmentConflict) return true;
    return timeBlocks.some((block) => blockScheduleMinute(block.startAt) < end && blockScheduleMinute(block.endAt) > start);
  }

  function moveTimeFromPointer(event: ReactDragEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const slotHeight = (SLOT_MINUTES / 60) * HOUR_HEIGHT;
    const relativeY = Math.max(0, Math.min(bounds.height - 1, event.clientY - bounds.top));
    const slot = Math.floor(relativeY / slotHeight);
    return timeFromMinutes(Math.min(END_HOUR * 60 - SLOT_MINUTES, slot * SLOT_MINUTES));
  }

  function autoScrollMove(clientY: number) {
    const scroll = timeScrollRef.current;
    if (!scroll) return;
    const bounds = scroll.getBoundingClientRect();
    const topEdge = bounds.top + 82;
    const bottomEdge = bounds.bottom;
    if (clientY < topEdge + AUTO_SCROLL_EDGE) {
      scroll.scrollTop -= Math.min(14, Math.max(4, (topEdge + AUTO_SCROLL_EDGE - clientY) / 4));
    } else if (clientY > bottomEdge - AUTO_SCROLL_EDGE) {
      scroll.scrollTop += Math.min(14, Math.max(4, (clientY - (bottomEdge - AUTO_SCROLL_EDGE)) / 4));
    }
  }

  function beginMove(event: ReactDragEvent<HTMLDivElement>, appointment: AppointmentSummary) {
    if (!canMove(appointment) || moveSavingId || resizeSavingId || resizeSessionRef.current) {
      event.preventDefault();
      return;
    }
    cancelResize();
    moveSessionRef.current = { appointmentId: appointment.id };
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', appointment.id);
    setSelectedId(null);
    setQuickSlot(null);
    setMessage('');
    setMoveDraft(null);
    setMovingId(appointment.id);
    setMoveAnnouncement('Movendo ' + appointment.clientName + '. Solte no novo dia e horário.');
  }

  function previewMove(event: ReactDragEvent<HTMLDivElement>, date: string) {
    const session = moveSessionRef.current;
    if (!session) return;
    const appointment = appointments.find((item) => item.id === session.appointmentId);
    if (!appointment) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    autoScrollMove(event.clientY);
    const time = moveTimeFromPointer(event);
    const hasConflict = hasMoveConflict(appointment, date, time);
    const nextDraft = { appointmentId: appointment.id, date, time, hasConflict };
    setMoveDraft((current) => (
      current
      && current.appointmentId === nextDraft.appointmentId
      && current.date === nextDraft.date
      && current.time === nextDraft.time
      && current.hasConflict === nextDraft.hasConflict
        ? current
        : nextDraft
    ));
    setMoveAnnouncement(
      formatFullDate(date, false) + ' às ' + time + '. '
      + (hasConflict ? 'Conflito com outro atendimento ou bloqueio.' : 'Sem conflito visível; a agenda validará ao soltar.'),
    );
  }

  function finishMoveDrag() {
    if (!moveSessionRef.current) return;
    cancelMove(true);
  }

  async function persistMove(appointment: AppointmentSummary, draft: MoveDraft) {
    const durationMinutes = appointmentDuration(appointment);
    const endMinutes = (minutesFromTime(draft.time) + durationMinutes) % (24 * 60);
    setMoveSavingId(appointment.id);
    try {
      const response = await fetch('/api/admin/appointments/' + appointment.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'edit',
          clientId: appointment.clientId,
          serviceId: appointment.serviceId,
          modality: appointment.modality,
          date: draft.date,
          time: draft.time,
          endTime: timeFromMinutes(endMinutes),
          status: appointment.status,
          notes: appointment.administrativeNotes ?? '',
          expectedUpdatedAt: appointment.updatedAt,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.error ?? 'Não foi possível reagendar o atendimento.'), { status: response.status });
      const updated = body.appointment as AppointmentSummary;
      setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item));
      setMessage('Atendimento reagendado para ' + formatCompactDate(draft.date) + ', ' + draft.time + '.');
      setMoveAnnouncement('Atendimento reagendado com sucesso para ' + formatFullDate(draft.date, false) + ' às ' + draft.time + '.');
    } catch (error) {
      const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      setMessage(error instanceof Error ? error.message : 'Não foi possível reagendar o atendimento.');
      setMoveAnnouncement('Não foi possível reagendar o atendimento.');
      if (status === 409) {
        setRefreshToken((value) => value + 1);
      }
    } finally {
      setMoveDraft(null);
      setMoveSavingId(null);
    }
  }

  function dropMove(event: ReactDragEvent<HTMLDivElement>, date: string) {
    const session = moveSessionRef.current;
    if (!session) return;
    event.preventDefault();
    autoScrollMove(event.clientY);
    const appointment = appointments.find((item) => item.id === session.appointmentId);
    const time = moveTimeFromPointer(event);
    moveSessionRef.current = null;
    setMovingId(null);
    if (!appointment) {
      setMoveDraft(null);
      return;
    }
    const draft = { appointmentId: appointment.id, date, time, hasConflict: hasMoveConflict(appointment, date, time) };
    if (draft.hasConflict) {
      setMoveDraft(null);
      setMessage('Não foi possível reagendar: já existe outro atendimento nesse período.');
      setMoveAnnouncement('Movimentação cancelada por conflito de horário.');
      return;
    }
    const currentStart = timeParts(appointment.startAt);
    const currentTime = timeFromMinutes(currentStart.hour * 60 + currentStart.minute);
    if (eventDateKey(appointment.startAt) === date && currentTime === time) {
      setMoveDraft(null);
      setMoveAnnouncement('O atendimento permaneceu no horário original.');
      return;
    }
    setMoveDraft(draft);
    void persistMove(appointment, draft);
  }

  function hasAppointmentConflict(appointment: AppointmentSummary, durationMinutes: number) {
    const start = new Date(appointment.startAt).getTime();
    const end = start + durationMinutes * 60_000;
    const appointmentConflict = appointments.some((candidate) => (
      candidate.id !== appointment.id
      && !['cancelado', 'nao_compareceu'].includes(candidate.status)
      && new Date(candidate.startAt).getTime() < end
      && new Date(candidate.endAt).getTime() > start
    ));
    if (appointmentConflict) return true;
    return timeBlocks.some((block) => new Date(block.startAt).getTime() < end && new Date(block.endAt).getTime() > start);
  }

  function maximumVisibleDuration(appointment: AppointmentSummary) {
    const start = timeParts(appointment.startAt);
    const untilMidnight = 24 * 60 - (start.hour * 60 + start.minute);
    return Math.min(MAX_APPOINTMENT_MINUTES, untilMidnight);
  }

  function canResize(appointment: AppointmentSummary) {
    return !['concluido', 'cancelado', 'nao_compareceu'].includes(appointment.status)
      && maximumVisibleDuration(appointment) >= MIN_APPOINTMENT_MINUTES
      && appointmentDuration(appointment) <= maximumVisibleDuration(appointment);
  }

  function updateResizePreview(clientY: number) {
    const session = resizeSessionRef.current;
    const scroll = timeScrollRef.current;
    if (!session || !scroll) return;

    session.lastClientY = clientY;
    const deltaPixels = clientY - session.startClientY + scroll.scrollTop - session.initialScrollTop;
    if (!session.moved && Math.abs(deltaPixels) < RESIZE_DRAG_THRESHOLD) return;
    session.moved = true;
    const snappedDelta = Math.round(
      (deltaPixels * 60) / HOUR_HEIGHT / RESIZE_STEP_MINUTES,
    ) * RESIZE_STEP_MINUTES;
    const durationMinutes = Math.max(
      MIN_APPOINTMENT_MINUTES,
      Math.min(session.maximumDurationMinutes, session.initialDurationMinutes + snappedDelta),
    );
    const appointment = appointments.find((item) => item.id === session.appointmentId);
    if (!appointment) return;
    const hasConflict = hasAppointmentConflict(appointment, durationMinutes);
    session.durationMinutes = durationMinutes;
    session.hasConflict = hasConflict;
    setResizeDraft({ appointmentId: session.appointmentId, durationMinutes, hasConflict });
  }

  function runAutoScroll() {
    autoScrollFrameRef.current = null;
    const session = resizeSessionRef.current;
    const scroll = timeScrollRef.current;
    if (!session || !scroll) return;
    const bounds = scroll.getBoundingClientRect();
    const topEdge = bounds.top + 82;
    const bottomEdge = bounds.bottom;
    let speed = 0;
    if (session.lastClientY < topEdge + AUTO_SCROLL_EDGE) {
      speed = -Math.min(14, Math.max(4, (topEdge + AUTO_SCROLL_EDGE - session.lastClientY) / 4));
    } else if (session.lastClientY > bottomEdge - AUTO_SCROLL_EDGE) {
      speed = Math.min(14, Math.max(4, (session.lastClientY - (bottomEdge - AUTO_SCROLL_EDGE)) / 4));
    }
    if (!speed) return;
    const previousScrollTop = scroll.scrollTop;
    scroll.scrollTop += speed;
    if (scroll.scrollTop !== previousScrollTop) updateResizePreview(session.lastClientY);
    autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  }

  function beginResize(event: ReactPointerEvent<HTMLButtonElement>, appointment: AppointmentSummary) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || resizeSavingId || moveSavingId || moveSessionRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const scroll = timeScrollRef.current;
    if (!scroll || !canResize(appointment)) return;
    const durationMinutes = appointmentDuration(appointment);
    resizeSessionRef.current = {
      appointmentId: appointment.id,
      pointerId: event.pointerId,
      target: event.currentTarget,
      startClientY: event.clientY,
      lastClientY: event.clientY,
      initialScrollTop: scroll.scrollTop,
      initialDurationMinutes: durationMinutes,
      maximumDurationMinutes: maximumVisibleDuration(appointment),
      durationMinutes,
      hasConflict: false,
      moved: false,
    };
    setSelectedId(null);
    setQuickSlot(null);
    setMessage('');
    setResizeDraft({ appointmentId: appointment.id, durationMinutes, hasConflict: false });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch' && 'vibrate' in navigator) navigator.vibrate(8);
  }

  function moveResize(event: ReactPointerEvent<HTMLButtonElement>) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    updateResizePreview(event.clientY);
    if (autoScrollFrameRef.current === null) autoScrollFrameRef.current = window.requestAnimationFrame(runAutoScroll);
  }

  async function persistResize(appointment: AppointmentSummary, durationMinutes: number) {
    setResizeSavingId(appointment.id);
    try {
      const response = await fetch('/api/admin/appointments/' + appointment.id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'resize',
          durationMinutes,
          expectedEndAt: appointment.endAt,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw Object.assign(new Error(body.error ?? 'Não foi possível alterar a duração.'), { status: response.status });
      const updated = body.appointment as AppointmentSummary;
      setAppointments((items) => items.map((item) => item.id === updated.id ? updated : item));
      setResizeDraft(null);
      setMessage('Duração atualizada: ' + formatTime(updated.startAt) + '–' + formatTime(updated.endAt) + '.');
    } catch (error) {
      setResizeDraft(null);
      const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar a duração.');
      if (status === 409) {
        setRefreshToken((value) => value + 1);
      }
    } finally {
      setResizeSavingId(null);
    }
  }

  function finishResize(event: ReactPointerEvent<HTMLButtonElement>, appointment: AppointmentSummary) {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    resizeSessionRef.current = null;
    stopAutoScroll();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!session.moved || session.durationMinutes === session.initialDurationMinutes) {
      setResizeDraft(null);
      return;
    }
    if (session.hasConflict) {
      setResizeDraft(null);
      setMessage('Não foi possível alterar: já existe outro atendimento nesse período.');
      return;
    }
    void persistResize(appointment, session.durationMinutes);
  }

  function handleResizeKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>, appointment: AppointmentSummary) {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key) || resizeSavingId) return;
    event.preventDefault();
    event.stopPropagation();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const amount = event.shiftKey ? 60 : RESIZE_STEP_MINUTES;
    const nextDuration = Math.max(
      MIN_APPOINTMENT_MINUTES,
      Math.min(maximumVisibleDuration(appointment), appointmentDuration(appointment) + direction * amount),
    );
    if (nextDuration === appointmentDuration(appointment)) return;
    if (hasAppointmentConflict(appointment, nextDuration)) {
      setMessage('Não foi possível alterar: já existe outro atendimento nesse período.');
      return;
    }
    setResizeDraft({ appointmentId: appointment.id, durationMinutes: nextDuration, hasConflict: false });
    void persistResize(appointment, nextDuration);
  }

  function renderTimedView(dates: string[]) {
    const gridColumns = compactSidebar
      ? dates.length === 1
        ? '56px minmax(0, 1fr)'
        : dates.length === 3
        ? '46px repeat(3, minmax(0, 1fr))'
        : '38px repeat(7, minmax(0, 1fr))'
      : '64px repeat(' + dates.length + ', minmax(' + (dates.length === 1 ? '360px' : '110px') + ', 1fr))';
    const singleDayAppointments = dates.length === 1 ? (appointmentsByDate.get(dates[0]) ?? []) : [];
    const singleDayBlocks = dates.length === 1 ? (blocksByDate.get(dates[0]) ?? []) : [];
    const timedModeClass =
      dates.length === 1
        ? ' is-day'
        : dates.length === 3
        ? ' is-three-days'
        : ' is-week';

    return (
      <div className="gcal-time-scroll" ref={timeScrollRef}>
        <div className={'gcal-timed-calendar' + timedModeClass}>
          {compactSidebar && dates.length === 1 ? (
            <div className="gcal-time-header is-mobile-day-header" style={{ gridTemplateColumns: gridColumns }}>
              <button
                type="button"
                className={'gcal-time-day is-mobile-single-day' + (dates[0] === initialDate ? ' is-today' : '')}
                onClick={() => openDate(dates[0], 'day')}
              >
                <span>{WEEK_DAYS[dateFromKey(dates[0]).getUTCDay()]}.</span>
                <strong>{Number(dates[0].slice(-2))}</strong>
              </button>
              <div className="gcal-mobile-day-banner">
                <span className="gcal-mobile-day-banner-text">
                  {singleDayAppointments.length === 0 && singleDayBlocks.length === 0
                    ? 'Nenhum evento agendado'
                    : singleDayAppointments.length > 0
                    ? `${singleDayAppointments.length} atendimento${singleDayAppointments.length === 1 ? '' : 's'} agendado${singleDayAppointments.length === 1 ? '' : 's'}`
                    : `${singleDayBlocks.length} bloqueio${singleDayBlocks.length === 1 ? '' : 's'} neste dia`}
                </span>
                <div className="gcal-mobile-day-step">
                  <button type="button" onClick={() => changePeriod(-1)} aria-label="Dia anterior">
                    <ChevronLeft size={17} />
                  </button>
                  <button type="button" onClick={() => changePeriod(1)} aria-label="Próximo dia">
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="gcal-time-header" style={{ gridTemplateColumns: gridColumns }}>
              <span className="gcal-timezone">{compactSidebar ? '' : 'GMT-03'}</span>
              {dates.map((date) => {
                const weekdayIndex = dateFromKey(date).getUTCDay();
                const dayLabel = compactSidebar
                  ? dates.length === 7
                    ? MINI_WEEK_DAYS[weekdayIndex]
                    : WEEK_DAYS[weekdayIndex] + '.'
                  : WEEK_DAYS[weekdayIndex];
                return (
                  <button
                    type="button"
                    className={'gcal-time-day' + (date === initialDate ? ' is-today' : '') + (date === anchorDate ? ' is-selected' : '')}
                    onClick={() => openDate(date, 'day')}
                    key={date}
                  >
                    <span>{dayLabel}</span>
                    <strong>{Number(date.slice(-2))}</strong>
                  </button>
                );
              })}
            </div>
          )}
          <div className="gcal-time-body" style={{ gridTemplateColumns: gridColumns }}>
            <div className="gcal-hour-rail" style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}>
              {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => (
                <span key={index} style={{ top: index * HOUR_HEIGHT }}>
                  {compactSidebar
                    ? index === 0 || index === END_HOUR
                      ? ''
                      : String(index).padStart(2, '0') + ':00'
                    : String(index).padStart(2, '0') + 'h'}
                </span>
              ))}
            </div>
            {dates.map((date) => {
              const dayAppointments = appointmentsByDate.get(date) ?? [];
              const dayBlocks = blocksByDate.get(date) ?? [];
              const moveAppointment = moveDraft
                ? appointments.find((appointment) => appointment.id === moveDraft.appointmentId) ?? null
                : null;
              const moveDuration = moveAppointment ? appointmentDuration(moveAppointment) : 0;
              return (
                <div
                  className={
                    'gcal-time-column'
                    + (date === initialDate ? ' is-today' : '')
                    + (moveDraft?.date === date ? ' is-move-target' : '')
                  }
                  style={{ height: (END_HOUR - START_HOUR) * HOUR_HEIGHT }}
                  onDragOver={(event) => previewMove(event, date)}
                  onDrop={(event) => dropMove(event, date)}
                  key={date}
                >
                  {Array.from({ length: ((END_HOUR - START_HOUR) * 60) / SLOT_MINUTES }, (_, index) => {
                    const slotMinutes = START_HOUR * 60 + index * SLOT_MINUTES;
                    const time = timeFromMinutes(slotMinutes);
                    return (
                      <button
                        type="button"
                        className="gcal-time-slot"
                        style={{ top: (slotMinutes / 60) * HOUR_HEIGHT, height: (SLOT_MINUTES / 60) * HOUR_HEIGHT }}
                        onClick={() => openQuickAppointment(date, time)}
                        aria-label={'Novo agendamento em ' + formatFullDate(date) + ' às ' + time}
                        key={time}
                      >
                        <span>{time}</span>
                      </button>
                    );
                  })}
                  {quickSlot?.date === date && (
                    <div
                      className="gcal-time-draft"
                      style={{ top: (minutesFromTime(quickSlot.time) / 60) * HOUR_HEIGHT, height: HOUR_HEIGHT - 3 }}
                      aria-hidden="true"
                    >
                      <strong>{quickSlot.bookingKind === 'encaixe' ? 'Novo encaixe' : 'Novo agendamento'}</strong>
                      <span>{quickSlot.time}</span>
                    </div>
                  )}
                  {dayBlocks.map((block) => {
                    const fullDay = blockScheduleMinute(block.startAt) <= scheduleMinute(date, '00:00')
                      && blockScheduleMinute(block.endAt) >= scheduleMinute(shiftDate(date, 1), '00:00');
                    return (
                      <button
                        type="button"
                        className={'gcal-time-block' + (selectedBlockId === block.id ? ' is-selected' : '')}
                        style={blockPosition(block, date)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setQuickSlot(null);
                          setSelectedId(null);
                          setSelectedBlockId(block.id);
                        }}
                        title={block.reason}
                        key={block.id + ':' + date}
                      >
                        <LockKeyhole size={13} />
                        <strong>{block.reason}</strong>
                        <small>{fullDay ? 'Dia bloqueado' : formatTime(block.startAt) + ' – ' + formatTime(block.endAt)}</small>
                      </button>
                    );
                  })}
                  {moveDraft?.date === date && moveAppointment && (
                    <div
                      className={
                        'gcal-time-event gcal-time-move-preview event-' + moveAppointment.status
                        + (moveDraft.hasConflict ? ' has-conflict' : '')
                        + (moveSavingId === moveAppointment.id ? ' is-saving' : '')
                      }
                      style={{
                        top: (minutesFromTime(moveDraft.time) / 60) * HOUR_HEIGHT,
                        height: Math.max(14, (moveDuration / 60) * HOUR_HEIGHT - 3),
                      }}
                      aria-hidden="true"
                    >
                      <div className="gcal-time-event-content">
                        <strong>{moveAppointment.clientName}</strong>
                        <span>{moveAppointment.serviceName}</span>
                        <div className="gcal-event-footer-row">
                          <small>
                            {moveDraft.time} – {timeFromMinutes((minutesFromTime(moveDraft.time) + moveDuration) % (24 * 60))}
                            {' · '}{moveDraft.hasConflict ? 'Conflito' : moveSavingId === moveAppointment.id ? 'Salvando…' : 'Solte para reagendar'}
                          </small>
                        </div>
                      </div>
                    </div>
                  )}
                  {date === nowKey && (
                    <div className="gcal-now-line" style={{ top: nowTop }} aria-label="Horário atual">
                      <span />
                    </div>
                  )}
                  {dayAppointments.map((appointment) => {
                    const appointmentDraft = resizeDraft?.appointmentId === appointment.id ? resizeDraft : null;
                    const displayedAppointment = appointmentDraft
                      ? appointmentWithDuration(appointment, appointmentDraft.durationMinutes)
                      : appointment;
                    const position = eventPosition(displayedAppointment);
                    const durationMin = appointmentDuration(displayedAppointment);
                    const isShortAppointment = durationMin < 45;
                    const isSaving = resizeSavingId === appointment.id || moveSavingId === appointment.id;
                    const isMoving = movingId === appointment.id;
                    return (
                      <div
                        className={
                          'gcal-time-event event-' + appointment.status
                          + (appointment.bookingKind === 'encaixe' ? ' is-fit-in' : '')
                          + (selectedId === appointment.id ? ' is-selected' : '')
                          + (appointmentDraft ? ' is-resizing' : '')
                          + (isMoving ? ' is-drag-origin' : '')
                          + (appointmentDraft?.hasConflict ? ' has-conflict' : '')
                          + (isSaving ? ' is-saving' : '')
                        }
                        style={position}
                        draggable={canMove(appointment) && !moveSavingId && !resizeSavingId}
                        onDragStart={(event) => beginMove(event, appointment)}
                        onDragEnd={finishMoveDrag}
                        key={appointment.id}
                      >
                        <button
                          type="button"
                          className="gcal-time-event-content"
                          title={appointment.clientName + ' — ' + appointment.serviceName + ' (' + formatTime(displayedAppointment.startAt) + ' – ' + formatTime(displayedAppointment.endAt) + ')'}
                          aria-describedby={canMove(appointment) ? 'gcal-move-instructions' : undefined}
                          onClick={(event) => {
                            event.stopPropagation();
                            setQuickSlot(null);
                            setSelectedBlockId(null);
                            setSelectedId(appointment.id);
                          }}
                        >
                          <strong>{appointment.clientName}</strong>
                          {!isShortAppointment && <span>{appointment.serviceName}</span>}
                          <div className="gcal-event-footer-row">
                            <small>{formatTime(displayedAppointment.startAt)} – {formatTime(displayedAppointment.endAt)}</small>
                            {appointment.packageSummary && (
                              <span
                                className="gcal-event-package-pill"
                                title={`Sessão ${appointment.sessionNumber || 1} de ${appointment.packageSummary.totalSessions}`}
                              >
                                📦 {appointment.sessionNumber ? `${appointment.sessionNumber}/${appointment.packageSummary.totalSessions}` : 'Pacote'}
                              </span>
                            )}
                          </div>
                        </button>
                        {canResize(appointment) && (
                          <button
                            type="button"
                            className="gcal-event-resize-handle"
                            aria-label={'Ajustar duração de ' + appointment.clientName + '. Duração atual: ' + appointmentDuration(displayedAppointment) + ' minutos.'}
                            title="Arraste para alterar o horário final"
                            disabled={Boolean((resizeSavingId || moveSavingId) && !isSaving)}
                            onPointerDown={(event) => beginResize(event, appointment)}
                            onPointerMove={moveResize}
                            onPointerUp={(event) => finishResize(event, appointment)}
                            onPointerCancel={(event) => {
                              if (resizeSessionRef.current?.pointerId !== event.pointerId) return;
                              event.stopPropagation();
                              cancelResize();
                            }}
                            onLostPointerCapture={(event) => {
                              if (resizeSessionRef.current?.pointerId === event.pointerId) cancelResize();
                            }}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                            }}
                            onKeyDown={(event) => handleResizeKeyboard(event, appointment)}
                          >
                            <span aria-hidden="true" />
                          </button>
                        )}
                        {appointmentDraft && (
                          <span className="gcal-resize-label" aria-live="polite">
                            {appointmentDraft.hasConflict
                              ? 'Conflito de horário'
                              : formatTime(displayedAppointment.startAt) + '–' + formatTime(displayedAppointment.endAt) + ' · ' + formatDuration(appointmentDraft.durationMinutes)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const activeMonthIndex = Number(anchorDate.slice(5, 7)) - 1;
  const showMobileMonthStrip = compactSidebar && (view === 'month' || monthStripOpen);

  return (
    <div className={
      'gcal-app'
      + (sidebarOpen ? '' : ' is-sidebar-closed')
      + (compactSidebar ? ' is-mobile-gcal' : '')
      + (showMobileMonthStrip ? ' has-month-strip' : '')
      + (searchOpen && compactSidebar ? ' has-mobile-search' : '')
      + (resizeDraft && !resizeSavingId ? ' is-resizing-event' : '')
      + (movingId ? ' is-moving-event' : '')
      + (resizeSavingId || moveSavingId ? ' is-saving-event' : '')
    }>
      <p id="gcal-move-instructions" className="gcal-move-assistive">
        No computador, arraste este atendimento para outro dia ou horário. Para teclado ou toque, abra os detalhes e use Editar.
      </p>
      <div className="gcal-move-assistive" role="status" aria-live="polite" aria-atomic="true">{moveAnnouncement}</div>

      {compactSidebar ? (
        <header className="gcal-mobile-header">
          <div className="gcal-mobile-top-row">
            <div className="gcal-mobile-top-left">
              <button
                type="button"
                className="gcal-mobile-circle-btn"
                onClick={toggleSidebar}
                aria-label={sidebarOpen ? 'Fechar menu da agenda' : 'Abrir menu da agenda'}
              >
                <Menu size={20} />
              </button>
              <button
                type="button"
                className={'gcal-mobile-month-trigger' + (showMobileMonthStrip ? ' is-open' : '')}
                onClick={() => setMonthStripOpen((value) => !value)}
                aria-expanded={showMobileMonthStrip}
              >
                <span>{formatMonthOnly(anchorDate)}</span>
                <ChevronDown size={16} />
              </button>
            </div>

            <div className="gcal-mobile-top-right">
              <div className="gcal-mobile-pill-group">
                <button
                  type="button"
                  className={'gcal-mobile-pill-btn' + (searchOpen ? ' is-active' : '')}
                  onClick={() => {
                    setSearchOpen((value) => {
                      if (value) setSearchQuery('');
                      return !value;
                    });
                  }}
                  aria-label="Buscar agendamento"
                >
                  <Search size={17} />
                </button>
                <button
                  type="button"
                  className={
                    'gcal-mobile-pill-btn is-today-badge is-current'
                    + (calendarModalOpen ? ' is-active' : '')
                  }
                  onClick={() => {
                    setPickerMonthDate(anchorDate);
                    setCalendarModalOpen((value) => !value);
                  }}
                  aria-label="Abrir calendário para escolher data"
                  title="Escolher data no calendário"
                >
                  <span className="gcal-mobile-calendar-box">{Number(anchorDate.slice(-2))}</span>
                </button>
              </div>
              <AdminNotificationBell variant="toolbar" />
            </div>
          </div>

          {searchOpen && (
            <div className="gcal-mobile-search-bar">
              <Search size={15} className="gcal-mobile-search-icon" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Buscar paciente ou serviço na agenda..."
                autoFocus
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Limpar busca">
                  <X size={15} />
                </button>
              )}
            </div>
          )}

          <div className="gcal-mobile-models-bar">
            <div className="gcal-mobile-models-pills" role="tablist" aria-label="Modelos da agenda">
              {MOBILE_MODEL_OPTIONS.map((option) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === option.value}
                  className={'gcal-mobile-model-pill' + (view === option.value ? ' is-active' : '')}
                  onClick={() => changeView(option.value)}
                  key={option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="gcal-mobile-period-arrows">
              <button type="button" onClick={() => changePeriod(-1)} aria-label="Período anterior">
                <ChevronLeft size={17} />
              </button>
              <button type="button" onClick={() => changePeriod(1)} aria-label="Próximo período">
                <ChevronRight size={17} />
              </button>
            </div>
          </div>

          {showMobileMonthStrip && (
            <div className="gcal-mobile-month-strip" role="navigation" aria-label="Meses do ano">
              {SHORT_MONTH_PILLS.map((label, index) => {
                const monthDate = anchorDate.slice(0, 4) + '-' + String(index + 1).padStart(2, '0') + '-01';
                const isActive = index === activeMonthIndex;
                return (
                  <button
                    type="button"
                    className={'gcal-mobile-month-pill' + (isActive ? ' is-active' : '')}
                    onClick={() => selectDate(monthDate)}
                    key={label}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </header>
      ) : (
        <header className="gcal-toolbar">
          <div className="gcal-brand">
            <button type="button" className="gcal-icon-button" onClick={toggleSidebar} aria-label={sidebarOpen ? 'Fechar painel lateral' : 'Abrir painel lateral'}>
              <Menu size={21} />
            </button>
            <a href="/admin" className="gcal-brand-link" aria-label="Voltar ao painel">
              <span className="gcal-brand-calendar">{Number(initialDate.slice(-2))}</span>
              <span>Agenda</span>
            </a>
          </div>

          <div className="gcal-period-controls">
            <button type="button" className="gcal-today-button" onClick={goToday}>Hoje</button>
            <button type="button" className="gcal-icon-button" onClick={() => changePeriod(-1)} aria-label="Período anterior"><ChevronLeft size={21} /></button>
            <button type="button" className="gcal-icon-button" onClick={() => changePeriod(1)} aria-label="Próximo período"><ChevronRight size={21} /></button>
            <h1>{toolbarTitle(view, anchorDate)}</h1>
          </div>

          <div className="gcal-toolbar-actions">
            <AdminNotificationBell variant="toolbar" />
            {canManageAgenda && (
              <button type="button" className="gcal-icon-button" onClick={() => setSettingsOpen(true)} aria-label="Configurar regras da agenda" title="Regras da agenda">
                <Settings2 size={18} />
              </button>
            )}
            <button type="button" className="gcal-icon-button" onClick={reload} aria-label="Atualizar agenda" disabled={!visibleRange}>
              <RefreshCw size={18} className={loading ? 'is-spinning' : ''} />
            </button>
            <label className="gcal-date-control" aria-label="Escolher uma data">
              <CalendarDays size={18} />
              <input type="date" value={anchorDate} onChange={(event) => selectDate(event.target.value)} />
            </label>
            <a href="/agendar" target="_blank" className="gcal-public-link">Agenda pública <ExternalLink size={14} /></a>
            <label className="gcal-view-select">
              <select value={view} onChange={(event) => changeView(event.target.value as AgendaView)} aria-label="Visualização da agenda">
                {VIEW_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
              </select>
              <ChevronDown size={15} />
            </label>
          </div>
        </header>
      )}

      <div className="gcal-workspace">
        {compactSidebar && sidebarOpen && (
          <button
            type="button"
            className="gcal-sidebar-backdrop"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Fechar menu lateral"
          />
        )}
        <aside className="gcal-sidebar" aria-label="Painel da agenda">
          {compactSidebar && (
            <div className="gcal-drawer-header">
              <div className="gcal-drawer-brand">
                <span className="gcal-brand-calendar">{Number(initialDate.slice(-2))}</span>
                <div>
                  <strong>Agenda Clínica</strong>
                  <small>Camila Machado</small>
                </div>
              </div>
              <button type="button" className="gcal-icon-button" onClick={() => setMobileSidebarOpen(false)} aria-label="Fechar menu">
                <X size={19} />
              </button>
            </div>
          )}

          {compactSidebar && (
            <div className="gcal-drawer-views" aria-label="Modelos de visualização">
              <span className="gcal-drawer-section-label">Modelos da Agenda</span>
              <button type="button" className={view === 'day' ? 'is-active' : ''} onClick={() => changeView('day')}>
                <Calendar size={17} />
                <span>Dia</span>
                <small>1 coluna</small>
              </button>
              <button type="button" className={view === 'three_days' ? 'is-active' : ''} onClick={() => changeView('three_days')}>
                <Columns3 size={17} />
                <span>Três dias</span>
                <small>3 colunas</small>
              </button>
              <button type="button" className={view === 'week' ? 'is-active' : ''} onClick={() => changeView('week')}>
                <CalendarRange size={17} />
                <span>Semana</span>
                <small>7 colunas</small>
              </button>
              <button type="button" className={view === 'month' ? 'is-active' : ''} onClick={() => changeView('month')}>
                <CalendarDays size={17} />
                <span>Mês</span>
                <small>Grade mensal</small>
              </button>
              <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => changeView('list')}>
                <LayoutList size={17} />
                <span>Programação</span>
                <small>Lista</small>
              </button>
            </div>
          )}

          <button type="button" className="gcal-create-button" onClick={() => {
            if (compactSidebar) setMobileSidebarOpen(false);
            openDefaultQuickAppointment();
          }}><Plus size={21} /> Novo agendamento</button>
          {canManageAgenda && (
            <div className="gcal-sidebar-actions" aria-label="Controles manuais da agenda">
              <button type="button" onClick={() => {
                if (compactSidebar) setMobileSidebarOpen(false);
                openDefaultQuickAppointment('encaixe');
              }}><Sparkles size={16} /><span><strong>Criar encaixe</strong><small>Com motivo registrado</small></span></button>
              <button type="button" onClick={() => {
                if (compactSidebar) setMobileSidebarOpen(false);
                setTimeBlockOpen(true);
              }}><CalendarOff size={16} /><span><strong>Bloquear período</strong><small>Horário, férias ou evento</small></span></button>
              <button type="button" onClick={() => {
                if (compactSidebar) setMobileSidebarOpen(false);
                setSettingsOpen(true);
              }}><Settings2 size={16} /><span><strong>Regras da agenda</strong><small>Dias, intervalos e feriados</small></span></button>
            </div>
          )}

          <section className="gcal-mini-calendar" aria-label="Mini calendário">
            <div className="gcal-mini-heading">
              <strong>{formatMonthYear(anchorDate)}</strong>
              <span>
                <button type="button" onClick={() => selectDate(shiftMonth(anchorDate, -1))} aria-label="Mês anterior"><ChevronLeft size={17} /></button>
                <button type="button" onClick={() => selectDate(shiftMonth(anchorDate, 1))} aria-label="Próximo mês"><ChevronRight size={17} /></button>
              </span>
            </div>
            <div className="gcal-mini-weekdays">
              {MINI_WEEK_DAYS.map((day, index) => <span key={day + index}>{day}</span>)}
            </div>
            <div className="gcal-mini-grid">
              {miniDates.map((date) => (
                <button
                  type="button"
                  className={(date.slice(0, 7) !== anchorDate.slice(0, 7) ? 'is-outside ' : '') + (date === initialDate ? 'is-today ' : '') + (date === anchorDate ? 'is-selected' : '')}
                  onClick={() => selectMiniDate(date)}
                  aria-label={formatFullDate(date)}
                  key={date}
                >
                  {Number(date.slice(-2))}
                </button>
              ))}
            </div>
          </section>

          {compactSidebar && (
            <section className="gcal-drawer-clinic-nav" aria-label="Navegação do sistema">
              <span className="gcal-drawer-section-label">Painel da Clínica</span>
              <a href="/admin"><LayoutDashboard size={16} /> Visão geral</a>
              <a href="/admin/clientes"><Users size={16} /> Clientes</a>
              <a href="/admin/prontuarios"><FileText size={16} /> Prontuários</a>
              <a href="/admin/financeiro"><WalletCards size={16} /> Financeiro</a>
              <a href="/admin/servicos"><Sparkles size={16} /> Serviços</a>
              <a href="/admin/sessoes-grupo"><CalendarRange size={16} /> Sessões em Grupo</a>
              <a href="/admin/notificacoes"><Bell size={16} /> Notificações</a>
              <a href="/admin/configuracoes"><Settings size={16} /> Configurações</a>
            </section>
          )}

          <section className="gcal-sidebar-online">
            <Globe2 size={17} />
            <span><strong>Disponibilidade online</strong><small>Controlada pelas regras e bloqueios da clínica</small></span>
          </section>

          <section className="gcal-sidebar-section">
            <h2>Atendimentos</h2>
            <div className="gcal-status-legend">
              <span><i className="event-solicitado" /> Solicitados</span>
              <span><i className="event-confirmado" /> Confirmados</span>
              <span><i className="event-em_atendimento" /> Em atendimento</span>
              <span><i className="event-concluido" /> Concluídos</span>
              <span><i className="event-cancelado" /> Cancelados</span>
            </div>
          </section>

          <div className="gcal-sidebar-footer">
            <span>{appointments.length} atendimento{appointments.length === 1 ? '' : 's'} no período</span>
            <a href="/admin"><LayoutDashboard size={15} /> Voltar ao painel</a>
          </div>
        </aside>

        <main
          className="gcal-main"
          onTouchStart={(event) => {
            if (!compactSidebar || event.touches.length !== 1) return;
            touchStartRef.current = {
              x: event.touches[0].clientX,
              y: event.touches[0].clientY,
            };
          }}
          onTouchEnd={(event) => {
            if (!compactSidebar || !touchStartRef.current || event.changedTouches.length !== 1) return;
            const dx = event.changedTouches[0].clientX - touchStartRef.current.x;
            const dy = event.changedTouches[0].clientY - touchStartRef.current.y;
            touchStartRef.current = null;
            if (Math.abs(dx) > 64 && Math.abs(dy) < 42) {
              changePeriod(dx < 0 ? 1 : -1);
            }
          }}
        >
          {message && <div className="gcal-toast" role="status"><CheckCircle2 size={17} /> {message}</div>}

          <div className={'gcal-view gcal-view-' + view} aria-busy={loading}>
            {view === 'day' && renderTimedView([anchorDate])}
            {view === 'three_days' && renderTimedView(threeDaysDates)}
            {view === 'week' && renderTimedView(weekDates)}

            {view === 'month' && (
              <div className="gcal-month-view">
                <div className="gcal-month-weekdays">
                  {(compactSidebar ? MINI_WEEK_DAYS : WEEK_DAYS).map((day, idx) => <span key={day + idx}>{day}</span>)}
                </div>
                <div className="gcal-month-grid" style={{ gridTemplateRows: 'repeat(' + monthDates.length / 7 + ', minmax(0, 1fr))' }}>
                  {monthDates.map((date) => {
                    const dayAppointments = appointmentsByDate.get(date) ?? [];
                    const dayBlocks = blocksByDate.get(date) ?? [];
                    const visibleAppointments = dayAppointments.slice(0, dayBlocks.length ? 2 : 3);
                    const hiddenItems = Math.max(0, dayAppointments.length - visibleAppointments.length) + Math.max(0, dayBlocks.length - 1);
                    return (
                      <div className={'gcal-month-day' + (date.slice(0, 7) !== anchorDate.slice(0, 7) ? ' is-outside' : '')} key={date}>
                        <button type="button" className={'gcal-month-number' + (date === initialDate ? ' is-today' : '') + (date === anchorDate ? ' is-selected' : '')} onClick={() => openDate(date, 'day')} aria-label={formatFullDate(date)}>
                          {Number(date.slice(-2))}
                        </button>
                        <div className="gcal-month-events">
                          {dayBlocks.slice(0, 1).map((block) => (
                            <button
                              type="button"
                              className={'gcal-month-block' + (selectedBlockId === block.id ? ' is-selected' : '')}
                              onClick={() => {
                                setSelectedId(null);
                                setSelectedBlockId(block.id);
                              }}
                              title={'Bloqueado: ' + block.reason}
                              key={block.id}
                            >
                              <LockKeyhole size={10} /><span>{block.reason}</span>
                            </button>
                          ))}
                          {visibleAppointments.map((appointment) => (
                            <button
                              type="button"
                              className={'gcal-month-event event-' + appointment.status + (appointment.bookingKind === 'encaixe' ? ' is-fit-in' : '') + (selectedId === appointment.id ? ' is-selected' : '')}
                              onClick={() => {
                                setSelectedBlockId(null);
                                setSelectedId(appointment.id);
                              }}
                              title={formatTime(appointment.startAt) + ' — ' + appointment.clientName + ' — ' + appointment.serviceName}
                              key={appointment.id}
                            >
                              <time>{formatTime(appointment.startAt)}</time>
                              <span>{appointment.clientName}</span>
                            </button>
                          ))}
                          {hiddenItems > 0 && (
                            <button type="button" className="gcal-more-events" onClick={() => openDate(date, 'day')}>
                              +{hiddenItems}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'year' && (
              <div className="gcal-year-view">
                {yearMonths.map((month) => {
                  const dates = calendarGridDates(month, true);
                  return (
                    <section className="gcal-year-month" key={month}>
                      <button type="button" className="gcal-year-title" onClick={() => openDate(month, 'month')}>{new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', month: 'long' }).format(dateFromKey(month))}</button>
                      <div className="gcal-year-weekdays">{MINI_WEEK_DAYS.map((day, index) => <span key={day + index}>{day}</span>)}</div>
                      <div className="gcal-year-days">
                        {dates.map((date) => date.slice(0, 7) === month.slice(0, 7) ? (
                          <button type="button" className={(date === initialDate ? 'is-today ' : '') + (date === anchorDate ? 'is-selected' : '')} onClick={() => openDate(date, 'day')} key={date}>{Number(date.slice(-2))}</button>
                        ) : <span key={date} />)}
                      </div>
                    </section>
                  );
                })}
              </div>
            )}

            {view === 'list' && (
              <div className="gcal-list-view">
                {listDates.map((date) => {
                  const dayAppointments = appointmentsByDate.get(date) ?? [];
                  const dayBlocks = blocksByDate.get(date) ?? [];
                  return (
                    <section className="gcal-list-day" key={date}>
                      <button type="button" className={'gcal-list-date' + (date === initialDate ? ' is-today' : '')} onClick={() => openDate(date, 'day')}>
                        <strong>{Number(date.slice(-2))}</strong>
                        <span>{formatFullDate(date, false)}</span>
                      </button>
                      <div className="gcal-list-items">
                        {dayBlocks.map((block) => (
                          <button type="button" className={'gcal-list-block' + (selectedBlockId === block.id ? ' is-selected' : '')} onClick={() => {
                            setSelectedId(null);
                            setSelectedBlockId(block.id);
                          }} key={block.id}>
                            <span className="gcal-list-block-time"><LockKeyhole size={15} /> Bloqueio</span>
                            <span className="gcal-list-main"><strong>{block.reason}</strong><small>{isAllDayBlock(block) ? 'Dia inteiro' : `${formatTime(block.startAt)} – ${formatTime(block.endAt)}`}</small></span>
                            <span className="badge badge-muted">Indisponível</span>
                          </button>
                        ))}
                        {dayAppointments.map((appointment) => (
                          <button type="button" className={'gcal-list-item' + (appointment.bookingKind === 'encaixe' ? ' is-fit-in' : '') + (selectedId === appointment.id ? ' is-selected' : '')} onClick={() => {
                            setSelectedBlockId(null);
                            setSelectedId(appointment.id);
                          }} key={appointment.id}>
                            <time><strong>{formatTime(appointment.startAt)}</strong><span>{formatTime(appointment.endAt)}</span></time>
                            <i className={'event-' + appointment.status} />
                            <span className="gcal-list-main"><strong>{appointment.clientName}</strong><small>{appointment.serviceName}</small></span>
                            <span className="gcal-list-modality">{appointment.modality === 'online' ? <Monitor size={14} /> : <MapPin size={14} />}{appointment.modality}</span>
                            <span className={'badge ' + STATUS_COLORS[appointment.status]}>{appointment.bookingKind === 'encaixe' ? 'Encaixe' : STATUS_LABELS[appointment.status]}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
                {!loading && listDates.length === 0 && <div className="gcal-empty"><CalendarDays size={22} /> Nenhum atendimento ou bloqueio em {formatMonthYear(anchorDate)}.</div>}
              </div>
            )}
          </div>
        </main>
      </div>

      {compactSidebar && (
        <>
          <button
            type="button"
            className="gcal-mobile-fab"
            onClick={() => setMobileFabMenuOpen((v) => !v)}
            aria-label="Ações rápidas da agenda"
            title="Ações rápidas da agenda"
          >
            {mobileFabMenuOpen ? <X size={24} /> : <Plus size={26} strokeWidth={2.4} />}
          </button>

          {mobileFabMenuOpen && (
            <div
              className="modal-layer"
              onClick={() => setMobileFabMenuOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.45)',
                backdropFilter: 'blur(3px)',
                zIndex: 1040,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                padding: '16px',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  maxWidth: '380px',
                  background: '#ffffff',
                  borderRadius: '20px',
                  border: '2px solid #64748b',
                  boxShadow: '0 20px 50px rgba(15,23,42,0.3)',
                  padding: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  marginBottom: '65px',
                }}
              >
                <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                  Ações Rápidas na Agenda
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setMobileFabMenuOpen(false);
                    openDefaultQuickAppointment();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Calendar size={18} style={{ color: '#21577a' }} />
                  <div>
                    <strong style={{ display: 'block' }}>Novo Agendamento</strong>
                    <small style={{ color: '#64748b', fontWeight: 500 }}>Marcar cliente na agenda</small>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileFabMenuOpen(false);
                    openDefaultQuickAppointment('encaixe');
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Sparkles size={18} style={{ color: '#d97706' }} />
                  <div>
                    <strong style={{ display: 'block' }}>Criar Encaixe</strong>
                    <small style={{ color: '#64748b', fontWeight: 500 }}>Agendamento com motivo registrado</small>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMobileFabMenuOpen(false);
                    setTimeBlockOpen(true);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '11px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #fecaca',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <CalendarOff size={18} style={{ color: '#dc2626' }} />
                  <div>
                    <strong style={{ display: 'block' }}>Bloquear Horário / Folga</strong>
                    <small style={{ color: '#ef4444', fontWeight: 500 }}>Almoço, compromisso, folga ou feriado</small>
                  </div>
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {calendarModalOpen && (
        <div
          className="gcal-calendar-modal-backdrop"
          onClick={() => setCalendarModalOpen(false)}
          role="presentation"
        >
          <div
            className="gcal-calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Selecionar data na agenda"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="gcal-calendar-modal-head">
              <div>
                <span className="gcal-calendar-modal-eyebrow">Navegação rápida</span>
                <h3>{formatFullDate(anchorDate)}</h3>
              </div>
              <button
                type="button"
                className="gcal-calendar-modal-close"
                onClick={() => setCalendarModalOpen(false)}
                aria-label="Fechar calendário"
              >
                <X size={18} />
              </button>
            </div>

            <div className="gcal-calendar-quick-step">
              <button
                type="button"
                className="gcal-calendar-step-btn"
                onClick={() => {
                  const prev = shiftDate(anchorDate, -1);
                  selectDate(prev);
                  setPickerMonthDate(prev);
                  setCalendarModalOpen(false);
                }}
              >
                <ChevronLeft size={16} />
                <span>Dia anterior</span>
              </button>
              <button
                type="button"
                className={'gcal-calendar-step-btn is-today' + (anchorDate === initialDate ? ' is-active' : '')}
                onClick={() => {
                  selectDate(initialDate);
                  setPickerMonthDate(initialDate);
                  setCalendarModalOpen(false);
                }}
              >
                <span>Hoje ({Number(initialDate.slice(-2))}/{initialDate.slice(5, 7)})</span>
              </button>
              <button
                type="button"
                className="gcal-calendar-step-btn"
                onClick={() => {
                  const next = shiftDate(anchorDate, 1);
                  selectDate(next);
                  setPickerMonthDate(next);
                  setCalendarModalOpen(false);
                }}
              >
                <span>Próximo dia</span>
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="gcal-calendar-modal-monthbar">
              <button
                type="button"
                onClick={() => setPickerMonthDate((current) => shiftMonth(current, -1))}
                aria-label="Mês anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <strong>{formatMonthYear(pickerMonthDate)}</strong>
              <button
                type="button"
                onClick={() => setPickerMonthDate((current) => shiftMonth(current, 1))}
                aria-label="Próximo mês"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="gcal-calendar-modal-weekdays">
              {MINI_WEEK_DAYS.map((day, index) => (
                <span key={day + index}>{day}</span>
              ))}
            </div>

            <div className="gcal-calendar-modal-grid">
              {pickerGridDates.map((date) => {
                const isOutside = date.slice(0, 7) !== pickerMonthDate.slice(0, 7);
                const isToday = date === initialDate;
                const isSelected = date === anchorDate;
                const hasEvents = (appointmentsByDate.get(date)?.length ?? 0) > 0;
                return (
                  <button
                    type="button"
                    key={date}
                    className={
                      'gcal-calendar-modal-day'
                      + (isOutside ? ' is-outside' : '')
                      + (isToday ? ' is-today' : '')
                      + (isSelected ? ' is-selected' : '')
                    }
                    onClick={() => {
                      selectDate(date);
                      setCalendarModalOpen(false);
                    }}
                    aria-label={formatFullDate(date)}
                  >
                    <span>{Number(date.slice(-2))}</span>
                    {hasEvents && <i className="gcal-calendar-day-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {compactSidebar && (selectedAppointment || selectedBlock) && (
        <button
          type="button"
          className="gcal-popover-backdrop"
          onClick={() => {
            setSelectedId(null);
            setSelectedBlockId(null);
          }}
          aria-label="Fechar detalhes"
        />
      )}

      {selectedAppointment && (
        <aside className="gcal-event-popover" aria-label="Detalhes do atendimento">
          <div className="gcal-popover-heading">
            <span className={'gcal-popover-color event-' + selectedAppointment.status} />
            <button type="button" className="gcal-icon-button" onClick={() => setSelectedId(null)} aria-label="Fechar detalhes"><X size={19} /></button>
          </div>
          <h2>{selectedAppointment.clientName}</h2>
          <p className="gcal-popover-client" style={{ fontSize: '0.94rem', fontWeight: 600, color: '#334155', marginTop: '2px' }}>
            {selectedAppointment.serviceName}
          </p>

          {/* 🎟️ Indicador Visual de Saldo de Pacotes no Cliente */}
          <div
            style={{
              margin: '8px 0',
              padding: '7px 10px',
              borderRadius: '10px',
              background: selectedAppointment.packageSummary ? '#ecfdf5' : '#f8fafc',
              border: selectedAppointment.packageSummary ? '1.5px solid #a7f3d0' : '1px solid #cbd5e1',
              fontSize: '0.78rem',
            }}
          >
            {selectedAppointment.packageSummary ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                  <strong style={{ color: '#047857' }}>
                    🎟️ Sessão {selectedAppointment.sessionNumber || selectedAppointment.packageSummary.usedSessions} de {selectedAppointment.packageSummary.totalSessions}
                  </strong>
                  <span
                    style={{
                      fontWeight: 800,
                      color:
                        selectedAppointment.packageSummary.totalSessions -
                          (selectedAppointment.sessionNumber || selectedAppointment.packageSummary.usedSessions) <=
                        0
                          ? '#b45309'
                          : '#047857',
                      fontSize: '0.72rem',
                    }}
                  >
                    {selectedAppointment.packageSummary.totalSessions -
                      (selectedAppointment.sessionNumber || selectedAppointment.packageSummary.usedSessions) <=
                    0
                      ? '✨ Pacote Concluído'
                      : `Restam ${Math.max(
                          0,
                          selectedAppointment.packageSummary.totalSessions -
                            (selectedAppointment.sessionNumber || selectedAppointment.packageSummary.usedSessions)
                        )} pagas`}
                  </span>
                </div>
                {selectedAppointment.packageSummary.totalSessions -
                  (selectedAppointment.sessionNumber || selectedAppointment.packageSummary.usedSessions) <=
                  0 && (
                  <span style={{ display: 'block', fontSize: '0.7rem', color: '#b45309', fontWeight: 600, marginTop: '2px' }}>
                    Sugerir nova fase ou manutenção terapêutica.
                  </span>
                )}
              </div>
            ) : (
              <span style={{ fontWeight: 600, color: '#475569' }}>
                💳 Consulta Avulsa (Sem pacote vinculado)
              </span>
            )}
          </div>

          {/* ⚠️ Alerta de Inadimplência do Cliente na Agenda */}
          {selectedAppointment.clientIsInadimplente && (
            <div
              style={{
                margin: '8px 0',
                padding: '8px 10px',
                borderRadius: '10px',
                background: '#fef2f2',
                border: '1.5px solid #fca5a5',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div>
                <strong style={{ color: '#991b1b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <AlertTriangle size={14} color="#dc2626" />
                  Cliente Inadimplente
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#b91c1c', display: 'block', marginTop: '2px' }}>
                  {formatCurrency(selectedAppointment.clientOverdueBalanceCents || 0)} em atraso
                  {selectedAppointment.clientDaysOverdue ? ` (${selectedAppointment.clientDaysOverdue}d de atraso)` : ''}
                </span>
              </div>
              {selectedAppointment.clientPhone && (
                <a
                  href={`https://wa.me/${selectedAppointment.clientPhone.replace(/\D/g, '').startsWith('55') ? selectedAppointment.clientPhone.replace(/\D/g, '') : `55${selectedAppointment.clientPhone.replace(/\D/g, '')}`}?text=${encodeURIComponent(
                    `Olá, ${selectedAppointment.clientName.split(' ')[0]}! 📄 Passando para lembrar do seu saldo em aberto de ${formatCurrency(selectedAppointment.clientOverdueBalanceCents || 0)} referente ao seu atendimento. Chave PIX: (48) 99691-5303 (Camila Machado). Qualquer dúvida, estou à disposição! ✨`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: '4px 9px',
                    borderRadius: '999px',
                    background: '#dc2626',
                    color: '#ffffff',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    flexShrink: 0,
                  }}
                >
                  Cobrar
                </a>
              )}
            </div>
          )}

          <div className="gcal-popover-meta">
            <span><Clock3 size={16} /> {formatCompactDate(eventDateKey(selectedAppointment.startAt))}, {formatTime(selectedAppointment.startAt)} – {formatTime(selectedAppointment.endAt)}</span>
            <span>{selectedAppointment.modality === 'online' ? <Monitor size={16} /> : <MapPin size={16} />} {selectedAppointment.modality}</span>
            <span className={'badge ' + STATUS_COLORS[selectedAppointment.status]}>{STATUS_LABELS[selectedAppointment.status]}</span>
            {selectedAppointment.bookingKind === 'encaixe' && <span className="gcal-fit-in-detail"><Sparkles size={15} /> Encaixe: {selectedAppointment.fitInReason}</span>}
          </div>
          <div className="gcal-popover-actions">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setDocPrefill({
                  clientName: selectedAppointment.clientName,
                  date: eventDateKey(selectedAppointment.startAt),
                  startTime: formatTime(selectedAppointment.startAt),
                  endTime: formatTime(selectedAppointment.endAt),
                  serviceName: selectedAppointment.serviceName,
                });
                setDocModalOpen(true);
              }}
              title="Gerar Declaração de Comparecimento ou Recibo em PDF"
              style={{ gap: '4px' }}
            >
              <FileText size={14} /> Doc / Recibo
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={statusUpdatingId === selectedAppointment.id} onClick={() => openEditAppointment(selectedAppointment)}><PencilLine size={14} /> Editar</button>
            {selectedAppointment.status === 'solicitado' && (
              <button type="button" className="btn btn-primary btn-sm" disabled={statusUpdatingId === selectedAppointment.id} onClick={() => update(selectedAppointment.id, 'confirmado')}>
                {statusUpdatingId === selectedAppointment.id ? 'Confirmando…' : 'Confirmar'}
              </button>
            )}
            {selectedAppointment.status === 'confirmado' && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={statusUpdatingId === selectedAppointment.id} onClick={() => update(selectedAppointment.id, 'concluido')}>
                {statusUpdatingId === selectedAppointment.id ? 'Salvando…' : 'Concluir'}
              </button>
            )}
            {!['cancelado', 'concluido', 'nao_compareceu'].includes(selectedAppointment.status) && (
              <button type="button" className="btn btn-ghost btn-sm danger-text" disabled={statusUpdatingId === selectedAppointment.id} onClick={() => update(selectedAppointment.id, 'cancelado')}>
                Cancelar
              </button>
            )}
          </div>
        </aside>
      )}

      {selectedBlock && (
        <aside className="gcal-event-popover gcal-block-popover" aria-label="Detalhes do bloqueio">
          <div className="gcal-popover-heading">
            <span className="gcal-popover-color is-block" />
            <button type="button" className="gcal-icon-button" onClick={() => setSelectedBlockId(null)} aria-label="Fechar detalhes"><X size={19} /></button>
          </div>
          <h2>Período bloqueado</h2>
          <p className="gcal-popover-client">{selectedBlock.reason}</p>
          <div className="gcal-popover-meta">
            <span><LockKeyhole size={16} /> Fora da disponibilidade pública</span>
            <span><Clock3 size={16} /> {blockPeriodLabel(selectedBlock)}</span>
          </div>
          <div className="gcal-popover-actions">
            {canManageAgenda && <button type="button" className="btn btn-ghost btn-sm danger-text" onClick={() => void deleteTimeBlock(selectedBlock)}><Trash2 size={14} /> Remover bloqueio</button>}
          </div>
        </aside>
      )}

      {quickSlot && (
        <QuickAppointmentDialog
          key={quickSlot.date + quickSlot.time + quickSlot.bookingKind}
          slot={quickSlot}
          allowFitIn={canManageAgenda}
          onClose={closeQuickAppointment}
          onSaved={finishQuickAppointment}
          onConflict={refreshAfterConflict}
        />
      )}

      {editingAppointment && (
        <QuickAppointmentDialog
          key={'edit:' + editingAppointment.id + ':' + editingAppointment.updatedAt}
          appointment={editingAppointment}
          allowFitIn={canManageAgenda}
          onClose={closeAppointmentEdit}
          onSaved={finishAppointmentEdit}
          onConflict={refreshAfterConflict}
        />
      )}

      {canManageAgenda && settingsOpen && (
        <AgendaSettingsDialog onClose={closeSettings} onSaved={finishSettings} />
      )}

      {canManageAgenda && timeBlockOpen && (
        <TimeBlockDialog initialDate={anchorDate} onClose={closeTimeBlock} onSaved={finishTimeBlock} />
      )}

      <QuickDocumentsModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        prefill={docPrefill}
      />
      {dialogNode}
    </div>
  );
}
