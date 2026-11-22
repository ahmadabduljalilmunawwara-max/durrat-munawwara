import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, query, where, getDocs, onSnapshot, runTransaction, updateDoc, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { Printer, AlertCircle, CheckCircle2, Loader2, Bus, ClipboardList, Trash2, PlusCircle, RefreshCw, Layers, User as UserIcon, Phone, MapPin, Clock, Calendar, Keyboard, CreditCard } from 'lucide-react';
import { generateVoucherPDF } from '../lib/pdfGenerator';
import { motion, AnimatePresence } from 'motion/react';

export function VoucherEntry() {
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
  const isSuperAdmin = auth?.currentUser?.email === 'ahmad.abduljalilmunawwara@gmail.com' || (sessionUser?.role === 'general_manager');
  
  const [approvalNumber, setApprovalNumber] = useState('');
  const [delegateNumber, setDelegateNumber] = useState('');
  const [organization, setOrganization] = useState('');
  const [busesQuantity, setBusesQuantity] = useState('1');
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
  const [delegateName, setDelegateName] = useState(sessionUser?.displayName || '');
  const [hijriDate, setHijriDate] = useState('');
  const [customDate, setCustomDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [manualVoucherNumber, setManualVoucherNumber] = useState<number | null>(null);

  // Suggestions states
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

  const [activeSuggestionField, setActiveSuggestionField] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'vouchers'), limit(50));
    getDocs(q).then(snap => {
      const names = new Set<string>();
      const mobiles = new Set<string>();
      const ids = new Set<string>();
      const delegates = new Set<string>();
      const orgs = new Set<string>();

      snap.forEach(doc => {
        const d = doc.data();
        if (d.receiverName) names.add(d.receiverName);
        if (d.receiverMobile) mobiles.add(d.receiverMobile);
        if (d.receiverId) ids.add(d.receiverId);
        if (d.delegateNumber) delegates.add(d.delegateNumber);
        if (d.organization) orgs.add(d.organization);
      });

      setHistory({
        receiverNames: Array.from(names).slice(0, 10),
        receiverMobiles: Array.from(mobiles).slice(0, 10),
        receiverIds: Array.from(ids).slice(0, 10),
        delegateNumbers: Array.from(delegates).slice(0, 10),
        organizations: Array.from(orgs).slice(0, 10),
      });
    });
  }, []);

  useEffect(() => {
    if (customDate) {
      try {
        const date = new Date(customDate);
        if (!isNaN(date.getTime())) {
          const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
            day: 'numeric',
            month: 'numeric',
            year: 'numeric'
          });
          const parts = formatter.formatToParts(date);
          const year = parts.find(p => p.type === 'year')?.value;
          const month = parts.find(p => p.type === 'month')?.value.padStart(2, '0');
          const day = parts.find(p => p.type === 'day')?.value.padStart(2, '0');
          if (year && month && day) {
            setHijriDate(`${year}-${month}-${day}`);
          }
        }
      } catch (error) {
        console.error('Hijri conversion error:', error);
      }
    }
  }, [customDate]);

  const [nextVoucherNum, setNextVoucherNum] = useState<number>(1001);
  const [logoUrl, setLogoUrl] = useState<string>('/logo.png');
  const [sloganUrl, setSloganUrl] = useState<string>('');
  const [printCopies, setPrintCopies] = useState<number>(2);
  const [pdfMargins, setPdfMargins] = useState({ top: 20, bottom: 20, left: 40, right: 40 });
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: '' });
  const [usedBusNumbers, setUsedBusNumbers] = useState<Set<string>>(new Set());
  const [buses, setBuses] = useState<Record<string, { driverName: string, busType: string, driverPhone?: string }>>({});
  const [selectedBuses, setSelectedBuses] = useState<{ busNumber: string; driverName: string; busType: string; driverPhone: string; notes?: string }[]>([]);

  useEffect(() => {
    const unsubVouchers = onSnapshot(collection(db, 'vouchers'), (snap) => {
      const used = new Set<string>();
      snap.forEach(doc => {
        const data = doc.data();
        if (data.archived === true) return; // Skip archived vouchers
        if (data.busNumber) used.add(data.busNumber);
        if (Array.isArray(data.buses)) {
          data.buses.forEach(b => {
            if (b.busNumber) used.add(b.busNumber);
          });
        }
      });
      setUsedBusNumbers(used);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vouchers'));

    const unsubBuses = onSnapshot(collection(db, 'buses'), (snapshot) => {
      const data: Record<string, { driverName: string, busType: string, driverPhone?: string }> = {};
      snapshot.forEach(doc => {
        const busData = doc.data();
        data[doc.id] = { 
          driverName: busData.driverName, 
          busType: busData.busType || 'غير محدد',
          driverPhone: busData.driverPhone || ''
         };
      });
      setBuses(data);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));

    const unsubSettings = onSnapshot(doc(db, 'settings', 'app'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.nextVoucherNumber) setNextVoucherNum(data.nextVoucherNumber);
        if (data.logoUrl) setLogoUrl(data.logoUrl);
        if (data.sloganUrl) setSloganUrl(data.sloganUrl);
        if (data.printCopies) setPrintCopies(data.printCopies);
        if (data.pdfMargins) setPdfMargins(data.pdfMargins);
      } else {
        setNextVoucherNum(1000);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/app'));

    return () => { 
      unsubVouchers(); 
      unsubBuses(); 
      unsubSettings(); 
    };
  }, []);

  const finalVoucherNumber = manualVoucherNumber !== null ? manualVoucherNumber : nextVoucherNum;

  const [isVoucherDuplicate, setIsVoucherDuplicate] = useState(false);

  useEffect(() => {
    if (finalVoucherNumber) {
      const q = query(
        collection(db, 'vouchers'),
        where('voucherNumber', '==', finalVoucherNumber),
        limit(1)
      );
      getDocs(q).then(snap => {
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
    const q = query(
      collection(db, 'vouchers'), 
      where('busNumber', '==', num),
      limit(50)
    );
    const snap = await getDocs(q);
    const hasActiveDuplicate = snap.docs.some(doc => doc.data().archived !== true);
    setIsDuplicate(hasActiveDuplicate);
  };

  const addBusToList = () => {
    if (!busNumber.trim()) return;
    
    // Check if bus is already used in any existing voucher
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
    if (selectedBuses.some(b => b.busNumber === busNumber)) {
      setStatus({ type: 'error', msg: 'هذه الحافلة موجودة بالفعل في القائمة' });
      return;
    }

    const currentBus = buses[busNumber];
    setSelectedBuses([...selectedBuses, { 
      busNumber, 
      driverName: currentBus.driverName, 
      busType: currentBus.busType,
      driverPhone: driverPhone || currentBus.driverPhone || '',
      notes: '' 
    }]);
    setBusNumber('');
    setDriverName('');
    setDriverPhone('');
    setStatus({ type: null, msg: '' });
  };

  const removeBusFromList = (index: number) => {
    setSelectedBuses(selectedBuses.filter((_, i) => i !== index));
  };

  useEffect(() => {
    setBusesQuantity(selectedBuses.length.toString() || '0');
  }, [selectedBuses]);

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
          notes: '' 
        };
        setSelectedBuses([newBus]);
        setBusNumber('');
        setDriverName('');
        setDriverPhone('');
        return handleRegister([newBus]);
      }
      setStatus({ type: 'error', msg: 'يجب إضافة حافلة واحدة على الأقل للاعتماد (اضغط Enter في خانة الحافلة أو Ctrl+Enter للإرسال)' });
      return;
    }

    setIsSubmitting(true);
    setStatus({ type: null, msg: '' });

    if (isVoucherDuplicate) {
      setStatus({ type: 'error', msg: `رقم السند ${finalVoucherNumber} مسجل مسبقاً في النظام. يرجى استخدام رقم آخر.` });
      setIsSubmitting(false);
      return;
    }

    try {
      const now = new Date();
      const timestamp = now.toISOString();
      const dateKey = customDate || format(now, 'yyyy-MM-dd');

      // Strict global check for duplicates
      for (const bus of currentBuses) {
        const q = query(
          collection(db, 'vouchers'),
          where('busNumber', '==', bus.busNumber),
          limit(50)
        );
        const snap = await getDocs(q);
        const hasActiveDuplicate = snap.docs.some(doc => doc.data().archived !== true);
        if (hasActiveDuplicate) {
          setStatus({ type: 'error', msg: `الحافلة رقم ${bus.busNumber} مسجلة بالفعل في النظام في سند سابق (غير مؤرشف).` });
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
        userId: sessionUser?.uid || 'anonymous',
        userName: delegateName || 'غير معروف'
      };

      await runTransaction(db, async (transaction) => {
        const settingsDoc = doc(db, 'settings', 'app');
        const settingsSnap = await transaction.get(settingsDoc);
        let actualVoucherNumber = finalVoucherNumber;
        
        if (manualVoucherNumber === null) {
          actualVoucherNumber = settingsSnap.exists() ? (settingsSnap.data().nextVoucherNumber || 1000) : 1000;
        }
        
        const newVoucherRef = doc(collection(db, 'vouchers'));
        transaction.set(newVoucherRef, { ...voucherData, voucherNumber: actualVoucherNumber });
        
        const currentStoredNext = settingsSnap.exists() ? (settingsSnap.data().nextVoucherNumber || 1000) : 1000;
        if (actualVoucherNumber >= currentStoredNext) {
          transaction.set(settingsDoc, { nextVoucherNumber: actualVoucherNumber + 1 }, { merge: true });
        }
        
        return actualVoucherNumber;
      }).then(async (actualVoucherNumber) => {
        const fullData = { ...voucherData, voucherNumber: actualVoucherNumber, logoUrl, sloganUrl, pdfMargins };
        
        const pdfBase64 = await generateVoucherPDF(fullData, { save: true, print: false });
        
        // Print number of copies from settings
        setIsPrinting(true);
        try {
          for (let i = 0; i < printCopies; i++) {
            await generateVoucherPDF(fullData, { save: false, print: true });
            if (i < printCopies - 1) {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        } catch (printErr) {
          console.error('Print Error:', printErr);
        } finally {
          setIsPrinting(false);
        }
      });

      setStatus({ type: 'success', msg: `تم تسجيل السند رقم ${finalVoucherNumber} بنجاح` });
      setManualVoucherNumber(null);
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setSelectedBuses([]);
      setApprovalNumber('');
      setDelegateNumber('');
      setOrganization('');
      setBusesQuantity('1');
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

  const isFormDirty = 
    approvalNumber !== '' ||
    delegateNumber !== '' ||
    organization !== '' ||
    busesQuantity !== '1' ||
    ticketsCount !== '' ||
    pilgrimsCount !== '' ||
    directionFrom !== '' ||
    directionTo !== '' ||
    loadingLocation !== '' ||
    hotelName !== '' ||
    eventTime !== '' ||
    busNumber !== '' ||
    driverPhone !== '' ||
    receiverName !== '' ||
    receiverMobile !== '' ||
    receiverId !== '' ||
    hijriDate !== '' ||
    selectedBuses.length > 0;

  const handleClear = () => {
    if (window.confirm('هل أنت متأكد من مسح كافة البيانات المدخلة في هذا السند؟')) {
      setApprovalNumber('');
      setDelegateNumber('');
      setOrganization('');
      setBusesQuantity('1');
      setTicketsCount('');
      setPilgrimsCount('');
      setDirectionFrom('');
      setDirectionTo('');
      setLoadingLocation('');
      setHotelName('');
      setEventTime('');
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setSelectedBuses([]);
      setReceiverName('');
      setReceiverMobile('');
      setReceiverId('');
      setHijriDate('');
      setStatus({ type: null, msg: '' });
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + Enter or Cmd + Enter: Submit & Print Voucher
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isSubmitting) {
          handleRegister();
        }
      }

      // Alt + C: Clear form
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
    busesQuantity,
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
    manualVoucherNumber,
    delegateName,
    sessionUser,
    logoUrl,
    sloganUrl,
    pdfMargins,
    printCopies
  ]);

  const containerVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" }
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="bg-white rounded-[2rem] shadow-sm border border-slate-200/90 p-7 md:p-10 relative overflow-hidden"
      >
        {/* Top Brand Accent Line */}
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-blue-950 via-blue-700 to-amber-500"></div>

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-7 pb-7 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-13 h-13 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 rounded-2xl flex items-center justify-center text-white shadow-md border border-blue-800">
              <ClipboardList size={26} className="text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-extrabold text-slate-900">إصدار سند جديد</h3>
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              </div>
              <div className="flex items-center gap-2.5 mt-1.5">
                <span className="px-2.5 py-0.5 rounded-lg bg-blue-50 text-blue-900 font-bold text-xs border border-blue-200/80">
                  موسم حج 1448 هـ
                </span>
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span>
                <p className="text-xs font-bold text-emerald-700 leading-none">جاهز للترحيل</p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-200/90 flex flex-col items-end min-w-[140px]">
            <span className="text-[11px] text-slate-500 font-bold block mb-1">رقم السند الرقمي</span>
            <div className="flex items-center gap-1.5">
              <span className="text-amber-600 font-mono font-bold text-lg">#</span>
              {isSuperAdmin ? (
                <div className="relative">
                  <input
                    type="number"
                    lang="en"
                    dir="ltr"
                    value={finalVoucherNumber}
                    onChange={(e) => setManualVoucherNumber(parseInt(e.target.value) || 0)}
                    className={`text-xl font-mono font-extrabold border rounded-lg px-2.5 py-0.5 outline-none w-28 text-right focus:ring-2 transition-all tabular-nums ${
                      isVoucherDuplicate 
                        ? 'text-red-600 border-red-500 bg-red-50 focus:ring-red-400' 
                        : 'text-blue-900 border-slate-300 bg-white focus:ring-blue-500/20 focus:border-blue-600'
                    }`}
                  />
                  {isVoucherDuplicate && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute -bottom-8 right-0 bg-red-600 text-white text-[10px] px-2 py-0.5 rounded-md font-bold whitespace-nowrap z-20 shadow-md"
                    >
                      رقم مكرر!
                    </motion.div>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <span className={`text-xl font-mono font-extrabold tabular-nums ${isVoucherDuplicate ? 'text-red-600' : 'text-blue-900'}`} lang="en" dir="ltr">{finalVoucherNumber}</span>
                  {isVoucherDuplicate && (
                    <div className="absolute -bottom-6 right-0 text-red-600 text-[10px] font-bold whitespace-nowrap">
                      رقم مكرر!
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Keyboard Shortcuts Prompt Banner */}
        <div className="bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3 sm:px-5 sm:py-3 mb-8 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <Keyboard size={16} className="text-blue-700 shrink-0" />
            <span className="font-bold text-slate-800">اختصارات لوحة المفاتيح:</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-semibold text-xs">
              <kbd className="font-mono bg-blue-50 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 text-[11px] font-bold" dir="ltr">Ctrl + Enter</kbd>
              <span>إرسال وطباعة</span>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-semibold text-xs">
              <kbd className="font-mono bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded border border-amber-200 text-[11px] font-bold" dir="ltr">Enter ↵</kbd>
              <span>إضافة حافلة</span>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1 rounded-lg text-slate-700 font-semibold text-xs">
              <kbd className="font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200 text-[11px] font-bold" dir="ltr">Alt + C</kbd>
              <span>مسح الحقول</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          <div className="space-y-6">
            <div className="group relative">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1 group-focus-within:text-blue-700 transition-colors">
                <UserIcon size={14} className="text-blue-700" />
                اسم المستلم (مندوب الميدان)
              </label>
              <input
                type="text"
                value={receiverName}
                onFocus={() => setActiveSuggestionField('receiverName')}
                onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                onChange={(e) => setReceiverName(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                placeholder="أدخل اسم المندوب المستلم..."
              />
              <AnimatePresence>
                {activeSuggestionField === 'receiverName' && history.receiverNames.filter(n => n.includes(receiverName)).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
                  >
                    {history.receiverNames.filter(n => n.includes(receiverName)).map((name, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReceiverName(name)}
                        className="w-full text-right px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50/60 hover:text-blue-800 transition-colors border-b border-slate-100 last:border-0"
                      >
                        {name}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="group relative">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1 group-focus-within:text-blue-700 transition-colors">
                <Phone size={14} className="text-blue-700" />
                رقم موبايل المستلم
              </label>
              <input
                type="text"
                value={receiverMobile}
                onFocus={() => setActiveSuggestionField('receiverMobile')}
                onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                onChange={(e) => setReceiverMobile(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                placeholder="05xxxxxxx"
              />
              <AnimatePresence>
                {activeSuggestionField === 'receiverMobile' && history.receiverMobiles.filter(m => m.includes(receiverMobile)).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
                  >
                    {history.receiverMobiles.filter(m => m.includes(receiverMobile)).map((mobile, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReceiverMobile(mobile)}
                        className="w-full text-right px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50/60 hover:text-blue-800 transition-colors border-b border-slate-100 last:border-0 tabular-nums"
                      >
                        {mobile}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="group relative">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1 group-focus-within:text-blue-700 transition-colors">
                <CreditCard size={14} className="text-blue-700" />
                رقم هوية المستلم
              </label>
              <input
                type="text"
                value={receiverId}
                onFocus={() => setActiveSuggestionField('receiverId')}
                onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                onChange={(e) => setReceiverId(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                placeholder="10xxxxxxxx"
              />
              <AnimatePresence>
                {activeSuggestionField === 'receiverId' && history.receiverIds.filter(id => id.includes(receiverId)).length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute z-50 top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
                  >
                    {history.receiverIds.filter(id => id.includes(receiverId)).map((idNum, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setReceiverId(idNum)}
                        className="w-full text-right px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50/60 hover:text-blue-800 transition-colors border-b border-slate-100 last:border-0 tabular-nums"
                      >
                        {idNum}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="group relative">
                <label className="block text-xs font-bold text-slate-700 mb-2.5 mr-1 group-focus-within:text-blue-700 transition-colors">رقم المكتب</label>
                <input
                  type="text"
                  value={delegateNumber}
                  onFocus={() => setActiveSuggestionField('delegateNumber')}
                  onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                  onChange={(e) => setDelegateNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                  placeholder="رقم المكتب..."
                />
                <AnimatePresence>
                  {activeSuggestionField === 'delegateNumber' && history.delegateNumbers.filter(d => d.includes(delegateNumber)).length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute z-50 top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
                    >
                      {history.delegateNumbers.filter(d => d.includes(delegateNumber)).map((num, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setDelegateNumber(num)}
                          className="w-full text-right px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50/60 hover:text-blue-800 transition-colors border-b border-slate-100 last:border-0 tabular-nums"
                        >
                          {num}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="group relative">
                <label className="block text-xs font-bold text-slate-700 mb-2.5 mr-1 group-focus-within:text-blue-700 transition-colors">التابع لمؤسسة</label>
                <input
                  type="text"
                  value={organization}
                  onFocus={() => setActiveSuggestionField('organization')}
                  onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                  onChange={(e) => setOrganization(e.target.value)}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                  placeholder="المؤسسة..."
                />
                <AnimatePresence>
                  {activeSuggestionField === 'organization' && history.organizations.filter(o => o.includes(organization)).length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="absolute z-50 top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden"
                    >
                      {history.organizations.filter(o => o.includes(organization)).map((org, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setOrganization(org)}
                          className="w-full text-right px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-blue-50/60 hover:text-blue-800 transition-colors border-b border-slate-100 last:border-0"
                        >
                          {org}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2.5 mr-1">عدد الحافلات</label>
                <input
                  type="text"
                  value={busesQuantity}
                  readOnly
                  className="w-full px-5 py-3.5 bg-blue-50/60 border border-blue-200/80 rounded-2xl outline-none font-extrabold text-blue-800 text-center text-base tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2.5 mr-1">عدد التذاكر</label>
                <input
                  type="text"
                  value={ticketsCount}
                  onChange={(e) => setTicketsCount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2.5 mr-1">عدد الحجاج</label>
                <input
                  type="text"
                  value={pilgrimsCount}
                  onChange={(e) => setPilgrimsCount(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                  placeholder="عدد الحجاج..."
                />
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <div className="group">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1 group-focus-within:text-blue-700 transition-colors">
                  <Layers size={14} className="text-blue-700" />
                  بموجب اعتماد رقم
                </label>
                <input
                  type="text"
                  value={approvalNumber}
                  onChange={(e) => setApprovalNumber(e.target.value)}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                  placeholder="أدخل رقم الاعتماد..."
                />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-50/90 p-6 rounded-3xl border border-slate-200/90 space-y-5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold text-slate-900 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  إضافة الحافلات المشمولة بالسند
                </label>
                <span className="text-xs font-bold text-blue-900 bg-blue-100/80 border border-blue-200 px-3 py-0.5 rounded-full tabular-nums">
                  العدد المضاف: {selectedBuses.length}
                </span>
              </div>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={busNumber}
                    onChange={(e) => setBusNumber(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        if (busNumber && driverName && !isDuplicate && !usedBusNumbers.has(busNumber)) {
                          addBusToList();
                        }
                      }
                    }}
                    className={`w-full px-5 py-3.5 bg-white border-2 rounded-2xl text-xl font-extrabold outline-none transition-all tabular-nums ${
                      isDuplicate 
                        ? 'border-red-500 text-red-600 ring-4 ring-red-50' 
                        : busNumber && driverName 
                          ? 'border-blue-600 text-blue-900 shadow-sm' 
                          : 'border-slate-200 text-slate-900 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10'
                    }`}
                    placeholder="رقم الحافلة..."
                  />
                  {isDuplicate && (
                    <motion.div 
                      initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                      className="absolute top-full right-0 mt-2.5 flex items-center gap-2 text-red-700 text-xs font-bold bg-red-50 px-3 py-1.5 rounded-xl z-10 border border-red-200 shadow-xs"
                    >
                      <AlertCircle size={14} />
                      هذه الحافلة مسجلة مسبقاً في النظام
                    </motion.div>
                  )}
                </div>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={addBusToList}
                  disabled={!busNumber || !driverName || isDuplicate || usedBusNumbers.has(busNumber)}
                  className="px-5 bg-gradient-to-l from-slate-900 via-blue-950 to-blue-800 text-white rounded-2xl font-bold hover:opacity-95 transition-all disabled:bg-slate-200 disabled:text-slate-400 disabled:from-slate-200 disabled:to-slate-200 flex items-center justify-center gap-2 shadow-sm cursor-pointer group"
                  title="إضافة الحافلة (Enter)"
                >
                  <PlusCircle size={22} className="text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="hidden sm:inline-block text-xs font-mono font-bold bg-white/15 px-1.5 py-0.5 rounded text-white">↵</span>
                </motion.button>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="relative">
                  <input
                    type="text"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault();
                        if (busNumber && driverName && !isDuplicate && !usedBusNumbers.has(busNumber)) {
                          addBusToList();
                        }
                      }
                    }}
                    className="w-full px-5 py-3.5 bg-white border border-slate-200/90 rounded-2xl focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-800 text-sm tabular-nums"
                    placeholder="رقم هاتف السائق..."
                  />
                  <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                </div>
              </div>

              <AnimatePresence>
                {selectedBuses.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-white rounded-2xl p-4 border border-slate-200/80 overflow-hidden"
                  >
                    <h4 className="text-xs font-bold text-slate-600 mb-3 mr-1">الحافلات المضافة ({selectedBuses.length})</h4>
                    <div className="space-y-2">
                      {selectedBuses.map((bus, idx) => {
                        const isUsed = usedBusNumbers.has(bus.busNumber);
                        return (
                          <motion.div 
                            initial={{ x: -10, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            key={idx} 
                            className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                              isUsed 
                                ? 'bg-red-50/70 border-red-200' 
                                : 'bg-emerald-50/70 border-emerald-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-base font-extrabold tabular-nums ${isUsed ? 'text-red-900' : 'text-emerald-950'}`}>{bus.busNumber}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold ${
                                isUsed ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                              }`}>
                                {isUsed ? 'مسددة' : 'جاهزة'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeBusFromList(idx)}
                              className="text-slate-400 hover:text-red-600 transition-colors p-1"
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

            <div className="group">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-600 mb-2.5 mr-1">
                <UserIcon size={14} className="text-slate-500" />
                السائق (تعريف تلقائي)
              </label>
              <div className="w-full px-5 py-3.5 bg-slate-100/80 border border-dashed border-slate-300 rounded-2xl text-slate-800 font-bold min-h-[54px] flex items-center text-sm">
                {driverName || <span className="text-slate-400 font-medium text-xs">سيظهر اسم السائق عند إدخال رقم الحافلة...</span>}
              </div>
            </div>

            <div className="group">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1">
                <Calendar size={14} className="text-blue-700" />
                التاريخ ميلادي / هجري
              </label>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                />
                <input
                  type="text"
                  value={hijriDate}
                  onChange={(e) => setHijriDate(e.target.value)}
                  className="w-full px-4 py-3.5 bg-slate-100/80 border border-slate-200/80 rounded-2xl outline-none font-bold text-slate-600 text-sm tabular-nums"
                  readOnly
                />
              </div>
            </div>

            <div className="group">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1">
                <MapPin size={14} className="text-blue-700" />
                خط السير والإتجاه
              </label>
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="text"
                  value={directionFrom}
                  onChange={(e) => setDirectionFrom(e.target.value)}
                  placeholder="من..."
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                />
                <input
                  type="text"
                  value={directionTo}
                  onChange={(e) => setDirectionTo(e.target.value)}
                  placeholder="إلى..."
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="group">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1">
                  <MapPin size={14} className="text-blue-700" />
                  مكان التحميل
                </label>
                <input
                  type="text"
                  value={loadingLocation}
                  onChange={(e) => setLoadingLocation(e.target.value)}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                  placeholder="أدخل مكان التحميل..."
                />
              </div>
              <div className="group">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1">
                  <Layers size={14} className="text-blue-700" />
                  اسم الفندق
                </label>
                <input
                  type="text"
                  value={hotelName}
                  onChange={(e) => setHotelName(e.target.value)}
                  className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                  placeholder="أدخل اسم الفندق..."
                />
              </div>
            </div>

            <div className="group">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1">
                <Clock size={14} className="text-blue-700" />
                توقيت الحركة
              </label>
              <input
                type="text"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm"
                placeholder="مثلاً: 09:30 صباحاً"
              />
            </div>

            <div className="group">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mb-2.5 mr-1">
                <ClipboardList size={14} className="text-blue-700" />
                ملاحظات إضافية
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-5 py-3.5 bg-slate-50/80 border border-slate-200/90 rounded-2xl hover:border-slate-300 focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm resize-none"
                placeholder="أدخل أي ملاحظات إضافية هنا..."
              />
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-slate-100">
          <AnimatePresence mode="wait">
            {status.type && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-4 rounded-2xl flex items-center gap-4 mb-6 shadow-md ${
                  status.type === 'success' 
                    ? 'bg-emerald-600 text-white' 
                    : 'bg-red-600 text-white'
                }`}
              >
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
                  {isPrinting ? <Loader2 size={22} className="animate-spin" /> : (status.type === 'success' ? <CheckCircle2 size={22} /> : <AlertCircle size={22} />)}
                </div>
                <div>
                  <p className="text-sm font-bold leading-snug">
                    {isPrinting ? 'جـاري تـحضـير الـسـند للـطبـاعة...' : status.msg}
                  </p>
                  <p className="text-xs opacity-85 font-medium mt-0.5">نظام محطة درة المنورة الرقمي</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col sm:flex-row gap-4">
            <AnimatePresence>
              {isFormDirty && !isSubmitting && (
                <motion.button
                  key="clear-btn"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  whileHover={{ backgroundColor: '#fee2e2' }}
                  whileTap={{ scale: 0.97 }}
                  type="button"
                  onClick={handleClear}
                  className="px-6 py-4 bg-red-50 text-red-700 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2.5 border border-red-200 shrink-0 cursor-pointer"
                  title="مسح الحقول (Alt + C)"
                >
                  <Trash2 size={20} />
                  <span>إفراغ الحقول</span>
                  <span className="text-xs font-mono font-bold bg-red-100 px-2 py-0.5 rounded-md text-red-800" dir="ltr">Alt+C</span>
                </motion.button>
              )}
            </AnimatePresence>

            <motion.button
              disabled={isSubmitting || selectedBuses.length === 0}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleRegister()}
              className="flex-1 py-4 bg-gradient-to-l from-slate-900 via-blue-950 to-blue-800 text-white rounded-2xl font-extrabold text-lg shadow-lg shadow-blue-950/15 transition-all disabled:bg-slate-200 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none flex items-center justify-center gap-3.5 group cursor-pointer"
              title="اعتماد وطباعة السند (Ctrl + Enter)"
            >
              {isSubmitting ? (
                <Loader2 className="animate-spin" size={24} />
              ) : (
                <Printer size={24} className="text-amber-400 group-hover:scale-105 transition-transform" />
              )}
              <span>اعتماد وتسجيل السند الرقمي</span>
              <span className="hidden sm:inline-flex items-center gap-1 text-xs bg-white/15 px-2.5 py-1 rounded-lg font-mono font-bold text-white border border-white/20" dir="ltr">
                <span>Ctrl</span>
                <span>+</span>
                <span>Enter ↵</span>
              </span>
            </motion.button>
          </div>
          
          {selectedBuses.length === 0 && !isSubmitting && (
            <p className="text-center text-xs text-amber-700 font-bold mt-4">يجب إضافة حافلة واحدة على الأقل للاعتماد</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
