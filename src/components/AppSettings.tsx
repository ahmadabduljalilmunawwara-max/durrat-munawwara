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
    <div className="max-w-7xl mx-auto pb-[var(--space-12)] space-y-[var(--space-6)]" dir="rtl">
      {/* شريط العنوان والترويسة */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-[var(--space-4)] bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-8)] rounded-[1.75rem] border border-[var(--border)] shadow-2xs relative overflow-hidden">
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-[var(--primary)]"></div>
        <div className="flex items-center gap-[var(--space-4)]">
          <div className="w-11 h-11 bg-[var(--navy)] text-white rounded-2xl flex items-center justify-center shadow-sm">
            <Settings size={20} className="text-[var(--gold)]" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-[var(--text)]">إعدادات النظام والتهيئة</h2>
            <p className="text-xs text-[var(--text-secondary)] font-semibold mt-[var(--space-1)]">تخصيص الخيارات والطباعة والشعارات - درة المنورة</p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-[var(--space-6)]">
        {/* قسم إعدادات التطبيق العامة */}
        <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]"></div>
          <div className="flex items-center gap-[var(--space-4)] mb-[var(--space-6)]">
            <div className="w-10 h-10 bg-blue-50 dark:bg-blue-950/40 rounded-xl flex items-center justify-center text-[var(--primary)] border border-blue-200/80 dark:border-blue-800/70">
               <Settings size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--text)] leading-snug">إعدادات التطبيق العامة</h3>
              <p className="text-xs text-[var(--text-secondary)] font-semibold mt-[var(--space-1)]">تخصيص هوامش الطباعة والشعارات</p>
            </div>
          </div>

        <form onSubmit={handleSave} className="space-y-[var(--space-5)]">
          <div className="grid grid-cols-1 gap-[var(--space-5)]">
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">رقم السند القادم</label>
              <div className="relative">
                <Printer className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                <input
                  type="number"
                  required
                  value={nextVoucherNumber}
                  onChange={(e) => setNextVoucherNumber(parseInt(e.target.value) || 0)}
                  className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-2xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-[var(--text)] tabular-nums"
                />
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-[var(--space-2)] font-medium">سيتم تحديث هذا الرقم تلقائياً مع كل عملية تسجيل، يمكنك تعديله يدوياً هنا.</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">رسالة الترحيب</label>
              <textarea
                value={welcomeMessage}
                onChange={(e) => setWelcomeMessage(e.target.value)}
                placeholder="أدخل رسالة الترحيب التي تظهر للمستخدمين عند تسجيل الدخول..."
                className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-2xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold min-h-[100px] text-sm text-[var(--text)]"
              />
              <p className="text-xs text-[var(--text-secondary)] mt-[var(--space-2)] font-medium">هذه الرسالة تظهر لجميع المستخدمين عند الدخول للتطبيق لأول مرة في الجلسة.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-5)] pb-[var(--space-6)] border-b border-[var(--border)]">
              <div>
                <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">عدد النسخ المطبوعة تلقائياً</label>
                <div className="relative">
                  <Printer className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                  <input
                    type="number"
                    value={printCopies}
                    min={1}
                    max={5}
                    onChange={(e) => setPrintCopies(parseInt(e.target.value) || 1)}
                    className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-2xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-[var(--text)] tabular-nums"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-[var(--text-secondary)] font-medium">حدد عدد نسخ السند التي سيتم طباعتها تلقائياً عند الحفظ.</p>
              </div>
            </div>

            <div className="space-y-[var(--space-3)]">
              <label className="block text-xs font-bold text-[var(--text-secondary)]">هوامش ملف الـ PDF (بكسل)</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-5)]">
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">أعلى</span>
                  <input
                    type="number"
                    value={pdfMargins.top}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, top: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-bold text-xs text-[var(--text)] tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">أسفل</span>
                  <input
                    type="number"
                    value={pdfMargins.bottom}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, bottom: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-bold text-xs text-[var(--text)] tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">يمين (قليلاً)</span>
                  <input
                    type="number"
                    value={pdfMargins.right}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, right: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-bold text-xs text-[var(--text)] tabular-nums"
                  />
                </div>
                <div>
                  <span className="block text-xs text-[var(--text-secondary)] mb-[var(--space-2)] text-center font-bold">يسار (قليلاً)</span>
                  <input
                    type="number"
                    value={pdfMargins.left}
                    onChange={(e) => setPdfMargins({ ...pdfMargins, left: parseInt(e.target.value) || 0 })}
                    className="w-full text-center py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] outline-none transition-all font-bold text-xs text-[var(--text)] tabular-nums"
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)] font-medium">تحكم في المساحات الفارغة حول محتوى السند لضمان التوافق مع ورق الطابعة.</p>
            </div>

            {/* قسم شعار الشركة المعتمد */}
            <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] space-y-[var(--space-5)]">
              <div className="flex items-center justify-between gap-[var(--space-3)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/50 text-[var(--gold-text)] flex items-center justify-center font-bold">
                    <ImageIcon size={18} />
                  </div>
                  <div>
                    <label className="block text-xs font-extrabold text-[var(--text)]">شعار شركة درة المنورة الرسمي</label>
                    <p className="text-xs text-[var(--text-secondary)] font-medium">يظهر في القائمة الجانبية، شاشات الدخول، وجميع كشوفات وسندات الـ PDF</p>
                  </div>
                </div>
                {logoUrl && (
                  <span className="px-[var(--space-3)] py-[var(--space-1)] bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800/70 rounded-full text-xs font-bold flex items-center gap-[var(--space-1)]">
                    <Check size={12} />
                    شعار مخصص معتمد
                  </span>
                )}
              </div>

              {/* معاينة الشعار الحالي */}
              <div className="p-[var(--space-4)] lg:p-[var(--space-5)] bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-[var(--space-4)]">
                <div className="flex items-center gap-[var(--space-4)]">
                  <div className="w-20 h-20 bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] p-[var(--space-2)] flex items-center justify-center overflow-hidden">
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
                    <p className="text-xs font-extrabold text-[var(--text)]">{logoUrl ? 'شعار الشركة المرفوع' : 'الشعار الافتراضي للنظام'}</p>
                    <p className="text-xs text-[var(--text-secondary)] mt-[var(--space-1)] font-medium">
                      {logoUrl ? 'تم ضبط الشعار بنجاح وسيتم اعتماده عبر كامل التطبيق فور الحفظ' : 'يمكنك رفع شعار مخصص بدقة عالية (PNG, JPG, SVG)'}
                    </p>
                  </div>
                </div>

                {logoUrl && (
                  <button 
                    type="button"
                    onClick={() => setLogoUrl('')}
                    className="px-[var(--space-3)] py-[var(--space-2)] bg-red-50 dark:bg-red-950/40 text-[var(--danger)] hover:bg-red-100 dark:hover:bg-red-950/60 rounded-xl text-xs font-bold transition-all border border-red-200 dark:border-red-800/70 flex items-center gap-[var(--space-2)] cursor-pointer shrink-0"
                    title="استعادة الشعار الافتراضي"
                  >
                    <span>استعادة الشعار الافتراضي</span>
                  </button>
                )}
              </div>

              {/* حقول رفع وتعيين الشعار */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-5)]">
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
                    className="w-full h-full py-[var(--space-3)] px-[var(--space-4)] bg-[var(--surface)] rounded-xl border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all cursor-pointer flex items-center justify-center gap-[var(--space-2)] group"
                  >
                    <Upload className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" size={18} />
                    <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">رفع ملف صورة من جهازك</span>
                  </label>
                </div>

                <div className="relative">
                  <ImageIcon className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                  <input
                    type="url"
                    value={logoUrl.startsWith('data:') ? '' : logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="أو ضع رابط صورة مباشر (HTTPS)..."
                    className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface)] rounded-xl border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-xs text-[var(--text)]"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">صورة شعار (خدمة الحاج شرف لنا) (رابط أو ملف)</label>
              <div className="space-y-[var(--space-3)]">
                <div className="relative">
                  <ImageIcon className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                  <input
                    type="url"
                    value={sloganUrl.startsWith('data:') ? '' : sloganUrl}
                    onChange={(e) => setSloganUrl(e.target.value)}
                    placeholder="ضع رابط الصورة هنا (HTTPS)..."
                    className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-2xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-sm text-[var(--text)]"
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
                    className="w-full py-[var(--space-5)] bg-[var(--surface-subtle)] rounded-2xl focus:bg-[var(--surface)] border-2 border-dashed border-[var(--border)] hover:border-[var(--primary)] hover:bg-blue-50/20 dark:hover:bg-blue-950/20 outline-none transition-all cursor-pointer flex flex-col items-center justify-center gap-[var(--space-2)] group"
                  >
                    <div className="flex items-center gap-[var(--space-2)]">
                       <ImageIcon className="text-[var(--text-muted)] group-hover:text-[var(--primary)] transition-colors" size={22} />
                       <span className="text-xs font-bold text-[var(--text-secondary)] group-hover:text-[var(--primary)] transition-colors">أو ارفع ملف من جهازك</span>
                    </div>
                  </label>
                </div>
              </div>
              <p className="text-xs text-[var(--text-secondary)] mt-[var(--space-2)] font-medium">يمكنك رفع صورة تصميم عبارة (خدمة الحاج شرف لنا) الخاصة بك لتظهر في الزاوية العلوية للسند.</p>
            </div>

            {sloganUrl && (
              <div className="p-[var(--space-4)] lg:p-[var(--space-6)] bg-[var(--surface-subtle)] rounded-2xl border border-[var(--border)] flex flex-col items-center gap-[var(--space-4)] relative">
                <button 
                  type="button"
                  onClick={() => setSloganUrl('')}
                  className="absolute left-[var(--space-4)] top-[var(--space-4)] w-8 h-8 bg-[var(--surface)] text-[var(--text-secondary)] rounded-full flex items-center justify-center hover:text-[var(--danger)] hover:shadow-sm transition-all border border-[var(--border)]"
                  title="إزالة شعار العبارة"
                >
                  <Settings size={14} className="rotate-45" />
                </button>
                <span className="text-xs font-bold text-[var(--text-secondary)]">معاينة شعار العبارة الحالي</span>
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

          <div className="pt-[var(--space-2)]">
            {status.type && (
              <div className={`p-[var(--space-4)] rounded-xl mb-[var(--space-5)] text-sm font-bold flex items-center gap-[var(--space-2)] ${
                status.type === 'success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800/70'
                  : 'bg-red-50 dark:bg-red-950/40 text-[var(--danger)] border border-red-200 dark:border-red-800/70'
              }`}>
                {status.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={isSaving}
              className="w-full py-[var(--space-4)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-bold text-sm flex items-center justify-center gap-[var(--space-2)] transition-all shadow-md disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} className="text-[var(--gold)]" />}
              حفظ الإعدادات
            </button>
          </div>
        </form>
        </div>

        {/* قسم النسخ الاحتياطي واستعادة البيانات */}
        <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] relative overflow-hidden" dir="rtl">
          <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--gold)]"></div>
          <div className="flex items-center gap-[var(--space-4)] mb-[var(--space-6)]">
            <div className="w-10 h-10 bg-amber-50 dark:bg-amber-950/40 rounded-xl flex items-center justify-center text-[var(--gold-text)] border border-amber-200/80 dark:border-amber-800/70">
               <Database size={20} />
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[var(--text)] leading-snug">النسخ الاحتياطي للبيانات</h3>
              <p className="text-xs text-[var(--text-secondary)] font-semibold mt-[var(--space-1)]">تصدير واستيراد نسخة احتياطية من قواعد البيانات</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-4)]">
            <button
              type="button"
              onClick={exportAllDataAsJSON}
              className="py-[var(--space-3)] bg-[var(--surface-subtle)] hover:bg-blue-50/40 dark:hover:bg-blue-950/30 border border-[var(--border)] text-[var(--text)] rounded-xl font-bold text-xs flex items-center justify-center gap-[var(--space-2)] transition-all cursor-pointer"
            >
              <Download size={16} className="text-[var(--primary)]" />
              تصدير نسخة احتياطية (JSON)
            </button>

            <label className="py-[var(--space-3)] bg-[var(--surface-subtle)] hover:bg-amber-50/40 dark:hover:bg-amber-950/30 border border-[var(--border)] text-[var(--text)] rounded-xl font-bold text-xs flex items-center justify-center gap-[var(--space-2)] transition-all cursor-pointer text-center">
              <Upload size={16} className="text-[var(--gold-text)]" />
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
            <div className={`mt-[var(--space-4)] p-[var(--space-4)] rounded-xl text-xs font-bold leading-relaxed ${
              fileImportStatus.state === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800/70' :
              fileImportStatus.state === 'running' ? 'bg-blue-50 dark:bg-blue-950/40 text-[var(--primary)] border border-blue-200 dark:border-blue-800/70' :
              'bg-red-50 dark:bg-red-950/40 text-[var(--danger)] border border-red-200 dark:border-red-800/70'
            }`}>
              <div className="flex items-center gap-[var(--space-2)] font-bold">
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
