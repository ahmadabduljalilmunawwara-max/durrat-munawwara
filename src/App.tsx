/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp, where } from 'firebase/firestore';
import { format } from 'date-fns';
import {
  BusFront,
  ClipboardList,
  LayoutDashboard,
  Search,
  Settings,
  LogOut,
  Loader2,
  PlusCircle,
  AlertCircle,
  UserPlus,
  Bell,
  Info,
  Calendar,
  X,
  Menu,
  Sun,
  Moon,
  ChevronDown,
  PanelRightClose,
  PanelRightOpen,
  Wifi,
  WifiOff,
  CheckCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { VoucherEntry } from './components/VoucherEntry';
import { Dashboard } from './components/Dashboard';
import { VoucherSearch } from './components/VoucherSearch';
import { BusesManagement } from './components/BusesManagement';
import { UsersManagement } from './components/UsersManagement';
import { AppSettings } from './components/AppSettings';
import { LoginScreen } from './components/LoginScreen';
import { AboutApp } from './components/AboutApp';
import { CompanyLogo } from './components/CompanyLogo';
import { WelcomeModal } from './components/WelcomeModal';
import { PendingApproval } from './components/PendingApproval';
import { PWAUpdateBanner } from './components/PWAUpdateBanner';
import {
  flushVoucherDraftToSessionStorage,
  IDLE_LOGOUT_REASON_KEY,
  isAnyBusyActivity,
  subscribeBusyActivity,
} from './lib/activityTracker';
import {
  DEFAULT_ACTIVE_SEASON,
  DEFAULT_HIJRI_OFFSET_DAYS,
  DEFAULT_IDLE_TIMEOUT_MINUTES,
  DEFAULT_WELCOME_MESSAGE,
  DEFAULT_WELCOME_TITLE,
  formatHijriLongWithOffset,
  formatWelcomeTextWithName,
  normalizeActiveSeason,
  normalizeHijriOffsetDays,
  normalizeIdleTimeoutMinutes,
  WELCOME_MESSAGE_MAX_LENGTH,
} from './lib/printSettings';
import { resolveNewVoucherIssuerName } from './lib/issuerName';

// ============================================================================
// إعدادات الخمول والإصدار والمظهر
// ============================================================================
const IDLE_WARNING_SECONDS = 60;
const IDLE_BROADCAST_CHANNEL = 'dmtc_idle_session_channel';
const LAST_ACTIVITY_STORAGE_KEY = 'dmtc_last_activity_at';
const IDLE_TIMEOUT_MESSAGE = 'انتهت الجلسة لعدم النشاط';

const APP_VERSION = '2.6.0';
const CURRENT_VERSION_TAG = `v${APP_VERSION}`;
const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';
const THEME_STORAGE_KEY = 'dmtc_login_theme';

export type UserRole = 'general_manager' | 'supervisor' | 'data_entry' | 'pending' | 'rejected';

export interface AppUser {
  uid: string;
  displayName: string | null;
  receiptName?: string;
  email?: string | null;
  photoURL?: string | null;
  role: UserRole;
  username?: string;
  isCustom?: boolean;
  createdAt?: string;
}

type ActiveTab = 'entry' | 'dashboard' | 'search' | 'buses' | 'users' | 'settings' | 'about';

const PAGE_TITLES: Record<ActiveTab, string> = {
  entry: 'إصدار سند جديد',
  dashboard: 'لوحة التحكم',
  search: 'البحث والأرشيف',
  buses: 'إدارة الحافلات',
  users: 'إدارة المستخدمين',
  settings: 'إعدادات التطبيق',
  about: 'حول التطبيق',
};

const getRoleLabel = (role?: UserRole): string => {
  switch (role) {
    case 'general_manager':
      return 'المدير العام';
    case 'supervisor':
      return 'مشرف';
    case 'data_entry':
      return 'مدخل بيانات';
    case 'pending':
      return 'قيد المراجعة';
    case 'rejected':
      return 'مرفوض';
    default:
      return 'مستخدم';
  }
};

const toEnglishDigits = (str: string): string =>
  str
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

// Auth Provider
export const AuthContext = createContext<{ user: AppUser | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);

const getGregorianDate = () => {
  try {
    const formatted = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
    const normalized = toEnglishDigits(formatted);
    return normalized.includes('م') ? normalized : `${normalized} م`;
  } catch {
    try {
      const formatted = new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
      return `${toEnglishDigits(formatted)} م`;
    } catch {
      return `${format(new Date(), 'dd/MM/yyyy')} م`;
    }
  }
};

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialVoucherSearch, setInitialVoucherSearch] = useState<string>(() => {
    try {
      if (typeof window !== 'undefined') {
        return new URLSearchParams(window.location.search).get('voucher')?.trim() || '';
      }
    } catch {
      // ignore URL parse error
    }
    return '';
  });
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => (initialVoucherSearch ? 'search' : 'entry'));
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [lastNotification, setLastNotification] = useState<{ msg: string; id: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isEmailUnverified, setIsEmailUnverified] = useState(false);
  const dismissedWelcomeTokenRef = useRef<string | null>(null);

  // Dynamic app settings synced from Firestore settings/app
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState<number>(DEFAULT_IDLE_TIMEOUT_MINUTES);
  const idleTimeoutMinutesRef = useRef<number>(DEFAULT_IDLE_TIMEOUT_MINUTES);
  idleTimeoutMinutesRef.current = idleTimeoutMinutes;
  const [hijriOffsetDays, setHijriOffsetDays] = useState<number>(DEFAULT_HIJRI_OFFSET_DAYS);
  const [activeSeason, setActiveSeason] = useState<string>(DEFAULT_ACTIVE_SEASON);
  const [welcomeTitle, setWelcomeTitle] = useState<string>(DEFAULT_WELCOME_TITLE);
  const [welcomeMessage, setWelcomeMessage] = useState<string>(DEFAULT_WELCOME_MESSAGE);
  const [welcomeEnabled, setWelcomeEnabled] = useState<boolean>(true);
  const [welcomeExpiresAt, setWelcomeExpiresAt] = useState<string>('');
  const [welcomeVersion, setWelcomeVersion] = useState<number>(1);

  // Unsaved settings navigation guard
  const [hasUnsavedSettingsChanges, setHasUnsavedSettingsChanges] = useState(false);
  const [pendingTabTarget, setPendingTabTarget] = useState<ActiveTab | null>(null);

  // Shell UI states
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [idleWarningSeconds, setIdleWarningSeconds] = useState<number | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string>(() => {
    try {
      return sessionStorage.getItem(IDLE_LOGOUT_REASON_KEY) || '';
    } catch {
      return '';
    }
  });

  const notificationsMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const idleWarningSecondsRef = useRef<number | null>(null);
  idleWarningSecondsRef.current = idleWarningSeconds;
  const lastActivityRef = useRef<number>(Date.now());
  const idleChannelRef = useRef<BroadcastChannel | null>(null);
  const isLoggingOutIdleRef = useRef(false);

  // Sync Tailwind .dark class on <html> when logged in
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (user && isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [user, isDark]);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next ? 'dark' : 'light');
    } catch {
      // ignore storage errors
    }
  };

  // Monitor network connectivity
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Close topbar dropdowns on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsMenuRef.current && !notificationsMenuRef.current.contains(e.target as Node)) {
        setShowNotificationsMenu(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowNotificationsMenu(false);
        setShowUserMenu(false);
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, []);

  useEffect(() => {
    let profileUnsub: (() => void) | null = null;

    const cleanupProfileListener = () => {
      if (profileUnsub) {
        profileUnsub();
        profileUnsub = null;
      }
    };

    const authUnsub = onAuthStateChanged(auth, async (u) => {
      cleanupProfileListener();

      if (u) {
        if (u.isAnonymous) {
          setIsEmailUnverified(false);
          const savedSession = localStorage.getItem('dmtc_session');
          if (savedSession) {
            try {
              const parsedSession: AppUser = JSON.parse(savedSession);

              if (parsedSession?.username) {
                try {
                  await setDoc(doc(db, 'active_sessions', u.uid), {
                    username: parsedSession.username.toLowerCase().trim(),
                    uid: u.uid,
                    updatedAt: serverTimestamp(),
                  });
                } catch (err) {
                  console.warn('active_sessions sync warning:', err);
                }
              }

              setUser(parsedSession);

              if (parsedSession?.username) {
                const customUserRef = doc(db, 'app_users', parsedSession.username);
                profileUnsub = onSnapshot(
                  customUserRef,
                  (profileSnap) => {
                    if (profileSnap.exists()) {
                      const data = profileSnap.data();
                      const nextReceiptName =
                        typeof data.receiptName === 'string' ? data.receiptName.trim() : '';
                      setUser((prevUser) => {
                        if (!prevUser) return null;
                        const updated: AppUser = {
                          ...prevUser,
                          displayName: data.displayName || prevUser.displayName,
                          role: data.role || prevUser.role,
                          receiptName: nextReceiptName,
                        };
                        try {
                          localStorage.setItem('dmtc_session', JSON.stringify(updated));
                        } catch {
                          // ignore storage errors
                        }
                        return updated;
                      });
                    }
                  },
                  (error) => {
                    handleFirestoreError(error, OperationType.GET, 'app_users/' + parsedSession.username);
                  }
                );
              }
            } catch (e) {
              console.error('Failed to parse session', e);
              localStorage.removeItem('dmtc_session');
              auth.signOut();
              setUser(null);
            }
          } else {
            auth.signOut();
            setUser(null);
          }
        } else {
          const isGM = u.email === 'ahmad.abduljalilmunawwara@gmail.com';
          setIsEmailUnverified(!u.emailVerified);

          const userRef = doc(db, 'app_users', u.uid);
          const snap = await getDoc(userRef);

          let role: UserRole = 'pending';
          let displayName = u.displayName || 'Google User';
          let receiptName = '';
          let createdAt: string | undefined = u.metadata?.creationTime || undefined;

          if (snap.exists()) {
            const data = snap.data();
            role = data.role || 'pending';
            displayName = data.displayName || displayName;
            receiptName = typeof data.receiptName === 'string' ? data.receiptName.trim() : '';
            if (typeof data.createdAt === 'string') {
              createdAt = data.createdAt;
            } else if (data.createdAt && typeof data.createdAt.toDate === 'function') {
              createdAt = data.createdAt.toDate().toISOString();
            } else if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
              createdAt = data.updatedAt.toDate().toISOString();
            }
          } else {
            role = isGM ? 'general_manager' : 'pending';
            await setDoc(userRef, {
              uid: u.uid,
              email: u.email,
              displayName: displayName,
              photoURL: u.photoURL,
              role: role,
              isGoogle: true,
              updatedAt: serverTimestamp(),
            });
          }

          const googleUser: AppUser = {
            uid: u.uid,
            displayName: displayName,
            receiptName: receiptName,
            email: u.email,
            photoURL: u.photoURL,
            role: role,
            isCustom: false,
            createdAt,
          };
          setUser(googleUser);

          profileUnsub = onSnapshot(
            userRef,
            (profileSnap) => {
              if (profileSnap.exists()) {
                const data = profileSnap.data();
                const nextReceiptName =
                  typeof data.receiptName === 'string' ? data.receiptName.trim() : '';
                setUser((prevUser) => {
                  if (!prevUser) return null;
                  return {
                    ...prevUser,
                    displayName: data.displayName || prevUser.displayName,
                    role: data.role || prevUser.role,
                    receiptName: nextReceiptName,
                  };
                });
              }
            },
            (error) => {
              handleFirestoreError(error, OperationType.GET, 'app_users/' + u.uid);
            }
          );

          if (role === 'general_manager') {
            try {
              const settingsRef = doc(db, 'settings', 'app');
              const settingsSnap = await getDoc(settingsRef);
              if (!settingsSnap.exists()) {
                await setDoc(settingsRef, { nextVoucherNumber: 1001 });
              }
            } catch {
              // ignore non-critical bootstrap error
            }
          }
        }
      } else {
        setUser(null);
        localStorage.removeItem('dmtc_session');
      }
      setLoading(false);
    });

    return () => {
      cleanupProfileListener();
      authUnsub();
    };
  }, []);

  const markNotificationsAsRead = () => {
    if (!user) return;
    const now = new Date().toISOString();
    localStorage.setItem(`dmtc_last_seen_${user.uid}`, now);
    setUnreadCount(0);
  };

  useEffect(() => {
    if (!user) return;

    const lastSeen = localStorage.getItem(`dmtc_last_seen_${user.uid}`) || new Date(0).toISOString();

    const q = query(collection(db, 'vouchers'), orderBy('timestamp', 'desc'), limit(20));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        let count = 0;
        let latest: any = null;

        snapshot.docs.forEach((docSnap, idx) => {
          const data = docSnap.data();
          if (data.timestamp > lastSeen) {
            count++;
            if (idx === 0) latest = { ...data, id: docSnap.id };
          }
        });

        setUnreadCount(count);

        if (latest && latest.id !== localStorage.getItem('last_notified_id')) {
          setLastNotification({
            msg: `سند جديد: ${latest.busNumber} - ${latest.driverName}`,
            id: latest.id,
          });
          localStorage.setItem('last_notified_id', latest.id);

          setTimeout(() => setLastNotification(null), 8000);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'vouchers');
      }
    );

    return () => unsubscribe();
  }, [user]);

  // Listener for pending users (for admin)
  useEffect(() => {
    if (!user || user.role !== 'general_manager') return;

    const q = query(collection(db, 'app_users'), where('role', '==', 'pending'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setPendingUsersCount(snapshot.size);

        const lastPendingId = localStorage.getItem('last_notified_pending_id');
        const latestPending = snapshot.docs[0];

        if (latestPending && latestPending.id !== lastPendingId) {
          const data = latestPending.data();
          setLastNotification({
            msg: `مستخدم جديد بانتظار الموافقة: ${data.displayName || data.email}`,
            id: latestPending.id,
          });
          localStorage.setItem('last_notified_pending_id', latestPending.id);
          setTimeout(() => setLastNotification(null), 10000);
        }
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, 'app_users');
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'search' || activeTab === 'dashboard') {
      markNotificationsAsRead();
    }
  }, [activeTab]);

  // Subscribe to settings/app for global runtime configuration
  useEffect(() => {
    if (!user) {
      setSettingsLoaded(false);
      setIdleTimeoutMinutes(DEFAULT_IDLE_TIMEOUT_MINUTES);
      setHijriOffsetDays(DEFAULT_HIJRI_OFFSET_DAYS);
      setActiveSeason(DEFAULT_ACTIVE_SEASON);
      setWelcomeTitle(DEFAULT_WELCOME_TITLE);
      setWelcomeMessage(DEFAULT_WELCOME_MESSAGE);
      setWelcomeEnabled(true);
      setWelcomeExpiresAt('');
      setWelcomeVersion(1);
      return;
    }

    const unsubSettings = onSnapshot(
      doc(db, 'settings', 'app'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setIdleTimeoutMinutes(normalizeIdleTimeoutMinutes(data.idleTimeoutMinutes));
          setHijriOffsetDays(normalizeHijriOffsetDays(data.hijriOffsetDays));
          setActiveSeason(normalizeActiveSeason(data.activeSeason));
          setWelcomeTitle(
            typeof data.welcomeTitle === 'string' && data.welcomeTitle.trim()
              ? data.welcomeTitle.trim()
              : DEFAULT_WELCOME_TITLE
          );
          setWelcomeMessage(
            typeof data.welcomeMessage === 'string'
              ? data.welcomeMessage.slice(0, WELCOME_MESSAGE_MAX_LENGTH)
              : DEFAULT_WELCOME_MESSAGE
          );
          setWelcomeEnabled(data.welcomeEnabled !== false);
          setWelcomeExpiresAt(
            typeof data.welcomeExpiresAt === 'string' ? data.welcomeExpiresAt.trim() : ''
          );
          const parsedVer = Number(data.welcomeVersion);
          setWelcomeVersion(
            Number.isFinite(parsedVer) && parsedVer >= 1 ? Math.trunc(parsedVer) : 1
          );
        }
        setSettingsLoaded(true);
      },
      () => {
        setSettingsLoaded(true);
      }
    );

    return () => unsubSettings();
  }, [user?.uid]);

  // Show welcome modal once per (APP_VERSION + welcomeVersion) when enabled & not expired
  const welcomeSeenToken = `${CURRENT_VERSION_TAG}__wv_${welcomeVersion}`;

  useEffect(() => {
    if (!user) {
      dismissedWelcomeTokenRef.current = null;
      setShowWelcome(false);
      return;
    }
    if (loading || isEmailUnverified || !settingsLoaded) {
      setShowWelcome(false);
      return;
    }

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const isExpired = Boolean(welcomeExpiresAt && todayStr > welcomeExpiresAt);
    if (!welcomeEnabled || isExpired) {
      setShowWelcome(false);
      return;
    }

    if (dismissedWelcomeTokenRef.current === welcomeSeenToken) {
      return;
    }

    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem(LAST_SEEN_VERSION_KEY);
    } catch {
      lastSeen = null;
    }

    if (lastSeen !== welcomeSeenToken) {
      setShowWelcome(true);
    }
  }, [
    user,
    loading,
    isEmailUnverified,
    settingsLoaded,
    welcomeEnabled,
    welcomeExpiresAt,
    welcomeSeenToken,
  ]);

  const closeWelcome = (_dontShowAgain?: boolean) => {
    dismissedWelcomeTokenRef.current = welcomeSeenToken;
    try {
      localStorage.setItem(LAST_SEEN_VERSION_KEY, welcomeSeenToken);
    } catch {
      // ignore storage errors
    }
    setShowWelcome(false);
  };

  const clearSessionNotice = () => {
    setSessionNotice('');
    try {
      sessionStorage.removeItem(IDLE_LOGOUT_REASON_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const handleCustomLogin = (userData: any) => {
    clearSessionNotice();
    const session = { ...userData, isCustom: true };
    setUser(session);
    localStorage.setItem('dmtc_session', JSON.stringify(session));
  };

  const loginWithGoogle = () => {
    clearSessionNotice();
    return signInWithPopup(auth, googleProvider);
  };

  const logout = () => {
    auth.signOut();
    setUser(null);
    setIdleWarningSeconds(null);
    setShowUserMenu(false);
    setMobileMenuOpen(false);
    localStorage.removeItem('dmtc_session');
  };

  const performIdleLogout = (broadcastToOtherTabs: boolean) => {
    if (isLoggingOutIdleRef.current) return;
    isLoggingOutIdleRef.current = true;

    // 1. Save active voucher draft synchronously to sessionStorage before clearing session
    flushVoucherDraftToSessionStorage();

    // 2. Notify other tabs if this tab initiated the timeout
    if (broadcastToOtherTabs && idleChannelRef.current) {
      try {
        idleChannelRef.current.postMessage({ type: 'LOGOUT_IDLE', timestamp: Date.now() });
      } catch {
        // ignore channel errors
      }
    }

    // 3. Persist logout notice and return to LoginScreen
    try {
      sessionStorage.setItem(IDLE_LOGOUT_REASON_KEY, IDLE_TIMEOUT_MESSAGE);
    } catch {
      // ignore storage errors
    }
    setSessionNotice(IDLE_TIMEOUT_MESSAGE);
    logout();
  };

  const handleStayConnected = () => {
    const now = Date.now();
    lastActivityRef.current = now;
    setIdleWarningSeconds(null);
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
    } catch {
      // ignore storage errors
    }
    if (idleChannelRef.current) {
      try {
        idleChannelRef.current.postMessage({ type: 'KEEP_ALIVE', timestamp: now });
      } catch {
        // ignore channel errors
      }
    }
  };

  // Idle timeout monitor + multi-tab synchronization via BroadcastChannel
  useEffect(() => {
    if (!user || loading) {
      setIdleWarningSeconds(null);
      return;
    }

    isLoggingOutIdleRef.current = false;
    const warningMs = IDLE_WARNING_SECONDS * 1000;

    const nowInit = Date.now();
    lastActivityRef.current = nowInit;
    try {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(nowInit));
    } catch {
      // ignore storage errors
    }

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        channel = new BroadcastChannel(IDLE_BROADCAST_CHANNEL);
        idleChannelRef.current = channel;
      } catch {
        channel = null;
      }
    }

    let lastBroadcastAt = nowInit;

    const recordActivity = (forceBroadcast = false, explicitExtend = false) => {
      // While warning modal is open, passive events do not auto-dismiss it; user clicks "البقاء متصلاً"
      if (idleWarningSecondsRef.current !== null && !explicitExtend) {
        return;
      }

      const now = Date.now();
      if (!forceBroadcast && now - lastActivityRef.current < 1000) {
        return;
      }

      lastActivityRef.current = now;
      if (explicitExtend && idleWarningSecondsRef.current !== null) {
        setIdleWarningSeconds(null);
      }

      try {
        localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(now));
      } catch {
        // ignore storage errors
      }

      if (channel && (forceBroadcast || now - lastBroadcastAt >= 2000)) {
        lastBroadcastAt = now;
        try {
          channel.postMessage({
            type: explicitExtend ? 'KEEP_ALIVE' : 'ACTIVITY',
            timestamp: now,
          });
        } catch {
          // ignore channel errors
        }
      }
    };

    const handleUserActivityEvent = () => {
      recordActivity(false, false);
    };

    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        const msg = event.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'ACTIVITY' || msg.type === 'KEEP_ALIVE') {
          const ts = typeof msg.timestamp === 'number' ? msg.timestamp : Date.now();
          if (ts > lastActivityRef.current) {
            lastActivityRef.current = ts;
          }
          if (idleWarningSecondsRef.current !== null) {
            setIdleWarningSeconds(null);
          }
        } else if (msg.type === 'LOGOUT_IDLE') {
          performIdleLogout(false);
        }
      };
    }

    const activityEvents: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'touchstart',
      'scroll',
    ];
    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleUserActivityEvent, { passive: true, capture: true });
    });

    const unsubBusy = subscribeBusyActivity((busyCount) => {
      if (busyCount > 0) {
        recordActivity(true, true);
      } else {
        recordActivity(true, false);
      }
    });

    const intervalId = window.setInterval(() => {
      if (isAnyBusyActivity()) {
        recordActivity(false, true);
        return;
      }

      const now = Date.now();
      const timeoutMs = Math.max(1, idleTimeoutMinutesRef.current) * 60 * 1000;
      const elapsed = now - lastActivityRef.current;
      const remainingMs = timeoutMs - elapsed;

      if (remainingMs <= 0) {
        window.clearInterval(intervalId);
        performIdleLogout(true);
        return;
      }

      if (remainingMs <= warningMs) {
        setIdleWarningSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
      } else if (idleWarningSecondsRef.current !== null) {
        setIdleWarningSeconds(null);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
      unsubBusy();
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleUserActivityEvent, true);
      });
      if (channel) {
        channel.close();
        if (idleChannelRef.current === channel) {
          idleChannelRef.current = null;
        }
      }
    };
  }, [user?.uid, loading]);

  const handlePendingStatusUpdate = (
    nextRole: UserRole,
    nextDisplayName?: string,
    createdAt?: string
  ) => {
    setUser((prevUser) => {
      if (!prevUser) return prevUser;
      const updatedUser: AppUser = {
        ...prevUser,
        role: nextRole,
        ...(nextDisplayName ? { displayName: nextDisplayName } : {}),
        ...(createdAt ? { createdAt } : {}),
      };
      if (updatedUser.isCustom) {
        try {
          localStorage.setItem('dmtc_session', JSON.stringify(updatedUser));
        } catch {
          // ignore storage errors
        }
      }
      return updatedUser;
    });
  };

  const handleSelectTab = (tab: ActiveTab) => {
    if (activeTab === 'settings' && tab !== 'settings' && hasUnsavedSettingsChanges) {
      setPendingTabTarget(tab);
      setMobileMenuOpen(false);
      return;
    }
    if (tab === 'search') {
      setInitialVoucherSearch('');
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const confirmLeaveSettings = () => {
    const target = pendingTabTarget;
    setPendingTabTarget(null);
    setHasUnsavedSettingsChanges(false);
    if (target) {
      if (target === 'search') {
        setInitialVoucherSearch('');
      }
      setActiveTab(target);
    }
  };

  const handleOpenVoucherFromBuses = (voucherNumber: string) => {
    setInitialVoucherSearch(voucherNumber);
    setActiveTab('search');
    setMobileMenuOpen(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginScreen
          onLogin={handleCustomLogin}
          onGoogleLogin={loginWithGoogle}
          sessionMessage={sessionNotice}
          onClearSessionMessage={clearSessionNotice}
        />
        <PWAUpdateBanner />
      </>
    );
  }

  const userDisplayName =
    user.displayName?.trim() && user.displayName.trim() !== 'Google User'
      ? user.displayName.trim()
      : user.username || 'مستخدم النظام';

  const userRoleLabel = getRoleLabel(user.role);
  const canManageAdmin = user.role === 'general_manager';
  const canManageBuses = user.role === 'general_manager' || user.role === 'supervisor';

  const renderSidebarContent = (isCollapsed: boolean, isMobileDrawer: boolean) => (
    <div className="flex flex-col h-full">
      {/* Top Brand Line (Flat Primary Blue) */}
      <div className="h-1.5 w-full bg-[var(--primary)] shrink-0" />

      {/* Brand Header + Collapse/Close Control */}
      <div
        className={`p-[var(--space-4)] border-b border-[var(--border)] flex items-center bg-[var(--surface-subtle)] shrink-0 ${
          isCollapsed ? 'justify-center flex-col gap-[var(--space-3)]' : 'justify-between gap-[var(--space-3)]'
        }`}
      >
        <div className={`flex items-center gap-[var(--space-3)] min-w-0 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center p-[var(--space-1)] border border-[var(--border)] shadow-2xs overflow-hidden shrink-0">
            <CompanyLogo size="34px" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden min-w-0">
              <h2 className="text-base font-extrabold text-[var(--text)] leading-snug truncate">
                درة المنورة
              </h2>
              <p className="text-[11px] text-[var(--primary)] font-bold mt-[var(--space-1)] truncate">
                لنقل الحجاج والمعتمرين
              </p>
            </div>
          )}
        </div>

        {isMobileDrawer ? (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="إغلاق القائمة"
            className="w-9 h-9 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer shrink-0"
          >
            <X size={18} />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية'}
            title={isCollapsed ? 'توسيع القائمة' : 'طي القائمة'}
            className="hidden md:flex w-8 h-8 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            {isCollapsed ? <PanelRightOpen size={17} /> : <PanelRightClose size={17} />}
          </button>
        )}
      </div>

      {/* Navigation Groups */}
      <nav className="flex-1 p-[var(--space-3)] space-y-[var(--space-5)] overflow-y-auto">
        {/* Operations Group */}
        <div>
          {!isCollapsed && (
            <p className="px-[var(--space-3)] mb-[var(--space-2)] text-[11px] font-extrabold text-[var(--text-muted)]">
              العمليات
            </p>
          )}
          <div className="flex flex-col gap-[var(--space-1)]">
            <NavItem
              active={activeTab === 'entry'}
              onClick={() => handleSelectTab('entry')}
              icon={<PlusCircle size={19} />}
              label="إصدار سند جديد"
              collapsed={isCollapsed}
            />
            {user.role !== 'pending' && user.role !== 'rejected' && (
              <NavItem
                active={activeTab === 'dashboard'}
                onClick={() => handleSelectTab('dashboard')}
                icon={<LayoutDashboard size={19} />}
                label="لوحة التحكم"
                collapsed={isCollapsed}
              />
            )}
            {user.role !== 'pending' && user.role !== 'rejected' && (
              <NavItem
                active={activeTab === 'search'}
                onClick={() => handleSelectTab('search')}
                icon={<Search size={19} />}
                label="البحث والأرشيف"
                collapsed={isCollapsed}
              />
            )}
            {canManageBuses && (
              <NavItem
                active={activeTab === 'buses'}
                onClick={() => handleSelectTab('buses')}
                icon={<BusFront size={19} />}
                label="إدارة الحافلات"
                collapsed={isCollapsed}
              />
            )}
          </div>
        </div>

        {/* Administration Group (Only visible if general_manager) */}
        {canManageAdmin && (
          <div className="pt-[var(--space-2)] border-t border-[var(--border)]">
            {!isCollapsed && (
              <p className="px-[var(--space-3)] mb-[var(--space-2)] text-[11px] font-extrabold text-[var(--text-muted)]">
                الإدارة
              </p>
            )}
            <div className="flex flex-col gap-[var(--space-1)]">
              <NavItem
                active={activeTab === 'users'}
                onClick={() => handleSelectTab('users')}
                icon={<UserPlus size={19} />}
                label="إدارة المستخدمين"
                badge={pendingUsersCount > 0 ? pendingUsersCount : undefined}
                collapsed={isCollapsed}
              />
              <NavItem
                active={activeTab === 'settings'}
                onClick={() => handleSelectTab('settings')}
                icon={<Settings size={19} />}
                label="إعدادات التطبيق"
                collapsed={isCollapsed}
              />
            </div>
          </div>
        )}
      </nav>

      {/* Bottom: About App + Version + Current User Card with Logout (pinned at bottom with mt-auto) */}
      <div className="mt-auto p-[var(--space-3)] border-t border-[var(--border)] bg-[var(--surface-subtle)] flex flex-col gap-[var(--space-3)] shrink-0">
        <button
          type="button"
          onClick={() => handleSelectTab('about')}
          title={isCollapsed ? `حول التطبيق (v${APP_VERSION})` : undefined}
          className={`w-full h-[44px] min-h-[44px] flex items-center rounded-xl transition-all cursor-pointer border ${
            isCollapsed ? 'justify-center px-[var(--space-2)]' : 'justify-between px-[var(--space-3)]'
          } ${
            activeTab === 'about'
              ? 'bg-[var(--btn-primary)] text-white border-[var(--btn-primary)] font-bold shadow-xs'
              : 'bg-[var(--surface)] border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] font-semibold'
          }`}
        >
          <span className="flex items-center gap-[var(--space-3)] min-w-0">
            <Info size={17} className={activeTab === 'about' ? 'text-[var(--gold)] shrink-0' : 'text-[var(--primary)] shrink-0'} />
            {!isCollapsed && <span className="text-xs truncate">حول التطبيق</span>}
          </span>
          {!isCollapsed && (
            <span
              dir="ltr"
              className={`text-[11px] font-mono font-bold tabular-nums px-[var(--space-2)] py-[var(--space-1)] rounded-md ${
                activeTab === 'about'
                  ? 'bg-white/15 text-amber-200'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              v{APP_VERSION}
            </span>
          )}
        </button>

        {/* Current User Card + Logout */}
        <div
          className={`mt-auto p-[var(--space-3)] bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xs flex flex-col ${
            isCollapsed ? 'items-center gap-[var(--space-2)]' : 'gap-[var(--space-3)]'
          }`}
        >
          <div className={`flex items-center gap-[var(--space-3)] ${isCollapsed ? 'justify-center' : ''}`}>
            {user.isCustom || !user.photoURL ? (
              <div className="w-9 h-9 rounded-xl bg-[var(--navy)] flex items-center justify-center text-white font-bold text-sm shrink-0 border border-slate-700/40">
                {userDisplayName[0] || 'U'}
              </div>
            ) : (
              <img
                src={user.photoURL}
                alt={userDisplayName}
                className="w-9 h-9 rounded-xl border border-[var(--border)] object-cover shrink-0"
              />
            )}
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold text-[var(--text)] truncate">
                  {userDisplayName}
                </p>
                <p className="text-[11px] font-bold text-[var(--primary)] truncate">
                  {userRoleLabel}
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={logout}
            title="تسجيل الخروج"
            className={`w-full flex items-center justify-center gap-[var(--space-2)] text-xs font-bold text-[var(--danger)] bg-red-50/70 dark:bg-red-950/40 hover:bg-red-100/80 dark:hover:bg-red-950/70 rounded-xl transition-colors cursor-pointer ${
              isCollapsed ? 'p-[var(--space-2)]' : 'px-[var(--space-3)] py-[var(--space-2)]'
            }`}
          >
            <LogOut size={15} className="shrink-0" />
            {!isCollapsed && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </div>
    </div>
  );

  const isEntryTab =
    activeTab === 'entry' && user.role !== 'pending' && user.role !== 'rejected';

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <div
        className={`min-h-screen bg-[var(--bg)] flex flex-col md:flex-row font-sans text-[var(--text)] transition-colors duration-200 ${
          isEntryTab
            ? 'p-[var(--space-3)] md:p-[var(--space-4)] gap-[var(--space-4)] md:gap-[var(--space-6)]'
            : 'p-[var(--space-2)] gap-[var(--space-2)]'
        }`}
        dir="rtl"
      >
        {/* Welcome Message Modal */}
        <WelcomeModal
          isOpen={showWelcome}
          userName={userDisplayName}
          version={CURRENT_VERSION_TAG}
          title={welcomeTitle}
          message={formatWelcomeTextWithName(
            welcomeMessage,
            resolveNewVoucherIssuerName(user) || userDisplayName
          )}
          seasonLabel={activeSeason}
          onClose={closeWelcome}
        />

        {/* Unsaved Settings Leave Confirmation Modal */}
        <AnimatePresence>
          {pendingTabTarget && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-[var(--space-4)]"
            >
              <motion.div
                initial={{ scale: 0.94, opacity: 0, y: 14 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.94, opacity: 0, y: 14 }}
                className="bg-[var(--surface)] rounded-3xl p-[var(--space-6)] max-w-md w-full shadow-2xl border border-amber-300 dark:border-amber-800 text-right relative overflow-hidden"
                role="dialog"
                aria-modal="true"
              >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[var(--gold)]" />
                <div className="flex items-start gap-[var(--space-3)] mb-[var(--space-4)]">
                  <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-[var(--gold-text)] flex items-center justify-center shrink-0">
                    <AlertCircle size={22} />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[var(--text)]">تغييرات غير محفوظة</h3>
                    <p className="text-xs font-bold text-[var(--text-secondary)] mt-1 leading-relaxed">
                      لديك تعديلات غير محفوظة في إعدادات التطبيق. هل تريد تجاهل التغييرات والانتقال إلى الصفحة المختارة؟
                    </p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-[var(--space-2)] justify-end pt-[var(--space-2)]">
                  <button
                    type="button"
                    onClick={() => setPendingTabTarget(null)}
                    className="px-[var(--space-4)] py-[var(--space-2)] rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--text)] font-bold text-xs cursor-pointer hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    البقاء في الإعدادات
                  </button>
                  <button
                    type="button"
                    onClick={confirmLeaveSettings}
                    className="px-[var(--space-4)] py-[var(--space-2)] rounded-xl bg-[var(--danger)] hover:opacity-95 text-white font-black text-xs cursor-pointer"
                  >
                    تجاهل التغييرات والمتابعة
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PWA Update Available Banner */}
        <PWAUpdateBanner />

        {/* Email Verification Modal */}
        <AnimatePresence>
          {isEmailUnverified && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-[var(--space-4)]"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] max-w-md w-full shadow-2xl border border-red-200 dark:border-red-900 text-center relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[var(--danger)]" />
                <div className="w-16 h-16 bg-red-50 dark:bg-red-950/60 rounded-2xl flex items-center justify-center text-[var(--danger)] mx-auto mb-[var(--space-6)]">
                  <AlertCircle size={32} />
                </div>
                <h2 className="text-2xl font-extrabold text-[var(--text)] mb-[var(--space-3)]">تأكيد البريد الإلكتروني</h2>
                <p className="text-[var(--text-secondary)] font-semibold leading-relaxed mb-[var(--space-8)] text-sm">
                  يرجى تأكيد بريدك الإلكتروني لتتمكن من استخدام كافة مميزات النظام. لقد أرسلنا رابطاً لبريدك المسجل.
                </p>
                <div className="flex flex-col gap-[var(--space-3)]">
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-[var(--space-3)] bg-[var(--danger)] text-white rounded-xl font-bold hover:opacity-90 transition-all cursor-pointer"
                  >
                    تم التأكيد؟ حدّث الصفحة
                  </button>
                  <button
                    onClick={logout}
                    className="w-full py-[var(--space-3)] text-[var(--text-secondary)] font-bold hover:text-[var(--text)] transition-all cursor-pointer"
                  >
                    تسجيل الخروج
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle Timeout Warning Modal (60s countdown before auto logout) */}
        <AnimatePresence>
          {idleWarningSeconds !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-[var(--space-4)]"
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0, y: 16 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: 16 }}
                className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-6)] lg:p-[var(--space-8)] max-w-md w-full shadow-2xl border border-amber-300 dark:border-amber-800 text-center relative overflow-hidden"
                role="dialog"
                aria-modal="true"
                aria-labelledby="idle-warning-title"
              >
                <div className="absolute top-0 left-0 w-full h-1.5 bg-[var(--gold)]" />
                <div className="w-16 h-16 bg-amber-50 dark:bg-amber-950/60 rounded-2xl flex items-center justify-center text-[var(--gold-text)] mx-auto mb-[var(--space-5)] border border-amber-200 dark:border-amber-800/70">
                  <AlertCircle size={32} />
                </div>
                <h2 id="idle-warning-title" className="text-lg font-black text-[var(--text)] mb-[var(--space-3)]">
                  سيتم تسجيل خروجك خلال 60 ثانية لعدم النشاط
                </h2>
                <div className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[var(--gold-text)] font-black text-2xl tabular-nums mb-[var(--space-4)]">
                  <span>{idleWarningSeconds}</span>
                  <span className="text-sm font-bold">ثانية</span>
                </div>
                <p className="text-xs font-bold text-[var(--text-secondary)] leading-relaxed mb-[var(--space-6)]">
                  في حال عدم الاستجابة سيتم حفظ مسودة السند الجاري إدخاله مؤقتاً وتسجيل الخروج تلقائياً لحماية البيانات.
                </p>
                <div className="flex flex-col sm:flex-row gap-[var(--space-3)]">
                  <button
                    type="button"
                    onClick={handleStayConnected}
                    className="flex-1 py-[var(--space-3)] px-[var(--space-5)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-black text-sm shadow-lg transition-all cursor-pointer"
                  >
                    البقاء متصلاً
                  </button>
                  <button
                    type="button"
                    onClick={() => performIdleLogout(true)}
                    className="py-[var(--space-3)] px-[var(--space-4)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] rounded-xl font-bold text-sm transition-all cursor-pointer"
                  >
                    خروج الآن
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Desktop Sidebar (Collapsible on md+) */}
        <aside
          className={`hidden md:flex flex-col bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xs overflow-hidden relative shrink-0 transition-all duration-300 md:sticky ${
            isEntryTab
              ? 'md:top-[var(--space-4)] md:h-[calc(100vh-32px)]'
              : 'md:top-[var(--space-2)] md:h-[calc(100vh-16px)]'
          } ${sidebarCollapsed ? 'md:w-[84px]' : 'md:w-72'}`}
        >
          {renderSidebarContent(sidebarCollapsed, false)}
        </aside>

        {/* Mobile Slide-In Drawer from Right */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <div className="fixed inset-0 z-50 md:hidden" dir="rtl">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMobileMenuOpen(false)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
              />
              <motion.aside
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                className="absolute top-0 bottom-0 right-0 w-72 max-w-[85vw] bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col overflow-hidden"
              >
                {renderSidebarContent(false, true)}
              </motion.aside>
            </div>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <div
          className={`flex-1 flex flex-col min-w-0 ${
            isEntryTab ? 'gap-[var(--space-5)] md:gap-[var(--space-6)]' : 'gap-[var(--space-2)]'
          }`}
        >
          {/* Top Bar (64px height, --space-6 horizontal padding, --space-3 gap) */}
          <header className="min-h-[64px] sm:h-[64px] bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xs px-[var(--space-4)] sm:px-[var(--space-6)] py-[var(--space-2)] sm:py-0 flex flex-wrap items-center justify-between gap-[var(--space-3)] relative">
            <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)] rounded-t-2xl" />

            {/* Live Notification Toast Overlay */}
            <AnimatePresence>
              {lastNotification && (
                <motion.div
                  initial={{ x: 60, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -60, opacity: 0 }}
                  className="absolute inset-0 bg-[var(--navy)] rounded-2xl flex items-center justify-between px-[var(--space-6)] z-30"
                >
                  <div className="flex items-center gap-[var(--space-3)] text-white min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-[var(--gold)] text-[#0F172A] flex items-center justify-center shrink-0">
                      <Bell size={16} />
                    </div>
                    <span className="font-bold text-sm truncate">{lastNotification.msg}</span>
                  </div>
                  <button
                    onClick={() => setLastNotification(null)}
                    className="text-white/90 hover:text-white font-bold text-xs bg-white/10 hover:bg-white/20 px-[var(--space-3)] py-[var(--space-2)] rounded-lg transition-colors cursor-pointer shrink-0"
                  >
                    إغلاق
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Right Group: Mobile Menu Button + Current Page Title + Hajj Season Badge */}
            <div className="flex items-center gap-[var(--space-3)] min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="فتح القائمة"
                className="md:hidden w-10 h-10 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] flex items-center justify-center cursor-pointer shrink-0"
              >
                <Menu size={20} />
              </button>

              <h1 className="text-base sm:text-lg font-black text-[var(--text)] truncate">
                {PAGE_TITLES[activeTab]}
              </h1>

              {activeTab !== 'dashboard' && (
                <span className="hidden sm:inline-flex items-center px-[var(--space-3)] py-[var(--space-1)] rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 text-[var(--primary)] text-xs font-extrabold whitespace-nowrap tabular-nums">
                  موسم حج {activeSeason}هـ
                </span>
              )}
            </div>

            {/* Left Group: Combined Date Badge + Connection Status + Dark Mode + Notifications + User Menu */}
            <div className="flex flex-wrap items-center gap-[var(--space-3)]">
              {/* Single Combined Date Badge (Hijri + Gregorian) */}
              <div className="hidden lg:inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs font-bold text-[var(--text)] tabular-nums whitespace-nowrap">
                <Calendar size={14} className="text-[var(--gold)] shrink-0" />
                <span>{formatHijriLongWithOffset(new Date(), hijriOffsetDays)}</span>
                <span aria-hidden="true" className="text-[var(--text-muted)]">|</span>
                <span>{getGregorianDate()}</span>
              </div>

              {/* Connection Indicator (متصل / غير متصل) */}
              <div
                className={`inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl border text-xs font-bold whitespace-nowrap ${
                  isOnline
                    ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800 text-[var(--success)]'
                    : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-[var(--danger)]'
                }`}
                title={isOnline ? 'الاتصال بالسحابة نشط' : 'لا يوجد اتصال بالإنترنت'}
              >
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isOnline ? 'bg-[var(--success)]' : 'bg-[var(--danger)]'
                  }`}
                />
                {isOnline ? <Wifi size={13} className="hidden sm:inline shrink-0" /> : <WifiOff size={13} className="hidden sm:inline shrink-0" />}
                <span>{isOnline ? 'متصل' : 'غير متصل'}</span>
              </div>

              {/* Dark Mode Toggle */}
              <button
                type="button"
                onClick={toggleDarkMode}
                aria-label={isDark ? 'تفعيل الوضع النهاري' : 'تفعيل الوضع الليلي'}
                title={isDark ? 'الوضع النهاري' : 'الوضع الليلي'}
                className="w-9 h-9 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
              >
                {isDark ? <Sun size={17} className="text-[var(--gold)]" /> : <Moon size={17} />}
              </button>

              {/* Notifications Icon + Dropdown */}
              <div className="relative" ref={notificationsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowNotificationsMenu((v) => !v);
                    setShowUserMenu(false);
                  }}
                  aria-label="الإشعارات"
                  title="الإشعارات"
                  className="relative w-9 h-9 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--primary)] flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <Bell size={17} />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-[var(--space-1)] rounded-full bg-[var(--gold)] text-[#0F172A] text-[10px] font-black flex items-center justify-center tabular-nums shadow-xs">
                      {unreadCount}
                    </span>
                  )}
                </button>

                <AnimatePresence>
                  {showNotificationsMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-[var(--space-2)] w-72 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl z-40 overflow-hidden"
                    >
                      <div className="px-[var(--space-4)] py-[var(--space-3)] border-b border-[var(--border)] flex items-center justify-between">
                        <span className="text-xs font-extrabold text-[var(--text)]">
                          الإشعارات
                        </span>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={markNotificationsAsRead}
                            className="inline-flex items-center gap-[var(--space-1)] text-[11px] font-bold text-[var(--primary)] hover:underline cursor-pointer"
                          >
                            <CheckCheck size={13} />
                            <span>تحديد كمقروء</span>
                          </button>
                        )}
                      </div>
                      <div className="p-[var(--space-4)] space-y-[var(--space-3)] text-xs">
                        {unreadCount > 0 ? (
                          <p className="font-bold text-[var(--text)] tabular-nums">
                            يوجد <span className="text-[var(--primary)]">{unreadCount}</span> سندات جديدة منذ آخر مراجعة.
                          </p>
                        ) : (
                          <p className="font-semibold text-[var(--text-secondary)]">
                            لا توجد إشعارات غير مقروءة حالياً.
                          </p>
                        )}
                        {canManageAdmin && pendingUsersCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectTab('users');
                              setShowNotificationsMenu(false);
                            }}
                            className="w-full text-right p-[var(--space-3)] rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[var(--gold-text)] font-bold hover:bg-amber-100/70 transition-colors cursor-pointer tabular-nums"
                          >
                            {pendingUsersCount} طلبات مستخدمين بانتظار الموافقة
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* User Menu Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setShowUserMenu((v) => !v);
                    setShowNotificationsMenu(false);
                  }}
                  className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] hover:border-[var(--primary)] transition-colors cursor-pointer"
                >
                  {user.isCustom || !user.photoURL ? (
                    <div className="w-7 h-7 rounded-lg bg-[var(--navy)] text-white flex items-center justify-center text-xs font-extrabold shrink-0">
                      {userDisplayName[0] || 'U'}
                    </div>
                  ) : (
                    <img
                      src={user.photoURL}
                      alt={userDisplayName}
                      className="w-7 h-7 rounded-lg object-cover shrink-0"
                    />
                  )}
                  <div className="hidden sm:block text-right leading-tight max-w-[130px]">
                    <p className="text-xs font-extrabold text-[var(--text)] truncate">
                      {userDisplayName}
                    </p>
                    <p className="text-[10px] font-bold text-[var(--primary)] truncate">
                      {userRoleLabel}
                    </p>
                  </div>
                  <ChevronDown size={14} className="text-[var(--text-muted)] shrink-0" />
                </button>

                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-[var(--space-2)] w-60 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl z-40 overflow-hidden"
                    >
                      <div className="p-[var(--space-4)] border-b border-[var(--border)]">
                        <p className="text-sm font-extrabold text-[var(--text)] truncate">
                          {userDisplayName}
                        </p>
                        <p className="text-xs font-bold text-[var(--primary)] mt-[var(--space-1)]">
                          {userRoleLabel}
                        </p>
                      </div>
                      <div className="p-[var(--space-2)]">
                        <button
                          type="button"
                          onClick={logout}
                          className="w-full flex items-center gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-2)] text-xs font-bold text-[var(--danger)] hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl transition-colors cursor-pointer"
                        >
                          <LogOut size={15} />
                          <span>تسجيل الخروج</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </header>

          {/* Main Workspace */}
          <main className="flex-1 p-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {activeTab === 'entry' &&
                  (user.role === 'pending' || user.role === 'rejected' ? (
                    <PendingApproval
                      user={user}
                      onStatusUpdate={handlePendingStatusUpdate}
                      onLogout={logout}
                    />
                  ) : (
                    <VoucherEntry />
                  ))}
                {activeTab === 'dashboard' && user.role !== 'pending' && user.role !== 'rejected' && (
                  <Dashboard
                    onNavigateToEntry={() => handleSelectTab('entry')}
                    onNavigateToSettings={() => handleSelectTab('settings')}
                  />
                )}
                {activeTab === 'search' && user.role !== 'pending' && user.role !== 'rejected' && (
                  <VoucherSearch initialSearchTerm={initialVoucherSearch} />
                )}
                {activeTab === 'buses' && canManageBuses && (
                  <BusesManagement onOpenVoucher={handleOpenVoucherFromBuses} />
                )}
                {activeTab === 'users' && canManageAdmin && <UsersManagement />}
                {activeTab === 'settings' && canManageAdmin && (
                  <AppSettings onDirtyChange={setHasUnsavedSettingsChanges} />
                )}
                {activeTab === 'about' && <AboutApp />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </AuthContext.Provider>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
  badge,
  collapsed = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  badge?: number | string;
  collapsed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={`relative isolate overflow-hidden w-full h-[44px] min-h-[44px] flex items-center rounded-xl transition-all duration-200 group outline-none cursor-pointer border ${
        collapsed ? 'justify-center px-[var(--space-2)]' : 'gap-[var(--space-3)] px-[var(--space-3)]'
      } ${
        active
          ? 'bg-[var(--btn-primary)] text-white shadow-sm font-bold border-[var(--btn-primary)]'
          : 'text-[var(--text)] hover:bg-[var(--surface-subtle)] hover:text-[var(--primary)] border-transparent font-semibold'
      }`}
    >
      {active && (
        <motion.div
          layoutId="nav-bg"
          className="absolute inset-0 bg-[var(--btn-primary)] rounded-xl z-0"
          initial={false}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
        />
      )}
      <div
        className={`relative z-10 transition-colors duration-200 shrink-0 ${
          active
            ? 'text-[var(--gold)]'
            : 'text-[var(--text-muted)] group-hover:text-[var(--primary)]'
        }`}
      >
        {icon}
      </div>
      {!collapsed && (
        <span className="relative z-10 text-sm flex-1 text-right truncate">{label}</span>
      )}
      {!collapsed && badge !== undefined && (
        <span
          className="relative z-10 px-[var(--space-2)] py-[var(--space-1)] rounded-full text-xs font-bold tabular-nums bg-[var(--gold)] text-[#0F172A]"
        >
          {badge}
        </span>
      )}
      {collapsed && badge !== undefined && (
        <span className="absolute top-[var(--space-2)] left-[var(--space-2)] z-10 w-2 h-2 rounded-full bg-[var(--warning)]" />
      )}
    </button>
  );
}
