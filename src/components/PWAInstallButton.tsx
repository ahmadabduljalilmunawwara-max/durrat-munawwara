import React from 'react';
import { MonitorDown } from 'lucide-react';
import { usePWAInstall } from '../lib/pwa';

interface PWAInstallButtonProps {
  variant?: 'login' | 'topbar';
}

export function PWAInstallButton({ variant = 'login' }: PWAInstallButtonProps) {
  const { canInstall, isInstalled, promptInstall } = usePWAInstall();

  if (!canInstall || isInstalled) {
    return null;
  }

  if (variant === 'topbar') {
    return (
      <button
        type="button"
        onClick={() => void promptInstall()}
        className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] min-h-[44px] bg-[var(--btn-primary)] hover:bg-[var(--btn-primary-hover)] text-white rounded-2xl font-bold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
      >
        <MonitorDown size={17} className="text-[var(--gold)] shrink-0" />
        <span>تثبيت التطبيق على الحاسوب</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void promptInstall()}
      className="w-full mt-[var(--space-3)] min-h-[46px] px-[var(--space-4)] py-[var(--space-2)] rounded-2xl border border-[var(--border)] bg-[var(--surface-subtle)] hover:border-[var(--primary)] hover:bg-[var(--surface)] text-[var(--primary)] font-extrabold text-sm flex items-center justify-center gap-[var(--space-2)] transition-all cursor-pointer shadow-2xs"
    >
      <MonitorDown size={18} className="text-[var(--gold)] shrink-0" />
      <span>تثبيت التطبيق على الحاسوب</span>
    </button>
  );
}
