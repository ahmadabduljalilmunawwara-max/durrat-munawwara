import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { User as LucideUser, Key, LogIn, Loader2, AlertCircle, ShieldCheck, CheckCircle2, Save, Info, ArrowRight, UserCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { AboutApp } from './AboutApp';
import { CompanyLogo } from './CompanyLogo';

interface LoginScreenProps {
  onLogin: (user: any) => void;
  onGoogleLogin: () => void;
}

export function LoginScreen({ onLogin, onGoogleLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [appLogo, setAppLogo] = useState('');
  
  // States for password change flow
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [showAbout, setShowAbout] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  React.useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'app'), (snap) => {
      if (snap.exists()) {
        setAppLogo(snap.data().logoUrl || '');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/app');
    });
    return unsub;
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername || !regDisplayName || !regPassword) return;

    setIsLoading(true);
    setError('');
    
    try {
      const normalized = regUsername.toLowerCase().trim();
      const userRef = doc(db, 'app_users', normalized);
      const snap = await getDoc(userRef);
      
      if (snap.exists()) {
        setError('اسم المستخدم هذا موجود مسبقاً');
        setIsLoading(false);
        return;
      }

      await setDoc(userRef, {
        username: normalized,
        displayName: regDisplayName.trim(),
        password: regPassword.trim(),
        role: 'pending',
        isCustom: true,
        createdAt: new Date().toISOString()
      });

      setSuccessMessage('تم إرسال طلب الانضمام بنجاح. يرجى انتظار موافقة المسؤول.');
      setIsRegistering(false);
      setRegUsername('');
      setRegDisplayName('');
      setRegPassword('');
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء إرسال طلب الانضمام');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsLoading(true);
    setError('');
    
    try {
      const normalizedInput = username.toLowerCase().trim();
      if (!normalizedInput) {
        setError('يرجى إدخال اسم المستخدم');
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, 'app_users', normalizedInput);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.password.trim() === password.trim()) {
          const sessionData = {
            uid: `custom_${normalizedInput}`,
            displayName: userData.displayName,
            role: userData.role || 'data_entry',
            username: userData.username,
            isCustom: true
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
          setError('خطأ في كلمة المرور - يرجى التأكد من كلمة المرور والمحاولة مرة أخرى');
        }
      } else {
        setError('اسم المستخدم غير موجود - يرجى مراجعة المسؤول لإنشاء حساب لك');
      }
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/admin-restricted-operation' || err.message?.includes('admin-restricted-operation')) {
        setError('تنبيه: خاصية "تسجيل الدخول المجهول" غير مفعلة في إعدادات Firebase الخاصة بك. يرجى الذهاب إلى Firebase Console -> Authentication -> Sign-in method وتفعيل Anonymous Auth لتتمكن من استخدام الحسابات العادية.');
      } else if (err.code === 'permission-denied') {
        setError('فشل في الوصول إلى البيانات. يرجى التأكد من أنك لست مسجلاً للدخول بحساب Google آخر حالياً.');
      } else {
        setError('حدث خطأ في النظام: ' + (err.message || 'فشل الاتصال بخادم المصادقة'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || !confirmPassword) return;
    if (newPassword !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }
    if (newPassword.length < 6) {
      setError('يجب أن تكون كلمة المرور 6 أحرف على الأقل');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const userRef = doc(db, 'app_users', pendingUser.username);
      await updateDoc(userRef, {
        password: newPassword.trim(),
        forcePasswordChange: false
      });

      const authResult = await signInAnonymously(auth);
      if (authResult.user) {
        localStorage.setItem('dmtc_session', JSON.stringify(pendingUser));
        onLogin(pendingUser);
      }
    } catch (err: any) {
      console.error(err);
      setError('حدث خطأ أثناء تغيير كلمة المرور');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 relative flex items-center justify-center p-4 overflow-hidden" dir="rtl">
      {/* Background Brand Ambient Auras */}
      <div className="absolute -top-32 -right-32 w-96 h-96 bg-amber-200/30 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-blue-400/20 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[32rem] h-[32rem] bg-indigo-200/10 rounded-full blur-3xl pointer-events-none"></div>

      {showAbout ? (
        <div className="w-full max-w-4xl relative z-10">
          <div className="mb-6 flex justify-start">
            <button 
              onClick={() => setShowAbout(false)}
              className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm cursor-pointer"
            >
              <ArrowRight size={18} />
              العودة لتسجيل الدخول
            </button>
          </div>
          <AboutApp />
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl shadow-blue-900/10 max-w-md w-full border border-slate-200/80 overflow-hidden relative z-10"
        >
          {/* Top Brand Stripe */}
          <div className="absolute top-0 right-0 left-0 h-2 bg-gradient-to-r from-amber-400 via-blue-600 to-indigo-900"></div>

        <AnimatePresence mode="wait">
          {successMessage && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-green-50 border border-green-100 p-6 rounded-2xl text-center mb-6"
            >
              <CheckCircle2 className="mx-auto text-green-500 mb-3" size={32} />
              <p className="text-green-800 font-bold text-sm leading-relaxed">{successMessage}</p>
              <button 
                onClick={() => setSuccessMessage('')}
                className="mt-4 text-green-600 font-black text-xs uppercase tracking-widest hover:underline cursor-pointer"
              >
                إغلاق
              </button>
            </motion.div>
          )}

          {isRegistering ? (
            <motion.div
              key="register"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center mt-2">
                <div className="mb-6 flex justify-center">
                  {appLogo ? (
                    <img 
                      src={appLogo} 
                      alt="درة المنورة للنقل" 
                      className="h-24 mx-auto object-contain drop-shadow-sm" 
                    />
                  ) : (
                    <div className="p-3 bg-gradient-to-b from-amber-50/40 via-white to-blue-50/40 rounded-3xl border border-amber-100/80 shadow-sm ring-4 ring-amber-400/10">
                      <CompanyLogo size="96px" />
                    </div>
                  )}
                </div>
                <h1 className="text-2xl font-black mb-1 text-center text-slate-900 font-sans tracking-tight">طلب حساب جديد</h1>
                <p className="text-slate-500 mb-8 text-center text-xs font-bold">سيتم مراجعة طلبك من قبل المسؤول قبل التفعيل</p>
              </div>

              <form onSubmit={handleRegister} className="space-y-5">
                <div className="relative">
                  <LucideUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text"
                    required
                    placeholder="اسم المستخدم (إنجليزي)"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-amber-50 focus:border-amber-400 outline-none transition-all placeholder:text-slate-400 font-bold"
                  />
                </div>

                <div className="relative">
                  <Info className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="text"
                    required
                    placeholder="الاسم الكامل"
                    value={regDisplayName}
                    onChange={(e) => setRegDisplayName(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400 font-bold"
                  />
                </div>

                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input 
                    type="password"
                    required
                    placeholder="كلمة المرور"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400 font-bold"
                  />
                </div>

                {error && (
                  <div className="bg-red-50 text-red-500 p-4 rounded-xl flex items-center gap-3 text-sm font-bold border border-red-100">
                    <AlertCircle size={18} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-800 text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:from-blue-800 hover:to-indigo-900 transition-all shadow-lg shadow-blue-900/20 cursor-pointer"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} className="text-amber-300" />}
                  إرسال طلب التسجيل
                </button>

                <button 
                  type="button"
                  onClick={() => setIsRegistering(false)}
                  className="w-full py-3 text-slate-500 font-bold hover:text-slate-800 transition-all text-xs cursor-pointer"
                >
                  العودة لتسجيل الدخول
                </button>
              </form>
            </motion.div>
          ) : !isChangingPassword ? (
            <motion.div 
              key="login"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <div className="text-center mt-2 mb-8">
                <div className="mb-6 flex justify-center">
                  {appLogo ? (
                    <img 
                      src={appLogo} 
                      alt="درة المنورة للنقل" 
                      className="h-24 mx-auto object-contain drop-shadow-sm" 
                    />
                  ) : (
                    <div className="p-3 bg-gradient-to-b from-amber-50/40 via-white to-blue-50/40 rounded-3xl border border-amber-100/80 shadow-sm ring-4 ring-amber-400/10">
                      <CompanyLogo size="96px" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <h1 className="text-2xl font-black text-slate-900 font-sans tracking-tight">درة المنورة للنقل</h1>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                </div>
                <p className="text-blue-700 text-center text-xs font-black uppercase tracking-wider">نظام إدارة حركة الحافلات والعمليات</p>
              </div>

              <form onSubmit={handleCustomLogin} className="space-y-5">
                <div>
                  <div className="relative">
                    <LucideUser className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="text"
                      placeholder="اسم المستخدم"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-bold text-slate-900"
                    />
                  </div>
                </div>
                
                <div>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="password"
                      placeholder="كلمة المرور"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-bold text-slate-900"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-600 p-4 rounded-xl flex items-center gap-3 text-xs font-black border border-red-200 animate-shake">
                    <AlertCircle size={18} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-900 text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-xl shadow-blue-900/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <LogIn size={20} className="text-amber-300" />}
                  تسجيل الدخول
                </button>
              </form>

              <button 
                onClick={() => setIsRegistering(true)}
                className="w-full mt-4 py-3 bg-gradient-to-r from-amber-50/50 to-blue-50/50 text-slate-700 rounded-xl font-black flex items-center justify-center gap-2 hover:bg-amber-50 transition-all text-xs border border-amber-200/80 cursor-pointer"
              >
                <UserCircle size={16} className="text-amber-600" />
                ليس لديك حساب؟ اطلب الانضمام
              </button>

              <div className="relative my-7">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-4 text-slate-400 font-bold tracking-widest text-[10px]">أو للمسؤولين</span>
                </div>
              </div>

              <button 
                onClick={onGoogleLogin}
                className="w-full py-3.5 bg-white border border-slate-200 hover:border-blue-300 text-slate-700 rounded-2xl font-black flex items-center justify-center gap-3 hover:bg-blue-50/30 transition-all shadow-xs cursor-pointer text-xs"
              >
                <ShieldCheck size={18} className="text-blue-600" />
                دخول بواسطة Google Admin
              </button>

              <button 
                onClick={() => setShowAbout(true)}
                className="w-full mt-6 flex items-center justify-center gap-2 text-slate-400 hover:text-blue-700 transition-colors text-xs font-black cursor-pointer"
              >
                <Info size={14} className="text-amber-500" />
                حول تطبيق درة المنورة
              </button>
            </motion.div>
          ) : (
            <motion.div 
              key="change-password"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="text-center mt-2">
                <div className="w-16 h-16 bg-gradient-to-tr from-amber-100 to-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-sm">
                  <Key size={30} />
                </div>
                <h1 className="text-2xl font-black mb-1 text-center text-slate-900 font-sans tracking-tight">تغيير كلمة المرور</h1>
                <p className="text-slate-500 mb-8 text-center text-xs font-bold">يجب عليك تغيير كلمة المرور المؤقتة قبل المتابعة</p>
              </div>

              <form onSubmit={handlePasswordChange} className="space-y-5">
                <div>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="password"
                      placeholder="كلمة المرور الجديدة"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400 font-bold"
                    />
                  </div>
                </div>
                
                <div>
                  <div className="relative">
                    <CheckCircle2 className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input 
                      type="password"
                      placeholder="تأكيد كلمة المرور"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-12 pr-6 py-4 bg-slate-50/70 border border-slate-200 rounded-2xl focus:bg-white focus:ring-4 focus:ring-blue-50 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400 font-bold"
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 text-red-500 p-4 rounded-xl flex items-center gap-3 text-sm font-bold border border-red-100 animate-shake">
                    <AlertCircle size={18} className="shrink-0" />
                    {error}
                  </div>
                )}

                <button 
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-900 text-white rounded-2xl font-black flex items-center justify-center gap-3 hover:from-blue-800 hover:to-indigo-950 transition-all shadow-xl shadow-blue-900/20 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                >
                  {isLoading ? <Loader2 className="animate-spin" /> : <Save size={20} className="text-amber-300" />}
                  تـأكـيـد الـتـغـيـيـر
                </button>

                <button 
                  type="button"
                  onClick={() => setIsChangingPassword(false)}
                  className="w-full py-3 text-slate-400 font-bold hover:text-slate-600 transition-all text-xs cursor-pointer"
                >
                  إلغاء والعودة للخلف
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 pt-5 border-t border-slate-100 flex justify-between items-center opacity-40 select-none pointer-events-none">
          <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">DMTC Transport</span>
          <span className="text-[9px] font-bold text-slate-500">أحمد عبد الجليل</span>
        </div>
      </motion.div>
      )}
    </div>
  );
}
