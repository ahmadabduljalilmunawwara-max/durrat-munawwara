import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, writeBatch, serverTimestamp, getDocs } from 'firebase/firestore';
import { Plus, Trash2, Bus, User as UserIcon, Search, Save, Upload, Loader2, Clock, Edit2, X, Download, Filter, Check, FileText, Phone, ChevronLeft, ChevronRight, ShieldAlert, Lock, Eye, EyeOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

export function BusesManagement() {
  const [busNumber, setBusNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [busType, setBusType] = useState('');
  const [editingBus, setEditingBus] = useState<any>(null);
  const [buses, setBuses] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [usedBusesInfo, setUsedBusesInfo] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete All State
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'buses'), orderBy('busNumber'));
    const unsub = onSnapshot(q, (snap) => {
      setBuses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'buses'));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'vouchers'), (snap) => {
      const usedInfo: Record<string, string> = {};
      snap.forEach(doc => {
        const data = doc.data();
        if (data.archived === true) return; // Skip archived vouchers
        const vNum = data.voucherNumber || '---';
        if (data.busNumber) {
          usedInfo[data.busNumber] = vNum;
        }
        if (data.buses && Array.isArray(data.buses)) {
          data.buses.forEach((b: any) => {
            if (b.busNumber) {
              usedInfo[b.busNumber] = vNum;
            }
          });
        }
      });
      setUsedBusesInfo(usedInfo);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'vouchers'));
    return unsub;
  }, []);

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busNumber || !driverName) return;

    setIsSaving(true);
    try {
      if (editingBus && editingBus.id !== busNumber) {
        await deleteDoc(doc(db, 'buses', editingBus.id));
      }

      await setDoc(doc(db, 'buses', busNumber), {
        busNumber,
        driverName,
        driverPhone,
        busType: busType || 'غير محدد',
        updatedAt: serverTimestamp()
      });
      
      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setBusType('');
      setEditingBus(null);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.WRITE, `buses/${busNumber}`);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingBus(null);
    setBusNumber('');
    setDriverName('');
    setDriverPhone('');
    setBusType('');
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteAllBuses = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDeleteError('');

    if (deletePassword !== 'A1994ahmed2026') {
      setDeleteError('كلمة المرور غير صحيحة! يرجى إدخال كلمة السر المصرحة لإتمام الحذف.');
      return;
    }

    setIsDeletingAll(true);
    try {
      const snap = await getDocs(collection(db, 'buses'));
      const docs = snap.docs;
      
      const batchSize = 500;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      setShowDeleteAllModal(false);
      setDeletePassword('');
      setDeleteError('');
      setDeleteSuccess('تم مسح جميع الحافلات من قائمة الأسطول بنجاح. السندات والسجلات السابقة محفوظة ومحمية بالكامل.');
      setTimeout(() => setDeleteSuccess(''), 6000);
    } catch (error) {
      console.error('Delete all buses error:', error);
      handleFirestoreError(error, OperationType.DELETE, 'buses');
      setDeleteError('حدث خطأ أثناء محاولة مسح الحافلات. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const deleteBus = async (id: string) => {
    if (deletingId === id) {
      try {
        setDeletingId(id);
        await deleteDoc(doc(db, 'buses', id));
      } catch (error) {
        console.error(error);
        handleFirestoreError(error, OperationType.DELETE, `buses/${id}`);
      } finally {
        setDeletingId(null);
      }
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(prev => prev === id ? null : prev), 3000);
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const batchSize = 500;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = data.slice(i, i + batchSize);
          
          chunk.forEach(row => {
            const bNum = String(row['رقم الحافلة'] || row['busNumber'] || row['BusNumber'] || '');
            const dName = String(row['اسم السائق'] || row['driverName'] || row['DriverName'] || '');
            const dPhone = String(row['رقم الهاتف'] || row['driverPhone'] || row['DriverPhone'] || '');
            const bType = String(row['نوع الحافلة'] || row['busType'] || row['BusType'] || 'غير محدد');
            
            if (bNum && dName) {
              const busRef = doc(db, 'buses', bNum);
              batch.set(busRef, {
                busNumber: bNum,
                driverName: dName,
                driverPhone: dPhone,
                busType: bType,
                updatedAt: serverTimestamp()
              });
            }
          });
          
          await batch.commit();
        }
        alert('تم استيراد البيانات بنجاح');
      } catch (err) {
        console.error('Import error:', err);
        alert('حدث خطأ أثناء استيراد الملف. تأكد من أن الملف بصيغة Excel ويحتوي على أعمدة باسم (رقم الحافلة) و (اسم السائق)');
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExportExcel = () => {
    try {
      const exportData = buses.map(bus => ({
        'رقم الحافلة': bus.busNumber,
        'نوع الحافلة': bus.busType || 'غير محدد',
        'اسم السائق': bus.driverName,
        'رقم الهاتف': bus.driverPhone || '---',
        'آخر تحديث': bus.updatedAt && typeof bus.updatedAt.toDate === 'function' 
          ? format(bus.updatedAt.toDate(), 'yyyy-MM-dd HH:mm')
          : bus.updatedAt && typeof bus.updatedAt === 'string'
          ? format(new Date(bus.updatedAt), 'yyyy-MM-dd HH:mm')
          : '---'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      const wscols = [
        { wch: 15 },
        { wch: 20 },
        { wch: 30 },
        { wch: 20 },
        { wch: 20 },
      ];
      ws['!cols'] = wscols;

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "الحافلات");
      XLSX.writeFile(wb, `قائمة_الحافلات_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء تصدير الملف');
    }
  };

  const filteredBuses = buses.filter(b => 
    b.busNumber.includes(filter) || 
    b.driverName.includes(filter) ||
    (b.busType && b.busType.includes(filter))
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  const totalPages = Math.ceil(filteredBuses.length / pageSize);
  const paginatedBuses = filteredBuses.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { x: 20, opacity: 0 },
    visible: { x: 0, opacity: 1 }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Section: Add/Edit Form */}
      <motion.div 
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white rounded-[2rem] p-7 md:p-8 shadow-sm border transition-all flex flex-col relative overflow-hidden ${editingBus ? 'border-blue-600 ring-4 ring-blue-500/10' : 'border-slate-200/90'}`}
      >
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-blue-950 via-blue-700 to-amber-500"></div>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-7">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${editingBus ? 'bg-blue-700' : 'bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800'} rounded-2xl flex items-center justify-center text-white shadow-md`}>
              {editingBus ? <Edit2 size={22} className="text-amber-300" /> : <Plus size={22} className="text-amber-400" />}
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-900 leading-snug">
                {editingBus ? 'تحرير بيانات الحافلة' : 'إضافة حافلة جديدة للنظام'}
              </h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">إدارة الأصول المركزية والمزامنة اللحظية</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
             <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleExcelImport} />
             <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200/90 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-all cursor-pointer"
             >
               {isImporting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} className="text-slate-500" />}
               <span>استيراد</span>
             </motion.button>

             <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleExportExcel}
              disabled={buses.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-50 border border-blue-200/80 text-blue-800 rounded-xl font-bold text-xs hover:bg-blue-100 transition-all cursor-pointer disabled:opacity-40"
             >
               <Download size={16} />
               <span>تصدير</span>
             </motion.button>

             <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setDeletePassword('');
                setDeleteError('');
                setShowDeleteAllModal(true);
              }}
              disabled={buses.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl font-bold text-xs hover:bg-red-100 transition-all cursor-pointer disabled:opacity-40"
              title="مسح جميع الحافلات من الأسطول (مشروط بكلمة سر)"
             >
               <Trash2 size={16} className="text-red-600" />
               <span>مسح الكل</span>
             </motion.button>
          </div>
        </div>

        {/* Delete Success Toast Banner */}
        <AnimatePresence>
          {deleteSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold shadow-2xs"
            >
              <div className="flex items-center gap-2.5">
                <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
                <span>{deleteSuccess}</span>
              </div>
              <button 
                onClick={() => setDeleteSuccess('')} 
                className="text-emerald-600 hover:text-emerald-800 p-1"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        
        <form onSubmit={handleSaveBus} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <div className="group">
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1 group-focus-within:text-blue-700 transition-colors">رقم الحافلة</label>
              <div className="relative">
                <Bus className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="text"
                  required
                  value={busNumber}
                  onChange={(e) => setBusNumber(e.target.value)}
                  className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-900 text-sm tabular-nums"
                  placeholder="مثلاً: 5040"
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1 group-focus-within:text-blue-700 transition-colors">نوع الحافلة</label>
              <div className="relative">
                <Filter className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="text"
                  value={busType}
                  onChange={(e) => setBusType(e.target.value)}
                  className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-slate-900 text-sm"
                  placeholder="VIP، مرسيدس..."
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1 group-focus-within:text-blue-700 transition-colors">اسم السائق الثابت</label>
              <div className="relative">
                <UserIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-slate-900 text-sm"
                  placeholder="الاسم الثلاثي..."
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1 group-focus-within:text-blue-700 transition-colors">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-slate-900 text-sm tabular-nums"
                  placeholder="مثلاً: 05xxxxxxx"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 justify-end">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isSaving}
              className={`flex-1 py-3.5 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all shadow-md cursor-pointer ${editingBus ? 'bg-blue-700 hover:bg-blue-800' : 'bg-gradient-to-l from-slate-900 via-blue-950 to-blue-800 hover:opacity-95'} disabled:opacity-50`}
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : (editingBus ? <Save size={18} className="text-amber-300" /> : <Plus size={18} className="text-amber-400" />)}
              <span>{editingBus ? 'تحديث' : 'إضافة'}</span>
            </motion.button>

            {editingBus && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                onClick={cancelEdit}
                className="px-4 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </motion.button>
            )}
          </div>
        </form>
      </motion.div>

      {/* Middle Section: Search Bar */}
      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white px-5 py-4 rounded-2xl border border-slate-200/90 shadow-2xs flex items-center gap-4 group transition-all focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-blue-600"
      >
        <div className="w-10 h-10 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-center text-slate-400 group-focus-within:text-blue-700 transition-colors shrink-0">
          <Search size={20} />
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-900"
          placeholder="البحث السريع في القائمة (رقم حافلة، اسم سائق، أو نوع)..."
        />
        <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs font-bold text-slate-600 hidden sm:block tabular-nums">
          إجمالي: {filteredBuses.length} حافلة
        </div>
      </motion.div>

      {/* Bottom Section: Cards Grid */}
      <div className="space-y-6">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          <AnimatePresence mode="popLayout">
            {paginatedBuses.map((b) => {
              const voucherNum = usedBusesInfo[b.busNumber];
              const isUsed = !!voucherNum;
              return (
                <motion.div
                  layout
                  variants={itemVariants}
                  initial="hidden"
                  animate="visible"
                  exit={{ opacity: 0, scale: 0.95 }}
                  key={b.id}
                  className={`p-6 rounded-[2rem] border transition-all duration-300 group relative overflow-hidden flex flex-col justify-between ${
                    editingBus?.id === b.id 
                      ? 'bg-blue-50/40 border-blue-600 ring-4 ring-blue-500/10 shadow-lg' 
                      : isUsed 
                      ? 'bg-white border-red-200 shadow-sm ring-2 ring-red-50'
                      : 'bg-white border-slate-200/90 hover:border-blue-300 hover:shadow-md'
                  }`}
                >
                  <div className="relative z-10">
                    {/* Header: Number, Type & Status/Actions */}
                    <div className="flex justify-between items-start mb-6 gap-3">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center font-extrabold text-xl transition-all duration-300 shadow-xs shrink-0 tabular-nums ${
                          editingBus?.id === b.id 
                            ? 'bg-blue-700 text-white' 
                            : isUsed
                            ? 'bg-red-600 text-white'
                            : 'bg-slate-900 text-white group-hover:bg-blue-800'
                        }`}>
                          {b.busNumber}
                        </div>
                        <div className="flex flex-col justify-center">
                          <span className={`text-xs font-semibold ${isUsed ? 'text-red-600' : 'text-slate-500'}`}>فئة الحافلة</span>
                          <span className={`text-base font-extrabold transition-colors ${
                            isUsed ? 'text-red-950' : 'text-slate-900 group-hover:text-blue-800'
                          }`}>
                            {b.busType || 'غير محدد'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isUsed ? (
                          <div className="px-3 py-1 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-bold flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                            </span>
                            نشطة بالسندات
                          </div>
                        ) : (
                          <div className="px-3 py-1 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-emerald-200/80">
                            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                            شبه جاهزة / متاحة
                          </div>
                        )}
                        
                        <div className="flex gap-1.5 mt-1">
                          {!isUsed && (
                            <motion.button 
                              whileHover={{ scale: 1.08 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                setEditingBus(b);
                                setBusNumber(b.busNumber);
                                setDriverName(b.driverName);
                                setDriverPhone(b.driverPhone || '');
                                setBusType(b.busType || '');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                                editingBus?.id === b.id 
                                  ? 'bg-blue-700 text-white shadow-sm' 
                                  : 'bg-slate-50 text-slate-500 hover:text-blue-700 hover:bg-blue-50 border border-slate-200/80'
                              }`}
                            >
                              <Edit2 size={15} />
                            </motion.button>
                          )}
                          <motion.button 
                            whileHover={{ scale: 1.08 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => deleteBus(b.id)}
                            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${
                              deletingId === b.id 
                                ? 'bg-red-600 text-white ring-4 ring-red-100 shadow-sm' 
                                : 'bg-slate-50 text-slate-400 hover:text-red-600 hover:bg-red-50 border border-slate-200/80'
                            }`}
                          >
                            {deletingId === b.id ? <Check size={16} /> : <Trash2 size={15} />}
                          </motion.button>
                        </div>
                      </div>
                    </div>
  
                    {/* Content Details */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                          isUsed ? 'bg-red-50/70 text-red-600 border-red-100' : 'bg-slate-50 text-blue-700 border-slate-200/80'
                        }`}>
                          <UserIcon size={17} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-0.5">السائق الفعلي</p>
                          <p className="text-base font-bold text-slate-900">{b.driverName}</p>
                        </div>
                      </div>
  
                      <div className="flex items-center gap-3.5">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
                          isUsed ? 'bg-red-50/70 text-red-600 border-red-100' : 'bg-slate-50 text-blue-700 border-slate-200/80'
                        }`}>
                          <Phone size={17} />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-500 mb-0.5">رقم الهاتف</p>
                          <p className="text-base font-bold text-slate-900 tabular-nums">{b.driverPhone || '---'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
  
                  {/* Decorative Background Bus Icon */}
                  <Bus size={110} className="absolute -bottom-6 -left-6 opacity-[0.03] pointer-events-none text-slate-900" />
  
                  <div className={`mt-6 pt-4 border-t flex flex-col gap-2.5 ${
                    isUsed ? 'border-red-100 text-red-600' : 'border-slate-100 text-slate-400'
                  }`}>
                    {isUsed && (
                      <div className="flex items-center gap-2 px-3.5 py-2 bg-red-50 rounded-xl border border-red-100">
                        <FileText size={14} className="text-red-600" />
                        <span className="text-xs font-bold text-red-800 tabular-nums">سند النشاط: #{voucherNum}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-400 px-1 tabular-nums">
                      <Clock size={12} />
                      {b.updatedAt && typeof b.updatedAt.toDate === 'function' ? (
                        <span>تعديل: {format(b.updatedAt.toDate(), 'yyyy-MM-dd HH:mm')}</span>
                      ) : (
                        <span>سجل تاريخي ثابت</span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
  
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 py-6">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-700 disabled:opacity-30 transition-all shadow-2xs cursor-pointer"
            >
              <ChevronRight size={20} />
            </button>
            
            <div className="flex items-center gap-1.5">
              {[...Array(totalPages)].map((_, i) => {
                const page = i + 1;
                if (
                  totalPages > 7 &&
                  page !== 1 &&
                  page !== totalPages &&
                  Math.abs(page - currentPage) > 1
                ) {
                  if (page === 2 || page === totalPages - 1) return <span key={page} className="text-slate-400 px-1.5">...</span>;
                  return null;
                }
                
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-xl text-xs font-bold transition-all cursor-pointer tabular-nums ${
                      currentPage === page
                        ? 'bg-blue-800 text-white shadow-sm'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {page}
                  </button>
                );
              })}
            </div>
  
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-700 disabled:opacity-30 transition-all shadow-2xs cursor-pointer"
            >
              <ChevronLeft size={20} /> 
            </button>
          </div>
        )}
      </div>

      {filteredBuses.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-28 text-center bg-white rounded-[2rem] border border-slate-200/80"
        >
          <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-5 border border-dashed border-slate-300">
             <Bus size={44} className="text-slate-300" />
          </div>
          <h4 className="text-slate-700 font-extrabold text-base mb-1.5">لا تـوجـد حـافـلات</h4>
          <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">لم نعثر على أي حافلات تطابق بحثك الحالي، جرب كلمات بحث أخرى</p>
        </motion.div>
      )}

      {/* Delete All Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAllModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-red-100 overflow-hidden relative"
            >
              {/* Red Header Accent */}
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-red-500 via-rose-600 to-amber-500"></div>

              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600 shrink-0 shadow-xs">
                    <ShieldAlert size={26} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">مسح جميع الحافلات</h3>
                    <p className="text-xs font-bold text-slate-400">عملية حساسة تتطلب كلمة المرور الإدارية</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteAllModal(false);
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                  className="w-9 h-9 rounded-xl bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-all flex items-center justify-center"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Warning Notice */}
              <div className="space-y-3 mb-6">
                <div className="p-4 bg-red-50/80 border border-red-200/80 rounded-2xl flex items-start gap-3 text-red-900 text-xs">
                  <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-red-950 mb-0.5">تنبيه الحذف الكلي:</p>
                    <p className="leading-relaxed">
                      سيتم حذف جميع الحافلات المضافة حالياً في الأسطول (<span className="font-black underline">{buses.length} حافلة</span>) وإفراغ قائمة الحافلات.
                    </p>
                  </div>
                </div>

                {/* Safety Guarantee Notice */}
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-emerald-950 text-xs">
                  <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-black text-emerald-900 mb-0.5">🛡️ ضمان سلامة السجلات والسندات:</p>
                    <p className="text-emerald-800 leading-relaxed font-bold">
                      لن تتأثر السجلات والسندات السابقة نهائياً، حيث تظل جميع السندات التاريخية وبيانات الحافلات الخاصة بها محفوظة وموثقة بالكامل في أرشيف السندات والتقارير.
                    </p>
                  </div>
                </div>
              </div>

              {/* Password Form */}
              <form onSubmit={handleDeleteAllBuses} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-black text-slate-700 mr-1">
                    أدخل كلمة المرور للتأكيد:
                  </label>
                  <div className="relative">
                    <Lock className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      required
                      value={deletePassword}
                      onChange={(e) => {
                        setDeletePassword(e.target.value);
                        if (deleteError) setDeleteError('');
                      }}
                      className="w-full pr-12 pl-12 py-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-4 focus:ring-red-50 focus:border-red-400 outline-none transition-all font-mono font-bold text-slate-900 text-sm"
                      placeholder="كلمة السر المصرحة..."
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {deleteError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-black text-red-600 mr-1 flex items-center gap-1.5 pt-1"
                    >
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>{deleteError}</span>
                    </motion.p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteAllModal(false);
                      setDeletePassword('');
                      setDeleteError('');
                    }}
                    disabled={isDeletingAll}
                    className="flex-1 py-3.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-xl font-black text-xs transition-all cursor-pointer"
                  >
                    إلغاء الأمر
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingAll || !deletePassword}
                    className="flex-1 py-3.5 bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-xl font-black text-xs shadow-lg shadow-red-500/20 hover:from-red-700 hover:to-rose-800 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDeletingAll ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>جاري المسح...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        <span>تأكيد مسح الكل</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
