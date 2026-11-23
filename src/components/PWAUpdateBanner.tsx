import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePWAUpdate } from '../lib/pwa';

export function PWAUpdateBanner() {
  const { needRefresh, applyUpdate } = usePWAUpdate();
  const [isUpdating, setIsUpdating] = useState(false);

  if (!needRefresh) {
    return null;
  }

  const handleClick = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await applyUpdate();
    } catch {
      window.location.reload();
    }
  };

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-[120]"
    >
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={isUpdating}
        className="inline-flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] rounded-2xl bg-[var(--navy)] hover:bg-[#1E293B] text-white border border-blue-400/35 shadow-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer disabled:opacity-80"
      >
        <RefreshCw
          size={16}
          className={`text-[var(--gold)] shrink-0 ${isUpdating ? 'animate-spin' : ''}`}
        />
        <span>يتوفر تحديث، اضغط للتحديث</span>
      </button>
    </div>
  );
}
