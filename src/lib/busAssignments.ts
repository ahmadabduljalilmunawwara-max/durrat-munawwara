import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { toEnglishDigits } from './voucherValidation';

export type BusAssignmentStatus = 'active' | 'released';
export type BusReleaseReason = 'archived' | 'cancelled' | 'edited';

export interface BusAssignmentRecord {
  voucherId: string;
  voucherNumber: number;
  officeNo: string;
  officeName: string;
  createdAt: unknown;
  status: BusAssignmentStatus;
  releasedAt?: unknown | null;
  releaseReason?: BusReleaseReason | null;
}

export interface BusConflictDetail {
  busNumber: string;
  voucherId: string;
  voucherNumber: number | string;
  officeNo: string;
  officeName: string;
  officeLabel: string;
}

export interface MigrationConflictVoucherRef {
  voucherId: string;
  voucherNumber: number | string;
  officeNo: string;
  officeName: string;
  officeLabel: string;
  timestamp: string;
}

export interface MigrationConflictItem {
  busNumber: string;
  chosenVoucherNumber: number | string;
  chosenOfficeLabel: string;
  vouchers: MigrationConflictVoucherRef[];
  offices: string[];
}

export interface BusMigrationReport {
  completed: boolean;
  migratedAt: string;
  createdActiveCount: number;
  createdReleasedCount: number;
  skippedExistingCount: number;
  totalActiveCount: number;
  totalReleasedCount: number;
  conflicts: MigrationConflictItem[];
}

export function formatOfficeLabel(officeNo?: string, officeName?: string): string {
  const no = toEnglishDigits(String(officeNo || '')).trim();
  const name = String(officeName || '').trim();
  if (no && name) return `${no} (${name})`;
  return name || no || 'غير محدد';
}

export function buildBusConflictMessage(
  busNumber: string,
  voucherNumber: string | number,
  officeLabel: string
): string {
  return `الحافلة ${busNumber} مسجّلة في السند ${voucherNumber} للمكتب ${officeLabel} ولم تُؤرشف بعد`;
}

export function normalizeBusNumber(raw: unknown): string {
  return toEnglishDigits(String(raw ?? '')).trim();
}

export function extractVoucherBusNumbers(voucher: any): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  if (Array.isArray(voucher?.buses)) {
    for (const b of voucher.buses) {
      const clean = normalizeBusNumber(b?.busNumber);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        result.push(clean);
      }
    }
  }

  const primary = normalizeBusNumber(voucher?.busNumber);
  if (primary && !seen.has(primary)) {
    seen.add(primary);
    result.push(primary);
  }

  return result;
}

export function countUniqueBusesInVouchers(vouchers: any[]): number {
  const uniqueBuses = new Set<string>();
  for (const v of vouchers) {
    for (const busNum of extractVoucherBusNumbers(v)) {
      uniqueBuses.add(busNum);
    }
  }
  return uniqueBuses.size;
}

export function extractVoucherBusesList(voucher: any): Array<{
  busNumber: string;
  driverName: string;
  busType: string;
  driverPhone: string;
  notes?: string;
  overrideReason?: string;
  overriddenVoucherNumber?: string | number;
}> {
  if (Array.isArray(voucher?.buses) && voucher.buses.length > 0) {
    return voucher.buses
      .map((b: any) => ({
        busNumber: normalizeBusNumber(b?.busNumber),
        driverName: String(b?.driverName || '').trim(),
        busType: String(b?.busType || voucher?.busType || 'حافلة').trim(),
        driverPhone: String(b?.driverPhone || '').trim(),
        ...(b?.notes ? { notes: String(b.notes) } : {}),
        ...(b?.overrideReason ? { overrideReason: String(b.overrideReason) } : {}),
        ...(b?.overriddenVoucherNumber !== undefined
          ? { overriddenVoucherNumber: b.overriddenVoucherNumber }
          : {}),
      }))
      .filter((b: any) => Boolean(b.busNumber));
  }

  const primary = normalizeBusNumber(voucher?.busNumber);
  if (!primary) return [];

  return [
    {
      busNumber: primary,
      driverName: String(voucher?.driverName || '').trim(),
      busType: String(voucher?.busType || 'حافلة').trim(),
      driverPhone: String(voucher?.driverPhone || '').trim(),
    },
  ];
}

export async function checkBusActiveAssignment(
  busNumber: string,
  excludeVoucherId?: string
): Promise<BusConflictDetail | null> {
  const cleanBusNum = normalizeBusNumber(busNumber);
  if (!cleanBusNum) return null;

  const assignRef = doc(db, 'busAssignments', cleanBusNum);
  const assignSnap = await getDoc(assignRef);
  if (!assignSnap.exists()) return null;

  const data = assignSnap.data();
  if (data?.status === 'active' && (!excludeVoucherId || data.voucherId !== excludeVoucherId)) {
    return {
      busNumber: cleanBusNum,
      voucherId: String(data.voucherId || ''),
      voucherNumber: data.voucherNumber ?? '—',
      officeNo: String(data.officeNo || ''),
      officeName: String(data.officeName || ''),
      officeLabel: formatOfficeLabel(data.officeNo, data.officeName),
    };
  }

  return null;
}

/**
 * Archives one or many vouchers and releases all their buses inside the same Firestore transaction(s).
 * Safely chunks if total Firestore operations approach the 500-op transaction cap.
 */
export async function archiveVouchersAtomically(
  vouchers: any[],
  options: {
    archivedBy: string;
    extraVoucherFields?: Record<string, unknown>;
  }
): Promise<{ archivedVouchersCount: number; releasedBusesCount: number }> {
  if (!vouchers || vouchers.length === 0) {
    return { archivedVouchersCount: 0, releasedBusesCount: 0 };
  }

  const allBatchVoucherIds = new Set(vouchers.map((v) => String(v.id)));
  const nowIso = new Date().toISOString();

  // Build safe transaction chunks (respecting Firestore's 20 rule-lookup limit per transaction)
  const chunks: any[][] = [];
  let currentChunk: any[] = [];
  let currentUniqueBuses = new Set<string>();

  for (const v of vouchers) {
    const vBuses = extractVoucherBusNumbers(v);
    const projectedUniqueBuses = new Set(currentUniqueBuses);
    vBuses.forEach((b) => projectedUniqueBuses.add(b));

    if (
      currentChunk.length > 0 &&
      (projectedUniqueBuses.size > 10 || currentChunk.length >= 15)
    ) {
      chunks.push(currentChunk);
      currentChunk = [v];
      currentUniqueBuses = new Set(vBuses);
    } else {
      currentChunk.push(v);
      currentUniqueBuses = projectedUniqueBuses;
    }
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  const releasedBusSet = new Set<string>();

  for (const chunk of chunks) {
    const busToSourceVoucher = new Map<string, any>();
    for (const v of chunk) {
      for (const b of extractVoucherBusNumbers(v)) {
        // Keep newest by voucherNumber if multiple vouchers in chunk share a bus
        const prev = busToSourceVoucher.get(b);
        if (!prev || (Number(v.voucherNumber) || 0) >= (Number(prev.voucherNumber) || 0)) {
          busToSourceVoucher.set(b, v);
        }
      }
    }

    const chunkBusNumbers = Array.from(busToSourceVoucher.keys());

    try {
      await runTransaction(db, async (transaction) => {
        // 1. All reads MUST happen before any writes
        const busRefs = chunkBusNumbers.map((b) => doc(db, 'busAssignments', b));
        const busSnaps = await Promise.all(busRefs.map((ref) => transaction.get(ref)));

        // 2. Archive every voucher in this chunk
        for (const v of chunk) {
          const voucherRef = doc(db, 'vouchers', v.id);
          transaction.update(voucherRef, {
            archived: true,
            archivedAt: nowIso,
            archivedBy: options.archivedBy,
            ...(options.extraVoucherFields || {}),
          });
        }

        // 3. Release every bus in this chunk atomically
        for (let i = 0; i < chunkBusNumbers.length; i++) {
          const busNum = chunkBusNumbers[i];
          const assignRef = busRefs[i];
          const assignSnap = busSnaps[i];
          const sourceVoucher = busToSourceVoucher.get(busNum);

          if (assignSnap.exists()) {
            const assignData = assignSnap.data();
            const isOwnedByArchivedBatch = allBatchVoucherIds.has(String(assignData.voucherId || ''));
            if (assignData.status === 'active' && isOwnedByArchivedBatch) {
              transaction.update(assignRef, {
                status: 'released',
                releasedAt: serverTimestamp(),
                releaseReason: 'archived',
              });
              releasedBusSet.add(busNum);
            }
          } else if (sourceVoucher) {
            transaction.set(assignRef, {
              voucherId: String(sourceVoucher.id),
              voucherNumber: Math.max(1, Math.trunc(Number(sourceVoucher.voucherNumber) || 1)),
              officeNo: toEnglishDigits(String(sourceVoucher.delegateNumber || '')).trim().slice(0, 40),
              officeName: String(sourceVoucher.organization || '').trim().slice(0, 200),
              createdAt: serverTimestamp(),
              status: 'released',
              releasedAt: serverTimestamp(),
              releaseReason: 'archived',
            });
            releasedBusSet.add(busNum);
          }
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'vouchers+busAssignments(archive)');
    }
  }

  return {
    archivedVouchersCount: vouchers.length,
    releasedBusesCount: releasedBusSet.size,
  };
}

/**
 * Restores an archived voucher ONLY if none of its buses are currently reserved ("active") in another voucher.
 * Re-reserves all its buses inside the same transaction.
 */
export async function unarchiveVoucherAtomically(voucher: any): Promise<void> {
  const busNumbers = extractVoucherBusNumbers(voucher);
  const voucherRef = doc(db, 'vouchers', voucher.id);

  await runTransaction(db, async (transaction) => {
    const voucherSnap = await transaction.get(voucherRef);
    if (!voucherSnap.exists()) {
      throw new Error('UNARCHIVE_ERROR:السند غير موجود في قاعدة البيانات');
    }

    const latestVoucherData = voucherSnap.data();
    const busRefs = busNumbers.map((b) => doc(db, 'busAssignments', b));
    const busSnaps = await Promise.all(busRefs.map((ref) => transaction.get(ref)));

    const conflicts: string[] = [];
    for (let i = 0; i < busNumbers.length; i++) {
      const busNum = busNumbers[i];
      const snap = busSnaps[i];
      if (snap.exists()) {
        const data = snap.data();
        if (data.status === 'active' && data.voucherId !== voucher.id) {
          const officeLabel = formatOfficeLabel(data.officeNo, data.officeName);
          conflicts.push(
            `الحافلة ${busNum} (محجوزة في السند #${data.voucherNumber} للمكتب ${officeLabel})`
          );
        }
      }
    }

    if (conflicts.length > 0) {
      throw new Error(
        `UNARCHIVE_CONFLICT:لا يمكن استرجاع السند #${latestVoucherData.voucherNumber || voucher.voucherNumber} لأن الحافلات التالية محجوزة في سندات نشطة أخرى: ${conflicts.join('، ')}`
      );
    }

    transaction.update(voucherRef, {
      archived: false,
      unarchivedAt: new Date().toISOString(),
    });

    const vNumber = Math.max(
      1,
      Math.trunc(Number(latestVoucherData.voucherNumber ?? voucher.voucherNumber) || 1)
    );
    const officeNo = toEnglishDigits(
      String(latestVoucherData.delegateNumber ?? voucher.delegateNumber ?? '')
    )
      .trim()
      .slice(0, 40);
    const officeName = String(latestVoucherData.organization ?? voucher.organization ?? '')
      .trim()
      .slice(0, 200);

    for (let i = 0; i < busNumbers.length; i++) {
      transaction.set(busRefs[i], {
        voucherId: String(voucher.id),
        voucherNumber: vNumber,
        officeNo,
        officeName,
        createdAt: serverTimestamp(),
        status: 'active',
        releasedAt: null,
        releaseReason: null,
      });
    }
  });
}

/**
 * Updates a voucher and atomically syncs busAssignments:
 * - Newly added buses are verified not to be "active" on another voucher (throws CONFLICT:...)
 * - Removed buses are released with releaseReason = "edited"
 * - Current buses on an unarchived voucher are reserved/updated as "active"
 */
export async function updateVoucherWithBusSyncAtomically(
  originalVoucher: any,
  updatedFields: Record<string, unknown>,
  nextBusesList: Array<{
    busNumber: string;
    driverName: string;
    busType?: string;
    driverPhone?: string;
    notes?: string;
  }>
): Promise<void> {
  const oldBusNumbers = extractVoucherBusNumbers(originalVoucher);
  const sanitizedBuses = nextBusesList
    .map((b) => ({
      busNumber: normalizeBusNumber(b.busNumber),
      driverName: String(b.driverName || '').trim(),
      busType: String(b.busType || 'حافلة').trim(),
      driverPhone: String(b.driverPhone || '').trim(),
      notes: String(b.notes || ''),
    }))
    .filter((b) => Boolean(b.busNumber));

  const newBusNumbers = Array.from(new Set(sanitizedBuses.map((b) => b.busNumber)));
  const removedBusNumbers = oldBusNumbers.filter((b) => !newBusNumbers.includes(b));
  const addedBusNumbers = newBusNumbers.filter((b) => !oldBusNumbers.includes(b));
  const allInvolvedBuses = Array.from(new Set([...oldBusNumbers, ...newBusNumbers]));

  const voucherRef = doc(db, 'vouchers', originalVoucher.id);

  await runTransaction(db, async (transaction) => {
    const voucherSnap = await transaction.get(voucherRef);
    if (!voucherSnap.exists()) {
      throw new Error('السند غير موجود في قاعدة البيانات');
    }
    const existingVoucher = voucherSnap.data();

    const busRefs = allInvolvedBuses.map((b) => doc(db, 'busAssignments', b));
    const busSnaps = await Promise.all(busRefs.map((ref) => transaction.get(ref)));
    const snapMap = new Map<string, { ref: ReturnType<typeof doc>; snap: (typeof busSnaps)[number] }>();
    allInvolvedBuses.forEach((b, idx) => {
      snapMap.set(b, { ref: busRefs[idx], snap: busSnaps[idx] });
    });

    const isArchived =
      typeof updatedFields.archived === 'boolean'
        ? updatedFields.archived
        : Boolean(existingVoucher.archived === true);

    if (!isArchived) {
      for (const busNum of addedBusNumbers) {
        const entry = snapMap.get(busNum);
        if (entry?.snap.exists()) {
          const data = entry.snap.data();
          if (data.status === 'active' && data.voucherId !== originalVoucher.id) {
            const officeLabel = formatOfficeLabel(data.officeNo, data.officeName);
            throw new Error(
              `CONFLICT:${buildBusConflictMessage(busNum, data.voucherNumber ?? '—', officeLabel)}`
            );
          }
        }
      }
    }

    const finalPayload: Record<string, unknown> = {
      ...updatedFields,
      buses: sanitizedBuses,
      busesQuantity: String(sanitizedBuses.length),
      busNumber: sanitizedBuses[0]?.busNumber || String(updatedFields.busNumber || ''),
      driverName: sanitizedBuses[0]?.driverName || String(updatedFields.driverName || ''),
      driverPhone: sanitizedBuses[0]?.driverPhone || String(updatedFields.driverPhone || ''),
      busType: sanitizedBuses[0]?.busType || String(updatedFields.busType || ''),
      updatedAt: new Date().toISOString(),
    };

    transaction.update(voucherRef, finalPayload);

    // 1. Release removed buses
    for (const removedBus of removedBusNumbers) {
      const entry = snapMap.get(removedBus);
      if (entry?.snap.exists()) {
        const data = entry.snap.data();
        if (data.voucherId === originalVoucher.id && data.status === 'active') {
          transaction.update(entry.ref, {
            status: 'released',
            releasedAt: serverTimestamp(),
            releaseReason: 'edited',
          });
        }
      }
    }

    // 2. Reserve added/active buses if voucher is active (not archived)
    if (!isArchived) {
      const vNumber = Math.max(
        1,
        Math.trunc(
          Number(
            updatedFields.voucherNumber ??
              existingVoucher.voucherNumber ??
              originalVoucher.voucherNumber
          ) || 1
        )
      );
      const officeNo = toEnglishDigits(
        String(
          updatedFields.delegateNumber ??
            existingVoucher.delegateNumber ??
            originalVoucher.delegateNumber ??
            ''
        )
      )
        .trim()
        .slice(0, 40);
      const officeName = String(
        updatedFields.organization ??
          existingVoucher.organization ??
          originalVoucher.organization ??
          ''
      )
        .trim()
        .slice(0, 200);

      for (const activeBus of newBusNumbers) {
        const entry = snapMap.get(activeBus);
        if (!entry) continue;

        const exists = entry.snap.exists();
        const existingData = exists ? entry.snap.data() : null;
        const canWriteActive =
          !exists ||
          existingData?.status !== 'active' ||
          existingData?.voucherId === originalVoucher.id;

        if (canWriteActive) {
          transaction.set(entry.ref, {
            voucherId: String(originalVoucher.id),
            voucherNumber: vNumber,
            officeNo,
            officeName,
            createdAt:
              exists && existingData?.voucherId === originalVoucher.id && existingData?.createdAt
                ? existingData.createdAt
                : serverTimestamp(),
            status: 'active',
            releasedAt: null,
            releaseReason: null,
          });
        }
      }
    }
  });
}

/**
 * Deletes (cancels) a voucher and releases all its active busAssignments inside the same transaction.
 */
export async function deleteVoucherWithBusReleaseAtomically(voucher: any): Promise<void> {
  const busNumbers = extractVoucherBusNumbers(voucher);
  const voucherRef = doc(db, 'vouchers', voucher.id);

  try {
    await runTransaction(db, async (transaction) => {
      const voucherSnap = await transaction.get(voucherRef);
      const busRefs = busNumbers.map((b) => doc(db, 'busAssignments', b));
      const busSnaps = await Promise.all(busRefs.map((ref) => transaction.get(ref)));

      if (voucherSnap.exists()) {
        transaction.delete(voucherRef);
      }

      for (let i = 0; i < busNumbers.length; i++) {
        const snap = busSnaps[i];
        if (snap.exists()) {
          const data = snap.data();
          if (data.voucherId === voucher.id && data.status === 'active') {
            transaction.update(busRefs[i], {
              status: 'released',
              releasedAt: serverTimestamp(),
              releaseReason: 'cancelled',
            });
          }
        }
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `vouchers/${voucher.id}`);
  }
}

function getVoucherSortKey(v: any): { timeMs: number; voucherNum: number } {
  let timeMs = 0;
  if (typeof v?.timestamp === 'string') {
    const parsed = Date.parse(v.timestamp);
    if (!Number.isNaN(parsed)) timeMs = parsed;
  } else if (typeof v?.timestamp?.toMillis === 'function') {
    timeMs = v.timestamp.toMillis();
  } else if (typeof v?.customDate === 'string') {
    const parsed = Date.parse(v.customDate);
    if (!Number.isNaN(parsed)) timeMs = parsed;
  }
  const voucherNum = Number(v?.voucherNumber) || 0;
  return { timeMs, voucherNum };
}

function compareNewestVoucherFirst(a: any, b: any): number {
  const ka = getVoucherSortKey(a);
  const kb = getVoucherSortKey(b);
  if (kb.timeMs !== ka.timeMs) return kb.timeMs - ka.timeMs;
  return kb.voucherNum - ka.voucherNum;
}

/**
 * Idempotent one-time migration from `vouchers` -> `busAssignments`.
 * - NEVER overwrites an existing `busAssignments` document.
 * - Buses in non-archived vouchers -> `status: "active"` (assigned to newest voucher if conflicted).
 * - Buses only in archived vouchers -> `status: "released"`, `releaseReason: "archived"`.
 * - Detects and returns all buses appearing in more than one non-archived voucher.
 */
export async function runBusAssignmentsMigration(options?: {
  saveReportToSettings?: boolean;
}): Promise<BusMigrationReport> {
  const busAssignmentsQuery = query(
    collection(db, 'busAssignments'),
    where('status', 'in', ['active', 'released', 'archived'])
  );

  const [vouchersSnap, existingAssignSnap] = await Promise.all([
    getDocs(collection(db, 'vouchers')),
    getDocs(busAssignmentsQuery),
  ]);

  const existingIds = new Set<string>();
  existingAssignSnap.forEach((docSnap) => {
    existingIds.add(docSnap.id);
  });

  const activeByBus = new Map<string, any[]>();
  const archivedByBus = new Map<string, any[]>();

  vouchersSnap.forEach((docSnap) => {
    const vData: any = { id: docSnap.id, ...docSnap.data() };
    const isArchived = vData.archived === true;
    const buses = extractVoucherBusNumbers(vData);

    for (const busNum of buses) {
      const targetMap = isArchived ? archivedByBus : activeByBus;
      const list = targetMap.get(busNum) || [];
      if (!list.some((item) => item.id === vData.id)) {
        list.push(vData);
      }
      targetMap.set(busNum, list);
    }
  });

  const conflicts: MigrationConflictItem[] = [];
  const toCreate: Array<{
    busNumber: string;
    payload: Record<string, unknown>;
    kind: 'active' | 'released';
  }> = [];

  let skippedExistingCount = 0;

  // 1. Non-archived vouchers -> active
  for (const [busNumber, vouchersList] of activeByBus.entries()) {
    const sorted = [...vouchersList].sort(compareNewestVoucherFirst);
    const newest = sorted[0];

    if (sorted.length > 1) {
      const voucherRefs: MigrationConflictVoucherRef[] = sorted.map((v) => ({
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
        vouchers: voucherRefs,
        offices: Array.from(new Set(voucherRefs.map((vr) => vr.officeLabel))),
      });
    }

    if (existingIds.has(busNumber)) {
      skippedExistingCount++;
      continue;
    }

    toCreate.push({
      busNumber,
      kind: 'active',
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

  // 2. Archived-only vouchers -> released
  for (const [busNumber, vouchersList] of archivedByBus.entries()) {
    if (activeByBus.has(busNumber)) continue;

    const sorted = [...vouchersList].sort(compareNewestVoucherFirst);
    const newestArchived = sorted[0];

    if (existingIds.has(busNumber)) {
      skippedExistingCount++;
      continue;
    }

    toCreate.push({
      busNumber,
      kind: 'released',
      payload: {
        voucherId: String(newestArchived.id),
        voucherNumber: Math.max(1, Math.trunc(Number(newestArchived.voucherNumber) || 1)),
        officeNo: toEnglishDigits(String(newestArchived.delegateNumber || '')).trim().slice(0, 40),
        officeName: String(newestArchived.organization || '').trim().slice(0, 200),
        createdAt: serverTimestamp(),
        status: 'released',
        releasedAt: serverTimestamp(),
        releaseReason: 'archived',
      },
    });
  }

  // Execute safe transactional writes in chunks (double-checking !snap.exists() inside transaction)
  let createdActiveCount = 0;
  let createdReleasedCount = 0;

  const chunkSize = 4;
  for (let i = 0; i < toCreate.length; i += chunkSize) {
    const chunk = toCreate.slice(i, i + chunkSize);
    await runTransaction(db, async (transaction) => {
      const refs = chunk.map((item) => doc(db, 'busAssignments', item.busNumber));
      const snaps = await Promise.all(refs.map((ref) => transaction.get(ref)));

      for (let j = 0; j < chunk.length; j++) {
        if (snaps[j].exists()) {
          skippedExistingCount++;
          continue;
        }
        transaction.set(refs[j], chunk[j].payload);
        if (chunk[j].kind === 'active') {
          createdActiveCount++;
        } else {
          createdReleasedCount++;
        }
      }
    });
  }

  // Re-read busAssignments for accurate final totals
  const finalSnap = await getDocs(busAssignmentsQuery);
  let totalActiveCount = 0;
  let totalReleasedCount = 0;
  finalSnap.forEach((docSnap) => {
    const st = docSnap.data()?.status;
    if (st === 'active') totalActiveCount++;
    else if (st === 'released' || st === 'archived') totalReleasedCount++;
  });

  conflicts.sort((a, b) => a.busNumber.localeCompare(b.busNumber, 'en', { numeric: true }));

  const report: BusMigrationReport = {
    completed: true,
    migratedAt: new Date().toISOString(),
    createdActiveCount,
    createdReleasedCount,
    skippedExistingCount,
    totalActiveCount,
    totalReleasedCount,
    conflicts,
  };

  if (options?.saveReportToSettings !== false) {
    try {
      await setDoc(doc(db, 'settings', 'busAssignmentsMigration'), report, { merge: true });
    } catch (err) {
      console.warn('Could not persist busAssignmentsMigration summary:', err);
    }
  }

  return report;
}
