import React, { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import {
  User as LucideUser,
  Key,
  LogIn,
  Loader2,
  AlertCircle,
  ShieldCheck,
  CheckCircle2,
  Save,
  Info,
  Bus,
  Eye,
  EyeOff,
  Sun,
  Moon,
  X,
  HelpCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AboutApp } from './AboutApp';
import { CompanyLogo } from './CompanyLogo';

interface LoginScreenProps {
  onLogin: (user: any) => void;
  onGoogleLogin: () => void;
}

const THEME_STORAGE_KEY = 'dmtc_login_theme';
const REMEMBER_ME_KEY = 'dmtc_remember_me';
const REMEMBERED_USER_KEY = 'dmtc_remembered_username';

// ============================================================================
// روابط صور اللوحتين الجانبيتين (سهلة الاستبدال بصورك الخاصة)
// ============================================================================
const RIGHT_PANEL_IMAGES = [
  '/images/login/haram-1.jpg',
  '/images/login/haram-2.jpg',
  '/images/login/haram-3.jpg',
];

const LEFT_PANEL_IMAGES = [
  '/images/login/buses-1.jpg',
  '/images/login/buses-2.jpg',
  '/images/login/buses-3.jpg',
];

interface LoginSidePanelProps {
  images: string[];
  caption: string;
  isDark: boolean;
  enabled: boolean;
  className?: string;
}

function LoginSidePanel({ images, caption, isDark, enabled, className = '' }: LoginSidePanelProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!enabled || images.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [enabled, images.length]);

  if (!enabled) return null;

  return (
    <aside
      aria-label={caption}
      className={`w-full h-[80vh] max-h-[80vh] rounded-[24px] overflow-hidden relative shadow-xl border border-white/10 select-none bg-[#0f172a] ${className}`}
    >
      {/* Crossfading Lazy-Loaded Photos */}
      {images.map((src, idx) => (
        <img
          key={src}
          src={src}
          alt={caption}
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-1000 ease-in-out ${
            idx === activeIndex ? 'opacity-100 scale-100' : 'opacity-0 scale-[1.02]'
          } ${isDark ? 'brightness-75' : 'brightness-95'}`}
        />
      ))}

      {/* Navy 35% Semi-Transparent Overlay + Bottom Contrast Gradient */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[#1e3a8a]/35 pointer-events-none"
      />
      <div
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none ${
          isDark
            ? 'bg-gradient-to-t from-[#020617]/90 via-[#0f172a]/30 to-[#0f172a]/20'
            : 'bg-gradient-to-t from-[#0f172a]/85 via-[#1e3a8a]/15 to-transparent'
        }`}
      />

      {/* Bottom Caption & Slide Indicators */}
      <div className="absolute inset-x-0 bottom-0 p-[var(--space-6)] z-10 flex flex-col items-start gap-[var(--space-3)]">
        <p className="font-display text-white text-xl xl:text-2xl font-black leading-snug drop-shadow-md">
          {caption}
        </p>

        {/* Small Indicator Dots */}
        <div className="flex items-center gap-[var(--space-2)]" role="tablist" aria-label="اختيار الصورة">
          {images.map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveIndex(idx)}
              aria-label={`الصورة ${idx + 1}`}
              aria-selected={idx === activeIndex}
              className={`h-1.5 rounded-full transition-all duration-500 cursor-pointer ${
                idx === activeIndex
                  ? 'w-6 bg-amber-400'
                  : 'w-2 bg-white/50 hover:bg-white/80'
              }`}
            />
          ))}
        </div>
      </div>
    </aside>
  );
}

function isNetworkOrOfflineError(err: any): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();
  return (
    code === 'unavailable' ||
    code === 'auth/network-request-failed' ||
    message.includes('offline') ||
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('unavailable')
  );
}

export function LoginScreen({ onLogin, onGoogleLogin }: LoginScreenProps) {
  // Theme state: saved choice in localStorage, otherwise follow device preference
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  // Login form states
  const [username, setUsername] = useState<string>(() => {
    try {
      const remembered = localStorage.getItem(REMEMBER_ME_KEY) === 'true';
      return remembered ? localStorage.getItem(REMEMBERED_USER_KEY) || '' : '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState<boolean>(() => {
    try {
      return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);

  // Field-level and form-level error states
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [formError, setFormError] = useState('');
  const [shakeCount, setShakeCount] = useState(0);

  const [isLoading, setIsLoading] = useState(false);
  const [appLogo, setAppLogo] = useState('');

  // Password change & registration states
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [pendingUser, setPendingUser] = useState<any>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Forgot password modal states
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotNote, setForgotNote] = useState('');
  const [forgotStatus, setForgotStatus] = useState<{ type: 'success' | 'error' | null; msg: string }>({
    type: null,
    msg: '',
  });
  const [isSendingForgot, setIsSendingForgot] = useState(false);

  // Breakpoints for lazy loading side-panel images:
  // >= 1024px (lg): Right panel (Haram) visible
  // >= 1280px (xl): Both Right & Left panels visible
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 1024px)').matches;
  });
  const [isXlDesktop, setIsXlDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(min-width: 1280px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mqDesktop = window.matchMedia('(min-width: 1024px)');
    const mqXl = window.matchMedia('(min-width: 1280px)');
    const handleDesktopChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    const handleXlChange = (e: MediaQueryListEvent) => setIsXlDesktop(e.matches);
    setIsDesktop(mqDesktop.matches);
    setIsXlDesktop(mqXl.matches);
    mqDesktop.addEventListener('change', handleDesktopChange);
    mqXl.addEventListener('change', handleXlChange);
    return () => {
      mqDesktop.removeEventListener('change', handleDesktopChange);
      mqXl.removeEventListener('change', handleXlChange);
    };
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', isDark);
    }
  }, [isDark]);

  // Sync with OS theme changes if user hasn't manually chosen one
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (!saved) {
          setIsDark(e.matches);
        }
      } catch {
        setIsDark(e.matches);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  };

  const triggerShake = () => {
    setShakeCount((prev) => prev + 1);
  };

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        if (snap.exists()) {
          setAppLogo(snap.data().logoUrl || '');
        }
      },
      (err) => {
        // Do not crash login screen if offline or settings read fails
        console.warn('Settings fetch warning:', err);
      }
    );
    return unsub;
  }, []);

  const handleRememberMeToggle = (checked: boolean) => {
    setRememberMe(checked);
    try {
      if (checked) {
        localStorage.setItem(REMEMBER_ME_KEY, 'true');
        if (username.trim()) {
          localStorage.setItem(REMEMBERED_USER_KEY, username.trim());
        }
      } else {
        localStorage.removeItem(REMEMBER_ME_KEY);
        localStorage.removeItem(REMEMBERED_USER_KEY);
      }
    } catch {
      // ignore storage errors
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!regUsername.trim() || !regDisplayName.trim() || !regPassword.trim()) {
      setFormError('يرجى تعبئة جميع الحقول المطلوبة');
      triggerShake();
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFormError('تعذّر الاتصال، تحقق من الإنترنت');
      triggerShake();
      return;
    }

    setIsLoading(true);

    try {
      const normalized = regUsername.toLowerCase().trim();
      const userRef = doc(db, 'app_users', normalized);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        setFormError('اسم المستخدم هذا موجود مسبقاً');
        triggerShake();
        setIsLoading(false);
        return;
      }

      await setDoc(userRef, {
        username: normalized,
        displayName: regDisplayName.trim(),
        password: regPassword.trim(),
        role: 'pending',
        isCustom: true,
        createdAt: new Date().toISOString(),
      });

      setSuccessMessage('تم إرسال طلب الانضمام بنجاح. يرجى انتظار موافقة المسؤول.');
      setIsRegistering(false);
      setRegUsername('');
      setRegDisplayName('');
      setRegPassword('');
    } catch (err: any) {
      console.error(err);
      if (isNetworkOrOfflineError(err)) {
        setFormError('تعذّر الاتصال، تحقق من الإنترنت');
      } else {
        setFormError('حدث خطأ أثناء إرسال طلب الانضمام');
      }
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setUsernameError('');
    setPasswordError('');
    setFormError('');

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    let hasValidationError = false;
    if (!trimmedUser) {
      setUsernameError('أدخل اسم المستخدم');
      hasValidationError = true;
    }
    if (!trimmedPass) {
      setPasswordError('أدخل كلمة المرور');
      hasValidationError = true;
    }

    if (hasValidationError) {
      triggerShake();
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setFormError('تعذّر الاتصال، تحقق من الإنترنت');
      triggerShake();
      return;
    }

    setIsLoading(true);

    try {
      const normalizedInput = trimmedUser.toLowerCase();
      const userRef = doc(db, 'app_users', normalizedInput);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (String(userData.password || '').trim() === trimmedPass) {
          // Persist or clear remembered username
          try {
            if (rememberMe) {
              localStorage.setItem(REMEMBER_ME_KEY, 'true');
              localStorage.setItem(REMEMBERED_USER_KEY, trimmedUser);
            } else {
              localStorage.removeItem(REMEMBER_ME_KEY);
              localStorage.removeItem(REMEMBERED_USER_KEY);
            }
          } catch {
            // ignore storage errors
          }

          const sessionData = {
            uid: `custom_${normalizedInput}`,
            displayName: userData.displayName,
            role: userData.role || 'data_entry',
            username: userData.username,
            isCustom: true,
          };

          if (userData.forcePasswordChange) {
            setPendingUser({ ...sessionData, username: normalizedInput });
            setIsChangingPassword(true);
            setIsLoading(false);
            return;
          }

          const authResult = await signInAnonymously(auth);

          if (authResult.user) {
            localStorage.setItem('dmtc_session', JSON.stringify(sessionData));
            onLogin(sessionData);
          }
        } else {
          setFormError('اسم المستخدم أو كلمة المرور غير صحيحة');
          triggerShake();
        }
      } else {
        setFormError('اسم المستخدم أو كلمة المرور غير صحيحة');
        triggerShake();
      }
    } catch (err: any) {
      console.error(err);
      if (isNetworkOrOfflineError(err)) {
        setFormError('تعذّر الاتصال، تحقق من الإنترنت');
      } else if (err.code === 'auth/admin-restricted-operation' || err.message?.includes('admin-restricted-operation')) {
        setFormError(
          'خاصية تسجيل الدخول المجهول غير مفعلة في إعدادات Firebase. يرجى تفعيل Anonymous Auth من وحدة التحكم.'
        );
      } else if (err.code === 'permission-denied') {
        setFormError('تعذر الوصول إلى البيانات. يرجى المحاولة مرة أخرى.');
      } else {
        setFormError('تعذّر الاتصال، تحقق من الإنترنت');
      }
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!newPassword || !confirmPassword) {
      setFormError('أدخل كلمة المرور الجديدة وتأكيدها');
      triggerShake();
      return;
    }
    if (newPassword !== confirmPassword) {
      setFormError('كلمتا المرور غير متطابقتين');
      triggerShake();
      return;
    }
    if (newPassword.length < 6) {
      setFormError('يجب أن تكون كلمة المرور 6 أحرف على الأقل');
      triggerShake();
      return;
    }

    setIsLoading(true);

    try {
      const userRef = doc(db, 'app_users', pendingUser.username);
      await updateDoc(userRef, {
        password: newPassword.trim(),
        forcePasswordChange: false,
      });

      const authResult = await signInAnonymously(auth);
      if (authResult.user) {
        localStorage.setItem('dmtc_session', JSON.stringify(pendingUser));
        onLogin(pendingUser);
      }
    } catch (err: any) {
      console.error(err);
      if (isNetworkOrOfflineError(err)) {
        setFormError('تعذّر الاتصال، تحقق من الإنترنت');
      } else {
        setFormError('حدث خطأ أثناء تغيير كلمة المرور');
      }
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUser = forgotUsername.trim().toLowerCase();
    if (!targetUser) {
      setForgotStatus({ type: 'error', msg: 'أدخل اسم المستخدم أولاً' });
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setForgotStatus({ type: 'error', msg: 'تعذّر الاتصال، تحقق من الإنترنت' });
      return;
    }

    setIsSendingForgot(true);
    setForgotStatus({ type: null, msg: '' });

    try {
      const userRef = doc(db, 'app_users', targetUser);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        setForgotStatus({
          type: 'error',
          msg: 'اسم المستخدم غير مسجل، تأكد من كتابته بشكل صحيح أو تواصل مع المسؤول.',
        });
        setIsSendingForgot(false);
        return;
      }

      await updateDoc(userRef, {
        passwordResetRequested: true,
        passwordResetRequestedAt: new Date().toISOString(),
        ...(forgotNote.trim() ? { passwordResetNote: forgotNote.trim() } : {}),
      });

      setForgotStatus({
        type: 'success',
        msg: 'تم تسجيل طلب إعادة التعيين بنجاح. يرجى التواصل مع مسؤول النظام لتزويدك بكلمة مرور مؤقتة جديدة.',
      });
    } catch (err: any) {
      console.error(err);
      if (isNetworkOrOfflineError(err)) {
        setForgotStatus({ type: 'error', msg: 'تعذّر الاتصال، تحقق من الإنترنت' });
      } else {
        setForgotStatus({
          type: 'error',
          msg: 'تعذر إرسال الطلب حالياً. يرجى التواصل مباشرة مع مسؤول النظام.',
        });
      }
    } finally {
      setIsSendingForgot(false);
    }
  };

  const openForgotModal = () => {
    setForgotUsername(username.trim());
    setForgotNote('');
    setForgotStatus({ type: null, msg: '' });
    setShowForgotModal(true);
  };

  const hasCredentialsError = Boolean(formError);

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-[var(--space-4)] sm:p-[var(--space-6)] overflow-x-hidden transition-colors duration-300 bg-[var(--bg)] text-[var(--text)]"
      dir="rtl"
    >
      {/* Subtle Islamic Geometric Pattern Overlay (4-6% opacity) */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 pointer-events-none select-none ${
          isDark ? 'text-blue-200 opacity-[0.05]' : 'text-blue-950 opacity-[0.05]'
        }`}
      >
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern
              id="islamic-geometric-pattern"
              width="72"
              height="72"
              patternUnits="userSpaceOnUse"
            >
              {/* Octagram / 8-pointed Islamic star */}
              <rect
                x="14"
                y="14"
                width="44"
                height="44"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
              />
              <rect
                x="14"
                y="14"
                width="44"
                height="44"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                transform="rotate(45 36 36)"
              />
              <circle
                cx="36"
                cy="36"
                r="10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
              {/* Corner rosette connectors */}
              <path
                d="M0 36 L14 36 M58 36 L72 36 M36 0 L36 14 M36 58 L36 72"
                stroke="currentColor"
                strokeWidth="1"
              />
              <path
                d="M0 0 L14 14 M72 0 L58 14 M0 72 L14 58 M72 72 L58 58"
                stroke="currentColor"
                strokeWidth="0.9"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#islamic-geometric-pattern)" />
        </svg>
      </div>

      {/* Background Brand Ambient Auras */}
      <div
        aria-hidden="true"
        className={`absolute -top-32 -right-32 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
          isDark ? 'bg-amber-500/15' : 'bg-amber-200/35'
        }`}
      />
      <div
        aria-hidden="true"
        className={`absolute -bottom-32 -left-32 w-96 h-96 rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
          isDark ? 'bg-blue-600/20' : 'bg-blue-400/20'
        }`}
      />
      <div
        aria-hidden="true"
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] rounded-full blur-3xl pointer-events-none transition-colors duration-300 ${
          isDark ? 'bg-blue-700/15' : 'bg-blue-200/20'
        }`}
      />

      {/* Dark Mode Toggle Button in Corner */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
        title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
        className="fixed top-4 left-4 z-30 w-11 h-11 rounded-full flex items-center justify-center border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-subtle)] shadow-md transition-all cursor-pointer"
      >
        {isDark ? <Sun size={18} className="text-[var(--gold)]" /> : <Moon size={18} />}
      </button>

      {showAbout ? (
        <div className="w-full max-w-4xl relative z-10 pt-[var(--space-4)]">
          <AboutApp onBack={() => setShowAbout(false)} />
        </div>
      ) : (
        <div className="w-full max-w-[480px] lg:max-w-none mx-auto relative z-10 grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_minmax(440px,480px)] xl:grid-cols-[minmax(0,340px)_minmax(440px,480px)_minmax(0,340px)] lg:gap-[var(--space-8)] items-center justify-center">
          {/* Right Panel (RTL first column) - Haram / Masjid Nabawi (visible >= 1024px) */}
          <LoginSidePanel
            images={RIGHT_PANEL_IMAGES}
            caption="خدمة ضيوف الرحمن شرف لنا"
            isDark={isDark}
            enabled={isDesktop}
            className="hidden lg:block"
          />

          {/* Center Column: Login Card */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-[480px] mx-auto relative z-10 my-[var(--space-4)] lg:my-0"
          >
            <motion.div
              key={shakeCount}
              initial={shakeCount > 0 ? { x: 0 } : false}
              animate={shakeCount > 0 ? { x: [0, -10, 10, -7, 7, -3, 3, 0] } : { x: 0 }}
              transition={{ duration: 0.42 }}
              className={`w-full rounded-[2.25rem] shadow-2xl border overflow-hidden relative transition-colors duration-300 bg-[var(--surface)] border-[var(--border)] ${
              isDark ? 'shadow-black/50' : 'shadow-blue-900/10'
            }`}
          >
            {/* Top Brand Accent (Flat Primary Blue) */}
            <div className="h-1.5 w-full bg-[var(--primary)]" />

            {/* Seasonal Top Status Bar (14px) */}
            <div
              className="px-[var(--space-4)] lg:px-[var(--space-8)] py-[var(--space-3)] border-b border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] flex items-center justify-between gap-[var(--space-2)] text-[14px] font-bold transition-colors"
            >
              <span className="font-black text-[var(--primary)]">
                موسم حج 1448هـ
              </span>
              <span className="inline-flex items-center gap-[var(--space-2)]">
                <span className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse shrink-0" />
                <span className="text-[var(--success)]">
                  النظام يعمل بشكل طبيعي
                </span>
              </span>
            </div>

            <div className="p-[var(--space-4)] lg:p-[var(--space-8)]">
              <AnimatePresence mode="wait">
                {successMessage && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`p-[var(--space-5)] rounded-2xl text-center mb-[var(--space-6)] border ${
                      isDark
                        ? 'bg-emerald-950/50 border-emerald-800 text-emerald-200'
                        : 'bg-green-50 border-green-100 text-green-800'
                    }`}
                  >
                    <CheckCircle2 className="mx-auto text-emerald-500 mb-[var(--space-3)]" size={30} />
                    <p className="font-bold text-sm leading-relaxed">{successMessage}</p>
                    <button
                      type="button"
                      onClick={() => setSuccessMessage('')}
                      className="mt-[var(--space-3)] text-emerald-500 font-black text-xs hover:underline cursor-pointer"
                    >
                      إغلاق
                    </button>
                  </motion.div>
                )}

                {isRegistering ? (
                  <motion.div
                    key="register"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-center mb-[var(--space-6)]">
                      <div className="mb-[var(--space-4)] flex justify-center">
                        <div className="w-[132px] h-[132px] rounded-full bg-white shadow-[0_10px_30px_-8px_rgba(30,58,138,0.18)] flex items-center justify-center p-[var(--space-2)] overflow-hidden">
                          {appLogo ? (
                            <img
                              src={appLogo}
                              alt="درة المنورة للنقل"
                              className="w-[112px] h-[112px] object-contain select-none"
                            />
                          ) : (
                            <CompanyLogo size="112px" />
                          )}
                        </div>
                      </div>
                      <h1 className="text-[28px] leading-tight font-black mb-[var(--space-2)] tracking-tight text-[var(--text)]">
                        طلب حساب جديد
                      </h1>
                      <p className="text-[15px] font-bold text-[var(--text-secondary)]">
                        سيتم مراجعة طلبك من قبل المسؤول قبل التفعيل
                      </p>
                    </div>

                    <form onSubmit={handleRegister} noValidate className="space-y-[var(--space-5)]">
                      <div className="relative">
                        <LucideUser
                          className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]"
                          size={22}
                        />
                        <input
                          type="text"
                          required
                          autoComplete="username"
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          placeholder="اسم المستخدم (إنجليزي)"
                          value={regUsername}
                          onChange={(e) => {
                            setRegUsername(e.target.value);
                            if (formError) setFormError('');
                          }}
                          className="w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                        />
                      </div>

                      <div className="relative">
                        <Info
                          className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]"
                          size={22}
                        />
                        <input
                          type="text"
                          required
                          autoComplete="name"
                          placeholder="الاسم الكامل"
                          value={regDisplayName}
                          onChange={(e) => {
                            setRegDisplayName(e.target.value);
                            if (formError) setFormError('');
                          }}
                          className="w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                        />
                      </div>

                      <div className="relative">
                        <Key
                          className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]"
                          size={22}
                        />
                        <input
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          autoComplete="new-password"
                          placeholder="كلمة المرور"
                          value={regPassword}
                          onChange={(e) => {
                            setRegPassword(e.target.value);
                            if (formError) setFormError('');
                          }}
                          className="w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-12)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword((v) => !v)}
                          aria-label={showRegPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          className="absolute left-[var(--space-2)] top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-xl transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          {showRegPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                        </button>
                      </div>

                      {formError && (
                        <div
                          className={`p-[var(--space-3)] rounded-xl flex items-center gap-[var(--space-3)] text-sm font-black border ${
                            isDark
                              ? 'bg-red-950/60 border-red-800 text-[var(--danger)]'
                              : 'bg-red-50 border-red-200 text-[var(--danger)]'
                          }`}
                        >
                          <AlertCircle size={18} className="shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full min-h-[60px] h-[60px] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-black text-[17px] flex items-center justify-center gap-[var(--space-3)] transition-all shadow-lg shadow-blue-900/15 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="animate-spin" size={22} />
                            <span>جاري الإرسال...</span>
                          </>
                        ) : (
                          <>
                            <Save size={22} className="text-[var(--gold)]" />
                            <span>إرسال طلب التسجيل</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsRegistering(false);
                          setFormError('');
                        }}
                        className="w-full py-[var(--space-3)] font-bold transition-all text-[15px] cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text)]"
                      >
                        العودة لتسجيل الدخول
                      </button>
                    </form>
                  </motion.div>
                ) : !isChangingPassword ? (
                  <motion.div
                    key="login"
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 18 }}
                    transition={{ duration: 0.25 }}
                  >
                    {/* Header: White circular logo (112px) with soft shadow + Title (28px) with bus icon */}
                    <div className="text-center mb-[var(--space-6)]">
                      <div className="mb-[var(--space-5)] flex justify-center">
                        <div className="w-[132px] h-[132px] rounded-full bg-white shadow-[0_10px_30px_-8px_rgba(15,23,42,0.18)] flex items-center justify-center p-[var(--space-2)] overflow-hidden">
                          {appLogo ? (
                            <img
                              src={appLogo}
                              alt="درة المنورة للنقل"
                              className="w-[112px] h-[112px] object-contain select-none"
                            />
                          ) : (
                            <CompanyLogo size="112px" />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-[var(--space-3)] mb-[var(--space-2)]">
                        <h1 className="text-[28px] leading-tight font-black tracking-tight text-[var(--text)]">
                          درة المنورة للنقل
                        </h1>
                        <Bus
                          size={24}
                          className="text-[var(--gold)] shrink-0"
                          aria-hidden="true"
                        />
                      </div>
                      <p className="text-center text-[15px] font-bold tracking-wide text-[var(--primary)]">
                        نظام إدارة حركة الحافلات والعمليات
                      </p>
                    </div>

                    {/* Login Form (--space-5 between fields) */}
                    <form onSubmit={handleCustomLogin} noValidate className="space-y-[var(--space-5)]">
                      {/* Username Field (60px height, 17px text, 22px icon) */}
                      <div>
                        <div className="relative">
                          <LucideUser
                            className={`absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
                              usernameError || hasCredentialsError
                                ? 'text-[var(--danger)]'
                                : 'text-[var(--text-muted)]'
                            }`}
                            size={22}
                          />
                          <input
                            type="text"
                            name="username"
                            autoComplete="username"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder="اسم المستخدم"
                            value={username}
                            onChange={(e) => {
                              setUsername(e.target.value);
                              if (usernameError) setUsernameError('');
                              if (formError) setFormError('');
                            }}
                            aria-invalid={Boolean(usernameError || hasCredentialsError)}
                            className={`w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold placeholder:text-[var(--text-muted)] ${
                              usernameError || hasCredentialsError
                                ? isDark
                                  ? 'bg-red-950/25 border-red-500 text-white focus:ring-4 focus:ring-red-500/20'
                                  : 'bg-red-50/40 border-red-600 text-[var(--text)] focus:ring-4 focus:ring-red-500/15'
                                : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15'
                            }`}
                          />
                        </div>
                        {usernameError && (
                          <p className="mt-[var(--space-2)] flex items-center gap-[var(--space-2)] text-sm font-bold text-[var(--danger)]">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{usernameError}</span>
                          </p>
                        )}
                      </div>

                      {/* Password Field (60px height, 17px text, 22px icons) */}
                      <div>
                        <div className="relative">
                          <Key
                            className={`absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none transition-colors ${
                              passwordError || hasCredentialsError
                                ? 'text-[var(--danger)]'
                                : 'text-[var(--text-muted)]'
                            }`}
                            size={22}
                          />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            autoComplete="current-password"
                            placeholder="كلمة المرور"
                            value={password}
                            onChange={(e) => {
                              setPassword(e.target.value);
                              if (passwordError) setPasswordError('');
                              if (formError) setFormError('');
                            }}
                            aria-invalid={Boolean(passwordError || hasCredentialsError)}
                            className={`w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-12)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold placeholder:text-[var(--text-muted)] ${
                              passwordError || hasCredentialsError
                                ? isDark
                                  ? 'bg-red-950/25 border-red-500 text-white focus:ring-4 focus:ring-red-500/20'
                                  : 'bg-red-50/40 border-red-600 text-[var(--text)] focus:ring-4 focus:ring-red-500/15'
                                : 'bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                            className="absolute left-[var(--space-2)] top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-xl transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
                          >
                            {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                          </button>
                        </div>
                        {passwordError && (
                          <p className="mt-[var(--space-2)] flex items-center gap-[var(--space-2)] text-sm font-bold text-[var(--danger)]">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{passwordError}</span>
                          </p>
                        )}
                        {formError && (
                          <p className="mt-[var(--space-2)] flex items-center gap-[var(--space-2)] text-sm font-black text-[var(--danger)]">
                            <AlertCircle size={17} className="shrink-0" />
                            <span>{formError}</span>
                          </p>
                        )}
                      </div>

                      {/* Remember Me & Forgot Password Row (15px) */}
                      <div className="flex items-center justify-between gap-[var(--space-3)] px-[var(--space-1)]">
                        <label className="inline-flex items-center gap-[var(--space-3)] text-[15px] font-bold cursor-pointer select-none py-[var(--space-1)] text-[var(--text-secondary)]">
                          <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => handleRememberMeToggle(e.target.checked)}
                            className="w-[18px] h-[18px] rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)] cursor-pointer accent-[var(--primary)]"
                          />
                          <span>تذكرني</span>
                        </label>

                        <button
                          type="button"
                          onClick={openForgotModal}
                          className="text-[15px] font-bold hover:underline cursor-pointer py-[var(--space-1)] text-[var(--primary)]"
                        >
                          نسيت كلمة المرور؟
                        </button>
                      </div>

                      {/* Submit Button (60px height, 17px text, 22px icon) - ONLY gradient button in app */}
                      <button
                        type="submit"
                        disabled={isLoading}
                        aria-busy={isLoading}
                        className="w-full min-h-[60px] h-[60px] py-[var(--space-3)] bg-gradient-to-r from-[var(--primary)] to-[#1E3A8A] hover:from-[#1E40AF] hover:to-[#172554] text-white rounded-2xl font-black text-[17px] flex items-center justify-center gap-[var(--space-3)] transition-all shadow-xl shadow-blue-900/20 active:scale-[0.99] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="animate-spin" size={22} />
                            <span>جاري الدخول...</span>
                          </>
                        ) : (
                          <>
                            <LogIn size={22} className="text-[var(--gold)]" />
                            <span>تسجيل الدخول</span>
                          </>
                        )}
                      </button>
                    </form>

                    {/* Links Row (--space-6 from login button, --space-3 between links) */}
                    <div className="mt-[var(--space-6)] pt-[var(--space-4)] border-t border-[var(--border)] flex flex-wrap sm:flex-nowrap items-center justify-center gap-[var(--space-3)] text-[15px] font-bold">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError('');
                          setUsernameError('');
                          setPasswordError('');
                          setIsRegistering(true);
                        }}
                        className="whitespace-nowrap transition-colors cursor-pointer py-[var(--space-1)] text-[var(--text-secondary)] hover:text-[var(--primary)]"
                      >
                        ليس لديك حساب؟ اطلب الانضمام
                      </button>

                      <span
                        aria-hidden="true"
                        className="w-px h-4 shrink-0 bg-[var(--border)]"
                      />

                      <button
                        type="button"
                        onClick={() => setShowAbout(true)}
                        className="whitespace-nowrap transition-colors cursor-pointer py-[var(--space-1)] text-[var(--text-secondary)] hover:text-[var(--primary)]"
                      >
                        حول تطبيق درة المنورة
                      </button>
                    </div>

                    {/* Subtle Admin Login Link at Bottom (--space-3) */}
                    <div className="mt-[var(--space-3)] text-center">
                      <button
                        type="button"
                        onClick={onGoogleLogin}
                        className="inline-flex items-center gap-[var(--space-2)] text-[15px] font-bold px-[var(--space-3)] py-[var(--space-2)] rounded-xl transition-colors cursor-pointer text-[var(--text-secondary)] hover:text-[var(--primary)] hover:bg-[var(--surface-subtle)]"
                      >
                        <ShieldCheck size={17} className="text-[var(--primary)]" />
                        <span>دخول المسؤولين</span>
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="change-password"
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="text-center mt-[var(--space-1)] mb-[var(--space-6)]">
                      <div
                        className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-4)] border shadow-sm ${
                          isDark
                            ? 'bg-amber-950/50 border-amber-800 text-[var(--gold)]'
                            : 'bg-amber-50 border-amber-200 text-[var(--gold)]'
                        }`}
                      >
                        <Key size={28} />
                      </div>
                      <h1 className="text-[28px] leading-tight font-black mb-[var(--space-2)] tracking-tight text-[var(--text)]">
                        تغيير كلمة المرور
                      </h1>
                      <p className="text-[15px] font-bold text-[var(--text-secondary)]">
                        يجب عليك تغيير كلمة المرور المؤقتة قبل المتابعة
                      </p>
                    </div>

                    <form onSubmit={handlePasswordChange} noValidate className="space-y-[var(--space-5)]">
                      <div className="relative">
                        <Key
                          className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]"
                          size={22}
                        />
                        <input
                          type={showNewPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="كلمة المرور الجديدة"
                          value={newPassword}
                          onChange={(e) => {
                            setNewPassword(e.target.value);
                            if (formError) setFormError('');
                          }}
                          className="w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-12)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword((v) => !v)}
                          aria-label={showNewPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          className="absolute left-[var(--space-2)] top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-xl transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          {showNewPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                        </button>
                      </div>

                      <div className="relative">
                        <CheckCircle2
                          className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]"
                          size={22}
                        />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="تأكيد كلمة المرور"
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            if (formError) setFormError('');
                          }}
                          className="w-full min-h-[60px] h-[60px] pr-[var(--space-12)] pl-[var(--space-12)] py-[var(--space-3)] text-[17px] rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword((v) => !v)}
                          aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                          className="absolute left-[var(--space-2)] top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-xl transition-colors cursor-pointer text-[var(--text-muted)] hover:text-[var(--text)]"
                        >
                          {showConfirmPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                        </button>
                      </div>

                      {formError && (
                        <div
                          className={`p-[var(--space-3)] rounded-xl flex items-center gap-[var(--space-3)] text-sm font-black border ${
                            isDark
                              ? 'bg-red-950/60 border-red-800 text-[var(--danger)]'
                              : 'bg-red-50 border-red-200 text-[var(--danger)]'
                          }`}
                        >
                          <AlertCircle size={18} className="shrink-0" />
                          <span>{formError}</span>
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full min-h-[60px] h-[60px] py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-black text-[17px] flex items-center justify-center gap-[var(--space-3)] transition-all shadow-lg shadow-blue-900/15 disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="animate-spin" size={22} />
                            <span>جاري الحفظ...</span>
                          </>
                        ) : (
                          <>
                            <Save size={22} className="text-[var(--gold)]" />
                            <span>تأكيد التغيير</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingPassword(false);
                          setFormError('');
                        }}
                        className="w-full py-[var(--space-3)] font-bold transition-all text-[15px] cursor-pointer text-[var(--text-secondary)] hover:text-[var(--text)]"
                      >
                        إلغاء والعودة للخلف
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* High-Contrast Footer Credits (13px) */}
              <div className="mt-[var(--space-6)] pt-[var(--space-4)] border-t border-[var(--border)] flex justify-between items-center select-none">
                <span className="text-[13px] font-black uppercase tracking-widest text-[var(--primary)]">
                  DMTC TRANSPORT
                </span>
                <span className="text-[13px] font-bold text-[var(--text-secondary)]">
                  أحمد عبد الجليل
                </span>
              </div>
            </div>
          </motion.div>
        </motion.div>

          {/* Left Panel (RTL third column) - Hajj & Umrah Buses (visible >= 1280px only) */}
          <LoginSidePanel
            images={LEFT_PANEL_IMAGES}
            caption="أسطول جاهز لموسم حج 1448هـ"
            isDark={isDark}
            enabled={isXlDesktop}
            className="hidden xl:block"
          />
        </div>
      )}

      {/* Forgot Password Request Modal */}
      <AnimatePresence>
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-[var(--space-4)]" dir="rtl">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isSendingForgot && setShowForgotModal(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative z-10 w-full max-w-md rounded-3xl p-[var(--space-4)] lg:p-[var(--space-8)] border shadow-2xl bg-[var(--surface)] border-[var(--border)] text-[var(--text)]"
            >
              <div className="flex items-start justify-between gap-[var(--space-3)] mb-[var(--space-5)]">
                <div className="flex items-center gap-[var(--space-3)]">
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
                      isDark ? 'bg-amber-500/15 text-[var(--gold)]' : 'bg-amber-50 text-[var(--gold)]'
                    }`}
                  >
                    <HelpCircle size={22} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">إعادة تعيين كلمة المرور</h2>
                    <p className="text-xs font-bold text-[var(--text-secondary)]">
                      إرسال طلب للمسؤول لإصدار كلمة مرور مؤقتة
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !isSendingForgot && setShowForgotModal(false)}
                  aria-label="إغلاق"
                  className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors cursor-pointer bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text)]"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleForgotSubmit} noValidate className="space-y-[var(--space-5)]">
                <div>
                  <label className="block text-xs font-black mb-[var(--space-2)] text-[var(--text-secondary)]">
                    اسم المستخدم
                  </label>
                  <div className="relative">
                    <LucideUser
                      className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-muted)]"
                      size={18}
                    />
                    <input
                      type="text"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={forgotUsername}
                      onChange={(e) => {
                        setForgotUsername(e.target.value);
                        if (forgotStatus.type === 'error') setForgotStatus({ type: null, msg: '' });
                      }}
                      placeholder="أدخل اسم المستخدم الخاص بك"
                      className="w-full min-h-[56px] pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] text-base rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-black mb-[var(--space-2)] text-[var(--text-secondary)]">
                    ملاحظة أو رقم تواصل (اختياري)
                  </label>
                  <input
                    type="text"
                    value={forgotNote}
                    onChange={(e) => setForgotNote(e.target.value)}
                    placeholder="مثال: رقم الجوال للتواصل..."
                    className="w-full min-h-[56px] px-[var(--space-4)] py-[var(--space-3)] text-base rounded-2xl border outline-none transition-all font-bold bg-[var(--surface-subtle)] border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-muted)] focus:bg-[var(--surface)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/15"
                  />
                </div>

                {forgotStatus.type && (
                  <div
                    className={`p-[var(--space-3)] rounded-xl flex items-start gap-[var(--space-3)] text-xs font-bold leading-relaxed border ${
                      forgotStatus.type === 'success'
                        ? isDark
                          ? 'bg-emerald-950/60 border-emerald-800 text-[var(--success)]'
                          : 'bg-emerald-50 border-emerald-200 text-[var(--success)]'
                        : isDark
                        ? 'bg-red-950/60 border-red-800 text-[var(--danger)]'
                        : 'bg-red-50 border-red-200 text-[var(--danger)]'
                    }`}
                  >
                    {forgotStatus.type === 'success' ? (
                      <CheckCircle2 size={17} className="shrink-0 mt-[var(--space-1)] text-[var(--success)]" />
                    ) : (
                      <AlertCircle size={17} className="shrink-0 mt-[var(--space-1)] text-[var(--danger)]" />
                    )}
                    <span>{forgotStatus.msg}</span>
                  </div>
                )}

                <div className="flex gap-[var(--space-3)] pt-[var(--space-1)]">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    disabled={isSendingForgot}
                    className="min-h-[56px] px-[var(--space-5)] rounded-2xl font-bold text-sm transition-colors cursor-pointer bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text)]"
                  >
                    إغلاق
                  </button>
                  <button
                    type="submit"
                    disabled={isSendingForgot}
                    className="flex-1 min-h-[56px] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-black text-sm flex items-center justify-center gap-[var(--space-2)] transition-all shadow-lg shadow-blue-900/15 disabled:opacity-70 cursor-pointer"
                  >
                    {isSendingForgot ? (
                      <>
                        <Loader2 className="animate-spin" size={18} />
                        <span>جاري الإرسال...</span>
                      </>
                    ) : (
                      <span>إرسال الطلب للمسؤول</span>
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
