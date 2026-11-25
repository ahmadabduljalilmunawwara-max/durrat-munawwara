import { collection, doc, serverTimestamp, setDoc, Transaction } from 'firebase/firestore';
import { db } from './firebase';

export interface AuditChangeItem {
  field: string;
  label: string;
  previousValue: string;
  newValue: string;
}

export interface AuditLogInput {
  action: string;
  targetPath: string;
  summary: string;
  changes?: AuditChangeItem[];
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
  performedByUid: string;
  performedByName: string;
  performedByRole: string;
}

function sanitizeAuditPayload(input: AuditLogInput) {
  const payload: Record<string, unknown> = {
    action: String(input.action || 'settings_update').slice(0, 80),
    targetPath: String(input.targetPath || 'settings/app').slice(0, 200),
    summary: String(input.summary || '').slice(0, 500) || 'تحديث الإعدادات',
    performedByUid: String(input.performedByUid || '').slice(0, 128),
    performedByName: String(input.performedByName || 'المدير العام').slice(0, 120),
    performedByRole: String(input.performedByRole || 'general_manager').slice(0, 40),
    createdAt: serverTimestamp(),
  };

  if (input.reason && input.reason.trim()) {
    payload.reason = input.reason.trim().slice(0, 500);
  }

  if (Array.isArray(input.changes) && input.changes.length > 0) {
    payload.changes = input.changes.slice(0, 30).map((c) => ({
      field: String(c.field).slice(0, 60),
      label: String(c.label).slice(0, 100),
      previousValue: String(c.previousValue ?? '').slice(0, 300),
      newValue: String(c.newValue ?? '').slice(0, 300),
    }));
  }

  if (input.metadata && Object.keys(input.metadata).length > 0) {
    const cleanMeta: Record<string, string | number | boolean> = {};
    Object.entries(input.metadata)
      .slice(0, 20)
      .forEach(([k, v]) => {
        if (typeof v === 'string') cleanMeta[k.slice(0, 40)] = v.slice(0, 200);
        else if (typeof v === 'number' || typeof v === 'boolean') cleanMeta[k.slice(0, 40)] = v;
      });
    payload.metadata = cleanMeta;
  }

  return payload;
}

function generateAuditLogId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `log_${Date.now()}_${rand}`;
}

export async function createAuditLogEntry(input: AuditLogInput): Promise<void> {
  if (!input.performedByUid) return;
  const logRef = doc(collection(db, 'auditLog'), generateAuditLogId());
  await setDoc(logRef, sanitizeAuditPayload(input));
}

export function addAuditLogToTransaction(
  transaction: Transaction,
  input: AuditLogInput
): void {
  if (!input.performedByUid) return;
  const logRef = doc(collection(db, 'auditLog'), generateAuditLogId());
  transaction.set(logRef, sanitizeAuditPayload(input));
}

export interface SettingsSnapshotForAudit {
  activeSeason: string;
  hijriOffsetDays: number;
  companyAddress: string;
  companyWebsite: string;
  companyPhone: string;
  welcomeTitle: string;
  welcomeMessage: string;
  welcomeEnabled: boolean;
  welcomeExpiresAt: string;
  printCopies: number;
  printCopyLabels: string[];
  pdfMargins: { top: number; bottom: number; left: number; right: number };
  sloganHeightMm: number;
  logoUrl: string;
  sloganUrl: string;
  idleTimeoutMinutes: number;
}

export function buildSettingsAuditChanges(
  prev: SettingsSnapshotForAudit,
  next: SettingsSnapshotForAudit
): AuditChangeItem[] {
  const changes: AuditChangeItem[] = [];

  if ((prev.activeSeason || '') !== (next.activeSeason || '')) {
    changes.push({
      field: 'activeSeason',
      label: 'الموسم الحالي',
      previousValue: prev.activeSeason ? `${prev.activeSeason}هـ` : 'غير محدد',
      newValue: next.activeSeason ? `${next.activeSeason}هـ` : 'غير محدد',
    });
  }

  if (Number(prev.hijriOffsetDays) !== Number(next.hijriOffsetDays)) {
    changes.push({
      field: 'hijriOffsetDays',
      label: 'تصحيح التاريخ الهجري',
      previousValue: `${prev.hijriOffsetDays >= 0 ? `+${prev.hijriOffsetDays}` : prev.hijriOffsetDays} يوم`,
      newValue: `${next.hijriOffsetDays >= 0 ? `+${next.hijriOffsetDays}` : next.hijriOffsetDays} يوم`,
    });
  }

  if ((prev.companyAddress || '') !== (next.companyAddress || '')) {
    changes.push({
      field: 'companyAddress',
      label: 'عنوان الشركة في السند',
      previousValue: prev.companyAddress || 'فارغ',
      newValue: next.companyAddress || 'فارغ',
    });
  }

  if ((prev.companyWebsite || '') !== (next.companyWebsite || '')) {
    changes.push({
      field: 'companyWebsite',
      label: 'موقع الشركة الإلكتروني',
      previousValue: prev.companyWebsite || 'فارغ',
      newValue: next.companyWebsite || 'فارغ',
    });
  }

  if ((prev.companyPhone || '') !== (next.companyPhone || '')) {
    changes.push({
      field: 'companyPhone',
      label: 'هاتف الشركة في السند',
      previousValue: prev.companyPhone || 'فارغ',
      newValue: next.companyPhone || 'فارغ',
    });
  }

  if ((prev.welcomeTitle || '') !== (next.welcomeTitle || '')) {
    changes.push({
      field: 'welcomeTitle',
      label: 'عنوان رسالة الترحيب',
      previousValue: prev.welcomeTitle || 'فارغ',
      newValue: next.welcomeTitle || 'فارغ',
    });
  }

  if ((prev.welcomeMessage || '') !== (next.welcomeMessage || '')) {
    changes.push({
      field: 'welcomeMessage',
      label: 'نص رسالة الترحيب',
      previousValue: prev.welcomeMessage ? prev.welcomeMessage.slice(0, 140) : 'فارغة',
      newValue: next.welcomeMessage ? next.welcomeMessage.slice(0, 140) : 'فارغة',
    });
  }

  if (Boolean(prev.welcomeEnabled) !== Boolean(next.welcomeEnabled)) {
    changes.push({
      field: 'welcomeEnabled',
      label: 'تفعيل رسالة الترحيب',
      previousValue: prev.welcomeEnabled ? 'مفعّلة' : 'معطّلة',
      newValue: next.welcomeEnabled ? 'مفعّلة' : 'معطّلة',
    });
  }

  if ((prev.welcomeExpiresAt || '') !== (next.welcomeExpiresAt || '')) {
    changes.push({
      field: 'welcomeExpiresAt',
      label: 'تاريخ انتهاء رسالة الترحيب',
      previousValue: prev.welcomeExpiresAt || 'بدون انتهاء',
      newValue: next.welcomeExpiresAt || 'بدون انتهاء',
    });
  }

  if (Number(prev.printCopies) !== Number(next.printCopies)) {
    changes.push({
      field: 'printCopies',
      label: 'عدد النسخ المطبوعة',
      previousValue: String(prev.printCopies),
      newValue: String(next.printCopies),
    });
  }

  const prevLabelsStr = (prev.printCopyLabels || []).slice(0, prev.printCopies).join(' | ');
  const nextLabelsStr = (next.printCopyLabels || []).slice(0, next.printCopies).join(' | ');
  if (prevLabelsStr !== nextLabelsStr) {
    changes.push({
      field: 'printCopyLabels',
      label: 'عناوين نسخ الطباعة',
      previousValue: prevLabelsStr || 'الافتراضي',
      newValue: nextLabelsStr || 'الافتراضي',
    });
  }

  const prevM = `${prev.pdfMargins.top}/${prev.pdfMargins.right}/${prev.pdfMargins.bottom}/${prev.pdfMargins.left} مم`;
  const nextM = `${next.pdfMargins.top}/${next.pdfMargins.right}/${next.pdfMargins.bottom}/${next.pdfMargins.left} مم`;
  if (prevM !== nextM) {
    changes.push({
      field: 'pdfMargins',
      label: 'هوامش الطباعة (أعلى/يمين/أسفل/يسار)',
      previousValue: prevM,
      newValue: nextM,
    });
  }

  if (Number(prev.sloganHeightMm) !== Number(next.sloganHeightMm)) {
    changes.push({
      field: 'sloganHeightMm',
      label: 'ارتفاع شعار العبارة في السند',
      previousValue: `${prev.sloganHeightMm} مم`,
      newValue: `${next.sloganHeightMm} مم`,
    });
  }

  if ((prev.logoUrl || '') !== (next.logoUrl || '')) {
    changes.push({
      field: 'logoUrl',
      label: 'الشعار الرئيسي للشركة',
      previousValue: prev.logoUrl ? 'صورة مخصصة سابقة' : 'الشعار الافتراضي',
      newValue: next.logoUrl ? 'تم تغيير الصورة' : 'تمت استعادة الشعار الافتراضي',
    });
  }

  if ((prev.sloganUrl || '') !== (next.sloganUrl || '')) {
    changes.push({
      field: 'sloganUrl',
      label: 'شعار خدمة الحاج شرف لنا',
      previousValue: prev.sloganUrl ? 'صورة مخصصة سابقة' : 'الشعار الافتراضي',
      newValue: next.sloganUrl ? 'تم تغيير الصورة' : 'تمت استعادة الشعار الافتراضي',
    });
  }

  if (Number(prev.idleTimeoutMinutes) !== Number(next.idleTimeoutMinutes)) {
    changes.push({
      field: 'idleTimeoutMinutes',
      label: 'مهلة الخمول للخروج التلقائي',
      previousValue: `${prev.idleTimeoutMinutes} دقيقة`,
      newValue: `${next.idleTimeoutMinutes} دقيقة`,
    });
  }

  return changes;
}
