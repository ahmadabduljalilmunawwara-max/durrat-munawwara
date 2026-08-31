import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, auth } from '../lib/firebase';
import { collection, query, where, orderBy, limit, doc, deleteDoc, onSnapshot, or, updateDoc } from 'firebase/firestore';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { 
  Search, History, Bus, FileText, Calendar, Printer, Loader2, Trash2, X, 
  ChevronLeft, ChevronRight, Edit2, Save, ClipboardList, Download, 
  Layers, Filter, CalendarDays, CheckCircle2, Building2, UserCheck, Sparkles, RefreshCw
} from 'lucide-react';
import { generateVoucherPDF, generateBulkOfficePDF, generateStatementReportPDF } from '../lib/pdfGenerator';
import { handleFirestoreError, OperationType } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

type SeasonFilter = '1448' | '1447' | 'all';
type PeriodFilter = 'all' | 'today' | 'week' | 'month' | 'custom_month' | 'custom_range';

export function VoucherSearch() {
  // Raw Data and Real-time Stream
  const [allVouchers, setAllVouchers] = useState<any[]>([]);
  const [isLoadingAll, setIsLoadingAll] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
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
  const [printCopies, setPrintCopies] = useState(1);
  const [allBusesMaster, setAllBusesMaster] = useState<Record<string, any>>({});

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
        if (data.printCopies) setPrintCopies(data.printCopies);
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
    const fullData = { ...v, logoUrl, sloganUrl, pdfMargins };
    try {
      for (let i = 0; i < printCopies; i++) {
        await generateVoucherPDF(fullData, { save: false, print: true });
        if (i < printCopies - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }
    } catch (err) {
      console.error('Print error:', err);
    } finally {
      setIsPrinting(null);
    }
  };

  // Printing Bulk Office Report
  const printOfficeReport = async () => {
    if (filteredVouchers.length === 0) return;
    
    const allBuses: any[] = [];
    filteredVouchers.forEach(v => {
      if (v.buses && Array.isArray(v.buses)) {
        const busesWithApproval = v.buses.map((b: any) => ({
          ...b,
          approvalNumber: v.approvalNumber
        }));
        allBuses.push(...busesWithApproval);
      } else {
        allBuses.push({
          busNumber: v.busNumber,
          driverName: v.driverName,
          busType: v.busType,
          driverPhone: v.driverPhone,
          approvalNumber: v.approvalNumber
        });
      }
    });

    if (allBuses.length === 0) {
      alert('لا توجد حافلات لطباعتها');
      return;
    }

    const template = filteredVouchers[0];
    const reportData = {
      ...template,
      buses: allBuses,
      logoUrl,
      sloganUrl,
      pdfMargins,
      voucherNumber: 'كشف مـجمع',
      isBulkReport: true
    };

    const { generateBulkOfficePDF } = await import('../lib/pdfGenerator');
    generateBulkOfficePDF(reportData, { save: true, print: true });
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
    <div className="max-w-7xl mx-auto space-y-6" dir="rtl">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-200 p-6 md:p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-700 to-indigo-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100 ring-4 ring-blue-50">
              <Search size={28} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">البحث والأرشيف الشامل</h2>
                <span className="bg-emerald-50 text-emerald-700 text-xs font-black px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  تحديث لحظي
                </span>
              </div>
              <p className="text-xs text-slate-500 font-bold mt-1">
                استعراض وتصفية السجلات، وتوليد كشوفات وتقارير PDF الشهرية والموسمية
              </p>
            </div>
          </div>

          {/* Action Buttons for Managers */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsReportModalOpen(true)}
              className="flex items-center gap-2.5 px-6 py-3.5 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-900 text-white rounded-2xl font-black text-sm hover:opacity-95 transition-all shadow-xl shadow-blue-100 hover:scale-[1.02] active:scale-[0.98]"
            >
              <FileText size={18} className="text-blue-200" />
              <span>توليد كشف وتقارير PDF</span>
              <Sparkles size={16} className="text-amber-400" />
            </button>

            {filteredVouchers.length > 0 && (
              <button
                onClick={printOfficeReport}
                className="flex items-center gap-2 px-5 py-3.5 bg-slate-100 text-slate-700 rounded-2xl font-bold text-sm hover:bg-slate-200 transition-all border border-slate-200"
                title="طباعة كشف مجمع للحافلات المستعرضة"
              >
                <Printer size={16} />
                <span>كشف المكتب السريع</span>
              </button>
            )}
          </div>
        </div>

        {/* Season Selector Tabs */}
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <div className="text-xs font-black text-slate-400 ml-2">الموسم:</div>
          <button
            onClick={() => setSelectedSeason('1448')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              selectedSeason === '1448'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-100'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>موسم 1448 هـ (الحالي)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              selectedSeason === '1448' ? 'bg-blue-800 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {countSeason1448}
            </span>
          </button>

          <button
            onClick={() => setSelectedSeason('1447')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              selectedSeason === '1447'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-100'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>موسم 1447 هـ (المؤرشف)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              selectedSeason === '1447' ? 'bg-amber-800 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {countSeason1447}
            </span>
          </button>

          <button
            onClick={() => setSelectedSeason('all')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              selectedSeason === 'all'
                ? 'bg-slate-900 text-white shadow-md shadow-slate-200'
                : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>جميع المواسم</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              selectedSeason === 'all' ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {allVouchers.length}
            </span>
          </button>
        </div>

        {/* Search Bar & Instant Filters */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Main Search Input */}
          <div className="lg:col-span-6 relative">
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ابحث برقم السند، رقم الاعتماد، المؤسسة، اسم السائق، رقم اللوحة، المندوب..."
              className="w-full pr-12 pl-10 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-300 outline-none transition-all font-bold text-sm placeholder:text-slate-400 text-slate-900"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
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
              className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all cursor-pointer"
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
              className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 border border-slate-200 font-bold text-sm text-slate-700 outline-none focus:ring-4 focus:ring-blue-50 focus:border-blue-300 transition-all cursor-pointer"
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
          <div className="mt-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center gap-4 animate-in fade-in">
            <span className="text-xs font-black text-blue-900">اختر الشهر والسنة:</span>
            <input
              type="month"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              className="px-4 py-2 rounded-xl bg-white border border-blue-200 font-bold text-sm text-slate-800 outline-none"
            />
          </div>
        )}

        {selectedPeriod === 'custom_range' && (
          <div className="mt-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-wrap items-center gap-4 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-blue-900">من تاريخ:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-blue-200 font-bold text-xs text-slate-800 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-blue-900">إلى تاريخ:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white border border-blue-200 font-bold text-xs text-slate-800 outline-none"
              />
            </div>
          </div>
        )}

        {/* Summary Metric Strip */}
        <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-xl flex items-center justify-center shrink-0">
              <FileText size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase">السندات المفلترة</p>
              <p className="text-lg font-black text-slate-900 leading-tight">{metrics.vouchersCount}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-xl flex items-center justify-center shrink-0">
              <Bus size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الحافلات</p>
              <p className="text-lg font-black text-slate-900 leading-tight">{metrics.totalBuses}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 text-amber-700 rounded-xl flex items-center justify-center shrink-0">
              <UserCheck size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase">إجمالي الحجاج</p>
              <p className="text-lg font-black text-slate-900 leading-tight">{metrics.totalPilgrims}</p>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 text-purple-700 rounded-xl flex items-center justify-center shrink-0">
              <Building2 size={20} />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase">الجهات المستفيدة</p>
              <p className="text-lg font-black text-slate-900 leading-tight">{metrics.organizationsCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Results List Card */}
      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col">
        {/* Header Bar */}
        <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={16} className="text-slate-400" />
            <span className="text-xs font-black text-slate-500 uppercase tracking-wider">سجلات السندات والعمليات</span>
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 mr-2">
              {filteredVouchers.length} سند
            </span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span>صفحة {currentPage} من {totalPages}</span>
              <div className="flex items-center gap-1 mr-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100"
                >
                  <ChevronRight size={14} />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 hover:bg-slate-100"
                >
                  <ChevronLeft size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoadingAll ? (
          <div className="p-20 text-center text-slate-400 flex flex-col items-center justify-center">
            <Loader2 className="animate-spin text-blue-600 mb-4" size={36} />
            <p className="font-bold text-sm text-slate-600">جاري تحميل وتحديث سجلات الأرشيف...</p>
          </div>
        ) : filteredVouchers.length === 0 ? (
          <div className="p-20 text-center text-slate-400">
            <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mx-auto mb-4 border border-slate-100">
              <History size={36} className="text-slate-300" />
            </div>
            <p className="font-bold text-base text-slate-600">لا توجد سندات مطابقة لمعايير البحث</p>
            <p className="text-xs text-slate-400 mt-1">جرب تغيير الموسم أو الفترة الزمنية أو إزالة مصطلح البحث</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paginatedVouchers.map((v) => {
              const busesCount = Array.isArray(v.buses) && v.buses.length > 0
                ? v.buses.length
                : (Number(v.busesQuantity) || (v.busNumber ? 1 : 0));

              return (
                <div key={v.id} className="p-6 md:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6 hover:bg-slate-50/80 transition-colors group">
                  <div className="flex-1 space-y-4">
                    {/* Voucher Header row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-blue-700 bg-blue-50 px-3 py-1 rounded-xl border border-blue-100">
                        سند #{v.voucherNumber}
                      </span>

                      {v.approvalNumber && (
                        <span className="flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1 rounded-xl text-xs font-bold">
                          اعتماد: {v.approvalNumber}
                        </span>
                      )}

                      {v.organization && (
                        <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-3 py-1 rounded-xl text-xs font-bold border border-indigo-100">
                          <Building2 size={13} />
                          {v.organization}
                        </span>
                      )}

                      {v.hajjSeason && (
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-black ${
                          v.hajjSeason === '1448'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          موسم {v.hajjSeason} هـ
                        </span>
                      )}

                      <span className="flex items-center gap-1.5 bg-slate-50 text-slate-500 px-3 py-1 rounded-xl text-xs font-bold mr-auto">
                        <Calendar size={13} className="text-slate-400" />
                        {v.customDate || (v.timestamp ? format(new Date(v.timestamp), 'yyyy/MM/dd | HH:mm') : '-')}
                      </span>
                    </div>

                    {/* Buses rendering */}
                    {v.buses && Array.isArray(v.buses) && v.buses.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <Bus size={14} className="text-blue-600" />
                            <span className="text-xs font-black text-slate-700">الحافلات المسجلة ({v.buses.length})</span>
                          </div>
                          {v.buses.length > 8 && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const cur = busPages[v.id] || 1;
                                  if (cur > 1) setBusPages({ ...busPages, [v.id]: cur - 1 });
                                }}
                                disabled={(busPages[v.id] || 1) === 1}
                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 text-slate-400 disabled:opacity-30"
                              >
                                <ChevronRight size={12} />
                              </button>
                              <span className="text-[10px] font-bold text-slate-400">
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
                                className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 text-slate-400 disabled:opacity-30"
                              >
                                <ChevronLeft size={12} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                          {v.buses.slice(((busPages[v.id] || 1) - 1) * 8, (busPages[v.id] || 1) * 8).map((bus: any, idx: number) => (
                            <div key={idx} className="bg-slate-50 border border-slate-200/80 rounded-xl p-2 flex items-center gap-2.5">
                              <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0">
                                {bus.busNumber}
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-900 truncate">{bus.driverName || 'سائق غير محدد'}</p>
                                {bus.driverPhone && (
                                  <p className="text-[9px] text-slate-400">{bus.driverPhone}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                        <div className="w-12 h-12 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center shrink-0">
                          <span className="text-[8px] text-slate-400 font-bold">حافلة</span>
                          <span className="text-base font-black text-slate-900">{v.busNumber || '-'}</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{v.driverName || 'سائق غير محدد'}</p>
                          <p className="text-xs text-slate-400">{v.driverPhone || 'بدون هاتف'}</p>
                        </div>
                      </div>
                    )}

                    {/* Meta tags & Route */}
                    <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                      {v.receiverName && (
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                          المستلم: {v.receiverName}
                        </span>
                      )}

                      {v.delegateNumber && (
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg">
                          مندوب: {v.delegateNumber}
                        </span>
                      )}

                      {(v.directionFrom || v.directionTo) && (
                        <span className="bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-lg border border-emerald-100">
                          المسار: {v.directionFrom || ''} ➔ {v.directionTo || ''}
                        </span>
                      )}

                      {v.pilgrimsCount && Number(v.pilgrimsCount) > 0 && (
                        <span className="bg-amber-50 text-amber-800 px-2.5 py-1 rounded-lg border border-amber-100">
                          {v.pilgrimsCount} حاج
                        </span>
                      )}

                      {v.loadingLocation && (
                        <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg border border-purple-100">
                          موقع التحميل: {v.loadingLocation}
                        </span>
                      )}

                      {v.notes && (
                        <div className="w-full bg-yellow-50/70 border border-yellow-100 text-yellow-800 p-2 rounded-xl text-xs flex items-center gap-2">
                          <ClipboardList size={14} className="text-yellow-600 shrink-0" />
                          <span className="truncate">{v.notes}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center lg:flex-col justify-end gap-2 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-100">
                    <button
                      onClick={() => rePrint(v)}
                      disabled={isPrinting !== null}
                      className={`px-4 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center gap-2 ${
                        isPrinting === v.id
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-white border border-slate-200 text-slate-700 hover:text-blue-600 hover:border-blue-300 shadow-sm'
                      }`}
                    >
                      {isPrinting === v.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Printer size={16} />
                      )}
                      <span>طباعة السند</span>
                    </button>

                    <button
                      onClick={() => handleEditVoucher(v)}
                      className="p-2.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-all"
                      title="تعديل السند"
                    >
                      <Edit2 size={16} />
                    </button>

                    {isAllowedToDelete && (
                      <button
                        onClick={() => handleConfirmDelete(v)}
                        className="p-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-all"
                        title="حذف السند"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              عرض {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredVouchers.length)} من إجمالي {filteredVouchers.length} سند
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100"
              >
                السابق
              </button>
              <span className="text-xs font-black text-slate-700 px-2">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-30 hover:bg-slate-100"
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
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
              className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 border border-slate-100 p-8 text-right"
              dir="rtl"
            >
              <div className="flex justify-between items-center pb-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">توليد كشوفات وتقارير PDF للإدارة</h3>
                    <p className="text-xs text-slate-400 font-bold mt-0.5">طباعة وتصدير كشوفات شهرية أو موسمية مفصلة</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsReportModalOpen(false)}
                  disabled={isGeneratingReport}
                  className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all disabled:opacity-30"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="mt-6 space-y-6 max-h-[65vh] overflow-y-auto px-1">
                {/* 1. Select Report Type */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-2">نوع الكشف والتقرير المطلـوب:</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setReportType('monthly')}
                      className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3 ${
                        reportType === 'monthly'
                          ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Calendar className={reportType === 'monthly' ? 'text-blue-600' : 'text-slate-400'} size={20} />
                      <div>
                        <p className="font-black text-sm">كشف شهري شامل</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">كشف لكافة السندات لشهر محدد</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('seasonal')}
                      className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3 ${
                        reportType === 'seasonal'
                          ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Layers className={reportType === 'seasonal' ? 'text-blue-600' : 'text-slate-400'} size={20} />
                      <div>
                        <p className="font-black text-sm">كشف موسمي كامل</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">موسم 1448 هـ أو 1447 هـ</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('custom')}
                      className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3 ${
                        reportType === 'custom'
                          ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <CalendarDays className={reportType === 'custom' ? 'text-blue-600' : 'text-slate-400'} size={20} />
                      <div>
                        <p className="font-black text-sm">كشف فترة مخصصة</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">تحديد تاريخ البداية والنهاية</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReportType('filtered')}
                      className={`p-4 rounded-2xl border text-right transition-all flex items-start gap-3 ${
                        reportType === 'filtered'
                          ? 'bg-blue-50/80 border-blue-600 ring-2 ring-blue-600/20 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Filter className={reportType === 'filtered' ? 'text-blue-600' : 'text-slate-400'} size={20} />
                      <div>
                        <p className="font-black text-sm">السجلات المفلترة حالياً</p>
                        <p className="text-[10px] text-slate-400 font-bold mt-0.5">({filteredVouchers.length} سند معروض)</p>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 2. Specific Period Inputs */}
                {reportType === 'monthly' && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                    <label className="block text-xs font-black text-slate-700">تحديد الشهر والسنة للكشف:</label>
                    <input
                      type="month"
                      value={reportMonth}
                      onChange={(e) => setReportMonth(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:ring-4 focus:ring-blue-50"
                    />
                  </div>
                )}

                {reportType === 'seasonal' && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                    <label className="block text-xs font-black text-slate-700">اختر موسم الحج:</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setReportSeason('1448')}
                        className={`p-3 rounded-xl border font-black text-xs transition-all ${
                          reportSeason === '1448'
                            ? 'bg-blue-600 text-white border-blue-600 shadow-md'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        موسم حج 1448 هـ (الحالي)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReportSeason('1447')}
                        className={`p-3 rounded-xl border font-black text-xs transition-all ${
                          reportSeason === '1447'
                            ? 'bg-amber-600 text-white border-amber-600 shadow-md'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        موسم حج 1447 هـ (المؤرشف)
                      </button>
                    </div>
                  </div>
                )}

                {reportType === 'custom' && (
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-3">
                    <label className="block text-xs font-black text-slate-700">تحديد النطاق الزمني:</label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">من تاريخ:</span>
                        <input
                          type="date"
                          value={reportStartDate}
                          onChange={(e) => setReportStartDate(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 block mb-1">إلى تاريخ:</span>
                        <input
                          type="date"
                          value={reportEndDate}
                          onChange={(e) => setReportEndDate(e.target.value)}
                          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-xs text-slate-900 outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Custom Report Title (Optional) */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">عنوان الكشف (اختياري - يترك فارغاً للعنوان التلقائي):</label>
                  <input
                    type="text"
                    value={reportTitleCustom}
                    onChange={(e) => setReportTitleCustom(e.target.value)}
                    placeholder="مثال: كشف السندات والحافلات التشغيلية - إدارة العمليات"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50"
                  />
                </div>

                {/* 4. Report Signer / Issued By */}
                <div>
                  <label className="block text-xs font-black text-slate-700 mb-1.5">اسم المشرف / المدير المعتمد المُصدِر للتقرير:</label>
                  <input
                    type="text"
                    value={reportSigner}
                    onChange={(e) => setReportSigner(e.target.value)}
                    placeholder="اسم المسؤول المعتمد"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none focus:bg-white focus:ring-4 focus:ring-blue-50"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-8 pt-5 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleGenerateStatement(false)}
                  disabled={isGeneratingReport}
                  className="flex-1 py-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-100 hover:opacity-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
                  className="py-4 px-6 bg-slate-900 text-white font-black text-sm rounded-2xl hover:bg-black transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Download size={18} />
                  <span>تنزيل كملف</span>
                </button>

                <button
                  onClick={() => setIsReportModalOpen(false)}
                  disabled={isGeneratingReport}
                  className="py-4 px-5 border border-slate-200 text-slate-600 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-50"
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
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
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
              className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl relative z-10 border border-slate-100 p-8"
              dir="rtl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100">
                    <Edit2 size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900">تعديل بيانات السند #{voucherToEdit.voucherNumber}</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">تحديث السجلات المخزنة في النظام</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="w-10 h-10 bg-slate-50 text-slate-400 rounded-xl flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="max-h-[65vh] overflow-y-auto px-2 space-y-6">
                <div className="p-5 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 mb-1">اسم المندوب (المستلم)</label>
                      <input
                        type="text"
                        value={voucherToEdit.receiverName || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, receiverName: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 mb-1">رقم جوال المستلم</label>
                      <input
                        type="text"
                        value={voucherToEdit.receiverMobile || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, receiverMobile: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 mb-1">المؤسسة / الجهة</label>
                      <input
                        type="text"
                        value={voucherToEdit.organization || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, organization: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 mb-1">رقم الاعتماد</label>
                      <input
                        type="text"
                        value={voucherToEdit.approvalNumber || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, approvalNumber: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-slate-500 mb-1">عدد الحجاج</label>
                      <input
                        type="number"
                        value={voucherToEdit.pilgrimsCount || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, pilgrimsCount: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-black text-slate-500 mb-1">عدد التذاكر</label>
                      <input
                        type="number"
                        value={voucherToEdit.ticketsCount || ''}
                        onChange={(e) => setVoucherToEdit({ ...voucherToEdit, ticketsCount: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black text-slate-500 mb-1">الملاحظات</label>
                    <textarea
                      value={voucherToEdit.notes || ''}
                      onChange={(e) => setVoucherToEdit({ ...voucherToEdit, notes: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl font-bold text-sm text-slate-900 outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setIsConfirmSaveOpen(true)}
                  disabled={isUpdating}
                  className="flex-1 py-4 bg-blue-600 text-white font-black text-sm rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-100 disabled:opacity-50"
                >
                  <Save size={18} />
                  <span>حفظ التعديلات</span>
                </button>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={isUpdating}
                  className="px-6 py-4 border border-slate-200 text-slate-600 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all"
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
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
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
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-slate-100 text-center p-8"
              dir="rtl"
            >
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-blue-100 text-blue-600">
                <Save size={28} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">تأكيد حفظ التعديلات</h3>
              <p className="text-slate-500 text-sm mb-6">هل أنت متأكد من حفظ التعديلات الجديدة على السند؟</p>
              <div className="flex gap-3">
                <button
                  onClick={updateVoucher}
                  disabled={isUpdating}
                  className="flex-1 bg-blue-600 text-white font-black py-3.5 rounded-2xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-blue-100"
                >
                  {isUpdating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                  <span>نعم، تأكيد الحفظ</span>
                </button>
                <button
                  onClick={() => setIsConfirmSaveOpen(false)}
                  disabled={isUpdating}
                  className="px-5 py-3.5 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
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
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
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
              className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl relative z-10 border border-slate-100 text-center p-8"
              dir="rtl"
            >
              <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-red-100 text-red-600">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">تأكيد حذف السند</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                هل أنت متأكد من حذف السند رقم <strong className="text-red-600">#{voucherToDelete.voucherNumber}</strong>؟ سيتم إزالة السند نهائياً من قاعدة البيانات.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={deleteVoucher}
                  disabled={isDeleting}
                  className="flex-1 bg-red-600 text-white font-black py-3.5 rounded-2xl hover:bg-red-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-red-100"
                >
                  {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  <span>نعم، حذف السند</span>
                </button>
                <button
                  onClick={() => setIsDeleteModalOpen(false)}
                  disabled={isDeleting}
                  className="px-5 py-3.5 border border-slate-200 text-slate-600 font-bold rounded-2xl hover:bg-slate-50 transition-all"
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
