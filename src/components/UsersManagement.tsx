import React, { useState, useEffect, useContext } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { UserPlus, Trash2, Shield, User, Key, Search, Save, Loader2, UserCheck, Crown, UserCog, UserCircle, Users, AlertTriangle, Pencil, X } from 'lucide-react';
import { UserRole, AuthContext } from '../App';
import { format } from 'date-fns';
import { updateDoc, serverTimestamp } from 'firebase/firestore';
import { MAX_RECEIPT_NAME_LENGTH, sanitizeReceiptName } from '../lib/issuerName';

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
  const [receiptModalUser, setReceiptModalUser] = useState<any | null>(null);
  const [receiptNameInput, setReceiptNameInput] = useState('');
  const [isSavingReceiptName, setIsSavingReceiptName] = useState(false);

  const isGM = currentUser?.role === 'general_manager';

  const openReceiptNameModal = (targetUser: any) => {
    if (!isGM) return;
    setReceiptModalUser(targetUser);
    setReceiptNameInput(sanitizeReceiptName(targetUser?.receiptName || ''));
  };

  const closeReceiptNameModal = () => {
    if (isSavingReceiptName) return;
    setReceiptModalUser(null);
    setReceiptNameInput('');
  };

  const handleSaveReceiptName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isGM || !receiptModalUser) return;
    const cleaned = sanitizeReceiptName(receiptNameInput);
    setIsSavingReceiptName(true);
    try {
      const userRef = doc(db, 'app_users', receiptModalUser.id);
      await updateDoc(userRef, {
        receiptName: cleaned,
        updatedAt: serverTimestamp(),
      });
      setReceiptModalUser(null);
      setReceiptNameInput('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `app_users/${receiptModalUser.id}`);
    } finally {
      setIsSavingReceiptName(false);
    }
  };

  useEffect(() => {
    if (!receiptModalUser) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSavingReceiptName) {
        setReceiptModalUser(null);
        setReceiptNameInput('');
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [receiptModalUser, isSavingReceiptName]);

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
    (u.displayName || '').includes(filter) ||
    (u.receiptName || '').includes(filter)
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
      className={`group flex items-center justify-between p-[var(--space-4)] lg:p-[var(--space-6)] border rounded-[1.5rem] transition-all ${
        u.role === 'pending' 
          ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-300 dark:border-amber-800/70 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:shadow-md' 
          : 'bg-[var(--surface-subtle)] border-[var(--border)] hover:bg-[var(--surface)] hover:shadow-md'
      }`}
    >
      <div className="flex items-center gap-[var(--space-4)]">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-lg shadow-sm ${
          u.role === 'general_manager' ? 'bg-[var(--gold)] text-[#0F172A]' : 
          u.role === 'supervisor' ? 'bg-[var(--btn-primary)] text-white' : 
          u.role === 'pending' ? 'bg-[var(--surface)] text-[var(--gold-text)] border-2 border-amber-300 dark:border-amber-700' :
          'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]'
        }`}>
          {u.displayName ? u.displayName[0].toUpperCase() : u.username?.[0].toUpperCase() || '?'}
        </div>
        <div>
          <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-1)]">
            {editingUserId === u.id ? (
              <div className="flex items-center gap-[var(--space-2)]">
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                  className="px-[var(--space-2)] py-[var(--space-1)] bg-[var(--surface)] text-[var(--text)] border border-[var(--primary)] rounded-lg text-sm font-bold focus:ring-2 focus:ring-blue-500/20 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleNameUpdate(u.id);
                    if (e.key === 'Escape') setEditingUserId(null);
                  }}
                />
                <button
                  onClick={() => handleNameUpdate(u.id)}
                  disabled={isSaving}
                  className="p-[var(--space-2)] bg-[var(--btn-primary)] text-white rounded-lg hover:bg-[var(--btn-primary-hover)] transition-colors"
                >
                  <Save size={14} />
                </button>
                <button
                  onClick={() => setEditingUserId(null)}
                  className="p-[var(--space-2)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface)] transition-colors"
                >
                  <span className="text-[10px] font-bold">إلغاء</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-[var(--space-2)]">
                <h3 className="font-black text-[var(--text)] leading-none">{u.displayName}</h3>
                {u.forcePasswordChange && (
                  <div className="flex items-center gap-[var(--space-1)] bg-red-50 dark:bg-red-950/40 text-[var(--danger)] px-[var(--space-2)] py-[var(--space-1)] rounded-lg text-[9px] font-black animate-pulse border border-red-200 dark:border-red-800/70">
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
                    className="p-[var(--space-1)] text-[var(--text-muted)] hover:text-[var(--primary)] transition-colors opacity-0 group-hover:opacity-100"
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
                  className={`text-[10px] px-[var(--space-2)] py-[var(--space-1)] rounded-full font-bold bg-[var(--surface)] border border-[var(--border)] focus:ring-2 focus:ring-blue-500/20 outline-none cursor-pointer hover:border-[var(--primary)] transition-all font-sans ${
                    u.role === 'pending' ? 'text-[var(--gold-text)] border-amber-300 dark:border-amber-700' : 'text-[var(--text-secondary)]'
                  }`}
                >
                  <option value="pending">قيد الانتظار</option>
                  <option value="data_entry">مدخل بيانات</option>
                  <option value="supervisor">مشرف</option>
                </select>
              ) : (
                <span className={`text-[10px] px-[var(--space-3)] py-[var(--space-1)] rounded-full font-bold ${
                  u.role === 'general_manager' ? 'bg-amber-100 text-[#B45309] dark:bg-amber-900/40 dark:text-[#FBBF24]' : 
                  u.role === 'supervisor' ? 'bg-blue-50 text-[#1D4ED8] dark:bg-blue-900/40 dark:text-[#93C5FD]' : 
                  u.role === 'pending' ? 'bg-amber-50 text-[var(--gold-text)] dark:bg-amber-950/40' :
                  'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]'
                }`}>
                  {u.role === 'general_manager' ? 'المدير العام' : u.role === 'supervisor' ? 'مشرف' : u.role === 'pending' ? 'قيد الانتظار' : 'مدخل بيانات'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-1)] text-xs">
            <span className="font-semibold text-[var(--text-secondary)]">
              يظهر في السند:{' '}
              {sanitizeReceiptName(u.receiptName) ? (
                <span className="font-extrabold text-[var(--text)]">
                  {sanitizeReceiptName(u.receiptName)}
                </span>
              ) : (
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  لم يُحدد بعد
                </span>
              )}
            </span>
            {isGM && (
              <button
                type="button"
                onClick={() => openReceiptNameModal(u)}
                title="تعديل الاسم الظاهر في السند"
                aria-label="تعديل الاسم الظاهر في السند"
                className="p-[var(--space-1)] rounded-lg text-[var(--text-muted)] hover:text-[var(--primary)] hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors cursor-pointer"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-[var(--space-2)] flex-wrap">
            <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-widest">{u.username || u.email}</span>
            {u.password && (
              <>
                <span className="text-[var(--text-muted)] text-xs font-bold">·</span>
                <span className="text-[10px] bg-[var(--surface)] border border-[var(--border)] px-[var(--space-2)] py-[var(--space-1)] rounded-full text-[var(--text-secondary)] font-bold tracking-tighter">Pass: {u.password}</span>
              </>
            )}
            {u.isGoogle && (
              <>
                <span className="text-[var(--text-muted)] text-xs font-bold">·</span>
                <span className="text-[10px] bg-blue-50 dark:bg-blue-950/40 text-[var(--primary)] px-[var(--space-2)] py-[var(--space-1)] rounded-full font-bold">Google Auth</span>
              </>
            )}
            {formattedUpdateDate && (
              <>
                <span className="text-[var(--text-muted)] text-xs font-bold">·</span>
                <span className="text-[10px] text-[var(--text-muted)] font-medium border-b border-[var(--border)]">تحديث: {formattedUpdateDate}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-[var(--space-2)]">
        {isGM && u.isCustom && (
          <button 
            onClick={() => handleResetPassword(u.id)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--primary)] hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all opacity-0 group-hover:opacity-100"
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
                ? 'bg-[#B91C1C] text-white animate-pulse opacity-100'
                : 'bg-[var(--surface)] text-[var(--text-muted)] border border-[var(--border)] hover:text-[var(--danger)] hover:bg-red-50 dark:hover:bg-red-950/40 opacity-0 group-hover:opacity-100'
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
    <div className="w-full p-0 space-y-[var(--space-4)]">
      {/* User Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-[var(--space-4)]">
        <div className="bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-[var(--border)] shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
            <div className="w-8 h-8 bg-[var(--navy)] text-white rounded-xl flex items-center justify-center">
              <Users size={16} />
            </div>
            <span className="text-xs font-bold text-[var(--text-secondary)]">الإجمالي</span>
          </div>
          <div className="text-3xl font-extrabold text-[var(--text)] tabular-nums">{stats.total}</div>
          <div className="text-xs font-medium text-[var(--text-muted)] mt-[var(--space-1)]">مستخدم مسجل</div>
        </div>

        <div className="bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-[var(--border)] shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
            <div className="w-8 h-8 bg-[var(--gold)] text-[#0F172A] rounded-xl flex items-center justify-center">
              <Crown size={16} />
            </div>
            <span className="text-xs font-bold text-[var(--gold-text)]">المدراء</span>
          </div>
          <div className="text-3xl font-extrabold text-[var(--text)] tabular-nums">{stats.gm}</div>
          <div className="text-xs font-medium text-[var(--text-muted)] mt-[var(--space-1)]">مدير عام</div>
        </div>

        <div className="bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-[var(--border)] shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
            <div className="w-8 h-8 bg-[var(--navy)] text-[var(--gold)] rounded-xl flex items-center justify-center">
              <UserCog size={16} />
            </div>
            <span className="text-xs font-bold text-[var(--primary)]">المشرفين</span>
          </div>
          <div className="text-3xl font-extrabold text-[var(--text)] tabular-nums">{stats.supervisor}</div>
          <div className="text-xs font-medium text-[var(--text-muted)] mt-[var(--space-1)]">مشرف نشط</div>
        </div>

        <div className="bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-[var(--border)] shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
            <div className="w-8 h-8 bg-[var(--btn-primary)] text-white rounded-xl flex items-center justify-center">
              <UserCircle size={16} />
            </div>
            <span className="text-xs font-bold text-[var(--primary)]">المدخلين</span>
          </div>
          <div className="text-3xl font-extrabold text-[var(--text)] tabular-nums">{stats.dataEntry}</div>
          <div className="text-xs font-medium text-[var(--text-muted)] mt-[var(--space-1)]">مدخل بيانات</div>
        </div>

        <div className="bg-[var(--surface)] p-[var(--space-4)] lg:p-[var(--space-6)] rounded-2xl border border-amber-300 dark:border-amber-800/80 shadow-2xs transition-all hover:shadow-sm">
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
            <div className="w-8 h-8 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-[var(--gold-text)] rounded-xl flex items-center justify-center">
              <UserPlus size={16} />
            </div>
            <span className="text-xs font-bold text-[var(--gold-text)]">الانتظار</span>
          </div>
          <div className="text-3xl font-extrabold text-[var(--gold-text)] tabular-nums">{stats.pending}</div>
          <div className="text-xs font-medium text-[var(--text-muted)] mt-[var(--space-1)]">بانتظار الموافقة</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-6)]">
      <div className="md:col-span-1">
        <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)] sticky top-[var(--space-8)] relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1.5 bg-[var(--primary)]"></div>
          <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-6)]">
            <div className="w-10 h-10 bg-[var(--navy)] rounded-xl flex items-center justify-center text-white shadow-sm">
              <UserPlus size={19} className="text-[var(--gold)]" />
            </div>
            <h3 className="text-lg font-extrabold text-[var(--text)]">إضافة مستخدم جديد</h3>
          </div>

          <form onSubmit={handleSave} className="space-y-[var(--space-5)]">
            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">اسم المستخدم (Login)</label>
              <div className="relative">
                <User className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                <input 
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Username..."
                  className="w-full pl-[var(--space-12)] pr-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] outline-none transition-all font-semibold text-sm text-[var(--text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">كلمة المرور</label>
              <div className="relative">
                <Key className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                <input 
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password..."
                  className="w-full pl-[var(--space-12)] pr-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] outline-none transition-all font-semibold text-sm text-[var(--text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">الاسم الكامل (يظهر في السند)</label>
              <div className="relative">
                <UserCheck className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
                <input 
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display Name..."
                  className="w-full pl-[var(--space-12)] pr-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] outline-none transition-all font-semibold text-sm text-[var(--text)]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)]">الصلاحيات</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] outline-none transition-all font-bold text-sm text-[var(--text)] cursor-pointer"
              >
                <option value="data_entry">مدخل بيانات</option>
                <option value="supervisor">مشرف</option>
              </select>
            </div>

            <button 
              type="submit" 
              disabled={isSaving}
              className="w-full py-[var(--space-4)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-[var(--space-2)] transition-all shadow-md cursor-pointer"
            >
              {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} className="text-[var(--gold)]" />}
              حفظ المستخدم
            </button>
          </form>
        </div>
      </div>

      <div className="md:col-span-2">
        <div className="bg-[var(--surface)] rounded-[2rem] p-[var(--space-4)] lg:p-[var(--space-8)] shadow-sm border border-[var(--border)]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-[var(--space-4)] mb-[var(--space-6)]">
            <h3 className="text-xl font-extrabold text-[var(--text)]">قائمة المستخدمين</h3>
            <div className="relative">
              <Search className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} />
              <input 
                type="text"
                placeholder="بحث عن مستخدم..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-[var(--space-12)] pr-[var(--space-5)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:border-[var(--primary)] outline-none w-full md:w-64 transition-all text-sm font-semibold text-[var(--text)]"
              />
            </div>
          </div>

          <div className="space-y-[var(--space-6)]">
            {pendingUsers.length > 0 && (
              <div className="space-y-[var(--space-3)]">
                <div className="flex items-center gap-[var(--space-2)] px-[var(--space-1)] text-[var(--gold-text)]">
                  <UserPlus size={17} />
                  <span className="text-xs font-extrabold">بانتظار الموافقة ({pendingUsers.length})</span>
                </div>
                <div className="space-y-[var(--space-3)]">
                  {pendingUsers.map(u => <UserCard key={u.id} u={u} />)}
                </div>
              </div>
            )}

            <div className="space-y-[var(--space-3)]">
              {pendingUsers.length > 0 && activeUsers.length > 0 && (
                <div className="flex items-center gap-[var(--space-2)] px-[var(--space-1)] text-[var(--text-secondary)] mt-[var(--space-4)]">
                  <User size={17} />
                  <span className="text-xs font-extrabold">المستخدمون النشطون</span>
                </div>
              )}
              <div className="space-y-[var(--space-3)]">
                {activeUsers.map((u) => <UserCard key={u.id} u={u} />)}
              </div>
            </div>
            
            {filteredUsers.length === 0 && (
              <div className="py-[var(--space-16)] text-center border-2 border-dashed border-[var(--border)] rounded-2xl">
                <User size={42} className="mx-auto text-[var(--text-muted)] mb-[var(--space-3)]" />
                <p className="text-[var(--text-secondary)] font-semibold text-sm">لم يتم العثور على مستخدمين</p>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Edit Receipt Name Modal (General Manager Only) */}
      {isGM && receiptModalUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-[var(--space-4)]"
          dir="rtl"
          onClick={closeReceiptNameModal}
        >
          <div
            className="w-full max-w-md bg-[var(--surface)] rounded-[1.75rem] border border-[var(--border)] shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-[var(--space-6)] py-[var(--space-4)] border-b border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-between gap-[var(--space-3)]">
              <div className="flex items-center gap-[var(--space-3)] min-w-0">
                <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200/80 dark:border-blue-800 text-[var(--primary)] flex items-center justify-center shrink-0">
                  <Pencil size={16} />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-[var(--text)] truncate">
                    الاسم الظاهر في السند
                  </h4>
                  <p className="text-[11px] font-bold text-[var(--text-muted)] truncate">
                    {receiptModalUser.displayName || receiptModalUser.username || receiptModalUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeReceiptNameModal}
                disabled={isSavingReceiptName}
                aria-label="إغلاق"
                className="w-8 h-8 rounded-xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer disabled:opacity-50"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveReceiptName} className="p-[var(--space-6)] space-y-[var(--space-4)]">
              <div>
                <div className="flex items-center justify-between mb-[var(--space-2)]">
                  <label
                    htmlFor="receipt-name-input"
                    className="block text-xs font-bold text-[var(--text-secondary)]"
                  >
                    الاسم الظاهر في السند
                  </label>
                  <span className="text-[11px] font-bold text-[var(--text-muted)] tabular-nums" dir="ltr">
                    {receiptNameInput.trim().length}/{MAX_RECEIPT_NAME_LENGTH}
                  </span>
                </div>
                <input
                  id="receipt-name-input"
                  type="text"
                  autoFocus
                  maxLength={MAX_RECEIPT_NAME_LENGTH}
                  value={receiptNameInput}
                  onChange={(e) => setReceiptNameInput(e.target.value.slice(0, MAX_RECEIPT_NAME_LENGTH))}
                  placeholder="مثال: أحمد عبدالجليل"
                  className="w-full px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-blue-500/10 focus:border-[var(--primary)] outline-none transition-all font-bold text-sm text-[var(--text)]"
                />
                <p className="mt-[var(--space-2)] text-[11px] font-semibold text-[var(--text-muted)] leading-relaxed">
                  هذا الاسم سيُطبع في السندات التي يصدرها هذا المستخدم
                </p>
              </div>

              <div className="flex items-center justify-end gap-[var(--space-3)] pt-[var(--space-2)]">
                <button
                  type="button"
                  onClick={closeReceiptNameModal}
                  disabled={isSavingReceiptName}
                  className="px-[var(--space-5)] py-[var(--space-2)] rounded-xl bg-[var(--surface-subtle)] hover:bg-[var(--border)] border border-[var(--border)] text-xs font-bold text-[var(--text-secondary)] transition-colors cursor-pointer disabled:opacity-50"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isSavingReceiptName}
                  className="px-[var(--space-5)] py-[var(--space-2)] rounded-xl bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-bold flex items-center gap-[var(--space-2)] transition-colors shadow-sm cursor-pointer disabled:opacity-60"
                >
                  {isSavingReceiptName ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Save size={14} className="text-[var(--gold)]" />
                  )}
                  <span>حفظ</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
