import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  extractVoucherBusNumbers,
  formatOfficeLabel,
  MigrationConflictItem,
} from './busAssignments';
import { toEnglishDigits } from './voucherValidation';
import { createAuditLogEntry } from './auditLog';

export interface ParsedBackupPayload {
  buses: Array<{ id: string; [key: string]: any }>;
  vouchers: Array<{ id: string; [key: string]: any }>;
  settings: Array<{ id: string; [key: string]: any }>;
  app_users: Array<{ id: string; [key: string]: any }>;
  exportedAt?: string;
  version?: string;
  ignoredCollections: string[];
}

export interface BackupConflictVoucherDetail {
  id: string;
  voucherNumber: number | string;
  reason: string;
}

export interface BackupPreviewReport {
  counts: {
    buses: number;
    vouchers: number;
    settings: number;
    app_users: number;
  };
  newVouchersCount: number;
  existingVouchersCount: number;
  conflictingVouchers: BackupConflictVoucherDetail[];
  busConflictsMerge: MigrationConflictItem[];
  busConflictsReplace: MigrationConflictItem[];
  ignoredCollections: string[];
}

export interface RestoreProgressState {
  phase: string;
  completedOps: number;
  totalOps: number;
  completedBatches: number;
  totalBatches: number;
}

export interface RestoreExecutionResult {
  stoppedOnError: boolean;
  errorMessage?: string;
  mode: 'merge' | 'replace';
  includeUserRoles: boolean;
  completedOps: number;
  totalOps: number;
  remainingOps: number;
  imported: {
    buses: number;
    vouchers: number;
    settings: number;
    app_users: number;
    deleted: number;
  };
  skippedExisting: number;
  rebuiltActiveBuses: number;
  rebuiltReleasedBuses: number;
  busConflicts: MigrationConflictItem[];
  newCounterLast: number;
}

function stripUserSecrets(rawUser: Record<string, any>): Record<string, any> {
  const clone: Record<string, any> = { ...rawUser };
  delete clone.password;
  delete clone.pin;
  delete clone.secret;
  delete clone.token;
  delete clone.accessToken;
  delete clone.refreshToken;
  delete clone.authUid;
  return clone;
}

function sanitizeImportedVoucherPayload(raw: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = { ...raw };
  delete clean.id;

  if (typeof clean.issuedByName === 'string' && clean.issuedByName.length > 40) {
    clean.issuedByName = clean.issuedByName.slice(0, 40);
  }
  if (typeof clean.issuedByUid === 'string' && clean.issuedByUid.length > 128) {
    clean.issuedByUid = clean.issuedByUid.slice(0, 128);
  }
  if (typeof clean.overrideReason === 'string') {
    const trimmed = clean.overrideReason.trim();
    if (trimmed.length < 5) {
      delete clean.overrideReason;
    } else if (trimmed.length > 500) {
      clean.overrideReason = trimmed.slice(0, 500);
    } else {
      clean.overrideReason = trimmed;
    }
  } else if ('overrideReason' in clean) {
    delete clean.overrideReason;
  }
  if (Array.isArray(clean.duplicateOverrides) && clean.duplicateOverrides.length > 30) {
    clean.duplicateOverrides = clean.duplicateOverrides.slice(0, 30);
  }
  return clean;
}

function isPlainRecord(val: unknown): val is Record<string, any> {
  return Boolean(val) && typeof val === 'object' && !Array.isArray(val);
}

function triggerJsonDownload(payload: unknown, filename: string): void {
  const jsonText = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function exportSystemBackup(options: {
  performedByUid: string;
  performedByName: string;
  performedByRole: string;
  filePrefix?: string;
  recordSettingsTimestamp?: boolean;
  recordAuditLog?: boolean;
}): Promise<{ exportedAt: string; counts: { buses: number; vouchers: number; settings: number; app_users: number } }> {
  const [busesSnap, vouchersSnap, usersSnap, settingsSnap] = await Promise.all([
    getDocs(collection(db, 'buses')),
    getDocs(collection(db, 'vouchers')),
    getDocs(collection(db, 'app_users')),
    getDocs(collection(db, 'settings')),
  ]);

  const busesData = busesSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const vouchersData = vouchersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const usersData = usersSnap.docs.map((d) => stripUserSecrets({ id: d.id, ...d.data() }));
  const settingsData = settingsSnap.docs
    .filter((d) => d.id === 'app' || d.id === 'busAssignmentsMigration')
    .map((d) => ({ id: d.id, ...d.data() }));

  const exportedAt = new Date().toISOString();
  const backup = {
    buses: busesData,
    vouchers: vouchersData,
    app_users: usersData,
    settings: settingsData,
    exportedAt,
    version: '2.6.0',
    excludedSensitiveCollections: ['active_sessions', 'auditLog'],
  };

  const stamp = exportedAt.slice(0, 16).replace(/[:T]/g, '-');
  const prefix = options.filePrefix || 'dmtc_backup';
  triggerJsonDownload(backup, `${prefix}_${stamp}.json`);

  if (options.recordSettingsTimestamp !== false) {
    await setDoc(
      doc(db, 'settings', 'app'),
      {
        lastBackupAt: exportedAt,
        lastBackupByName: options.performedByName,
        lastBackupByUid: options.performedByUid,
      },
      { merge: true }
    );
  }

  if (options.recordAuditLog !== false && options.performedByUid) {
    await createAuditLogEntry({
      action: 'backup_export',
      targetPath: 'backup/export',
      summary: `تصدير نسخة احتياطية كاملة (${vouchersData.length} سند، ${busesData.length} حافلة)`,
      metadata: {
        vouchersCount: vouchersData.length,
        busesCount: busesData.length,
        usersCount: usersData.length,
      },
      performedByUid: options.performedByUid,
      performedByName: options.performedByName,
      performedByRole: options.performedByRole,
    });
  }

  return {
    exportedAt,
    counts: {
      buses: busesData.length,
      vouchers: vouchersData.length,
      settings: settingsData.length,
      app_users: usersData.length,
    },
  };
}

export function parseAndValidateBackupFile(rawText: string): ParsedBackupPayload {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error('ملف JSON غير صالح: تعذر تحليل بنية الملف.');
  }

  if (!isPlainRecord(parsed)) {
    throw new Error('بنية ملف النسخة الاحتياطية غير صالحة.');
  }

  const ignoredCollections: string[] = [];
  if ('active_sessions' in parsed) ignoredCollections.push('active_sessions');
  if ('auditLog' in parsed) ignoredCollections.push('auditLog');

  const validateCollectionArray = (key: string): Array<{ id: string; [k: string]: any }> => {
    if (!(key in parsed) || parsed[key] === undefined || parsed[key] === null) {
      return [];
    }
    if (!Array.isArray(parsed[key])) {
      throw new Error(`الحقل "${key}" في ملف النسخة الاحتياطية يجب أن يكون مصفوفة.`);
    }
    return parsed[key].map((item: unknown, idx: number) => {
      if (!isPlainRecord(item)) {
        throw new Error(`العنصر رقم ${idx + 1} في "${key}" غير صالح.`);
      }
      const id = String(item.id || '').trim();
      if (!id || id.length > 128 || id.includes('/')) {
        throw new Error(`العنصر رقم ${idx + 1} في "${key}" لا يحتوي على معرّف (id) صالح.`);
      }
      return { ...item, id };
    });
  };

  const buses = validateCollectionArray('buses');
  const vouchers = validateCollectionArray('vouchers');
  const settings = validateCollectionArray('settings').filter((s) => s.id === 'app');
  const app_users = validateCollectionArray('app_users').map((u) => ({
    ...stripUserSecrets(u),
    id: u.id,
  }));

  if (buses.length === 0 && vouchers.length === 0 && settings.length === 0 && app_users.length === 0) {
    throw new Error('الملف لا يحتوي على أي سجلات صالحة للاستيراد (buses أو vouchers أو settings أو app_users).');
  }

  return {
    buses,
    vouchers,
    settings,
    app_users,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
    version: typeof parsed.version === 'string' ? parsed.version : undefined,
    ignoredCollections,
  };
}

function getVoucherSortKey(v: any): { timeMs: number; voucherNum: number } {
  let timeMs = 0;
  if (typeof v?.timestamp === 'string') {
    const parsed = Date.parse(v.timestamp);
    if (!Number.isNaN(parsed)) timeMs = parsed;
  } else if (typeof v?.customDate === 'string') {
    const parsed = Date.parse(v.customDate);
    if (!Number.isNaN(parsed)) timeMs = parsed;
  }
  const voucherNum = Number(v?.voucherNumber) || 0;
  return { timeMs, voucherNum };
}

function isVoucherActiveForBus(v: any): boolean {
  return v?.archived !== true && v?.cancelled !== true && v?.status !== 'cancelled';
}

function detectBusConflictsInVoucherSet(vouchersList: any[]): MigrationConflictItem[] {
  const byBus = new Map<string, any[]>();
  for (const v of vouchersList) {
    if (!isVoucherActiveForBus(v)) continue;
    for (const busNum of extractVoucherBusNumbers(v)) {
      const list = byBus.get(busNum) || [];
      if (!list.some((item) => item.id === v.id)) {
        list.push(v);
      }
      byBus.set(busNum, list);
    }
  }

  const conflicts: MigrationConflictItem[] = [];
  for (const [busNumber, list] of byBus.entries()) {
    if (list.length <= 1) continue;
    const sorted = [...list].sort((a, b) => {
      const ka = getVoucherSortKey(a);
      const kb = getVoucherSortKey(b);
      if (kb.timeMs !== ka.timeMs) return kb.timeMs - ka.timeMs;
      return kb.voucherNum - ka.voucherNum;
    });
    const newest = sorted[0];
    const refs = sorted.map((v) => ({
      voucherId: String(v.id),
      voucherNumber: v.voucherNumber ?? '—',
      officeNo: toEnglishDigits(String(v.delegateNumber || '')).trim(),
      officeName: String(v.organization || '').trim(),
      officeLabel: formatOfficeLabel(v.delegateNumber, v.organization),
      timestamp: String(v.customDate || v.dateKey || v.timestamp || ''),
    }));
    conflicts.push({
      busNumber,
      chosenVoucherNumber: newest.voucherNumber ?? '—',
      chosenOfficeLabel: formatOfficeLabel(newest.delegateNumber, newest.organization),
      vouchers: refs,
      offices: Array.from(new Set(refs.map((r) => r.officeLabel))),
    });
  }

  conflicts.sort((a, b) => a.busNumber.localeCompare(b.busNumber, 'en', { numeric: true }));
  return conflicts;
}

export async function previewBackupRestore(
  parsed: ParsedBackupPayload
): Promise<BackupPreviewReport> {
  const liveVouchersSnap = await getDocs(collection(db, 'vouchers'));
  const liveById = new Map<string, any>();
  const liveByVoucherNumber = new Map<number, any[]>();

  liveVouchersSnap.forEach((docSnap) => {
    const vData = { id: docSnap.id, ...docSnap.data() } as any;
    liveById.set(docSnap.id, vData);
    const num = Number(vData.voucherNumber);
    if (Number.isFinite(num) && num > 0) {
      const arr = liveByVoucherNumber.get(num) || [];
      arr.push(vData);
      liveByVoucherNumber.set(num, arr);
    }
  });

  let newVouchersCount = 0;
  let existingVouchersCount = 0;
  const conflictingVouchers: BackupConflictVoucherDetail[] = [];

  for (const bv of parsed.vouchers) {
    const existingSameId = liveById.get(bv.id);
    const bvNum = Number(bv.voucherNumber);
    const sameNumberDocs = Number.isFinite(bvNum) && bvNum > 0 ? liveByVoucherNumber.get(bvNum) || [] : [];
    const differentIdWithSameNumber = sameNumberDocs.find((lv) => lv.id !== bv.id);

    if (existingSameId) {
      existingVouchersCount++;
      const existingNum = Number(existingSameId.voucherNumber);
      if (Number.isFinite(bvNum) && Number.isFinite(existingNum) && bvNum !== existingNum) {
        conflictingVouchers.push({
          id: bv.id,
          voucherNumber: bv.voucherNumber ?? '—',
          reason: `المعرف موجود برقم سند مختلف (${existingNum} مقابل ${bvNum})`,
        });
      } else if (differentIdWithSameNumber) {
        conflictingVouchers.push({
          id: bv.id,
          voucherNumber: bv.voucherNumber ?? '—',
          reason: `رقم السند ${bvNum} مستخدم أيضاً في مستند آخر (${differentIdWithSameNumber.id})`,
        });
      }
    } else if (differentIdWithSameNumber) {
      conflictingVouchers.push({
        id: bv.id,
        voucherNumber: bv.voucherNumber ?? '—',
        reason: `رقم السند ${bvNum} موجود مسبقاً بمعرّف مختلف (${differentIdWithSameNumber.id})`,
      });
    } else {
      newVouchersCount++;
    }
  }

  // Merge projected set: live docs + non-existing backup docs
  const mergedVouchers = Array.from(liveById.values());
  for (const bv of parsed.vouchers) {
    if (!liveById.has(bv.id)) {
      mergedVouchers.push(bv);
    }
  }

  const busConflictsMerge = detectBusConflictsInVoucherSet(mergedVouchers);
  const busConflictsReplace = detectBusConflictsInVoucherSet(parsed.vouchers);

  return {
    counts: {
      buses: parsed.buses.length,
      vouchers: parsed.vouchers.length,
      settings: parsed.settings.length,
      app_users: parsed.app_users.length,
    },
    newVouchersCount,
    existingVouchersCount,
    conflictingVouchers,
    busConflictsMerge,
    busConflictsReplace,
    ignoredCollections: parsed.ignoredCollections,
  };
}

interface BatchWriteOp {
  type: 'set' | 'delete';
  collectionName: 'buses' | 'vouchers' | 'settings' | 'app_users';
  docId: string;
  data?: Record<string, any>;
}

export async function executeBackupRestore(
  parsed: ParsedBackupPayload,
  options: {
    mode: 'merge' | 'replace';
    includeUserRoles: boolean;
    performedByUid: string;
    performedByName: string;
    performedByRole: string;
    onProgress?: (progress: RestoreProgressState) => void;
  }
): Promise<RestoreExecutionResult> {
  // 1. Always download an automatic backup of the current live state before applying any changes
  options.onProgress?.({
    phase: 'جاري تنزيل نسخة احتياطية تلقائية للوضع الحالي قبل التنفيذ...',
    completedOps: 0,
    totalOps: 0,
    completedBatches: 0,
    totalBatches: 0,
  });

  await exportSystemBackup({
    performedByUid: options.performedByUid,
    performedByName: options.performedByName,
    performedByRole: options.performedByRole,
    filePrefix: 'dmtc_pre_restore_backup',
    recordSettingsTimestamp: false,
    recordAuditLog: false,
  });

  // 2. Read existing IDs so merge never overwrites and replace removes stale records
  const [liveBusesSnap, liveVouchersSnap, liveUsersSnap] = await Promise.all([
    getDocs(collection(db, 'buses')),
    getDocs(collection(db, 'vouchers')),
    options.includeUserRoles ? getDocs(collection(db, 'app_users')) : Promise.resolve(null),
  ]);

  const existingBusIds = new Set(liveBusesSnap.docs.map((d) => d.id));
  const existingVoucherIds = new Set(liveVouchersSnap.docs.map((d) => d.id));
  const existingUserIds = new Set(liveUsersSnap ? liveUsersSnap.docs.map((d) => d.id) : []);

  const ops: BatchWriteOp[] = [];
  let skippedExisting = 0;

  // Buses
  const backupBusIds = new Set<string>();
  for (const b of parsed.buses) {
    backupBusIds.add(b.id);
    if (options.mode === 'merge' && existingBusIds.has(b.id)) {
      skippedExisting++;
      continue;
    }
    const { id: _id, ...payload } = b;
    ops.push({ type: 'set', collectionName: 'buses', docId: b.id, data: payload });
  }
  if (options.mode === 'replace') {
    for (const liveId of existingBusIds) {
      if (!backupBusIds.has(liveId)) {
        ops.push({ type: 'delete', collectionName: 'buses', docId: liveId });
      }
    }
  }

  // Vouchers
  const backupVoucherIds = new Set<string>();
  for (const v of parsed.vouchers) {
    backupVoucherIds.add(v.id);
    if (options.mode === 'merge' && existingVoucherIds.has(v.id)) {
      skippedExisting++;
      continue;
    }
    ops.push({
      type: 'set',
      collectionName: 'vouchers',
      docId: v.id,
      data: sanitizeImportedVoucherPayload(v),
    });
  }
  if (options.mode === 'replace') {
    for (const liveId of existingVoucherIds) {
      if (!backupVoucherIds.has(liveId)) {
        ops.push({ type: 'delete', collectionName: 'vouchers', docId: liveId });
      }
    }
  }

  // Settings (only settings/app, respecting merge vs replace)
  const ALLOWED_SETTINGS_KEYS = new Set([
    'nextVoucherNumber',
    'logoUrl',
    'sloganUrl',
    'sloganHeightMm',
    'welcomeTitle',
    'welcomeMessage',
    'welcomeEnabled',
    'welcomeExpiresAt',
    'welcomeVersion',
    'printCopies',
    'printCopyLabels',
    'pdfMargins',
    'activeSeason',
    'activeSeasonName',
    'hijriOffsetDays',
    'companyAddress',
    'companyWebsite',
    'companyPhone',
    'idleTimeoutMinutes',
    'lastArchivedSeason',
    'lastSeasonArchivedAt',
    'lastBackupAt',
    'lastBackupByName',
    'lastBackupByUid',
    'updatedAt',
    'updatedByUid',
    'updatedByName',
  ]);
  for (const s of parsed.settings) {
    if (s.id !== 'app') continue;
    const appSnap = await getDoc(doc(db, 'settings', 'app'));
    if (options.mode === 'merge' && appSnap.exists()) {
      skippedExisting++;
      continue;
    }
    const cleanSettings: Record<string, any> = {};
    for (const [k, v] of Object.entries(s)) {
      if (k !== 'id' && ALLOWED_SETTINGS_KEYS.has(k)) {
        cleanSettings[k] = v;
      }
    }
    if (typeof cleanSettings.logoUrl === 'string' && !cleanSettings.logoUrl.startsWith('data:image/')) {
      cleanSettings.logoUrl = '';
    }
    if (typeof cleanSettings.sloganUrl === 'string' && !cleanSettings.sloganUrl.startsWith('data:image/')) {
      cleanSettings.sloganUrl = '';
    }
    if (typeof cleanSettings.welcomeMessage === 'string' && cleanSettings.welcomeMessage.length > 300) {
      cleanSettings.welcomeMessage = cleanSettings.welcomeMessage.slice(0, 300);
    }
    ops.push({ type: 'set', collectionName: 'settings', docId: 'app', data: cleanSettings });
  }

  // App users (ONLY if user explicitly enabled the separate option)
  if (options.includeUserRoles) {
    for (const u of parsed.app_users) {
      if (options.mode === 'merge' && existingUserIds.has(u.id)) {
        skippedExisting++;
        continue;
      }
      const { id: _id, ...uData } = stripUserSecrets(u);
      ops.push({ type: 'set', collectionName: 'app_users', docId: u.id, data: uData });
    }
  }

  // 3. Execute operations in small batches (max 15 ops per batch)
  const BATCH_SIZE = 15;
  const totalOps = ops.length;
  const totalBatches = Math.max(1, Math.ceil(totalOps / BATCH_SIZE));
  let completedOps = 0;
  let completedBatches = 0;
  const importedCounts = { buses: 0, vouchers: 0, settings: 0, app_users: 0, deleted: 0 };

  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const chunk = ops.slice(i, i + BATCH_SIZE);
    try {
      const batch = writeBatch(db);
      for (const op of chunk) {
        const ref = doc(db, op.collectionName, op.docId);
        if (op.type === 'delete') {
          batch.delete(ref);
        } else {
          batch.set(ref, op.data || {});
        }
      }
      await batch.commit();

      for (const op of chunk) {
        if (op.type === 'delete') {
          importedCounts.deleted++;
        } else {
          importedCounts[op.collectionName]++;
        }
      }
      completedOps += chunk.length;
      completedBatches++;
      options.onProgress?.({
        phase: `جاري استيراد الدفعة ${completedBatches} من ${totalBatches}...`,
        completedOps,
        totalOps,
        completedBatches,
        totalBatches,
      });
    } catch (err: any) {
      return {
        stoppedOnError: true,
        errorMessage: err?.message || 'فشل تنفيذ دفعة أثناء الاستيراد.',
        mode: options.mode,
        includeUserRoles: options.includeUserRoles,
        completedOps,
        totalOps,
        remainingOps: Math.max(0, totalOps - completedOps),
        imported: importedCounts,
        skippedExisting,
        rebuiltActiveBuses: 0,
        rebuiltReleasedBuses: 0,
        busConflicts: [],
        newCounterLast: 0,
      };
    }
  }

  // 4. Rebuild busAssignments cleanly from ALL vouchers currently in Firestore
  options.onProgress?.({
    phase: 'جاري إعادة بناء حجوزات الحافلات (busAssignments) وتحديث عداد السندات...',
    completedOps,
    totalOps,
    completedBatches,
    totalBatches,
  });

  const [finalVouchersSnap, finalAssignSnap] = await Promise.all([
    getDocs(collection(db, 'vouchers')),
    getDocs(
      query(collection(db, 'busAssignments'), where('status', 'in', ['active', 'released', 'archived']))
    ),
  ]);

  const allVouchers: any[] = [];
  let maxVoucherNumber = 0;
  finalVouchersSnap.forEach((d) => {
    const vData: any = { id: d.id, ...d.data() };
    allVouchers.push(vData);
    const num = Number(vData.voucherNumber);
    if (Number.isFinite(num) && num > maxVoucherNumber) {
      maxVoucherNumber = Math.trunc(num);
    }
  });

  const activeByBus = new Map<string, any[]>();
  const inactiveByBus = new Map<string, any[]>();

  for (const v of allVouchers) {
    const buses = extractVoucherBusNumbers(v);
    const isActive = isVoucherActiveForBus(v);
    for (const busNum of buses) {
      const targetMap = isActive ? activeByBus : inactiveByBus;
      const list = targetMap.get(busNum) || [];
      if (!list.some((item) => item.id === v.id)) {
        list.push(v);
      }
      targetMap.set(busNum, list);
    }
  }

  const busConflicts = detectBusConflictsInVoucherSet(allVouchers);
  const assignWrites: Array<{ busNumber: string; payload: Record<string, any> }> = [];
  let rebuiltActiveBuses = 0;
  let rebuiltReleasedBuses = 0;

  const sortNewestFirst = (a: any, b: any) => {
    const ka = getVoucherSortKey(a);
    const kb = getVoucherSortKey(b);
    if (kb.timeMs !== ka.timeMs) return kb.timeMs - ka.timeMs;
    return kb.voucherNum - ka.voucherNum;
  };

  for (const [busNumber, list] of activeByBus.entries()) {
    const newest = [...list].sort(sortNewestFirst)[0];
    rebuiltActiveBuses++;
    assignWrites.push({
      busNumber,
      payload: {
        voucherId: String(newest.id),
        voucherNumber: Math.max(1, Math.trunc(Number(newest.voucherNumber) || 1)),
        officeNo: toEnglishDigits(String(newest.delegateNumber || '')).trim().slice(0, 40),
        officeName: String(newest.organization || '').trim().slice(0, 200),
        createdAt: serverTimestamp(),
        status: 'active',
        releasedAt: null,
        releaseReason: null,
      },
    });
  }

  for (const [busNumber, list] of inactiveByBus.entries()) {
    if (activeByBus.has(busNumber)) continue;
    const newest = [...list].sort(sortNewestFirst)[0];
    const isCancelled = newest?.cancelled === true || newest?.status === 'cancelled';
    rebuiltReleasedBuses++;
    assignWrites.push({
      busNumber,
      payload: {
        voucherId: String(newest.id),
        voucherNumber: Math.max(1, Math.trunc(Number(newest.voucherNumber) || 1)),
        officeNo: toEnglishDigits(String(newest.delegateNumber || '')).trim().slice(0, 40),
        officeName: String(newest.organization || '').trim().slice(0, 200),
        createdAt: serverTimestamp(),
        status: 'released',
        releasedAt: serverTimestamp(),
        releaseReason: isCancelled ? 'cancelled' : 'archived',
      },
    });
  }

  const keepBusSet = new Set(assignWrites.map((w) => w.busNumber));
  const assignDeletes: string[] = [];
  finalAssignSnap.forEach((d) => {
    if (!keepBusSet.has(d.id)) {
      assignDeletes.push(d.id);
    }
  });

  // Execute busAssignments rebuild in batches of 15
  const REBUILD_BATCH = 15;
  for (let i = 0; i < assignWrites.length; i += REBUILD_BATCH) {
    const chunk = assignWrites.slice(i, i + REBUILD_BATCH);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.set(doc(db, 'busAssignments', item.busNumber), item.payload);
    }
    await batch.commit();
  }
  for (let i = 0; i < assignDeletes.length; i += REBUILD_BATCH) {
    const chunk = assignDeletes.slice(i, i + REBUILD_BATCH);
    const batch = writeBatch(db);
    for (const busNum of chunk) {
      batch.delete(doc(db, 'busAssignments', busNum));
    }
    await batch.commit();
  }

  // 5. Reset counters/vouchers.last = highest existing voucherNumber
  const newCounterLast = Math.max(0, maxVoucherNumber);
  await setDoc(doc(db, 'counters', 'vouchers'), { last: newCounterLast });
  await setDoc(
    doc(db, 'settings', 'app'),
    { nextVoucherNumber: newCounterLast + 1 },
    { merge: true }
  );

  // 6. Log to auditLog
  await createAuditLogEntry({
    action: 'backup_restore',
    targetPath: 'backup/restore',
    summary: `استيراد نسخة احتياطية (${options.mode === 'merge' ? 'دمج' : 'استبدال'}): ${importedCounts.vouchers} سند، ${importedCounts.buses} حافلة، إعادة بناء ${rebuiltActiveBuses} حافلة نشطة و${rebuiltReleasedBuses} محررة، آخر رقم سند=${newCounterLast}`,
    metadata: {
      mode: options.mode,
      includeUserRoles: options.includeUserRoles,
      importedVouchers: importedCounts.vouchers,
      importedBuses: importedCounts.buses,
      skippedExisting,
      rebuiltActiveBuses,
      rebuiltReleasedBuses,
      newCounterLast,
    },
    performedByUid: options.performedByUid,
    performedByName: options.performedByName,
    performedByRole: options.performedByRole,
  });

  return {
    stoppedOnError: false,
    mode: options.mode,
    includeUserRoles: options.includeUserRoles,
    completedOps,
    totalOps,
    remainingOps: 0,
    imported: importedCounts,
    skippedExisting,
    rebuiltActiveBuses,
    rebuiltReleasedBuses,
    busConflicts,
    newCounterLast,
  };
}
