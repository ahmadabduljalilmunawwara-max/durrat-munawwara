import React, { useState, useEffect, useMemo } from 'react';
import { format } from 'date-fns';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
} from 'firebase/firestore';
import {
  Save,
  Settings,
  Printer,
  ImageIcon,
  Loader2,
  Download,
  Upload,
  Database,
  Check,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Lock,
  Edit3,
  RotateCcw,
  Eye,
  History,
  X,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal,
  Shield,
  Calendar,
  Building2,
  MessageSquareText,
  Clock,
} from 'lucide-react';
import { CompanyLogo } from './CompanyLogo';
import { useAuth } from '../App';
import { generateVoucherPDF } from '../lib/pdfGenerator';
import { resolveNewVoucherIssuerName } from '../lib/issuerName';
import {
  computePrintLayoutMetrics,
  DEFAULT_ACTIVE_SEASON,
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_PHONE,
  DEFAULT_COMPANY_WEBSITE,
  DEFAULT_HIJRI_OFFSET_DAYS,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  DEFAULT_PDF_MARGINS,
  DEFAULT_PRINT_COPY_LABELS,
  DEFAULT_SLOGAN_HEIGHT_MM,
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_WELCOME_TITLE,
  formatHijriLongWithOffset,
  formatWelcomeTextWithName,
  MAX_HIJRI_OFFSET_DAYS,
  MAX_IDLE_TIMEOUT_MINUTES,
  MAX_MARGIN_MM,
  MAX_PRINT_COPIES,
  MAX_SLOGAN_HEIGHT_MM,
  MIN_HIJRI_OFFSET_DAYS,
  MIN_IDLE_TIMEOUT_MINUTES,
  MIN_MARGIN_MM,
  MIN_PRINT_COPIES,
  MIN_SLOGAN_HEIGHT_MM,
  normalizeActiveSeason,
  normalizeHijriOffsetDays,
  normalizeIdleTimeoutMinutes,
  normalizePdfMargins,
  normalizePrintCopies,
  normalizePrintCopyLabels,
  normalizeSloganHeightMm,
  PdfMargins,
  WELCOME_MESSAGE_MAX_LENGTH,
} from '../lib/printSettings';
import {
  addAuditLogToTransaction,
  buildSettingsAuditChanges,
  createAuditLogEntry,
  SettingsSnapshotForAudit,
} from '../lib/auditLog';
import {
  analyzeDataUrlTransparency,
  validateAndProcessBrandingImage,
} from '../lib/logoUpload';
import {
  BackupPreviewReport,
  executeBackupRestore,
  exportSystemBackup,
  parseAndValidateBackupFile,
  ParsedBackupPayload,
  previewBackupRestore,
  RestoreExecutionResult,
  RestoreProgressState,
} from '../lib/backupService';

type SettingsTabId = 'general' | 'printing' | 'branding' | 'backup' | 'security';

const SETTINGS_TABS: Array<{ id: SettingsTabId; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'عام', icon: <SlidersHorizontal size={15} /> },
  { id: 'printing', label: 'الطباعة', icon: <Printer size={15} /> },
  { id: 'branding', label: 'الشعارات', icon: <ImageIcon size={15} /> },
  { id: 'backup', label: 'النسخ الاحتياطي', icon: <Database size={15} /> },
  { id: 'security', label: 'الأمان', icon: <Shield size={15} /> },
];

interface AuditEntryView {
  id: string;
  action: string;
  summary: string;
  reason?: string;
  performedByName?: string;
  createdAt?: any;
  changes?: Array<{
    field: string;
    label: string;
    previousValue: string;
    newValue: string;
  }>;
}

function formatAuditTimestamp(val: any): string {
  if (!val) return '—';
  try {
    if (typeof val?.toDate === 'function') {
      return format(val.toDate(), 'yyyy-MM-dd HH:mm');
    }
    if (typeof val === 'string') {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return format(d, 'yyyy-MM-dd HH:mm');
    }
  } catch {
    // ignore formatting error
  }
  return '—';
}

function buildDefaultSnapshot(): SettingsSnapshotForAudit {
  return {
    activeSeason: DEFAULT_ACTIVE_SEASON,
    hijriOffsetDays: DEFAULT_HIJRI_OFFSET_DAYS,
    companyAddress: DEFAULT_COMPANY_ADDRESS,
    companyWebsite: DEFAULT_COMPANY_WEBSITE,
    companyPhone: DEFAULT_COMPANY_PHONE,
    welcomeTitle: DEFAULT_WELCOME_TITLE,
    welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    welcomeEnabled: true,
    welcomeExpiresAt: '',
    printCopies: 1,
    printCopyLabels: [...DEFAULT_PRINT_COPY_LABELS],
    pdfMargins: { ...DEFAULT_PDF_MARGINS },
    sloganHeightMm: DEFAULT_SLOGAN_HEIGHT_MM,
    logoUrl: '',
    sloganUrl: '',
    idleTimeoutMinutes: DEFAULT_IDLE_TIMEOUT_MINUTES,
  };
}

export function AppSettings({ onDirtyChange }: { onDirtyChange?: (isDirty: boolean) => void }) {
  const { user: sessionUser } = useAuth();
  const isGeneralManager = sessionUser?.role === 'general_manager';

  const actorUid = auth.currentUser?.uid || sessionUser?.uid || '';
  const actorName =
    sessionUser?.displayName?.trim() ||
    sessionUser?.username?.trim() ||
    auth.currentUser?.displayName?.trim() ||
    'المدير العام';
  const actorRole = sessionUser?.role || 'general_manager';
  const previewUserDisplayName = resolveNewVoucherIssuerName(sessionUser) || actorName;

  const [activeSubTab, setActiveSubTab] = useState<SettingsTabId>('general');

  // Counter & Fallback state
  const [counterLast, setCounterLast] = useState<number | null>(null);
  const [maxVoucherInDb, setMaxVoucherInDb] = useState<number>(0);
  const [nextVoucherFallback, setNextVoucherFallback] = useState<number>(1001);

  // Tab 1: General
  const [activeSeason, setActiveSeason] = useState<string>(DEFAULT_ACTIVE_SEASON);
  const [hijriOffsetDays, setHijriOffsetDays] = useState<number>(DEFAULT_HIJRI_OFFSET_DAYS);
  const [companyAddress, setCompanyAddress] = useState<string>(DEFAULT_COMPANY_ADDRESS);
  const [companyWebsite, setCompanyWebsite] = useState<string>(DEFAULT_COMPANY_WEBSITE);
  const [companyPhone, setCompanyPhone] = useState<string>(DEFAULT_COMPANY_PHONE);
  const [welcomeTitle, setWelcomeTitle] = useState<string>(DEFAULT_WELCOME_TITLE);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(DEFAULT_WELCOME_MESSAGE);
  const [welcomeEnabled, setWelcomeEnabled] = useState<boolean>(true);
  const [welcomeExpiresAt, setWelcomeExpiresAt] = useState<string>('');
  const [savedWelcomeVersion, setSavedWelcomeVersion] = useState<number>(1);

  // Tab 2: Printing
  const [printCopies, setPrintCopies] = useState<number>(1);
  const [printCopyLabels, setPrintCopyLabels] = useState<string[]>([...DEFAULT_PRINT_COPY_LABELS]);
  const [pdfMargins, setPdfMargins] = useState<PdfMargins>({ ...DEFAULT_PDF_MARGINS });

  // Tab 3: Branding
  const [logoUrl, setLogoUrl] = useState('');
  const [sloganUrl, setSloganUrl] = useState('');
  const [sloganHeightMm, setSloganHeightMm] = useState<number>(DEFAULT_SLOGAN_HEIGHT_MM);

  // Tab 4: Backup metadata
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [lastBackupByName, setLastBackupByName] = useState<string | null>(null);

  // Tab 5: Security
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(DEFAULT_IDLE_TIMEOUT_MINUTES);

  // Baseline saved snapshot for dirty calculation & discard
  const [savedSnapshot, setSavedSnapshot] = useState<SettingsSnapshotForAudit>(() =>
    buildDefaultSnapshot()
  );

  // Transparency warnings for logo & slogan
  const [logoHasTransparency, setLogoHasTransparency] = useState<boolean>(true);
  const [sloganHasTransparency, setSloganHasTransparency] = useState<boolean>(true);
  const [logoUploadError, setLogoUploadError] = useState<string>('');
  const [sloganUploadError, setSloganUploadError] = useState<string>('');
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);
  const [isProcessingSlogan, setIsProcessingSlogan] = useState(false);

  // Confirm reset branding modal
  const [resetBrandingTarget, setResetBrandingTarget] = useState<'logo' | 'slogan' | null>(null);

  // Save & Test Print states
  const [isSaving, setIsSaving] = useState(false);
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({
    type: null,
    msg: '',
  });

  // Counter Override Modal states
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [counterNewInput, setCounterNewInput] = useState('');
  const [counterReasonInput, setCounterReasonInput] = useState('');
  const [counterConfirmed, setCounterConfirmed] = useState(false);
  const [counterModalError, setCounterModalError] = useState('');
  const [isCheckingCounterMax, setIsCheckingCounterMax] = useState(false);
  const [isSavingCounter, setIsSavingCounter] = useState(false);

  // Backup Export & Import Wizard states
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({
    type: null,
    msg: '',
  });
  const [selectedBackupFileName, setSelectedBackupFileName] = useState<string>('');
  const [parsedBackup, setParsedBackup] = useState<ParsedBackupPayload | null>(null);
  const [parseError, setParseError] = useState<string>('');
  const [isPreviewingRestore, setIsPreviewingRestore] = useState(false);
  const [previewReport, setPreviewReport] = useState<BackupPreviewReport | null>(null);
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [includeUserRoles, setIncludeUserRoles] = useState<boolean>(false);
  const [restoreConfirmWord, setRestoreConfirmWord] = useState<string>('');
  const [isExecutingRestore, setIsExecutingRestore] = useState<boolean>(false);
  const [restoreProgress, setRestoreProgress] = useState<RestoreProgressState | null>(null);
  const [restoreResult, setRestoreResult] = useState<RestoreExecutionResult | null>(null);
  const [restoreExecError, setRestoreExecError] = useState<string>('');

  // Audit log view
  const [showAuditHistory, setShowAuditHistory] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AuditEntryView[]>([]);

  // Listeners for settings/app, counters/vouchers, and auditLog
  useEffect(() => {
    if (!isGeneralManager) return;

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'app'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const normSeason = normalizeActiveSeason(data.activeSeason);
          const normHijriOffset = normalizeHijriOffsetDays(data.hijriOffsetDays);
          const normCompanyAddr =
            typeof data.companyAddress === 'string' && data.companyAddress.trim()
              ? data.companyAddress.trim()
              : DEFAULT_COMPANY_ADDRESS;
          const normCompanyWeb =
            typeof data.companyWebsite === 'string' && data.companyWebsite.trim()
              ? data.companyWebsite.trim()
              : DEFAULT_COMPANY_WEBSITE;
          const normCompanyPhone =
            typeof data.companyPhone === 'string' ? data.companyPhone.trim() : DEFAULT_COMPANY_PHONE;
          const normWelcomeTitle =
            typeof data.welcomeTitle === 'string' && data.welcomeTitle.trim()
              ? data.welcomeTitle.trim().slice(0, 120)
              : DEFAULT_WELCOME_TITLE;
          const normWelcomeMsg =
            typeof data.welcomeMessage === 'string' && data.welcomeMessage.trim()
              ? data.welcomeMessage.slice(0, WELCOME_MESSAGE_MAX_LENGTH)
              : DEFAULT_WELCOME_MESSAGE;
          const normWelcomeEnabled =
            typeof data.welcomeEnabled === 'boolean' ? data.welcomeEnabled : true;
          const normWelcomeExpires =
            typeof data.welcomeExpiresAt === 'string' ? data.welcomeExpiresAt.trim() : '';
          const normWelcomeVersion =
            Number.isFinite(Number(data.welcomeVersion)) && Number(data.welcomeVersion) >= 1
              ? Math.trunc(Number(data.welcomeVersion))
              : 1;

          const normCopies = normalizePrintCopies(data.printCopies);
          const normCopyLabels = normalizePrintCopyLabels(data.printCopyLabels, MAX_PRINT_COPIES);
          const normMargins = normalizePdfMargins(data.pdfMargins);
          const normSloganH = normalizeSloganHeightMm(data.sloganHeightMm);
          const normLogo = typeof data.logoUrl === 'string' ? data.logoUrl : '';
          const normSlogan = typeof data.sloganUrl === 'string' ? data.sloganUrl : '';
          const normIdle = normalizeIdleTimeoutMinutes(data.idleTimeoutMinutes);

          setNextVoucherFallback(Number(data.nextVoucherNumber) || 1001);
          setActiveSeason(normSeason);
          setHijriOffsetDays(normHijriOffset);
          setCompanyAddress(normCompanyAddr);
          setCompanyWebsite(normCompanyWeb);
          setCompanyPhone(normCompanyPhone);
          setWelcomeTitle(normWelcomeTitle);
          setWelcomeMessage(normWelcomeMsg);
          setWelcomeEnabled(normWelcomeEnabled);
          setWelcomeExpiresAt(normWelcomeExpires);
          setSavedWelcomeVersion(normWelcomeVersion);

          setPrintCopies(normCopies);
          setPrintCopyLabels(normCopyLabels);
          setPdfMargins(normMargins);
          setSloganHeightMm(normSloganH);
          setLogoUrl(normLogo);
          setSloganUrl(normSlogan);
          setIdleTimeoutMinutes(normIdle);

          setLastBackupAt(typeof data.lastBackupAt === 'string' ? data.lastBackupAt : null);
          setLastBackupByName(typeof data.lastBackupByName === 'string' ? data.lastBackupByName : null);

          setSavedSnapshot({
            activeSeason: normSeason,
            hijriOffsetDays: normHijriOffset,
            companyAddress: normCompanyAddr,
            companyWebsite: normCompanyWeb,
            companyPhone: normCompanyPhone,
            welcomeTitle: normWelcomeTitle,
            welcomeMessage: normWelcomeMsg,
            welcomeEnabled: normWelcomeEnabled,
            welcomeExpiresAt: normWelcomeExpires,
            printCopies: normCopies,
            printCopyLabels: [...normCopyLabels],
            pdfMargins: { ...normMargins },
            sloganHeightMm: normSloganH,
            logoUrl: normLogo,
            sloganUrl: normSlogan,
            idleTimeoutMinutes: normIdle,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/app')
    );

    const unsubCounter = onSnapshot(
      doc(db, 'counters', 'vouchers'),
      (snap) => {
        if (snap.exists()) {
          const lastVal = Number(snap.data()?.last);
          setCounterLast(Number.isFinite(lastVal) ? Math.trunc(lastVal) : 0);
        } else {
          setCounterLast(null);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'counters/vouchers')
    );

    const unsubAudit = onSnapshot(
      query(collection(db, 'auditLog'), orderBy('createdAt', 'desc'), limit(15)),
      (snap) => {
        setAuditEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AuditEntryView)));
      },
      (err) => {
        console.warn('Audit log listener warning:', err);
      }
    );

    return () => {
      unsubSettings();
      unsubCounter();
      unsubAudit();
    };
  }, [isGeneralManager]);

  // Analyze transparency whenever custom logoUrl or sloganUrl changes
  useEffect(() => {
    let active = true;
    if (!logoUrl) {
      setLogoHasTransparency(true);
      return;
    }
    analyzeDataUrlTransparency(logoUrl).then((transparent) => {
      if (active) setLogoHasTransparency(transparent);
    });
    return () => {
      active = false;
    };
  }, [logoUrl]);

  useEffect(() => {
    let active = true;
    if (!sloganUrl) {
      setSloganHasTransparency(true);
      return;
    }
    analyzeDataUrlTransparency(sloganUrl).then((transparent) => {
      if (active) setSloganHasTransparency(transparent);
    });
    return () => {
      active = false;
    };
  }, [sloganUrl]);

  const layoutMetrics = useMemo(
    () => computePrintLayoutMetrics(pdfMargins, sloganHeightMm),
    [pdfMargins, sloganHeightMm]
  );

  const currentSnapshot: SettingsSnapshotForAudit = useMemo(
    () => ({
      activeSeason: normalizeActiveSeason(activeSeason),
      hijriOffsetDays: normalizeHijriOffsetDays(hijriOffsetDays),
      companyAddress: companyAddress.trim(),
      companyWebsite: companyWebsite.trim(),
      companyPhone: companyPhone.trim(),
      welcomeTitle: welcomeTitle.trim(),
      welcomeMessage: welcomeMessage.slice(0, WELCOME_MESSAGE_MAX_LENGTH),
      welcomeEnabled: Boolean(welcomeEnabled),
      welcomeExpiresAt: welcomeExpiresAt.trim(),
      printCopies: normalizePrintCopies(printCopies),
      printCopyLabels: normalizePrintCopyLabels(printCopyLabels, MAX_PRINT_COPIES),
      pdfMargins: { ...pdfMargins },
      sloganHeightMm: normalizeSloganHeightMm(sloganHeightMm),
      logoUrl,
      sloganUrl,
      idleTimeoutMinutes: normalizeIdleTimeoutMinutes(idleTimeoutMinutes),
    }),
    [
      activeSeason,
      hijriOffsetDays,
      companyAddress,
      companyWebsite,
      companyPhone,
      welcomeTitle,
      welcomeMessage,
      welcomeEnabled,
      welcomeExpiresAt,
      printCopies,
      printCopyLabels,
      pdfMargins,
      sloganHeightMm,
      logoUrl,
      sloganUrl,
      idleTimeoutMinutes,
    ]
  );

  const pendingChanges = useMemo(
    () => buildSettingsAuditChanges(savedSnapshot, currentSnapshot),
    [savedSnapshot, currentSnapshot]
  );

  const dirtyFieldsCount = pendingChanges.length;
  const isDirty = dirtyFieldsCount > 0;

  // Notify parent App shell & warn on browser close/refresh when dirty
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const displayedNextVoucherNumber =
    counterLast !== null ? counterLast + 1 : nextVoucherFallback;

  const adjustedHijriPreview = useMemo(
    () => formatHijriLongWithOffset(new Date(), hijriOffsetDays),
    [hijriOffsetDays]
  );

  if (!isGeneralManager) {
    return (
      <div
        dir="rtl"
        className="w-full max-w-2xl mx-auto mt-8 bg-[var(--surface)] border border-red-200 dark:border-red-900 rounded-3xl p-[var(--space-6)] text-center shadow-sm"
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-50 dark:bg-red-950/40 text-[var(--danger)] flex items-center justify-center">
          <Lock size={28} />
        </div>
        <h2 className="text-lg font-black text-[var(--text)]">صلاحية مقيدة</h2>
        <p className="text-sm font-semibold text-[var(--text-secondary)] mt-2">
          صفحة إعدادات التطبيق والنسخ الاحتياطي متاحة للمدير العام فقط.
        </p>
      </div>
    );
  }

  // Discard all unsaved edits back to savedSnapshot
  const handleDiscardChanges = () => {
    setActiveSeason(savedSnapshot.activeSeason);
    setHijriOffsetDays(savedSnapshot.hijriOffsetDays);
    setCompanyAddress(savedSnapshot.companyAddress);
    setCompanyWebsite(savedSnapshot.companyWebsite);
    setCompanyPhone(savedSnapshot.companyPhone);
    setWelcomeTitle(savedSnapshot.welcomeTitle);
    setWelcomeMessage(savedSnapshot.welcomeMessage);
    setWelcomeEnabled(savedSnapshot.welcomeEnabled);
    setWelcomeExpiresAt(savedSnapshot.welcomeExpiresAt);
    setPrintCopies(savedSnapshot.printCopies);
    setPrintCopyLabels([...savedSnapshot.printCopyLabels]);
    setPdfMargins({ ...savedSnapshot.pdfMargins });
    setSloganHeightMm(savedSnapshot.sloganHeightMm);
    setLogoUrl(savedSnapshot.logoUrl);
    setSloganUrl(savedSnapshot.sloganUrl);
    setIdleTimeoutMinutes(savedSnapshot.idleTimeoutMinutes);
    setLogoUploadError('');
    setSloganUploadError('');
    setStatus({ type: null, msg: '' });
  };

  // Open counter override modal and inspect actual max voucherNumber from vouchers
  const handleOpenCounterModal = async () => {
    setCounterModalError('');
    setCounterReasonInput('');
    setCounterConfirmed(false);
    setIsCounterModalOpen(true);
    setIsCheckingCounterMax(true);
    try {
      const vouchersSnap = await getDocs(collection(db, 'vouchers'));
      let maxNum = 0;
      vouchersSnap.forEach((d) => {
        const n = Number(d.data()?.voucherNumber);
        if (Number.isFinite(n) && n > maxNum) {
          maxNum = Math.trunc(n);
        }
      });
      setMaxVoucherInDb(maxNum);
      const suggested = Math.max(displayedNextVoucherNumber, maxNum + 1);
      setCounterNewInput(String(suggested));
    } catch (err: any) {
      setCounterModalError(err?.message || 'تعذر قراءة أعلى رقم سند حالي من قاعدة البيانات.');
    } finally {
      setIsCheckingCounterMax(false);
    }
  };

  const handleConfirmCounterOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    setCounterModalError('');

    const rawTrimmed = counterNewInput.trim();
    if (!/^\d+$/.test(rawTrimmed)) {
      setCounterModalError('يرجى إدخال رقم صحيح موجب فقط (أرقام إنجليزية بدون كسور أو حروف).');
      return;
    }

    const newNumber = Number(rawTrimmed);
    if (!Number.isSafeInteger(newNumber) || newNumber < 1) {
      setCounterModalError('يجب أن يكون رقم السند القادم رقماً صحيحاً أكبر من أو يساوي 1.');
      return;
    }

    const reasonTrimmed = counterReasonInput.trim();
    if (reasonTrimmed.length < 5) {
      setCounterModalError('يرجى كتابة سبب واضح للتعديل لا يقل عن 5 أحرف.');
      return;
    }

    if (!counterConfirmed) {
      setCounterModalError('يجب تأكيد الإقرار قبل تنفيذ التعديل.');
      return;
    }

    if (!actorUid) {
      setCounterModalError('تعذر التحقق من هوية المستخدم الحالي.');
      return;
    }

    setIsSavingCounter(true);
    try {
      const vouchersSnap = await getDocs(collection(db, 'vouchers'));
      let liveMax = 0;
      vouchersSnap.forEach((d) => {
        const n = Number(d.data()?.voucherNumber);
        if (Number.isFinite(n) && n > liveMax) {
          liveMax = Math.trunc(n);
        }
      });
      setMaxVoucherInDb(liveMax);

      if (newNumber <= liveMax) {
        setCounterModalError(
          `مرفوض: الرقم المدخل (${newNumber}) يجب أن يكون أكبر من أكبر رقم سند موجود فعلاً (${liveMax}).`
        );
        setIsSavingCounter(false);
        return;
      }

      const newLast = newNumber - 1;
      const counterRef = doc(db, 'counters', 'vouchers');
      const settingsRef = doc(db, 'settings', 'app');

      await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const prevLast = counterSnap.exists() ? Number(counterSnap.data()?.last) : null;
        const prevNext = prevLast !== null && Number.isFinite(prevLast) ? prevLast + 1 : nextVoucherFallback;

        transaction.set(counterRef, { last: newLast });
        transaction.set(
          settingsRef,
          {
            nextVoucherNumber: newNumber,
            updatedAt: new Date().toISOString(),
            updatedByUid: actorUid,
            updatedByName: actorName,
          },
          { merge: true }
        );

        addAuditLogToTransaction(transaction, {
          action: 'counter_override',
          targetPath: 'counters/vouchers',
          summary: `تعديل رقم السند القادم من ${prevNext} إلى ${newNumber}`,
          reason: reasonTrimmed,
          changes: [
            {
              field: 'counters/vouchers.last',
              label: 'رقم السند القادم',
              previousValue: String(prevNext),
              newValue: String(newNumber),
            },
          ],
          metadata: {
            maxExistingVoucherNumber: liveMax,
            newCounterLast: newLast,
          },
          performedByUid: actorUid,
          performedByName: actorName,
          performedByRole: actorRole,
        });
      });

      setStatus({
        type: 'success',
        msg: `تم تحديث رقم السند القادم إلى ${newNumber} وتسجيل التعديل في سجل التدقيق.`,
      });
      setIsCounterModalOpen(false);
    } catch (err: any) {
      console.error('Counter override error:', err);
      setCounterModalError(err?.message || 'فشل تعديل رقم السند القادم.');
    } finally {
      setIsSavingCounter(false);
    }
  };

  // Margin field change helper
  const handleMarginInputChange = (side: keyof Omit<PdfMargins, 'unit'>, rawVal: string) => {
    const num = rawVal === '' ? 0 : Number(rawVal);
    if (Number.isNaN(num)) return;
    setPdfMargins((prev) => ({
      ...prev,
      [side]: Math.round(num * 10) / 10,
      unit: 'mm',
    }));
  };

  const handleResetMarginsDefault = () => {
    setPdfMargins({ ...DEFAULT_PDF_MARGINS });
  };

  const handleCopyLabelChange = (index: number, value: string) => {
    setPrintCopyLabels((prev) => {
      const next = [...prev];
      next[index] = value.slice(0, 40);
      return next;
    });
  };

  // Upload & validate main logo (PNG/JPG/WebP only, <=1MB, >=600px width)
  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setLogoUploadError('');
    setIsProcessingLogo(true);
    try {
      const processed = await validateAndProcessBrandingImage(file, { label: 'الشعار الرئيسي' });
      if (processed.dataUrl.length + sloganUrl.length > 850_000) {
        throw new Error(
          'إجمالي حجم الشعار الرئيسي وشعار العبارة يتجاوز السعة المسموحة للتخزين السحابي.'
        );
      }
      setLogoUrl(processed.dataUrl);
      setLogoHasTransparency(processed.hasTransparency);
    } catch (err: any) {
      setLogoUploadError(err?.message || 'تعذر معالجة صورة الشعار.');
    } finally {
      setIsProcessingLogo(false);
    }
  };

  // Upload & validate slogan image (PNG/JPG/WebP only, <=1MB, >=600px width)
  const handleSloganFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSloganUploadError('');
    setIsProcessingSlogan(true);
    try {
      const processed = await validateAndProcessBrandingImage(file, {
        label: 'شعار خدمة الحاج شرف لنا',
      });
      if (logoUrl.length + processed.dataUrl.length > 850_000) {
        throw new Error(
          'إجمالي حجم الشعار الرئيسي وشعار العبارة يتجاوز السعة المسموحة للتخزين السحابي.'
        );
      }
      setSloganUrl(processed.dataUrl);
      setSloganHasTransparency(processed.hasTransparency);
    } catch (err: any) {
      setSloganUploadError(err?.message || 'تعذر معالجة صورة الشعار.');
    } finally {
      setIsProcessingSlogan(false);
    }
  };

  const handleConfirmResetBranding = () => {
    if (resetBrandingTarget === 'logo') {
      setLogoUrl('');
      setLogoUploadError('');
      setLogoHasTransparency(true);
    } else if (resetBrandingTarget === 'slogan') {
      setSloganUrl('');
      setSloganUploadError('');
      setSloganHasTransparency(true);
    }
    setResetBrandingTarget(null);
  };

  // Save General/Printing/Branding/Security Settings (without overwriting nextVoucherNumber counter)
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStatus({ type: null, msg: '' });

    if (!layoutMetrics.isValid) {
      setStatus({
        type: 'error',
        msg: layoutMetrics.errorMessage || 'قيم الهوامش غير صالحة لطباعة السند في صفحة A4 واحدة.',
      });
      return;
    }

    if (welcomeMessage.length > WELCOME_MESSAGE_MAX_LENGTH) {
      setStatus({
        type: 'error',
        msg: `نص رسالة الترحيب يجب ألا يتجاوز ${WELCOME_MESSAGE_MAX_LENGTH} حرفاً.`,
      });
      return;
    }

    if (logoUrl && !logoUrl.startsWith('data:image/')) {
      setStatus({ type: 'error', msg: 'يُسمح فقط برفع الشعار كملف صورة من الجهاز (بدون روابط خارجية).' });
      return;
    }
    if (sloganUrl && !sloganUrl.startsWith('data:image/')) {
      setStatus({ type: 'error', msg: 'يُسمح فقط برفع شعار العبارة كملف صورة من الجهاز (بدون روابط خارجية).' });
      return;
    }
    if (logoUrl.length + sloganUrl.length > 860_000) {
      setStatus({
        type: 'error',
        msg: 'حجم الصور المرفوعة معاً كبير جداً للتخزين في مستند واحد. يُرجى استخدام صور أصغر.',
      });
      return;
    }

    const cleanSeason = normalizeActiveSeason(activeSeason);
    const cleanHijriOffset = normalizeHijriOffsetDays(hijriOffsetDays);
    const cleanCompanyAddress = (companyAddress.trim() || DEFAULT_COMPANY_ADDRESS).slice(0, 200);
    const cleanCompanyWebsite = (companyWebsite.trim() || DEFAULT_COMPANY_WEBSITE).slice(0, 120);
    const cleanCompanyPhone = companyPhone.trim().slice(0, 40);
    const cleanWelcomeTitle = (welcomeTitle.trim() || DEFAULT_WELCOME_TITLE).slice(0, 120);
    const cleanWelcomeMessage = welcomeMessage.slice(0, WELCOME_MESSAGE_MAX_LENGTH);
    const cleanWelcomeEnabled = Boolean(welcomeEnabled);
    const cleanWelcomeExpires = welcomeExpiresAt.trim().slice(0, 20);
    const welcomeTextChanged = cleanWelcomeMessage !== savedSnapshot.welcomeMessage;
    const nextWelcomeVersion = welcomeTextChanged ? savedWelcomeVersion + 1 : savedWelcomeVersion;

    const cleanCopies = normalizePrintCopies(printCopies);
    const cleanCopyLabels = normalizePrintCopyLabels(printCopyLabels, MAX_PRINT_COPIES);
    const cleanSloganH = normalizeSloganHeightMm(sloganHeightMm);
    const cleanMargins = normalizePdfMargins({ ...pdfMargins, unit: 'mm' });
    const cleanIdleTimeout = normalizeIdleTimeoutMinutes(idleTimeoutMinutes);

    const nextSnapshot: SettingsSnapshotForAudit = {
      activeSeason: cleanSeason,
      hijriOffsetDays: cleanHijriOffset,
      companyAddress: cleanCompanyAddress,
      companyWebsite: cleanCompanyWebsite,
      companyPhone: cleanCompanyPhone,
      welcomeTitle: cleanWelcomeTitle,
      welcomeMessage: cleanWelcomeMessage,
      welcomeEnabled: cleanWelcomeEnabled,
      welcomeExpiresAt: cleanWelcomeExpires,
      printCopies: cleanCopies,
      printCopyLabels: cleanCopyLabels,
      pdfMargins: cleanMargins,
      sloganHeightMm: cleanSloganH,
      logoUrl,
      sloganUrl,
      idleTimeoutMinutes: cleanIdleTimeout,
    };

    setIsSaving(true);
    try {
      const changes = buildSettingsAuditChanges(savedSnapshot, nextSnapshot);

      await setDoc(
        doc(db, 'settings', 'app'),
        {
          activeSeason: cleanSeason,
          activeSeasonName: `موسم حج ${cleanSeason} هـ`,
          hijriOffsetDays: cleanHijriOffset,
          companyAddress: cleanCompanyAddress,
          companyWebsite: cleanCompanyWebsite,
          companyPhone: cleanCompanyPhone,
          welcomeTitle: cleanWelcomeTitle,
          welcomeMessage: cleanWelcomeMessage,
          welcomeEnabled: cleanWelcomeEnabled,
          welcomeExpiresAt: cleanWelcomeExpires,
          welcomeVersion: nextWelcomeVersion,
          printCopies: cleanCopies,
          printCopyLabels: cleanCopyLabels,
          pdfMargins: cleanMargins,
          sloganHeightMm: cleanSloganH,
          logoUrl,
          sloganUrl,
          idleTimeoutMinutes: cleanIdleTimeout,
          updatedAt: new Date().toISOString(),
          updatedByUid: actorUid,
          updatedByName: actorName,
        },
        { merge: true }
      );

      if (changes.length > 0 && actorUid) {
        await createAuditLogEntry({
          action: 'settings_update',
          targetPath: 'settings/app',
          summary: `تعديل إعدادات التطبيق (${changes.map((c) => c.label).join('، ')})`,
          changes,
          performedByUid: actorUid,
          performedByName: actorName,
          performedByRole: actorRole,
        });
      }

      setSavedWelcomeVersion(nextWelcomeVersion);
      setSavedSnapshot(nextSnapshot);
      setStatus({
        type: 'success',
        msg: welcomeTextChanged
          ? 'تم حفظ الإعدادات بنجاح وستظهر رسالة الترحيب المحدّثة لجميع المستخدمين.'
          : 'تم حفظ الإعدادات وتحديث سجل التدقيق بنجاح.',
      });
    } catch (error: any) {
      console.error(error);
      setStatus({
        type: 'error',
        msg: error?.message || 'حدث خطأ أثناء حفظ الإعدادات.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Print Test Voucher Page (1 A4 page using current margins, logo, slogan & company footer)
  const handlePrintTestPage = async () => {
    setStatus({ type: null, msg: '' });
    if (!layoutMetrics.isValid) {
      setStatus({
        type: 'error',
        msg: layoutMetrics.errorMessage || 'لا يمكن طباعة ورقة اختبار بقيم هوامش غير صالحة.',
      });
      return;
    }

    setIsTestPrinting(true);
    try {
      const todayIso = format(new Date(), 'yyyy-MM-dd');
      const cleanLabels = normalizePrintCopyLabels(printCopyLabels, MAX_PRINT_COPIES);
      const sampleVoucher = {
        voucherNumber: displayedNextVoucherNumber,
        customDate: todayIso,
        timestamp: new Date().toISOString(),
        receiverName: 'نموذج اختبار الطباعة والهوامش',
        receiverMobile: '0500000000',
        receiverId: '1000000000',
        delegateNumber: '101',
        organization: 'شركة خدمة ضيوف الرحمن (معاينة)',
        approvalNumber: '2026-TEST',
        busesQuantity: '3',
        ticketsCount: '135',
        directionFrom: 'مكة المكرمة',
        directionTo: 'المدينة المنورة',
        loadingLocation: 'محطة كدي للنقل',
        hotelName: 'فندق اختبار المعاينة',
        eventTime: '14:30',
        issuedByName: previewUserDisplayName,
        logoUrl,
        sloganUrl,
        sloganHeightMm: normalizeSloganHeightMm(sloganHeightMm),
        pdfMargins: normalizePdfMargins({ ...pdfMargins, unit: 'mm' }),
        hijriOffsetDays: normalizeHijriOffsetDays(hijriOffsetDays),
        printCopies: 1,
        printCopyLabels: cleanLabels,
        companyAddress: companyAddress.trim() || DEFAULT_COMPANY_ADDRESS,
        companyWebsite: companyWebsite.trim() || DEFAULT_COMPANY_WEBSITE,
        companyPhone: companyPhone.trim(),
        buses: [
          { busNumber: '101', driverName: 'سائق تجريبي 1', busType: 'حافلة VIP', driverPhone: '0550000001' },
          { busNumber: '102', driverName: 'سائق تجريبي 2', busType: 'حافلة مرسيدس', driverPhone: '0550000002' },
          { busNumber: '103', driverName: 'سائق تجريبي 3', busType: 'حافلة عادية', driverPhone: '0550000003' },
        ],
      };

      const res = await generateVoucherPDF(sampleVoucher, {
        save: false,
        print: true,
        twoCopies: false,
        copyLabels: [cleanLabels[0] || DEFAULT_PRINT_COPY_LABELS[0]],
      });

      if (res.status === 'popup_blocked') {
        setStatus({
          type: 'error',
          msg: 'المتصفح منع فتح نافذة الطباعة المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة.',
        });
      }
    } catch (err: any) {
      setStatus({
        type: 'error',
        msg: err?.message || 'تعذر توليد ورقة الاختبار.',
      });
    } finally {
      setIsTestPrinting(false);
    }
  };

  // Backup Export
  const handleExportBackup = async () => {
    setIsExportingBackup(true);
    setExportStatus({ type: null, msg: '' });
    try {
      const result = await exportSystemBackup({
        performedByUid: actorUid,
        performedByName: actorName,
        performedByRole: actorRole,
      });
      setExportStatus({
        type: 'success',
        msg: `تم تصدير النسخة الاحتياطية بنجاح (${result.counts.vouchers} سند، ${result.counts.buses} حافلة، ${result.counts.app_users} مستخدم).`,
      });
    } catch (err: any) {
      console.error('Export backup error:', err);
      setExportStatus({
        type: 'error',
        msg: `فشل تصدير النسخة الاحتياطية: ${err?.message || 'خطأ غير متوقع'}`,
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  // Import Wizard Step 1: Select & Validate JSON
  const handleSelectRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setSelectedBackupFileName(file.name);
    setParsedBackup(null);
    setParseError('');
    setPreviewReport(null);
    setRestoreResult(null);
    setRestoreExecError('');
    setRestoreConfirmWord('');
    setIncludeUserRoles(false);
    setRestoreMode('merge');

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        const validated = parseAndValidateBackupFile(text);
        setParsedBackup(validated);
      } catch (err: any) {
        setParseError(err?.message || 'ملف النسخة الاحتياطية غير صالح.');
      }
    };
    reader.onerror = () => {
      setParseError('تعذر قراءة الملف المحدد.');
    };
    reader.readAsText(file);
  };

  // Import Wizard Step 2: Dry-run preview
  const handlePreviewRestore = async () => {
    if (!parsedBackup) return;
    setIsPreviewingRestore(true);
    setRestoreExecError('');
    setPreviewReport(null);
    try {
      const report = await previewBackupRestore(parsedBackup);
      setPreviewReport(report);
    } catch (err: any) {
      setRestoreExecError(err?.message || 'تعذر تنفيذ المعاينة بدون تنفيذ.');
    } finally {
      setIsPreviewingRestore(false);
    }
  };

  // Import Wizard Step 4: Execute restore
  const handleExecuteRestore = async () => {
    if (!parsedBackup || !previewReport || restoreConfirmWord.trim() !== 'استرجاع') return;

    setIsExecutingRestore(true);
    setRestoreExecError('');
    setRestoreResult(null);
    setRestoreProgress({
      phase: 'جاري بدء عملية الاسترجاع...',
      completedOps: 0,
      totalOps: 0,
      completedBatches: 0,
      totalBatches: 0,
    });

    try {
      const result = await executeBackupRestore(parsedBackup, {
        mode: restoreMode,
        includeUserRoles,
        performedByUid: actorUid,
        performedByName: actorName,
        performedByRole: actorRole,
        onProgress: (p) => setRestoreProgress(p),
      });
      setRestoreResult(result);
    } catch (err: any) {
      console.error('Backup restore execution error:', err);
      setRestoreExecError(err?.message || 'فشل تنفيذ استرجاع النسخة الاحتياطية.');
    } finally {
      setIsExecutingRestore(false);
    }
  };

  const insertNameVariableIntoWelcome = () => {
    if (welcomeMessage.includes('{الاسم}')) return;
    const candidate = `${welcomeMessage.trim() ? `${welcomeMessage.trim()} ` : ''}{الاسم}`;
    if (candidate.length <= WELCOME_MESSAGE_MAX_LENGTH) {
      setWelcomeMessage(candidate);
    }
  };

  const formattedWelcomePreview = useMemo(
    () => formatWelcomeTextWithName(welcomeMessage, previewUserDisplayName),
    [welcomeMessage, previewUserDisplayName]
  );

  return (
    <div className="w-full space-y-[var(--space-4)] pb-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-[var(--space-4)] bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-[var(--border)] shadow-2xs relative overflow-hidden">
        <div className="flex items-center gap-[var(--space-4)]">
          <div className="w-11 h-11 bg-[var(--navy)] text-white rounded-2xl flex items-center justify-center shadow-sm">
            <Settings size={20} className="text-[var(--gold)]" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text)]">إعدادات التطبيق العامة</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-[var(--space-1)]">
              إدارة إعدادات التطبيق
            </p>
          </div>
        </div>
        <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-[var(--primary)] text-xs font-black">
          صلاحية المدير العام
        </span>
      </div>

      {/* Sub-Tabs Navigation Bar */}
      <div
        role="tablist"
        aria-label="تبويبات إعدادات التطبيق"
        className="bg-[var(--surface)] p-[var(--space-2)] rounded-2xl border border-[var(--border)] shadow-2xs flex flex-wrap items-center gap-[var(--space-2)]"
      >
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2.5)] rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[var(--btn-primary)] text-white shadow-sm'
                  : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text)]'
              }`}
            >
              <span className={isActive ? 'text-[var(--gold)]' : 'text-[var(--text-muted)]'}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Global Save / Error Status Banner */}
      {status.type && (
        <div
          role="alert"
          className={`p-[var(--space-4)] rounded-2xl text-sm font-bold flex items-center justify-between gap-[var(--space-3)] ${
            status.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800/70'
              : 'bg-red-50 dark:bg-red-950/40 text-[var(--danger)] border border-red-200 dark:border-red-800/70'
          }`}
        >
          <div className="flex items-center gap-[var(--space-2)]">
            {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            <span>{status.msg}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatus({ type: null, msg: '' })}
            aria-label="إغلاق الرسالة"
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* Main Tab Content Container */}
      <form onSubmit={handleSave} className="space-y-[var(--space-5)]">
        {/* ======================== TAB 1: عام ======================== */}
        {activeSubTab === 'general' && (
          <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden space-y-[var(--space-6)]">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]" />

            {/* 1.1) Next Voucher Number (Read-only + Protected Edit Modal) */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-[var(--space-3)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-3)]">
                <div>
                  <label className="block text-sm font-black text-[var(--text)]">رقم السند القادم</label>
                  <p className="text-xs text-[var(--text-secondary)] font-semibold mt-0.5">
                    يُقرأ مباشرة من عدّاد السندات الذري (<span dir="ltr">counters/vouchers.last + 1</span>) ولا يُعدّل مع الحفظ العادي.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCounterModal}
                  className="px-[var(--space-4)] py-[var(--space-2)] bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-800 rounded-xl text-xs font-black flex items-center gap-[var(--space-2)] transition-colors cursor-pointer shrink-0 self-start sm:self-center"
                >
                  <Edit3 size={15} />
                  <span>تعديل</span>
                </button>
              </div>

              <div className="relative">
                <Printer
                  className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  size={18}
                />
                <input
                  type="text"
                  readOnly
                  aria-label="رقم السند القادم"
                  value={displayedNextVoucherNumber}
                  dir="ltr"
                  className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-2xl border border-[var(--border)] font-black text-base text-[var(--text)] tabular-nums text-right cursor-not-allowed opacity-90 outline-none"
                />
              </div>
              <p className="text-xs text-[var(--text-muted)] font-semibold">
                {counterLast !== null
                  ? `آخر رقم سند مُصدر في العدّاد: ${counterLast}`
                  : 'العدّاد غير مهيّأ بعد — سيتم الترقيم تلقائياً بدءاً من أكبر سند موجود عند أول إصدار أو عند التعديل.'}
              </p>
            </div>

            {/* 1.2) Active Season + Hijri Date Offset (-2 .. +2) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--space-5)]">
              <div className="p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-[var(--space-3)]">
                <div className="flex items-center gap-[var(--space-2)]">
                  <Calendar size={17} className="text-[var(--primary)]" />
                  <label htmlFor="active-season-input" className="text-sm font-black text-[var(--text)]">
                    الموسم الحالي
                  </label>
                </div>
                <div className="flex items-center gap-[var(--space-3)]">
                  <input
                    id="active-season-input"
                    type="text"
                    value={activeSeason}
                    onChange={(e) => setActiveSeason(e.target.value.replace(/[^\d٠-٩]/g, '').slice(0, 6))}
                    dir="ltr"
                    placeholder="1448"
                    className="flex-1 px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-black text-sm text-[var(--text)] tabular-nums text-right"
                  />
                  <span className="px-[var(--space-3)] py-[var(--space-2.5)] rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-[var(--primary)] font-black text-xs whitespace-nowrap">
                    موسم حج {normalizeActiveSeason(activeSeason)}هـ
                  </span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] font-medium">
                  يُستخدم في شريط النظام العلوي وشاشة إصدار السندات الجديدة ونافذة الترحيب.
                </p>
              </div>

              <div className="p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-[var(--space-3)]">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-[var(--space-2)]">
                    <Calendar size={17} className="text-[var(--gold-text)]" />
                    <span className="text-sm font-black text-[var(--text)]">تصحيح التاريخ الهجري</span>
                  </div>
                  <span className="text-xs font-black text-[var(--primary)] tabular-nums" dir="ltr">
                    {hijriOffsetDays > 0 ? `+${hijriOffsetDays}` : hijriOffsetDays} يوم
                  </span>
                </div>

                <div className="grid grid-cols-5 gap-[var(--space-2)]">
                  {[MIN_HIJRI_OFFSET_DAYS, -1, 0, 1, MAX_HIJRI_OFFSET_DAYS].map((offsetVal) => {
                    const selected = hijriOffsetDays === offsetVal;
                    const label =
                      offsetVal === 0 ? '0 (تلقائي)' : offsetVal > 0 ? `+${offsetVal}` : `${offsetVal}`;
                    return (
                      <button
                        key={offsetVal}
                        type="button"
                        onClick={() => setHijriOffsetDays(offsetVal)}
                        className={`py-[var(--space-2.5)] rounded-xl border text-xs font-black tabular-nums transition-all cursor-pointer ${
                          selected
                            ? 'bg-[var(--btn-primary)] text-white border-[var(--btn-primary)] shadow-xs'
                            : 'bg-[var(--surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--primary)]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-[var(--text-secondary)] font-semibold">
                  المعاينة الحالية في التطبيق والسندات:{' '}
                  <span className="text-[var(--text)] font-black">{adjustedHijriPreview}</span>
                </p>
              </div>
            </div>

            {/* 1.3) Printed Company Footer Info */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-[var(--space-4)]">
              <div className="flex items-center gap-[var(--space-2)]">
                <Building2 size={17} className="text-[var(--primary)]" />
                <div>
                  <h3 className="text-sm font-black text-[var(--text)]">بيانات الشركة في تذييل السند المطبوع</h3>
                  <p className="text-xs text-[var(--text-secondary)] font-medium">
                    تظهر في منتصف التذييل السفلي عند طباعة أي سند أو كشف.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-4)]">
                <div className="md:col-span-3">
                  <label htmlFor="company-address-input" className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-1.5)]">
                    عنوان الشركة
                  </label>
                  <input
                    id="company-address-input"
                    type="text"
                    maxLength={200}
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    placeholder={DEFAULT_COMPANY_ADDRESS}
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-semibold text-sm text-[var(--text)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label htmlFor="company-website-input" className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-1.5)]">
                    الموقع الإلكتروني
                  </label>
                  <input
                    id="company-website-input"
                    type="text"
                    dir="ltr"
                    maxLength={120}
                    value={companyWebsite}
                    onChange={(e) => setCompanyWebsite(e.target.value)}
                    placeholder={DEFAULT_COMPANY_WEBSITE}
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-semibold text-sm text-[var(--text)] text-right"
                  />
                </div>

                <div>
                  <label htmlFor="company-phone-input" className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-1.5)]">
                    هاتف الشركة (اختياري)
                  </label>
                  <input
                    id="company-phone-input"
                    type="text"
                    dir="ltr"
                    maxLength={40}
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    placeholder="012XXXXXXX"
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-semibold text-sm text-[var(--text)] text-right tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* 1.4) Structured Welcome Message */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-5)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-[var(--space-4)]">
              <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
                <div className="flex items-center gap-[var(--space-2)]">
                  <MessageSquareText size={17} className="text-[var(--primary)]" />
                  <div>
                    <h3 className="text-sm font-black text-[var(--text)]">رسالة الترحيب للمستخدمين</h3>
                    <p className="text-xs text-[var(--text-secondary)] font-medium">
                      تُعاد إظهار الرسالة لجميع المستخدمين تلقائياً عند كل حفظ يُعدّل نصها (الإصدار الحالي: #{savedWelcomeVersion}).
                    </p>
                  </div>
                </div>

                <label className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-[var(--surface)] border border-[var(--border)] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={welcomeEnabled}
                    onChange={(e) => setWelcomeEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
                  />
                  <span className="text-xs font-black text-[var(--text)]">
                    {welcomeEnabled ? 'مفعّلة' : 'معطّلة'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-4)]">
                <div className="sm:col-span-2">
                  <label htmlFor="welcome-title-input" className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-1.5)]">
                    عنوان رسالة الترحيب
                  </label>
                  <input
                    id="welcome-title-input"
                    type="text"
                    maxLength={120}
                    value={welcomeTitle}
                    onChange={(e) => setWelcomeTitle(e.target.value)}
                    placeholder={DEFAULT_WELCOME_TITLE}
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-bold text-sm text-[var(--text)]"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-[var(--space-1.5)]">
                    <label htmlFor="welcome-expiry-input" className="text-xs font-bold text-[var(--text-secondary)]">
                      تاريخ انتهاء اختياري
                    </label>
                    {welcomeExpiresAt && (
                      <button
                        type="button"
                        onClick={() => setWelcomeExpiresAt('')}
                        className="text-[11px] font-bold text-[var(--danger)] hover:underline cursor-pointer"
                      >
                        مسح
                      </button>
                    )}
                  </div>
                  <input
                    id="welcome-expiry-input"
                    type="date"
                    value={welcomeExpiresAt}
                    onChange={(e) => setWelcomeExpiresAt(e.target.value)}
                    className="w-full px-[var(--space-3)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-bold text-xs text-[var(--text)] tabular-nums"
                  />
                </div>
              </div>

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-[var(--space-1.5)]">
                  <label htmlFor="welcome-message-input" className="text-xs font-bold text-[var(--text-secondary)]">
                    نص الرسالة (يدعم المتغير <span dir="ltr" className="font-mono text-[var(--primary)]">{'{الاسم}'}</span>)
                  </label>
                  <div className="flex items-center gap-[var(--space-3)]">
                    <button
                      type="button"
                      onClick={insertNameVariableIntoWelcome}
                      className="text-[11px] font-black text-[var(--primary)] bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100/70 transition-colors cursor-pointer"
                    >
                      + إدراج {'{الاسم}'}
                    </button>
                    <span
                      dir="ltr"
                      className={`text-xs font-mono font-bold tabular-nums ${
                        welcomeMessage.length >= WELCOME_MESSAGE_MAX_LENGTH
                          ? 'text-[var(--danger)]'
                          : 'text-[var(--text-muted)]'
                      }`}
                    >
                      {welcomeMessage.length} / {WELCOME_MESSAGE_MAX_LENGTH}
                    </span>
                  </div>
                </div>
                <textarea
                  id="welcome-message-input"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value.slice(0, WELCOME_MESSAGE_MAX_LENGTH))}
                  maxLength={WELCOME_MESSAGE_MAX_LENGTH}
                  placeholder={DEFAULT_WELCOME_MESSAGE}
                  className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-2xl border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold min-h-[100px] text-sm text-[var(--text)]"
                />
              </div>

              {/* Live Welcome Message Preview */}
              <div className="p-[var(--space-4)] rounded-2xl bg-[var(--surface)] border border-blue-200/80 dark:border-blue-900/70 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-black text-[var(--primary)]">معاينة حية للرسالة:</span>
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    الاسم الظاهر في السند: {previewUserDisplayName}
                  </span>
                </div>
                <p className="text-sm font-extrabold text-[var(--text)]">
                  {welcomeTitle.trim() || DEFAULT_WELCOME_TITLE}
                </p>
                <p className="text-xs font-semibold text-[var(--text-secondary)] leading-relaxed whitespace-pre-line">
                  {formattedWelcomePreview}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ======================== TAB 2: الطباعة ======================== */}
        {activeSubTab === 'printing' && (
          <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden space-y-[var(--space-6)]">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]" />

            {/* 2.1) Print Copies & Copy Labels */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] space-y-[var(--space-5)]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-5)]">
                <div>
                  <label htmlFor="print-copies-input" className="block text-sm font-black text-[var(--text)] mb-[var(--space-2)]">
                    عدد النسخ المطبوعة تلقائياً
                  </label>
                  <div className="relative">
                    <Printer
                      className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                      size={18}
                    />
                    <input
                      id="print-copies-input"
                      type="number"
                      value={printCopies}
                      min={MIN_PRINT_COPIES}
                      max={MAX_PRINT_COPIES}
                      onChange={(e) => setPrintCopies(normalizePrintCopies(e.target.value))}
                      className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-black text-[var(--text)] tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-end">
                  <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">
                    حدد عدد نسخ السند التي سيتم طباعتها تلقائياً عند الحفظ (من {MIN_PRINT_COPIES} إلى {MAX_PRINT_COPIES} نسخ)، مع تحديد عنوان كل نسخة ليُطبع أعلى السند.
                  </p>
                </div>
              </div>

              <div className="pt-[var(--space-4)] border-t border-[var(--border)] space-y-[var(--space-3)]">
                <span className="block text-xs font-black text-[var(--text)]">
                  عناوين النسخ المطبوعة (تُطبع أعلى كل نسخة):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--space-3)]">
                  {Array.from({ length: normalizePrintCopies(printCopies) }, (_, idx) => (
                    <div key={idx}>
                      <label
                        htmlFor={`copy-label-${idx}`}
                        className="block text-[11px] font-bold text-[var(--text-secondary)] mb-1"
                      >
                        عنوان النسخة {idx + 1}
                      </label>
                      <input
                        id={`copy-label-${idx}`}
                        type="text"
                        maxLength={40}
                        value={printCopyLabels[idx] ?? DEFAULT_PRINT_COPY_LABELS[idx]}
                        onChange={(e) => handleCopyLabelChange(idx, e.target.value)}
                        placeholder={DEFAULT_PRINT_COPY_LABELS[idx]}
                        className="w-full px-[var(--space-3)] py-[var(--space-2.5)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-bold text-xs text-[var(--text)]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 2.2) Print Margins (mm) + Test Print */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] space-y-[var(--space-4)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-3)]">
                <div>
                  <label className="block text-sm font-black text-[var(--text)]">
                    هوامش طباعة السند (بالمليمتر — mm)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] font-semibold mt-0.5">
                    النطاق المسموح من {MIN_MARGIN_MM} إلى {MAX_MARGIN_MM} مم لكل جهة (الافتراضي 10 مم)، مع بقاء السند في صفحة A4 واحدة.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                  <button
                    type="button"
                    onClick={handleResetMarginsDefault}
                    className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--surface)] hover:bg-slate-100 dark:hover:bg-slate-800 border border-[var(--border)] text-[var(--text)] rounded-xl text-xs font-bold flex items-center gap-[var(--space-1)] transition-colors cursor-pointer"
                  >
                    <RotateCcw size={14} />
                    <span>استعادة الافتراضي</span>
                  </button>
                  <button
                    type="button"
                    disabled={isTestPrinting || !layoutMetrics.isValid}
                    onClick={handlePrintTestPage}
                    className="px-[var(--space-4)] py-[var(--space-2)] bg-[var(--navy)] hover:opacity-95 text-white rounded-xl text-xs font-black flex items-center gap-[var(--space-2)] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isTestPrinting ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} className="text-[var(--gold)]" />}
                    <span>طباعة ورقة اختبار</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-4)]">
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">
                    أعلى (مم)
                  </span>
                  <input
                    type="number"
                    min={MIN_MARGIN_MM}
                    max={MAX_MARGIN_MM}
                    step="0.5"
                    value={pdfMargins.top}
                    onChange={(e) => handleMarginInputChange('top', e.target.value)}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-black text-sm text-[var(--text)] tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">
                    أسفل (مم)
                  </span>
                  <input
                    type="number"
                    min={MIN_MARGIN_MM}
                    max={MAX_MARGIN_MM}
                    step="0.5"
                    value={pdfMargins.bottom}
                    onChange={(e) => handleMarginInputChange('bottom', e.target.value)}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-black text-sm text-[var(--text)] tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">
                    يمين (مم)
                  </span>
                  <input
                    type="number"
                    min={MIN_MARGIN_MM}
                    max={MAX_MARGIN_MM}
                    step="0.5"
                    value={pdfMargins.right}
                    onChange={(e) => handleMarginInputChange('right', e.target.value)}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-black text-sm text-[var(--text)] tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">
                    يسار (مم)
                  </span>
                  <input
                    type="number"
                    min={MIN_MARGIN_MM}
                    max={MAX_MARGIN_MM}
                    step="0.5"
                    value={pdfMargins.left}
                    onChange={(e) => handleMarginInputChange('left', e.target.value)}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-black text-sm text-[var(--text)] tabular-nums"
                  />
                </div>
              </div>

              {layoutMetrics.isValid ? (
                <div className="p-[var(--space-3)] rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/70 text-xs font-bold text-[var(--success)] flex items-center gap-[var(--space-2)]">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>
                    التخطيط صالح لصفحة A4 واحدة (296 مم) — ارتفاع صف الجدول المحسوب: {layoutMetrics.rowHeightMm} مم (بحد أدنى 6 مم، والحد الأقصى لمجموع الهامش العلوي + السفلي: {layoutMetrics.maxAllowedVerticalSumMm} مم).
                  </span>
                </div>
              ) : (
                <div
                  role="alert"
                  className="p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/80 text-xs font-bold text-[var(--danger)] flex items-start gap-[var(--space-2)]"
                >
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{layoutMetrics.errorMessage}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== TAB 3: الشعارات ======================== */}
        {activeSubTab === 'branding' && (
          <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden space-y-[var(--space-6)]">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]" />

            {/* 3.1) Main Company Logo */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] space-y-[var(--space-5)]">
              <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-[var(--gold-text)] flex items-center justify-center font-bold">
                    <ImageIcon size={18} />
                  </div>
                  <div>
                    <label className="block text-sm font-black text-[var(--text)]">
                      شعار شركة درة المنورة الرسمي
                    </label>
                    <p className="text-xs text-[var(--text-secondary)] font-medium">
                      رفع ملف محلي فقط (PNG أو JPG أو WebP • بدون SVG • حد أقصى 1 ميجابايت • عرض لا يقل عن 600 بكسل)
                    </p>
                  </div>
                </div>
                {logoUrl && (
                  <div className="flex items-center gap-[var(--space-2)]">
                    <span className="px-[var(--space-3)] py-[var(--space-1)] bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800/70 rounded-full text-xs font-bold flex items-center gap-[var(--space-1)]">
                      <Check size={12} />
                      شعار مخصص
                    </span>
                    <button
                      type="button"
                      onClick={() => setResetBrandingTarget('logo')}
                      className="px-[var(--space-3)] py-[var(--space-1.5)] bg-red-50 dark:bg-red-950/40 text-[var(--danger)] hover:bg-red-100 dark:hover:bg-red-950/60 rounded-xl text-xs font-bold transition-all border border-red-200 dark:border-red-800/70 flex items-center gap-[var(--space-1)] cursor-pointer"
                    >
                      <RotateCcw size={13} />
                      <span>استعادة الشعار الافتراضي</span>
                    </button>
                  </div>
                )}
              </div>

              {logoUrl && !logoHasTransparency && (
                <div className="p-[var(--space-3)] rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs font-bold text-amber-900 dark:text-amber-100 flex items-start gap-[var(--space-2)]">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    تنبيه: الشعار المرفوع لا يحتوي على خلفية شفافة، وقد يظهر خلفه مربع أبيض في القائمة الجانبية أو السند المطبوع. يُنصح باستخدام PNG أو WebP بخلفية شفافة.
                  </span>
                </div>
              )}

              {logoUploadError && (
                <div className="p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-bold text-[var(--danger)] flex items-start gap-[var(--space-2)]">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{logoUploadError}</span>
                </div>
              )}

              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoFileChange}
                  id="logo-upload"
                  className="hidden"
                />
                <label
                  htmlFor="logo-upload"
                  className="w-full py-[var(--space-4)] px-[var(--space-4)] bg-[var(--surface)] rounded-2xl border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all cursor-pointer flex items-center justify-center gap-[var(--space-2)] group"
                >
                  {isProcessingLogo ? (
                    <Loader2 className="animate-spin text-[var(--primary)]" size={18} />
                  ) : (
                    <Upload className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" size={18} />
                  )}
                  <span className="text-xs font-black text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">
                    {isProcessingLogo ? 'جاري التحقق من الصورة ومعالجتها...' : 'اختر صورة الشعار الرئيسي (PNG / JPG / WebP)'}
                  </span>
                </label>
              </div>

              {/* Live 3-Context Preview */}
              <div className="space-y-[var(--space-2)]">
                <p className="text-xs font-black text-[var(--text-secondary)]">معاينة حية لمواضع ظهور الشعار الثلاثة:</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-3)]">
                  {/* Context 1: Sidebar */}
                  <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-[var(--space-3)] space-y-2">
                    <span className="block text-[11px] font-black text-[var(--text-muted)]">1) القائمة الجانبية</span>
                    <div className="p-2.5 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] flex items-center gap-2.5">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center p-1 border border-[var(--border)] shrink-0 overflow-hidden">
                        {logoUrl ? (
                          <img src={logoUrl} alt="معاينة القائمة الجانبية" className="w-full h-full object-contain" />
                        ) : (
                          <CompanyLogo size="32px" src="/logo.png" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-black text-[var(--text)] truncate">درة المنورة</div>
                        <div className="text-[10px] font-bold text-[var(--primary)] truncate">لنقل الحجاج والمعتمرين</div>
                      </div>
                    </div>
                  </div>

                  {/* Context 2: Login Screen */}
                  <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-[var(--space-3)] space-y-2">
                    <span className="block text-[11px] font-black text-[var(--text-muted)]">2) شاشة الدخول</span>
                    <div className="p-2.5 rounded-xl bg-gradient-to-b from-slate-100 to-white dark:from-slate-900 dark:to-slate-950 border border-[var(--border)] flex flex-col items-center justify-center gap-1.5">
                      <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center p-1.5 border border-slate-200 overflow-hidden">
                        {logoUrl ? (
                          <img src={logoUrl} alt="معاينة شاشة الدخول" className="w-full h-full object-contain" />
                        ) : (
                          <CompanyLogo size="50px" src="/logo.png" />
                        )}
                      </div>
                      <span className="text-[11px] font-black text-[var(--text)]">درة المنورة للنقل</span>
                    </div>
                  </div>

                  {/* Context 3: Voucher Header */}
                  <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-[var(--space-3)] space-y-2">
                    <span className="block text-[11px] font-black text-[var(--text-muted)]">3) ترويسة السند المطبوع</span>
                    <div className="p-2 rounded-xl bg-white text-slate-900 border-b-2 border-blue-700 grid grid-cols-3 items-center gap-1 min-h-[78px]">
                      <div className="text-right">
                        <div className="text-[9px] font-bold leading-tight">شركة درة المنورة</div>
                        <div className="text-[7px] text-slate-500" dir="ltr">DMTC</div>
                      </div>
                      <div className="flex items-center justify-center">
                        {logoUrl ? (
                          <img src={logoUrl} alt="معاينة ترويسة السند" className="h-10 w-auto object-contain" />
                        ) : (
                          <img src="/logo.png" alt="الشعار الافتراضي" className="h-10 w-auto object-contain" />
                        )}
                      </div>
                      <div className="flex items-center justify-end">
                        {sloganUrl ? (
                          <img src={sloganUrl} alt="شعار العبارة" className="h-8 w-auto object-contain" />
                        ) : (
                          <span className="text-[8px] font-bold text-slate-600 border border-slate-300 rounded px-1 py-0.5">
                            خدمة الحاج شرف لنا
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3.2) Slogan ("خدمة الحاج شرف لنا") Upload Only + Height Control (No gear icon in preview) */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] space-y-[var(--space-4)]">
              <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
                <div>
                  <label className="block text-sm font-black text-[var(--text)]">
                    شعار عبارة (خدمة الحاج شرف لنا) وارتفاعه في السند
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] font-medium mt-0.5">
                    رفع ملف محلي فقط (PNG / JPG / WebP • بدون SVG • حد أقصى 1 ميجابايت • عرض ≥ 600 بكسل)
                  </p>
                </div>
                {sloganUrl && (
                  <button
                    type="button"
                    onClick={() => setResetBrandingTarget('slogan')}
                    className="px-[var(--space-3)] py-[var(--space-1.5)] bg-red-50 dark:bg-red-950/40 text-[var(--danger)] hover:bg-red-100 dark:hover:bg-red-950/60 rounded-xl text-xs font-bold transition-all border border-red-200 dark:border-red-800/70 flex items-center gap-[var(--space-1)] cursor-pointer"
                  >
                    <RotateCcw size={13} />
                    <span>استعادة الشعار الافتراضي</span>
                  </button>
                )}
              </div>

              {sloganUrl && !sloganHasTransparency && (
                <div className="p-[var(--space-3)] rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs font-bold text-amber-900 dark:text-amber-100 flex items-start gap-[var(--space-2)]">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    تنبيه: صورة عبارة «خدمة الحاج شرف لنا» لا تحتوي على خلفية شفافة، وقد يظهر خلفها مستطيل أبيض في ترويسة السند.
                  </span>
                </div>
              )}

              {sloganUploadError && (
                <div className="p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-bold text-[var(--danger)] flex items-start gap-[var(--space-2)]">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{sloganUploadError}</span>
                </div>
              )}

              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleSloganFileChange}
                  id="slogan-upload"
                  className="hidden"
                />
                <label
                  htmlFor="slogan-upload"
                  className="w-full py-[var(--space-4)] px-[var(--space-4)] bg-[var(--surface)] rounded-2xl border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all cursor-pointer flex items-center justify-center gap-[var(--space-2)] group"
                >
                  {isProcessingSlogan ? (
                    <Loader2 className="animate-spin text-[var(--primary)]" size={18} />
                  ) : (
                    <Upload className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" size={18} />
                  )}
                  <span className="text-xs font-black text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">
                    {isProcessingSlogan ? 'جاري التحقق من الصورة ومعالجتها...' : 'اختر صورة شعار «خدمة الحاج شرف لنا» (PNG / JPG / WebP)'}
                  </span>
                </label>
              </div>

              {/* Slogan Height Slider (15mm .. 30mm, default 23mm) */}
              <div className="p-[var(--space-4)] bg-[var(--surface)] rounded-2xl border border-[var(--border)] space-y-[var(--space-3)]">
                <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)]">
                  <div>
                    <label htmlFor="slogan-height-range" className="block text-xs font-black text-[var(--text)]">
                      ارتفاع شعار «خدمة الحاج شرف لنا» في السند المطبوع
                    </label>
                    <p className="text-[11px] text-[var(--text-secondary)] font-semibold">
                      من {MIN_SLOGAN_HEIGHT_MM} إلى {MAX_SLOGAN_HEIGHT_MM} مم (الافتراضي {DEFAULT_SLOGAN_HEIGHT_MM} مم)
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={MIN_SLOGAN_HEIGHT_MM}
                      max={MAX_SLOGAN_HEIGHT_MM}
                      value={sloganHeightMm}
                      onChange={(e) => setSloganHeightMm(normalizeSloganHeightMm(e.target.value))}
                      className="w-20 text-center py-1.5 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-black text-xs text-[var(--text)] tabular-nums"
                    />
                    <span className="text-xs font-bold text-[var(--text-secondary)]">مم</span>
                  </div>
                </div>
                <input
                  id="slogan-height-range"
                  type="range"
                  min={MIN_SLOGAN_HEIGHT_MM}
                  max={MAX_SLOGAN_HEIGHT_MM}
                  step={1}
                  value={sloganHeightMm}
                  onChange={(e) => setSloganHeightMm(normalizeSloganHeightMm(e.target.value))}
                  className="w-full accent-[var(--primary)] cursor-pointer"
                />

                <div className="pt-2 flex flex-col items-center justify-center bg-white rounded-xl p-3 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 mb-2">
                    معاينة ارتفاع الشعار ({sloganHeightMm} مم):
                  </span>
                  {sloganUrl ? (
                    <img
                      src={sloganUrl}
                      alt="معاينة شعار العبارة"
                      style={{ height: `${sloganHeightMm}mm`, maxWidth: '64mm' }}
                      className="object-contain"
                    />
                  ) : (
                    <div
                      style={{ height: `${sloganHeightMm}mm` }}
                      className="px-4 rounded-xl border border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-900"
                    >
                      <span className="text-sm font-extrabold">خدمة الحاج شرف لنا</span>
                      <span className="text-[10px] font-bold text-blue-700" dir="ltr">
                        DURRAT AL-MUNAWWARA
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ======================== TAB 4: النسخ الاحتياطي ======================== */}
        {activeSubTab === 'backup' && (
          <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden space-y-[var(--space-5)]">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--gold)]" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-4)]">
              <div className="flex items-center gap-[var(--space-4)]">
                <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center text-[var(--gold-text)] border border-amber-200/80 dark:border-amber-800/70">
                  <Database size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-[var(--text)] leading-snug">
                    النسخ الاحتياطي والاسترجاع الآمن
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)] font-semibold mt-[var(--space-1)]">
                    تصدير نسخة JSON نظيفة بدون جلسات أو أسرار، واسترجاع تدريجي عبر معاينة مسبقة
                  </p>
                </div>
              </div>
            </div>

            {/* Sensitive PII Warning */}
            <div className="p-[var(--space-4)] rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/80 text-amber-950 dark:text-amber-100 flex items-start gap-[var(--space-3)]">
              <ShieldAlert size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs font-bold leading-relaxed">
                <p className="font-black">الملف يحوي بيانات شخصية (هويات وأرقام هواتف)، احفظه في مكان آمن.</p>
                <p className="text-amber-800/90 dark:text-amber-200/80 mt-0.5 font-semibold">
                  يتم استبعاد الجلسات النشطة (active_sessions) وسجل التدقيق (auditLog) وكلمات المرور والرموز السرية تلقائياً من النسخة الاحتياطية.
                </p>
              </div>
            </div>

            {/* Export Button + Last Backup Timestamp */}
            <div className="p-[var(--space-4)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-[var(--space-4)]">
              <div className="space-y-1">
                <span className="block text-xs font-black text-[var(--text)]">آخر نسخة احتياطية مسجلة</span>
                <p className="text-xs font-bold text-[var(--text-secondary)]">
                  {lastBackupAt
                    ? `${format(new Date(lastBackupAt), 'yyyy-MM-dd HH:mm')}${lastBackupByName ? ` • بواسطة: ${lastBackupByName}` : ''}`
                    : 'لم يتم تصدير أي نسخة احتياطية مسجلة بعد'}
                </p>
              </div>

              <button
                type="button"
                disabled={isExportingBackup}
                onClick={handleExportBackup}
                className="px-[var(--space-5)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-black text-xs flex items-center justify-center gap-[var(--space-2)] transition-all cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isExportingBackup ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} className="text-[var(--gold)]" />}
                <span>تصدير نسخة احتياطية (JSON)</span>
              </button>
            </div>

            {exportStatus.type && (
              <div
                className={`p-[var(--space-3)] rounded-xl text-xs font-bold flex items-center gap-[var(--space-2)] ${
                  exportStatus.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800/70'
                    : 'bg-red-50 dark:bg-red-950/40 text-[var(--danger)] border border-red-200 dark:border-red-800/70'
                }`}
              >
                {exportStatus.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                <span>{exportStatus.msg}</span>
              </div>
            )}

            {/* Import Wizard */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-5)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] space-y-[var(--space-4)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-3)]">
                <div>
                  <h4 className="text-sm font-black text-[var(--text)]">معالج استيراد النسخة الاحتياطية</h4>
                  <p className="text-xs text-[var(--text-secondary)] font-semibold">
                    1) اختيار الملف والتحقق ← 2) معاينة بدون تنفيذ ← 3) اختيار الوضع والتأكيد ← 4) التنفيذ
                  </p>
                </div>
                <label className="px-[var(--space-4)] py-[var(--space-2.5)] bg-[var(--surface)] hover:bg-blue-50/40 dark:hover:bg-blue-950/20 border border-[var(--border)] hover:border-[var(--primary)] text-[var(--text)] rounded-xl font-black text-xs flex items-center justify-center gap-[var(--space-2)] transition-all cursor-pointer shrink-0">
                  <Upload size={15} className="text-[var(--gold-text)]" />
                  <span>{selectedBackupFileName ? 'تغيير ملف النسخة' : 'اختيار ملف نسخة (.json)'}</span>
                  <input type="file" accept=".json,application/json" onChange={handleSelectRestoreFile} className="hidden" />
                </label>
              </div>

              {selectedBackupFileName && (
                <div className="text-xs font-bold text-[var(--text-secondary)] bg-[var(--surface)] px-3 py-2 rounded-xl border border-[var(--border)] flex flex-wrap items-center justify-between gap-2">
                  <span>الملف المحدد: {selectedBackupFileName}</span>
                  {parsedBackup?.exportedAt && (
                    <span className="text-[var(--text-muted)]" dir="ltr">
                      {parsedBackup.exportedAt.slice(0, 19).replace('T', ' ')}
                    </span>
                  )}
                </div>
              )}

              {parseError && (
                <div className="p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-bold text-[var(--danger)] flex items-start gap-[var(--space-2)]">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{parseError}</span>
                </div>
              )}

              {parsedBackup && (
                <div className="space-y-[var(--space-4)]">
                  {parsedBackup.ignoredCollections.length > 0 && (
                    <div className="p-[var(--space-3)] rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 text-xs font-bold text-[var(--primary)]">
                      تم تجاهل مجموعات حساسة موجودة في الملف تلقائياً ({parsedBackup.ignoredCollections.join('، ')}) ولن يتم استيرادها.
                    </div>
                  )}

                  {/* Step 2: Dry-run preview button */}
                  <div className="flex flex-wrap items-center gap-[var(--space-3)]">
                    <button
                      type="button"
                      disabled={isPreviewingRestore || isExecutingRestore}
                      onClick={handlePreviewRestore}
                      className="px-[var(--space-4)] py-[var(--space-2.5)] bg-[var(--navy)] hover:opacity-95 text-white rounded-xl font-black text-xs flex items-center gap-[var(--space-2)] transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isPreviewingRestore ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} className="text-[var(--gold)]" />}
                      <span>معاينة بدون تنفيذ</span>
                    </button>
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      يفحص السجلات والتعارضات المحتملة قبل أي كتابة على قاعدة البيانات.
                    </span>
                  </div>

                  {previewReport && (
                    <div className="bg-[var(--surface)] rounded-2xl border border-[var(--border)] p-[var(--space-4)] space-y-[var(--space-4)]">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-3)] text-center">
                        <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)]">
                          <div className="text-lg font-black text-[var(--text)] tabular-nums">{previewReport.counts.vouchers}</div>
                          <div className="text-[11px] font-bold text-[var(--text-secondary)]">السندات في الملف</div>
                        </div>
                        <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)]">
                          <div className="text-lg font-black text-[var(--text)] tabular-nums">{previewReport.counts.buses}</div>
                          <div className="text-[11px] font-bold text-[var(--text-secondary)]">الحافلات</div>
                        </div>
                        <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)]">
                          <div className="text-lg font-black text-[var(--success)] tabular-nums">{previewReport.newVouchersCount}</div>
                          <div className="text-[11px] font-bold text-[var(--text-secondary)]">سندات جديدة</div>
                        </div>
                        <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)]">
                          <div className="text-lg font-black text-[var(--primary)] tabular-nums">{previewReport.existingVouchersCount}</div>
                          <div className="text-[11px] font-bold text-[var(--text-secondary)]">سندات موجودة مسبقاً</div>
                        </div>
                      </div>

                      {previewReport.conflictingVouchers.length > 0 && (
                        <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs space-y-1">
                          <p className="font-black text-amber-900 dark:text-amber-100">
                            تعارضات في أرقام أو معرّفات السندات ({previewReport.conflictingVouchers.length}):
                          </p>
                          <ul className="list-disc pr-5 space-y-0.5 text-amber-800 dark:text-amber-200 font-semibold">
                            {previewReport.conflictingVouchers.slice(0, 6).map((c) => (
                              <li key={`${c.id}-${c.voucherNumber}`}>
                                سند #{c.voucherNumber}: {c.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {(() => {
                        const activeBusConflicts =
                          restoreMode === 'merge' ? previewReport.busConflictsMerge : previewReport.busConflictsReplace;
                        if (activeBusConflicts.length === 0) return null;
                        return (
                          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs space-y-1">
                            <p className="font-black text-amber-900 dark:text-amber-100">
                              تنبيه تعارض حافلات نشطة في وضع «{restoreMode === 'merge' ? 'دمج' : 'استبدال'}» ({activeBusConflicts.length} حافلة):
                            </p>
                            <ul className="list-disc pr-5 space-y-0.5 text-amber-800 dark:text-amber-200 font-semibold">
                              {activeBusConflicts.slice(0, 6).map((bc) => (
                                <li key={bc.busNumber}>
                                  حافلة {bc.busNumber} مكررة في سندات نشطة ({bc.offices.join(' / ')}) — سيُعتمد أحدث سند (#{bc.chosenVoucherNumber}).
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })()}

                      {/* Mode Selection */}
                      <div className="space-y-2 pt-2 border-t border-[var(--border)]">
                        <span className="block text-xs font-black text-[var(--text)]">وضع الاستيراد:</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <label
                            className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                              restoreMode === 'merge'
                                ? 'bg-blue-50/70 dark:bg-blue-950/30 border-[var(--primary)]'
                                : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="restoreMode"
                              checked={restoreMode === 'merge'}
                              onChange={() => setRestoreMode('merge')}
                              className="mt-1 accent-[var(--primary)]"
                            />
                            <div>
                              <div className="text-xs font-black text-[var(--text)]">دمج (الافتراضي والأكثر أماناً)</div>
                              <div className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">
                                يضيف السجلات الجديدة فقط ولا يكتب فوق السندات أو الإعدادات الموجودة حالياً.
                              </div>
                            </div>
                          </label>

                          <label
                            className={`p-3 rounded-xl border cursor-pointer flex items-start gap-2.5 transition-all ${
                              restoreMode === 'replace'
                                ? 'bg-red-50/70 dark:bg-red-950/30 border-[var(--danger)]'
                                : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="restoreMode"
                              checked={restoreMode === 'replace'}
                              onChange={() => setRestoreMode('replace')}
                              className="mt-1 accent-[var(--danger)]"
                            />
                            <div>
                              <div className="text-xs font-black text-[var(--danger)]">استبدال كامل</div>
                              <div className="text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">
                                يستبدل السندات والحافلات والإعدادات بمحتوى النسخة ويحذف ما عداها.
                              </div>
                            </div>
                          </label>
                        </div>
                      </div>

                      {/* Optional User Roles Toggle */}
                      <div className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] space-y-2">
                        <label className="flex items-start gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={includeUserRoles}
                            onChange={(e) => setIncludeUserRoles(e.target.checked)}
                            className="mt-0.5 accent-[var(--danger)]"
                          />
                          <div>
                            <span className="block text-xs font-black text-[var(--text)]">
                              استيراد أدوار المستخدمين وتفعيل الحسابات (app_users: {previewReport.counts.app_users} سجل)
                            </span>
                            <span className="block text-[11px] font-semibold text-[var(--text-secondary)] mt-0.5">
                              معطّل افتراضياً لحماية صلاحيات الدخول الحالية.
                            </span>
                          </div>
                        </label>
                        {includeUserRoles && (
                          <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-[11px] font-bold text-[var(--danger)]">
                            تحذير: تفعيل هذا الخيار سيستورد حسابات وأدوار المستخدمين من النسخة الاحتياطية (مع حذف أي أسرار)، وقد يؤثر على صلاحيات المستخدمين الحاليين.
                          </div>
                        )}
                      </div>

                      {/* Confirmation word "استرجاع" */}
                      <div className="pt-2 border-t border-[var(--border)] space-y-3">
                        <div className="text-xs font-bold text-[var(--text-secondary)]">
                          سيتم تنزيل نسخة احتياطية حية تلقائياً للوضع الحالي قبل تنفيذ أي تغيير، ثم إعادة بناء <span dir="ltr">busAssignments</span> وتحديث عدّاد السندات.
                        </div>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                          <input
                            type="text"
                            value={restoreConfirmWord}
                            onChange={(e) => setRestoreConfirmWord(e.target.value)}
                            placeholder='اكتب كلمة "استرجاع" للتأكيد'
                            className="flex-1 px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--primary)] rounded-xl text-xs font-black text-[var(--text)] outline-none"
                          />
                          <button
                            type="button"
                            disabled={isExecutingRestore || restoreConfirmWord.trim() !== 'استرجاع'}
                            onClick={handleExecuteRestore}
                            className="px-5 py-2.5 bg-[var(--danger)] hover:opacity-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 shrink-0"
                          >
                            {isExecutingRestore ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                            <span>تنفيذ الاسترجاع</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isExecutingRestore && restoreProgress && (
                    <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 space-y-2">
                      <div className="flex items-center justify-between text-xs font-black text-[var(--primary)]">
                        <span>{restoreProgress.phase}</span>
                        {restoreProgress.totalOps > 0 && (
                          <span className="tabular-nums">
                            {restoreProgress.completedOps} / {restoreProgress.totalOps}
                          </span>
                        )}
                      </div>
                      <div className="w-full h-2.5 bg-white/80 dark:bg-slate-900 rounded-full overflow-hidden border border-blue-200 dark:border-blue-800">
                        <div
                          className="h-full bg-[var(--primary)] transition-all duration-200"
                          style={{
                            width:
                              restoreProgress.totalOps > 0
                                ? `${Math.min(100, Math.round((restoreProgress.completedOps / restoreProgress.totalOps) * 100))}%`
                                : '15%',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {restoreExecError && (
                    <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-bold text-[var(--danger)]">
                      {restoreExecError}
                    </div>
                  )}

                  {restoreResult && (
                    <div
                      className={`p-4 rounded-2xl border text-xs space-y-2 ${
                        restoreResult.stoppedOnError
                          ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-[var(--danger)]'
                          : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-[var(--success)]'
                      }`}
                    >
                      <p className="font-black text-sm">
                        {restoreResult.stoppedOnError
                          ? 'توقفت عملية الاسترجاع عند وقوع خطأ:'
                          : 'اكتملت عملية الاسترجاع وإعادة البناء بنجاح'}
                      </p>
                      {restoreResult.errorMessage && <p className="font-bold">{restoreResult.errorMessage}</p>}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-bold text-[var(--text)]">
                        <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border)]">
                          السندات المستوردة: {restoreResult.imported.vouchers}
                        </div>
                        <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border)]">
                          الحافلات المستوردة: {restoreResult.imported.buses}
                        </div>
                        <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border)]">
                          سجلات متجاوزة (دمج): {restoreResult.skippedExisting}
                        </div>
                        <div className="bg-[var(--surface)] p-2 rounded-lg border border-[var(--border)]">
                          عمليات متبقية: {restoreResult.remainingOps}
                        </div>
                      </div>
                      {!restoreResult.stoppedOnError && (
                        <p className="font-bold text-[var(--text-secondary)]">
                          حجوزات الحافلات المعاد بناؤها: {restoreResult.rebuiltActiveBuses} حافلة نشطة،{' '}
                          {restoreResult.rebuiltReleasedBuses} محررة • آخر رقم سند في العدّاد: {restoreResult.newCounterLast}
                          {restoreResult.busConflicts.length > 0
                            ? ` • تعارضات حافلات مُكتشفة: ${restoreResult.busConflicts.length}`
                            : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== TAB 5: الأمان ======================== */}
        {activeSubTab === 'security' && (
          <div className="space-y-[var(--space-5)]">
            {/* 5.1) Idle Timeout Control */}
            <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden space-y-[var(--space-4)]">
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]" />
              <div className="flex items-start gap-[var(--space-3)]">
                <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/50 text-[var(--primary)] rounded-xl flex items-center justify-center border border-blue-200 dark:border-blue-800 shrink-0">
                  <Clock size={19} />
                </div>
                <div className="flex-1">
                  <label htmlFor="idle-timeout-input" className="block text-base font-extrabold text-[var(--text)]">
                    مهلة الخمول للخروج التلقائي (بالدقائق)
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] font-semibold mt-0.5">
                    يتم تسجيل خروج المستخدم تلقائياً بعد هذه المدة من عدم النشاط مع تنبيه قبل الانتهاء بدقيقة وحفظ أي مسودة سند جارية.
                  </p>
                </div>
              </div>

              <div className="p-[var(--space-4)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-4)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <input
                    id="idle-timeout-input"
                    type="number"
                    min={MIN_IDLE_TIMEOUT_MINUTES}
                    max={MAX_IDLE_TIMEOUT_MINUTES}
                    step={1}
                    value={idleTimeoutMinutes}
                    onChange={(e) => setIdleTimeoutMinutes(normalizeIdleTimeoutMinutes(e.target.value))}
                    className="w-28 text-center py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] outline-none font-black text-base text-[var(--text)] tabular-nums"
                  />
                  <span className="text-xs font-black text-[var(--text)]">دقيقة</span>
                </div>
                <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                  {[15, 30, 60, 120].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setIdleTimeoutMinutes(preset)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-black tabular-nums cursor-pointer transition-colors ${
                        idleTimeoutMinutes === preset
                          ? 'bg-[var(--btn-primary)] text-white border-[var(--btn-primary)]'
                          : 'bg-[var(--surface)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]'
                      }`}
                    >
                      {preset} د
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-semibold">
                النطاق المسموح من {MIN_IDLE_TIMEOUT_MINUTES} إلى {MAX_IDLE_TIMEOUT_MINUTES} دقيقة (الافتراضي {DEFAULT_IDLE_TIMEOUT_MINUTES} دقيقة).
              </p>
            </div>

            {/* 5.2) Settings Audit Log */}
            <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-6)] shadow-sm border border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowAuditHistory((v) => !v)}
                className="w-full flex items-center justify-between text-right cursor-pointer"
              >
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-9 h-9 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] flex items-center justify-center text-[var(--primary)]">
                    <History size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--text)]">سجل تدقيق تغييرات الإعدادات (Audit Log)</h3>
                    <p className="text-xs text-[var(--text-secondary)] font-semibold">
                      يعرض آخر 15 عملية تعديل على الإعدادات أو العدّاد أو النسخ الاحتياطي
                    </p>
                  </div>
                </div>
                {showAuditHistory ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showAuditHistory && (
                <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-2.5">
                  {auditEntries.length === 0 ? (
                    <p className="text-xs font-bold text-[var(--text-muted)] text-center py-4">
                      لا توجد عمليات مسجلة في سجل التدقيق حتى الآن.
                    </p>
                  ) : (
                    auditEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-3 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-black text-[var(--text)]">{entry.summary}</span>
                          <span className="text-[11px] font-bold text-[var(--text-muted)]" dir="ltr">
                            {formatAuditTimestamp(entry.createdAt)}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-[var(--text-secondary)]">
                          المنفّذ: {entry.performedByName || '—'}
                          {entry.reason ? ` • السبب: ${entry.reason}` : ''}
                        </div>
                        {Array.isArray(entry.changes) && entry.changes.length > 0 && (
                          <div className="pt-1 space-y-0.5 text-[11px] text-[var(--text-secondary)]">
                            {entry.changes.map((c, idx) => (
                              <div key={`${entry.id}-${idx}`}>
                                • {c.label}: «{c.previousValue}» ← «{c.newValue}»
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======================== Sticky Unsaved Changes Bar ======================== */}
        {isDirty && (
          <div className="sticky bottom-3 z-40 bg-[var(--surface)]/95 backdrop-blur-md border-2 border-[var(--primary)] rounded-2xl p-[var(--space-4)] shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-[var(--space-3)]">
            <div className="flex items-center gap-[var(--space-3)]">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-[var(--gold-text)] flex items-center justify-center shrink-0">
                <AlertCircle size={18} />
              </div>
              <div>
                <p className="text-sm font-black text-[var(--text)]">لديك تغييرات غير محفوظة</p>
                <p className="text-xs font-bold text-[var(--primary)] tabular-nums">
                  {dirtyFieldsCount === 1
                    ? 'حقل واحد معدّل'
                    : dirtyFieldsCount === 2
                    ? 'حقلان معدّلان'
                    : `${dirtyFieldsCount} حقول معدّلة`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-[var(--space-3)]">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleDiscardChanges}
                className="flex-1 sm:flex-none px-[var(--space-5)] py-[var(--space-3)] bg-[var(--surface-subtle)] hover:bg-slate-200 dark:hover:bg-slate-800 text-[var(--text)] rounded-xl font-bold text-xs border border-[var(--border)] transition-colors cursor-pointer disabled:opacity-50"
              >
                تجاهل التغييرات
              </button>
              <button
                type="submit"
                disabled={isSaving || !layoutMetrics.isValid}
                className="flex-1 sm:flex-none px-[var(--space-6)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-black text-xs flex items-center justify-center gap-[var(--space-2)] transition-all shadow-md disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} className="text-[var(--gold)]" />}
                <span>حفظ</span>
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Modal: Counter Override (General Manager only) */}
      {isCounterModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-[var(--space-4)]"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--surface)] rounded-[2rem] max-w-md w-full p-[var(--space-6)] border border-amber-300 dark:border-amber-800 shadow-2xl space-y-[var(--space-4)]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <h3 className="text-base font-black text-[var(--text)]">تعديل رقم السند القادم</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCounterModalOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs font-black text-amber-900 dark:text-amber-100">
              تغيير هذا الرقم قد يسبب تكرار أرقام أو فجوات في السندات
            </div>

            {isCheckingCounterMax ? (
              <div className="py-6 flex items-center justify-center gap-2 text-xs font-bold text-[var(--text-secondary)]">
                <Loader2 size={16} className="animate-spin text-[var(--primary)]" />
                <span>جاري التحقق من أعلى رقم سند موجود فعلاً...</span>
              </div>
            ) : (
              <form onSubmit={handleConfirmCounterOverride} className="space-y-4">
                <div className="text-xs font-bold text-[var(--text-secondary)]">
                  أكبر رقم سند موجود حالياً في قاعدة البيانات:{' '}
                  <span className="font-black text-[var(--text)] tabular-nums">{maxVoucherInDb}</span>
                </div>

                <div>
                  <label className="block text-xs font-black text-[var(--text)] mb-1.5">
                    رقم السند القادم الجديد
                  </label>
                  <input
                    type="number"
                    min={maxVoucherInDb + 1}
                    step={1}
                    required
                    value={counterNewInput}
                    onChange={(e) => setCounterNewInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--primary)] rounded-xl font-black text-sm text-[var(--text)] tabular-nums outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black text-[var(--text)] mb-1.5">
                    سبب التعديل (5 أحرف على الأقل)
                  </label>
                  <textarea
                    required
                    minLength={5}
                    value={counterReasonInput}
                    onChange={(e) => setCounterReasonInput(e.target.value)}
                    placeholder="اكتب سبب تعديل التسلسل الرقمي للسندات..."
                    className="w-full px-4 py-2.5 bg-[var(--surface-subtle)] border border-[var(--border)] focus:border-[var(--primary)] rounded-xl font-semibold text-xs text-[var(--text)] min-h-[75px] outline-none"
                  />
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-[var(--text)]">
                  <input
                    type="checkbox"
                    checked={counterConfirmed}
                    onChange={(e) => setCounterConfirmed(e.target.checked)}
                    className="mt-0.5 accent-[var(--primary)]"
                  />
                  <span>أؤكد رغبتي في تعديل رقم السند القادم وأتحمل مسؤولية التعديل في سجل التدقيق.</span>
                </label>

                {counterModalError && (
                  <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs font-bold text-[var(--danger)]">
                    {counterModalError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCounterModalOpen(false)}
                    className="px-4 py-2.5 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingCounter}
                    className="px-5 py-2.5 rounded-xl bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-black flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingCounter && <Loader2 size={14} className="animate-spin" />}
                    <span>تأكيد التعديل</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Confirm Reset Branding to Default */}
      {resetBrandingTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-[var(--space-4)]"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--surface)] rounded-[2rem] max-w-sm w-full p-[var(--space-6)] border border-[var(--border)] shadow-2xl space-y-4">
            <h3 className="text-base font-black text-[var(--text)]">تأكيد استعادة الشعار الافتراضي</h3>
            <p className="text-xs font-semibold text-[var(--text-secondary)] leading-relaxed">
              {resetBrandingTarget === 'logo'
                ? 'هل تريد استعادة شعار شركة درة المنورة الافتراضي وإزالة الشعار المخصص؟ (تُعتمد التغييرات بعد الضغط على حفظ).'
                : 'هل تريد استعادة شعار «خدمة الحاج شرف لنا» الافتراضي وإزالة الصورة المخصصة؟'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setResetBrandingTarget(null)}
                className="px-4 py-2 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmResetBranding}
                className="px-4 py-2 rounded-xl bg-[var(--danger)] text-white text-xs font-black cursor-pointer"
              >
                نعم، استعادة الافتراضي
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
