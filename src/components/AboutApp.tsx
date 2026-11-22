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
      color: 'text-[#1e3a8a]',
      bg: 'bg-[#1e3a8a]/10 border border-[#1e3a8a]/20',
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: 'حلول جذرية',
      desc: 'وداعاً لمشاكل ضياع السندات أو الأخطاء البشرية في الأرشفة الورقية التقليدية.',
      color: 'text-[#1e3a8a]',
      bg: 'bg-[#1e3a8a]/10 border border-[#1e3a8a]/20',
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'سرعة وكفاءة',
      desc: 'واجهة مستخدم محسّنة تتيح إصدار السند في أقل من 5 ثوانٍ مع خيارات طباعة فورية.',
      color: 'text-[#d97706]',
      bg: 'bg-[#d97706]/10 border border-[#d97706]/25',
    },
    {
      icon: <History className="w-6 h-6" />,
      title: 'أرشيف متكامل',
      desc: 'إمكانية البحث والفلترة المتقدمة للوصول لأي سند سابق خلال أجزاء من الثانية.',
      color: 'text-[#d97706]',
      bg: 'bg-[#d97706]/10 border border-[#d97706]/25',
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
      className="max-w-5xl mx-auto space-y-6 sm:space-y-8 pb-12"
      dir="rtl"
    >
      {/* Sticky Top Action Bar */}
      <div className="sticky top-3 z-30 flex justify-start">
        <button
          type="button"
          onClick={handleBackToLogin}
          className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] bg-white/95 backdrop-blur-md border border-slate-200 hover:border-[#1e3a8a]/40 text-[#1e3a8a] rounded-2xl font-bold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
        >
          <ArrowRight size={17} className="text-[#d97706]" />
          <span>العودة لتسجيل الدخول</span>
        </button>
      </div>

      {/* Hero Section */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="bg-white rounded-[2rem] p-6 sm:p-8 md:p-9 shadow-sm border border-slate-200/90 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-[#1e3a8a] via-[#1e40af] to-[#d97706]" />

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-7 md:gap-9">
          <div className="flex-1 space-y-4 text-center md:text-right">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#1e3a8a]/10 text-[#1e3a8a] border border-[#1e3a8a]/20 rounded-full text-xs font-extrabold">
              <Calendar size={14} className="text-[#d97706]" />
              <span>موسم حج 1448هـ</span>
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 leading-snug max-w-xl mx-auto md:mx-0">
              نظام <span className="text-[#1e3a8a]">DMTC</span> المتكامل لإدارة الأسطول والعمليات
            </h1>

            <p className="text-sm sm:text-base font-semibold text-slate-700 leading-relaxed max-w-2xl">
              منصة رقمية متطورة لإدارة العمليات اللوجستية لشركة{' '}
              <span className="text-[#1e3a8a] font-extrabold">درة المنورة للنقل</span>، تحوّل الإجراءات الورقية إلى بيانات لحظية دقيقة تدعم سرعة الإنجاز.
            </p>

            {/* Badges in a Single Row */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
              <div className="px-3.5 py-2 bg-[#0f172a] text-white rounded-xl font-bold text-xs whitespace-nowrap shadow-xs">
                الإصدار v2.6.0
              </div>
              <div className="px-3.5 py-2 bg-[#1e3a8a] text-white border border-[#1e3a8a] rounded-xl font-extrabold text-xs whitespace-nowrap flex items-center gap-2 shadow-sm">
                <span className="w-2 h-2 rounded-full bg-[#d97706] shrink-0" />
                <span>موسم حج 1448هـ</span>
              </div>
              <div className="px-3.5 py-2 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs whitespace-nowrap">
                موسم حج 1447هـ
              </div>
            </div>
          </div>

          <div className="relative w-36 h-36 sm:w-44 sm:h-44 md:w-48 md:h-48 shrink-0">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a8a] to-[#0f172a] rounded-[2.25rem] rotate-6 shadow-lg ring-2 ring-[#d97706]/30" />
            <div className="absolute inset-0 bg-white rounded-[2.25rem] -rotate-2 flex items-center justify-center p-5 transition-transform hover:rotate-0 duration-500 shadow-md overflow-hidden border border-slate-200">
              <CompanyLogo size="100%" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Strip */}
      <motion.div
        {...scrollReveal}
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        {APP_STATS.map((stat) => {
          const IconComponent = stat.icon;
          return (
            <div
              key={stat.id}
              className="bg-white rounded-2xl p-5 border border-slate-200/90 shadow-2xs flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-[#1e3a8a]/10 border border-[#1e3a8a]/15 flex items-center justify-center text-[#1e3a8a] shrink-0">
                <IconComponent size={22} className="text-[#d97706]" />
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-black text-[#1e3a8a] tabular-nums leading-tight">
                  {stat.value}
                </p>
                <p className="text-xs font-bold text-slate-700 mt-0.5">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </motion.div>

      {/* Features Grid */}
      <motion.div
        {...scrollReveal}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5"
      >
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            whileHover={{ y: -4 }}
            className="group bg-white p-6 rounded-[1.75rem] border border-slate-200/90 shadow-2xs hover:shadow-md transition-all duration-300"
          >
            <div
              className={`w-12 h-12 ${feature.bg} ${feature.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform duration-300`}
            >
              {feature.icon}
            </div>
            <h3 className="text-base font-extrabold text-slate-900 mb-2">{feature.title}</h3>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </motion.div>

      {/* What's New in v2.6.0 & Simple Timeline */}
      <motion.div
        {...scrollReveal}
        className="grid grid-cols-1 lg:grid-cols-5 gap-5 items-stretch"
      >
        {/* What's New Card */}
        <div className="lg:col-span-3 bg-white rounded-[2rem] p-6 sm:p-7 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center gap-2.5 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#d97706]/15 text-[#d97706] flex items-center justify-center shrink-0">
              <Sparkles size={18} />
            </div>
            <h2 className="text-lg font-black text-slate-900">ما الجديد في الإصدار 2.6.0</h2>
          </div>

          <ul className="space-y-3">
            {WHATS_NEW_ITEMS.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100"
              >
                <CheckCircle2 size={18} className="text-[#1e3a8a] shrink-0 mt-0.5" />
                <span className="text-sm font-semibold text-slate-800 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Simple Timeline Card */}
        <div className="lg:col-span-2 bg-white rounded-[2rem] p-6 sm:p-7 border border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-[#1e3a8a]/10 text-[#1e3a8a] flex items-center justify-center shrink-0">
                <History size={18} />
              </div>
              <h2 className="text-lg font-black text-slate-900">مسيرة التطوير</h2>
            </div>

            <div className="relative pr-6 space-y-6 before:content-[''] before:absolute before:right-[9px] before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {TIMELINE_STEPS.map((step, idx) => (
                <div key={idx} className="relative">
                  <span
                    className={`absolute -right-6 top-1.5 w-5 h-5 rounded-full border-4 border-white shadow-xs ${
                      step.isCurrent ? 'bg-[#d97706]' : 'bg-slate-400'
                    }`}
                  />
                  <div
                    className={`p-4 rounded-2xl border ${
                      step.isCurrent
                        ? 'bg-[#1e3a8a]/5 border-[#1e3a8a]/25'
                        : 'bg-slate-50 border-slate-200/80'
                    }`}
                  >
                    <p
                      className={`text-sm font-black mb-1 ${
                        step.isCurrent ? 'text-[#1e3a8a]' : 'text-slate-700'
                      }`}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs font-semibold text-slate-700 leading-relaxed">
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
        className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch"
      >
        {/* Quote Card (Navy #1e3a8a + Gold #d97706, Primary Font, Large Light Text) */}
        <div className="md:col-span-2 bg-gradient-to-br from-[#0f172a] via-[#1e3a8a] to-[#172554] rounded-[2rem] p-7 sm:p-9 text-white relative overflow-hidden flex flex-col justify-between border border-[#1e3a8a]">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#d97706]/10 rounded-full -mr-32 -mt-32 blur-2xl pointer-events-none" />

          <div className="relative z-10">
            <p className="text-xs font-extrabold text-[#fbbf24] mb-4">رؤية ورسالة أحمد</p>
            <p className="text-xl sm:text-2xl leading-[1.85] text-white font-light">
              "هدفنا ليس بناء تطبيق فحسب، بل ابتكار تجربة رقمية تمنح أعمالنا اليومية دقةً وكفاءةً ومتعةً أعلى. شهد موسم حج 1447هـ انطلاقتنا الأولى التي تخطينا فيها التحديات بشغف وإصرار، لنعود بتحديثات متطورة تحوّل كل تجربة سابقة إلى نجاح قادم يخدم عملنا بفاعلية."
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-4 mt-7 pt-5 border-t border-white/15">
            <div className="w-13 h-13 rounded-2xl bg-[#d97706] text-white flex items-center justify-center text-2xl font-black shadow-sm shrink-0">
              أ
            </div>
            <div className="space-y-0.5">
              <p className="text-base font-extrabold text-white">أحمد عبد الجليل</p>
              <p className="text-xs font-semibold text-amber-200">مهندس الحلول الرقمية</p>
            </div>
          </div>
        </div>

        {/* Owner & Operations Management Dark Card */}
        <div className="bg-slate-900 rounded-[2rem] p-7 sm:p-8 text-white flex flex-col justify-between text-center relative overflow-hidden border border-slate-800">
          <div className="relative z-10">
            <p className="text-xs font-extrabold text-slate-200 mb-4">الجهة المالكة</p>
            <div className="space-y-1">
              <h4 className="text-xl font-black text-white">درة المنورة</h4>
              <p className="text-sm font-semibold text-slate-300">للنقل اللوجستي</p>
            </div>
          </div>

          <div className="relative z-10 pt-6 mt-6 border-t border-slate-700/80 space-y-3">
            <div>
              <p className="text-xs font-bold text-[#fbbf24] mb-1">مدير التشغيل العام</p>
              <p className="text-base font-extrabold text-white">الأستاذ عبد الحميد سالمة</p>
            </div>
            <div className="pt-1 flex items-center justify-center gap-3 tabular-nums">
              <span className="text-slate-300 font-bold text-sm">1447هـ</span>
              <span className="text-slate-500 font-bold">←</span>
              <span className="text-[#fbbf24] font-black text-lg">1448هـ</span>
            </div>
            <p className="text-xs font-bold text-slate-200 pt-1">فريق عمليات درة المنورة</p>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div {...scrollReveal} className="text-center pt-2">
        <div className="inline-flex flex-wrap items-center justify-center gap-2 text-slate-800 font-bold text-xs px-5 py-2.5 bg-white border border-slate-300 rounded-full shadow-2xs">
          <span>موسم حج 1448هـ • بنية سحابية • اتصال مشفّر</span>
        </div>
        <p className="mt-4 text-xs font-bold text-slate-700">
          جميع الحقوق البرمجية والتصميمية محفوظة لشركة درة المنورة للنقل • موسم حج 1448هـ
        </p>
      </motion.div>
    </div>
  );
}
