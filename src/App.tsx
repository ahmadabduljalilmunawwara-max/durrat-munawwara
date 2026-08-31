/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signInWithPopup } from 'firebase/auth';
import { auth, googleProvider, db, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, getDoc, setDoc, collection, query, orderBy, limit, onSnapshot, serverTimestamp, where } from 'firebase/firestore';
import { format } from 'date-fns';
import { BusFront, ClipboardList, LayoutDashboard, Search, Settings, LogOut, Loader2, Printer, PlusCircle, AlertCircle, CheckCircle2, UserPlus, Bell, Info, Calendar } from 'lucide-react';
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

export type UserRole = 'general_manager' | 'supervisor' | 'data_entry' | 'pending';

interface AppUser {
  uid: string;
  displayName: string | null;
  email?: string | null;
  photoURL?: string | null;
  role: UserRole;
  username?: string;
  isCustom?: boolean;
}

// Auth Provider
export const AuthContext = createContext<{ user: AppUser | null; loading: boolean }>({ user: null, loading: true });
export const useAuth = () => useContext(AuthContext);

const getGregorianDate = () => {
  try {
    const formatted = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date());
    return formatted.includes('م') ? formatted : `${formatted} م`;
  } catch {
    try {
      return new Intl.DateTimeFormat('ar-EG', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date()) + ' م';
    } catch {
      return format(new Date(), 'yyyy/MM/dd') + ' م';
    }
  }
};

const getHijriDate = () => {
  try {
    const formatted = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date());
    return formatted.includes('هـ') ? formatted : `${formatted} هـ`;
  } catch {
    try {
      const formatted = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date());
      return formatted.includes('هـ') ? formatted : `${formatted} هـ`;
    } catch {
      return '1448 هـ';
    }
  }
};

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'entry' | 'dashboard' | 'search' | 'buses' | 'users' | 'settings' | 'about'>('entry');
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingUsersCount, setPendingUsersCount] = useState(0);
  const [lastNotification, setLastNotification] = useState<{ msg: string; id: string } | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [isEmailUnverified, setIsEmailUnverified] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        if (u.isAnonymous) {
          setIsEmailUnverified(false);
          // Check for custom session if anonymous
          const savedSession = localStorage.getItem('dmtc_session');
          if (savedSession) {
            try {
              setUser(JSON.parse(savedSession));
            } catch (e) {
              console.error('Failed to parse session', e);
              localStorage.removeItem('dmtc_session');
              auth.signOut();
              setUser(null);
            }
          } else {
            // No custom session found for this anonymous user, sign out
            auth.signOut();
            setUser(null);
          }
        } else {
          // Google login
          const isGM = u.email === 'ahmad.abduljalilmunawwara@gmail.com';

          // Check email verification status
          if (!u.emailVerified) {
            setIsEmailUnverified(true);
          } else {
            setIsEmailUnverified(false);
          }
          
          // Check Firestore for existing user data or create new
          const userRef = doc(db, 'app_users', u.uid);
          const snap = await getDoc(userRef);
          
          let role: UserRole = 'pending';
          let displayName = u.displayName || 'Google User';

          if (snap.exists()) {
            const data = snap.data();
            role = data.role || 'pending';
            displayName = data.displayName || displayName;
          } else {
            // First time Google login
            role = isGM ? 'general_manager' : 'pending';
            await setDoc(userRef, {
              uid: u.uid,
              email: u.email,
              displayName: displayName,
              photoURL: u.photoURL,
              role: role,
              isGoogle: true,
              updatedAt: serverTimestamp()
            });
          }

          const googleUser: AppUser = {
            uid: u.uid,
            displayName: displayName,
            email: u.email,
            photoURL: u.photoURL,
            role: role,
            isCustom: false
          };
          setUser(googleUser);
          
          // Listen for profile changes in real-time
          const profileUnsubscribe = onSnapshot(userRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setUser(prevUser => {
                if (!prevUser) return null;
                return {
                  ...prevUser,
                  displayName: data.displayName || prevUser.displayName,
                  role: data.role || prevUser.role
                };
              });
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, 'app_users/' + u.uid);
          });

          // Sync settings
          const settingsRef = doc(db, 'settings', 'app');
          const settingsSnap = await getDoc(settingsRef);
          if (!settingsSnap.exists()) {
            await setDoc(settingsRef, { nextVoucherNumber: 1001 });
          } else {
            const sData = settingsSnap.data();
            if (sData.welcomeMessage && !sessionStorage.getItem('welcome_shown')) {
              setWelcomeMsg(sData.welcomeMessage);
              setShowWelcome(true);
              sessionStorage.setItem('welcome_shown', 'true');
            }
          }
        }
      } else {
        setUser(null);
        localStorage.removeItem('dmtc_session');
      }
      setLoading(false);
    });
  }, []);

  const markNotificationsAsRead = () => {
    if (!user) return;
    const now = new Date().toISOString();
    localStorage.setItem(`dmtc_last_seen_${user.uid}`, now);
    setUnreadCount(0);
  };

  useEffect(() => {
    if (!user) return;

    // We calculate unread based on localStorage last seen
    const lastSeen = localStorage.getItem(`dmtc_last_seen_${user.uid}`) || new Date(0).toISOString();

    const q = query(
      collection(db, 'vouchers'),
      orderBy('timestamp', 'desc'),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0;
      let latest: any = null;

      snapshot.docs.forEach((doc, idx) => {
        const data = doc.data();
        if (data.timestamp > lastSeen) {
          count++;
          if (idx === 0) latest = { ...data, id: doc.id };
        }
      });

      setUnreadCount(count);

      // If there's a new one and it's not the one we just showed
      if (latest && latest.id !== localStorage.getItem('last_notified_id')) {
        setLastNotification({
          msg: `سند جديد: ${latest.busNumber} - ${latest.driverName}`,
          id: latest.id
        });
        localStorage.setItem('last_notified_id', latest.id);
        
        // Auto hide notification toast
        setTimeout(() => setLastNotification(null), 8000);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'vouchers');
    });

    return () => unsubscribe();
  }, [user]);

  // Listener for pending users (for admin)
  useEffect(() => {
    if (!user || user.role !== "general_manager") return;

    const q = query(
      collection(db, "app_users"),
      where("role", "==", "pending")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingUsersCount(snapshot.size);

      // Handle new pending user notification
      const lastPendingId = localStorage.getItem("last_notified_pending_id");
      const latestPending = snapshot.docs[0];

      if (latestPending && latestPending.id !== lastPendingId) {
        const data = latestPending.data();
        setLastNotification({
          msg: `مستخدم جديد بانتظار الموافقة: ${data.displayName || data.email}`,
          id: latestPending.id,
        });
        localStorage.setItem("last_notified_pending_id", latestPending.id);
        setTimeout(() => setLastNotification(null), 10000);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'app_users');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (activeTab === 'search' || activeTab === 'dashboard') {
      markNotificationsAsRead();
    }
  }, [activeTab]);

  const handleCustomLogin = (userData: any) => {
    const session = { ...userData, isCustom: true };
    setUser(session);
    localStorage.setItem('dmtc_session', JSON.stringify(session));
  };

  const loginWithGoogle = () => signInWithPopup(auth, googleProvider);
  
  const logout = () => {
    auth.signOut();
    setUser(null);
    localStorage.removeItem('dmtc_session');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onLogin={handleCustomLogin} onGoogleLogin={loginWithGoogle} />;
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row p-4 md:p-6 gap-4 md:gap-6 font-sans" dir="rtl">
        {/* Welcome Message Modal */}
        <AnimatePresence>
          {showWelcome && welcomeMsg && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl border border-slate-100 text-center relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-blue-600"></div>
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mx-auto mb-6">
                  <Bell size={32} className="animate-bounce" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-4">مرحباً بك مجدداً!</h2>
                <div className="text-slate-600 font-bold leading-relaxed mb-8 whitespace-pre-wrap">
                  {welcomeMsg}
                </div>
                <button
                  onClick={() => setShowWelcome(false)}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black hover:bg-slate-800 transition-all shadow-xl shadow-slate-100"
                >
                  فهمت ذلك، دعنا نبدأ
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Email Verification Modal */}
        <AnimatePresence>
          {isEmailUnverified && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/80 backdrop-blur-md p-4"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl border border-red-100 text-center relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-2 bg-red-500"></div>
                <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center text-red-500 mx-auto mb-6">
                  <AlertCircle size={32} className="animate-pulse" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-4">تأكيد البريد الإلكتروني</h2>
                <p className="text-slate-600 font-bold leading-relaxed mb-8">
                  يرجى تأكيد بريدك الإلكتروني لتتمكن من استخدام كافة مميزات النظام. لقد ارسلنا رابطاً لبريدك المسجل.
                </p>
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => window.location.reload()}
                    className="w-full py-4 bg-red-500 text-white rounded-2xl font-black hover:bg-red-600 transition-all"
                  >
                    تم التأكيد؟ حدث الصفحة
                  </button>
                  <button
                    onClick={logout}
                    className="w-full py-3 text-slate-500 font-bold hover:text-slate-700 transition-all"
                  >
                    تسجيل الخروج
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <aside className="w-full md:w-72 bg-gradient-to-b from-slate-50/95 via-blue-50/25 to-slate-50/95 rounded-[2rem] border border-slate-200/90 shadow-md shadow-slate-200/60 flex flex-col overflow-hidden relative">
          {/* Subtle Top Accent Line with Brand Colors */}
          <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-blue-600 to-indigo-900"></div>
          
          <div className="p-5 border-b border-slate-200/80 flex items-center gap-3 bg-gradient-to-b from-amber-50/40 via-blue-50/30 to-transparent">
            <div className="w-11 h-11 bg-white rounded-2xl flex items-center justify-center p-1.5 border border-amber-200/70 shadow-xs overflow-hidden ring-2 ring-amber-400/20">
              <CompanyLogo size="34px" />
            </div>
            <div className="overflow-hidden">
              <div className="flex items-center gap-1.5">
                <h2 className="text-xl font-black text-slate-900 leading-tight truncate">درة المنورة</h2>
                <span className="w-2 h-2 rounded-full bg-amber-400"></span>
              </div>
              <p className="text-[10px] text-blue-700 font-black tracking-wider uppercase mt-0.5">لنقل الحجاج والمعتمرين</p>
            </div>
          </div>
          
          <nav className="flex-1 p-3.5 space-y-1.5">
            <NavItem 
              active={activeTab === 'entry'} 
              onClick={() => setActiveTab('entry')} 
              icon={<PlusCircle size={20} />} 
              label="إصدار سند" 
            />
            {user.role !== 'pending' && (
              <NavItem 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')} 
                icon={<LayoutDashboard size={20} />} 
                label="لوحة التحكم" 
                badge={activeTab !== 'dashboard' && unreadCount > 0 ? unreadCount : undefined}
              />
            )}
             {user.role !== 'pending' && (
               <NavItem 
                 active={activeTab === 'search'} 
                 onClick={() => setActiveTab('search')} 
                 icon={<Search size={20} />} 
                 label="البحث والأرشيف" 
                 badge={activeTab !== 'search' && unreadCount > 0 ? unreadCount : undefined}
               />
             )}
            {(user.role === 'general_manager' || user.role === 'supervisor') && (
              <NavItem 
                active={activeTab === 'buses'} 
                onClick={() => setActiveTab('buses')} 
                icon={<BusFront size={20} />} 
                label="إدارة الحافلات" 
              />
            )}
            {user.role === 'general_manager' && (
              <>
                <NavItem 
                  active={activeTab === 'users'} 
                  onClick={() => setActiveTab('users')} 
                  icon={<UserPlus size={20} />} 
                  label="إدارة المستخدمين" 
                  badge={activeTab !== 'users' && pendingUsersCount > 0 ? pendingUsersCount : undefined}
                />
                <NavItem 
                  active={activeTab === 'settings'} 
                  onClick={() => setActiveTab('settings')} 
                  icon={<Settings size={20} />} 
                  label="إعدادات التطبيق" 
                />
              </>
            )}
            <NavItem 
              active={activeTab === 'about'} 
              onClick={() => setActiveTab('about')} 
              icon={<Info size={20} />} 
              label="حول التطبيق" 
            />

            {/* General Operations Manager Badge */}
            <div className="pt-2 px-1">
              <div className="p-3 bg-gradient-to-r from-amber-500/15 via-blue-500/10 to-indigo-500/15 rounded-2xl border border-amber-300/40 shadow-xs flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-600 text-white flex items-center justify-center font-black text-xs shadow-xs shrink-0">
                  ع
                </div>
                <div className="overflow-hidden">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-black text-amber-700">مدير التشغيل العام</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                  </div>
                  <p className="text-xs font-black text-slate-800 truncate">الأستاذ عبد الحميد سالمة</p>
                </div>
              </div>
            </div>
          </nav>

          <div className="p-4 border-t border-slate-200/80 bg-slate-100/70">
            <div className="flex items-center gap-3 p-3 bg-white rounded-2xl border border-slate-200 shadow-2xs mb-3">
              {user.isCustom ? (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-xs">
                  {user.displayName?.[0] || 'U'}
                </div>
              ) : (
                <img src={user.photoURL || ''} alt="" className="w-9 h-9 rounded-xl border border-amber-200/60 shadow-xs object-cover" />
              )}
              <div className="flex-1 overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-black text-slate-900 truncate">{user.displayName}</p>
                  {user.role === 'general_manager' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="مدير عام"></span>
                  )}
                </div>
                <p className="text-[10px] text-slate-400 font-bold truncate">{user.isCustom ? `@${user.username}` : user.email}</p>
              </div>
            </div>
            <button 
              onClick={logout}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-black text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-colors mb-2 cursor-pointer"
            >
              <LogOut size={15} />
              <span>تسجيل الخروج</span>
            </button>
            <div className="px-3 py-1.5 border-t border-slate-200/70 flex justify-between items-center opacity-40 hover:opacity-80 transition-opacity">
              <span className="text-[9px] font-black text-blue-700">v2.6.0 DMTC</span>
              <span className="text-[9px] font-bold text-slate-400">أحمد عبد الجليل</span>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col gap-6">
          {/* Top Bar for Mobile/Desktop Content Label */}
            <header className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 flex items-center justify-between relative overflow-hidden">
              {/* Subtle top brand glow */}
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-r from-amber-400 via-blue-500 to-indigo-700 opacity-80"></div>
              <AnimatePresence>
                {lastNotification && (
                  <motion.div
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -100, opacity: 0 }}
                    className="absolute inset-0 bg-gradient-to-r from-blue-700 to-indigo-900 flex items-center justify-between px-6 z-20"
                  >
                    <div className="flex items-center gap-3 text-white">
                      <div className="w-7 h-7 rounded-lg bg-amber-400 text-slate-900 flex items-center justify-center">
                        <Bell size={16} className="animate-bounce" />
                      </div>
                      <span className="font-bold text-sm tracking-tight">{lastNotification.msg}</span>
                    </div>
                    <button 
                      onClick={() => setLastNotification(null)}
                      className="text-white/80 hover:text-white font-bold text-xs bg-white/10 px-3 py-1.5 rounded-lg"
                    >
                      إغلاق
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="flex items-center gap-2 px-3.5 py-1.5 bg-amber-50/80 rounded-xl border border-amber-300/60 shadow-2xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <div className="flex items-center gap-1.5">
                  <Calendar size={13} className="text-amber-600" />
                  <span className="text-xs font-black text-amber-950 tracking-tight">
                    {getHijriDate()}
                  </span>
                </div>
              </div>
              <div className="text-left font-bold text-slate-900 flex items-center gap-2">
                <div className="md:hidden">
                  {unreadCount > 0 && (
                    <span className="bg-amber-500 text-slate-900 px-2 py-0.5 rounded-full text-[10px] font-black animate-pulse ml-2 shadow-xs">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="bg-slate-50/90 border border-slate-200/90 px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  <span className="text-xs font-black text-slate-800 tracking-tight">
                    {getGregorianDate()}
                  </span>
                </div>
              </div>
            </header>

          <main className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              >
                {activeTab === 'entry' && (
                  user.role === 'pending' ? (
                    <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
                      <AlertCircle size={48} className="mx-auto text-amber-500 mb-4" />
                      <h2 className="text-xl font-bold text-slate-900 mb-2">في انتظار الموافقة</h2>
                      <p className="text-slate-500 max-w-sm mx-auto">لقد قمت بتسجيل الدخول بنجاح. يرجى مراجعة مدير النظام (عبد الحميد سالمة) لتفعيل حسابك وتحديد صلاحيات العمل.</p>
                    </div>
                  ) : <VoucherEntry />
                )}
                {activeTab === 'dashboard' && user.role !== 'pending' && <Dashboard />}
                {activeTab === 'search' && user.role !== 'pending' && <VoucherSearch />}
                {activeTab === 'buses' && (user.role === 'general_manager' || user.role === 'supervisor') && <BusesManagement />}
                {activeTab === 'users' && user.role === 'general_manager' && <UsersManagement />}
                {activeTab === 'settings' && user.role === 'general_manager' && <AppSettings />}
                {activeTab === 'about' && <AboutApp />}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </AuthContext.Provider>
  );
}

function NavItem({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; badge?: number | string }) {
  return (
    <button
      onClick={onClick}
      className={`relative w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 group outline-none cursor-pointer border ${
        active 
          ? 'text-white shadow-md shadow-blue-900/20 -translate-x-1 font-black border-transparent' 
          : 'text-slate-700 hover:bg-white hover:text-blue-950 hover:shadow-xs hover:border-slate-200/80 border-transparent font-bold'
      }`}
    >
      {active && (
        <motion.div
          layoutId="nav-bg"
          className="absolute inset-0 bg-gradient-to-l from-blue-700 via-blue-600 to-indigo-900 rounded-2xl -z-10 shadow-inner"
          initial={false}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
      )}
      <div className={`transition-transform duration-300 ${active ? 'scale-110 text-amber-300' : 'group-hover:scale-110 text-slate-400 group-hover:text-blue-600'}`}>
        {icon}
      </div>
      <span className="text-sm tracking-tight flex-1 text-right">{label}</span>
      {active && (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
      )}
      {badge && (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${active ? 'bg-amber-400 text-slate-950 shadow-xs' : 'bg-amber-500 text-white animate-pulse shadow-xs'}`}>
          {badge}
        </span>
      )}
    </button>
  );
}
