import React, { useState, useEffect, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { UserPlus, Trash2, Shield, User, Key, Search, Save, Loader2, UserCheck, Crown, UserCog, UserCircle, Users, AlertTriangle } from 'lucide-react';
import { UserRole, AuthContext } from '../App';
import { format } from 'date-fns';
import { updateDoc, serverTimestamp } from 'firebase/firestore';

export function UsersManagement() {
  const { user: currentUser } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<UserRole>('data_entry');
  const [users, setUsers] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const isGM = currentUser?.role === 'general_manager';

  const handleRoleUpdate = async (username: string, newRole: UserRole) => {
    setIsSaving(true);
    try {
      const userRef = doc(db, 'app_users', username);
      await updateDoc(userRef, {
        role: newRole,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `app_users/${username}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleNameUpdate = async (username: string) => {
    if (!editingName.trim()) return;
    setIsSaving(true);
    try {
      const userRef = doc(db, 'app_users', username);
      await updateDoc(userRef, {
        displayName: editingName.trim(),
        updatedAt: serverTimestamp()
      });
      setEditingUserId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `app_users/${username}`);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    const q = query(collection(db, 'app_users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Sort in memory: pending first, then by display name or email
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      allUsers.sort((a: any, b: any) => {
        if (a.role === 'pending' && b.role !== 'pending') return -1;
        if (a.role !== 'pending' && b.role === 'pending') return 1;
        const nameA = a.displayName || a.username || a.email || '';
        const nameB = b.displayName || b.username || b.email || '';
        return nameA.localeCompare(nameB, 'ar');
      });
      setUsers(allUsers);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'app_users');
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password || !displayName) return;

    setIsSaving(true);
    const normalizedUsername = username.trim().toLowerCase();
    try {
      const userRef = doc(db, 'app_users', normalizedUsername);
      await setDoc(userRef, {
        username: normalizedUsername,
        password: password.trim(), // Normalize password too just in case
        displayName: displayName.trim(),
        role,
        updatedAt: serverTimestamp()
      });
      setUsername('');
      setPassword('');
      setDisplayName('');
      setRole('data_entry');
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetPassword = async (id: string) => {
    const tempPass = Math.random().toString(36).slice(-8).toUpperCase();
    setIsSaving(true);
    try {
      const userRef = doc(db, 'app_users', id);
      await updateDoc(userRef, {
        password: tempPass,
        forcePasswordChange: true,
        updatedAt: serverTimestamp()
      });
      alert(`تم إعادة تعيين كلمة المرور بنجاح.\nكلمة المرور المؤقتة هي: ${tempPass}\nيرجى تزويد المستخدم بها.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `app_users/${id}`);
    } finally {
      setIsSaving(false);
    }
  };

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const deleteUser = async (id: string) => {
    const userToDelete = users.find(u => u.id === id);
    if (userToDelete?.role === 'general_manager') {
      alert('لا يمكن حذف حساب المدير العام نهائياً.');
      return;
    }

    if (deletingId === id) {
      try {
        setDeletingId(id);
        await deleteDoc(doc(db, 'app_users', id));
      } catch (error) {
        console.error(error);
        handleFirestoreError(error, OperationType.DELETE, `app_users/${id}`);
      } finally {
        setDeletingId(null);
      }
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(prev => prev === id ? null : prev), 3000);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.username || '').includes(filter.toLowerCase()) || 
    (u.email || '').includes(filter.toLowerCase()) ||
    (u.displayName || '').includes(filter)
  );

  const pendingUsers = filteredUsers.filter(u => u.role === 'pending');
  const activeUsers = filteredUsers.filter(u => u.role !== 'pending');

  const formatUserDate = (dateVal: any) => {
    if (!dateVal) return '';
    try {
      if (typeof dateVal?.toDate === 'function') {
        return format(dateVal.toDate(), 'yyyy/MM/dd HH:mm');
      }
      if (dateVal?.seconds) {
        return format(new Date(dateVal.seconds * 1000), 'yyyy/MM/dd HH:mm');
      }
      const d = new Date(dateVal);
      if (!isNaN(d.getTime())) {
        return format(d, 'yyyy/MM/dd HH:mm');
      }
    } catch (e) {
      console.error('Date formatting error:', e);
    }
    return '';
  };

  const UserCard = ({ u }: any) => {
    const formattedUpdateDate = formatUserDate(u.updatedAt);
    return (
    <div 
      className={`group flex items-center justify-between p-5 border rounded-[1.5rem] transition-all ${
        u.role === 'pending' 
          ? 'bg-amber-50/50 border-amber-200 hover:bg-amber-50 hover:shadow-xl hover:shadow-amber-100/50' 
          : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-xl hover:shadow-slate-100 hover:border-slate-200'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm ${
          u.role === 'general_manager' ? 'bg-amber-500 text-white shadow-amber-200' : 
          u.role === 'supervisor' ? 'bg-indigo-500 text-white shadow-indigo-200' : 
          u.role === 'pending' ? 'bg-white text-amber-600 border-2 border-amber-200' :
          'bg-white text-slate-600 border border-slate-200'
        }`}>
          {u.displayName ? u.displayName[0].toUpperCase() : u.username?.[0].toUpperCase() || '?'}
        </div>
        <div>
          <div className="flex items-center gap-2 mb-1">
            {editingUserId === u.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                  className="px-2 py-1 bg-white border border-indigo-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-indigo-100 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameUpdate(u.id);
                    if (e.key === 'Escape') setEditingUserId(null);
                  }}
                />
                <button
                  onClick={() => handleNameUpdate(u.id)}
                  disabled={isSaving}
                  className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Save size={14} />
                </button>
                <button
                  onClick={() => setEditingUserId(null)}
                  className="p-1.5 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition-colors"
                >
                  <span className="text-[10px] font-bold">إلغاء</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="font-black text-slate-800 leading-none">{u.displayName}</h3>
                {u.forcePasswordChange && (
                  <div className="flex items-center gap-1 bg-red-50 text-red-600 px-2 py-0.5 rounded-lg text-[9px] font-black animate-pulse border border-red-100">
                    <AlertTriangle size={10} />
                    <span>مطلوب تغيير كلمة المرور</span>
                  </div>
                )}
                {isGM && (
                  <button
                    onClick={() => {
                      setEditingUserId(u.id);
                      setEditingName(u.displayName || '');
                    }}
                    className="p-1 text-slate-300 hover:text-indigo-600 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <UserCog size={14} />
                  </button>
                )}
              </div>
            )}
            <div className="group/role relative">
              {isGM && u.role !== 'general_manager' ? (
                <select
                  value={u.role}
                  onChange={(e) => handleRoleUpdate(u.id, e.target.value as UserRole)}
                  className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-white border border-slate-200 focus:ring-2 focus:ring-indigo-100 outline-none cursor-pointer hover:border-indigo-300 transition-all font-sans ${
                    u.role === 'pending' ? 'text-amber-600 border-amber-200' : 'text-slate-600'
                  }`}
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="data_entry">مدخل بيانات</option>
                  <option value="supervisor">مشرف</option>
                </select>
              ) : (
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                  u.role === 'general_manager' ? 'bg-amber-100 text-amber-700' : 
                  u.role === 'supervisor' ? 'bg-indigo-100 text-indigo-700' : 
                  u.role === 'pending' ? 'bg-amber-50 text-amber-600' :
                  'bg-slate-100 text-slate-600'
                }`}>
                  {u.role === 'general_manager' ? 'المدير العام' : u.role === 'supervisor' ? 'مشرف' : u.role === 'pending' ? 'قيد الانتظار' : 'مدخل بيانات'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">{u.username || u.email}</span>
            {u.password && (
              <>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span className="text-[10px] bg-white border border-slate-100 px-2 py-0.5 rounded-full text-slate-400 font-bold tracking-tighter">Pass: {u.password}</span>
              </>
            )}
            {u.isGoogle && (
              <>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span className="text-[10px] bg-blue-50 text-blue-500 px-2 py-0.5 rounded-full font-bold">Google Auth</span>
              </>
            )}
            {formattedUpdateDate && (
              <>
                <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                <span className="text-[9px] text-slate-400 font-medium border-b border-slate-100">تحديث: {formattedUpdateDate}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {isGM && u.isCustom && (
          <button 
            onClick={() => handleResetPassword(u.id)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all opacity-0 group-hover:opacity-100"
            title="إعادة تعيين كلمة المرور"
          >
            <Key size={18} />
          </button>
        )}
        {u.role !== 'general_manager' && (
          <button 
            onClick={() => deleteUser(u.id)}
            className={`w-12 h-12 flex items-center justify-center rounded-xl transition-all ${
              deletingId === u.id
                ? 'bg-red-600 text-white animate-pulse opacity-100'
                : 'bg-white text-slate-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100'
            }`}
            title={deletingId === u.id ? "تأكيد الحذف" : "حذف المستخدم"}
          >
             {deletingId === u.id ? <span className="text-[10px] font-bold">تأكيد</span> : <Trash2 size={20} />}
          </button>
        )}
      </div>
    </div>
    );
  };

  const stats = {
    total: users.length,
    gm: users.filter(u => u.role === 'general_manager').length,
    supervisor: users.filter(u => u.role === 'supervisor').length,
    dataEntry: users.filter(u => u.role === 'data_entry').length,
    pending: users.filter(u => u.role === 'pending').length,
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* User Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center">
              <Users size={16} />
            </div>
            <span className="text-xs font-bold text-slate-600">الإجمالي</span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{stats.total}</div>
          <div className="text-xs font-medium text-slate-500 mt-1">مستخدم مسجل</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center">
              <Crown size={16} />
            </div>
            <span className="text-xs font-bold text-amber-700">المدراء</span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{stats.gm}</div>
          <div className="text-xs font-medium text-slate-500 mt-1">مدير عام</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-blue-800 text-white rounded-xl flex items-center justify-center">
              <UserCog size={16} />
            </div>
            <span className="text-xs font-bold text-blue-800">المشرفين</span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{stats.supervisor}</div>
          <div className="text-xs font-medium text-slate-500 mt-1">مشرف نشط</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-blue-600 text-white rounded-xl flex items-center justify-center">
              <UserCircle size={16} />
            </div>
            <span className="text-xs font-bold text-blue-700">المدخلين</span>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{stats.dataEntry}</div>
          <div className="text-xs font-medium text-slate-500 mt-1">مدخل بيانات</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 bg-amber-50 border border-amber-200 text-amber-600 rounded-xl flex items-center justify-center">
              <UserPlus size={16} />
            </div>
            <span className="text-xs font-bold text-amber-700">الانتظار</span>
          </div>
          <div className="text-3xl font-extrabold text-amber-600 tabular-nums">{stats.pending}</div>
          <div className="text-xs font-medium text-slate-500 mt-1">بانتظار الموافقة</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="md:col-span-1">
        <div className="bg-white rounded-[2rem] p-7 shadow-sm border border-slate-200/90 sticky top-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-l from-blue-950 via-blue-700 to-amber-500"></div>
          <div className="flex items-center gap-3 mb-7">
            <div className="w-10 h-10 bg-gradient-to-br from-slate-900 via-blue-950 to-blue-800 rounded-xl flex items-center justify-center text-white shadow-sm">
              <UserPlus size={19} className="text-amber-400" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">إضافة مستخدم جديد</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">اسم المستخدم (Login)</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username..."
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50/90 border border-slate-200/90 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">كلمة المرور</label>
              <div className="relative">
                <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password..."
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50/90 border border-slate-200/90 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">الاسم الكامل (يظهر في السند)</label>
              <div className="relative">
                <UserCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name..."
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50/90 border border-slate-200/90 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-semibold text-sm text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2 mr-1">الصلاحيات</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-4 py-3.5 bg-slate-50/90 border border-slate-200/90 rounded-xl focus:bg-white focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 outline-none transition-all font-bold text-sm text-slate-800 cursor-pointer"
              >
                <option value="data_entry">مدخل بيانات</option>
                <option value="supervisor">مشرف</option>
              </select>
            </div>

            <button 
              type="submit" 
              disabled={isSaving}
              className="w-full py-4 bg-gradient-to-l from-slate-900 via-blue-950 to-blue-800 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:opacity-95 transition-all shadow-md cursor-pointer"
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} className="text-amber-400" />}
              حـفـظ الـمـسـتـخـدم
            </button>
          </form>
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="bg-white rounded-[2rem] p-7 shadow-sm border border-slate-200/90">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-7">
            <h3 className="text-xl font-extrabold text-slate-900">قـائـمـة الـمـسـتـخـدمـيـن</h3>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text"
                placeholder="بحث عن مستخدم..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-11 pr-5 py-2.5 bg-slate-50/90 border border-slate-200/90 rounded-xl focus:bg-white focus:border-blue-600 outline-none w-full md:w-64 transition-all text-sm font-semibold"
              />
            </div>
          </div>

          <div className="space-y-6">
            {pendingUsers.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-1 text-amber-700">
                  <UserPlus size={17} />
                  <span className="text-xs font-extrabold">بانتظار الموافقة ({pendingUsers.length})</span>
                </div>
                <div className="space-y-2.5">
                  {pendingUsers.map(u => <UserCard key={u.id} u={u} />)}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {pendingUsers.length > 0 && activeUsers.length > 0 && (
                <div className="flex items-center gap-2 px-1 text-slate-600 mt-4">
                  <User size={17} />
                  <span className="text-xs font-extrabold">المستخدمون النشطون</span>
                </div>
              )}
              <div className="space-y-2.5">
                {activeUsers.map((u) => <UserCard key={u.id} u={u} />)}
              </div>
            </div>
            
            {filteredUsers.length === 0 && (
              <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
                <User size={42} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500 font-semibold text-sm">لم يتم العثور على مستخدمين</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
