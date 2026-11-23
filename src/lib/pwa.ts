import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
let installed =
  typeof window !== 'undefined' &&
  (window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true);

let needRefreshState = false;
let updateSWFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let isInitialized = false;

const installListeners = new Set<() => void>();
const updateListeners = new Set<() => void>();

function notifyInstallListeners() {
  installListeners.forEach((cb) => cb());
}

function notifyUpdateListeners() {
  updateListeners.forEach((cb) => cb());
}

export function initPWA() {
  if (isInitialized || typeof window === 'undefined') return;
  isInitialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event as BeforeInstallPromptEvent;
    installed = false;
    notifyInstallListeners();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installed = true;
    notifyInstallListeners();
  });

  try {
    updateSWFn = registerSW({
      immediate: true,
      onNeedRefresh() {
        needRefreshState = true;
        notifyUpdateListeners();
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;
        // Periodically check for updated builds when returning to the app
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            void registration.update();
          }
        });
      },
    });
  } catch (err) {
    console.warn('PWA service worker registration skipped:', err);
  }
}

export function usePWAInstall() {
  const [state, setState] = useState(() => ({
    canInstall: Boolean(deferredInstallPrompt) && !installed,
    isInstalled: installed,
  }));

  useEffect(() => {
    initPWA();
    const sync = () => {
      setState({
        canInstall: Boolean(deferredInstallPrompt) && !installed,
        isInstalled: installed,
      });
    };
    installListeners.add(sync);
    sync();
    return () => {
      installListeners.delete(sync);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredInstallPrompt) return;
    const promptEvent = deferredInstallPrompt;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      deferredInstallPrompt = null;
      if (outcome === 'accepted') {
        installed = true;
      }
    } catch {
      deferredInstallPrompt = null;
    } finally {
      notifyInstallListeners();
    }
  };

  return {
    canInstall: state.canInstall,
    isInstalled: state.isInstalled,
    promptInstall,
  };
}

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(needRefreshState);

  useEffect(() => {
    initPWA();
    const sync = () => setNeedRefresh(needRefreshState);
    updateListeners.add(sync);
    sync();
    return () => {
      updateListeners.delete(sync);
    };
  }, []);

  const applyUpdate = async () => {
    needRefreshState = false;
    notifyUpdateListeners();
    if (updateSWFn) {
      await updateSWFn(true);
    } else {
      window.location.reload();
    }
  };

  return {
    needRefresh,
    applyUpdate,
  };
}
