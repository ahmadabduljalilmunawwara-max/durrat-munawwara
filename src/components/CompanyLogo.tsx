import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';

interface LogoProps {
  className?: string;
  size?: number | string;
  src?: string;
}

// Module-level cache so all instances share the real-time logo without redundant subscriptions
let cachedLogoUrl: string | null = null;
const listeners = new Set<(url: string | null) => void>();

let unsubGlobal: (() => void) | null = null;
function initLogoListener() {
  if (unsubGlobal) return;
  try {
    unsubGlobal = onSnapshot(doc(db, 'settings', 'app'), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const url = data.logoUrl || null;
        cachedLogoUrl = url;
        listeners.forEach(cb => cb(url));
      }
    }, (err) => {
      console.warn('CompanyLogo settings fetch warning:', err);
    });
  } catch (e) {
    console.error('Failed to listen to logo from settings:', e);
  }
}

export function CompanyLogo({ className = "", size = "100%", src }: LogoProps) {
  const [logoSrc, setLogoSrc] = useState<string | null>(src || cachedLogoUrl);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (src) {
      setLogoSrc(src);
      setImageError(false);
      return;
    }

    initLogoListener();
    const handleUpdate = (url: string | null) => {
      setLogoSrc(url);
      setImageError(false);
    };

    listeners.add(handleUpdate);
    if (cachedLogoUrl !== undefined) {
      setLogoSrc(cachedLogoUrl);
    }

    return () => {
      listeners.delete(handleUpdate);
    };
  }, [src]);

  // If there's an uploaded logo and it hasn't failed to load, display the image
  if (logoSrc && !imageError) {
    return (
      <div 
        className={`relative flex items-center justify-center overflow-hidden ${className}`} 
        style={{ width: size, height: typeof size === 'number' ? size : size, maxHeight: typeof size === 'string' && size.includes('px') ? size : undefined }}
      >
        <img 
          src={logoSrc} 
          alt="شعار درة المنورة" 
          className="w-full h-full object-contain select-none"
          onError={() => setImageError(true)}
        />
      </div>
    );
  }

  // Default Vector SVG Logo
  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`} style={{ width: size, height: 'auto' }}>
      <svg viewBox="0 0 400 400" className="w-full h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Abstract Lotus Petals (Top - Orange/Yellow) */}
        <path d="M200 180C140 100 170 50 200 20C230 50 260 100 200 180Z" fill="url(#grad-top)" />
        <path d="M165 185C100 140 80 80 100 40C130 60 160 100 165 185Z" fill="url(#grad-left)" />
        <path d="M235 185C300 140 320 80 300 40C270 60 240 100 235 185Z" fill="url(#grad-right)" />
        
        {/* Bottom Petals (Blue) */}
        <path d="M140 200C80 210 60 240 80 270C110 260 130 220 140 200Z" fill="url(#grad-bot-left)" />
        <path d="M260 200C320 210 340 240 320 270C290 260 270 220 260 200Z" fill="url(#grad-bot-right)" />
        
        {/* Text Area */}
        <text x="200" y="320" textAnchor="middle" className="font-black" style={{ fill: '#333366', fontSize: '50px', fontFamily: 'sans-serif' }}>DMTC</text>
        <text x="200" y="370" textAnchor="middle" className="font-black" style={{ fill: '#442266', fontSize: '36px', fontFamily: 'sans-serif' }}>درة المنورة</text>
        <text x="200" y="395" textAnchor="middle" className="font-bold" style={{ fill: '#666', fontSize: '14px', fontFamily: 'sans-serif' }}>لنقل الحجاج والمعتمرين</text>

        <defs>
          <linearGradient id="grad-top" x1="180" y1="20" x2="220" y2="180" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="grad-left" x1="100" y1="40" x2="165" y2="185" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="grad-right" x1="300" y1="40" x2="235" y2="185" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
          <linearGradient id="grad-bot-left" x1="80" y1="270" x2="140" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="grad-bot-right" x1="320" y1="270" x2="260" y2="200" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
}

