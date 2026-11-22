import React, { useRef } from 'react';
import {
  ShieldCheck,
  Zap,
  History,
  Cpu,
  ArrowRight,
  Sparkles,
  Bus,
  Building2,
  FileText,
  CheckCircle2,
  Calendar,
} from 'lucide-react';
import { motion } from 'motion/react';
import { CompanyLogo } from './CompanyLogo';

interface AboutAppProps {
  onBack?: () => void;
}

// ============================================================================
// قيم تجريبية قابلة للتعديل — يمكنك وضع أرقامك الحقيقية ونقاط التحديث هنا
// ============================================================================
const APP_STATS = [
  {
    id: 'buses',
    label: 'عدد الحافلات المسلّمة',
    value: '1,250+',
    icon: Bus,
  },
  {
    id: 'offices',
    label: 'عدد المكاتب',
    value: '45+',
    icon: Building2,
  },
  {
    id: 'vouchers',
    label: 'عدد السندات',
    value: '3,800+',
    icon: FileText,
  },
];

const WHATS_NEW_ITEMS = [
  'دعم كامل لإدارة موسم حج 1448هـ وفصله عن أرشيف موسم 1447هـ.',
  'إضافة رقم هوية المستلم واعتماد مسمى رقم المكتب في السندات.',
  'تحسين البحث الفوري وتوليد كشوفات وتقارير PDF رسمية للإدارة.',
  'تطوير واجهة الاستخدام ودعم التوافق السلس مع أجهزة الجوال.',
];

const TIMELINE_STEPS = [
  {
    year: '1447هـ',
    title: '1447: الانطلاقة الأولى',
    subtitle: 'تأسيس المنصة الرقمية الأولى لإصدار سندات استلام الحافلات.',
    isCurrent: false,
  },
  {
    year: '1448هـ',
    title: '1448: الإصدار 2.6.0',
    subtitle: 'تطوير شامل لتجربة التشغيل والتقارير اللحظية وإدارة المواسم.',
    isCurrent: true,
  },
];

export function AboutApp({ onBack }: AboutAppProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const handleBackToLogin = () => {
    if (onBack) {
      onBack();
      return;
    }

    // Search for the parent LoginScreen back button if rendered inside LoginScreen
    const buttons = Array.from(document.querySelectorAll('button'));
    const parentBackBtn = buttons.find(
      (btn) =>
        rootRef.current &&
        !rootRef.current.contains(btn) &&
        btn.textContent?.includes('العودة لتسجيل الدخول')
    );

    if (parentBackBtn) {
      parentBackBtn.click();
      return;
    }

    // Fallback when unauthenticated
    if (!localStorage.getItem('dmtc_session')) {
      window.location.reload();
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const features = [
    {
      icon: <Cpu className="w-6 h-6" />,
      title: 'تقنيات متقدمة',
      desc: 'قاعدة بيانات سحابية لحظية تضمن مزامنة البيانات بين جميع المستخدمين في آن واحد.',
      color: 'text-[var(--primary)]',
      bg: 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800',
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: 'حلول جذرية',
      desc: 'وداعاً لمشاكل ضياع السندات أو الأخطاء البشرية في الأرشفة الورقية التقليدية.',
      color: 'text-[var(--primary)]',
      bg: 'bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'سرعة وكفاءة',
      desc: 'واجهة مستخدم محسّنة تتيح إصدار السند في أقل من 5 ثوانٍ مع خيارات طباعة فورية.',
      color: 'text-[var(--gold)]',
      bg: 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800',
    },
    {
      icon: <History className="w-6 h-6" />,
      title: 'أرشيف متكامل',
      desc: 'إمكانية البحث والفلترة المتقدمة للوصول لأي سند سابق خلال أجزاء من الثانية.',
      color: 'text-[var(--gold)]',
      bg: 'bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800',
    },
  ];

  const scrollReveal = {
    initial: { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.15 },
    transition: { duration: 0.45, ease: 'easeOut' as const },
  };

  return (
    <div
      ref={rootRef}
      className="max-w-5xl mx-auto pb-[var(--space-12)] text-[var(--text)]"
      dir="rtl"
    >
      {/* Sticky Top Action Bar */}
      <div className="sticky top-[var(--space-3)] z-30 flex justify-start mb-[var(--space-6)]">
        <button
          type="button"
          onClick={handleBackToLogin}
          className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-2)] min-h-[44px] bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--primary)] text-[var(--primary)] rounded-2xl font-bold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          <ArrowRight size={17} className="text-[var(--gold)]" />
          <span>العودة لتسجيل الدخول</span>
        </button>
      </div>

      {/* Major Sections Container (--space-16 between major sections) */}
      <div className="flex flex-col gap-[var(--space-16)]">
        {/* Hero Section (--space-12 vertical padding) */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="bg-[var(--surface)] rounded-[2rem] px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-12)] shadow-sm border border-[var(--border)] relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-[var(--primary)]" />

          <div className="relative z-10 flex flex-col md:flex-row items-center gap-[var(--space-6)] lg:gap-[var(--space-8)]">
            <div className="flex-1 space-y-[var(--space-4)] text-center md:text-right">
              <div className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] bg-blue-50 dark:bg-blue-950/60 text-[var(--primary)] border border-blue-200/80 dark:border-blue-800 rounded-full text-xs font-extrabold">
                <Calendar size={14} className="text-[var(--gold)]" />
                <span>موسم حج 1448هـ</span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-[var(--text)] leading-snug max-w-xl mx-auto md:mx-0">
                نظام <span className="text-[var(--primary)]">DMTC</span> المتكامل لإدارة الأسطول والعمليات
              </h1>

              <p className="text-sm sm:text-base font-semibold text-[var(--text-secondary)] leading-relaxed max-w-2xl">
                منصة رقمية متطورة لإدارة العمليات اللوجستية لشركة{' '}
                <span className="text-[var(--primary)] font-extrabold">درة المنورة للنقل</span>، تحوّل الإجراءات الورقية إلى بيانات لحظية دقيقة تدعم سرعة الإنجاز.
              </p>

              {/* Badges in a Single Row (Flat Colors, No Decorative Dots) */}
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-[var(--space-2)] pt-[var(--space-1)]">
                <div className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--navy)] text-white rounded-xl font-bold text-xs whitespace-nowrap shadow-xs border border-slate-700/40">
                  الإصدار v2.6.0
                </div>
                <div className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--btn-primary)] text-white border border-[var(--btn-primary)] rounded-xl font-extrabold text-xs whitespace-nowrap shadow-xs">
                  <span>موسم حج 1448هـ</span>
                </div>
                <div className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] rounded-xl font-bold text-xs whitespace-nowrap">
                  موسم حج 1447هـ
                </div>
              </div>
            </div>

            <div className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 shrink-0">
              <div className="absolute inset-0 bg-[var(--navy)] rounded-[2.25rem] rotate-6 shadow-lg ring-2 ring-[var(--gold)]/35" />
              <div className="absolute inset-0 bg-white rounded-[2.25rem] -rotate-2 flex items-center justify-center p-[var(--space-5)] transition-transform hover:rotate-0 duration-500 shadow-md overflow-hidden border border-[var(--border)]">
                <CompanyLogo size="100%" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Strip */}
        <motion.div
          {...scrollReveal}
          className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-6)]"
        >
          {APP_STATS.map((stat) => {
            const IconComponent = stat.icon;
            return (
              <div
                key={stat.id}
                className="bg-[var(--surface)] rounded-2xl p-[var(--space-4)] lg:p-[var(--space-8)] border border-[var(--border)] shadow-2xs flex items-center gap-[var(--space-4)]"
              >
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/70 dark:border-blue-800 flex items-center justify-center shrink-0">
                  <IconComponent size={22} className="text-[var(--gold)]" />
                </div>
                <div>
                  <p className="text-2xl sm:text-3xl font-black text-[var(--primary)] tabular-nums leading-tight">
                    {stat.value}
                  </p>
                  <p className="text-xs font-bold text-[var(--text-secondary)] mt-[var(--space-1)]">{stat.label}</p>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Features Grid */}
        <motion.div
          {...scrollReveal}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[var(--space-6)]"
        >
          {features.map((feature, idx) => (
            <motion.div
              key={idx}
              whileHover={{ y: -4 }}
              className="group bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-8)] rounded-[1.75rem] border border-[var(--border)] shadow-2xs hover:shadow-md transition-all duration-300"
            >
              <div
                className={`w-12 h-12 ${feature.bg} ${feature.color} rounded-2xl flex items-center justify-center mb-[var(--space-4)] group-hover:scale-105 transition-transform duration-300`}
              >
                {feature.icon}
              </div>
              <h3 className="text-base font-extrabold text-[var(--text)] mb-[var(--space-2)]">{feature.title}</h3>
              <p className="text-sm text-[var(--text-secondary)] font-medium leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* What's New in v2.6.0 & Simple Timeline */}
        <motion.div
          {...scrollReveal}
          className="grid grid-cols-1 lg:grid-cols-5 gap-[var(--space-6)] items-stretch"
        >
          {/* What's New Card */}
          <div className="lg:col-span-3 bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] border border-[var(--border)] shadow-2xs">
            <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-5)]">
              <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-[var(--gold)] flex items-center justify-center shrink-0 border border-amber-200/70 dark:border-amber-800">
                <Sparkles size={18} />
              </div>
              <h2 className="text-lg font-black text-[var(--text)]">ما الجديد في الإصدار 2.6.0</h2>
            </div>

            <ul className="space-y-[var(--space-3)]">
              {WHATS_NEW_ITEMS.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-[var(--space-3)] p-[var(--space-3)] rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)]"
                >
                  <CheckCircle2 size={18} className="text-[var(--primary)] shrink-0 mt-[var(--space-1)]" />
                  <span className="text-sm font-semibold text-[var(--text)] leading-relaxed">{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Simple Timeline Card */}
          <div className="lg:col-span-2 bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] border border-[var(--border)] shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-5)]">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[var(--primary)] flex items-center justify-center shrink-0 border border-blue-200/70 dark:border-blue-800">
                  <History size={18} />
                </div>
                <h2 className="text-lg font-black text-[var(--text)]">مسيرة التطوير</h2>
              </div>

              <div className="relative pr-[var(--space-6)] space-y-[var(--space-6)] before:content-[''] before:absolute before:right-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--border)]">
                {TIMELINE_STEPS.map((step, idx) => (
                  <div key={idx} className="relative">
                    <span
                      className={`absolute -right-6 top-1.5 w-5 h-5 rounded-full border-4 border-[var(--surface)] shadow-xs ${
                        step.isCurrent ? 'bg-[var(--gold)]' : 'bg-[var(--text-muted)]'
                      }`}
                    />
                    <div
                      className={`p-[var(--space-4)] rounded-2xl border ${
                        step.isCurrent
                          ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
                          : 'bg-[var(--surface-subtle)] border-[var(--border)]'
                      }`}
                    >
                      <p
                        className={`text-sm font-black mb-[var(--space-1)] ${
                          step.isCurrent ? 'text-[var(--primary)]' : 'text-[var(--text)]'
                        }`}
                      >
                        {step.title}
                      </p>
                      <p className="text-xs font-semibold text-[var(--text-secondary)] leading-relaxed">
                        {step.subtitle}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quote & Leadership Section */}
        <motion.div
          {...scrollReveal}
          className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-6)] items-stretch"
        >
          {/* Quote Card (Flat Navy #0F172A + Gold Accents) */}
          <div className="md:col-span-2 bg-[var(--navy)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] text-white relative overflow-hidden flex flex-col justify-between border border-blue-900/60">
            <div className="relative z-10">
              <p className="text-xs font-extrabold text-amber-300 mb-[var(--space-4)]">رؤية ورسالة أحمد</p>
              <p className="text-xl sm:text-2xl leading-[1.85] text-white font-light">
                "هدفنا ليس بناء تطبيق فحسب، بل ابتكار تجربة رقمية تمنح أعمالنا اليومية دقةً وكفاءةً ومتعةً أعلى. شهد موسم حج 1447هـ انطلاقتنا الأولى التي تخطينا فيها التحديات بشغف وإصرار، لنعود بتحديثات متطورة تحوّل كل تجربة سابقة إلى نجاح قادم يخدم عملنا بفاعلية."
              </p>
            </div>

            <div className="relative z-10 flex items-center gap-[var(--space-4)] mt-[var(--space-6)] pt-[var(--space-5)] border-t border-white/15">
              <div className="w-12 h-12 rounded-2xl bg-[var(--gold)] text-[#0F172A] flex items-center justify-center text-2xl font-black shadow-sm shrink-0">
                أ
              </div>
              <div className="space-y-[var(--space-1)]">
                <p className="text-base font-extrabold text-white">أحمد عبد الجليل</p>
                <p className="text-xs font-semibold text-amber-200">مهندس الحلول الرقمية</p>
              </div>
            </div>
          </div>

          {/* Owner & Operations Management Dark Card */}
          <div className="bg-[var(--navy)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] text-white flex flex-col justify-between text-center relative overflow-hidden border border-slate-800">
            <div className="relative z-10">
              <p className="text-xs font-extrabold text-slate-200 mb-[var(--space-4)]">الجهة المالكة</p>
              <div className="space-y-[var(--space-1)]">
                <h4 className="text-xl font-black text-white">درة المنورة</h4>
                <p className="text-sm font-semibold text-slate-300">للنقل اللوجستي</p>
              </div>
            </div>

            <div className="relative z-10 pt-[var(--space-6)] mt-[var(--space-6)] border-t border-slate-700/80 space-y-[var(--space-3)]">
              <div>
                <p className="text-xs font-bold text-amber-300 mb-[var(--space-1)]">مدير التشغيل العام</p>
                <p className="text-base font-extrabold text-white">الأستاذ عبد الحميد سالمة</p>
              </div>
              <div className="pt-[var(--space-1)] flex items-center justify-center gap-[var(--space-3)] tabular-nums">
                <span className="text-slate-300 font-bold text-sm">1447هـ</span>
                <span className="text-slate-400 font-bold">←</span>
                <span className="text-amber-300 font-black text-lg">1448هـ</span>
              </div>
              <p className="text-xs font-bold text-slate-200 pt-[var(--space-1)]">فريق عمليات درة المنورة</p>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div {...scrollReveal} className="text-center pt-[var(--space-2)]">
          <div className="inline-flex flex-wrap items-center justify-center gap-[var(--space-2)] text-[var(--text)] font-bold text-xs px-[var(--space-5)] py-[var(--space-3)] bg-[var(--surface)] border border-[var(--border)] rounded-full shadow-2xs">
            <span>موسم حج 1448هـ • بنية سحابية • اتصال مشفّر</span>
          </div>
          <p className="mt-[var(--space-4)] text-xs font-bold text-[var(--text-secondary)]">
            جميع الحقوق البرمجية والتصميمية محفوظة لشركة درة المنورة للنقل • موسم حج 1448هـ
          </p>
        </motion.div>
      </div>
    </div>
  );
}
