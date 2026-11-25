import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { format } from 'date-fns';
import {
  Printer,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bus,
  ClipboardList,
  Trash2,
  Layers,
  User as UserIcon,
  Phone,
  MapPin,
  Clock,
  Calendar,
  Keyboard,
  CreditCard,
  Save,
  HelpCircle,
  X,
  ExternalLink,
  FileDown,
  WifiOff,
  ShieldAlert,
} from 'lucide-react';
import { generateVoucherPDF, exportVoucherLegacyPDF } from '../lib/pdfGenerator';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../App';
import { getUserReceiptName, resolveNewVoucherIssuerName } from '../lib/issuerName';
import {
  toEnglishDigits,
  normalizeSaudiMobile,
  validateReceiverMobile,
  validateReceiverId,
  validateDriverPhoneWarning,
} from '../lib/voucherValidation';

import {
  buildBusConflictMessage,
  checkBusActiveAssignment,
  formatOfficeLabel,
} from '../lib/busAssignments';
import {
  beginBusyActivity,
  IDLE_DRAFT_LATEST_KEY,
  IDLE_DRAFT_STORAGE_PREFIX,
  registerVoucherDraftSaver,
} from '../lib/activityTracker';
import {
  DEFAULT_ACTIVE_SEASON,
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_PHONE,
  DEFAULT_COMPANY_WEBSITE,
  DEFAULT_HIJRI_OFFSET_DAYS,
  DEFAULT_PDF_MARGINS,
  DEFAULT_PRINT_COPY_LABELS,
  DEFAULT_SLOGAN_HEIGHT_MM,
  formatHijriDDMMYYYYWithOffset,
  normalizeActiveSeason,
  normalizeHijriOffsetDays,
  normalizePdfMargins,
  normalizePrintCopies,
  normalizePrintCopyLabels,
  normalizeSloganHeightMm,
  PdfMargins,
} from '../lib/printSettings';

const computeHijriDDMMYYYY = (gregorianDateStr: string, offsetDays: number = 0): string => {
  if (!gregorianDateStr) return '';
  return formatHijriDDMMYYYYWithOffset(gregorianDateStr, offsetDays);
};

export function VoucherEntry() {
  const { user: authUser } = useAuth();

  const getSessionUser = () => {
    const saved = localStorage.getItem('dmtc_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Session parse error', e);
        return null;
      }
    }
    return null;
  };

  const sessionUser = getSessionUser();
  const activeUser = authUser || sessionUser;
  const activeUserUid = activeUser?.uid || 'anonymous';
  const currentReceiptName = getUserReceiptName(activeUser);
  const resolvedIssuerName = resolveNewVoucherIssuerName(activeUser);
  const isGeneralManager =
    activeUser?.role === 'general_manager' || activeUser?.role === 'admin';
  const draftStorageKey = `dmtc_voucher_draft_${activeUser?.uid || 'guest'}`;
  const idleSessionDraftKey = `${IDLE_DRAFT_STORAGE_PREFIX}${activeUser?.uid || 'guest'}`;

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [approvalNumber, setApprovalNumber] = useState('');
  const [delegateNumber, setDelegateNumber] = useState('');
  const [organization, setOrganization] = useState('');
  const [ticketsCount, setTicketsCount] = useState('');
  const [pilgrimsCount, setPilgrimsCount] = useState('');
  const [directionFrom, setDirectionFrom] = useState('');
  const [directionTo, setDirectionTo] = useState('');
  const [loadingLocation, setLoadingLocation] = useState('');
  const [hotelName, setHotelName] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [notes, setNotes] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [receiverMobile, setReceiverMobile] = useState('');
  const [receiverId, setReceiverId] = useState('');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [hijriDate, setHijriDate] = useState(() => computeHijriDDMMYYYY(format(new Date(), 'yyyy-MM-dd')));
  const [showMobileShortcuts, setShowMobileShortcuts] = useState(false);

  // Suggestions & office->organization mapping
  const [history, setHistory] = useState<{
    receiverNames: string[];
    receiverMobiles: string[];
    receiverIds: string[];
    delegateNumbers: string[];
    organizations: string[];
  }>({
    receiverNames: [],
    receiverMobiles: [],
    receiverIds: [],
    delegateNumbers: [],
    organizations: [],
  });
  const [officeToOrgMap, setOfficeToOrgMap] = useState<Record<string, string>>({});
  const [activeSuggestionField, setActiveSuggestionField] = useState<string | null>(null);

  // Restore saved draft if present (prioritize sessionStorage draft saved before idle logout)
  useEffect(() => {
    try {
      let rawDraft: string | null = null;
      let restoredFromSession = false;

      const sessionDraftByUid = sessionStorage.getItem(idleSessionDraftKey);
      const sessionDraftLatest = sessionStorage.getItem(IDLE_DRAFT_LATEST_KEY);
      if (sessionDraftByUid) {
        rawDraft = sessionDraftByUid;
        restoredFromSession = true;
      } else if (sessionDraftLatest) {
        try {
          const parsedLatest = JSON.parse(sessionDraftLatest);
          if (!parsedLatest?.uid || parsedLatest.uid === activeUserUid) {
            rawDraft = sessionDraftLatest;
            restoredFromSession = true;
          }
        } catch {
          // ignore invalid latest session draft
        }
      }

      if (!rawDraft) {
        rawDraft = localStorage.getItem(draftStorageKey);
      }

      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        if (draft.approvalNumber) setApprovalNumber(draft.approvalNumber);
        if (draft.delegateNumber) setDelegateNumber(draft.delegateNumber);
        if (draft.organization) setOrganization(draft.organization);
        if (draft.ticketsCount) setTicketsCount(draft.ticketsCount);
        if (draft.pilgrimsCount) setPilgrimsCount(draft.pilgrimsCount);
        if (draft.directionFrom) setDirectionFrom(draft.directionFrom);
        if (draft.directionTo) setDirectionTo(draft.directionTo);
        if (draft.loadingLocation) setLoadingLocation(draft.loadingLocation);
        if (draft.hotelName) setHotelName(draft.hotelName);
        if (draft.eventTime) setEventTime(draft.eventTime);
        if (draft.notes) setNotes(draft.notes);
        if (draft.receiverName) setReceiverName(draft.receiverName);
        if (draft.receiverMobile) {
          setReceiverMobile(normalizeSaudiMobile(draft.receiverMobile, { finalize: true }));
        }
        if (draft.receiverId) {
          setReceiverId(toEnglishDigits(String(draft.receiverId)).replace(/[^0-9]/g, ''));
        }
        if (draft.customDate) setCustomDate(draft.customDate);
        if (Array.isArray(draft.selectedBuses)) setSelectedBuses(draft.selectedBuses);

        if (restoredFromSession) {
          setStatus({ type: 'success', msg: 'تمت استعادة مسودة السند المحفوظة قبل انتهاء الجلسة' });
        }
      }
    } catch {
      // ignore corrupted draft
    }
  }, [draftStorageKey, idleSessionDraftKey, activeUserUid]);

  useEffect(() => {
    const q = query(collection(db, 'vouchers'), orderBy('timestamp', 'desc'), limit(100));
    getDocs(q).then((snap) => {
      const names = new Set<string>();
      const mobiles = new Set<string>();
      const ids = new Set<string>();
      const delegates = new Set<string>();
      const orgs = new Set<string>();
      const officeMap: Record<string, string> = {};

      snap.forEach((docSnap) => {
        const d = docSnap.data();
        if (d.receiverName) names.add(d.receiverName);
        if (d.receiverMobile) mobiles.add(d.receiverMobile);
        if (d.receiverId) ids.add(d.receiverId);
        if (d.delegateNumber) {
          const officeNum = toEnglishDigits(String(d.delegateNumber)).trim();
          delegates.add(officeNum);
          if (d.organization && String(d.organization).trim() && !officeMap[officeNum]) {
            officeMap[officeNum] = String(d.organization).trim();
          }
        }
        if (d.organization) orgs.add(d.organization);
      });

      setOfficeToOrgMap(officeMap);
      setHistory({
        receiverNames: Array.from(names).slice(0, 10),
        receiverMobiles: Array.from(mobiles).slice(0, 10),
        receiverIds: Array.from(ids).slice(0, 10),
        delegateNumbers: Array.from(delegates).slice(0, 10),
        organizations: Array.from(orgs).slice(0, 10),
      });
    });
  }, []);

  // Automatically calculate Hijri date in DD/MM/YYYY (e.g. DD/MM/1448) from Gregorian date + configured offset
  const [hijriOffsetDays, setHijriOffsetDays] = useState<number>(DEFAULT_HIJRI_OFFSET_DAYS);
  const [activeSeason, setActiveSeason] = useState<string>(DEFAULT_ACTIVE_SEASON);
  const [logoUrl, setLogoUrl] = useState<string>('/logo.png');
  const [sloganUrl, setSloganUrl] = useState<string>('');
  const [sloganHeightMm, setSloganHeightMm] = useState<number>(DEFAULT_SLOGAN_HEIGHT_MM);
  const [printCopies, setPrintCopies] = useState<number>(1);
  const [printCopyLabels, setPrintCopyLabels] = useState<string[]>([...DEFAULT_PRINT_COPY_LABELS]);
  const [companyAddress, setCompanyAddress] = useState<string>(DEFAULT_COMPANY_ADDRESS);
  const [companyWebsite, setCompanyWebsite] = useState<string>(DEFAULT_COMPANY_WEBSITE);
  const [companyPhone, setCompanyPhone] = useState<string>(DEFAULT_COMPANY_PHONE);
  const [printTwoCopies, setPrintTwoCopies] = useState<boolean>(false);
  const [pdfMargins, setPdfMargins] = useState<PdfMargins>({ ...DEFAULT_PDF_MARGINS });

  useEffect(() => {
    const formatted = computeHijriDDMMYYYY(customDate, hijriOffsetDays);
    if (formatted) {
      setHijriDate(formatted);
    }
  }, [customDate, hijriOffsetDays]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isLegacyExporting, setIsLegacyExporting] = useState(false);
  const [issuedDisplayNumber, setIssuedDisplayNumber] = useState<number | null>(null);
  const [lastIssuedVoucher, setLastIssuedVoucher] = useState<any | null>(null);
  const [printAlert, setPrintAlert] = useState<{
    type: 'popup_blocked' | 'error';
    msg: string;
    blobUrl?: string;
  } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });
  const [buses, setBuses] = useState<Record<string, { driverName: string; busType: string; driverPhone?: string }>>({});
  const [selectedBuses, setSelectedBuses] = useState<
    {
      busNumber: string;
      driverName: string;
      busType: string;
      driverPhone: string;
      notes?: string;
      overrideReason?: string;
      overriddenVoucherNumber?: string | number;
    }[]
  >([]);

  // Duplicate bus assignment guard state (busAssignments/{busNumber})
  const [isCheckingBus, setIsCheckingBus] = useState(false);
  const [busConflict, setBusConflict] = useState<{
    busNumber: string;
    voucherNumber: string | number;
    officeLabel: string;
    busData: { busNumber: string; driverName: string; busType: string; driverPhone: string };
  } | null>(null);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [overrideReasonInput, setOverrideReasonInput] = useState('');
  const [overrideReasonError, setOverrideReasonError] = useState('');

  // Touched / submission validation state
  const [touched, setTouched] = useState<{
    receiverName: boolean;
    receiverMobile: boolean;
    receiverId: boolean;
    delegateNumber: boolean;
    buses: boolean;
    driverPhone: boolean;
  }>({
    receiverName: false,
    receiverMobile: false,
    receiverId: false,
    delegateNumber: false,
    buses: false,
    driverPhone: false,
  });
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const markFieldTouched = (field: keyof typeof touched) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  };

  // Report ongoing save/print/check operations as activity to pause idle logout
  useEffect(() => {
    if (!(isSubmitting || isPrinting || isLegacyExporting || isCheckingBus)) return;
    const endBusy = beginBusyActivity();
    return () => endBusy();
  }, [isSubmitting, isPrinting, isLegacyExporting, isCheckingBus]);

  // Keep latest in-progress voucher fields for synchronous sessionStorage backup on idle timeout
  const saveDraftToSessionRef = useRef<() => void>(() => {});
  saveDraftToSessionRef.current = () => {
    try {
      const hasAnyData = Boolean(
        approvalNumber.trim() ||
          delegateNumber.trim() ||
          organization.trim() ||
          ticketsCount.trim() ||
          pilgrimsCount.trim() ||
          directionFrom.trim() ||
          directionTo.trim() ||
          loadingLocation.trim() ||
          hotelName.trim() ||
          eventTime.trim() ||
          notes.trim() ||
          receiverName.trim() ||
          receiverMobile.trim() ||
          receiverId.trim() ||
          selectedBuses.length > 0
      );

      if (!hasAnyData) {
        sessionStorage.removeItem(idleSessionDraftKey);
        sessionStorage.removeItem(IDLE_DRAFT_LATEST_KEY);
        return;
      }

      const payload = JSON.stringify({
        uid: activeUserUid,
        approvalNumber,
        delegateNumber,
        organization,
        ticketsCount,
        pilgrimsCount,
        directionFrom,
        directionTo,
        loadingLocation,
        hotelName,
        eventTime,
        notes,
        receiverName,
        receiverMobile: normalizeSaudiMobile(receiverMobile, { finalize: true }),
        receiverId: toEnglishDigits(receiverId).replace(/[^0-9]/g, ''),
        customDate,
        selectedBuses,
        savedAt: new Date().toISOString(),
      });
      sessionStorage.setItem(idleSessionDraftKey, payload);
      sessionStorage.setItem(IDLE_DRAFT_LATEST_KEY, payload);
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    const saver = () => saveDraftToSessionRef.current();
    registerVoucherDraftSaver(saver);
    return () => {
      saver();
      registerVoucherDraftSaver(null);
    };
  }, []);

  useEffect(() => {
    const unsubBuses = onSnapshot(
      collection(db, 'buses'),
      (snapshot) => {
        const data: Record<string, { driverName: string; busType: string; driverPhone?: string }> = {};
        snapshot.forEach((docSnap) => {
          const busData = docSnap.data();
          data[docSnap.id] = {
            driverName: busData.driverName,
            busType: busData.busType || 'غير محدد',
            driverPhone: busData.driverPhone || '',
          };
        });
        setBuses(data);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'buses')
    );

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'app'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setLogoUrl(data.logoUrl || '/logo.png');
          setSloganUrl(data.sloganUrl || '');
          setSloganHeightMm(normalizeSloganHeightMm(data.sloganHeightMm));
          setPdfMargins(normalizePdfMargins(data.pdfMargins));
          setHijriOffsetDays(normalizeHijriOffsetDays(data.hijriOffsetDays));
          setActiveSeason(normalizeActiveSeason(data.activeSeason));
          setPrintCopies(normalizePrintCopies(data.printCopies));
          setPrintCopyLabels(normalizePrintCopyLabels(data.printCopyLabels));
          setCompanyAddress(
            typeof data.companyAddress === 'string' && data.companyAddress.trim()
              ? data.companyAddress.trim()
              : DEFAULT_COMPANY_ADDRESS
          );
          setCompanyWebsite(
            typeof data.companyWebsite === 'string' && data.companyWebsite.trim()
              ? data.companyWebsite.trim()
              : DEFAULT_COMPANY_WEBSITE
          );
          setCompanyPhone(typeof data.companyPhone === 'string' ? data.companyPhone.trim() : DEFAULT_COMPANY_PHONE);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/app')
    );

    return () => {
      unsubBuses();
      unsubSettings();
    };
  }, []);

  // Read-only automatic buses quantity derived from added buses
  const busesQuantity = selectedBuses.length.toString();

  useEffect(() => {
    if (busNumber && buses[busNumber]) {
      setDriverName(buses[busNumber].driverName);
      setDriverPhone(normalizeSaudiMobile(buses[busNumber].driverPhone || '', { finalize: true }));
    } else {
      setDriverName('');
      setDriverPhone('');
    }
  }, [busNumber, buses]);

  const handleDelegateNumberChange = (rawVal: string) => {
    setIssuedDisplayNumber(null);
    const clean = toEnglishDigits(rawVal).replace(/[^0-9]/g, '');
    setDelegateNumber(clean);
    if (clean && officeToOrgMap[clean]) {
      setOrganization(officeToOrgMap[clean]);
    }
  };

  const handleReceiverMobileChange = (rawVal: string) => {
    setIssuedDisplayNumber(null);
    const normalized = normalizeSaudiMobile(rawVal, { finalize: false });
    setReceiverMobile(normalized);
  };

  const handleReceiverMobileBlur = () => {
    markFieldTouched('receiverMobile');
    setReceiverMobile((prev) => normalizeSaudiMobile(prev, { finalize: true }));
    setTimeout(() => setActiveSuggestionField(null), 200);
  };

  const handleDriverPhoneChange = (rawVal: string) => {
    setDriverPhone(normalizeSaudiMobile(rawVal, { finalize: false }));
  };

  const handleDriverPhoneBlur = () => {
    markFieldTouched('driverPhone');
    setDriverPhone((prev) => normalizeSaudiMobile(prev, { finalize: true }));
  };

  // Field validations
  const receiverNameError = !receiverName.trim() ? 'اسم المستلم مطلوب' : null;
  const receiverMobileError = validateReceiverMobile(receiverMobile);
  const receiverIdValidation = validateReceiverId(receiverId);
  const receiverIdError = receiverIdValidation.error;
  const receiverIdWarning = receiverIdValidation.warning;
  const delegateNumberError = !delegateNumber.trim() ? 'رقم المكتب مطلوب' : null;
  const busesCountError = selectedBuses.length < 1 ? 'يجب إضافة حافلة واحدة على الأقل' : null;
  const driverPhoneWarning = validateDriverPhoneWarning(driverPhone);

  const redErrors: { key: keyof typeof touched; message: string }[] = [];
  if (receiverNameError) redErrors.push({ key: 'receiverName', message: receiverNameError });
  if (receiverMobileError) redErrors.push({ key: 'receiverMobile', message: receiverMobileError });
  if (receiverIdError) redErrors.push({ key: 'receiverId', message: receiverIdError });
  if (delegateNumberError) redErrors.push({ key: 'delegateNumber', message: delegateNumberError });
  if (busesCountError) redErrors.push({ key: 'buses', message: busesCountError });

  const showReceiverNameError = Boolean(receiverNameError && (touched.receiverName || submitAttempted));
  const showReceiverMobileError = Boolean(receiverMobileError && (touched.receiverMobile || submitAttempted));
  const showReceiverIdError = Boolean(receiverIdError && (touched.receiverId || submitAttempted));
  const showDelegateNumberError = Boolean(delegateNumberError && (touched.delegateNumber || submitAttempted));
  const showBusesError = Boolean(busesCountError && (touched.buses || submitAttempted));

  const addBusToList = async () => {
    const cleanBusNum = toEnglishDigits(busNumber).trim();
    if (!cleanBusNum || isCheckingBus) return;

    setIssuedDisplayNumber(null);
    setBusConflict(null);
    setShowOverrideForm(false);
    setOverrideReasonInput('');
    setOverrideReasonError('');

    const currentBus = buses[cleanBusNum];
    if (!currentBus || !driverName) {
      setStatus({ type: 'error', msg: 'رقم الحافلة غير مسجل في النظام' });
      return;
    }

    if (selectedBuses.some((b) => b.busNumber === cleanBusNum)) {
      setStatus({ type: 'error', msg: 'هذه الحافلة موجودة بالفعل في القائمة' });
      return;
    }

    if (!navigator.onLine) {
      setStatus({ type: 'error', msg: 'الإصدار يحتاج اتصالاً بالإنترنت لضمان عدم تكرار الرقم' });
      return;
    }

    setIsCheckingBus(true);
    try {
      const conflict = await checkBusActiveAssignment(cleanBusNum);
      if (conflict) {
        const normalizedPhone = normalizeSaudiMobile(driverPhone || currentBus.driverPhone || '', {
          finalize: true,
        });
        setBusConflict({
          busNumber: cleanBusNum,
          voucherNumber: conflict.voucherNumber,
          officeLabel: conflict.officeLabel,
          busData: {
            busNumber: cleanBusNum,
            driverName: currentBus.driverName,
            busType: currentBus.busType,
            driverPhone: normalizedPhone,
          },
        });
        return;
      }

      const normalizedPhone = normalizeSaudiMobile(driverPhone || currentBus.driverPhone || '', {
        finalize: true,
      });
      setSelectedBuses((prev) => [
        ...prev,
        {
          busNumber: cleanBusNum,
          driverName: currentBus.driverName,
          busType: currentBus.busType,
          driverPhone: normalizedPhone,
          notes: '',
        },
      ]);
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setStatus({ type: null, msg: '' });
    } catch (err) {
      console.error('Error checking busAssignments:', err);
      setStatus({ type: 'error', msg: 'تعذّر التحقق من حالة الحافلة. تأكد من الاتصال بالإنترنت.' });
    } finally {
      setIsCheckingBus(false);
    }
  };

  const handleConfirmBusOverride = () => {
    if (!isGeneralManager || !busConflict) return;
    const trimmedReason = overrideReasonInput.trim();
    if (trimmedReason.length < 5) {
      setOverrideReasonError('يجب كتابة سبب التجاوز (5 أحرف على الأقل)');
      return;
    }

    setSelectedBuses((prev) => {
      if (prev.some((b) => b.busNumber === busConflict.busNumber)) return prev;
      return [
        ...prev,
        {
          ...busConflict.busData,
          notes: '',
          overrideReason: trimmedReason,
          overriddenVoucherNumber: busConflict.voucherNumber,
        },
      ];
    });
    setBusConflict(null);
    setShowOverrideForm(false);
    setOverrideReasonInput('');
    setOverrideReasonError('');
    setBusNumber('');
    setDriverName('');
    setDriverPhone('');
    setStatus({ type: null, msg: '' });
  };

  const removeBusFromList = (index: number) => {
    setSelectedBuses(selectedBuses.filter((_, i) => i !== index));
    markFieldTouched('buses');
  };

  const handleSaveDraft = () => {
    try {
      const draftData = {
        approvalNumber,
        delegateNumber,
        organization,
        ticketsCount,
        pilgrimsCount,
        directionFrom,
        directionTo,
        loadingLocation,
        hotelName,
        eventTime,
        notes,
        receiverName,
        receiverMobile: normalizeSaudiMobile(receiverMobile, { finalize: true }),
        receiverId: toEnglishDigits(receiverId).replace(/[^0-9]/g, ''),
        customDate,
        selectedBuses,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draftData));
      setStatus({ type: 'success', msg: 'تم حفظ المسودة محلياً بنجاح' });
    } catch {
      setStatus({ type: 'error', msg: 'تعذر حفظ المسودة محلياً' });
    }
  };

  const handleRegister = async () => {
    if (isSubmitting) return;

    if (!navigator.onLine) {
      setStatus({
        type: 'error',
        msg: 'الإصدار يحتاج اتصالاً بالإنترنت لضمان عدم تكرار الرقم',
      });
      return;
    }

    setSubmitAttempted(true);
    const normalizedMobile = normalizeSaudiMobile(receiverMobile, { finalize: true });
    if (normalizedMobile !== receiverMobile) {
      setReceiverMobile(normalizedMobile);
    }

    const mobileErr = validateReceiverMobile(normalizedMobile);
    const idRes = validateReceiverId(receiverId);
    const hasErrorsNow =
      !receiverName.trim() ||
      Boolean(mobileErr) ||
      Boolean(idRes.error) ||
      !delegateNumber.trim() ||
      selectedBuses.length < 1;

    if (hasErrorsNow) {
      setStatus({
        type: 'error',
        msg: 'يرجى تصحيح الحقول المطلوبة المحددة باللون الأحمر قبل الإصدار',
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: null, msg: '' });
    setPrintAlert(null);

    // Open print window synchronously while user click gesture is active (only rendered after transaction commits)
    const preOpenedWindow = window.open('', '_blank');

    const closePreOpenedWindow = () => {
      if (preOpenedWindow && !preOpenedWindow.closed) {
        try {
          preOpenedWindow.close();
        } catch {
          // ignore
        }
      }
    };

    try {
      const now = new Date();
      const timestamp = now.toISOString();
      const dateKey = customDate || format(now, 'yyyy-MM-dd');
      const cleanId = toEnglishDigits(receiverId).replace(/[^0-9]/g, '');
      const cleanOfficeNo = toEnglishDigits(delegateNumber).trim();
      const cleanOrg = organization.trim();

      const sanitizedBuses = selectedBuses.map((b) => {
        const entry: any = {
          busNumber: toEnglishDigits(b.busNumber).trim(),
          driverName: b.driverName,
          busType: b.busType || 'حافلة',
          driverPhone: normalizeSaudiMobile(b.driverPhone || '', { finalize: true }),
          notes: b.notes || '',
        };
        if (b.overrideReason) {
          entry.overrideReason = b.overrideReason;
          if (b.overriddenVoucherNumber !== undefined) {
            entry.overriddenVoucherNumber = b.overriddenVoucherNumber;
          }
        }
        return entry;
      });

      const overridesList = sanitizedBuses
        .filter((b) => b.overrideReason)
        .map((b) => ({
          busNumber: b.busNumber,
          previousVoucherNumber: Number(b.overriddenVoucherNumber) || 0,
          reason: b.overrideReason,
        }));

      const combinedOverrideReason = overridesList
        .map((o) => `حافلة ${o.busNumber}: ${o.reason}`)
        .join(' | ')
        .slice(0, 500);

      const counterRef = doc(db, 'counters', 'vouchers');
      const initialCounterSnap = await getDoc(counterRef);
      let maxExistingVoucherNumber = 0;

      if (!initialCounterSnap.exists()) {
        const allVouchersSnap = await getDocs(collection(db, 'vouchers'));
        allVouchersSnap.forEach((docSnap) => {
          const vNum = Number(docSnap.data()?.voucherNumber);
          if (Number.isFinite(vNum) && vNum > maxExistingVoucherNumber) {
            maxExistingVoucherNumber = vNum;
          }
        });
      }

      const voucherBasePayload: any = {
        approvalNumber: toEnglishDigits(approvalNumber).trim(),
        delegateNumber: cleanOfficeNo,
        organization: cleanOrg,
        busesQuantity: sanitizedBuses.length.toString(),
        ticketsCount: toEnglishDigits(ticketsCount).replace(/[^0-9]/g, '') || '0',
        pilgrimsCount: toEnglishDigits(pilgrimsCount).replace(/[^0-9]/g, '') || '0',
        directionFrom: directionFrom || '',
        directionTo: directionTo || '',
        loadingLocation: loadingLocation || '',
        hotelName: hotelName || '',
        eventTime: toEnglishDigits(eventTime).trim(),
        busNumber: sanitizedBuses[0]?.busNumber || '',
        driverName: sanitizedBuses[0]?.driverName || '',
        driverPhone: sanitizedBuses[0]?.driverPhone || '',
        busType: sanitizedBuses[0]?.busType || 'غير محدد',
        buses: sanitizedBuses,
        timestamp,
        hijriDate: hijriDate || '',
        hajjSeason: activeSeason,
        seasonName: `موسم حج ${activeSeason} هـ`,
        archived: false,
        customDate: customDate || dateKey,
        dateKey: customDate || dateKey,
        notes: notes || '',
        receiverName: receiverName.trim(),
        receiverMobile: normalizedMobile,
        receiverId: cleanId,
        deviceName: window.navigator.userAgent.substring(0, 50),
        userId: activeUserUid,
        userName: resolvedIssuerName,
        issuedByName: resolvedIssuerName,
        issuedByUid: activeUserUid,
      };

      if (overridesList.length > 0 && combinedOverrideReason.length >= 5) {
        voucherBasePayload.overrideReason = combinedOverrideReason;
        voucherBasePayload.duplicateOverrides = overridesList;
      }

      const actualVoucherNumber = await runTransaction(db, async (transaction) => {
        const counterSnap = await transaction.get(counterRef);
        const busAssignRefs = sanitizedBuses.map((b) => doc(db, 'busAssignments', b.busNumber));
        const busAssignSnaps = await Promise.all(busAssignRefs.map((ref) => transaction.get(ref)));

        for (let i = 0; i < sanitizedBuses.length; i++) {
          const bus = sanitizedBuses[i];
          const assignSnap = busAssignSnaps[i];
          if (assignSnap.exists()) {
            const assignData = assignSnap.data();
            const hasValidOverride =
              isGeneralManager &&
              typeof bus.overrideReason === 'string' &&
              bus.overrideReason.trim().length >= 5;

            if (assignData.status === 'active' && !hasValidOverride) {
              const officeLabel = formatOfficeLabel(assignData.officeNo, assignData.officeName);
              throw new Error(
                `CONFLICT:${buildBusConflictMessage(bus.busNumber, assignData.voucherNumber ?? '—', officeLabel)}`
              );
            }
          }
        }

        const currentLast = counterSnap.exists()
          ? Number(counterSnap.data().last) || 0
          : maxExistingVoucherNumber;
        const nextVoucherNumber = currentLast + 1;

        const newVoucherRef = doc(collection(db, 'vouchers'));
        const finalVoucherRecord = {
          ...voucherBasePayload,
          voucherNumber: nextVoucherNumber,
        };

        transaction.set(counterRef, { last: nextVoucherNumber }, { merge: true });
        transaction.set(newVoucherRef, finalVoucherRecord);

        for (let i = 0; i < sanitizedBuses.length; i++) {
          transaction.set(busAssignRefs[i], {
            voucherId: newVoucherRef.id,
            voucherNumber: nextVoucherNumber,
            officeNo: cleanOfficeNo.slice(0, 40),
            officeName: cleanOrg.slice(0, 200),
            createdAt: serverTimestamp(),
            status: 'active',
            releasedAt: null,
            releaseReason: null,
          });
        }

        return nextVoucherNumber;
      });

      const fullData = {
        ...voucherBasePayload,
        voucherNumber: actualVoucherNumber,
        logoUrl,
        sloganUrl,
        sloganHeightMm,
        pdfMargins,
        hijriOffsetDays,
        printCopies,
        printCopyLabels,
        companyAddress,
        companyWebsite,
        companyPhone,
      };

      setIssuedDisplayNumber(actualVoucherNumber);
      setLastIssuedVoucher(fullData);
      setStatus({ type: 'success', msg: `تم إصدار السند رقم ${actualVoucherNumber} بنجاح` });

      try {
        localStorage.removeItem(draftStorageKey);
        sessionStorage.removeItem(idleSessionDraftKey);
        sessionStorage.removeItem(IDLE_DRAFT_LATEST_KEY);
      } catch {
        // ignore storage errors
      }

      // Reset form inputs after successful save while keeping issuedDisplayNumber & lastIssuedVoucher visible
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setSelectedBuses([]);
      setBusConflict(null);
      setShowOverrideForm(false);
      setOverrideReasonInput('');
      setOverrideReasonError('');
      setApprovalNumber('');
      setDelegateNumber('');
      setOrganization('');
      setTicketsCount('');
      setPilgrimsCount('');
      setDirectionFrom('');
      setDirectionTo('');
      setLoadingLocation('');
      setHotelName('');
      setEventTime('');
      setNotes('');
      setReceiverName('');
      setReceiverMobile('');
      setReceiverId('');
      setTouched({
        receiverName: false,
        receiverMobile: false,
        receiverId: false,
        delegateNumber: false,
        buses: false,
        driverPhone: false,
      });
      setSubmitAttempted(false);

      // Print is triggered ONLY after transaction succeeds
      setIsPrinting(true);
      try {
        const printRes = await generateVoucherPDF(fullData, {
          save: true,
          print: true,
          twoCopies: printTwoCopies,
          targetWindow: preOpenedWindow,
        });
        if (printRes.status === 'popup_blocked') {
          setPrintAlert({
            type: 'popup_blocked',
            msg: 'اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة',
            blobUrl: printRes.blobUrl,
          });
        }
      } catch (printErr) {
        console.error('Print Error:', printErr);
        closePreOpenedWindow();
        setPrintAlert({
          type: 'error',
          msg: 'تم حفظ السند بنجاح، لكن تعذّر فتح نافذة الطباعة. يمكنك استخدام التصدير البديل لحفظ السند كملف PDF.',
        });
      } finally {
        setIsPrinting(false);
      }
    } catch (error: any) {
      closePreOpenedWindow();
      const rawMsg = error instanceof Error ? error.message : String(error);
      if (rawMsg.startsWith('CONFLICT:')) {
        setStatus({ type: 'error', msg: rawMsg.replace('CONFLICT:', '') });
      } else {
        setStatus({
          type: 'error',
          msg: 'فشل حفظ السند ولم يتم استهلاك أي رقم. تأكد من الاتصال بالإنترنت وحاول مرة أخرى.',
        });
      }
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintLastIssued = async () => {
    if (!lastIssuedVoucher || isPrinting) return;
    setIsPrinting(true);
    setPrintAlert(null);
    try {
      const printRes = await generateVoucherPDF(lastIssuedVoucher, {
        save: true,
        print: true,
        twoCopies: printTwoCopies,
      });
      if (printRes.status === 'popup_blocked') {
        setPrintAlert({
          type: 'popup_blocked',
          msg: 'اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة',
          blobUrl: printRes.blobUrl,
        });
      }
    } catch (err) {
      console.error('Reprint Error:', err);
      setPrintAlert({
        type: 'error',
        msg: 'تعذّر فتح نافذة الطباعة. يمكنك استخدام التصدير البديل لحفظ السند كملف PDF.',
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleLegacyExport = async () => {
    if (!lastIssuedVoucher) {
      setPrintAlert({
        type: 'error',
        msg: 'لا تتفعّل الطباعة أو التصدير إلا بعد إصدار السند وحفظه بنجاح.',
      });
      return;
    }

    setIsLegacyExporting(true);
    try {
      await exportVoucherLegacyPDF(lastIssuedVoucher, { save: true, twoCopies: printTwoCopies });
    } catch (err) {
      console.error('Legacy PDF Export Error:', err);
      setPrintAlert({
        type: 'error',
        msg: 'حدث خطأ أثناء التصدير البديل لملف PDF.',
      });
    } finally {
      setIsLegacyExporting(false);
    }
  };

  const isFormDirty =
    approvalNumber !== '' ||
    delegateNumber !== '' ||
    organization !== '' ||
    ticketsCount !== '' ||
    pilgrimsCount !== '' ||
    directionFrom !== '' ||
    directionTo !== '' ||
    loadingLocation !== '' ||
    hotelName !== '' ||
    eventTime !== '' ||
    notes !== '' ||
    busNumber !== '' ||
    driverPhone !== '' ||
    receiverName !== '' ||
    receiverMobile !== '' ||
    receiverId !== '' ||
    selectedBuses.length > 0;

  const handleClear = () => {
    if (window.confirm('هل أنت متأكد من مسح كافة البيانات المدخلة في هذا السند؟')) {
      setIssuedDisplayNumber(null);
      setApprovalNumber('');
      setDelegateNumber('');
      setOrganization('');
      setTicketsCount('');
      setPilgrimsCount('');
      setDirectionFrom('');
      setDirectionTo('');
      setLoadingLocation('');
      setHotelName('');
      setEventTime('');
      setNotes('');
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setSelectedBuses([]);
      setBusConflict(null);
      setShowOverrideForm(false);
      setOverrideReasonInput('');
      setOverrideReasonError('');
      setReceiverName('');
      setReceiverMobile('');
      setReceiverId('');
      setTouched({
        receiverName: false,
        receiverMobile: false,
        receiverId: false,
        delegateNumber: false,
        buses: false,
        driverPhone: false,
      });
      setSubmitAttempted(false);
      const today = format(new Date(), 'yyyy-MM-dd');
      setCustomDate(today);
      setHijriDate(computeHijriDDMMYYYY(today, hijriOffsetDays));
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore
      }
      setStatus({ type: null, msg: '' });
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isSubmitting) {
          handleRegister();
        }
      }

      if (e.altKey && (e.key === 'c' || e.key === 'C' || e.key === 'ؤ')) {
        e.preventDefault();
        if (isFormDirty) {
          handleClear();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isSubmitting,
    isOnline,
    selectedBuses,
    busNumber,
    driverName,
    driverPhone,
    buses,
    isFormDirty,
    approvalNumber,
    delegateNumber,
    organization,
    ticketsCount,
    pilgrimsCount,
    directionFrom,
    directionTo,
    loadingLocation,
    hotelName,
    eventTime,
    notes,
    receiverName,
    receiverMobile,
    receiverId,
    customDate,
    hijriDate,
    activeUser,
    resolvedIssuerName,
    activeUserUid,
    logoUrl,
    sloganUrl,
    sloganHeightMm,
    pdfMargins,
    hijriOffsetDays,
    activeSeason,
    printCopies,
    printCopyLabels,
    companyAddress,
    companyWebsite,
    companyPhone,
    printTwoCopies,
  ]);

  const inputClass =
    'w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl hover:border-slate-300 dark:hover:border-slate-600 focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/15 focus:border-[var(--primary)] outline-none transition-all font-semibold text-[var(--text)] text-sm';

  const errorInputClass =
    'w-full px-[var(--space-4)] py-[var(--space-3)] bg-red-50/40 dark:bg-red-950/20 border-2 border-red-500 rounded-2xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-red-500/15 focus:border-red-600 outline-none transition-all font-semibold text-[var(--text)] text-sm';

  const warningInputClass =
    'w-full px-[var(--space-4)] py-[var(--space-3)] bg-amber-50/40 dark:bg-amber-950/20 border border-amber-400 dark:border-amber-600 rounded-2xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-amber-500/15 focus:border-amber-500 outline-none transition-all font-semibold text-[var(--text)] text-sm';

  const hasRedErrors = redErrors.length > 0;
  const canSubmit = !isSubmitting && isOnline && !hasRedErrors;

  return (
    <div className="w-full max-w-5xl mx-auto px-[var(--space-2)] sm:px-[var(--space-4)] pt-[var(--space-1)] sm:pt-[var(--space-2)] pb-[var(--space-6)]">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="bg-[var(--surface)] rounded-3xl border border-[var(--border)] shadow-xs p-[var(--space-5)] sm:p-[var(--space-8)] lg:p-10 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]" />

        {/* Header Row */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-5)] mb-[var(--space-6)] pb-[var(--space-6)] border-b border-[var(--border)]">
          <div className="flex items-center gap-[var(--space-4)]">
            <div className="w-12 h-12 bg-[var(--navy)] rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0 border border-slate-700/40">
              <ClipboardList size={24} className="text-[var(--gold)]" />
            </div>
            <div>
              <div className="flex items-center gap-[var(--space-3)]">
                <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--text)]">
                  إصدار سند جديد
                </h2>
                {/* Mobile/Tablet (<1024px) "?" Shortcut Button */}
                <button
                  type="button"
                  onClick={() => setShowMobileShortcuts((v) => !v)}
                  aria-label="عرض اختصارات لوحة المفاتيح"
                  title="اختصارات لوحة المفاتيح"
                  className="lg:hidden w-8 h-8 rounded-full bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] hover:text-[var(--primary)] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <HelpCircle size={17} />
                </button>
              </div>
              <div className="flex items-center gap-[var(--space-3)] mt-[var(--space-2)]">
                <span className="px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-blue-50 dark:bg-blue-950/60 text-[var(--primary)] font-bold text-xs border border-blue-200/80 dark:border-blue-800 tabular-nums">
                  موسم حج {activeSeason}هـ
                </span>
                <span className={`text-xs font-bold ${isOnline ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
                  {isOnline ? 'جاهز للترحيل' : 'غير متصل بالإنترنت'}
                </span>
              </div>
            </div>
          </div>

          {/* Atomic Voucher Number Box: "يُخصَّص عند الحفظ" before save, final number after save */}
          <div className="bg-[var(--surface-subtle)] px-[var(--space-5)] py-[var(--space-3)] rounded-2xl border border-[var(--border)] flex flex-col items-end min-w-[175px]">
            <span className="text-[11px] text-[var(--text-secondary)] font-bold block mb-[var(--space-1)]">
              {issuedDisplayNumber !== null ? 'رقم السند النهائي (تم الحفظ)' : 'رقم السند'}
            </span>
            {issuedDisplayNumber !== null ? (
              <div className="flex items-center gap-[var(--space-2)]">
                <span className="text-[var(--gold-text)] font-mono font-bold text-lg">#</span>
                <span
                  className="text-xl font-mono font-extrabold tabular-nums text-[var(--success)]"
                  lang="en"
                  dir="ltr"
                >
                  {issuedDisplayNumber}
                </span>
              </div>
            ) : (
              <span className="text-sm font-extrabold text-[var(--primary)]">
                يُخصَّص عند الحفظ
              </span>
            )}
          </div>
        </div>

        {/* Receipt Issuer Name Status Line */}
        {currentReceiptName ? (
          <div className="mb-[var(--space-5)] flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)]">
            <UserIcon size={14} className="text-[var(--primary)] shrink-0" />
            <span>سيصدر السند باسم:</span>
            <span className="font-extrabold text-[var(--primary)]">{currentReceiptName}</span>
          </div>
        ) : !isGeneralManager ? (
          <div className="mb-[var(--space-5)] px-[var(--space-4)] py-[var(--space-2)] rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 flex items-center gap-[var(--space-2)] text-xs font-bold text-amber-700 dark:text-amber-300">
            <AlertCircle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span>لم يُحدد اسمك في السند، راجع المدير العام</span>
          </div>
        ) : (
          <div className="mb-[var(--space-5)] flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)]">
            <UserIcon size={14} className="text-[var(--primary)] shrink-0" />
            <span>سيصدر السند باسم:</span>
            {resolvedIssuerName ? (
              <span className="font-extrabold text-[var(--primary)]">{resolvedIssuerName}</span>
            ) : (
              <span className="font-bold text-amber-600 dark:text-amber-400">لم يُحدد بعد</span>
            )}
          </div>
        )}

        {/* Mobile/Tablet (<1024px) Shortcuts Popover toggled by "?" */}
        <AnimatePresence>
          {showMobileShortcuts && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="lg:hidden mb-[var(--space-6)] p-[var(--space-4)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs space-y-[var(--space-3)]"
            >
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[var(--text)] flex items-center gap-[var(--space-2)]">
                  <Keyboard size={15} className="text-[var(--primary)]" />
                  اختصارات لوحة المفاتيح
                </span>
                <button
                  type="button"
                  onClick={() => setShowMobileShortcuts(false)}
                  aria-label="إغلاق"
                  className="text-[var(--text-secondary)] hover:text-[var(--text)] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-wrap gap-[var(--space-2)]">
                <div className="inline-flex items-center gap-[var(--space-2)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg font-semibold text-[var(--text)]">
                  <kbd className="font-mono bg-blue-50 dark:bg-blue-950 text-[var(--primary)] px-[var(--space-2)] py-[var(--space-1)] rounded text-[11px] font-bold" dir="ltr">
                    Ctrl + Enter
                  </kbd>
                  <span>إرسال وطباعة</span>
                </div>
                <div className="inline-flex items-center gap-[var(--space-2)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg font-semibold text-[var(--text)]">
                  <kbd className="font-mono bg-amber-50 dark:bg-amber-950 text-[var(--gold-text)] px-[var(--space-2)] py-[var(--space-1)] rounded text-[11px] font-bold" dir="ltr">
                    Enter ↵
                  </kbd>
                  <span>إضافة حافلة</span>
                </div>
                <div className="inline-flex items-center gap-[var(--space-2)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg font-semibold text-[var(--text)]">
                  <kbd className="font-mono bg-[var(--surface-subtle)] text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)] rounded text-[11px] font-bold" dir="ltr">
                    Alt + C
                  </kbd>
                  <span>مسح الحقول</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop (>=1024px) Keyboard Shortcuts Bar */}
        <div className="hidden lg:flex bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl px-[var(--space-5)] py-[var(--space-3)] mb-[var(--space-6)] items-center justify-between gap-[var(--space-3)] text-xs">
          <div className="flex items-center gap-[var(--space-2)] text-[var(--text)] font-bold">
            <Keyboard size={16} className="text-[var(--primary)] shrink-0" />
            <span>اختصارات لوحة المفاتيح:</span>
          </div>
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <div className="inline-flex items-center gap-[var(--space-2)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg text-[var(--text)] font-semibold">
              <kbd className="font-mono bg-blue-50 dark:bg-blue-950 text-[var(--primary)] px-[var(--space-2)] py-[var(--space-1)] rounded border border-blue-200 dark:border-blue-800 text-[11px] font-bold" dir="ltr">
                Ctrl + Enter
              </kbd>
              <span>إرسال وطباعة</span>
            </div>
            <div className="inline-flex items-center gap-[var(--space-2)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg text-[var(--text)] font-semibold">
              <kbd className="font-mono bg-amber-50 dark:bg-amber-950 text-[var(--gold-text)] px-[var(--space-2)] py-[var(--space-1)] rounded border border-amber-200 dark:border-amber-800 text-[11px] font-bold" dir="ltr">
                Enter ↵
              </kbd>
              <span>إضافة حافلة</span>
            </div>
            <div className="inline-flex items-center gap-[var(--space-2)] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg text-[var(--text)] font-semibold">
              <kbd className="font-mono bg-[var(--surface-subtle)] text-[var(--text-secondary)] px-[var(--space-2)] py-[var(--space-1)] rounded border border-[var(--border)] text-[11px] font-bold" dir="ltr">
                Alt + C
              </kbd>
              <span>مسح الحقول</span>
            </div>
          </div>
        </div>

        {/* 2-Column Desktop (--space-6 gap) / Stacked Mobile (--space-8 between sections) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--space-8)] lg:gap-[var(--space-6)]">
          {/* Section 1: بيانات المستلم */}
          <section className="space-y-[var(--space-5)]">
            <div className="pb-[var(--space-3)] border-b border-[var(--border)] flex items-center gap-[var(--space-2)]">
              <UserIcon size={17} className="text-[var(--primary)]" />
              <h3 className="text-base font-extrabold text-[var(--text)]">بيانات المستلم</h3>
            </div>

            <div className="group relative">
              <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                <UserIcon size={14} className="text-[var(--primary)]" />
                اسم المستلم (مندوب الميدان) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={receiverName}
                onFocus={() => setActiveSuggestionField('receiverName')}
                onBlur={() => {
                  markFieldTouched('receiverName');
                  setTimeout(() => setActiveSuggestionField(null), 200);
                }}
                onChange={(e) => {
                  setIssuedDisplayNumber(null);
                  setReceiverName(e.target.value);
                }}
                className={showReceiverNameError ? errorInputClass : inputClass}
                placeholder="أدخل اسم المندوب المستلم..."
              />
              {showReceiverNameError && (
                <p className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                  <AlertCircle size={13} className="shrink-0" />
                  <span>{receiverNameError}</span>
                </p>
              )}
              <AnimatePresence>
                {activeSuggestionField === 'receiverName' &&
                  history.receiverNames.filter((n) => n.includes(receiverName)).length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute z-50 top-full left-0 right-0 mt-[var(--space-2)] bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden"
                    >
                      {history.receiverNames
                        .filter((n) => n.includes(receiverName))
                        .map((name, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setIssuedDisplayNumber(null);
                              setReceiverName(name);
                            }}
                            className="w-full text-right px-[var(--space-4)] py-[var(--space-3)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors border-b border-[var(--border)] last:border-0"
                          >
                            {name}
                          </button>
                        ))}
                    </motion.div>
                  )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-5)]">
              <div className="group relative">
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <Phone size={14} className="text-[var(--primary)]" />
                  رقم موبايل المستلم <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={receiverMobile}
                  onFocus={() => setActiveSuggestionField('receiverMobile')}
                  onBlur={handleReceiverMobileBlur}
                  onChange={(e) => handleReceiverMobileChange(e.target.value)}
                  className={`${showReceiverMobileError ? errorInputClass : inputClass} text-right tabular-nums`}
                  placeholder="05XXXXXXXX"
                />
                {showReceiverMobileError && (
                  <p className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{receiverMobileError}</span>
                  </p>
                )}
                <AnimatePresence>
                  {activeSuggestionField === 'receiverMobile' &&
                    history.receiverMobiles.filter((m) => m.includes(receiverMobile)).length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 top-full left-0 right-0 mt-[var(--space-2)] bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden"
                      >
                        {history.receiverMobiles
                          .filter((m) => m.includes(receiverMobile))
                          .map((mobile, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setIssuedDisplayNumber(null);
                                setReceiverMobile(normalizeSaudiMobile(mobile, { finalize: true }));
                              }}
                              className="w-full text-right px-[var(--space-4)] py-[var(--space-3)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors border-b border-[var(--border)] last:border-0 tabular-nums"
                            >
                              {mobile}
                            </button>
                          ))}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>

              <div className="group relative">
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <CreditCard size={14} className="text-[var(--primary)]" />
                  رقم هوية المستلم <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={receiverId}
                  onFocus={() => setActiveSuggestionField('receiverId')}
                  onBlur={() => {
                    markFieldTouched('receiverId');
                    setTimeout(() => setActiveSuggestionField(null), 200);
                  }}
                  onChange={(e) => {
                    setIssuedDisplayNumber(null);
                    setReceiverId(toEnglishDigits(e.target.value).replace(/[^0-9]/g, ''));
                  }}
                  className={`${
                    showReceiverIdError
                      ? errorInputClass
                      : receiverIdWarning
                      ? warningInputClass
                      : inputClass
                  } text-right tabular-nums`}
                  placeholder="10xxxxxxxx"
                />
                {showReceiverIdError && (
                  <p className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{receiverIdError}</span>
                  </p>
                )}
                {!showReceiverIdError && receiverIdWarning && (
                  <p className="mt-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{receiverIdWarning}</span>
                  </p>
                )}
                <AnimatePresence>
                  {activeSuggestionField === 'receiverId' &&
                    history.receiverIds.filter((id) => id.includes(receiverId)).length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 top-full left-0 right-0 mt-[var(--space-2)] bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden"
                      >
                        {history.receiverIds
                          .filter((id) => id.includes(receiverId))
                          .map((idNum, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => {
                                setIssuedDisplayNumber(null);
                                setReceiverId(toEnglishDigits(idNum).replace(/[^0-9]/g, ''));
                              }}
                              className="w-full text-right px-[var(--space-4)] py-[var(--space-3)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors border-b border-[var(--border)] last:border-0 tabular-nums"
                            >
                              {idNum}
                            </button>
                          ))}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-5)]">
              <div className="group relative">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  رقم المكتب <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={delegateNumber}
                  onFocus={() => setActiveSuggestionField('delegateNumber')}
                  onBlur={() => {
                    markFieldTouched('delegateNumber');
                    setTimeout(() => setActiveSuggestionField(null), 200);
                  }}
                  onChange={(e) => handleDelegateNumberChange(e.target.value)}
                  className={`${showDelegateNumberError ? errorInputClass : inputClass} tabular-nums`}
                  placeholder="رقم المكتب..."
                />
                {showDelegateNumberError && (
                  <p className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{delegateNumberError}</span>
                  </p>
                )}
                <AnimatePresence>
                  {activeSuggestionField === 'delegateNumber' &&
                    history.delegateNumbers.filter((d) => d.includes(delegateNumber)).length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 top-full left-0 right-0 mt-[var(--space-2)] bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden"
                      >
                        {history.delegateNumbers
                          .filter((d) => d.includes(delegateNumber))
                          .map((num, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleDelegateNumberChange(num)}
                              className="w-full text-right px-[var(--space-4)] py-[var(--space-3)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors border-b border-[var(--border)] last:border-0 tabular-nums flex items-center justify-between gap-[var(--space-2)]"
                            >
                              <span>{num}</span>
                              {officeToOrgMap[num] && (
                                <span className="text-[11px] text-[var(--text-muted)] truncate max-w-[140px]">
                                  {officeToOrgMap[num]}
                                </span>
                              )}
                            </button>
                          ))}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>

              <div className="group relative">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  التابع لمؤسسة
                </label>
                <input
                  type="text"
                  value={organization}
                  onFocus={() => setActiveSuggestionField('organization')}
                  onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                  onChange={(e) => setOrganization(e.target.value)}
                  className={inputClass}
                  placeholder="المؤسسة..."
                />
                <AnimatePresence>
                  {activeSuggestionField === 'organization' &&
                    history.organizations.filter((o) => o.includes(organization)).length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute z-50 top-full left-0 right-0 mt-[var(--space-2)] bg-[var(--surface)] rounded-2xl shadow-xl border border-[var(--border)] overflow-hidden"
                      >
                        {history.organizations
                          .filter((o) => o.includes(organization))
                          .map((org, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setOrganization(org)}
                              className="w-full text-right px-[var(--space-4)] py-[var(--space-3)] text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-subtle)] transition-colors border-b border-[var(--border)] last:border-0"
                            >
                              {org}
                            </button>
                          ))}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-5)]">
              <div className="sm:col-span-1">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  عدد التذاكر
                </label>
                <input
                  type="text"
                  value={ticketsCount}
                  onChange={(e) => setTicketsCount(toEnglishDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  className={`${inputClass} tabular-nums`}
                  placeholder="0"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  عدد الحجاج
                </label>
                <input
                  type="text"
                  value={pilgrimsCount}
                  onChange={(e) => setPilgrimsCount(toEnglishDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  className={`${inputClass} tabular-nums`}
                  placeholder="0"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <Layers size={13} className="text-[var(--primary)]" />
                  اعتماد رقم
                </label>
                <input
                  type="text"
                  value={approvalNumber}
                  onChange={(e) => setApprovalNumber(toEnglishDigits(e.target.value))}
                  className={`${inputClass} tabular-nums`}
                  placeholder="رقم الاعتماد..."
                />
              </div>
            </div>
          </section>

          {/* Section 2: الحافلات */}
          <section className="space-y-[var(--space-5)]">
            <div className="pb-[var(--space-3)] border-b border-[var(--border)] flex items-center justify-between gap-[var(--space-2)]">
              <div className="flex items-center gap-[var(--space-2)]">
                <Bus size={17} className="text-[var(--primary)]" />
                <h3 className="text-base font-extrabold text-[var(--text)]">الحافلات</h3>
              </div>
              <span className="text-xs font-bold text-[var(--primary)] bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 px-[var(--space-3)] py-[var(--space-1)] rounded-lg tabular-nums">
                عدد الحافلات: {busesQuantity}
              </span>
            </div>

            <div className="bg-[var(--surface-subtle)] p-[var(--space-4)] lg:p-[var(--space-5)] rounded-3xl border border-[var(--border)] space-y-[var(--space-5)]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-[var(--text)]">
                  إضافة الحافلات المشمولة بالسند <span className="text-red-500">*</span>
                </label>
                <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                  المضافة: {selectedBuses.length}
                </span>
              </div>

              <div>
                <div className="flex gap-[var(--space-3)]">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={busNumber}
                      onChange={(e) => {
                        setIssuedDisplayNumber(null);
                        setBusConflict(null);
                        setShowOverrideForm(false);
                        setOverrideReasonInput('');
                        setOverrideReasonError('');
                        setBusNumber(toEnglishDigits(e.target.value));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                          e.preventDefault();
                          if (busNumber && driverName && !isCheckingBus) {
                            addBusToList();
                          }
                        }
                      }}
                      className={`w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border-2 rounded-2xl text-lg font-extrabold outline-none transition-all tabular-nums ${
                        busConflict || showBusesError
                          ? 'border-red-500 text-[var(--danger)] ring-4 ring-red-500/15'
                          : busNumber && driverName
                          ? 'border-[var(--primary)] text-[var(--primary)] shadow-sm'
                          : 'border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15'
                      }`}
                      placeholder="رقم الحافلة..."
                    />
                  </div>

                  {/* Solid "+ إضافة" button without gradient */}
                  <button
                    type="button"
                    onClick={addBusToList}
                    disabled={!busNumber || !driverName || isCheckingBus}
                    title="إضافة الحافلة (Enter)"
                    className="px-[var(--space-5)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-extrabold text-sm transition-colors disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-[var(--text-muted)] flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-xs"
                  >
                    {isCheckingBus ? <Loader2 size={15} className="animate-spin" /> : null}
                    <span>+ إضافة</span>
                  </button>
                </div>

                {/* Duplicate Bus Conflict Alert directly below Bus Number input */}
                {busConflict && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-[var(--space-2)] p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-300 dark:border-red-800 text-xs space-y-[var(--space-2)]"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-red-700 dark:text-red-300 font-bold">
                        <AlertCircle size={15} className="shrink-0" />
                        <span>
                          الحافلة {busConflict.busNumber} مسجّلة في السند {busConflict.voucherNumber} للمكتب{' '}
                          {busConflict.officeLabel} ولم تُؤرشف بعد
                        </span>
                      </div>
                      {isGeneralManager && !showOverrideForm && (
                        <button
                          type="button"
                          onClick={() => setShowOverrideForm(true)}
                          className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors shrink-0"
                        >
                          <ShieldAlert size={13} />
                          <span>تجاوز</span>
                        </button>
                      )}
                    </div>

                    {isGeneralManager && showOverrideForm && (
                      <div className="pt-2 border-t border-red-200 dark:border-red-800/70 space-y-2">
                        <label className="block text-[11px] font-bold text-red-700 dark:text-red-300">
                          سبب التجاوز (مطلوب 5 أحرف على الأقل — يُحفظ مع السند):
                        </label>
                        <input
                          type="text"
                          value={overrideReasonInput}
                          onChange={(e) => {
                            setOverrideReasonInput(e.target.value);
                            if (e.target.value.trim().length >= 5) {
                              setOverrideReasonError('');
                            }
                          }}
                          placeholder="اكتب سبب التجاوز..."
                          className="w-full px-3 py-2 rounded-lg bg-[var(--surface)] border border-red-300 dark:border-red-700 text-xs font-semibold text-[var(--text)] outline-none focus:border-red-500"
                        />
                        {overrideReasonError && (
                          <p className="text-[11px] font-bold text-red-600 dark:text-red-400">
                            {overrideReasonError}
                          </p>
                        )}
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleConfirmBusOverride}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] cursor-pointer transition-colors"
                          >
                            تأكيد التجاوز وإضافة الحافلة
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowOverrideForm(false);
                              setOverrideReasonInput('');
                              setOverrideReasonError('');
                            }}
                            className="px-3 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] font-bold text-[11px] cursor-pointer"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {showBusesError && !busConflict && (
                  <p className="mt-1.5 text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0" />
                    <span>{busesCountError}</span>
                  </p>
                )}
              </div>

              <div>
                <div className="relative">
                  <input
                    type="text"
                    dir="ltr"
                    value={driverPhone}
                    onBlur={handleDriverPhoneBlur}
                    onChange={(e) => handleDriverPhoneChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        if (busNumber && driverName && !isCheckingBus) {
                          addBusToList();
                        }
                      }
                    }}
                    className={`${
                      driverPhoneWarning
                        ? 'w-full px-[var(--space-4)] py-[var(--space-3)] bg-amber-50/40 dark:bg-amber-950/20 border border-amber-400 dark:border-amber-600 rounded-2xl focus:ring-4 focus:ring-amber-500/15 focus:border-amber-500 outline-none transition-all font-semibold text-[var(--text)] text-sm text-right tabular-nums'
                        : 'w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-2xl focus:ring-4 focus:ring-blue-500/15 focus:border-[var(--primary)] outline-none transition-all font-semibold text-[var(--text)] text-sm text-right tabular-nums'
                    }`}
                    placeholder="رقم هاتف السائق (05XXXXXXXX)..."
                  />
                  <Phone size={15} className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                </div>
                {driverPhoneWarning && (
                  <p className="mt-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 flex items-center gap-1">
                    <AlertCircle size={13} className="shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>{driverPhoneWarning}</span>
                  </p>
                )}
              </div>

              <AnimatePresence>
                {selectedBuses.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-[var(--surface)] rounded-2xl p-[var(--space-4)] border border-[var(--border)] overflow-hidden"
                  >
                    <h4 className="text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-3)] tabular-nums">
                      الحافلات المضافة ({selectedBuses.length})
                    </h4>
                    <div className="space-y-[var(--space-2)] max-h-44 overflow-y-auto">
                      {selectedBuses.map((bus, idx) => {
                        const phoneWarn = validateDriverPhoneWarning(bus.driverPhone);
                        return (
                          <motion.div
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            key={idx}
                            className={`p-[var(--space-3)] rounded-xl border flex items-center justify-between transition-all ${
                              bus.overrideReason
                                ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
                                : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                            }`}
                          >
                            <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                              <span
                                className={`text-sm font-extrabold tabular-nums ${
                                  bus.overrideReason ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--success)]'
                                }`}
                              >
                                {bus.busNumber}
                              </span>
                              <span
                                className={`text-[10px] px-[var(--space-2)] py-[var(--space-1)] rounded-md font-bold text-white ${
                                  bus.overrideReason ? 'bg-amber-600' : 'bg-[#15803D]'
                                }`}
                              >
                                {bus.overrideReason ? 'تجاوز إداري' : 'جاهزة'}
                              </span>
                              {phoneWarn && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md font-bold bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700">
                                  بدون جوال صحيح
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBusFromList(idx)}
                              aria-label="حذف الحافلة"
                              className="text-[var(--text-muted)] hover:text-[var(--danger)] transition-colors p-[var(--space-2)] cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-5)]">
              <div className="sm:col-span-2">
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <UserIcon size={14} className="text-[var(--text-muted)]" />
                  السائق (تعريف تلقائي)
                </label>
                <div className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-dashed border-[var(--border)] rounded-2xl text-[var(--text)] font-bold min-h-[46px] flex items-center text-sm">
                  {driverName || (
                    <span className="text-[var(--text-muted)] font-medium text-xs">
                      سيظهر اسم السائق عند إدخال رقم الحافلة...
                    </span>
                  )}
                </div>
              </div>

              <div className="sm:col-span-1">
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  عدد الحافلات (تلقائي)
                </label>
                <input
                  type="text"
                  value={busesQuantity}
                  readOnly
                  className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-blue-50/70 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 rounded-2xl outline-none font-extrabold text-[var(--primary)] text-center text-base tabular-nums"
                />
              </div>
            </div>
          </section>
        </div>

        {/* Section 3: الموعد والمسار (--space-8 spacing between form sections) */}
        <section className="mt-[var(--space-8)] pt-[var(--space-8)] border-t border-[var(--border)] space-y-[var(--space-5)]">
          <div className="pb-[var(--space-3)] border-b border-[var(--border)] flex items-center gap-[var(--space-2)]">
            <MapPin size={17} className="text-[var(--primary)]" />
            <h3 className="text-base font-extrabold text-[var(--text)]">الموعد والمسار</h3>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-y-[var(--space-5)] lg:gap-x-[var(--space-6)]">
            <div>
              <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                <Calendar size={14} className="text-[var(--primary)]" />
                التاريخ ميلادي / هجري (DD/MM/1448)
              </label>
              <div className="grid grid-cols-2 gap-[var(--space-5)]">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                />
                <input
                  type="text"
                  dir="ltr"
                  value={hijriDate}
                  readOnly
                  placeholder="DD/MM/1448"
                  className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl outline-none font-bold text-[var(--text)] text-sm text-center tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                <MapPin size={14} className="text-[var(--primary)]" />
                خط السير والاتجاه
              </label>
              <div className="grid grid-cols-2 gap-[var(--space-5)]">
                <input
                  type="text"
                  value={directionFrom}
                  onChange={(e) => setDirectionFrom(e.target.value)}
                  placeholder="من..."
                  className={inputClass}
                />
                <input
                  type="text"
                  value={directionTo}
                  onChange={(e) => setDirectionTo(e.target.value)}
                  placeholder="إلى..."
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-5)] lg:col-span-2">
              <div>
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <MapPin size={14} className="text-[var(--primary)]" />
                  مكان التحميل
                </label>
                <input
                  type="text"
                  value={loadingLocation}
                  onChange={(e) => setLoadingLocation(e.target.value)}
                  className={inputClass}
                  placeholder="أدخل مكان التحميل..."
                />
              </div>

              <div>
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <Layers size={14} className="text-[var(--primary)]" />
                  اسم الفندق
                </label>
                <input
                  type="text"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  className={inputClass}
                  placeholder="أدخل اسم الفندق..."
                />
              </div>

              <div>
                <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                  <Clock size={14} className="text-[var(--primary)]" />
                  توقيت الحركة
                </label>
                <input
                  type="text"
                  value={eventTime}
                  onChange={(e) => setEventTime(toEnglishDigits(e.target.value))}
                  className={`${inputClass} tabular-nums`}
                  placeholder="مثلاً: 09:30 صباحاً"
                />
              </div>
            </div>

            <div className="lg:col-span-2">
              <label className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">
                <ClipboardList size={14} className="text-[var(--primary)]" />
                ملاحظات إضافية
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
                placeholder="أدخل أي ملاحظات إضافية هنا..."
              />
            </div>
          </div>
        </section>

        {/* Status Feedback Banner */}
        <AnimatePresence mode="wait">
          {status.type && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className={`mt-[var(--space-6)] p-[var(--space-4)] rounded-2xl flex items-center gap-[var(--space-4)] shadow-md text-white ${
                status.type === 'success' ? 'bg-[#15803D]' : 'bg-[#B91C1C]'
              }`}
            >
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                {isPrinting ? (
                  <Loader2 size={22} className="animate-spin" />
                ) : status.type === 'success' ? (
                  <CheckCircle2 size={22} />
                ) : (
                  <AlertCircle size={22} />
                )}
              </div>
              <div>
                <p className="text-sm font-bold leading-snug">
                  {isPrinting ? 'جاري تحضير السند للطباعة...' : status.msg}
                </p>
                <p className="text-xs opacity-90 font-medium mt-[var(--space-1)]">نظام محطة درة المنورة الرقمي</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Sticky Bottom Actions Bar */}
      <div className="sticky bottom-3 z-30 mt-[var(--space-6)] bg-[var(--surface)]/95 backdrop-blur-md border border-[var(--border)] rounded-2xl p-[var(--space-4)] sm:p-[var(--space-5)] shadow-xl">
        {printAlert && (
          <div className="mb-[var(--space-3)] p-[var(--space-3)] rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-[var(--space-2)] text-xs">
            <div className="flex items-center gap-[var(--space-2)] font-bold text-[var(--gold-text)]">
              <AlertCircle size={16} className="shrink-0" />
              <span>{printAlert.msg}</span>
            </div>
            <div className="flex items-center gap-[var(--space-2)]">
              {printAlert.blobUrl && (
                <a
                  href={printAlert.blobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-bold transition-colors"
                >
                  <ExternalLink size={13} />
                  <span>فتح السند في تبويب جديد</span>
                </a>
              )}
              <button
                type="button"
                onClick={handleLegacyExport}
                disabled={isLegacyExporting}
                className="inline-flex items-center gap-1 px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] font-bold cursor-pointer"
              >
                <FileDown size={13} />
                <span>تصدير بديل</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintAlert(null)}
                aria-label="إغلاق التنبيه"
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {!isOnline && (
          <div className="mb-[var(--space-3)] p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 flex items-center gap-[var(--space-2)] text-xs font-bold text-red-700 dark:text-red-300">
            <WifiOff size={16} className="shrink-0" />
            <span>الإصدار يحتاج اتصالاً بالإنترنت لضمان عدم تكرار الرقم</span>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-3)]">
          {/* Primary Action: إصدار وحفظ (print triggered only after save succeeds) */}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => handleRegister()}
            title={!isOnline ? 'الإصدار يحتاج اتصالاً بالإنترنت لضمان عدم تكرار الرقم' : 'إصدار وطباعة / حفظ PDF (Ctrl + Enter)'}
            className="flex-1 py-[var(--space-3)] px-[var(--space-6)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-extrabold text-base shadow-md transition-colors disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-[var(--text-muted)] disabled:shadow-none flex items-center justify-center gap-[var(--space-3)] cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Printer size={20} className="text-[var(--gold)]" />
            )}
            <span>إصدار وطباعة / حفظ PDF</span>
          </button>

          {hasRedErrors && (
            <button
              type="button"
              onClick={() => setSubmitAttempted(true)}
              className="py-[var(--space-3)] px-[var(--space-4)] rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="اضغط لعرض الحقول التي تحتاج تصحيحاً"
            >
              <AlertCircle size={15} className="shrink-0" />
              <span className="tabular-nums">
                {redErrors.length === 1
                  ? 'يوجد خطأ واحد'
                  : redErrors.length === 2
                  ? 'يوجد خطآن'
                  : `يوجد ${redErrors.length} أخطاء`}
              </span>
            </button>
          )}

          {/* Secondary Action: حفظ كمسودة */}
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSaveDraft}
            className="py-[var(--space-3)] px-[var(--space-5)] bg-[var(--surface-subtle)] hover:bg-slate-200 dark:hover:bg-slate-800 text-[var(--text)] rounded-xl font-bold text-sm border border-[var(--border)] transition-colors flex items-center justify-center gap-[var(--space-2)] cursor-pointer disabled:opacity-60"
          >
            <Save size={18} className="text-[var(--primary)]" />
            <span>حفظ كمسودة</span>
          </button>

          {/* Clear Fields: مسح الحقول */}
          <button
            type="button"
            disabled={!isFormDirty || isSubmitting}
            onClick={handleClear}
            title="مسح الحقول (Alt + C)"
            className="py-[var(--space-3)] px-[var(--space-5)] bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 text-[var(--danger)] rounded-xl font-bold text-sm border border-red-200 dark:border-red-800 transition-colors flex items-center justify-center gap-[var(--space-2)] cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            <Trash2 size={18} />
            <span>مسح الحقول</span>
          </button>
        </div>
        <div className="mt-[var(--space-2)] flex flex-wrap items-center justify-between gap-[var(--space-2)]">
          <p className="text-[11px] font-semibold text-[var(--text-muted)] leading-relaxed">
            اختر: الوجهة = حفظ كملف PDF، والهوامش = بلا، والرؤوس والتذييلات = معطّلة
          </p>
          <div className="flex items-center gap-[var(--space-2)]">
            <button
              type="button"
              onClick={handlePrintLastIssued}
              disabled={isPrinting || !lastIssuedVoucher}
              title={!lastIssuedVoucher ? 'تتفعّل الطباعة بعد حفظ السند بنجاح' : `إعادة طباعة السند رقم ${lastIssuedVoucher.voucherNumber}`}
              className="inline-flex items-center gap-1.5 px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {isPrinting ? <Loader2 size={12} className="animate-spin" /> : <Printer size={12} />}
              <span>{lastIssuedVoucher ? `طباعة السند #${lastIssuedVoucher.voucherNumber}` : 'طباعة السند'}</span>
            </button>
            <button
              type="button"
              onClick={handleLegacyExport}
              disabled={isLegacyExporting || !lastIssuedVoucher}
              title={!lastIssuedVoucher ? 'يتفعّل التصدير بعد حفظ السند بنجاح' : 'تصدير آخر سند محفوظ PDF'}
              className="inline-flex items-center gap-1.5 px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {isLegacyExporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
              <span>تصدير بديل</span>
            </button>
          </div>
        </div>
        <div className="mt-[var(--space-2)] flex flex-wrap items-center justify-between gap-[var(--space-2)]">
          <label className="inline-flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={printTwoCopies}
              onChange={(e) => setPrintTwoCopies(e.target.checked)}
              className="w-4 h-4 rounded border-[var(--border)] accent-[var(--primary)] cursor-pointer"
            />
            <span>تضمين نسختين في ملف PDF (نسخة المكتب + نسخة الشركة)</span>
          </label>
          {selectedBuses.length === 0 && !isSubmitting && (
            <p className="text-xs text-[var(--gold-text)] font-bold">
              يجب إضافة حافلة واحدة على الأقل للإرسال
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
