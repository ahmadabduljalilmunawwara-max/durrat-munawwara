import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, limit, doc, deleteDoc, onSnapshot, or, updateDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { 
  Search, History, Bus, FileText, Calendar, Printer, Loader2, Trash2, X, 
  ChevronLeft, ChevronRight, Edit2, Save, ClipboardList, Download, 
  Layers, Filter, CalendarDays, CheckCircle2, Building2, UserCheck, Sparkles, RefreshCw,
  AlertCircle, ExternalLink, FileDown
} from 'lucide-react';
import { generateVoucherPDF, exportVoucherLegacyPDF, generateBulkOfficePDF, generateStatementReportPDF } from '../lib/pdfGenerator';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

type SeasonFilter = '1448' | '1447' | 'all';
type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'custom_month' | 'custom_range';

export function VoucherSearch({ initialSearchTerm = '' }: { initialSearchTerm?: string }) {
  // Raw Data and Real-time Stream
  const [allVouchers, setAllVouchers] = useState<any[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
  
  // Filter States
  const [selectedSeason, setSelectedSeason] = useState<SeasonFilter>('1448');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('all');
  const [customMonth, setCustomMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [customStartDate, setCustomStartDate] = useState<string>(format(new Date(), 'yyyy-MM-01'));
  const [customEndDate, setCustomEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  // UI States
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPrinting, setIsPrinting] = useState<string | null>(null);
  const [isLegacyExporting, setIsLegacyExporting] = useState<string | null>(null);
  const [printAlert, setPrintAlert] = useState<{
    voucherId: string;
    type: 'popup_blocked' | 'error';
    msg: string;
    blobUrl?: string;
    voucherData?: any;
  } | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [busPages, setBusPages] = useState<Record<string, number>>({});
  const [voucherToDelete, setVoucherToDelete] = useState<any | null>(null);
  const [voucherToEdit, setVoucherToEdit] = useState<any | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isConfirmSaveOpen, setIsConfirmSaveOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  // Settings & Assets
  const [logoUrl, setLogoUrl] = useState<string>('');
  const [sloganUrl, setSloganUrl] = useState<string>('');
  const [pdfMargins, setPdfMargins] = useState({ top: 20, bottom: 20, left: 40, right: 40 });
  const [printTwoCopies, setPrintTwoCopies] = useState(false);
  const [allBusesMaster, setAllBusesMaster] = useState<Record<string, any>>({});

  useEffect(() => {
    if (initialSearchTerm) {
      setSearchTerm(initialSearchTerm);
      setSelectedSeason('all');
      setSelectedPeriod('all');
    }
  }, [initialSearchTerm]);

  // Report Modal Config
  const [reportType, setReportType] = useState<'monthly' | 'seasonal' | 'custom' | 'filtered'>('monthly');
  const [reportSeason, setReportSeason] = useState<'1448' | '1447'>('1448');
  const [reportMonth, setReportMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [reportStartDate, setReportStartDate] = useState<string>(format(new Date(), 'yyyy-MM-01'));
  const [reportEndDate, setReportEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [reportTitleCustom, setReportTitleCustom] = useState<string>('');
  const [reportSigner, setReportSigner] = useState<string>('');

  let sessionUser: any = {};
  try {
    sessionUser = JSON.parse(localStorage.getItem('dmtc_session') || '{}');
  } catch (e) {
    console.error('Session parse error', e);
  }

  const currentUser = auth.currentUser;
  const currentUserName = sessionUser?.displayName || currentUser?.displayName || sessionUser?.name || 'مدير العمليات';

  useEffect(() => {
    setReportSigner(currentUserName);
  }, [currentUserName]);

  // Load Settings
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'app'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setLogoUrl(data.logoUrl || '');
        setSloganUrl(data.sloganUrl || '');
        if (data.pdfMargins) setPdfMargins(data.pdfMargins);
      }
    });
    return unsub;
  }, []);

  // Load Buses Master
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'buses'), (snap) => {
      const bMap: Record<string, any> = {};
      snap.forEach(docSnap => {
        bMap[docSnap.id] = docSnap.data();
      });
      setAllBusesMaster(bMap);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));
    return unsub;
  }, []);

  // Real-time listener for vouchers (up to 1000 records)
  useEffect(() => {
    setIsLoadingAll(true);
    const q = query(
      collection(db, 'vouchers'),
      orderBy('timestamp', 'desc'),
      limit(1000)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      setAllVouchers(list);
      setIsLoadingAll(false);
    }, (error) => {
      console.error(error);
      setIsLoadingAll(false);
      handleFirestoreError(error, OperationType.LIST, 'vouchers');
    });

    return () => unsub();
  }, []);

  // Distinct organizations list for filter
  const organizationsList = useMemo(() => {
    const orgs = new Set<string>();
    allVouchers.forEach(v => {
      if (v.organization && String(v.organization).trim()) {
        orgs.add(String(v.organization).trim());
      }
    });
    return Array.from(orgs);
  }, [allVouchers]);

  // Season count helpers
  const countSeason1448 = useMemo(() => {
    return allVouchers.filter(v => v.hajjSeason === '1448').length;
  }, [allVouchers]);

  const countSeason1447 = useMemo(() => {
    return allVouchers.filter(v => v.hajjSeason === '1447' || (!v.hajjSeason && v.archived === true) || !v.hajjSeason).length;
  }, [allVouchers]);

  // Filter logic
  const filteredVouchers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const currentMonthStr = format(new Date(), 'yyyy-MM');

    return allVouchers.filter(v => {
      // 1. Season Filter
      if (selectedSeason === '1448') {
        if (v.hajjSeason !== '1448') return false;
      } else if (selectedSeason === '1447') {
        const is1447 = v.hajjSeason === '1447' || (!v.hajjSeason && v.archived === true) || !v.hajjSeason;
        if (!is1447) return false;
      }

      // 2. Organization Filter
      if (selectedOrg !== 'all') {
        if (v.organization !== selectedOrg) return false;
      }

      // 3. Period Filter
      const vDateStr = v.customDate || v.dateKey || (v.timestamp ? format(new Date(v.timestamp), 'yyyy-MM-dd') : '');
      if (selectedPeriod === 'today') {
        if (vDateStr !== todayStr) return false;
      } else if (selectedPeriod === 'week') {
        if (!v.timestamp) return false;
        const vDate = new Date(v.timestamp);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (vDate < sevenDaysAgo) return false;
      } else if (selectedPeriod === 'month') {
        if (!vDateStr.startsWith(currentMonthStr)) return false;
      } else if (selectedPeriod === 'custom_month') {
        if (!vDateStr.startsWith(customMonth)) return false;
      } else if (selectedPeriod === 'custom_range') {
        if (vDateStr < customStartDate || vDateStr > customEndDate) return false;
      }

      // 4. Search Term Filter
      if (term) {
        const vNum = String(v.voucherNumber || '').toLowerCase();
        const approval = String(v.approvalNumber || '').toLowerCase();
        const delegate = String(v.delegateNumber || '').toLowerCase();
        const org = String(v.organization || '').toLowerCase();
        const driver = String(v.driverName || '').toLowerCase();
        const busNum = String(v.busNumber || '').toLowerCase();
        const receiver = String(v.receiverName || '').toLowerCase();
        const receiverMobile = String(v.receiverMobile || '').toLowerCase();
        const receiverId = String(v.receiverId || '').toLowerCase();
        const hotel = String(v.hotelName || '').toLowerCase();
        const loading = String(v.loadingLocation || '').toLowerCase();
        const from = String(v.directionFrom || '').toLowerCase();
        const to = String(v.directionTo || '').toLowerCase();

        // Check in nested buses
        let matchInBuses = false;
        if (Array.isArray(v.buses)) {
          matchInBuses = v.buses.some((b: any) => 
            String(b.busNumber || '').toLowerCase().includes(term) ||
            String(b.driverName || '').toLowerCase().includes(term) ||
            String(b.driverPhone || '').toLowerCase().includes(term)
          );
        }

        const directMatch = vNum.includes(term) ||
          approval.includes(term) ||
          delegate.includes(term) ||
          org.includes(term) ||
          driver.includes(term) ||
          busNum.includes(term) ||
          receiver.includes(term) ||
          receiverMobile.includes(term) ||
          receiverId.includes(term) ||
          hotel.includes(term) ||
          loading.includes(term) ||
          from.includes(term) ||
          to.includes(term);

        if (!directMatch && !matchInBuses) return false;
      }

      return true;
    });
  }, [allVouchers, selectedSeason, selectedPeriod, customMonth, customStartDate, customEndDate, selectedOrg, searchTerm]);

  // Aggregate Metrics for Filtered Data
  const metrics = useMemo(() => {
    let totalBuses = 0;
    let totalPilgrims = 0;
    let totalTickets = 0;
    const orgs = new Set<string>();

    filteredVouchers.forEach(v => {
      const bCount = Array.isArray(v.buses) && v.buses.length > 0
        ? v.buses.length
        : (Number(v.busesQuantity) || (v.busNumber ? 1 : 0));
      totalBuses += bCount;
      totalPilgrims += Number(v.pilgrimsCount) || 0;
      totalTickets += Number(v.ticketsCount) || 0;
      if (v.organization) orgs.add(v.organization);
    });

    return {
      vouchersCount: filteredVouchers.length,
      totalBuses,
      totalPilgrims,
      totalTickets,
      organizationsCount: orgs.size
    };
  }, [filteredVouchers]);

  // Paginated Slices
  const totalPages = Math.ceil(filteredVouchers.length / itemsPerPage) || 1;
  const paginatedVouchers = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredVouchers.slice(start, start + itemsPerPage);
  }, [filteredVouchers, currentPage]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSeason, selectedPeriod, customMonth, customStartDate, customEndDate, selectedOrg, searchTerm]);

  // Allowed to delete check
  const isAllowedToDelete = auth.currentUser?.email === 'ahmad.abduljalilmunawwara@gmail.com' || 
                          sessionUser.role === 'general_manager' || 
                          sessionUser.role === 'supervisor';

  // Printing single voucher
  const rePrint = async (v: any) => {
    setIsPrinting(v.id);
    setPrintAlert(null);
    const fullData = { ...v, currentUserName, logoUrl, sloganUrl, pdfMargins };
    try {
      const printRes = await generateVoucherPDF(fullData, { save: true, print: true, twoCopies: printTwoCopies });
      if (printRes.status === 'popup_blocked') {
        setPrintAlert({
          voucherId: v.id,
          type: 'popup_blocked',
          msg: 'اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة',
          blobUrl: printRes.blobUrl,
          voucherData: fullData,
        });
      }
    } catch (err) {
      console.error('Print error:', err);
      setPrintAlert({
        voucherId: v.id,
        type: 'error',
        msg: 'تعذّر فتح نافذة الطباعة. يمكنك استخدام التصدير البديل أدناه.',
        voucherData: fullData,
      });
    } finally {
      setIsPrinting(null);
    }
  };

  const handleLegacyExport = async (v: any) => {
    setIsLegacyExporting(v.id);
    const fullData = { ...v, currentUserName, logoUrl, sloganUrl, pdfMargins };
    try {
      await exportVoucherLegacyPDF(fullData, { save: true, twoCopies: printTwoCopies });
    } catch (err) {
      console.error('Legacy PDF export error:', err);
      setPrintAlert({
        voucherId: v.id,
        type: 'error',
        msg: 'حدث خطأ أثناء التصدير البديل لملف PDF.',
        voucherData: fullData,
      });
    } finally {
      setIsLegacyExporting(null);
    }
  };

  // Printing Bulk Office Report (matches single voucher layout & pagination)
  const printOfficeReport = async () => {
    if (filteredVouchers.length === 0) return;

    const allBuses: any[] = [];
    let totalTickets = 0;
    let totalPilgrims = 0;

    filteredVouchers.forEach(v => {
      totalTickets += Number(v.ticketsCount) || 0;
      totalPilgrims += Number(v.pilgrimsCount) || 0;

      if (v.buses && Array.isArray(v.buses) && v.buses.length > 0) {
        const busesWithApproval = v.buses.map((b: any) => ({
          ...b,
          approvalNumber: b.approvalNumber || v.approvalNumber || ''
        }));
        allBuses.push(...busesWithApproval);
      } else if (v.busNumber || v.driverName || v.driverPhone) {
        allBuses.push({
          busNumber: v.busNumber || '',
          driverName: v.driverName || '',
          busType: v.busType || 'حافلة',
          driverPhone: v.driverPhone || '',
          approvalNumber: v.approvalNumber || ''
        });
      }
    });

    if (allBuses.length === 0) {
      setPrintAlert({
        voucherId: '__bulk_office__',
        type: 'error',
        msg: 'لا توجد حافلات مسجلة ضمن النتائج الحالية لطباعة الكشف.',
      });
      return;
    }

    const template = filteredVouchers[0];
    const targetWindow = window.open('', '_blank');
    const reportData = {
      ...template,
      buses: allBuses,
      busesQuantity: String(allBuses.length),
      ticketsCount: totalTickets > 0 ? String(totalTickets) : (totalPilgrims > 0 ? String(totalPilgrims) : template.ticketsCount),
      pilgrimsCount: totalPilgrims > 0 ? String(totalPilgrims) : template.pilgrimsCount,
      approvalNumber: '',
      currentUserName,
      logoUrl,
      sloganUrl,
      pdfMargins,
      voucherNumber: 'كشف مـجمع',
      isBulkReport: true
    };

    setIsPrinting('__bulk_office__');
    setPrintAlert(null);
    try {
      const printRes = await generateBulkOfficePDF(reportData, {
        save: true,
        print: true,
        twoCopies: printTwoCopies,
        targetWindow,
      });
      if (printRes.status === 'popup_blocked') {
        setPrintAlert({
          voucherId: '__bulk_office__',
          type: 'popup_blocked',
          msg: 'اسمح بالنوافذ المنبثقة لهذا الموقع ثم أعد المحاولة',
          blobUrl: printRes.blobUrl,
          voucherData: reportData,
        });
      }
    } catch (err) {
      console.error('Bulk office print error:', err);
      setPrintAlert({
        voucherId: '__bulk_office__',
        type: 'error',
        msg: 'تعذّر فتح نافذة طباعة كشف المكتب.',
        voucherData: reportData,
      });
    } finally {
      setIsPrinting(null);
    }
  };

  // Generate Formal Statement PDF (Monthly / Seasonal / Custom)
  const handleGenerateStatement = async (downloadOnly = false) => {
    setIsGeneratingReport(true);
    try {
      let targetVouchers: any[] = [];
      let periodTitle = '';
      let defaultTitle = '';

      if (reportType === 'monthly') {
        const [year, month] = reportMonth.split('-');
        const monthNamesArabic = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
        const monthName = monthNamesArabic[parseInt(month, 10) - 1] || month;
        periodTitle = `شهر ${monthName} ${year} م`;
        defaultTitle = `كشف السندات والعمليات التشغيلية - ${periodTitle}`;
        targetVouchers = allVouchers.filter(v => {
          const dKey = v.customDate || v.dateKey || (v.timestamp ? format(new Date(v.timestamp), 'yyyy-MM') : '');
          return dKey.startsWith(reportMonth);
        });
      } else if (reportType === 'seasonal') {
        const seasonName = reportSeason === '1448' ? 'موسم حج 1448 هـ' : 'موسم حج 1447 هـ';
        periodTitle = seasonName;
        defaultTitle = `كشف السندات والعمليات التشغيلية - ${seasonName}`;
        targetVouchers = allVouchers.filter(v => {
          if (reportSeason === '1448') return v.hajjSeason === '1448';
          return v.hajjSeason === '1447' || (!v.hajjSeason && v.archived === true) || !v.hajjSeason;
        });
      } else if (reportType === 'custom') {
        periodTitle = `من ${reportStartDate} إلى ${reportEndDate}`;
        defaultTitle = `كشف السندات التشغيلية للفترة من ${reportStartDate} إلى ${reportEndDate}`;
        targetVouchers = allVouchers.filter(v => {
          const dKey = v.customDate || v.dateKey || (v.timestamp ? format(new Date(v.timestamp), 'yyyy-MM-dd') : '');
          return dKey >= reportStartDate && dKey <= reportEndDate;
        });
      } else {
        // Filtered view
        periodTitle = `السجلات المحددة في البحث (${filteredVouchers.length} سند)`;
        defaultTitle = `كشف تقرير السندات والعمليات التشغيلية`;
        targetVouchers = filteredVouchers;
      }

      if (targetVouchers.length === 0) {
        alert('لا توجد سندات مطابقة لهذه الفترة لتوليد الكشف');
        setIsGeneratingReport(false);
        return;
      }

      // Sort chronological
      targetVouchers.sort((a, b) => (Number(a.voucherNumber) || 0) - (Number(b.voucherNumber) || 0));

      await generateStatementReportPDF({
        reportTitle: reportTitleCustom.trim() || defaultTitle,
        periodLabel: periodTitle,
        reportType,
        vouchers: targetVouchers,
        logoUrl,
        sloganUrl,
        generatedBy: reportSigner.trim() || currentUserName,
        season: reportSeason
      }, {
        save: downloadOnly,
        print: !downloadOnly
      });

      setIsReportModalOpen(false);
    } catch (err) {
      console.error('Failed to generate statement report', err);
      alert('حدث خطأ أثناء توليد التقرير');
    } finally {
      setIsGeneratingReport(false);
    }
  };

  // Deleting voucher
  const deleteVoucher = async () => {
    if (!voucherToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'vouchers', voucherToDelete.id));
      setIsDeleteModalOpen(false);
      setVoucherToDelete(null);
    } catch (error) {
      console.error('Delete error:', error);
      handleFirestoreError(error, OperationType.DELETE, `vouchers/${voucherToDelete.id}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = (voucher: any) => {
    setVoucherToDelete(voucher);
    setIsDeleteModalOpen(true);
  };

  const handleEditVoucher = (voucher: any) => {
    const v = { ...voucher };
    if (!v.buses || !Array.isArray(v.buses)) {
      v.buses = [{
        busNumber: v.busNumber || '',
        driverName: v.driverName || '',
        driverPhone: v.driverPhone || '',
        busType: v.busType || 'غير محدد'
      }];
    }
    setVoucherToEdit(v);
    setIsEditModalOpen(true);
  };

  const updateVoucher = async () => {
    if (!voucherToEdit) return;
    setIsUpdating(true);
    try {
      const voucherRef = doc(db, 'vouchers', voucherToEdit.id);
      const { id, ...updateData } = voucherToEdit;
      await updateDoc(voucherRef, updateData);
      setIsConfirmSaveOpen(false);
      setIsEditModalOpen(false);
      setVoucherToEdit(null);
    } catch (error) {
      console.error('Update error:', error);
      handleFirestoreError(error, OperationType.UPDATE, `vouchers/${voucherToEdit.id}`);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-[var(--space-6)]" dir="rtl">
      
      {/* Top Header Card */}
      <div className="bg-[var(--surface)] rounded-[2rem] shadow-sm border border-[var(--border)] p-[var(--space-4)] lg:p-[var(--space-8)]">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-[var(--space-6)] pb-[var(--space-6)] border-b border-[var(--border)]">
          <div className="flex items-center gap-[var(--space-4)]">
            <div className="w-14 h-14 bg-[var(--navy)] rounded-2xl flex items-center justify-center text-[var(--gold)] shadow-lg ring-4 ring-blue-50 dark:ring-blue-950/50">
              <Search size={28} />
            </div>
            <div>
              <div className="flex items-center gap-[var(--space-3)]">
                <h2 className="text-2xl font-black text-[var(--text)]">البحث والأرشيف الشامل</h2>
                <span className="bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] text-xs font-black px-[var(--space-3)] py-[var(--space-1)] rounded-full border border-emerald-200 dark:border-emerald-800/70 flex items-center gap-[var(--space-2)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse"></span>
                  تحديث لحظي
                </span>
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-bold mt-[var(--space-1)]">
                استعراض وتصفية السجلات، وتوليد كشوفات وتقارير PDF الشهرية والموسمية
              </p>
            </div>
          </div>

          {/* Action Buttons for Managers */}
          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-black text-sm transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
            >
              <FileText size={18} />
              <span>توليد كشف وتقارير PDF</span>
              <Sparkles size={16} className="text-[var(--gold)]" />
            </button>

            {filteredVouchers.length > 0 && (
              <button
                onClick={printOfficeReport}
                disabled={isPrinting === '__bulk_office__'}
                className="flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] rounded-2xl font-bold text-sm hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-all border border-[var(--border)] disabled:opacity-60 cursor-pointer"
                title="طباعة كشف مجمع للحافلات المستعرضة"
              >
                {isPrinting === '__bulk_office__' ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
                <span>كشف المكتب السريع</span>
              </button>
            )}
          </div>
        </div>

        {printAlert?.voucherId === '__bulk_office__' && (
          <div className="mt-[var(--space-4)] p-[var(--space-3)] rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 flex flex-wrap items-center justify-between gap-[var(--space-3)] text-xs">
            <div className="flex items-center gap-2 font-bold text-[var(--gold-text)]">
              <AlertCircle size={16} className="shrink-0" />
              <span>{printAlert.msg}</span>
            </div>
            {printAlert.blobUrl && (
              <a
                href={printAlert.blobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--btn-primary)] text-white font-bold hover:bg-[var(--btn-primary-hover)] transition-colors"
              >
                <ExternalLink size={14} />
                <span>فتح الكشف في تبويب جديد</span>
              </a>
            )}
          </div>
        )}

        {/* Season Selector Tabs */}
        <div className="mt-[var(--space-6)] flex flex-wrap items-center gap-[var(--space-2)]">
          <div className="text-xs font-black text-[var(--text-secondary)] ml-[var(--space-2)]">الموسم:</div>
          <button
            onClick={() => setSelectedSeason('1448')}
            className={`px-[var(--space-4)] py-[var(--space-2)] rounded-xl text-xs font-black transition-all flex items-center gap-[var(--space-2)] ${
              selectedSeason === '1448'
                ? 'bg-[var(--btn-primary)] text-white shadow-md'
                : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-blue-50/40 dark:hover:bg-blue-950/30 border border-[var(--border)]'
            }`}
          >
            <span>موسم 1448 هـ (الحالي)</span>
            <span className={`px-[var(--space-2)] py-[var(--space-1)] rounded-full text-[11px] font-black tabular-nums ${
              selectedSeason === '1448' ? 'bg-blue-900 text-white' : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
            }`}>
              {countSeason1448}
            </span>
          </button>

          <button
            onClick={() => setSelectedSeason('1447')}
            className={`px-[var(--space-4)] py-[var(--space-2)] rounded-xl text-xs font-black transition-all flex items-center gap-[var(--space-2)] ${
              selectedSeason === '1447'
                ? 'bg-[var(--gold)] text-[#0F172A] shadow-md'
                : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-amber-50/40 dark:hover:bg-amber-950/30 border border-[var(--border)]'
            }`}
          >
            <span>موسم 1447 هـ (المؤرشف)</span>
            <span className={`px-[var(--space-2)] py-[var(--space-1)] rounded-full text-[11px] font-black tabular-nums ${
              selectedSeason === '1447' ? 'bg-[#0F172A]/15 text-[#0F172A]' : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
            }`}>
              {countSeason1447}
            </span>
          </button>

          <button
            onClick={() => setSelectedSeason('all')}
            className={`px-[var(--space-4)] py-[var(--space-2)] rounded-xl text-xs font-black transition-all flex items-center gap-[var(--space-2)] ${
              selectedSeason === 'all'
                ? 'bg-[var(--navy)] text-white shadow-md'
                : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:bg-[var(--surface)] border border-[var(--border)]'
            }`}
          >
            <span>جميع المواسم</span>
            <span className={`px-[var(--space-2)] py-[var(--space-1)] rounded-full text-[11px] font-black tabular-nums ${
              selectedSeason === 'all' ? 'bg-slate-700 text-white' : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
            }`}>
              {allVouchers.length}
            </span>
          </button>
        </div>

        {/* Search Bar & Instant Filters */}
        <div className="mt-[var(--space-5)] grid grid-cols-1 lg:grid-cols-12 gap-[var(--space-5)]">
          {/* Main Search Input */}
          <div className="lg:col-span-6 relative">
            <Search className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم السند، رقم الاعتماد، المؤسسة، اسم السائق، رقم اللوحة، المندوب..."
              className="w-full pr-[var(--space-12)] pl-[var(--space-12)] py-[var(--space-3)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] outline-none transition-all font-bold text-sm text-[var(--text)]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)]"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Period Filter Dropdown / Selection */}
          <div className="lg:col-span-3">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as PeriodFilter)}
              className="w-full px-[var(--space-4)] py-[var(--space-3)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] font-bold text-sm text-[var(--text)] outline-none focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] transition-all cursor-pointer"
            >
              <option value="all">📅 كافة الفترات الزمنية</option>
              <option value="today">اليوم</option>
              <option value="week">آخر 7 أيام (هذا الأسبوع)</option>
              <option value="month">الشهر الحالي</option>
              <option value="custom_month">كشف شهر محدد...</option>
              <option value="custom_range">نطاق تاريخ مخصص...</option>
            </select>
          </div>

          {/* Organization Filter Dropdown */}
          <div className="lg:col-span-3">
            <select
              value={selectedOrg}
              onChange={(e) => setSelectedOrg(e.target.value)}
              className="w-full px-[var(--space-4)] py-[var(--space-3)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)] font-bold text-sm text-[var(--text)] outline-none focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] transition-all cursor-pointer"
            >
              <option value="all">🏢 كافة المؤسسات والجهات</option>
              {organizationsList.map((org) => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Secondary Date Inputs if Custom Selected */}
        {selectedPeriod === 'custom_month' && (
          <div className="mt-[var(--space-3)] p-[var(--space-4)] bg-blue-50/50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800/70 flex items-center gap-[var(--space-4)] animate-in fade-in">
            <span className="text-xs font-black text-[var(--primary)]">اختر الشهر والسنة:</span>
            <input
              type="month"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              className="px-[var(--space-4)] py-[var(--space-2)] rounded-xl bg-[var(--surface)] border border-[var(--border)] font-bold text-sm text-[var(--text)] outline-none tabular-nums"
            />
          </div>
        )}

        {selectedPeriod === 'custom_range' && (
          <div className="mt-[var(--space-3)] p-[var(--space-4)] bg-blue-50/50 dark:bg-blue-950/30 rounded-2xl border border-blue-200 dark:border-blue-800/70 flex flex-wrap items-center gap-[var(--space-4)] animate-in fade-in">
            <div className="flex items-center gap-[var(--space-2)]">
              <span className="text-xs font-black text-[var(--primary)]">من تاريخ:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-[var(--surface)] border border-[var(--border)] font-bold text-xs text-[var(--text)] outline-none tabular-nums"
              />
            </div>
            <div className="flex items-center gap-[var(--space-2)]">
              <span className="text-xs font-black text-[var(--primary)]">إلى تاريخ:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-[var(--surface)] border border-[var(--border)] font-bold text-xs text-[var(--text)] outline-none tabular-nums"
              />
            </div>
          </div>
        )}

        {/* Summary Metric Strip */}
        <div className="mt-[var(--space-6)] pt-[var(--space-5)] border-t border-[var(--border)] grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-4)]">
          <div className="bg-[var(--surface-subtle)] p-[var(--space-4)] rounded-2xl border border-[var(--border)] flex items-center gap-[var(--space-3)]">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/60 text-[var(--primary)] rounded-xl flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)]">السندات المفلترة</p>
              <p className="text-xl font-black text-[var(--text)] leading-tight tabular-nums">{metrics.vouchersCount}</p>
            </div>
          </div>

          <div className="bg-[var(--surface-subtle)] p-[var(--space-4)] rounded-2xl border border-[var(--border)] flex items-center gap-[var(--space-3)]">
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-950/60 text-[var(--success)] rounded-xl flex items-center justify-center shrink-0">
              <Bus size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)]">إجمالي الحافلات</p>
              <p className="text-xl font-black text-[var(--text)] leading-tight tabular-nums">{metrics.totalBuses}</p>
            </div>
          </div>

          <div className="bg-[var(--surface-subtle)] p-[var(--space-4)] rounded-2xl border border-[var(--border)] flex items-center gap-[var(--space-3)]">
            <div className="w-10 h-10 bg-amber-100 dark:bg-amber-950/60 text-[var(--gold-text)] rounded-xl flex items-center justify-center shrink-0">
              <UserCheck size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)]">إجمالي الحجاج</p>
              <p className="text-xl font-black text-[var(--text)] leading-tight tabular-nums">{metrics.totalPilgrims}</p>
            </div>
          </div>

          <div className="bg-[var(--surface-subtle)] p-[var(--space-4)] rounded-2xl border border-[var(--border)] flex items-center gap-[var(--space-3)]">
            <div className="w-10 h-10 bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] rounded-xl flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <p className="text-xs font-bold text-[var(--text-secondary)]">الجهات المستفيدة</p>
              <p className="text-xl font-black text-[var(--text)] leading-tight tabular-nums">{metrics.organizationsCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Results List Card */}
      <div className="bg-[var(--surface)] rounded-[2.5rem] shadow-sm border border-[var(--border)] overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="px-[var(--space-6)] py-[var(--space-4)] bg-[var(--surface-subtle)] border-b border-[var(--border)] flex items-center justify-between gap-[var(--space-3)]">
          <div className="flex flex-wrap items-center gap-[var(--space-3)]">
            <div className="flex items-center gap-[var(--space-2)]">
              <History size={16} className="text-[var(--primary)]" />
              <span className="text-xs font-black text-[var(--text)]">سجلات السندات والعمليات</span>
              <span className="text-xs font-bold text-[var(--primary)] bg-blue-50 dark:bg-blue-950/50 px-[var(--space-3)] py-[var(--space-1)] rounded-full border border-blue-200/80 dark:border-blue-800/70 mr-[var(--space-2)] tabular-nums">
                {filteredVouchers.length} سند
              </span>
            </div>
            <label className="inline-flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={printTwoCopies}
                onChange={(e) => setPrintTwoCopies(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border)] accent-[var(--primary)] cursor-pointer"
              />
              <span>طباعة نسختين (المكتب + الشركة)</span>
            </label>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-[var(--space-2)] text-xs font-bold text-[var(--text-secondary)] tabular-nums">
              <span>صفحة {currentPage} من {totalPages}</span>
              <div className="flex items-center gap-[var(--space-2)] mr-[var(--space-2)]">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--surface-subtle)]"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--surface-subtle)]"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoadingAll ? (
          <div className="p-[var(--space-16)] text-center text-[var(--text-muted)] flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-[var(--primary)] mb-[var(--space-4)]" size={36} />
            <p className="font-bold text-sm text-[var(--text-secondary)]">جاري تحميل وتحديث سجلات الأرشيف...</p>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="p-[var(--space-16)] text-center text-[var(--text-muted)]">
            <div className="w-20 h-20 bg-[var(--surface-subtle)] rounded-[2rem] flex items-center justify-center mx-auto mb-[var(--space-4)] border border-[var(--border)]">
              <History size={36} className="text-[var(--text-muted)]" />
            </div>
            <p className="font-bold text-base text-[var(--text)]">لا توجد سندات مطابقة لمعايير البحث</p>
            <p className="text-xs text-[var(--text-secondary)] mt-[var(--space-1)]">جرب تغيير الموسم أو الفترة الزمنية أو إزالة مصطلح البحث</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {paginatedVouchers.map((v) => {
              const busesCount = Array.isArray(v.buses) && v.buses.length > 0
                ? v.buses.length
                : (Number(v.busesQuantity) || (v.busNumber ? 1 : 0));

              return (
                <div key={v.id} className="p-[var(--space-4)] lg:p-[var(--space-8)] flex flex-col lg:flex-row lg:items-center justify-between gap-[var(--space-6)] hover:bg-[var(--surface-subtle)]/70 transition-colors group">
                  <div className="flex-1 space-y-[var(--space-4)]">
                    {/* Voucher Header row */}
                    <div className="flex flex-wrap items-center gap-[var(--space-2)]">
                      <span className="text-base font-black text-[var(--primary)] bg-blue-50 dark:bg-blue-950/50 px-[var(--space-3)] py-[var(--space-1)] rounded-xl border border-blue-200/80 dark:border-blue-800/70 tabular-nums">
                        سند #{v.voucherNumber}
                      </span>

                      {v.approvalNumber && (
                        <span className="flex items-center gap-[var(--space-1)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl text-xs font-bold tabular-nums">
                          اعتماد: {v.approvalNumber}
                        </span>
                      )}

                      {v.organization && (
                        <span className="flex items-center gap-[var(--space-1)] bg-blue-50/70 dark:bg-blue-950/40 text-[var(--primary)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl text-xs font-bold border border-blue-200/70 dark:border-blue-800/60">
                          <Building2 size={13} />
                          {v.organization}
                        </span>
                      )}

                      {v.hajjSeason && (
                        <span className={`px-[var(--space-3)] py-[var(--space-1)] rounded-xl text-xs font-black tabular-nums ${
                          v.hajjSeason === '1448'
                            ? 'bg-blue-100 dark:bg-blue-950/60 text-[#1D4ED8] dark:text-[#93C5FD]'
                            : 'bg-amber-100 dark:bg-amber-950/60 text-[var(--gold-text)]'
                        }`}>
                          موسم {v.hajjSeason} هـ
                        </span>
                      )}

                      <span className="flex items-center gap-[var(--space-2)] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl text-xs font-bold mr-auto tabular-nums">
                        <Calendar size={13} className="text-[var(--text-muted)]" />
                        {v.customDate || (v.timestamp ? format(new Date(v.timestamp), 'yyyy/MM/dd | HH:mm') : '-')}
                      </span>
                    </div>

                    {/* Buses rendering */}
                    {v.buses && Array.isArray(v.buses) && v.buses.length > 0 ? (
                      <div className="space-y-[var(--space-2)]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-[var(--space-2)]">
                            <Bus size={14} className="text-[var(--primary)]" />
                            <span className="text-xs font-black text-[var(--text-secondary)] tabular-nums">الحافلات المسجلة ({v.buses.length})</span>
                          </div>
                          {v.buses.length > 8 && (
                            <div className="flex items-center gap-[var(--space-2)]">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cur = busPages[v.id] || 1;
                                  if (cur > 1) setBusPages({ ...busPages, [v.id]: cur - 1 });
                                }}
                                disabled={(busPages[v.id] || 1) === 1}
                                className="w-6 h-6 flex items-center justify-center rounded bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-30"
                              >
                                <ChevronRight size={12} />
                              </button>
                              <span className="text-[11px] font-bold text-[var(--text-secondary)] tabular-nums">
                                {(busPages[v.id] || 1)} / {Math.ceil(v.buses.length / 8)}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cur = busPages[v.id] || 1;
                                  const maxP = Math.ceil(v.buses.length / 8);
                                  if (cur < maxP) setBusPages({ ...busPages, [v.id]: cur + 1 });
                                }}
                                disabled={(busPages[v.id] || 1) === Math.ceil(v.buses.length / 8)}
                                className="w-6 h-6 flex items-center justify-center rounded bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] disabled:opacity-30"
                              >
                                <ChevronLeft size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--space-2)]">
                          {v.buses.slice(((busPages[v.id] || 1) - 1) * 8, (busPages[v.id] || 1) * 8).map((bus: any, idx: number) => (
                            <div key={idx} className="bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl p-[var(--space-2)] flex items-center gap-[var(--space-3)]">
                              <div className="w-7 h-7 bg-[var(--navy)] rounded-lg flex items-center justify-center text-white text-[11px] font-black shrink-0 tabular-nums">
                                {bus.busNumber}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-[var(--text)] truncate">{bus.driverName || 'سائق غير محدد'}</p>
                                {bus.driverPhone && (
                                  <p className="text-[11px] text-[var(--text-secondary)] tabular-nums">{bus.driverPhone}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-[var(--space-4)] bg-[var(--surface-subtle)] p-[var(--space-3)] rounded-2xl border border-[var(--border)]">
                        <div className="w-12 h-12 bg-[var(--surface)] rounded-xl border border-[var(--border)] flex flex-col items-center justify-center shrink-0">
                          <span className="text-[9px] text-[var(--text-muted)] font-bold">حافلة</span>
                          <span className="text-base font-black text-[var(--text)] tabular-nums">{v.busNumber || '-'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-[var(--text)]">{v.driverName || 'سائق غير محدد'}</p>
                          <p className="text-xs text-[var(--text-secondary)] tabular-nums">{v.driverPhone || 'بدون هاتف'}</p>
                        </div>
                      </div>
                    )}

                    {/* Meta tags & Route */}
                    <div className="flex flex-wrap items-center gap-[var(--space-2)] text-xs font-bold">
                      {v.receiverName && (
                        <span className="bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg">
                          المستلم: {v.receiverName}
                        </span>
                      )}

                      {v.receiverMobile && (
                        <span className="bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg tabular-nums">
                          موبايل المستلم: {v.receiverMobile}
                        </span>
                      )}

                      {v.receiverId && (
                        <span className="bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg tabular-nums">
                          هوية المستلم: {v.receiverId}
                        </span>
                      )}

                      {v.delegateNumber && (
                        <span className="bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg tabular-nums">
                          رقم المكتب: {v.delegateNumber}
                        </span>
                      )}

                      {(v.directionFrom || v.directionTo) && (
                        <span className="bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg border border-emerald-200/70 dark:border-emerald-800/70">
                          المسار: {v.directionFrom || ''} ➔ {v.directionTo || ''}
                        </span>
                      )}

                      {v.pilgrimsCount && Number(v.pilgrimsCount) > 0 && (
                        <span className="bg-amber-50 dark:bg-amber-950/40 text-[var(--gold-text)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg border border-amber-200/70 dark:border-amber-800/70 tabular-nums">
                          {v.pilgrimsCount} حاج
                        </span>
                      )}

                      {v.loadingLocation && (
                        <span className="bg-blue-50 dark:bg-blue-950/40 text-[var(--primary)] px-[var(--space-3)] py-[var(--space-1)] rounded-lg border border-blue-200/70 dark:border-blue-800/70">
                          موقع التحميل: {v.loadingLocation}
                        </span>
                      )}

                      {v.notes && (
                        <div className="w-full bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/70 text-[var(--gold-text)] p-[var(--space-2)] rounded-xl text-xs flex items-center gap-[var(--space-2)]">
                          <ClipboardList size={14} className="text-[var(--gold)] shrink-0" />
                          <span className="truncate">{v.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex flex-col items-end gap-[var(--space-2)] shrink-0 border-t lg:border-t-0 pt-[var(--space-4)] lg:pt-0 border-[var(--border)]">
                    <div className="flex flex-wrap items-center lg:flex-col justify-end gap-[var(--space-2)] w-full lg:w-auto">
                      <button
                        onClick={() => rePrint(v)}
                        disabled={isPrinting !== null}
                        className={`px-[var(--space-4)] py-[var(--space-3)] rounded-xl font-bold text-xs transition-all flex items-center gap-[var(--space-2)] cursor-pointer ${
                          isPrinting === v.id
                            ? 'bg-[var(--btn-primary)] text-white shadow-md'
                            : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] shadow-sm'
                        }`}
                      >
                        {isPrinting === v.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Printer size={16} />
                        )}
                        <span>طباعة / حفظ PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLegacyExport(v)}
                        disabled={isLegacyExporting !== null}
                        className="px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-45"
                      >
                        {isLegacyExporting === v.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <FileDown size={12} />
                        )}
                        <span>تصدير بديل</span>
                      </button>

                      <div className="flex items-center gap-[var(--space-2)]">
                        <button
                          onClick={() => handleEditVoucher(v)}
                          className="p-[var(--space-3)] rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[var(--primary)] hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-all cursor-pointer"
                          title="تعديل السند"
                        >
                          <Edit2 size={16} />
                        </button>

                        {isAllowedToDelete && (
                          <button
                            onClick={() => handleConfirmDelete(v)}
                            className="p-[var(--space-3)] rounded-xl bg-red-50 dark:bg-red-950/40 text-[var(--danger)] hover:bg-red-100 dark:hover:bg-red-950/60 transition-all cursor-pointer"
                            title="حذف السند"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-[10px] font-semibold text-[var(--text-muted)] max-w-[200px] text-left lg:text-center leading-relaxed">
                      اختر: الوجهة = حفظ كملف PDF، والهوامش = بلا، والرؤوس والتذييلات = معطّلة
                    </p>
                    {printAlert?.voucherId === v.id && (
                      <div className="max-w-[240px] p-[var(--space-2)] rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-[11px] space-y-1.5">
                        <div className="flex items-start gap-1.5 font-bold text-[var(--gold-text)]">
                          <AlertCircle size={14} className="shrink-0 mt-0.5" />
                          <span>{printAlert.msg}</span>
                        </div>
                        {printAlert.blobUrl && (
                          <a
                            href={printAlert.blobUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--btn-primary)] text-white font-bold text-[11px] hover:bg-[var(--btn-primary-hover)] transition-colors"
                          >
                            <ExternalLink size={12} />
                            <span>فتح السند في تبويب جديد</span>
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="px-[var(--space-6)] py-[var(--space-4)] bg-[var(--surface-subtle)] border-t border-[var(--border)] flex items-center justify-between gap-[var(--space-3)]">
            <span className="text-xs font-bold text-[var(--text-secondary)]">
              عرض {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredVouchers.length)} من إجمالي {filteredVouchers.length} سند
            </span>
            <div className="flex items-center gap-[var(--space-2)]">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-[var(--space-3)] py-[var(--space-2)] rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--surface-subtle)]"
              >
                السابق
              </button>
              <span className="text-xs font-black text-[var(--text)] px-[var(--space-2)]">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-[var(--space-3)] py-[var(--space-2)] rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] disabled:opacity-30 hover:bg-[var(--surface-subtle)]"
              >
                التالي
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PDF Statement Report Generation Modal */}
      <AnimatePresence>
        {isReportModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-[var(--space-4)]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isGeneratingReport && setIsReportModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              className="bg-[var(--surface)] rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] p-[var(--space-4)] lg:p-[var(--space-8)] text-right"
              dir="rtl"
            >
              <div className="flex justify-between items-center pb-[var(--space-5)] border-b border-[var(--border)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-12 h-12 bg-[var(--btn-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[var(--text)]">توليد كشوفات وتقارير PDF للإدارة</h3>
                    <p className="text-xs text-[var(--text-muted)] font-bold mt-[var(--space-1)]">طباعة وتصدير كشوفات شهرية أو موسمية مفصلة</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsReportModalOpen(false)}
                  disabled={isGeneratingReport}
                  className="w-10 h-10 bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] rounded-xl flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-[var(--danger)] transition-all disabled:opacity-30"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-[var(--space-6)] space-y-[var(--space-5)] max-h-[65vh] overflow-y-auto px-[var(--space-1)]">
                {/* 1. Select Report Type */}
                <div>
                  <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">نوع الكشف والتقرير المطلوب:</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-4)]">
                    <button
                      type="button"
                      onClick={() => setReportType('monthly')}
                      className={`p-[var(--space-4)] rounded-2xl border text-right transition-all flex items-start gap-[var(--space-3)] ${
                        reportType === 'monthly'
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-[var(--primary)] ring-2 ring-blue-600/20 text-[var(--primary)]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      <Calendar className={reportType === 'monthly' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} size={20} />
                      <div>
                        <p className="font-black text-sm">كشف شهري شامل</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mt-[var(--space-1)]">كشف لكافة السندات لشهر محدد</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('seasonal')}
                      className={`p-[var(--space-4)] rounded-2xl border text-right transition-all flex items-start gap-[var(--space-3)] ${
                        reportType === 'seasonal'
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-[var(--primary)] ring-2 ring-blue-600/20 text-[var(--primary)]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      <Layers className={reportType === 'seasonal' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} size={20} />
                      <div>
                        <p className="font-black text-sm">كشف موسمي كامل</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mt-[var(--space-1)]">موسم 1448 هـ أو 1447 هـ</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('custom')}
                      className={`p-[var(--space-4)] rounded-2xl border text-right transition-all flex items-start gap-[var(--space-3)] ${
                        reportType === 'custom'
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-[var(--primary)] ring-2 ring-blue-600/20 text-[var(--primary)]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      <CalendarDays className={reportType === 'custom' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} size={20} />
                      <div>
                        <p className="font-black text-sm">كشف فترة مخصصة</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mt-[var(--space-1)]">تحديد تاريخ البداية والنهاية</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('filtered')}
                      className={`p-[var(--space-4)] rounded-2xl border text-right transition-all flex items-start gap-[var(--space-3)] ${
                        reportType === 'filtered'
                          ? 'bg-blue-50/80 dark:bg-blue-950/40 border-[var(--primary)] ring-2 ring-blue-600/20 text-[var(--primary)]'
                          : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      <Filter className={reportType === 'filtered' ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'} size={20} />
                      <div>
                        <p className="font-black text-sm">السجلات المفلترة حالياً</p>
                        <p className="text-[10px] text-[var(--text-muted)] font-bold mt-[var(--space-1)]">({filteredVouchers.length} سند معروض)</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Specific Period Inputs */}
                {reportType === 'monthly' && (
                  <div className="bg-[var(--surface-subtle)] p-[var(--space-5)] rounded-2xl border border-[var(--border)]">
                    <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">تحديد الشهر والسنة للكشف:</label>
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                      className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none focus:ring-4 focus:ring-blue-500/10"
                    />
                  </div>
                )}

                {reportType === 'seasonal' && (
                  <div className="bg-[var(--surface-subtle)] p-[var(--space-5)] rounded-2xl border border-[var(--border)]">
                    <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">اختر موسم الحج:</label>
                    <div className="grid grid-cols-2 gap-[var(--space-5)]">
                      <button
                        type="button"
                        onClick={() => setReportSeason('1448')}
                        className={`p-[var(--space-3)] rounded-xl border font-black text-xs transition-all ${
                          reportSeason === '1448'
                            ? 'bg-[var(--btn-primary)] text-white border-[var(--btn-primary)] shadow-md'
                            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        موسم حج 1448 هـ (الحالي)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportSeason('1447')}
                        className={`p-[var(--space-3)] rounded-xl border font-black text-xs transition-all ${
                          reportSeason === '1447'
                            ? 'bg-[var(--gold)] text-[#0F172A] border-[var(--gold)] shadow-md'
                            : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)]'
                        }`}
                      >
                        موسم حج 1447 هـ (المؤرشف)
                      </button>
                    </div>
                  </div>
                )}

                {reportType === 'custom' && (
                  <div className="bg-[var(--surface-subtle)] p-[var(--space-5)] rounded-2xl border border-[var(--border)] space-y-[var(--space-3)]">
                    <label className="block text-xs font-black text-[var(--text-secondary)]">تحديد النطاق الزمني:</label>
                    <div className="grid grid-cols-2 gap-[var(--space-5)]">
                      <div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] block mb-[var(--space-2)]">من تاريخ:</span>
                        <input
                          type="date"
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                          className="w-full px-[var(--space-3)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-xs text-[var(--text)] outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-[var(--text-muted)] block mb-[var(--space-2)]">إلى تاريخ:</span>
                        <input
                          type="date"
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                          className="w-full px-[var(--space-3)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-xs text-[var(--text)] outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Custom Report Title (Optional) */}
                <div>
                  <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">عنوان الكشف (اختياري - يترك فارغاً للعنوان التلقائي):</label>
                  <input
                    type="text"
                    value={reportTitleCustom}
                    onChange={(e) => setReportTitleCustom(e.target.value)}
                    placeholder="مثال: كشف السندات والحافلات التشغيلية - إدارة العمليات"
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                {/* 4. Report Signer / Issued By */}
                <div>
                  <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">اسم المشرف / المدير المعتمد المُصدِر للتقرير:</label>
                  <input
                    type="text"
                    value={reportSigner}
                    onChange={(e) => setReportSigner(e.target.value)}
                    placeholder="اسم المسؤول المعتمد"
                    className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-[var(--space-8)] pt-[var(--space-5)] border-t border-[var(--border)] flex flex-col sm:flex-row gap-[var(--space-3)]">
                <button
                  onClick={() => handleGenerateStatement(false)}
                  disabled={isGeneratingReport}
                  className="flex-1 py-[var(--space-4)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-black text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50"
                >
                  {isGeneratingReport ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Printer size={18} />
                  )}
                  <span>طباعة ومعاينة التقرير (PDF)</span>
                </button>

                <button
                  onClick={() => handleGenerateStatement(true)}
                  disabled={isGeneratingReport}
                  className="py-[var(--space-4)] px-[var(--space-6)] bg-[var(--navy)] text-white font-black text-sm rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50"
                >
                  <Download size={18} />
                  <span>تنزيل كملف</span>
                </button>

                <button
                  onClick={() => setIsReportModalOpen(false)}
                  disabled={isGeneratingReport}
                  className="py-[var(--space-4)] px-[var(--space-5)] border border-[var(--border)] text-[var(--text-secondary)] font-bold text-sm rounded-2xl hover:bg-[var(--surface-subtle)] transition-all disabled:opacity-50"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Voucher Modal */}
      <AnimatePresence>
        {isEditModalOpen && voucherToEdit && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-[var(--space-4)]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[var(--surface)] rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] p-[var(--space-4)] lg:p-[var(--space-8)]"
              dir="rtl"
            >
              <div className="flex justify-between items-center mb-[var(--space-6)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-12 h-12 bg-[var(--btn-primary)] rounded-2xl flex items-center justify-center text-white shadow-lg">
                    <Edit2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[var(--text)]">تعديل بيانات السند #{voucherToEdit.voucherNumber}</h3>
                    <p className="text-[10px] text-[var(--text-muted)] font-bold uppercase tracking-widest mt-[var(--space-1)]">تحديث السجلات المخزنة في النظام</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-10 h-10 bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] rounded-xl flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-[var(--danger)] transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[65vh] overflow-y-auto px-[var(--space-2)] space-y-[var(--space-6)]">
                <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-[2rem] border border-[var(--border)] space-y-[var(--space-5)]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-5)] md:gap-[var(--space-6)]">
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">اسم المندوب (المستلم)</label>
                      <input
                        type="text"
                        value={voucherToEdit.receiverName || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, receiverName: e.target.value })}
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">رقم جوال المستلم</label>
                      <input
                        type="text"
                        value={voucherToEdit.receiverMobile || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, receiverMobile: e.target.value })}
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-5)] md:gap-[var(--space-6)]">
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">رقم هوية المستلم</label>
                      <input
                        type="text"
                        value={voucherToEdit.receiverId || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, receiverId: e.target.value.replace(/[^0-9]/g, '') })}
                        placeholder="10xxxxxxxx"
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">رقم المكتب</label>
                      <input
                        type="text"
                        value={voucherToEdit.delegateNumber || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, delegateNumber: e.target.value.replace(/[^0-9]/g, '') })}
                        placeholder="رقم المكتب..."
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-5)] md:gap-[var(--space-6)]">
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">المؤسسة / الجهة</label>
                      <input
                        type="text"
                        value={voucherToEdit.organization || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, organization: e.target.value })}
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">رقم الاعتماد</label>
                      <input
                        type="text"
                        value={voucherToEdit.approvalNumber || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, approvalNumber: e.target.value })}
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-5)] md:gap-[var(--space-6)]">
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">عدد الحجاج</label>
                      <input
                        type="number"
                        value={voucherToEdit.pilgrimsCount || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, pilgrimsCount: e.target.value })}
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">عدد التذاكر</label>
                      <input
                        type="number"
                        value={voucherToEdit.ticketsCount || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, ticketsCount: e.target.value })}
                        className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">الملاحظات</label>
                    <textarea
                      value={voucherToEdit.notes || ''}
                      onChange={(e) => setVoucherToEdit({ ...voucherToEdit, notes: e.target.value })}
                      rows={3}
                      className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-xl font-bold text-sm text-[var(--text)] outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-[var(--space-6)] flex gap-[var(--space-3)]">
                <button
                  onClick={() => setIsConfirmSaveOpen(true)}
                  disabled={isUpdating}
                  className="flex-1 py-[var(--space-4)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-black text-sm rounded-2xl transition-all flex items-center justify-center gap-[var(--space-2)] shadow-lg disabled:opacity-50"
                >
                  <Save size={18} />
                  <span>حفظ التعديلات</span>
                </button>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isUpdating}
                  className="px-[var(--space-6)] py-[var(--space-4)] border border-[var(--border)] text-[var(--text-secondary)] font-bold text-sm rounded-2xl hover:bg-[var(--surface-subtle)] transition-all"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Save Modal */}
      <AnimatePresence>
        {isConfirmSaveOpen && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-[var(--space-4)]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsConfirmSaveOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[var(--surface)] rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
              dir="rtl"
            >
              <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/40 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-4)] border border-blue-200 dark:border-blue-800/70 text-[var(--primary)]">
                <Save size={28} />
              </div>
              <h3 className="text-xl font-black text-[var(--text)] mb-[var(--space-2)]">تأكيد حفظ التعديلات</h3>
              <p className="text-[var(--text-secondary)] text-sm mb-[var(--space-6)]">هل أنت متأكد من حفظ التعديلات الجديدة على السند؟</p>
              <div className="flex gap-[var(--space-3)]">
                <button
                  onClick={updateVoucher}
                  disabled={isUpdating}
                  className="flex-1 bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white font-black py-[var(--space-3)] rounded-2xl transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 shadow-lg"
                >
                  {isUpdating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  <span>نعم، تأكيد الحفظ</span>
                </button>
                <button
                  onClick={() => setIsConfirmSaveOpen(false)}
                  disabled={isUpdating}
                  className="px-[var(--space-5)] py-[var(--space-3)] border border-[var(--border)] text-[var(--text-secondary)] font-bold rounded-2xl hover:bg-[var(--surface-subtle)] transition-all"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Voucher Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && voucherToDelete && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-[var(--space-4)]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-[var(--surface)] rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-[var(--border)] text-center p-[var(--space-4)] lg:p-[var(--space-8)]"
              dir="rtl"
            >
              <div className="w-16 h-16 bg-red-50 dark:bg-red-950/40 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-4)] border border-red-200 dark:border-red-800/70 text-[var(--danger)]">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-black text-[var(--text)] mb-[var(--space-2)]">تأكيد حذف السند</h3>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed mb-[var(--space-6)]">
                هل أنت متأكد من حذف السند رقم <strong className="text-[var(--danger)]">#{voucherToDelete.voucherNumber}</strong>؟ سيتم إزالة السند نهائياً من قاعدة البيانات.
              </p>
              <div className="flex gap-[var(--space-3)]">
                <button
                  onClick={deleteVoucher}
                  disabled={isDeleting}
                  className="flex-1 bg-[#B91C1C] hover:bg-[#991B1B] text-white font-black py-[var(--space-3)] rounded-2xl transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 shadow-lg"
                >
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  <span>نعم، حذف السند</span>
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-[var(--space-5)] py-[var(--space-3)] border border-[var(--border)] text-[var(--text-secondary)] font-bold rounded-2xl hover:bg-[var(--surface-subtle)] transition-all"
                >
                  تراجع
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
