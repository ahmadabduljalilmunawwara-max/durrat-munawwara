import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy, writeBatch, serverTimestamp } from 'firebase/firestore';
import { Plus, Trash2, Bus, User as UserIcon, Search, Save, Upload, Loader2, Clock, Edit2, X, Download, Filter, Check, FileText, Phone, ChevronLeft, ChevronRight } from 'lucide-react';
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
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Top Section: Add/Edit Form */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-slate-200/50 border transition-all flex flex-col ${editingBus ? 'border-blue-500 ring-8 ring-blue-50/50' : 'border-slate-100'}`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${editingBus ? 'bg-indigo-600' : 'bg-blue-600'} rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-100`}>
              {editingBus ? <Edit2 size={24} /> : <Plus size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 leading-none">
                {editingBus ? 'تحرير بيانات الحافلة' : 'إضافة حافلة جديدة للنظام'}
              </h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">إدارة الأصول المركزية والمزامنة اللحظية</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
             <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleExcelImport} />
             <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-slate-50 border border-slate-100 text-slate-600 rounded-xl font-black text-[10px] hover:bg-slate-100 transition-all uppercase tracking-widest"
             >
               {isImporting ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
               <span>استيراد</span>
             </motion.button>

             <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleExportExcel}
              disabled={buses.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-blue-50 border border-blue-100 text-blue-700 rounded-xl font-black text-[10px] hover:bg-blue-100 transition-all uppercase tracking-widest"
             >
               <Download size={16} />
               <span>تصدير</span>
             </motion.button>
          </div>
        </div>
        
        <form onSubmit={handleSaveBus} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="group">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 mr-1 tracking-widest group-focus-within:text-blue-500 transition-colors">رقم الحافلة</label>
              <div className="relative">
                <Bus className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-400 transition-colors" size={18} />
                <input
                  type="text"
                  required
                  value={busNumber}
                  onChange={(e) => setBusNumber(e.target.value)}
                  className="w-full pr-14 pl-5 py-4 bg-slate-50/50 rounded-xl focus:bg-white border border-slate-100 focus:border-blue-300 outline-none transition-all font-black text-slate-900 placeholder:text-slate-300"
                  placeholder="مثلاً: 5040"
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 mr-1 tracking-widest group-focus-within:text-blue-500 transition-colors">نوع الحافلة</label>
              <div className="relative">
                <Filter className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-400 transition-colors" size={18} />
                <input
                  type="text"
                  value={busType}
                  onChange={(e) => setBusType(e.target.value)}
                  className="w-full pr-14 pl-5 py-4 bg-slate-50/50 rounded-xl focus:bg-white border border-slate-100 focus:border-blue-300 outline-none transition-all font-black text-slate-900 placeholder:text-slate-300"
                  placeholder="VIP، مرسيدس..."
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 mr-1 tracking-widest group-focus-within:text-blue-500 transition-colors">اسم السائق الثابت</label>
              <div className="relative">
                <UserIcon className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-400 transition-colors" size={18} />
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full pr-14 pl-5 py-4 bg-slate-50/50 rounded-xl focus:bg-white border border-slate-100 focus:border-blue-300 outline-none transition-all font-black text-slate-900 placeholder:text-slate-300"
                  placeholder="الاسم الثلاثي..."
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-[10px] font-black text-slate-400 uppercase mb-3 mr-1 tracking-widest group-focus-within:text-blue-500 transition-colors">رقم الهاتف</label>
              <div className="relative">
                <Phone className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-blue-400 transition-colors" size={18} />
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full pr-14 pl-5 py-4 bg-slate-50/50 rounded-xl focus:bg-white border border-slate-100 focus:border-blue-300 outline-none transition-all font-black text-slate-900 placeholder:text-slate-300"
                  placeholder="مثلاً: 05xxxxxxx"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={isSaving}
              className={`flex-1 py-4 text-white rounded-xl font-black flex items-center justify-center gap-3 transition-all shadow-xl ${editingBus ? 'bg-indigo-600 shadow-indigo-100' : 'bg-slate-900 shadow-slate-200'} disabled:opacity-50`}
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : (editingBus ? <Save size={18} /> : <Plus size={18} />)}
              <span className="uppercase tracking-tighter">{editingBus ? 'تحديث' : 'إضافة'}</span>
            </motion.button>

            {editingBus && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                type="button"
                onClick={cancelEdit}
                className="px-4 bg-slate-100 text-slate-400 rounded-xl hover:bg-slate-200 transition-all flex items-center justify-center shadow-md"
              >
                <X size={18} />
              </motion.button>
            )}
          </div>
        </form>
      </motion.div>

      {/* Middle Section: Search Bar */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex items-center gap-5 group transition-all focus-within:ring-4 focus-within:ring-blue-50"
      >
        <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 group-focus-within:text-blue-500 transition-colors">
          <Search size={24} />
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 bg-transparent outline-none text-lg font-black text-slate-900 placeholder:text-slate-300 placeholder:font-bold"
          placeholder="البحث السريع في القائمة (رقم حافلة، اسم سائق، أو نوع)..."
        />
        <div className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
          إجمالي: {filteredBuses.length} حافلة
        </div>
      </motion.div>

      {/* Bottom Section: Cards Grid */}
      <div className="space-y-6">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
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
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={b.id}
                  className={`p-7 rounded-[3rem] border transition-all duration-500 group relative overflow-hidden flex flex-col justify-between ${
                    editingBus?.id === b.id 
                      ? 'bg-gradient-to-br from-indigo-50 to-white border-indigo-500 ring-8 ring-indigo-100 shadow-2xl shadow-indigo-100' 
                      : isUsed 
                      ? 'bg-gradient-to-br from-red-50/40 to-white border-red-500/30 shadow-xl shadow-red-100/30 ring-4 ring-red-50/60'
                      : 'bg-gradient-to-br from-white to-slate-50 border-slate-100 hover:border-blue-200 hover:shadow-2xl hover:shadow-blue-100/30'
                  }`}
                >
                  <div className="relative z-10">
                    {/* Header: Number, Type & Status/Actions */}
                    <div className="flex justify-between items-start mb-8 gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center font-black text-2xl transition-all duration-500 shadow-lg shrink-0 ${
                          editingBus?.id === b.id 
                            ? 'bg-indigo-600 text-white rotate-6 scale-110 shadow-indigo-200' 
                            : isUsed
                            ? 'bg-red-600 text-white shadow-red-200'
                            : 'bg-white text-slate-900 border border-slate-100 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-500 group-hover:-rotate-3 group-hover:scale-110 shadow-slate-100'
                        }`}>
                          {b.busNumber}
                        </div>
                        <div className="flex flex-col justify-center">
                          <span className={`text-[9px] font-black uppercase tracking-widest ${isUsed ? 'text-red-500' : 'text-slate-400'}`}>فئة الحافلة</span>
                          <span className={`text-base font-black transition-colors ${
                            isUsed ? 'text-red-950' : 'text-slate-800 group-hover:text-blue-700'
                          }`}>
                            {b.busType || 'غير محدد'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isUsed ? (
                          <div className="px-3 py-1.5 bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-red-200/50">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                            </span>
                            نشطة بالسندات
                          </div>
                        ) : (
                          <div className="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-slate-200/60">
                            <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                            شبه جاهزة / متاحة
                          </div>
                        )}
                        
                        <div className="flex gap-1.5 mt-1">
                          {!isUsed && (
                            <motion.button 
                              whileHover={{ scale: 1.15, rotate: 5 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                setEditingBus(b);
                                setBusNumber(b.busNumber);
                                setDriverName(b.driverName);
                                setDriverPhone(b.driverPhone || '');
                                setBusType(b.busType || '');
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300 ${
                                editingBus?.id === b.id 
                                  ? 'bg-white text-indigo-600 shadow-lg shadow-indigo-100' 
                                  : 'bg-white text-slate-400 hover:text-blue-600 hover:shadow-lg hover:shadow-blue-100 border border-slate-50 hover:border-blue-100'
                              }`}
                            >
                              <Edit2 size={16} />
                            </motion.button>
                          )}
                          <motion.button 
                            whileHover={{ scale: 1.15, rotate: -5 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => deleteBus(b.id)}
                            className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all duration-300 ${
                              deletingId === b.id 
                                ? 'bg-red-500 text-white ring-4 ring-red-100 shadow-lg' 
                                : 'bg-white text-slate-300 hover:text-red-500 hover:shadow-lg hover:shadow-red-100 border border-slate-50 hover:border-red-100'
                            }`}
                          >
                            {deletingId === b.id ? <Check size={18} /> : <Trash2 size={16} />}
                          </motion.button>
                        </div>
                      </div>
                    </div>
  
                    {/* Content Details */}
                    <div className="space-y-5">
                      <div className="flex items-center gap-5">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm ${
                          isUsed ? 'bg-white text-red-500 shadow-red-100' : 'bg-white text-slate-400 group-hover:text-blue-500 group-hover:shadow-blue-100'
                        }`}>
                          <UserIcon size={18} />
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-1 ${isUsed ? 'text-red-500' : 'text-slate-400 font-bold'}`}>السائق الفعلي</p>
                          <p className={`text-lg font-black transition-colors duration-300 ${isUsed ? 'text-red-950' : 'text-slate-900 group-hover:text-blue-700'}`}>{b.driverName}</p>
                        </div>
                      </div>
  
                      <div className="flex items-center gap-5">
                        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-sm ${
                          isUsed ? 'bg-white text-red-500 shadow-red-100' : 'bg-white text-slate-400 group-hover:text-blue-500 group-hover:shadow-blue-100'
                        }`}>
                          <Phone size={18} />
                        </div>
                        <div>
                          <p className={`text-[10px] font-black uppercase tracking-[0.15em] mb-1 ${isUsed ? 'text-red-500' : 'text-slate-400 font-bold'}`}>رقم الهاتف</p>
                          <p className={`text-lg font-black transition-colors duration-300 ${isUsed ? 'text-red-950' : 'text-slate-900 group-hover:text-blue-700'}`}>{b.driverPhone || '---'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
  
                  {/* Decorative Background Bus Icon */}
                  <Bus size={120} className={`absolute -bottom-8 -left-8 opacity-[0.03] sm:opacity-[0.05] pointer-events-none transition-all duration-1000 ${
                    isUsed ? 'text-red-950/20 -rotate-12 scale-125' : 'text-slate-900 group-hover:text-blue-600 group-hover:scale-150 group-hover:-rotate-12 group-hover:opacity-10'
                  }`} />
  
                  <div className={`mt-8 pt-6 border-t flex flex-col gap-3 ${
                    isUsed ? 'border-red-100/60 text-red-600' : 'border-slate-100 text-slate-300'
                  }`}>
                    {isUsed && (
                      <div className="flex items-center gap-2.5 px-4 py-2 bg-red-50 rounded-2xl border border-red-100">
                        <FileText size={14} className="text-red-600" />
                        <span className="text-[10px] font-black text-red-700">سند النشاط: #{voucherNum}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2.5 text-[9px] font-bold uppercase tracking-widest px-1">
                      <Clock size={12} className="opacity-40" />
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
          <div className="flex items-center justify-center gap-4 py-8">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-all shadow-sm"
            >
              <ChevronRight size={24} />
            </button>
            
            <div className="flex items-center gap-2">
              {[...Array(totalPages)].map((_, i) => {
                const page = i + 1;
                // Only show current, first, last, and neighbors if many pages
                if (
                  totalPages > 7 &&
                  page !== 1 &&
                  page !== totalPages &&
                  Math.abs(page - currentPage) > 1
                ) {
                  if (page === 2 || page === totalPages - 1) return <span key={page} className="text-slate-300 px-2 italic">...</span>;
                  return null;
                }
                
                return (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={`w-10 h-10 rounded-xl text-xs font-black transition-all ${
                      currentPage === page
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-100'
                        : 'bg-white border border-slate-100 text-slate-400 hover:bg-slate-50'
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
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white border border-slate-100 text-slate-400 hover:text-blue-600 disabled:opacity-30 disabled:hover:text-slate-400 transition-all shadow-sm"
            >
              <ChevronLeft size={24} /> 
            </button>
          </div>
        )}
      </div>

      {filteredBuses.length === 0 && (
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          className="py-40 text-center"
        >
          <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-8 border-2 border-dashed border-slate-200 shadow-2xl shadow-slate-100 animate-pulse">
             <Bus size={56} className="text-slate-200" />
          </div>
          <h4 className="text-slate-300 font-black uppercase text-sm tracking-[0.4em] mb-3 leading-none">لا تـوجـد حـافـلات</h4>
          <p className="text-xs text-slate-400 font-bold max-w-xs mx-auto">لم نعثر على أي حافلات تطابق بحثك الحالي، جرب كلمات بحث أخرى</p>
        </motion.div>
      )}
    </div>
  );
}
