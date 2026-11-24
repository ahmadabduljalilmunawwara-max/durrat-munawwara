export const IDLE_DRAFT_STORAGE_PREFIX = 'dmtc_idle_voucher_draft_';
export const IDLE_DRAFT_LATEST_KEY = 'dmtc_idle_voucher_draft_latest';
export const IDLE_LOGOUT_REASON_KEY = 'dmtc_idle_logout_reason';

type BusyListener = (busyCount: number) => void;

let activeBusyCount = 0;
const busyListeners = new Set<BusyListener>();
let activeVoucherDraftSaver: (() => void) | null = null;

function notifyBusyListeners() {
  busyListeners.forEach((listener) => {
    try {
      listener(activeBusyCount);
    } catch {
      // ignore listener errors
    }
  });
}

export function beginBusyActivity(): () => void {
  activeBusyCount += 1;
  notifyBusyListeners();

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    activeBusyCount = Math.max(0, activeBusyCount - 1);
    notifyBusyListeners();
  };
}

export function isAnyBusyActivity(): boolean {
  return activeBusyCount > 0;
}

export function subscribeBusyActivity(listener: BusyListener): () => void {
  busyListeners.add(listener);
  return () => {
    busyListeners.delete(listener);
  };
}

export function registerVoucherDraftSaver(saver: (() => void) | null): void {
  activeVoucherDraftSaver = saver;
}

export function flushVoucherDraftToSessionStorage(): void {
  if (!activeVoucherDraftSaver) return;
  try {
    activeVoucherDraftSaver();
  } catch (err) {
    console.warn('Failed to flush voucher draft to sessionStorage:', err);
  }
}
