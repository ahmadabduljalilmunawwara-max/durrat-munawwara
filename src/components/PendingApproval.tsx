import React, { useCallback, useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import {
  Check,
  Clock,
  Loader2,
  LogOut,
  Mail,
  MessageCircle,
  RefreshCw,
  Calendar,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { auth, db } from '../lib/firebase';
import type { UserRole } from '../App';

// رقم واتساب مدير النظام بصيغة دولية بدون علامة + (سهّل تغييره من هنا)
export const ADMIN_WHATSAPP = '966500000000';

const AUTO_CHECK_INTERVAL_MS = 30_000;
const RELATIVE_TICK_MS = 5_000;

export interface PendingApprovalUser {
  uid: string;
  displayName: string | null;
  email?: string | null;
  username?: string;
  role: UserRole;
  isCustom?: boolean;
  createdAt?: string;
}

interface PendingApprovalProps {
  user: PendingApprovalUser;
  onStatusUpdate: (newRole: UserRole, displayName?: string, createdAt?: string) => void;
  onLogout: () => void;
}

const parseTimestampToIso = (val: unknown): string | null => {
  if (!val) return null;
  if (typeof val === 'string') return val;
  if (
    typeof val === 'object' &&
    val !== null &&
    'toDate' in val &&
    typeof (val as { toDate: () => Date }).toDate === 'function'
  ) {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  return null;
};

const formatRegistrationDate = (isoOrDateStr: string | null): string => {
  if (!isoOrDateStr) return 'غير متوفر';
  const date = new Date(isoOrDateStr);
  if (Number.isNaN(date.getTime())) return 'غير متوفر';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const formatElapsedSince = (lastCheckedAt: Date | null, nowMs: number): string => {
  if (!lastCheckedAt) return 'الآن';
  const diffSeconds = Math.max(0, Math.floor((nowMs - lastCheckedAt.getTime()) / 1000));
  if (diffSeconds < 5) return 'الآن';
  if (diffSeconds < 60) return `منذ ${diffSeconds} ثانية`;
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    if (diffMinutes === 1) return 'منذ دقيقة واحدة';
    if (diffMinutes === 2) return 'منذ دقيقتين';
    if (diffMinutes <= 10) return `منذ ${diffMinutes} دقائق`;
    return `منذ ${diffMinutes} دقيقة`;
  }
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours === 1) return 'منذ ساعة واحدة';
  if (diffHours === 2) return 'منذ ساعتين';
  return `منذ ${diffHours} ساعات`;
};

export const PendingApproval: React.FC<PendingApprovalProps> = ({
  user,
  onStatusUpdate,
  onLogout,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(() => new Date());
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [registeredAt, setRegisteredAt] = useState<string | null>(
    () => user.createdAt || auth.currentUser?.metadata?.creationTime || null
  );

  const isCheckingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const displayUserName =
    user.displayName?.trim() && user.displayName.trim() !== 'Google User'
      ? user.displayName.trim()
      : user.username || 'مستخدم النظام';

  const contactLabel = user.email ? 'البريد الإلكتروني' : 'اسم المستخدم';
  const contactValue = user.email || user.username || '—';

  const whatsappMessage = `السلام عليكم، أنا ${displayUserName} سجّلت في نظام درة المنورة وأرجو اعتماد حسابي`;
  const whatsappUrl = `https://wa.me/${ADMIN_WHATSAPP}?text=${encodeURIComponent(whatsappMessage)}`;

  const userDocId = user.isCustom
    ? (user.username || user.uid.replace(/^custom_/, '')).toLowerCase().trim()
    : user.uid;

  const checkAccountStatus = useCallback(async () => {
    if (!userDocId || isCheckingRef.current) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (isMountedRef.current) {
        setErrorMsg('تعذّر التحقق، سنعيد المحاولة');
      }
      return;
    }

    isCheckingRef.current = true;
    if (isMountedRef.current) {
      setIsChecking(true);
      setErrorMsg(null);
    }

    try {
      const userRef = doc(db, 'app_users', userDocId);
      const snap = await getDoc(userRef);

      if (!isMountedRef.current) return;

      const now = new Date();
      setLastCheckedAt(now);
      setNowTick(now.getTime());

      if (snap.exists()) {
        const data = snap.data();
        const fetchedCreatedAt =
          parseTimestampToIso(data.createdAt) ||
          parseTimestampToIso(data.updatedAt) ||
          auth.currentUser?.metadata?.creationTime ||
          null;

        if (fetchedCreatedAt) {
          setRegisteredAt(fetchedCreatedAt);
        }

        const nextRole = data.role as UserRole | undefined;
        const nextDisplayName =
          typeof data.displayName === 'string' && data.displayName.trim()
            ? data.displayName.trim()
            : undefined;

        if (nextRole && nextRole !== user.role) {
          onStatusUpdate(nextRole, nextDisplayName, fetchedCreatedAt || undefined);
        }
      }
    } catch {
      if (isMountedRef.current) {
        setErrorMsg('تعذّر التحقق، سنعيد المحاولة');
      }
    } finally {
      isCheckingRef.current = false;
      if (isMountedRef.current) {
        setIsChecking(false);
      }
    }
  }, [onStatusUpdate, user.role, userDocId]);

  // فحص تلقائي كل 30 ثانية مع إيقافه عند إخفاء التبويب وعند الخروج من الشاشة
  useEffect(() => {
    if (user.role !== 'pending') return;

    void checkAccountStatus();

    const pollInterval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void checkAccountStatus();
    }, AUTO_CHECK_INTERVAL_MS);

    const tickInterval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setNowTick(Date.now());
    }, RELATIVE_TICK_MS);

    return () => {
      window.clearInterval(pollInterval);
      window.clearInterval(tickInterval);
    };
  }, [checkAccountStatus, user.role]);

  // شاشة الحساب المرفوض (بناءً على حقل role === 'rejected')
  if (user.role === 'rejected') {
    return (
      <section
        dir="rtl"
        aria-live="polite"
        className="bg-[var(--surface)] rounded-3xl p-[var(--space-6)] sm:p-[var(--space-8)] border border-[var(--border)] shadow-xs max-w-lg mx-auto text-center"
      >
        <div className="w-16 h-16 rounded-2xl bg-red-50 dark:bg-red-950/60 border border-red-200/80 dark:border-red-900 flex items-center justify-center text-[var(--danger)] mx-auto mb-[var(--space-5)]">
          <XCircle size={32} />
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text)] mb-[var(--space-3)]">
          لم يتم اعتماد حسابك
        </h2>
        <p className="text-sm sm:text-base font-semibold text-[var(--text-secondary)] leading-relaxed mb-[var(--space-6)]">
          لم يتم اعتماد حسابك. يرجى التواصل مع مدير النظام
        </p>

        <div className="flex flex-col gap-[var(--space-3)]">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[46px] inline-flex items-center justify-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors shadow-2xs"
          >
            <MessageCircle size={18} className="shrink-0" />
            <span>تواصل مع المدير عبر واتساب</span>
          </a>

          <button
            type="button"
            onClick={onLogout}
            className="mt-[var(--space-2)] inline-flex items-center justify-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors cursor-pointer py-[var(--space-2)]"
          >
            <LogOut size={14} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      className="bg-[var(--surface)] rounded-3xl p-[var(--space-5)] sm:p-[var(--space-8)] border border-[var(--border)] shadow-xs max-w-2xl mx-auto"
    >
      {/* الرأس والأيقونة */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800/80 flex items-center justify-center text-[var(--primary)] mx-auto mb-[var(--space-5)]">
          <Clock size={32} className="animate-pulse" />
        </div>

        <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text)] mb-[var(--space-2)]">
          حسابك قيد المراجعة
        </h2>
        <p className="text-sm text-[var(--text-secondary)] font-semibold max-w-md mx-auto leading-relaxed">
          تم إنشاء حسابك بنجاح، وهو بانتظار اعتماد مدير النظام لتفعيله وتحديد صلاحياتك.
        </p>
      </div>

      {/* شريط الخطوات */}
      <div
        aria-label="مراحل تفعيل الحساب"
        className="mt-[var(--space-6)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl p-[var(--space-3)] sm:p-[var(--space-4)]"
      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-[var(--space-2)] text-xs font-bold">
          {/* المرحلة 1 */}
          <div className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 text-[var(--success)]">
            <span className="w-5 h-5 rounded-lg bg-[var(--success)] text-white flex items-center justify-center shrink-0">
              <Check size={13} strokeWidth={3} />
            </span>
            <span>تم التسجيل ✓</span>
          </div>

          <span aria-hidden="true" className="hidden sm:inline text-[var(--text-muted)] font-extrabold">
            ←
          </span>

          {/* المرحلة 2 (الحالية) */}
          <div className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-[var(--primary)] text-[var(--primary)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--primary)] animate-pulse shrink-0" />
            <span>بانتظار الاعتماد (الحالية)</span>
          </div>

          <span aria-hidden="true" className="hidden sm:inline text-[var(--text-muted)] font-extrabold">
            ←
          </span>

          {/* المرحلة 3 */}
          <div className="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)]">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--border)] shrink-0" />
            <span>جاهز للعمل</span>
          </div>
        </div>
      </div>

      {/* بطاقة بيانات الحساب المسجّل */}
      <div className="mt-[var(--space-5)] grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl p-[var(--space-4)]">
        <div className="flex items-start gap-[var(--space-2)] min-w-0">
          <UserIcon size={16} className="text-[var(--primary)] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">اسم المستخدم</p>
            <p className="text-xs sm:text-sm font-extrabold text-[var(--text)] truncate">
              {displayUserName}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-[var(--space-2)] min-w-0">
          <Mail size={16} className="text-[var(--primary)] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">{contactLabel}</p>
            <p
              dir="ltr"
              className="text-xs sm:text-sm font-bold text-[var(--text)] truncate text-right"
            >
              {contactValue}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-[var(--space-2)] min-w-0">
          <Calendar size={16} className="text-[var(--primary)] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-[var(--text-muted)]">تاريخ التسجيل</p>
            <p className="text-xs sm:text-sm font-extrabold text-[var(--text)] tabular-nums">
              {formatRegistrationDate(registeredAt)}
            </p>
          </div>
        </div>
      </div>

      {/* فقرة ماذا بعد؟ */}
      <div className="mt-[var(--space-5)] bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-800/70 border-r-4 border-r-[var(--primary)] rounded-2xl p-[var(--space-4)] text-right">
        <h3 className="text-xs font-extrabold text-[var(--primary)] mb-[var(--space-1)]">
          ماذا بعد؟
        </h3>
        <p className="text-xs sm:text-sm font-medium text-[var(--text-secondary)] leading-relaxed">
          سيتم تحويلك تلقائيًا فور اعتماد حسابك. يمكنك التواصل مع المدير{' '}
          <strong className="font-extrabold text-[var(--text)]">عبد الحميد سالمة</strong> لتسريع
          الاعتماد.
        </p>
      </div>

      {/* أزرار الإجراءات وحالة التحديث */}
      <div className="mt-[var(--space-6)] flex flex-col gap-[var(--space-3)]">
        <button
          type="button"
          onClick={() => void checkAccountStatus()}
          disabled={isChecking}
          className="w-full min-h-[46px] inline-flex items-center justify-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] rounded-xl bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] disabled:opacity-70 text-white text-sm font-bold transition-colors cursor-pointer shadow-2xs"
        >
          {isChecking ? (
            <Loader2 size={18} className="animate-spin shrink-0" />
          ) : (
            <RefreshCw size={17} className="shrink-0" />
          )}
          <span>{isChecking ? 'جاري التحقق من الحالة...' : 'تحديث الحالة'}</span>
        </button>

        {/* منطقة الإعلان الحي لحالة الفحص */}
        <div aria-live="polite" className="text-center space-y-[var(--space-1)]">
          <p className="text-xs font-semibold text-[var(--text-muted)] tabular-nums">
            آخر تحقق: {formatElapsedSince(lastCheckedAt, nowTick)}
          </p>
          {errorMsg && (
            <p className="text-xs font-bold text-[var(--warning)]">{errorMsg}</p>
          )}
        </div>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full min-h-[46px] inline-flex items-center justify-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] rounded-xl bg-[var(--surface-subtle)] hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-[var(--border)] hover:border-emerald-300 dark:hover:border-emerald-700 text-[var(--text)] hover:text-emerald-700 dark:hover:text-emerald-300 text-sm font-bold transition-colors"
        >
          <MessageCircle size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>تواصل مع المدير عبر واتساب</span>
        </a>

        <div className="pt-[var(--space-2)] text-center">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center justify-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors cursor-pointer py-[var(--space-1)] px-[var(--space-3)]"
          >
            <LogOut size={14} />
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </div>
    </section>
  );
};
