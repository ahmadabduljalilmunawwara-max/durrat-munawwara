import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, collection, getDocs, setDoc } from 'firebase/firestore';
import { Save, Settings, Printer, ImageIcon, Loader2, Download, Upload, Database, Check, AlertCircle } from 'lucide-react';
import { CompanyLogo } from './CompanyLogo';

export function AppSettings() {
  const [fileImportStatus, setFileImportStatus] = useState<{
    state: 'idle' | 'running' | 'success' | 'error';
    message: string;
  }>({ state: 'idle', message: '' });
  const [nextVoucherNumber, setNextVoucherNumber] = useState<number>(1000);
  const [logoUrl, setLogoUrl] = useState('');
  const [sloganUrl, setSloganUrl] = useState('');
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [printCopies, setPrintCopies] = useState<number>(2);
  const [pdfMargins, setPdfMargins] = useState({ top: 20, bottom: 20, left: 40, right: 40 });
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | null, msg: string }>({ type: null, msg: '' });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'app'), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setNextVoucherNumber(data.nextVoucherNumber || 1000);
        setLogoUrl(data.logoUrl || '');
        setSloganUrl(data.sloganUrl || '');
        setWelcomeMessage(data.welcomeMessage || '');
        setPrintCopies(data.printCopies || 2);
        if (data.pdfMargins) setPdfMargins(data.pdfMargins);
      }
    }, (err) => handleFirestoreError(err, OperationType.GET, 'settings/app'));
    return unsub;
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatus({ type: null, msg: '' });

    try {
      await updateDoc(doc(db, 'settings', 'app'), {
        nextVoucherNumber,
        logoUrl,
        sloganUrl,
        welcomeMessage,
        printCopies,
        pdfMargins,
        updatedAt: new Date().toISOString()
      });
      setStatus({ type: 'success', msg: 'تم حفظ الإعدادات بنجاح' });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', msg: 'حدث خطأ أثناء حفظ الإعدادات' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 500) { // 500KB limit for base64 storage in Firestore
        setStatus({ type: 'error', msg: 'حجم الصورة كبير جداً (الحد الأقصى 500 كليو بايت)' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSloganFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 500) {
        setStatus({ type: 'error', msg: 'حجم الصورة كبير جداً (الحد الأقصى 500 كليو بايت)' });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSloganUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const exportAllDataAsJSON = async () => {
    try {
      const buses = await getDocs(collection(db, 'buses'));
      const vouchers = await getDocs(collection(db, 'vouchers'));
      const users = await getDocs(collection(db, 'app_users'));
      const settings = await getDocs(collection(db, 'settings'));

      const busesData = buses.docs.map(d => ({ id: d.id, ...d.data() }));
      const vouchersData = vouchers.docs.map(d => ({ id: d.id, ...d.data() }));
      const usersData = users.docs.map(d => ({ id: d.id, ...d.data() }));
      const settingsData = settings.docs.map(d => ({ id: d.id, ...d.data() }));

      const backup = {
        buses: busesData,
        vouchers: vouchersData,
        app_users: usersData,
        settings: settingsData,
        exportedAt: new Date().toISOString(),
        version: '2.6.0'
      };

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `dmtc_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (err: any) {
      console.error(err);
      alert('حدث خطأ أثناء تصدير البيانات: ' + err.message);
    }
  };

  const handleJsonFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileImportStatus({ state: 'running', message: 'جاري قراءة واستيراد ملف النسخة الاحتياطية...' });

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const backup = JSON.parse(content);

        if (!backup.buses && !backup.vouchers && !backup.app_users) {
          throw new Error('الملف غير صالح أو لا يحتوي على كائنات النسخ الاحتياطي لـ DMTC.');
        }

        let busesImported = 0;
        let vouchersImported = 0;
        let usersImported = 0;
        let settingsImported = 0;

        if (backup.settings && Array.isArray(backup.settings)) {
          for (const s of backup.settings) {
            const { id, ...data } = s;
            await setDoc(doc(db, 'settings', id), data);
            settingsImported++;
          }
        }

        if (backup.buses && Array.isArray(backup.buses)) {
          for (const b of backup.buses) {
            const { id, ...data } = b;
            await setDoc(doc(db, 'buses', id), data);
            busesImported++;
          }
        }

        if (backup.app_users && Array.isArray(backup.app_users)) {
          for (const u of backup.app_users) {
            const { id, ...data } = u;
            await setDoc(doc(db, 'app_users', id), data);
            usersImported++;
          }
        }

        if (backup.vouchers && Array.isArray(backup.vouchers)) {
          for (const v of backup.vouchers) {
            const { id, ...data } = v;
            await setDoc(doc(db, 'vouchers', id), data);
            vouchersImported++;
          }
        }

        setFileImportStatus({
          state: 'success',
          message: `تم استيراد النسخة الاحتياطية بنجاح! تم استيراد: ${busesImported} حافلة، ${vouchersImported} سند، ${usersImported} مستخدم، و ${settingsImported} إعداد.`
        });
      } catch (err: any) {
        console.error(err);
        setFileImportStatus({
          state: 'error',
          message: `فشل استيراد الملف: ${err.message || 'تنسيق الملف غير صالح.'}`
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 space-y-6" dir="rtl">
      {/* شريط العنوان والترويسة */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-5 rounded-[1.75rem] border border-slate-200/90 shadow-2xs relative overflow-hidden">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-blue-950 via-blue-700 to-amber-500"></div>
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 text-white rounded-2xl flex items-center justify-center shadow-sm">
            <Settings size={20} className="text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-extrabold text-slate-900">إعدادات النظام والتهيئة</h2>
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            </div>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">تخصيص الخيارات والطباعة والشعارات - درة المنورة</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-6">
        {/* قسم إعدادات التطبيق العامة */}
        <div className="bg-white rounded-[2rem] p-7 md:p-8 shadow-sm border border-slate-200/90 relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-blue-900 to-blue-600"></div>
          <div className="flex items-center gap-3.5 mb-7">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-700 border border-blue-200/80">
               <Settings size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900 leading-snug">إعدادات التطبيق العامة</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">تخصيص هوامش الطباعة والشعارات</p>
            </div>
          </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">رقم السند القادم</label>
              <div className="relative">
                <Printer className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="number"
                  required
                  value={nextVoucherNumber}
                  onChange={(e) => setNextVoucherNumber(parseInt(e.target.value) || 0)}
                  className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-2xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-900 tabular-nums"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1.5 mr-1 font-medium">سيتم تحديث هذا الرقم تلقائياً مع كل عملية تسجيل، يمكنك تعديله يدوياً هنا.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">رسالة الترحيب</label>
              <textarea
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="أدخل رسالة الترحيب التي تظهر للمستخدمين عند تسجيل الدخول..."
                className="w-full px-4 py-3.5 bg-slate-50/90 rounded-2xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold min-h-[100px] text-sm text-slate-900"
              />
              <p className="text-xs text-slate-500 mt-1.5 mr-1 font-medium">هذه الرسالة تظهر لجميع المستخدمين عند الدخول للتطبيق لأول مرة في الجلسة.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pb-6 border-b border-slate-100">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">عدد النسخ المطبوعة تلقائياً</label>
                <div className="relative">
                  <Printer className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="number"
                    value={printCopies}
                    min={1}
                    max={5}
                    onChange={(e) => setPrintCopies(parseInt(e.target.value) || 1)}
                    className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-2xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-900 tabular-nums"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-slate-500 font-medium">حدد عدد نسخ السند التي سيتم طباعتها تلقائياً عند الحفظ.</p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 mr-1">هوامش ملف الـ PDF (بكسل)</label>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <span className="block text-xs text-slate-600 mb-1.5 text-center font-bold">أعلى</span>
                  <input
                    type="number"
                    value={pdfMargins.top}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, top: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-3 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 outline-none transition-all font-bold text-xs tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-slate-600 mb-1.5 text-center font-bold">أسفل</span>
                  <input
                    type="number"
                    value={pdfMargins.bottom}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, bottom: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-3 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 outline-none transition-all font-bold text-xs tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-slate-600 mb-1.5 text-center font-bold">يمين (قليلاً)</span>
                  <input
                    type="number"
                    value={pdfMargins.right}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, right: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-3 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 outline-none transition-all font-bold text-xs tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-slate-600 mb-1.5 text-center font-bold">يسار (قليلاً)</span>
                  <input
                    type="number"
                    value={pdfMargins.left}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, left: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-3 bg-slate-50/90 rounded-xl focus:bg-white border border-slate-200/90 focus:border-blue-600 outline-none transition-all font-bold text-xs tabular-nums"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-500 font-medium">تحكم في المساحات الفارغة حول محتوى السند لضمان التوافق مع ورق الطابعة.</p>
            </div>

            {/* قسم شعار الشركة المعتمد */}
            <div className="p-6 bg-slate-50/90 rounded-2xl border border-slate-200/90 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                    <ImageIcon size={18} />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-slate-900">شعار شركة درة المنورة الرسمي</label>
                    <p className="text-xs text-slate-500 font-medium">يظهر في القائمة الجانبية، شاشات الدخول، وجميع كشوفات وسندات الـ PDF</p>
                  </div>
                </div>
                {logoUrl && (
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1">
                    <Check size={12} />
                    شعار مخصص معتمد
                  </span>
                )}
              </div>

              {/* معاينة الشعار الحالي */}
              <div className="p-5 bg-white rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-2xl border border-slate-200/80 p-2 flex items-center justify-center overflow-hidden">
                    {logoUrl ? (
                      <img 
                        src={logoUrl} 
                        alt="معاينة شعار الشركة" 
                        className="max-h-full max-w-full object-contain" 
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (!logoUrl.startsWith('data:')) {
                            setStatus({ type: 'error', msg: 'رابط الصورة غير صالح أو لا يمكن الوصول إليه' });
                          }
                        }}
                      />
                    ) : (
                      <div className="w-14 h-14 flex items-center justify-center">
                        <CompanyLogo size="100%" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-slate-900">{logoUrl ? 'شعار الشركة المرفوع' : 'الشعار الافتراضي للنظام'}</p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium">
                      {logoUrl ? 'تم ضبط الشعار بنجاح وسيتم اعتماده عبر كامل التطبيق فور الحفظ' : 'يمكنك رفع شعار مخصص بدقة عالية (PNG, JPG, SVG)'}
                    </p>
                  </div>
                </div>

                {logoUrl && (
                  <button 
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="px-3.5 py-2 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-bold transition-all border border-red-200 flex items-center gap-1.5 cursor-pointer shrink-0"
                    title="استعادة الشعار الافتراضي"
                  >
                    <span>استعادة الشعار الافتراضي</span>
                  </button>
                )}
              </div>

              {/* حقول رفع وتعيين الشعار */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    id="logo-upload"
                    className="hidden"
                  />
                  <label 
                    htmlFor="logo-upload"
                    className="w-full h-full py-3.5 px-4 bg-white rounded-xl border-2 border-dashed border-slate-300 hover:border-blue-600 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-center gap-2 group"
                  >
                    <Upload className="text-slate-400 group-hover:text-blue-700 transition-colors" size={18} />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-blue-800 transition-colors">رفع ملف صورة من جهازك</span>
                  </label>
                </div>

                <div className="relative">
                  <ImageIcon className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    type="url"
                    value={logoUrl.startsWith('data:') ? '' : logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="أو ضع رابط صورة مباشر (HTTPS)..."
                    className="w-full pr-10 pl-4 py-3.5 bg-white rounded-xl border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">صورة شعار (خدمة الحاج شرف لنا) (رابط أو ملف)</label>
              <div className="space-y-3">
                <div className="relative">
                  <ImageIcon className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="url"
                    value={sloganUrl.startsWith('data:') ? '' : sloganUrl}
                    onChange={(e) => setSloganUrl(e.target.value)}
                    placeholder="ضع رابط الصورة هنا (HTTPS)..."
                    className="w-full pr-12 pl-4 py-3.5 bg-slate-50/90 rounded-2xl focus:bg-white border border-slate-200/90 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-sm"
                  />
                </div>

                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleSloganFileChange}
                    id="slogan-upload"
                    className="hidden"
                  />
                  <label 
                    htmlFor="slogan-upload"
                    className="w-full py-5 bg-slate-50/90 rounded-2xl focus:bg-white border-2 border-dashed border-slate-300 hover:border-blue-600 hover:bg-blue-50/20 outline-none transition-all cursor-pointer flex flex-col items-center justify-center gap-2 group"
                  >
                    <div className="flex items-center gap-2">
                       <ImageIcon className="text-slate-400 group-hover:text-blue-700 transition-colors" size={22} />
                       <span className="text-xs font-bold text-slate-600 group-hover:text-blue-800 transition-colors">أو ارفع ملف من جهازك</span>
                    </div>
                  </label>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-1.5 mr-1 font-medium">يمكنك رفع صورة تصميم عبارة (خدمة الحاج شرف لنا) الخاصة بك لتظهر في الزاوية العلوية للسند.</p>
            </div>

            {sloganUrl && (
              <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200/80 flex flex-col items-center gap-4 relative">
                <button 
                  type="button"
                  onClick={() => setSloganUrl('')}
                  className="absolute left-4 top-4 w-8 h-8 bg-white text-slate-500 rounded-full flex items-center justify-center hover:text-red-600 hover:shadow-sm transition-all border border-slate-200"
                  title="إزالة شعار العبارة"
                >
                  <Settings size={14} className="rotate-45" />
                </button>
                <span className="text-xs font-bold text-slate-500">معاينة شعار العبارة الحالي</span>
                <img 
                  src={sloganUrl} 
                  alt="Slogan Preview" 
                  className="h-24 object-contain" 
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    if (!sloganUrl.startsWith('data:')) {
                      setStatus({ type: 'error', msg: 'رابط الصورة غير صالح أو لا يمكن الوصول إليه' });
                    }
                  }}
                />
              </div>
            )}
          </div>

          <div className="pt-2">
            {status.type && (
              <div className={`p-4 rounded-xl mb-5 text-sm font-bold flex items-center gap-2 ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {status.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-4 bg-gradient-to-l from-slate-900 via-blue-950 to-blue-800 text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-md disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} className="text-amber-400" />}
              حفظ الإعدادات
            </button>
          </div>
        </form>
        </div>

        {/* قسم النسخ الاحتياطي واستعادة البيانات */}
        <div className="bg-white rounded-[2rem] p-7 md:p-8 shadow-sm border border-slate-200/90 relative overflow-hidden" dir="rtl">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-amber-500 to-blue-700"></div>
          <div className="flex items-center gap-3.5 mb-6">
            <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-700 border border-amber-200/80">
               <Database size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-slate-900 leading-snug">النسخ الاحتياطي للبيانات</h3>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              </div>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">تصدير واستيراد نسخة احتياطية من قواعد البيانات</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={exportAllDataAsJSON}
              className="py-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Download size={16} className="text-blue-700" />
              تصدير نسخة احتياطية (JSON)
            </button>

            <label className="py-3.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-800 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer text-center">
              <Upload size={16} className="text-amber-600" />
              استيراد نسخة احتياطية
              <input
                type="file"
                accept=".json"
                onChange={handleJsonFileInput}
                className="hidden"
              />
            </label>
          </div>

          {fileImportStatus.state !== 'idle' && (
            <div className={`mt-4 p-4 rounded-xl text-xs font-bold leading-relaxed ${
              fileImportStatus.state === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
              fileImportStatus.state === 'running' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
              'bg-red-50 text-red-700 border border-red-200'
            }`}>
              <div className="flex items-center gap-2 font-bold">
                {fileImportStatus.state === 'running' && <Loader2 className="animate-spin" size={14} />}
                {fileImportStatus.state === 'success' && <Check size={14} />}
                {fileImportStatus.state === 'error' && <AlertCircle size={14} />}
                {fileImportStatus.message}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
