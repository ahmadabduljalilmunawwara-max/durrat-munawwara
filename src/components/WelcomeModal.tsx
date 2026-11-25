import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bus,
  ClipboardList,
  FileCheck2,
  FileDown,
  LayoutDashboard,
  Sparkles,
  X,
} from 'lucide-react';

interface FeatureItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBgClass: string;
}

const WELCOME_FEATURES: FeatureItem[] = [
  {
    title: 'سند أوضح وأكثر احترافية:',
    description:
      'تصميم جديد بصفحة A4 واحدة مع شعار الشركة ورمز QR للتحقق من صحة السند عبر munawwarahaj.xyz',
    icon: <FileCheck2 size={17} />,
    iconBgClass: 'bg-blue-50 dark:bg-blue-950/60 text-[var(--primary)] border border-blue-200/70 dark:border-blue-800/70',
  },
  {
    title: 'كشف مكتب أسرع:',
    description: 'يطابق السند الفردي ويُظهر رقم الاعتماد لكل حافلة',
    icon: <ClipboardList size={17} />,
    iconBgClass: 'bg-amber-50 dark:bg-amber-950/50 text-[var(--gold-text)] border border-amber-200/70 dark:border-amber-800/70',
  },
  {
    title: 'تصدير PDF أدق:',
    description: 'النص يُطبع بشكل سليم، مع خيار "تصدير بديل" ورابط فتح مباشر',
    icon: <FileDown size={17} />,
    iconBgClass: 'bg-emerald-50 dark:bg-emerald-950/50 text-[var(--success)] border border-emerald-200/70 dark:border-emerald-800/70',
  },
  {
    title: 'لوحة تحكم أبسط:',
    description: 'اختيار الموسم من قائمة (1448هـ افتراضيًا) وتنظيم أفضل للإحصائيات والسجل والأرشيف',
    icon: <LayoutDashboard size={17} />,
    iconBgClass: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400 border border-sky-200/70 dark:border-sky-800/70',
  },
  {
    title: 'إصدار أسهل:',
    description: 'حفظ تلقائي للمسودات وتنسيق أرقام الجوال وإدارة الحافلات والمستخدمين',
    icon: <Sparkles size={17} />,
    iconBgClass: 'bg-slate-100 dark:bg-slate-800 text-[var(--text)] border border-[var(--border)]',
  },
];

export interface WelcomeModalProps {
  isOpen: boolean;
  userName?: string | null;
  version: string;
  title?: string;
  message?: string;
  seasonLabel?: string;
  onClose: (dontShowAgain: boolean) => void;
}

export const WelcomeModal: React.FC<WelcomeModalProps> = ({
  isOpen,
  userName,
  version,
  title,
  message,
  seasonLabel,
  onClose,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const startBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dontShowAgainRef = useRef(dontShowAgain);
  const onCloseRef = useRef(onClose);

  dontShowAgainRef.current = dontShowAgain;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    setDontShowAgain(false);
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusTimer = window.setTimeout(() => {
      startBtnRef.current?.focus();
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current(dontShowAgainRef.current);
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const nodeList = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const focusable: HTMLElement[] = (Array.from(nodeList) as HTMLElement[]).filter(
          (el) => el.offsetParent !== null
        );

        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;

        if (e.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen]);

  const cleanName =
    userName?.trim() && userName.trim() !== 'Google User' ? userName.trim() : '';
  const defaultGreeting = cleanName ? `أهلاً ${cleanName} 👋` : 'أهلاً بك 👋';
  const resolvedTitle = title?.trim() || defaultGreeting;
  const resolvedSeason = (seasonLabel || '1448').trim().replace(/هـ/g, '');
  const resolvedMessage = message?.trim() || '';

  const handleClose = () => {
    onClose(dontShowAgain);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={handleClose}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-[var(--space-4)]"
          dir="rtl"
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="نافذة الترحيب والتحديثات الجديدة"
            aria-labelledby="welcome-modal-title"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--surface)] rounded-[2rem] max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-[var(--border)] relative text-right"
          >
            {/* Top Brand Accent Bar */}
            <div className="h-1.5 w-full bg-[var(--primary)] shrink-0" />

            {/* Modal Header */}
            <div className="px-[var(--space-4)] pt-[var(--space-4)] pb-[var(--space-3)] sm:px-[var(--space-6)] sm:pt-[var(--space-5)] sm:pb-[var(--space-4)] border-b border-[var(--border)] shrink-0 relative text-center">
              <button
                type="button"
                onClick={handleClose}
                aria-label="إغلاق نافذة الترحيب"
                className="absolute top-[var(--space-4)] left-[var(--space-4)] w-9 h-9 rounded-xl bg-[var(--surface-subtle)] hover:bg-slate-200 dark:hover:bg-slate-800 text-[var(--text-secondary)] flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>

              <div className="w-12 h-12 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 rounded-2xl flex items-center justify-center text-[var(--primary)] mx-auto mb-[var(--space-3)]">
                <Bus size={24} />
              </div>

              <h2
                id="welcome-modal-title"
                className="text-xl sm:text-2xl font-extrabold text-[var(--text)] mb-[var(--space-2)]"
              >
                {resolvedTitle}
              </h2>

              <div className="flex flex-wrap items-center justify-center gap-[var(--space-2)]">
                <p className="text-[var(--text-secondary)] font-semibold text-xs sm:text-sm">
                  نظام درة المنورة جاهز لموسم حج {resolvedSeason}هـ
                </p>
                <span
                  dir="ltr"
                  className="inline-flex items-center px-[var(--space-2)] py-0.5 rounded-md text-[11px] font-mono font-bold tabular-nums bg-blue-50 dark:bg-blue-950/60 text-[var(--primary)] border border-blue-200/80 dark:border-blue-800"
                >
                  {version}
                </span>
              </div>
            </div>

            {/* Scrollable Message & Features List */}
            <div className="flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-3)] sm:px-[var(--space-6)] sm:py-[var(--space-4)] space-y-[var(--space-2)]">
              {resolvedMessage && (
                <div className="p-[var(--space-4)] rounded-2xl bg-blue-50/70 dark:bg-blue-950/35 border border-blue-200/80 dark:border-blue-800/80 text-right mb-[var(--space-2)]">
                  <p className="text-xs sm:text-sm font-bold text-[var(--text)] leading-relaxed whitespace-pre-line">
                    {resolvedMessage}
                  </p>
                </div>
              )}

              {WELCOME_FEATURES.map((feature, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-[var(--space-3)] p-[var(--space-3)] rounded-2xl bg-[var(--surface-subtle)] border border-[var(--border)]"
                >
                  <div
                    aria-hidden="true"
                    className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${feature.iconBgClass}`}
                  >
                    {feature.icon}
                  </div>
                  <p className="flex-1 min-w-0 leading-relaxed text-right">
                    <span className="font-bold text-xs sm:text-sm text-[var(--text)]">
                      {feature.title}
                    </span>{' '}
                    <span className="text-xs text-[var(--text-secondary)] font-medium">
                      {feature.description}
                    </span>
                  </p>
                </div>
              ))}
            </div>

            {/* Pinned Modal Footer */}
            <div className="px-[var(--space-4)] py-[var(--space-3)] sm:px-[var(--space-6)] sm:py-[var(--space-4)] border-t border-[var(--border)] bg-[var(--surface)] shrink-0 flex flex-col gap-[var(--space-3)]">
              <label className="inline-flex items-center justify-center gap-[var(--space-2)] text-xs sm:text-sm font-semibold text-[var(--text-secondary)] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] accent-[var(--primary)] cursor-pointer"
                />
                <span>لا تُظهر هذه الرسالة مرة أخرى</span>
              </label>

              <button
                ref={startBtnRef}
                type="button"
                onClick={handleClose}
                className="w-full py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-bold text-sm sm:text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/30 transition-colors shadow-md cursor-pointer"
              >
                ابدأ العمل
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
