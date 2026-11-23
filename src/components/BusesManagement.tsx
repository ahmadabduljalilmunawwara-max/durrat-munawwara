import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  serverTimestamp,
  getDocs,
} from 'firebase/firestore';
import {
  Plus,
  Trash2,
  Bus,
  User as UserIcon,
  Search,
  Save,
  Upload,
  Loader2,
  Clock,
  Edit2,
  X,
  Download,
  Filter,
  FileText,
  Phone,
  ShieldAlert,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  List,
  LayoutGrid,
  MoreHorizontal,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

type ViewMode = 'table' | 'cards';
type StatusFilter = 'all' | 'available' | 'active';

const VIEW_MODE_STORAGE_KEY = 'busesViewMode';
const BATCH_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 250;

export interface BusesManagementProps {
  onOpenVoucher?: (voucherNumber: string) => void;
}

interface BusRecord {
  id: string;
  busNumber: string;
  driverName: string;
  driverPhone?: string;
  busType?: string;
  updatedAt?: { toDate?: () => Date } | string | null;
}

const toEnglishDigits = (str: string): string =>
  str
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const formatBusUpdatedAt = (updatedAt: BusRecord['updatedAt']): string => {
  if (!updatedAt) return 'سجل تاريخي ثابت';
  try {
    if (typeof updatedAt === 'object' && typeof updatedAt.toDate === 'function') {
      return format(updatedAt.toDate(), 'yyyy-MM-dd HH:mm');
    }
    if (typeof updatedAt === 'string') {
      const parsed = new Date(updatedAt);
      if (!Number.isNaN(parsed.getTime())) {
        return format(parsed, 'yyyy-MM-dd HH:mm');
      }
    }
  } catch {
    // ignore formatting errors
  }
  return 'سجل تاريخي ثابت';
};

interface BusActionMenuProps {
  bus: BusRecord;
  voucherNum?: string;
  onViewDetails: (bus: BusRecord) => void;
  onEdit: (bus: BusRecord) => void;
  onRequestDelete: (bus: BusRecord) => void;
  onOpenVoucher?: (voucherNumber: string) => void;
}

const BusActionMenu: React.FC<BusActionMenuProps> = ({
  bus,
  voucherNum,
  onViewDetails,
  onEdit,
  onRequestDelete,
  onOpenVoucher,
}) => {
  const isUsed = Boolean(voucherNum);
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 224;
    const estimatedHeight = 160;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - menuWidth - 8)
    );
    const top = openUp ? rect.top - 6 : rect.bottom + 6;
    setCoords({ top, left, openUp });
  }, []);

  const closeMenu = useCallback((returnFocus = false) => {
    setIsOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    updateMenuPosition();

    // نقل التركيز لأول عنصر متاح عند الفتح
    const rafId = window.requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      );
      items?.[0]?.focus();
    });

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    const handleScrollOrResize = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.cancelAnimationFrame(rafId);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updateMenuPosition]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
      return;
    }

    const nodeList = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])'
    );
    const items: HTMLElement[] = nodeList ? Array.from(nodeList) : [];
    if (items.length === 0) return;

    const currentIdx = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIdx + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIdx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative inline-flex" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label={`إجراءات الحافلة ${bus.busNumber}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="w-8 h-8 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--primary)] hover:border-[var(--primary)] flex items-center justify-center transition-colors cursor-pointer"
      >
        <MoreHorizontal size={16} />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            dir="rtl"
            aria-label={`قائمة إجراءات الحافلة ${bus.busNumber}`}
            onKeyDown={handleMenuKeyDown}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: coords.openUp ? 'translateY(-100%)' : undefined,
            }}
            className="z-[90] w-56 bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-xl p-[var(--space-2)] space-y-[var(--space-1)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onViewDetails(bus);
              }}
              className="w-full flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-subtle)] focus:bg-[var(--surface-subtle)] outline-none transition-colors cursor-pointer text-right"
            >
              <Eye size={14} className="text-[var(--primary)] shrink-0" />
              <span>عرض التفاصيل</span>
            </button>

            {isUsed && voucherNum && onOpenVoucher && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onOpenVoucher(voucherNum);
                }}
                className="w-full flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 focus:bg-indigo-50 dark:focus:bg-indigo-950/50 outline-none transition-colors cursor-pointer text-right tabular-nums"
              >
                <FileText size={14} className="shrink-0" />
                <span>فتح السند #{voucherNum}</span>
              </button>
            )}

            {!isUsed && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onEdit(bus);
                }}
                className="w-full flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold text-[var(--text)] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:text-[var(--primary)] focus:bg-blue-50 dark:focus:bg-blue-950/40 outline-none transition-colors cursor-pointer text-right"
              >
                <Edit2 size={14} className="text-[var(--primary)] shrink-0" />
                <span>تعديل البيانات</span>
              </button>
            )}

            <div className="my-[var(--space-1)] border-t border-[var(--border)]" />

            {!isUsed ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setIsOpen(false);
                  onRequestDelete(bus);
                }}
                className="w-full flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold text-[var(--danger)] hover:bg-red-50 dark:hover:bg-red-950/50 focus:bg-red-50 dark:focus:bg-red-950/50 outline-none transition-colors cursor-pointer text-right"
              >
                <Trash2 size={14} className="shrink-0" />
                <span>حذف الحافلة</span>
              </button>
            ) : (
              <div
                role="menuitem"
                aria-disabled="true"
                className="w-full px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-[11px] font-bold text-[var(--text-muted)] bg-[var(--surface-subtle)]/70 select-none text-right leading-snug"
              >
                لا يمكن الحذف: الحافلة مرتبطة بسند
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

interface BusItemProps {
  bus: BusRecord;
  voucherNum?: string;
  isEditing: boolean;
  onViewDetails: (bus: BusRecord) => void;
  onEdit: (bus: BusRecord) => void;
  onRequestDelete: (bus: BusRecord) => void;
  onOpenVoucher?: (voucherNumber: string) => void;
}

const BusTableRow = React.memo<BusItemProps>(
  ({ bus, voucherNum, isEditing, onViewDetails, onEdit, onRequestDelete, onOpenVoucher }) => {
    const isUsed = Boolean(voucherNum);
    const updatedLabel = formatBusUpdatedAt(bus.updatedAt);

    return (
      <tr
        onClick={() => onViewDetails(bus)}
        className={`border-b border-[var(--border)] last:border-b-0 transition-colors cursor-pointer [content-visibility:auto] [contain-intrinsic-size:56px] ${
          isEditing
            ? 'bg-blue-50/60 dark:bg-blue-950/35'
            : 'hover:bg-[var(--surface-subtle)]'
        }`}
      >
        <td className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
          <div className="flex items-center gap-[var(--space-2)]">
            <span
              className={`inline-flex items-center justify-center min-w-[44px] h-9 px-[var(--space-2)] rounded-xl font-extrabold text-sm tabular-nums shadow-2xs ${
                isEditing
                  ? 'bg-[var(--btn-primary)] text-white'
                  : isUsed
                  ? 'bg-[var(--primary)] text-white'
                  : 'bg-[var(--navy)] text-white'
              }`}
            >
              {bus.busNumber}
            </span>
            {bus.busType && bus.busType !== 'غير محدد' && (
              <span className="text-[11px] font-bold px-[var(--space-2)] py-[2px] rounded-md bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] max-w-[110px] truncate">
                {bus.busType}
              </span>
            )}
          </div>
        </td>

        <td className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
          {isUsed ? (
            <span className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[var(--primary)] border border-blue-200 dark:border-blue-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
              نشطة بالسندات
            </span>
          ) : (
            <span className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-[var(--success)] shrink-0" />
              متاحة
            </span>
          )}
        </td>

        <td className="px-[var(--space-4)] py-[var(--space-3)]">
          <span className="text-sm font-bold text-[var(--text)] block truncate max-w-[200px]">
            {bus.driverName}
          </span>
        </td>

        <td className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
          <span
            dir="ltr"
            className="text-xs font-bold text-[var(--text-secondary)] tabular-nums inline-block"
          >
            {bus.driverPhone || '---'}
          </span>
        </td>

        <td className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
          {isUsed && voucherNum ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenVoucher?.(voucherNum);
              }}
              title={`فتح السند رقم ${voucherNum}`}
              className="inline-flex items-center gap-[var(--space-1)] px-[var(--space-3)] py-[var(--space-1)] rounded-xl bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-extrabold tabular-nums transition-colors cursor-pointer"
            >
              <FileText size={13} className="shrink-0" />
              <span>#{voucherNum}</span>
            </button>
          ) : (
            <span className="text-xs font-semibold text-[var(--text-muted)]">—</span>
          )}
        </td>

        <td className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
          <span className="text-xs font-medium text-[var(--text-muted)] tabular-nums">
            {updatedLabel}
          </span>
        </td>

        <td className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap text-left">
          <BusActionMenu
            bus={bus}
            voucherNum={voucherNum}
            onViewDetails={onViewDetails}
            onEdit={onEdit}
            onRequestDelete={onRequestDelete}
            onOpenVoucher={onOpenVoucher}
          />
        </td>
      </tr>
    );
  }
);

const BusMobileCompactCard = React.memo<BusItemProps>(
  ({ bus, voucherNum, isEditing, onViewDetails, onEdit, onRequestDelete, onOpenVoucher }) => {
    const isUsed = Boolean(voucherNum);

    return (
      <div
        onClick={() => onViewDetails(bus)}
        className={`p-[var(--space-3)] rounded-2xl border transition-colors cursor-pointer flex items-center justify-between gap-[var(--space-3)] [content-visibility:auto] [contain-intrinsic-size:74px] ${
          isEditing
            ? 'bg-blue-50/50 dark:bg-blue-950/30 border-[var(--primary)]'
            : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)]'
        }`}
      >
        <div className="flex items-center gap-[var(--space-3)] min-w-0 flex-1">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center font-extrabold text-sm tabular-nums shrink-0 ${
              isEditing
                ? 'bg-[var(--btn-primary)] text-white'
                : isUsed
                ? 'bg-[var(--primary)] text-white'
                : 'bg-[var(--navy)] text-white'
            }`}
          >
            {bus.busNumber}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[var(--text)] truncate">
              {bus.driverName}
            </p>
            <div className="mt-[var(--space-1)]">
              {isUsed ? (
                <span className="inline-flex items-center gap-1.5 px-[var(--space-2)] py-[2px] rounded-lg bg-blue-50 dark:bg-blue-950/50 text-[var(--primary)] border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                  نشطة بالسندات
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-[var(--space-2)] py-[2px] rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)]" />
                  متاحة
                </span>
              )}
            </div>
          </div>
        </div>

        <BusActionMenu
          bus={bus}
          voucherNum={voucherNum}
          onViewDetails={onViewDetails}
          onEdit={onEdit}
          onRequestDelete={onRequestDelete}
          onOpenVoucher={onOpenVoucher}
        />
      </div>
    );
  }
);

const BusGridCard = React.memo<BusItemProps>(
  ({ bus, voucherNum, isEditing, onViewDetails, onEdit, onRequestDelete, onOpenVoucher }) => {
    const isUsed = Boolean(voucherNum);
    const updatedLabel = formatBusUpdatedAt(bus.updatedAt);

    return (
      <article
        onClick={() => onViewDetails(bus)}
        className={`h-full p-[var(--space-5)] rounded-3xl border transition-all duration-200 flex flex-col justify-between cursor-pointer [content-visibility:auto] [contain-intrinsic-size:230px] ${
          isEditing
            ? 'bg-blue-50/40 dark:bg-blue-950/30 border-[var(--primary)] ring-4 ring-blue-500/10 shadow-md'
            : isUsed
            ? 'bg-[var(--surface)] border-blue-200 dark:border-blue-800/80 hover:border-[var(--primary)] hover:shadow-md'
            : 'bg-[var(--surface)] border-[var(--border)] hover:border-[var(--primary)] hover:shadow-md'
        }`}
      >
        <div>
          {/* Header: رقم الحافلة + شارة الفئة بجانبه + الحالة وقائمة (⋯) */}
          <div className="flex items-start justify-between gap-[var(--space-2)] mb-[var(--space-5)]">
            <div className="flex items-center gap-[var(--space-2)] min-w-0 flex-wrap">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-lg tabular-nums shrink-0 shadow-2xs ${
                  isEditing
                    ? 'bg-[var(--btn-primary)] text-white'
                    : isUsed
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-[var(--navy)] text-white'
                }`}
              >
                {bus.busNumber}
              </div>
              <span className="text-[11px] font-bold px-[var(--space-2)] py-[var(--space-1)] rounded-lg bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] truncate max-w-[120px]">
                {bus.busType || 'غير محدد'}
              </span>
            </div>

            <div className="flex items-center gap-[var(--space-2)] shrink-0">
              {isUsed ? (
                <span className="inline-flex items-center gap-1.5 px-[var(--space-2)] py-[var(--space-1)] rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[var(--primary)] border border-blue-200 dark:border-blue-800 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-[var(--primary)] shrink-0" />
                  نشطة بالسندات
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-[var(--space-2)] py-[var(--space-1)] rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[var(--success)] border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-[var(--success)] shrink-0" />
                  متاحة
                </span>
              )}

              <BusActionMenu
                bus={bus}
                voucherNum={voucherNum}
                onViewDetails={onViewDetails}
                onEdit={onEdit}
                onRequestDelete={onRequestDelete}
                onOpenVoucher={onOpenVoucher}
              />
            </div>
          </div>

          {/* بيانات السائق والهاتف */}
          <div className="space-y-[var(--space-3)]">
            <div className="flex items-center gap-[var(--space-3)]">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                  isUsed
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 text-[var(--primary)] border-blue-200 dark:border-blue-800/70'
                    : 'bg-[var(--surface-subtle)] text-[var(--primary)] border-[var(--border)]'
                }`}
              >
                <UserIcon size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">السائق الفعلي</p>
                <p className="text-sm font-extrabold text-[var(--text)] truncate">{bus.driverName}</p>
              </div>
            </div>

            <div className="flex items-center gap-[var(--space-3)]">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                  isUsed
                    ? 'bg-blue-50/70 dark:bg-blue-950/30 text-[var(--primary)] border-blue-200 dark:border-blue-800/70'
                    : 'bg-[var(--surface-subtle)] text-[var(--primary)] border-[var(--border)]'
                }`}
              >
                <Phone size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">رقم الهاتف</p>
                <p
                  dir="ltr"
                  className="text-sm font-bold text-[var(--text)] tabular-nums truncate text-right"
                >
                  {bus.driverPhone || '---'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* سطر سفلي موحّد الارتفاع: آخر تعديل + شارة السند في نفس السطر */}
        <div
          className={`mt-[var(--space-4)] pt-[var(--space-3)] border-t flex items-center justify-between gap-[var(--space-2)] min-h-[40px] ${
            isUsed ? 'border-blue-200/80 dark:border-blue-900/50' : 'border-[var(--border)]'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-muted)] tabular-nums truncate">
            <Clock size={12} className="shrink-0" />
            <span className="truncate">{updatedLabel}</span>
          </div>

          {isUsed && voucherNum && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenVoucher?.(voucherNum);
              }}
              title={`فتح السند رقم ${voucherNum}`}
              className="inline-flex items-center gap-1 px-[var(--space-2)] py-[var(--space-1)] rounded-lg bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-extrabold tabular-nums shrink-0 transition-colors cursor-pointer"
            >
              <FileText size={12} className="shrink-0" />
              <span>سند #{voucherNum}</span>
            </button>
          )}
        </div>
      </article>
    );
  }
);

export function BusesManagement({ onOpenVoucher }: BusesManagementProps = {}) {
  const [busNumber, setBusNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [busType, setBusType] = useState('');
  const [editingBus, setEditingBus] = useState<BusRecord | null>(null);
  const [buses, setBuses] = useState<BusRecord[]>([]);
  const [usedBusesInfo, setUsedBusesInfo] = useState<Record<string, string>>({});

  // حالات الفلترة والبحث والعرض والأداء
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (saved === 'table' || saved === 'cards') return saved;
    } catch {
      // ignore storage read error
    }
    return 'table';
  });
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busTypeFilter, setBusTypeFilter] = useState<string>('all');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);

  // حالات الحفظ والاستيراد والنوافذ
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedBusDetails, setSelectedBusDetails] = useState<BusRecord | null>(null);
  const [busToDelete, setBusToDelete] = useState<BusRecord | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);

  // Delete All State
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deleteSuccess, setDeleteSuccess] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);

  // حفظ طريقة العرض في localStorage
  const handleChangeViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // ignore storage write error
    }
  }, []);

  // مزامنة الحافلات من Firestore (دون تغيير مصدر البيانات)
  useEffect(() => {
    const q = query(collection(db, 'buses'), orderBy('busNumber'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setBuses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BusRecord, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'buses')
    );
    return unsub;
  }, []);

  // مزامنة السندات النشطة (دون تغيير مصدر البيانات)
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'vouchers'),
      (snap) => {
        const usedInfo: Record<string, string> = {};
        snap.forEach((d) => {
          const data = d.data();
          if (data.archived === true) return;
          const vNum = data.voucherNumber || '---';
          if (data.busNumber) {
            usedInfo[data.busNumber] = vNum;
          }
          if (data.buses && Array.isArray(data.buses)) {
            data.buses.forEach((b: { busNumber?: string }) => {
              if (b.busNumber) {
                usedInfo[b.busNumber] = vNum;
              }
            });
          }
        });
        setUsedBusesInfo(usedInfo);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'vouchers')
    );
    return unsub;
  }, []);

  // Debounce للبحث بمقدار 250ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // العودة لبداية القائمة عند تغير البحث أو أي فلتر
  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [debouncedSearch, statusFilter, busTypeFilter]);

  // اختصار "/" للانتقال لحقل البحث من أي مكان في الصفحة
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (showDeleteAllModal || selectedBusDetails || busToDelete) return;

      const activeTag = (document.activeElement as HTMLElement | null)?.tagName?.toLowerCase();
      const isEditable =
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        activeTag === 'select' ||
        (document.activeElement as HTMLElement | null)?.isContentEditable;

      if (isEditable) return;

      e.preventDefault();
      searchInputRef.current?.focus();
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [showDeleteAllModal, selectedBusDetails, busToDelete]);

  // إغلاق نوافذ التفاصيل والحذف بالضغط على Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (busToDelete && !isDeletingSingle) {
        setBusToDelete(null);
      } else if (selectedBusDetails) {
        setSelectedBusDetails(null);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [busToDelete, isDeletingSingle, selectedBusDetails]);

  const handleSaveBus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!busNumber || !driverName) return;

    setIsSaving(true);
    try {
      if (editingBus && editingBus.id !== busNumber) {
        await deleteDoc(doc(db, 'buses', editingBus.id));
      }

      await setDoc(doc(db, 'buses', busNumber), {
        busNumber,
        driverName,
        driverPhone,
        busType: busType || 'غير محدد',
        updatedAt: serverTimestamp(),
      });

      setBusNumber('');
      setDriverName('');
      setDriverPhone('');
      setBusType('');
      setEditingBus(null);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.WRITE, `buses/${busNumber}`);
    } finally {
      setIsSaving(false);
    }
  };

  const cancelEdit = useCallback(() => {
    setEditingBus(null);
    setBusNumber('');
    setDriverName('');
    setDriverPhone('');
    setBusType('');
  }, []);

  const startEditBus = useCallback((b: BusRecord) => {
    setEditingBus(b);
    setBusNumber(b.busNumber);
    setDriverName(b.driverName);
    setDriverPhone(b.driverPhone || '');
    setBusType(b.busType || '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const confirmDeleteSingleBus = async () => {
    if (!busToDelete || isDeletingSingle) return;
    setIsDeletingSingle(true);
    try {
      await deleteDoc(doc(db, 'buses', busToDelete.id));
      if (editingBus?.id === busToDelete.id) {
        cancelEdit();
      }
      if (selectedBusDetails?.id === busToDelete.id) {
        setSelectedBusDetails(null);
      }
      setBusToDelete(null);
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.DELETE, `buses/${busToDelete.id}`);
    } finally {
      setIsDeletingSingle(false);
    }
  };

  const handleDeleteAllBuses = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setDeleteError('');

    if (deletePassword !== 'A1994ahmed2026') {
      setDeleteError('كلمة المرور غير صحيحة! يرجى إدخال كلمة السر المصرحة لإتمام الحذف.');
      return;
    }

    setIsDeletingAll(true);
    try {
      const snap = await getDocs(collection(db, 'buses'));
      const docs = snap.docs;

      const batchSize = 500;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }

      setShowDeleteAllModal(false);
      setDeletePassword('');
      setDeleteError('');
      setDeleteSuccess(
        'تم مسح جميع الحافلات من قائمة الأسطول بنجاح. السندات والسجلات السابقة محفوظة ومحمية بالكامل.'
      );
      setTimeout(() => setDeleteSuccess(''), 6000);
    } catch (error) {
      console.error('Delete all buses error:', error);
      handleFirestoreError(error, OperationType.DELETE, 'buses');
      setDeleteError('حدث خطأ أثناء محاولة مسح الحافلات. يرجى المحاولة مرة أخرى.');
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

        const batchSize = 500;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = data.slice(i, i + batchSize);

          chunk.forEach((row) => {
            const bNum = String(row['رقم الحافلة'] || row['busNumber'] || row['BusNumber'] || '');
            const dName = String(row['اسم السائق'] || row['driverName'] || row['DriverName'] || '');
            const dPhone = String(
              row['رقم الهاتف'] || row['driverPhone'] || row['DriverPhone'] || ''
            );
            const bType = String(
              row['نوع الحافلة'] || row['busType'] || row['BusType'] || 'غير محدد'
            );

            if (bNum && dName) {
              const busRef = doc(db, 'buses', bNum);
              batch.set(busRef, {
                busNumber: bNum,
                driverName: dName,
                driverPhone: dPhone,
                busType: bType,
                updatedAt: serverTimestamp(),
              });
            }
          });

          await batch.commit();
        }
        alert('تم استيراد البيانات بنجاح');
      } catch (err) {
        console.error('Import error:', err);
        alert(
          'حدث خطأ أثناء استيراد الملف. تأكد من أن الملف بصيغة Excel ويحتوي على أعمدة باسم (رقم الحافلة) و (اسم السائق)'
        );
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleExportExcel = () => {
    try {
      const exportData = buses.map((bus) => ({
        'رقم الحافلة': bus.busNumber,
        'نوع الحافلة': bus.busType || 'غير محدد',
        'اسم السائق': bus.driverName,
        'رقم الهاتف': bus.driverPhone || '---',
        'آخر تحديث':
          bus.updatedAt &&
          typeof bus.updatedAt === 'object' &&
          typeof bus.updatedAt.toDate === 'function'
            ? format(bus.updatedAt.toDate(), 'yyyy-MM-dd HH:mm')
            : bus.updatedAt && typeof bus.updatedAt === 'string'
            ? format(new Date(bus.updatedAt), 'yyyy-MM-dd HH:mm')
            : '---',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws['!cols'] = [{ wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'الحافلات');
      XLSX.writeFile(wb, `قائمة_الحافلات_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    } catch (error) {
      console.error('Export error:', error);
      alert('حدث خطأ أثناء تصدير الملف');
    }
  };

  // بناء قائمة الفئات تلقائيًا من البيانات الموجودة
  const busCategories = useMemo(() => {
    const set = new Set<string>();
    buses.forEach((b) => {
      const category = (b.busType || 'غير محدد').trim() || 'غير محدد';
      set.add(category);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [buses]);

  // حساب العدّادات لجميع الحالات
  const counts = useMemo(() => {
    let active = 0;
    for (let i = 0; i < buses.length; i += 1) {
      if (usedBusesInfo[buses[i].busNumber]) {
        active += 1;
      }
    }
    return {
      total: buses.length,
      active,
      available: buses.length - active,
    };
  }, [buses, usedBusesInfo]);

  // تصفية القائمة (بحث + حالة + فئة)
  const filteredBuses = useMemo(() => {
    const queryLower = debouncedSearch.toLowerCase();
    const queryNormalized = toEnglishDigits(queryLower);

    return buses.filter((b) => {
      const isUsed = Boolean(usedBusesInfo[b.busNumber]);
      if (statusFilter === 'available' && isUsed) return false;
      if (statusFilter === 'active' && !isUsed) return false;

      const category = (b.busType || 'غير محدد').trim() || 'غير محدد';
      if (busTypeFilter !== 'all' && category !== busTypeFilter) return false;

      if (queryLower) {
        const numMatch = toEnglishDigits(String(b.busNumber || '').toLowerCase()).includes(
          queryNormalized
        );
        const driverMatch = String(b.driverName || '').toLowerCase().includes(queryLower);
        const typeMatch = String(b.busType || '').toLowerCase().includes(queryLower);
        const phoneMatch = toEnglishDigits(String(b.driverPhone || '').toLowerCase()).includes(
          queryNormalized
        );

        if (!numMatch && !driverMatch && !typeMatch && !phoneMatch) return false;
      }

      return true;
    });
  }, [buses, usedBusesInfo, statusFilter, busTypeFilter, debouncedSearch]);

  const visibleBuses = useMemo(
    () => filteredBuses.slice(0, visibleCount),
    [filteredBuses, visibleCount]
  );

  const hasMore = visibleCount < filteredBuses.length;
  const hasActiveFilters =
    searchInput.trim() !== '' || statusFilter !== 'all' || busTypeFilter !== 'all';

  const clearAllFilters = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setBusTypeFilter('all');
    setVisibleCount(BATCH_SIZE);
  }, []);

  // تحميل تلقائي عند الوصول لنهاية القائمة
  useEffect(() => {
    if (!hasMore || !loadMoreSentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredBuses.length));
        }
      },
      { rootMargin: '200px 0px' }
    );

    observer.observe(loadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, filteredBuses.length, viewMode]);

  return (
    <div className="w-full space-y-[var(--space-3)]" dir="rtl">
      {/* Top Section: Add/Edit Form */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-[var(--surface)] rounded-2xl p-[var(--space-4)] lg:p-[var(--space-6)] shadow-2xs border transition-all flex flex-col relative overflow-hidden ${
          editingBus ? 'border-[var(--primary)] ring-4 ring-blue-500/10' : 'border-[var(--border)]'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-[var(--space-6)] mb-[var(--space-6)]">
          <div className="flex items-center gap-[var(--space-4)]">
            <div
              className={`w-12 h-12 ${
                editingBus ? 'bg-[var(--btn-primary)]' : 'bg-[var(--navy)]'
              } rounded-2xl flex items-center justify-center text-white shadow-md shrink-0`}
            >
              {editingBus ? (
                <Edit2 size={22} className="text-[var(--gold)]" />
              ) : (
                <Plus size={22} className="text-[var(--gold)]" />
              )}
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-[var(--text)] leading-snug">
                {editingBus ? 'تحرير بيانات الحافلة' : 'إضافة حافلة جديدة للنظام'}
              </h3>
              <p className="text-xs text-[var(--text-secondary)] font-semibold mt-[var(--space-1)]">
                إدارة الأصول المركزية والمزامنة اللحظية
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-[var(--space-3)] w-full md:w-auto">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".xlsx, .xls"
              onChange={handleExcelImport}
            />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1 md:flex-none flex items-center justify-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text)] rounded-xl font-bold text-xs hover:bg-blue-50/40 dark:hover:bg-blue-950/30 transition-all cursor-pointer"
            >
              {isImporting ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <Upload size={16} className="text-[var(--text-secondary)]" />
              )}
              <span>استيراد</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={handleExportExcel}
              disabled={buses.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/70 text-[var(--primary)] rounded-xl font-bold text-xs hover:bg-blue-100 dark:hover:bg-blue-950/60 transition-all cursor-pointer disabled:opacity-40"
            >
              <Download size={16} />
              <span>تصدير</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => {
                setDeletePassword('');
                setDeleteError('');
                setShowDeleteAllModal(true);
              }}
              disabled={buses.length === 0}
              className="flex-1 md:flex-none flex items-center justify-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 text-[var(--danger)] rounded-xl font-bold text-xs hover:bg-red-100 dark:hover:bg-red-950/60 transition-all cursor-pointer disabled:opacity-40"
              title="مسح جميع الحافلات من الأسطول (مشروط بكلمة سر)"
            >
              <Trash2 size={16} />
              <span>مسح الكل</span>
            </motion.button>
          </div>
        </div>

        {/* Delete Success Toast Banner */}
        <AnimatePresence>
          {deleteSuccess && (
            <motion.div
              initial={{ opacity: 0, height: 0, y: -10 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              className="mb-[var(--space-6)] p-[var(--space-4)] bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 text-[var(--success)] rounded-2xl flex items-center justify-between gap-[var(--space-3)] text-xs font-bold shadow-2xs"
            >
              <div className="flex items-center gap-[var(--space-3)]">
                <CheckCircle2 size={18} className="shrink-0" />
                <span>{deleteSuccess}</span>
              </div>
              <button
                type="button"
                aria-label="إغلاق التنبيه"
                onClick={() => setDeleteSuccess('')}
                className="text-[var(--success)] hover:opacity-80 p-[var(--space-1)] cursor-pointer"
              >
                <X size={16} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSaveBus} className="space-y-[var(--space-5)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--space-5)]">
            <div className="group">
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)] group-focus-within:text-[var(--primary)] transition-colors">
                رقم الحافلة
              </label>
              <div className="relative">
                <Bus
                  className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  required
                  value={busNumber}
                  onChange={(e) => setBusNumber(e.target.value)}
                  className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-[var(--text)] text-sm tabular-nums"
                  placeholder="مثلاً: 5040"
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)] group-focus-within:text-[var(--primary)] transition-colors">
                نوع الحافلة
              </label>
              <div className="relative">
                <Filter
                  className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  value={busType}
                  onChange={(e) => setBusType(e.target.value)}
                  className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-[var(--text)] text-sm"
                  placeholder="VIP، مرسيدس..."
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)] group-focus-within:text-[var(--primary)] transition-colors">
                اسم السائق الثابت
              </label>
              <div className="relative">
                <UserIcon
                  className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  required
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-[var(--text)] text-sm"
                  placeholder="الاسم الثلاثي..."
                />
              </div>
            </div>

            <div className="group">
              <label className="block text-xs font-bold text-[var(--text-secondary)] mb-[var(--space-2)] group-focus-within:text-[var(--primary)] transition-colors">
                رقم الهاتف
              </label>
              <div className="relative">
                <Phone
                  className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--primary)] transition-colors"
                  size={18}
                />
                <input
                  type="text"
                  value={driverPhone}
                  onChange={(e) => setDriverPhone(e.target.value)}
                  className="w-full pr-[var(--space-12)] pl-[var(--space-4)] py-[var(--space-3)] bg-[var(--surface-subtle)] rounded-xl focus:bg-[var(--surface)] border border-[var(--border)] focus:border-[var(--primary)] focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-semibold text-[var(--text)] text-sm tabular-nums"
                  placeholder="مثلاً: 05xxxxxxx"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-[var(--space-3)] justify-end">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isSaving}
              className="flex-1 py-[var(--space-3)] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-[var(--space-3)] transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSaving ? (
                <Loader2 className="animate-spin" size={18} />
              ) : editingBus ? (
                <Save size={18} className="text-[var(--gold)]" />
              ) : (
                <Plus size={18} className="text-[var(--gold)]" />
              )}
              <span>{editingBus ? 'تحديث' : 'إضافة'}</span>
            </motion.button>

            {editingBus && (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                type="button"
                aria-label="إلغاء التعديل"
                onClick={cancelEdit}
                className="px-[var(--space-4)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)] rounded-xl hover:bg-[var(--surface)] transition-all flex items-center justify-center cursor-pointer"
              >
                <X size={18} />
              </motion.button>
            )}
          </div>
        </form>
      </motion.div>

      {/* شريط الفلاتر والبحث وتبديل العرض */}
      <section className="bg-[var(--surface)] p-[var(--space-4)] rounded-2xl border border-[var(--border)] shadow-2xs space-y-[var(--space-3)]">
        {/* الصف العلوي: البحث + مفتاح التبديل بين جدول وبطاقات */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-3)]">
          <div className="relative flex-1 flex items-center bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl px-[var(--space-3)] focus-within:bg-[var(--surface)] focus-within:ring-4 focus-within:ring-blue-500/10 focus-within:border-[var(--primary)] transition-all">
            <Search size={18} className="text-[var(--text-muted)] shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="البحث في الحافلات"
              className="w-full bg-transparent outline-none text-sm font-bold text-[var(--text)] py-[var(--space-3)] px-[var(--space-3)]"
              placeholder="ابحث برقم الحافلة، اسم السائق، رقم الهاتف، أو النوع..."
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setDebouncedSearch('');
                }}
                aria-label="مسح نص البحث"
                className="p-1 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer shrink-0"
              >
                <X size={15} />
              </button>
            ) : (
              <kbd
                dir="ltr"
                title="اضغط / للتركيز على البحث"
                className="hidden sm:inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--border)] text-[11px] font-mono font-bold text-[var(--text-muted)] shrink-0"
              >
                /
              </kbd>
            )}
          </div>

          {/* مفتاح تبديل العرض: جدول مضغوط / بطاقات */}
          <div
            role="group"
            aria-label="تبديل طريقة العرض"
            className="inline-flex items-center p-1 bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl shrink-0 self-end sm:self-auto"
          >
            <button
              type="button"
              onClick={() => handleChangeViewMode('table')}
              aria-label="عرض جدول"
              aria-pressed={viewMode === 'table'}
              className={`inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'table'
                  ? 'bg-[var(--btn-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              <List size={15} />
              <span>جدول</span>
            </button>

            <button
              type="button"
              onClick={() => handleChangeViewMode('cards')}
              aria-label="عرض بطاقات"
              aria-pressed={viewMode === 'cards'}
              className={`inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[var(--btn-primary)] text-white shadow-2xs'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text)]'
              }`}
            >
              <LayoutGrid size={15} />
              <span>بطاقات</span>
            </button>
          </div>
        </div>

        {/* الصف السفلي: الفلاتر السريعة + فلتر الفئة + مسح الفلاتر + عدّاد النتائج */}
        <div className="flex flex-wrap items-center justify-between gap-[var(--space-3)] pt-[var(--space-1)]">
          <div className="flex flex-wrap items-center gap-[var(--space-2)]">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold border transition-colors cursor-pointer tabular-nums ${
                statusFilter === 'all'
                  ? 'bg-[var(--navy)] text-white border-[var(--navy)]'
                  : 'bg-[var(--surface-subtle)] text-[var(--text-secondary)] border-[var(--border)] hover:border-[var(--primary)]'
              }`}
            >
              <span>الكل</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                  statusFilter === 'all'
                    ? 'bg-white/15 text-white'
                    : 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)]'
                }`}
              >
                {counts.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('available')}
              className={`inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold border transition-colors cursor-pointer tabular-nums ${
                statusFilter === 'available'
                  ? 'bg-[var(--success)] text-white border-[var(--success)]'
                  : 'bg-emerald-50/70 dark:bg-emerald-950/30 text-[var(--success)] border-emerald-200 dark:border-emerald-800 hover:border-[var(--success)]'
              }`}
            >
              <span>متاحة</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                  statusFilter === 'available'
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--surface)] text-[var(--success)] border border-emerald-200 dark:border-emerald-800'
                }`}
              >
                {counts.available}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              className={`inline-flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] rounded-xl text-xs font-bold border transition-colors cursor-pointer tabular-nums ${
                statusFilter === 'active'
                  ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                  : 'bg-blue-50/80 dark:bg-blue-950/40 text-[var(--primary)] border-blue-200 dark:border-blue-800 hover:border-[var(--primary)]'
              }`}
            >
              <span>نشطة بالسندات</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[11px] font-extrabold ${
                  statusFilter === 'active'
                    ? 'bg-white/20 text-white'
                    : 'bg-[var(--surface)] text-[var(--primary)] border border-blue-200 dark:border-blue-800'
                }`}
              >
                {counts.active}
              </span>
            </button>

            {/* قائمة فئة الحافلة */}
            <div className="relative">
              <select
                aria-label="فلتر فئة الحافلة"
                value={busTypeFilter}
                onChange={(e) => setBusTypeFilter(e.target.value)}
                className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl text-xs font-bold text-[var(--text)] focus:border-[var(--primary)] focus:ring-2 focus:ring-blue-500/15 outline-none cursor-pointer"
              >
                <option value="all">كل الفئات</option>
                {busCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1.5 px-[var(--space-3)] py-[var(--space-2)] rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-[var(--gold-text)] text-xs font-bold hover:bg-amber-100/80 transition-colors cursor-pointer"
              >
                <RotateCcw size={13} />
                <span>مسح الفلاتر</span>
              </button>
            )}
          </div>

          {/* عدّاد النتائج الحي */}
          <p className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
            عرض <span className="text-[var(--primary)] font-extrabold">{filteredBuses.length}</span> من{' '}
            <span className="text-[var(--text)] font-extrabold">{counts.total}</span> حافلة
          </p>
        </div>
      </section>

      {/* قائمة الحافلات */}
      {filteredBuses.length > 0 ? (
        <div className="space-y-[var(--space-4)]">
          {viewMode === 'table' ? (
            <>
              {/* جدول مضغوط لسطح المكتب والأجهزة اللوحية */}
              <div className="hidden md:block bg-[var(--surface)] rounded-2xl border border-[var(--border)] shadow-2xs overflow-hidden">
                <div className="overflow-auto max-h-[68vh]">
                  <table className="w-full text-right border-collapse">
                    <thead className="sticky top-0 z-20 bg-[var(--surface-subtle)] border-b border-[var(--border)] shadow-2xs">
                      <tr className="text-[11px] font-extrabold text-[var(--text-secondary)]">
                        <th className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
                          رقم الحافلة
                        </th>
                        <th className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
                          الحالة
                        </th>
                        <th className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
                          السائق الفعلي
                        </th>
                        <th className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
                          رقم الهاتف
                        </th>
                        <th className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
                          سند النشاط
                        </th>
                        <th className="px-[var(--space-4)] py-[var(--space-3)] whitespace-nowrap">
                          آخر تعديل
                        </th>
                        <th className="px-[var(--space-4)] py-[var(--space-3)] text-left whitespace-nowrap">
                          إجراءات
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBuses.map((b) => (
                        <BusTableRow
                          key={b.id}
                          bus={b}
                          voucherNum={usedBusesInfo[b.busNumber]}
                          isEditing={editingBus?.id === b.id}
                          onViewDetails={setSelectedBusDetails}
                          onEdit={startEditBus}
                          onRequestDelete={setBusToDelete}
                          onOpenVoucher={onOpenVoucher}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* بطاقات مضغوطة تلقائيًا على الجوال في وضع الجدول */}
              <div className="grid grid-cols-1 gap-[var(--space-2)] md:hidden">
                {visibleBuses.map((b) => (
                  <BusMobileCompactCard
                    key={b.id}
                    bus={b}
                    voucherNum={usedBusesInfo[b.busNumber]}
                    isEditing={editingBus?.id === b.id}
                    onViewDetails={setSelectedBusDetails}
                    onEdit={startEditBus}
                    onRequestDelete={setBusToDelete}
                    onOpenVoucher={onOpenVoucher}
                  />
                ))}
              </div>
            </>
          ) : (
            /* عرض البطاقات المتساوية الارتفاع */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--space-4)] items-stretch">
              {visibleBuses.map((b) => (
                <BusGridCard
                  key={b.id}
                  bus={b}
                  voucherNum={usedBusesInfo[b.busNumber]}
                  isEditing={editingBus?.id === b.id}
                  onViewDetails={setSelectedBusDetails}
                  onEdit={startEditBus}
                  onRequestDelete={setBusToDelete}
                  onOpenVoucher={onOpenVoucher}
                />
              ))}
            </div>
          )}

          {/* زر عرض المزيد + عنصر المراقبة للتحميل التلقائي */}
          {hasMore && (
            <div className="pt-[var(--space-2)] flex flex-col items-center gap-[var(--space-2)]">
              <div ref={loadMoreSentinelRef} className="h-1 w-full" aria-hidden="true" />
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredBuses.length))
                }
                className="px-[var(--space-6)] py-[var(--space-3)] bg-[var(--surface)] hover:bg-[var(--surface-subtle)] border border-[var(--border)] hover:border-[var(--primary)] rounded-xl text-xs font-extrabold text-[var(--primary)] shadow-2xs transition-colors cursor-pointer tabular-nums"
              >
                عرض المزيد ({Math.min(BATCH_SIZE, filteredBuses.length - visibleCount)} من المتبقي{' '}
                {filteredBuses.length - visibleCount})
              </button>
            </div>
          )}
        </div>
      ) : (
        /* حالة عدم وجود نتائج مطابقة */
        <div className="py-[var(--space-12)] text-center bg-[var(--surface)] rounded-3xl border border-[var(--border)] px-[var(--space-4)]">
          <div className="w-20 h-20 bg-[var(--surface-subtle)] rounded-2xl flex items-center justify-center mx-auto mb-[var(--space-4)] border border-dashed border-[var(--border)]">
            <Bus size={38} className="text-[var(--text-muted)]" />
          </div>
          <h4 className="text-[var(--text)] font-extrabold text-base mb-[var(--space-2)]">
            لا توجد حافلات مطابقة
          </h4>
          <p className="text-xs text-[var(--text-secondary)] font-medium max-w-xs mx-auto mb-[var(--space-5)]">
            لم يتم العثور على حافلات مطابقة للبحث أو الفلاتر المحددة حاليًا.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] rounded-xl bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              <span>مسح الفلاتر</span>
            </button>
          )}
        </div>
      )}

      {/* نافذة تفاصيل الحافلة (نفس الحقول الموجودة أصلًا دون إضافة حقول جديدة) */}
      <AnimatePresence>
        {selectedBusDetails && (
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-[var(--space-4)]"
            onClick={() => setSelectedBusDetails(null)}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`تفاصيل الحافلة ${selectedBusDetails.busNumber}`}
              initial={{ opacity: 0, scale: 0.95, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 14 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--surface)] rounded-3xl p-[var(--space-5)] sm:p-[var(--space-6)] max-w-md w-full shadow-2xl border border-[var(--border)] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 left-0 h-1 bg-[var(--primary)]" />

              {(() => {
                const voucherNum = usedBusesInfo[selectedBusDetails.busNumber];
                const isUsed = Boolean(voucherNum);
                return (
                  <>
                    <div className="flex items-start justify-between gap-[var(--space-3)] mb-[var(--space-5)]">
                      <div className="flex items-center gap-[var(--space-3)]">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-lg tabular-nums text-white shrink-0 ${
                            isUsed ? 'bg-[var(--primary)]' : 'bg-[var(--navy)]'
                          }`}
                        >
                          {selectedBusDetails.busNumber}
                        </div>
                        <div>
                          <div className="flex items-center gap-[var(--space-2)] flex-wrap">
                            <h3 className="text-lg font-extrabold text-[var(--text)]">
                              حافلة {selectedBusDetails.busNumber}
                            </h3>
                            <span className="text-[11px] font-bold px-[var(--space-2)] py-[2px] rounded-md bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)]">
                              {selectedBusDetails.busType || 'غير محدد'}
                            </span>
                          </div>
                          <div className="mt-[var(--space-1)]">
                            {isUsed ? (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--primary)]">
                                <span className="w-2 h-2 rounded-full bg-[var(--primary)]" />
                                نشطة بالسندات
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--success)]">
                                <span className="w-2 h-2 rounded-full bg-[var(--success)]" />
                                متاحة
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-label="إغلاق نافذة التفاصيل"
                        onClick={() => setSelectedBusDetails(null)}
                        className="w-9 h-9 rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] flex items-center justify-center cursor-pointer"
                      >
                        <X size={17} />
                      </button>
                    </div>

                    <div className="space-y-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-2xl p-[var(--space-4)] text-sm">
                      <div className="flex items-center justify-between gap-[var(--space-3)]">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          السائق الفعلي
                        </span>
                        <span className="font-extrabold text-[var(--text)]">
                          {selectedBusDetails.driverName}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-[var(--space-3)] pt-[var(--space-2)] border-t border-[var(--border)]">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          رقم الهاتف
                        </span>
                        <span dir="ltr" className="font-bold text-[var(--text)] tabular-nums">
                          {selectedBusDetails.driverPhone || '---'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-[var(--space-3)] pt-[var(--space-2)] border-t border-[var(--border)]">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          فئة الحافلة
                        </span>
                        <span className="font-bold text-[var(--text)]">
                          {selectedBusDetails.busType || 'غير محدد'}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-[var(--space-3)] pt-[var(--space-2)] border-t border-[var(--border)]">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          آخر تعديل
                        </span>
                        <span className="text-xs font-bold text-[var(--text-secondary)] tabular-nums">
                          {formatBusUpdatedAt(selectedBusDetails.updatedAt)}
                        </span>
                      </div>

                      {isUsed && voucherNum && (
                        <div className="flex items-center justify-between gap-[var(--space-3)] pt-[var(--space-2)] border-t border-[var(--border)]">
                          <span className="text-xs font-bold text-[var(--text-muted)]">
                            سند النشاط
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBusDetails(null);
                              onOpenVoucher?.(voucherNum);
                            }}
                            className="inline-flex items-center gap-1 px-[var(--space-3)] py-[var(--space-1)] rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-extrabold tabular-nums cursor-pointer hover:bg-indigo-100"
                          >
                            <FileText size={13} />
                            <span>#{voucherNum}</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-[var(--space-5)] flex flex-col sm:flex-row gap-[var(--space-2)]">
                      {!isUsed ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              const target = selectedBusDetails;
                              setSelectedBusDetails(null);
                              startEditBus(target);
                            }}
                            className="flex-1 py-[var(--space-3)] px-[var(--space-4)] rounded-xl bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white text-xs font-bold flex items-center justify-center gap-[var(--space-2)] cursor-pointer"
                          >
                            <Edit2 size={15} />
                            <span>تعديل البيانات</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const target = selectedBusDetails;
                              setSelectedBusDetails(null);
                              setBusToDelete(target);
                            }}
                            className="py-[var(--space-3)] px-[var(--space-4)] rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 text-[var(--danger)] border border-red-200 dark:border-red-800 text-xs font-bold flex items-center justify-center gap-[var(--space-2)] cursor-pointer"
                          >
                            <Trash2 size={15} />
                            <span>حذف</span>
                          </button>
                        </>
                      ) : (
                        <div className="w-full text-center py-[var(--space-2)] px-[var(--space-3)] rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-xs font-bold text-[var(--text-muted)]">
                          لا يمكن الحذف: الحافلة مرتبطة بسند
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* نافذة تأكيد حذف حافلة مفردة */}
      <AnimatePresence>
        {busToDelete && (
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-[var(--space-4)]"
            onClick={() => !isDeletingSingle && setBusToDelete(null)}
          >
            <motion.div
              role="alertdialog"
              aria-modal="true"
              aria-label={`تأكيد حذف الحافلة ${busToDelete.busNumber}`}
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--surface)] rounded-3xl p-[var(--space-5)] sm:p-[var(--space-6)] max-w-md w-full shadow-2xl border border-red-200 dark:border-red-900/70 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-[var(--danger)]" />

              <div className="flex items-start gap-[var(--space-3)] mb-[var(--space-5)]">
                <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-[var(--danger)] flex items-center justify-center shrink-0">
                  <AlertTriangle size={22} />
                </div>
                <div className="flex-1">
                  <h3 className="text-base font-extrabold text-[var(--text)] mb-[var(--space-1)]">
                    تأكيد حذف الحافلة
                  </h3>
                  <p className="text-sm font-semibold text-[var(--text-secondary)] leading-relaxed">
                    هل تريد حذف الحافلة{' '}
                    <span className="font-extrabold text-[var(--text)] tabular-nums">
                      {busToDelete.busNumber}
                    </span>
                    ؟ لا يمكن التراجع عن هذا الإجراء
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-[var(--space-3)]">
                <button
                  type="button"
                  disabled={isDeletingSingle}
                  onClick={() => setBusToDelete(null)}
                  className="flex-1 py-[var(--space-3)] rounded-xl bg-[var(--surface-subtle)] border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text)] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={isDeletingSingle}
                  onClick={() => void confirmDeleteSingleBus()}
                  className="flex-1 py-[var(--space-3)] rounded-xl bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-bold flex items-center justify-center gap-[var(--space-2)] cursor-pointer disabled:opacity-60"
                >
                  {isDeletingSingle ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Trash2 size={15} />
                  )}
                  <span>تأكيد الحذف</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete All Confirmation Modal */}
      <AnimatePresence>
        {showDeleteAllModal && (
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-[var(--space-4)]">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[var(--surface)] rounded-[2.5rem] p-[var(--space-4)] lg:p-[var(--space-8)] max-w-lg w-full shadow-2xl border border-red-200 dark:border-red-900/70 overflow-hidden relative"
            >
              {/* Red Header Accent */}
              <div className="absolute top-0 right-0 left-0 h-1.5 bg-[#B91C1C]"></div>

              <div className="flex items-start justify-between gap-[var(--space-4)] mb-[var(--space-6)]">
                <div className="flex items-center gap-[var(--space-4)]">
                  <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/70 flex items-center justify-center text-[var(--danger)] shrink-0 shadow-xs">
                    <ShieldAlert size={26} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-[var(--text)] leading-tight">
                      مسح جميع الحافلات
                    </h3>
                    <p className="text-xs font-bold text-[var(--text-muted)]">
                      عملية حساسة تتطلب كلمة المرور الإدارية
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="إغلاق نافذة مسح الكل"
                  onClick={() => {
                    setShowDeleteAllModal(false);
                    setDeletePassword('');
                    setDeleteError('');
                  }}
                  className="w-9 h-9 rounded-xl bg-[var(--surface-subtle)] text-[var(--text-muted)] hover:text-[var(--text)] border border-[var(--border)] transition-all flex items-center justify-center cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Warning Notice */}
              <div className="space-y-[var(--space-3)] mb-[var(--space-6)]">
                <div className="p-[var(--space-4)] bg-red-50/80 dark:bg-red-950/35 border border-red-200/80 dark:border-red-800/70 rounded-2xl flex items-start gap-[var(--space-3)] text-[var(--danger)] text-xs">
                  <AlertTriangle size={18} className="shrink-0 mt-[var(--space-1)]" />
                  <div>
                    <p className="font-black mb-[var(--space-1)]">تنبيه الحذف الكلي:</p>
                    <p className="leading-relaxed">
                      سيتم حذف جميع الحافلات المضافة حالياً في الأسطول (
                      <span className="font-black underline">{buses.length} حافلة</span>) وإفراغ قائمة
                      الحافلات.
                    </p>
                  </div>
                </div>

                {/* Safety Guarantee Notice */}
                <div className="p-[var(--space-4)] bg-emerald-50 dark:bg-emerald-950/35 border border-emerald-200 dark:border-emerald-800/70 rounded-2xl flex items-start gap-[var(--space-3)] text-[var(--success)] text-xs">
                  <CheckCircle2 size={18} className="shrink-0 mt-[var(--space-1)]" />
                  <div>
                    <p className="font-black mb-[var(--space-1)]">ضمان سلامة السجلات والسندات:</p>
                    <p className="leading-relaxed font-bold">
                      لن تتأثر السجلات والسندات السابقة نهائياً، حيث تظل جميع السندات التاريخية
                      وبيانات الحافلات الخاصة بها محفوظة وموثقة بالكامل في أرشيف السندات والتقارير.
                    </p>
                  </div>
                </div>
              </div>

              {/* Password Form */}
              <form onSubmit={handleDeleteAllBuses} className="space-y-[var(--space-5)]">
                <div>
                  <label className="block text-xs font-black text-[var(--text-secondary)] mb-[var(--space-2)]">
                    أدخل كلمة المرور للتأكيد:
                  </label>
                  <div className="relative">
                    <Lock
                      className="absolute right-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                      size={18}
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoFocus
                      required
                      value={deletePassword}
                      onChange={(e) => {
                        setDeletePassword(e.target.value);
                        if (deleteError) setDeleteError('');
                      }}
                      className="w-full pr-[var(--space-12)] pl-[var(--space-12)] py-[var(--space-3)] bg-[var(--surface-subtle)] border border-[var(--border)] rounded-xl focus:bg-[var(--surface)] focus:ring-4 focus:ring-red-500/10 focus:border-[var(--danger)] outline-none transition-all font-mono font-bold text-[var(--text)] text-sm"
                      placeholder="كلمة السر المصرحة..."
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute left-[var(--space-4)] top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text)] cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  {deleteError && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-xs font-black text-[var(--danger)] flex items-center gap-[var(--space-2)] pt-[var(--space-2)]"
                    >
                      <AlertTriangle size={14} className="shrink-0" />
                      <span>{deleteError}</span>
                    </motion.p>
                  )}
                </div>

                <div className="flex gap-[var(--space-3)] pt-[var(--space-2)]">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteAllModal(false);
                      setDeletePassword('');
                      setDeleteError('');
                    }}
                    disabled={isDeletingAll}
                    className="flex-1 py-[var(--space-3)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--surface)] rounded-xl font-black text-xs transition-all cursor-pointer"
                  >
                    إلغاء الأمر
                  </button>
                  <button
                    type="submit"
                    disabled={isDeletingAll || !deletePassword}
                    className="flex-1 py-[var(--space-3)] bg-[#B91C1C] hover:bg-[#991B1B] text-white rounded-xl font-black text-xs shadow-lg transition-all flex items-center justify-center gap-[var(--space-2)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isDeletingAll ? (
                      <>
                        <Loader2 className="animate-spin" size={16} />
                        <span>جاري المسح...</span>
                      </>
                    ) : (
                      <>
                        <Trash2 size={16} />
                        <span>تأكيد مسح الكل</span>
                      </>
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
