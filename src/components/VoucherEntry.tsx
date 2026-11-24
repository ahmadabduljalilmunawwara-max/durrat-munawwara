import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, query, where, getDocs, onSnapshot, runTransaction, limit, orderBy } from 'firebase/firestore';
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
} from 'lucide-react';
import { generateVoucherPDF, exportVoucherLegacyPDF } from '../lib/pdfGenerator';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../App';
import { getUserReceiptName, resolveNewVoucherIssuerName } from '../lib/issuerName';

const toEnglishDigits = (value: string): string =>
  value
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const computeHijriDDMMYYYY = (gregorianDateStr: string): string => {
  if (!gregorianDateStr) return '';
  try {
    const [y, m, d] = gregorianDateStr.split('-').map(Number);
    const date = y && m && d ? new Date(y, m - 1, d, 12, 0, 0) : new Date(gregorianDateStr);
    if (isNaN(date.getTime())) return '';
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    });
    const parts = formatter.formatToParts(date);
    const year = toEnglishDigits(parts.find((p) => p.type === 'year')?.value || '');
    const month = toEnglishDigits(parts.find((p) => p.type === 'month')?.value || '').padStart(2, '0');
    const day = toEnglishDigits(parts.find((p) => p.type === 'day')?.value || '').padStart(2, '0');
    if (year && month && day) {
      return `${day}/${month}/${year}`;
    }
  } catch (error) {
    console.error('Hijri conversion error:', error);
  }
  return '';
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
  const isGeneralManager = activeUser?.role === 'general_manager';
  const draftStorageKey = `dmtc_voucher_draft_${activeUser?.uid || 'guest'}`;

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

  // Restore saved draft if present
  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(draftStorageKey);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
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
        if (draft.receiverMobile) setReceiverMobile(draft.receiverMobile);
        if (draft.receiverId) setReceiverId(draft.receiverId);
        if (draft.customDate) setCustomDate(draft.customDate);
        if (Array.isArray(draft.selectedBuses)) setSelectedBuses(draft.selectedBuses);
      }
    } catch {
      // ignore corrupted draft
    }
  }, [draftStorageKey]);

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

  // Automatically calculate Hijri date in DD/MM/YYYY (e.g. DD/MM/1448) from Gregorian date
  useEffect(() => {
    const formatted = computeHijriDDMMYYYY(customDate);
    if (formatted) {
      setHijriDate(formatted);
    }
  }, [customDate]);

  const [nextVoucherNum, setNextVoucherNum] = useState<number>(1001);
  const [logoUrl, setLogoUrl] = useState<string>('/logo.png');
  const [sloganUrl, setSloganUrl] = useState<string>('');
  const [printTwoCopies, setPrintTwoCopies] = useState<boolean>(false);
  const [pdfMargins, setPdfMargins] = useState({ top: 20, bottom: 20, left: 40, right: 40 });
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isLegacyExporting, setIsLegacyExporting] = useState(false);
  const [lastIssuedVoucher, setLastIssuedVoucher] = useState<any | null>(null);
  const [printAlert, setPrintAlert] = useState<{
    type: 'popup_blocked' | 'error';
    msg: string;
    blobUrl?: string;
  } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({ type: null, msg: '' });
  const [usedBusNumbers, setUsedBusNumbers] = useState<Set<string>>(new Set());
  const [buses, setBuses] = useState<Record<string, { driverName: string; busType: string; driverPhone?: string }>>({});
  const [selectedBuses, setSelectedBuses] = useState<
    { busNumber: string; driverName: string; busType: string; driverPhone: string; notes?: string }[]
  >([]);

  useEffect(() => {
    const unsubVouchers = onSnapshot(
      collection(db, 'vouchers'),
      (snap) => {
        const used = new Set<string>();
        snap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.archived === true) return;
          if (data.busNumber) used.add(data.busNumber);
          if (Array.isArray(data.buses)) {
            data.buses.forEach((b: any) => {
              if (b.busNumber) used.add(b.busNumber);
            });
          }
        });
        setUsedBusNumbers(used);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vouchers')
    );

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
          if (data.nextVoucherNumber) setNextVoucherNum(data.nextVoucherNumber);
          if (data.logoUrl) setLogoUrl(data.logoUrl);
          if (data.sloganUrl) setSloganUrl(data.sloganUrl);
          if (data.pdfMargins) setPdfMargins(data.pdfMargins);
        } else {
          setNextVoucherNum(1000);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'settings/app')
    );

    return () => {
      unsubVouchers();
      unsubBuses();
      unsubSettings();
    };
  }, []);

  // Read-only automatic voucher number
  const finalVoucherNumber = nextVoucherNum;
  // Read-only automatic buses quantity derived from added buses
  const busesQuantity = selectedBuses.length.toString();

  const [isVoucherDuplicate, setIsVoucherDuplicate] = useState(false);

  useEffect(() => {
    if (finalVoucherNumber) {
      const q = query(
        collection(db, 'vouchers'),
        where('voucherNumber', '==', finalVoucherNumber),
        limit(1)
      );
      getDocs(q).then((snap) => {
        setIsVoucherDuplicate(!snap.empty);
      });
    }
  }, [finalVoucherNumber]);

  useEffect(() => {
    if (busNumber && buses[busNumber]) {
      setDriverName(buses[busNumber].driverName);
      setDriverPhone(buses[busNumber].driverPhone || '');
      checkDuplicate(busNumber);
    } else {
      setDriverName('');
      setDriverPhone('');
      setIsDuplicate(false);
    }
  }, [busNumber, buses]);

  const checkDuplicate = async (num: string) => {
    const q = query(collection(db, 'vouchers'), where('busNumber', '==', num), limit(50));
    const snap = await getDocs(q);
    const hasActiveDuplicate = snap.docs.some((d) => d.data().archived !== true);
    setIsDuplicate(hasActiveDuplicate);
  };

  const handleDelegateNumberChange = (rawVal: string) => {
    const clean = toEnglishDigits(rawVal).replace(/[^0-9]/g, '');
    setDelegateNumber(clean);
    if (clean && officeToOrgMap[clean]) {
      setOrganization(officeToOrgMap[clean]);
    }
  };

  const addBusToList = () => {
    if (!busNumber.trim()) return;

    if (usedBusNumbers.has(busNumber)) {
      setStatus({ type: 'error', msg: `عذراً، الحافلة رقم ${busNumber} مسددة مسبقاً ولا يمكن إضافتها.` });
      return;
    }

    if (!driverName) {
      setStatus({ type: 'error', msg: 'رقم الحافلة غير مسجل في النظام' });
      return;
    }
    if (isDuplicate) {
      setStatus({ type: 'error', msg: 'هذه الحافلة مسجلة مسبقاً في النظام' });
      return;
    }
    if (selectedBuses.some((b) => b.busNumber === busNumber)) {
      setStatus({ type: 'error', msg: 'هذه الحافلة موجودة بالفعل في القائمة' });
      return;
    }

    const currentBus = buses[busNumber];
    setSelectedBuses([
      ...selectedBuses,
      {
        busNumber,
        driverName: currentBus.driverName,
        busType: currentBus.busType,
        driverPhone: driverPhone || currentBus.driverPhone || '',
        notes: '',
      },
    ]);
    setBusNumber('');
    setDriverName('');
    setDriverPhone('');
    setStatus({ type: null, msg: '' });
  };

  const removeBusFromList = (index: number) => {
    setSelectedBuses(selectedBuses.filter((_, i) => i !== index));
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
        receiverMobile,
        receiverId,
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

  const handleRegister = async (busesList?: typeof selectedBuses) => {
    if (isSubmitting) return;

    const currentBuses = busesList || selectedBuses;

    if (currentBuses.length === 0) {
      if (busNumber && buses[busNumber] && !isDuplicate && !usedBusNumbers.has(busNumber)) {
        const currentBus = buses[busNumber];
        const newBus = {
          busNumber,
          driverName: currentBus.driverName,
          busType: currentBus.busType,
          driverPhone: driverPhone || currentBus.driverPhone || '',
          notes: '',
        };
        setSelectedBuses([newBus]);
        setBusNumber('');
        setDriverName('');
        setDriverPhone('');
        return handleRegister([newBus]);
      }
      setStatus({
        type: 'error',
        msg: 'يجب إضافة حافلة واحدة على الأقل للإرسال (اضغط Enter في خانة الحافلة أو Ctrl+Enter للإرسال)',
      });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: null, msg: '' });
    setPrintAlert(null);

    if (isVoucherDuplicate) {
      setStatus({ type: 'error', msg: `رقم السند ${finalVoucherNumber} مسجل مسبقاً في النظام.` });
      setIsSubmitting(false);
      return;
    }

    // Open print window synchronously while user click gesture is active
    const preOpenedWindow = window.open('', '_blank');

    try {
      const now = new Date();
      const timestamp = now.toISOString();
      const dateKey = customDate || format(now, 'yyyy-MM-dd');

      for (const bus of currentBuses) {
        const q = query(collection(db, 'vouchers'), where('busNumber', '==', bus.busNumber), limit(50));
        const snap = await getDocs(q);
        const hasActiveDuplicate = snap.docs.some((d) => d.data().archived !== true);
        if (hasActiveDuplicate) {
          if (preOpenedWindow && !preOpenedWindow.closed) {
            preOpenedWindow.close();
          }
          setStatus({
            type: 'error',
            msg: `الحافلة رقم ${bus.busNumber} مسجلة بالفعل في النظام في سند سابق (غير مؤرشف).`,
          });
          setIsSubmitting(false);
          return;
        }
      }

      const voucherData = {
        approvalNumber: approvalNumber || '',
        delegateNumber: delegateNumber || '',
        organization: organization || '',
        busesQuantity: currentBuses.length.toString() || '0',
        ticketsCount: ticketsCount || '0',
        pilgrimsCount: pilgrimsCount || '0',
        directionFrom: directionFrom || '',
        directionTo: directionTo || '',
        loadingLocation: loadingLocation || '',
        hotelName: hotelName || '',
        eventTime: eventTime || '',
        voucherNumber: finalVoucherNumber,
        busNumber: currentBuses[0]?.busNumber || '',
        driverName: currentBuses[0]?.driverName || '',
        driverPhone: currentBuses[0]?.driverPhone || '',
        busType: currentBuses[0]?.busType || 'غير محدد',
        buses: currentBuses || [],
        timestamp,
        hijriDate: hijriDate || '',
        hajjSeason: '1448',
        seasonName: 'موسم حج 1448 هـ',
        archived: false,
        customDate: customDate || dateKey,
        dateKey: customDate || dateKey,
        notes: notes || '',
        receiverName: receiverName || '',
        receiverMobile: receiverMobile || '',
        receiverId: receiverId || '',
        deviceName: window.navigator.userAgent.substring(0, 50),
        userId: activeUserUid,
        userName: resolvedIssuerName,
        issuedByName: resolvedIssuerName,
        issuedByUid: activeUserUid,
      };

      await runTransaction(db, async (transaction) => {
        const settingsDoc = doc(db, 'settings', 'app');
        const settingsSnap = await transaction.get(settingsDoc);
        const actualVoucherNumber = settingsSnap.exists()
          ? settingsSnap.data().nextVoucherNumber || 1000
          : 1000;

        const newVoucherRef = doc(collection(db, 'vouchers'));
        transaction.set(newVoucherRef, { ...voucherData, voucherNumber: actualVoucherNumber });

        const currentStoredNext = settingsSnap.exists()
          ? settingsSnap.data().nextVoucherNumber || 1000
          : 1000;
        if (actualVoucherNumber >= currentStoredNext) {
          transaction.set(settingsDoc, { nextVoucherNumber: actualVoucherNumber + 1 }, { merge: true });
        }

        return actualVoucherNumber;
      }).then(async (actualVoucherNumber) => {
        const fullData = {
          ...voucherData,
          voucherNumber: actualVoucherNumber,
          logoUrl,
          sloganUrl,
          pdfMargins,
        };

        setLastIssuedVoucher(fullData);
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
          if (preOpenedWindow && !preOpenedWindow.closed) {
            try {
              preOpenedWindow.close();
            } catch {
              // ignore
            }
          }
          setPrintAlert({
            type: 'error',
            msg: 'تعذّر فتح نافذة الطباعة. يمكنك استخدام التصدير البديل لحفظ السند كملف PDF.',
          });
        } finally {
          setIsPrinting(false);
        }
      });

      try {
        localStorage.removeItem(draftStorageKey);
      } catch {
        // ignore storage errors
      }

      setStatus({ type: 'success', msg: `تم تسجيل السند رقم ${finalVoucherNumber} بنجاح` });
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setSelectedBuses([]);
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
    } catch (error) {
      setStatus({ type: 'error', msg: 'حدث خطأ أثناء التسجيل' });
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLegacyExport = async () => {
    const activeBuses =
      selectedBuses.length > 0
        ? selectedBuses
        : busNumber && driverName
        ? [{ busNumber, driverName, busType: 'حافلة', driverPhone }]
        : [];

    const targetData =
      activeBuses.length > 0
        ? {
            approvalNumber: approvalNumber || '',
            delegateNumber: delegateNumber || '',
            organization: organization || '',
            busesQuantity: activeBuses.length.toString(),
            ticketsCount: ticketsCount || '0',
            pilgrimsCount: pilgrimsCount || '0',
            directionFrom: directionFrom || '',
            directionTo: directionTo || '',
            loadingLocation: loadingLocation || '',
            hotelName: hotelName || '',
            eventTime: eventTime || '',
            voucherNumber: finalVoucherNumber,
            buses: activeBuses,
            timestamp: new Date().toISOString(),
            hijriDate: hijriDate || '',
            customDate,
            notes: notes || '',
            receiverName: receiverName || '',
            receiverMobile: receiverMobile || '',
            receiverId: receiverId || '',
            userId: activeUserUid,
            userName: resolvedIssuerName,
            issuedByName: resolvedIssuerName,
            issuedByUid: activeUserUid,
            logoUrl,
            sloganUrl,
            pdfMargins,
          }
        : lastIssuedVoucher;

    if (!targetData) {
      setPrintAlert({
        type: 'error',
        msg: 'أضف حافلة واحدة على الأقل أو أصدر سنداً أولاً لاستخدام التصدير البديل.',
      });
      return;
    }

    setIsLegacyExporting(true);
    try {
      await exportVoucherLegacyPDF(targetData, { save: true, twoCopies: printTwoCopies });
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
      setReceiverName('');
      setReceiverMobile('');
      setReceiverId('');
      const today = format(new Date(), 'yyyy-MM-dd');
      setCustomDate(today);
      setHijriDate(computeHijriDDMMYYYY(today));
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
    selectedBuses,
    busNumber,
    driverName,
    driverPhone,
    isDuplicate,
    usedBusNumbers,
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
    finalVoucherNumber,
    isVoucherDuplicate,
    activeUser,
    resolvedIssuerName,
    activeUserUid,
    logoUrl,
    sloganUrl,
    pdfMargins,
    printTwoCopies,
  ]);

  const inputClass =
    'w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl hover:border-slate-300 dark:hover:border-slate-600 focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/15 focus:border-[var(--primary)] outline-none transition-all font-semibold text-[var(--text)] text-sm';

  const canSubmit =
    !isSubmitting &&
    (selectedBuses.length > 0 ||
      Boolean(busNumber && driverName && !isDuplicate && !usedBusNumbers.has(busNumber)));

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
                  موسم حج 1448هـ
                </span>
                <span className="text-xs font-bold text-[var(--success)]">
                  جاهز للترحيل
                </span>
              </div>
            </div>
          </div>

          {/* Read-Only Automatic Voucher Number */}
          <div className="bg-[var(--surface-subtle)] px-[var(--space-5)] py-[var(--space-3)] rounded-2xl border border-[var(--border)] flex flex-col items-end min-w-[155px]">
            <span className="text-[11px] text-[var(--text-secondary)] font-bold block mb-[var(--space-1)]">
              رقم السند التلقائي (للقراءة فقط)
            </span>
            <div className="flex items-center gap-[var(--space-2)]">
              <span className="text-[var(--gold-text)] font-mono font-bold text-lg">#</span>
              <span
                className={`text-xl font-mono font-extrabold tabular-nums ${
                  isVoucherDuplicate ? 'text-[var(--danger)]' : 'text-[var(--primary)]'
                }`}
                lang="en"
                dir="ltr"
              >
                {finalVoucherNumber}
              </span>
            </div>
            {isVoucherDuplicate && (
              <span className="text-[var(--danger)] text-[10px] font-bold mt-[var(--space-1)]">
                رقم مكرر!
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
                اسم المستلم (مندوب الميدان)
              </label>
              <input
                type="text"
                value={receiverName}
                onFocus={() => setActiveSuggestionField('receiverName')}
                onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                onChange={(e) => setReceiverName(e.target.value)}
                className={inputClass}
                placeholder="أدخل اسم المندوب المستلم..."
              />
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
                            onClick={() => setReceiverName(name)}
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
                  رقم موبايل المستلم
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={receiverMobile}
                  onFocus={() => setActiveSuggestionField('receiverMobile')}
                  onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                  onChange={(e) => setReceiverMobile(toEnglishDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  className={`${inputClass} text-right tabular-nums`}
                  placeholder="05xxxxxxx"
                />
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
                              onClick={() => setReceiverMobile(mobile)}
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
                  رقم هوية المستلم
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={receiverId}
                  onFocus={() => setActiveSuggestionField('receiverId')}
                  onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                  onChange={(e) => setReceiverId(toEnglishDigits(e.target.value).replace(/[^0-9]/g, ''))}
                  className={`${inputClass} text-right tabular-nums`}
                  placeholder="10xxxxxxxx"
                />
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
                              onClick={() => setReceiverId(idNum)}
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
                  رقم المكتب
                </label>
                <input
                  type="text"
                  value={delegateNumber}
                  onFocus={() => setActiveSuggestionField('delegateNumber')}
                  onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                  onChange={(e) => handleDelegateNumberChange(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                  placeholder="رقم المكتب..."
                />
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
                  إضافة الحافلات المشمولة بالسند
                </label>
                <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                  المضافة: {selectedBuses.length}
                </span>
              </div>

              <div className="flex gap-[var(--space-3)]">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={busNumber}
                    onChange={(e) => setBusNumber(toEnglishDigits(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        if (busNumber && driverName && !isDuplicate && !usedBusNumbers.has(busNumber)) {
                          addBusToList();
                        }
                      }
                    }}
                    className={`w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border-2 rounded-2xl text-lg font-extrabold outline-none transition-all tabular-nums ${
                      isDuplicate
                        ? 'border-red-500 text-[var(--danger)] ring-4 ring-red-500/15'
                        : busNumber && driverName
                        ? 'border-[var(--primary)] text-[var(--primary)] shadow-sm'
                        : 'border-[var(--border)] text-[var(--text)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15'
                    }`}
                    placeholder="رقم الحافلة..."
                  />
                  {isDuplicate && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute top-full right-0 mt-[var(--space-2)] flex items-center gap-[var(--space-2)] text-[var(--danger)] text-xs font-bold bg-red-50 dark:bg-red-950 px-[var(--space-3)] py-[var(--space-2)] rounded-xl z-10 border border-red-200 dark:border-red-800 shadow-xs"
                    >
                      <AlertCircle size={14} />
                      هذه الحافلة مسجلة مسبقاً في النظام
                    </motion.div>
                  )}
                </div>

                {/* Solid "+ إضافة" button without gradient */}
                <button
                  type="button"
                  onClick={addBusToList}
                  disabled={!busNumber || !driverName || isDuplicate || usedBusNumbers.has(busNumber)}
                  title="إضافة الحافلة (Enter)"
                  className="px-[var(--space-5)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-extrabold text-sm transition-colors disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-[var(--text-muted)] flex items-center justify-center whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-xs"
                >
                  + إضافة
                </button>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(toEnglishDigits(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault();
                      if (busNumber && driverName && !isDuplicate && !usedBusNumbers.has(busNumber)) {
                        addBusToList();
                      }
                    }
                  }}
                  className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-2xl focus:ring-4 focus:ring-blue-500/15 focus:border-[var(--primary)] outline-none transition-all font-semibold text-[var(--text)] text-sm tabular-nums"
                  placeholder="رقم هاتف السائق..."
                />
                <Phone size={15} className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
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
                        const isUsed = usedBusNumbers.has(bus.busNumber);
                        return (
                          <motion.div
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            key={idx}
                            className={`p-[var(--space-3)] rounded-xl border flex items-center justify-between transition-all ${
                              isUsed
                                ? 'bg-red-50/70 dark:bg-red-950/40 border-red-200 dark:border-red-800'
                                : 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                            }`}
                          >
                            <div className="flex items-center gap-[var(--space-3)]">
                              <span
                                className={`text-sm font-extrabold tabular-nums ${
                                  isUsed ? 'text-[var(--danger)]' : 'text-[var(--success)]'
                                }`}
                              >
                                {bus.busNumber}
                              </span>
                              <span
                                className={`text-[10px] px-[var(--space-2)] py-[var(--space-1)] rounded-md font-bold text-white ${
                                  isUsed ? 'bg-[#B91C1C]' : 'bg-[#15803D]'
                                }`}
                              >
                                {isUsed ? 'مسددة' : 'جاهزة'}
                              </span>
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

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-3)]">
          {/* Primary Action: طباعة / حفظ PDF */}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => handleRegister()}
            title="طباعة / حفظ PDF (Ctrl + Enter)"
            className="flex-1 py-[var(--space-3)] px-[var(--space-6)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-extrabold text-base shadow-md transition-colors disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-[var(--text-muted)] disabled:shadow-none flex items-center justify-center gap-[var(--space-3)] cursor-pointer disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="animate-spin" size={20} />
            ) : (
              <Printer size={20} className="text-[var(--gold)]" />
            )}
            <span>إرسال وطباعة / حفظ PDF</span>
          </button>

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
          <button
            type="button"
            onClick={handleLegacyExport}
            disabled={isLegacyExporting || (!canSubmit && !lastIssuedVoucher)}
            className="inline-flex items-center gap-1.5 px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {isLegacyExporting ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />}
            <span>تصدير بديل</span>
          </button>
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
