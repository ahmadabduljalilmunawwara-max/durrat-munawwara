import React from 'react';
import { Info, ShieldCheck, Zap, History, Cpu, Globe, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { CompanyLogo } from './CompanyLogo';

export function AboutApp() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1
    }
  };

  const features = [
    {
      icon: <Cpu className="w-6 h-6" />,
      title: 'تقنيات متقدمة',
      desc: 'قاعدة بيانات سحابية لحظية تضمن مزامنة البيانات بين جميع المستخدمين في آن واحد.',
      color: 'text-blue-600',
      bg: 'bg-blue-50/50'
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: 'حلول جذرية',
      desc: 'وداعاً لمشاكل ضياع السندات أو الاخطاء البشرية في الأرشفة الورقية التقليدية.',
      color: 'text-indigo-600',
      bg: 'bg-indigo-50/50'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'سرعة وكفاءة',
      desc: 'واجهة مستخدم محسنة تتيح إصدار السند في أقل من 5 ثوانٍ مع خيارات طباعة فورية.',
      color: 'text-amber-600',
      bg: 'bg-amber-50/50'
    },
    {
      icon: <History className="w-6 h-6" />,
      title: 'أرشيف متكامل',
      desc: 'إمكانية البحث والفلترة المتقدمة للوصول لأي سند سابق خلال أجزاء من الثانية.',
      color: 'text-green-600',
      bg: 'bg-green-50/50'
    }
  ];

  return (
    <motion.div 
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto space-y-12 pb-20" 
      dir="rtl"
    >
      {/* Hero Section */}
      <motion.div 
        variants={itemVariants}
        className="bg-white rounded-[3rem] p-8 md:p-16 shadow-2xl shadow-slate-200/50 border border-slate-100 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-indigo-50/40 rounded-full -mr-80 -mt-80 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-50/40 rounded-full -ml-40 -mb-40 blur-3xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1 space-y-8 text-center md:text-right">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest">
              <Globe size={14} />
              Digital Transformation 2026
            </div>
            
            <h1 className="text-4xl md:text-6xl font-black text-slate-900 leading-tight">
              نظام <span className="text-indigo-600">DMTC</span> المتكامل <br/>
              لإدارة الأسطول والعمليات
            </h1>
            
            <p className="text-lg md:text-xl font-bold text-slate-600 leading-relaxed max-w-2xl">
              ثورة رقمية في إدارة العمليات اللوجستية لشركة <span className="text-blue-600">درة المنورة للنقل</span>. 
              نحول التعقيد إلى بساطة، والورق إلى بيانات ذكية لحظية تخدم رؤيتكم المستقبلية.
            </p>

            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-4">
              <div className="px-6 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm flex items-center gap-2 shadow-lg shadow-slate-200">
                إصدار v2.6.0
              </div>
              <div className="px-5 py-3 bg-blue-50 border border-blue-200 text-blue-900 rounded-2xl font-black text-sm flex items-center gap-2 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                <span>موسم حج 1448 هـ</span>
              </div>
              <div className="px-5 py-3 bg-white border border-slate-200 text-slate-500 rounded-2xl font-bold text-sm">
                موسم حج 1447 هـ
              </div>
            </div>
          </div>
          
          <div className="relative w-48 h-48 md:w-64 md:h-64 shrink-0">
            <div className="absolute inset-0 bg-indigo-600 rounded-[3rem] rotate-6 shadow-2xl shadow-indigo-200"></div>
            <div className="absolute inset-0 bg-white rounded-[3rem] -rotate-3 flex items-center justify-center p-6 transition-transform hover:rotate-0 duration-500 shadow-xl overflow-hidden border border-slate-50">
              <CompanyLogo size="100%" />
            </div>
          </div>
        </div>
      </motion.div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {features.map((feature, idx) => (
          <motion.div
            key={idx}
            variants={itemVariants}
            whileHover={{ y: -5 }}
            className="group bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-xl hover:shadow-indigo-50 transition-all duration-300"
          >
            <div className={`w-14 h-14 ${feature.bg} ${feature.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
              {feature.icon}
            </div>
            <h3 className="text-lg font-black text-slate-900 mb-3">{feature.title}</h3>
            <p className="text-sm text-slate-500 font-bold leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Developer Section */}
      <motion.div 
        variants={itemVariants}
        className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch"
      >
        <div className="md:col-span-2 bg-indigo-600 rounded-[3rem] p-10 text-white relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-2xl"></div>
          
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-100 mb-4 opacity-80">رؤية ورسالة أحمد</p>
            <p className="text-lg md:text-2xl font-arabic-elegant leading-[1.7] opacity-100 drop-shadow-sm font-medium">
              "هدفنا ليس بناء تطبيق فحسب، بل ابتكار تجربة رقمية تمنح أعمالنا اليومية دقةً وكفاءةً ومتعةً أعلى. شهد موسم حج 1447 هـ انطلاقتنا الأولى التي تخطينا فيها التحديات بشغف وإصرار، لنعود بتحديثات متطورة تحوّل كل تجربة سابقة إلى نجاح قادم يخدم عملنا بفاعلية."
            </p>
            <p className="text-sm md:text-base font-arabic-elegant leading-relaxed opacity-95 mt-4 text-indigo-100 bg-white/10 p-4 rounded-2xl border border-white/15">
              صُنع بحب بواسطة فريق التشغيل، تحت الإشراف المباشر للأستاذ عبد الحميد سالمة، مدير التشغيل العام.
            </p>
          </div>

          <div className="relative z-10 flex items-center gap-5 mt-10">
            <div className="w-16 h-16 rounded-[1.25rem] bg-white/10 backdrop-blur-xl flex items-center justify-center text-3xl font-arabic-elegant font-black text-white border border-white/20 shadow-inner">أ</div>
            <div className="space-y-1">
              <p className="text-xl font-black text-white tracking-wide">أحمد عبد الجليل</p>
              <p className="text-sm font-medium text-indigo-100/70 tracking-tight">Digital Solutions Architect</p>
            </div>
          </div>
        </div>

        <div className="bg-slate-900 rounded-[3rem] p-10 text-white flex flex-col justify-between text-center relative group overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          
          <div className="relative z-10">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-6">الجهة المالكة</p>
            <div className="space-y-2">
              <h4 className="text-xl font-black">درة المنورة</h4>
              <p className="text-sm font-bold text-slate-400">للنقل اللوجستي</p>
            </div>
          </div>

          <div className="relative z-10 pt-8 border-t border-slate-800 space-y-2">
            <div>
              <p className="text-[10px] font-black uppercase text-amber-400">مدير التشغيل العام</p>
              <p className="text-base font-black text-white">الأستاذ عبد الحميد سالمة</p>
            </div>
            <div className="pt-2 flex flex-col items-center justify-center">
              <p className="text-slate-400 font-bold text-base tracking-[0.2em] leading-tight opacity-75">1447</p>
              <p className="text-indigo-400 font-black text-2xl tracking-[0.2em] leading-tight">1448</p>
            </div>
            <p className="text-[9px] font-bold text-slate-500 uppercase">DMTC Logistic Team</p>
          </div>
        </div>
      </motion.div>

      {/* Footer */}
      <motion.div variants={itemVariants} className="text-center pt-8">
        <div className="inline-flex items-center gap-3 text-slate-300 font-bold text-[10px] uppercase tracking-[0.2em] px-6 py-2 border border-slate-100 rounded-full">
          <span>Security Verified</span>
          <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
          <span>Cloud Infrastructure</span>
          <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
          <span>Hajj Season 2026</span>
        </div>
        <p className="mt-8 text-[11px] font-bold text-slate-400">
          جميع الحقوق البرمجية والتصميمية محفوظة لشركة درة المنورة للنقل © 2026
        </p>
      </motion.div>
    </motion.div>
  );
}
