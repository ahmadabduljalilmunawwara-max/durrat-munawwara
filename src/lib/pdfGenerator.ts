import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import arabicReshaper from 'arabic-reshaper';
import Bidi from 'bidi-js';
import QRCode from 'qrcode';
import { getFittedReceiptFontSizePt, resolveVoucherIssuerForPrint } from './issuerName';
import { beginBusyActivity } from './activityTracker';
import {
  computePrintLayoutMetrics,
  DEFAULT_COMPANY_ADDRESS,
  DEFAULT_COMPANY_PHONE,
  DEFAULT_COMPANY_WEBSITE,
  formatHijriDDMMYYYYWithOffset,
  formatHijriLongWithOffset,
  normalizeHijriOffsetDays,
  normalizePdfMargins,
  normalizePrintCopies,
  normalizePrintCopyLabels,
  normalizeSloganHeightMm,
} from './printSettings';

import ibmPlexArabic400Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2?url';
import ibmPlexArabic500Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2?url';
import ibmPlexArabic600Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2?url';
import ibmPlexArabic700Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2?url';
import ibmPlexLatin400Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2?url';
import ibmPlexLatin500Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-500-normal.woff2?url';
import ibmPlexLatin600Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2?url';
import ibmPlexLatin700Url from '@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2?url';

const bidi = Bidi();

/**
 * دالة مطورة لمعالجة النصوص العربية وحل مشاكل التشوه والنقاط المشطوبة
 */
export function clean_and_reshape_text(text: string | number): string {
  if (text === undefined || text === null) return "";
  
  let sanitized = text.toString();
  sanitized = sanitized.replace(/86523/g, '');

  try {
    const reshaped = arabicReshaper.reshape(sanitized);
    return bidi.getDisplay(reshaped);
  } catch (e) {
    return sanitized;
  }
}

/**
 * دالة للتحقق من وجود القيمة وصحتها لضمان إخفاء الخط للمدخلات الفارغة
 */
function hasValue(val: any): boolean {
  if (val === undefined || val === null) return false;
  return String(val).trim() !== '';
}

/**
 * دالة لتصغير الخط تلقائياً بناءً على طول النص لضمان الاحتواء
 */
function getFontSizeForText(text: string, defaultSize: number, maxLength: number): number {
  if (!text) return defaultSize;
  const len = text.length;
  if (len <= maxLength) return defaultSize;
  const ratio = maxLength / len;
  return Math.max(defaultSize * ratio, defaultSize * 0.7); // تقليل الحجم بحد أقصى 30%
}

function toEnglishDigits(input: string | number | null | undefined): string {
  if (input === undefined || input === null) return '';
  return String(input)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatGregorianDDMMYYYY(customDate?: string, timestamp?: string): { display: string; filePart: string } {
  const raw = toEnglishDigits(customDate || '').trim();
  const ymdMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    return { display: `${dd}/${mm}/${y}`, filePart: `${dd}-${mm}-${y}` };
  }
  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    return { display: `${dd}/${mm}/${y}`, filePart: `${dd}-${mm}-${y}` };
  }

  const parsed = timestamp ? new Date(timestamp) : new Date();
  const safeDate = isNaN(parsed.getTime()) ? new Date() : parsed;
  const display = toEnglishDigits(format(safeDate, 'dd/MM/yyyy'));
  const filePart = toEnglishDigits(format(safeDate, 'dd-MM-yyyy'));
  return { display, filePart };
}

function formatHijriDDMMYYYY(
  hijriDate?: string,
  customDate?: string,
  timestamp?: string,
  hijriOffsetDays: number = 0
): string {
  const safeOffset = normalizeHijriOffsetDays(hijriOffsetDays);
  if (safeOffset !== 0 && (customDate || timestamp)) {
    const adjusted = formatHijriDDMMYYYYWithOffset(customDate || timestamp, safeOffset);
    if (adjusted) return adjusted;
  }

  const raw = toEnglishDigits(hijriDate || '').trim();
  const ymdMatch = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const dmyMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }

  return formatHijriDDMMYYYYWithOffset(customDate || timestamp, safeOffset);
}

function formatAuditDateTime(timestamp?: string): string {
  const d = timestamp && !isNaN(new Date(timestamp).getTime()) ? new Date(timestamp) : new Date();
  return toEnglishDigits(format(d, 'dd/MM/yyyy HH:mm'));
}

let cachedFontFaceCss: string | null = null;
let fontLoadPromise: Promise<string> | null = null;

async function urlToBase64FontDataUri(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:font/woff2;base64,${btoa(binary)}`;
}

async function ensureEmbeddedIBMPlexFont(): Promise<string> {
  if (cachedFontFaceCss) {
    if (typeof document !== 'undefined' && document.fonts) {
      await document.fonts.ready;
    }
    return cachedFontFaceCss;
  }

  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      const entries = [
        { url: ibmPlexArabic400Url, weight: 400, range: 'U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC' },
        { url: ibmPlexLatin400Url, weight: 400, range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+FEFF, U+FFFD' },
        { url: ibmPlexArabic500Url, weight: 500, range: 'U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC' },
        { url: ibmPlexLatin500Url, weight: 500, range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+FEFF, U+FFFD' },
        { url: ibmPlexArabic600Url, weight: 600, range: 'U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC' },
        { url: ibmPlexLatin600Url, weight: 600, range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+FEFF, U+FFFD' },
        { url: ibmPlexArabic700Url, weight: 700, range: 'U+0600-06FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE80-FEFC' },
        { url: ibmPlexLatin700Url, weight: 700, range: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+FEFF, U+FFFD' },
      ];

      try {
        const dataUris = await Promise.all(entries.map((entry) => urlToBase64FontDataUri(entry.url)));
        const css = entries
          .map(
            (entry, i) => `
            @font-face {
              font-family: 'IBM Plex Sans Arabic';
              font-style: normal;
              font-display: block;
              font-weight: ${entry.weight};
              src: url('${dataUris[i]}') format('woff2');
              unicode-range: ${entry.range};
            }`
          )
          .join('\n');

        if (typeof document !== 'undefined') {
          let styleEl = document.getElementById('dmtc-ibm-plex-pdf-font') as HTMLStyleElement | null;
          if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'dmtc-ibm-plex-pdf-font';
            document.head.appendChild(styleEl);
          }
          styleEl.textContent = css;

          if (document.fonts) {
            await Promise.all([
              document.fonts.load("400 14px 'IBM Plex Sans Arabic'", 'شركة درة المنورة 0123456789 ABC'),
              document.fonts.load("500 14px 'IBM Plex Sans Arabic'", 'شركة درة المنورة 0123456789 ABC'),
              document.fonts.load("600 14px 'IBM Plex Sans Arabic'", 'شركة درة المنورة 0123456789 ABC'),
              document.fonts.load("700 14px 'IBM Plex Sans Arabic'", 'شركة درة المنورة 0123456789 ABC'),
            ]);
            await document.fonts.ready;
          }
        }

        cachedFontFaceCss = css;
        return css;
      } catch (err) {
        console.warn('Could not embed IBM Plex Sans Arabic woff2 base64 cleanly, falling back:', err);
        return '';
      }
    })();
  }

  return fontLoadPromise;
}

const DEFAULT_DMTC_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="55 15 290 365" width="725" height="912" fill="none">
  <path d="M200 180C140 100 170 50 200 20C230 50 260 100 200 180Z" fill="#D97706"/>
  <path d="M165 185C100 140 80 80 100 40C130 60 160 100 165 185Z" fill="#F59E0B"/>
  <path d="M235 185C300 140 320 80 300 40C270 60 240 100 235 185Z" fill="#F59E0B"/>
  <path d="M140 200C80 210 60 240 80 270C110 260 130 220 140 200Z" fill="#1D4ED8"/>
  <path d="M260 200C320 210 340 240 320 270C290 260 270 220 260 200Z" fill="#1D4ED8"/>
  <text x="200" y="322" text-anchor="middle" fill="#0F172A" font-size="52" font-weight="700" font-family="IBM Plex Sans Arabic, sans-serif">DMTC</text>
  <text x="200" y="368" text-anchor="middle" fill="#1D4ED8" font-size="36" font-weight="700" font-family="IBM Plex Sans Arabic, sans-serif">درة المنورة</text>
</svg>`;

const DEFAULT_SLOGAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 170" width="840" height="340" fill="none">
  <rect x="6" y="6" width="408" height="158" rx="22" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="3"/>
  <rect x="394" y="24" width="8" height="122" rx="4" fill="#F59E0B"/>
  <path d="M72 48C54 48 42 62 42 78C42 94 54 108 72 108C60 103 54 92 54 78C54 64 60 53 72 48Z" fill="#D97706"/>
  <circle cx="80" cy="70" r="5" fill="#1D4ED8"/>
  <text x="234" y="88" text-anchor="middle" fill="#0F172A" font-size="42" font-weight="700" font-family="IBM Plex Sans Arabic, sans-serif">خدمة الحاج شرف لنا</text>
  <text x="234" y="130" text-anchor="middle" fill="#1D4ED8" font-size="22" font-weight="600" font-family="IBM Plex Sans Arabic, sans-serif">DURRAT AL-MUNAWWARA</text>
</svg>`;

let cachedFallbackLogoPng: string | null = null;
let cachedFallbackSloganPng: string | null = null;

async function rasterizeSvgToHighResPng(svgText: string, width = 800, height = 800): Promise<string> {
  return new Promise((resolve) => {
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          const png = canvas.toDataURL('image/png');
          URL.revokeObjectURL(url);
          resolve(png);
          return;
        }
      } catch {
        // ignore canvas fallback error
      }
      URL.revokeObjectURL(url);
      resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`);
    };
    img.src = url;
  });
}

async function urlToBase64ImageDataUri(cleanUrl: string): Promise<string | null> {
  if (!cleanUrl) return null;
  if (cleanUrl.startsWith('data:image/')) return cleanUrl;

  try {
    const res = await fetch(cleanUrl, { mode: 'cors' });
    if (res.ok) {
      const blob = await res.blob();
      if (blob.type.startsWith('image/')) {
        const dataUri = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (dataUri) return dataUri;
      }
    }
  } catch {
    // fallback to Image + canvas
  }

  return new Promise((resolve) => {
    const img = new Image();
    if (!cleanUrl.startsWith('data:') && !cleanUrl.startsWith('/') && !cleanUrl.startsWith('.')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        resolve(null);
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
          return;
        }
      } catch {
        // tainted canvas
      }
      resolve(null);
    };
    img.onerror = () => resolve(null);
    img.src = cleanUrl;
  });
}

async function resolveHighResLogoDataUrl(rawLogoUrl?: string): Promise<string> {
  const cleanUrl = (rawLogoUrl || '').trim();
  const isInvalidPlaceholder = !cleanUrl || cleanUrl === '/logo.png' || cleanUrl === 'logo.png';

  if (!isInvalidPlaceholder) {
    const base64Input = await urlToBase64ImageDataUri(cleanUrl);
    if (base64Input) {
      const upscaled = await new Promise<string | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          if (!img.naturalWidth || !img.naturalHeight) {
            resolve(null);
            return;
          }
          try {
            const targetW = Math.max(img.naturalWidth, 640);
            const targetH = Math.round((img.naturalHeight / img.naturalWidth) * targetW);
            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, targetW, targetH);
              resolve(canvas.toDataURL('image/png'));
              return;
            }
          } catch {
            // ignore
          }
          resolve(base64Input);
        };
        img.onerror = () => resolve(base64Input);
        img.src = base64Input;
      });
      if (upscaled) return upscaled;
    }
  }

  if (!cachedFallbackLogoPng) {
    cachedFallbackLogoPng = await rasterizeSvgToHighResPng(DEFAULT_DMTC_LOGO_SVG, 725, 912);
  }
  return cachedFallbackLogoPng;
}

async function resolveImageAsDataUrl(rawUrl?: string): Promise<string> {
  const cleanUrl = (rawUrl || '').trim();
  if (cleanUrl) {
    const dataUri = await urlToBase64ImageDataUri(cleanUrl);
    if (dataUri) return dataUri;
  }
  if (!cachedFallbackSloganPng) {
    cachedFallbackSloganPng = await rasterizeSvgToHighResPng(DEFAULT_SLOGAN_SVG, 840, 340);
  }
  return cachedFallbackSloganPng;
}

// Issuer name resolution is handled strictly via resolveVoucherIssuerForPrint (never from auth/localStorage or hardcoded roles)

function formatVoucherNumberNoLeadingZeros(raw: any): string {
  const digits = toEnglishDigits(raw !== undefined && raw !== null ? String(raw).trim() : '');
  if (!digits) return '';
  if (/^\d+$/.test(digits)) {
    return String(Number(digits));
  }
  return digits.replace(/^0+(?=\d)/, '');
}

function formatPhoneForPrint(raw: any): string {
  const cleaned = toEnglishDigits(raw !== undefined && raw !== null ? String(raw) : '').trim();
  if (!cleaned) return '';
  const digitsOnly = cleaned.replace(/[\s\-()]/g, '');
  if (/^5\d{8}$/.test(digitsOnly)) {
    return `0${digitsOnly}`;
  }
  return cleaned;
}

async function waitForContainerImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          const finish = () => {
            if (typeof img.decode === 'function') {
              img.decode().catch(() => undefined).finally(resolve);
            } else {
              resolve();
            }
          };
          if (img.complete) {
            finish();
            return;
          }
          img.addEventListener('load', finish, { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
          setTimeout(resolve, 4000);
        })
    )
  );
}

export interface VoucherPrintResult {
  status: 'printed' | 'popup_blocked';
  blobUrl?: string;
  fileName: string;
}

function getStandaloneVoucherCss(fontFaceCss: string): string {
  return `
    ${fontFaceCss}
    @page {
      size: A4;
      margin: 0;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background-color: #FFFFFF;
      color: #0F172A;
      font-family: 'IBM Plex Sans Arabic', sans-serif !important;
      direction: rtl;
      letter-spacing: 0 !important;
    }
    body, div, span, p, td, th, table, tr, thead, tbody, section, strong {
      font-family: 'IBM Plex Sans Arabic', sans-serif !important;
      letter-spacing: 0 !important;
    }
    .voucher-buses-table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      border: 0.75pt solid #475569;
      background-color: #FFFFFF;
    }
    .voucher-buses-table thead {
      display: table-header-group;
    }
    .voucher-buses-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .blob-print-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 16px;
      background: #0F172A;
      color: #FFFFFF;
      font-size: 13px;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .blob-print-btn {
      background: #1D4ED8;
      color: #FFFFFF;
      border: none;
      border-radius: 8px;
      padding: 8px 18px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: 'IBM Plex Sans Arabic', sans-serif !important;
    }
    @media screen {
      body {
        background-color: #E2E8F0;
      }
      .voucher-page {
        margin: 12px auto;
        box-shadow: 0 4px 20px rgba(15, 23, 42, 0.12);
      }
    }
    @media print {
      body {
        background-color: #FFFFFF !important;
      }
      .blob-print-toolbar {
        display: none !important;
      }
      .voucher-page {
        margin: 0 !important;
        box-shadow: none !important;
      }
    }
  `;
}

async function buildVoucherDocumentParts(
  data: any,
  options: { twoCopies?: boolean; copyLabels?: string[] } = {}
): Promise<{
  fullHtml: string;
  pagesHtmlChunks: string[];
  fontFaceCss: string;
  printTitle: string;
}> {
  const [resolvedLogoUrl, resolvedSloganUrl, fontFaceCss] = await Promise.all([
    resolveHighResLogoDataUrl(data.logoUrl),
    resolveImageAsDataUrl(data.sloganUrl),
    ensureEmbeddedIBMPlexFont(),
  ]);

  // Voucher number without leading zero padding (English digits)
  const voucherNoStr = formatVoucherNumberNoLeadingZeros(data.voucherNumber);

  // Format dates strictly as DD/MM/YYYY (English digits)
  const { display: gregorianStr, filePart: gregorianFilePart } = formatGregorianDDMMYYYY(
    data.customDate,
    data.timestamp
  );
  const hijriStr = formatHijriDDMMYYYY(
    data.hijriDate,
    data.customDate,
    data.timestamp,
    normalizeHijriOffsetDays(data?.hijriOffsetDays)
  );

  // Collect filled bus rows
  const rawBuses =
    Array.isArray(data.buses) && data.buses.length > 0
      ? data.buses
      : hasValue(data.busNumber) || hasValue(data.driverName) || hasValue(data.driverPhone)
      ? [
          {
            busNumber: data.busNumber || '',
            driverName: data.driverName || '',
            busType: data.busType || 'حافلة',
            driverPhone: data.driverPhone || '',
          },
        ]
      : [];

  const allBuses = rawBuses.filter(
    (b: any) => hasValue(b?.busNumber) || hasValue(b?.driverName) || hasValue(b?.driverPhone)
  );

  const busesPerPage = 18;
  const totalPages = Math.max(1, Math.ceil(allBuses.length / busesPerPage));

  // Unify ticketsCount & pilgrimsCount into a single "عدد التذاكر" value
  const rawTickets = toEnglishDigits(data.ticketsCount || '').trim();
  const rawPilgrims = toEnglishDigits(data.pilgrimsCount || '').trim();
  const ticketsNum = Number(rawTickets);
  const pilgrimsNum = Number(rawPilgrims);
  const unifiedTickets =
    hasValue(rawTickets) && (!isNaN(ticketsNum) ? ticketsNum > 0 : true)
      ? rawTickets
      : hasValue(rawPilgrims) && (!isNaN(pilgrimsNum) ? pilgrimsNum > 0 : true)
      ? rawPilgrims
      : '';

  const busesQtyNumStr =
    hasValue(data.busesQuantity) && Number(toEnglishDigits(data.busesQuantity)) > 0
      ? toEnglishDigits(data.busesQuantity).trim()
      : allBuses.length > 0
      ? String(allBuses.length)
      : '';
  const busesQtyWithLabel = busesQtyNumStr ? `${busesQtyNumStr} حافلة` : '';

  const issuedByRaw = toEnglishDigits(resolveVoucherIssuerForPrint(data)).trim();
  const issuedBy = issuedByRaw ? escapeHtml(issuedByRaw) : '';
  const issuedBySignatureFontPt = getFittedReceiptFontSizePt(issuedByRaw, {
    maxPt: 11,
    minPt: 8.5,
    thresholdChars: 16,
    maxChars: 40,
  });
  const receiverRaw = toEnglishDigits(data.receiverName || '').trim();
  const receiverSignatureFontPt = getFittedReceiptFontSizePt(receiverRaw, {
    maxPt: 11,
    minPt: 9.5,
    thresholdChars: 24,
    maxChars: 42,
  });
  const issuedByFooterFontPt = getFittedReceiptFontSizePt(issuedByRaw, {
    maxPt: 10.5,
    minPt: 8.5,
    thresholdChars: 14,
    maxChars: 40,
  });
  const issuedAt = formatAuditDateTime(data.timestamp);
  const formattedReceiverMobile = formatPhoneForPrint(data.receiverMobile);

  // Corner QR code pointing to https://munawwarahaj.xyz/
  let qrDataUrl = '';
  try {
    const verifyUrl = 'https://munawwarahaj.xyz/';
    qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
  } catch (err) {
    console.warn('QR generation skipped:', err);
  }

  const renderMetadataField = (
    label: string,
    val: any,
    opts: { forceLtr?: boolean; colSpan2?: boolean } = {}
  ) => {
    const clean = toEnglishDigits(val || '').trim();
    const isFilled = clean !== '';
    const safeVal = isFilled ? escapeHtml(clean) : '&nbsp;';
    const dirAttr = opts.forceLtr ? 'dir="ltr"' : '';
    const dirStyle = opts.forceLtr
      ? 'direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums;'
      : 'font-variant-numeric: tabular-nums;';
    const spanStyle = opts.colSpan2 ? 'grid-column: span 2;' : '';

    return `
      <div style="${spanStyle} display: flex; flex-direction: column; min-width: 0;">
        <div style="font-size: 11pt; font-weight: 500; color: #475569; line-height: 1.6; padding: 0;">
          ${escapeHtml(label)}
        </div>
        <div ${dirAttr} style="font-size: 12pt; font-weight: 600; color: #0F172A; line-height: 1.6; min-height: 6mm; padding: 0.1mm 0; border-bottom: 1px solid #94A3B8; text-align: right; word-break: break-word; ${dirStyle}">
          ${safeVal}
        </div>
      </div>
    `;
  };

  const renderInlineSignatureField = (
    label: string,
    val: any,
    optionsOrForceLtr: boolean | { forceLtr?: boolean; nowrapFontSizePt?: number; compact?: boolean } = false
  ) => {
    const opts = typeof optionsOrForceLtr === 'boolean' ? { forceLtr: optionsOrForceLtr } : optionsOrForceLtr;
    const forceLtr = Boolean(opts.forceLtr);
    const nowrapFontSizePt = opts.nowrapFontSizePt;
    const compact = Boolean(opts.compact);
    const clean = toEnglishDigits(val || '').trim();
    const isFilled = clean !== '';
    const safeVal = isFilled ? escapeHtml(clean) : '&nbsp;';
    const dirAttr = forceLtr ? 'dir="ltr"' : '';
    const fontSizePt = nowrapFontSizePt ?? (compact ? 10 : 11);
    const labelFontSizePt = compact ? 10 : 11;
    const lineHeight = compact ? 1.25 : 1.6;
    const minHeight = compact ? '4.4mm' : '5.5mm';
    const dirStyle = forceLtr
      ? 'direction: ltr; unicode-bidi: isolate; font-variant-numeric: tabular-nums; white-space: nowrap;'
      : nowrapFontSizePt !== undefined || compact
      ? 'font-variant-numeric: tabular-nums; white-space: nowrap;'
      : 'font-variant-numeric: tabular-nums; word-break: break-word;';

    return `
      <div style="display: flex; align-items: baseline; gap: 1mm; min-width: 0;">
        <span style="font-size: ${labelFontSizePt}pt; font-weight: 500; color: #475569; line-height: ${lineHeight}; flex-shrink: 0; white-space: nowrap;">
          ${escapeHtml(label)}:
        </span>
        <span ${dirAttr} style="flex: 1; min-width: 0; font-size: ${fontSizePt}pt; font-weight: 600; color: #0F172A; line-height: ${lineHeight}; min-height: ${minHeight}; padding: 0; border-bottom: 1px solid #94A3B8; text-align: right; ${dirStyle}">
          ${safeVal}
        </span>
      </div>
    `;
  };

  const unusedRowHatchStyle =
    `background-color: #EEF2F6; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M-2,2 l4,-4 M0,10 l10,-10 M8,12 l4,-4' stroke='%23CBD5E1' stroke-width='1'/%3E%3C/svg%3E"); -webkit-print-color-adjust: exact; print-color-adjust: exact;`;

  const isBulkReport = Boolean(data?.isBulkReport);
  const configuredCopiesCount = normalizePrintCopies(data?.printCopies);
  const resolvedConfiguredLabels = normalizePrintCopyLabels(
    data?.printCopyLabels,
    Math.max(configuredCopiesCount, 2)
  );
  const copyLabels =
    Array.isArray(options.copyLabels) && options.copyLabels.length > 0
      ? options.copyLabels
      : isBulkReport
      ? options.twoCopies === true
        ? resolvedConfiguredLabels.slice(0, 2)
        : ['']
      : options.twoCopies === true
      ? normalizePrintCopyLabels(data?.printCopyLabels, Math.max(2, configuredCopiesCount))
      : normalizePrintCopyLabels(data?.printCopyLabels, configuredCopiesCount);

  const pagesHtmlChunks: string[] = [];
  let pageCounter = 0;

  const normalizedMargins = normalizePdfMargins(data?.pdfMargins);
  const resolvedSloganHeightMm = normalizeSloganHeightMm(data?.sloganHeightMm);
  const layoutMetrics = computePrintLayoutMetrics(normalizedMargins, resolvedSloganHeightMm);
  const busRowHeightMm = layoutMetrics.isValid ? layoutMetrics.rowHeightMm : 6.0;
  const busCellLineHeight = busRowHeightMm < 6.1 ? 1.25 : 1.6;

  for (const copyLabel of copyLabels) {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const startIdx = (pageNum - 1) * busesPerPage;
      const pageBuses = allBuses.slice(startIdx, startIdx + busesPerPage);
      const isLastPageOfCopy = pageNum === totalPages;
      const breakStyle = pageCounter > 0 ? 'break-before: page; page-break-before: always;' : '';
      pageCounter++;

      const rowsHtml = Array.from({ length: busesPerPage }, (_, rowIdx) => {
        const bus = pageBuses[rowIdx];
        const rowNum = startIdx + rowIdx + 1;

        if (bus) {
          const driver = escapeHtml(toEnglishDigits(bus.driverName || '').trim());
          const plate = escapeHtml(toEnglishDigits(bus.busNumber || '').trim());
          const type = escapeHtml(toEnglishDigits(bus.busType || 'حافلة').trim());
          const approval = escapeHtml(toEnglishDigits(bus.approvalNumber || '').trim());
          const phone = escapeHtml(formatPhoneForPrint(bus.driverPhone));

          return `
            <tr style="height: ${busRowHeightMm}mm; background-color: #FFFFFF; break-inside: avoid; page-break-inside: avoid;">
              <td style="border: 0.75pt solid #475569; padding: 0 1mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #0F172A; line-height: ${busCellLineHeight}; font-variant-numeric: tabular-nums;">
                <span dir="ltr" style="unicode-bidi: isolate;">${rowNum}</span>
              </td>
              <td style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #0F172A; line-height: ${busCellLineHeight}; word-break: break-word;">
                ${driver || '&nbsp;'}
              </td>
              <td style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #0F172A; line-height: ${busCellLineHeight}; font-variant-numeric: tabular-nums; white-space: nowrap;">
                <span dir="ltr" style="unicode-bidi: isolate;">${plate || '&nbsp;'}</span>
              </td>
              <td style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #0F172A; line-height: ${busCellLineHeight};">
                ${type}
              </td>
              ${
                isBulkReport
                  ? `<td style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #0F172A; line-height: ${busCellLineHeight}; font-variant-numeric: tabular-nums; white-space: nowrap;">
                      <span dir="ltr" style="unicode-bidi: isolate;">${approval || '&nbsp;'}</span>
                    </td>`
                  : ''
              }
              <td style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #0F172A; line-height: ${busCellLineHeight}; font-variant-numeric: tabular-nums; white-space: nowrap;">
                <span dir="ltr" style="unicode-bidi: isolate;">${phone || '&nbsp;'}</span>
              </td>
            </tr>
          `;
        }

        const isFirstEmptyRow = rowIdx === pageBuses.length && isLastPageOfCopy;
        if (isFirstEmptyRow) {
          return `
            <tr style="height: ${busRowHeightMm}mm; break-inside: avoid; page-break-inside: avoid; ${unusedRowHatchStyle}">
              <td style="border: 0.75pt solid #475569; padding: 0 1mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #475569; line-height: ${busCellLineHeight}; font-variant-numeric: tabular-nums;">
                <span dir="ltr" style="unicode-bidi: isolate;">${rowNum}</span>
              </td>
              <td colspan="${isBulkReport ? 5 : 4}" style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #475569; line-height: ${busCellLineHeight};">
                — لا توجد حافلات بعد هذا السطر —
              </td>
            </tr>
          `;
        }

        return `
          <tr style="height: ${busRowHeightMm}mm; break-inside: avoid; page-break-inside: avoid; ${unusedRowHatchStyle}">
            <td style="border: 0.75pt solid #475569; padding: 0 1mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 500; color: #475569; line-height: ${busCellLineHeight}; font-variant-numeric: tabular-nums;">
              <span dir="ltr" style="unicode-bidi: isolate;">${rowNum}</span>
            </td>
            <td style="border: 0.75pt solid #475569; padding: 0 1.5mm;"></td>
            <td style="border: 0.75pt solid #475569; padding: 0 1.5mm;"></td>
            <td style="border: 0.75pt solid #475569; padding: 0 1.5mm;"></td>
            ${isBulkReport ? '<td style="border: 0.75pt solid #475569; padding: 0 1.5mm;"></td>' : ''}
            <td style="border: 0.75pt solid #475569; padding: 0 1.5mm;"></td>
          </tr>
        `;
      }).join('');

      pagesHtmlChunks.push(`
        <section class="voucher-page" dir="rtl" lang="ar" style="${breakStyle} width: 210mm; min-height: 295mm; height: 296mm; max-height: 296mm; overflow: hidden; padding: ${normalizedMargins.top}mm ${normalizedMargins.right}mm ${normalizedMargins.bottom}mm ${normalizedMargins.left}mm; background-color: #FFFFFF; color: #0F172A; direction: rtl; display: flex; flex-direction: column;">
          <div style="width: 100%; flex: 1; display: flex; flex-direction: column; gap: 0.4mm;">

            <!-- 1) Header (Enlarged Company Logo + Slogan) -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 3mm; padding-bottom: 0.6mm; border-bottom: 0.8mm solid #1D4ED8;">
              <!-- Right: Company Arabic & English Name -->
              <div style="text-align: right;">
                <div style="font-size: 18pt; font-weight: 700; color: #0F172A; line-height: 1.6;">
                  شركة درة المنورة للنقليات
                </div>
                <div dir="ltr" style="direction: ltr; unicode-bidi: embed; text-align: right; font-size: 11pt; font-weight: 400; color: #475569; line-height: 1.6;">
                  Durrat Al-Munawwara Transport Co
                </div>
              </div>

              <!-- Center: Enlarged High-res Company Logo (28mm) -->
              <div style="display: flex; align-items: center; justify-content: center;">
                <img src="${resolvedLogoUrl}" alt="شعار درة المنورة" style="height: 28mm; width: auto; max-width: 76mm; object-fit: contain; display: block;" />
              </div>

              <!-- Left: Enlarged Slogan ("خدمة الحاج شرف لنا", configurable 15..30mm) -->
              <div style="display: flex; align-items: center; justify-content: flex-end;">
                <img src="${resolvedSloganUrl}" alt="خدمة الحاج شرف لنا" style="height: ${resolvedSloganHeightMm}mm; width: auto; max-width: 64mm; object-fit: contain; display: block;" />
              </div>
            </div>

            <!-- 2) Title Row -->
            <div style="display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 3mm; padding: 0.2mm 0;">
              <!-- Right: Hijri then Gregorian DD/MM/YYYY -->
              <div style="text-align: right; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: baseline; gap: 1.5mm;">
                  <span style="font-size: 11pt; font-weight: 500; color: #475569; line-height: 1.6;">التاريخ الهجري:</span>
                  <span dir="ltr" style="direction: ltr; unicode-bidi: isolate; font-size: 12pt; font-weight: 600; color: #0F172A; line-height: 1.6; font-variant-numeric: tabular-nums;">${hijriStr || '—'}</span>
                </div>
                <div style="display: flex; align-items: baseline; gap: 1.5mm;">
                  <span style="font-size: 11pt; font-weight: 500; color: #475569; line-height: 1.6;">التاريخ الميلادي:</span>
                  <span dir="ltr" style="direction: ltr; unicode-bidi: isolate; font-size: 12pt; font-weight: 600; color: #0F172A; line-height: 1.6; font-variant-numeric: tabular-nums;">${gregorianStr || '—'}</span>
                </div>
              </div>

              <!-- Center: Document Title 22pt with border-bottom (never text-decoration:underline) -->
              <div style="text-align: center;">
                <span style="display: inline-block; font-size: 22pt; font-weight: 700; color: #0F172A; line-height: 1.6; border-bottom: 2px solid #0F172A; padding-bottom: 0.3mm;">
                  سند استلام حافلات
                </span>
              </div>

              <!-- Left: Voucher Number Box -->
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 2mm;">
                ${
                  copyLabel
                    ? `<span style="font-size: 11pt; font-weight: 500; color: #475569; line-height: 1.6;">${escapeHtml(copyLabel)}</span>`
                    : ''
                }
                <div style="border: 1px solid #475569; border-radius: 6px; padding: 1mm 2.5mm; background-color: #F8FAFC; font-size: 12pt; font-weight: 600; color: #0F172A; line-height: 1.6; font-variant-numeric: tabular-nums;">
                  ${
                    isBulkReport
                      ? `<span>${escapeHtml(voucherNoStr || 'كشف مـجمع')}</span>`
                      : `رقم السند: <span dir="ltr" style="unicode-bidi: isolate;">${escapeHtml(voucherNoStr || '—')}</span>`
                  }
                </div>
              </div>
            </div>

            <!-- 3) Voucher Data Card (3 equal columns) -->
            <div style="background-color: #F8FAFC; border: 1px solid #CBD5E1; border-radius: 8px; padding: 0.8mm 3.5mm;">
              <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 4mm; row-gap: 0.2mm;">
                <!-- Row 1 -->
                ${renderMetadataField('استلمت أنا', data.receiverName)}
                ${renderMetadataField('رقم المكتب', data.delegateNumber, { forceLtr: true })}
                ${renderMetadataField('التابع لمؤسسة', data.organization)}

                <!-- Row 2 -->
                ${renderMetadataField('بموجب اعتماد رقم', isBulkReport ? '' : data.approvalNumber, { forceLtr: true })}
                ${renderMetadataField('عدد الحافلات', busesQtyWithLabel)}
                ${renderMetadataField('عدد التذاكر', unifiedTickets, { forceLtr: true })}

                <!-- Row 3 -->
                ${renderMetadataField('الاتجاه من', data.directionFrom)}
                ${renderMetadataField('إلى', data.directionTo)}
                ${renderMetadataField('وقت الاستلام/الحركة', data.eventTime)}

                <!-- Row 4 -->
                ${renderMetadataField('مكان التحميل', data.loadingLocation)}
                ${renderMetadataField('اسم الفندق', data.hotelName, { colSpan2: true })}
              </div>
            </div>

            <!-- 4) Real Buses Table (table-layout: fixed, 18 equal rows) -->
            <div style="width: 100%;">
              <table class="voucher-buses-table">
                ${
                  isBulkReport
                    ? `<colgroup>
                        <col style="width: 10mm;" />
                        <col style="width: 29%;" />
                        <col style="width: 15%;" />
                        <col style="width: 12%;" />
                        <col style="width: 15%;" />
                        <col style="width: auto;" />
                      </colgroup>`
                    : `<colgroup>
                        <col style="width: 12mm;" />
                        <col style="width: 34%;" />
                        <col style="width: 18%;" />
                        <col style="width: 14%;" />
                        <col style="width: auto;" />
                      </colgroup>`
                }
                <thead>
                  <tr style="background-color: #E2E8F0; height: 6.4mm;">
                    <th style="border: 0.75pt solid #475569; padding: 0 1mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 600; color: #0F172A; line-height: 1.6;">م</th>
                    <th style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 600; color: #0F172A; line-height: 1.6;">اسم السائق</th>
                    <th style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 600; color: #0F172A; line-height: 1.6;">رقم اللوحة</th>
                    <th style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 600; color: #0F172A; line-height: 1.6;">نوعها</th>
                    ${
                      isBulkReport
                        ? '<th style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 600; color: #0F172A; line-height: 1.6;">رقم الاعتماد</th>'
                        : ''
                    }
                    <th style="border: 0.75pt solid #475569; padding: 0 1.5mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 600; color: #0F172A; line-height: 1.6;">رقم الهاتف</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
            </div>

            <!-- 5) Signatures (2 equal boxes expanding to fill space, >=14mm signature clearance, 28mm stamp circle, total page <=296mm) -->
            <div style="flex: 1 0 auto; min-height: 36mm; display: grid; grid-template-columns: 1fr 1fr; gap: 3.5mm; align-items: stretch;">
              <!-- Company Box -->
              <div style="border: 1px solid #475569; border-radius: 8px; display: flex; flex-direction: column; background-color: #FFFFFF; min-height: 36mm;">
                <div style="background-color: #F1F5F9; padding: 0.2mm 2.5mm; border-bottom: 1px solid #CBD5E1; border-top-left-radius: 7px; border-top-right-radius: 7px; font-size: 11pt; font-weight: 600; color: #0F172A; text-align: center; line-height: 1.35;">
                  مندوب شركة درة المنورة
                </div>
                <div style="flex: 1; padding: 0.8mm 2.5mm 1mm; display: flex; align-items: stretch; justify-content: space-between; gap: 2mm;">
                  <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; min-width: 0;">
                    <div>
                      ${renderInlineSignatureField('الاسم', issuedByRaw, { nowrapFontSizePt: issuedBySignatureFontPt, compact: true })}
                    </div>
                    <div style="margin-top: auto; padding-top: 14mm;">
                      ${renderInlineSignatureField('التوقيع', '', { compact: true })}
                    </div>
                  </div>
                  <div style="width: 28mm; height: 28mm; min-width: 28mm; min-height: 28mm; border: 1.5px dashed #64748B; border-radius: 50%; display: flex; align-items: center; justify-content: center; align-self: center; font-size: 11pt; font-weight: 500; color: #475569; line-height: 1.4; flex-shrink: 0;">
                    الختم
                  </div>
                </div>
              </div>

              <!-- Receiver Box (single-line fields, signature pinned to bottom with >=14mm blank space above) -->
              <div style="border: 1px solid #475569; border-radius: 8px; display: flex; flex-direction: column; background-color: #FFFFFF; min-height: 36mm;">
                <div style="background-color: #F1F5F9; padding: 0.2mm 2.5mm; border-bottom: 1px solid #CBD5E1; border-top-left-radius: 7px; border-top-right-radius: 7px; font-size: 11pt; font-weight: 600; color: #0F172A; text-align: center; line-height: 1.35;">
                  المستلم (مندوب مجموعة الخدمة الميدانية)
                </div>
                <div style="flex: 1; padding: 0.8mm 2.5mm 1mm; display: flex; flex-direction: column; justify-content: space-between; gap: 0.3mm;">
                  <div style="display: flex; flex-direction: column; gap: 0.3mm; min-width: 0;">
                    ${renderInlineSignatureField('الاسم', data.receiverName, { nowrapFontSizePt: Math.min(receiverSignatureFontPt, 10.5), compact: true })}
                    <div style="display: grid; grid-template-columns: 1.15fr 0.85fr; column-gap: 2mm; min-width: 0;">
                      ${renderInlineSignatureField('رقم الموبايل', formattedReceiverMobile, { forceLtr: true, compact: true })}
                      ${renderInlineSignatureField('رقم الهوية', data.receiverId, { forceLtr: true, compact: true })}
                    </div>
                  </div>
                  <div style="margin-top: auto; padding-top: 14mm;">
                    ${renderInlineSignatureField('التوقيع', '', { compact: true })}
                  </div>
                </div>
              </div>
            </div>

            <!-- 6) Footer (bottom-pinned, 0.5pt full-width top divider, 3mm top padding, 18mm QR) -->
            <div style="width: 100%; margin-top: auto; padding-top: 3mm; border-top: 0.5pt solid #CBD5E1; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 2mm;">
              <!-- Right: Issued by & Page X of Y -->
              <div style="text-align: right; display: flex; flex-direction: column; min-width: 0;">
                <div style="font-size: ${issuedByFooterFontPt}pt; font-weight: 400; color: #475569; line-height: 1.45; white-space: nowrap;">
                  صدر بواسطة: ${issuedBy ? `<span style="font-weight: 500; color: #0F172A;">${issuedBy}</span> ` : ''}• <span dir="ltr" style="unicode-bidi: isolate; font-variant-numeric: tabular-nums;">${issuedAt}</span>
                </div>
                <div style="font-size: 10.5pt; font-weight: 500; color: #475569; line-height: 1.45; font-variant-numeric: tabular-nums;">
                  صفحة <span dir="ltr" style="unicode-bidi: isolate;">${pageNum}</span> من <span dir="ltr" style="unicode-bidi: isolate;">${totalPages}</span>
                </div>
              </div>

              <!-- Center: Website, Phone & HQ -->
              <div style="text-align: center; display: flex; flex-direction: column; align-items: center;">
                <div dir="ltr" style="direction: ltr; unicode-bidi: isolate; font-size: 10pt; font-weight: 500; color: #475569; line-height: 1.45;">
                  ${escapeHtml(
                    String(data?.companyWebsite ?? DEFAULT_COMPANY_WEBSITE).trim() ||
                      DEFAULT_COMPANY_WEBSITE
                  )}${
                    formatPhoneForPrint(data?.companyPhone ?? DEFAULT_COMPANY_PHONE)
                      ? ` • ${escapeHtml(
                          formatPhoneForPrint(data?.companyPhone ?? DEFAULT_COMPANY_PHONE)
                        )}`
                      : ''
                  }
                </div>
                <div style="font-size: 10pt; font-weight: 400; color: #475569; line-height: 1.45;">
                  ${escapeHtml(
                    String(data?.companyAddress ?? DEFAULT_COMPANY_ADDRESS).trim() ||
                      DEFAULT_COMPANY_ADDRESS
                  )}
                </div>
              </div>

              <!-- Left: 18mm QR Code + 10pt تحقق من السند -->
              <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center;">
                ${
                  qrDataUrl
                    ? `<div style="display: flex; flex-direction: column; align-items: center;">
                        <img src="${qrDataUrl}" alt="QR" style="width: 18mm; height: 18mm; display: block;" />
                        <span style="font-size: 10pt; font-weight: 500; color: #475569; line-height: 1.25; margin-top: 0.4mm; white-space: nowrap;">تحقق من السند</span>
                      </div>`
                    : ''
                }
              </div>
            </div>

          </div>
        </section>
      `);
    }
  }

  const delegatePart = toEnglishDigits(data?.delegateNumber || '').trim();
  const printTitle = isBulkReport
    ? delegatePart
      ? `كشف-مكتب-${delegatePart}-${gregorianFilePart}`
      : `كشف-مكتب-${gregorianFilePart}`
    : voucherNoStr
    ? `سند-${voucherNoStr}-${gregorianFilePart}`
    : `سند-${gregorianFilePart}`;

  const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(printTitle)}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <style>${getStandaloneVoucherCss(fontFaceCss)}</style>
  </head>
  <body dir="rtl" lang="ar">
    <div class="blob-print-toolbar">
      <span>${escapeHtml(printTitle)} — اختر: الوجهة = حفظ كملف PDF، والهوامش = بلا، والرؤوس والتذييلات = معطّلة</span>
      <button type="button" class="blob-print-btn" onclick="window.focus(); window.print();">طباعة / حفظ PDF</button>
    </div>
    ${pagesHtmlChunks.join('\n')}
  </body>
</html>`;

  return {
    fullHtml,
    pagesHtmlChunks,
    fontFaceCss,
    printTitle,
  };
}

export async function generateVoucherPDF(
  data: any,
  options: {
    save?: boolean;
    print?: boolean;
    twoCopies?: boolean;
    copyLabels?: string[];
    targetWindow?: Window | null;
  } = { save: true }
): Promise<VoucherPrintResult> {
  const endBusy = beginBusyActivity();
  try {
    const w = options.targetWindow !== undefined ? options.targetWindow : window.open('', '_blank');

    if (w) {
      try {
        w.document.open();
        w.document.write(
          '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>جاري تحضير السند...</title></head><body style="font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; color:#0F172A;">جاري تحضير السند للطباعة...</body></html>'
        );
        w.document.close();
      } catch {
        // ignore if window already navigated or restricted
      }
    }

    let fullHtml = '';
    let printTitle = 'سند';
    try {
      const parts = await buildVoucherDocumentParts(data, {
        twoCopies: options.twoCopies,
        copyLabels: options.copyLabels,
      });
      fullHtml = parts.fullHtml;
      printTitle = parts.printTitle;
    } catch (err) {
      if (w && !w.closed) {
        try {
          w.close();
        } catch {
          // ignore close error
        }
      }
      console.error('Failed to prepare voucher HTML for printing:', err);
      throw err;
    }

    if (!w) {
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      return {
        status: 'popup_blocked',
        blobUrl,
        fileName: printTitle,
      };
    }

    try {
      w.document.open();
      w.document.write(fullHtml);
      w.document.close();
      w.document.title = printTitle;

      if (w.document.fonts && w.document.fonts.ready) {
        await w.document.fonts.ready;
      }
      await waitForContainerImages(w.document.body);
      await new Promise<void>((resolve) => {
        if (typeof w.requestAnimationFrame === 'function') {
          w.requestAnimationFrame(() => resolve());
        } else {
          setTimeout(resolve, 50);
        }
      });

      w.focus();
      w.print();
      return {
        status: 'printed',
        fileName: printTitle,
      };
    } catch (err) {
      console.error('Standalone voucher print error:', err);
      throw err;
    }
  } finally {
    endBusy();
  }
}

export async function exportVoucherLegacyPDF(
  data: any,
  options: { save?: boolean; twoCopies?: boolean; copyLabels?: string[] } = { save: true }
): Promise<string> {
  const endBusy = beginBusyActivity();
  try {
    const { pagesHtmlChunks, fontFaceCss, printTitle } = await buildVoucherDocumentParts(data, {
      twoCopies: options.twoCopies,
      copyLabels: options.copyLabels,
    });

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const html2canvas = (await import('html2canvas')).default;
    const pageWidthMm = 210;
    const pageHeightMm = 297;

    for (let idx = 0; idx < pagesHtmlChunks.length; idx++) {
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-99999px';
      container.style.top = '0';
      container.style.width = '210mm';
      container.style.backgroundColor = '#FFFFFF';
      container.setAttribute('dir', 'rtl');
      container.setAttribute('lang', 'ar');
      container.innerHTML = `<style>${getStandaloneVoucherCss(fontFaceCss)}</style>${pagesHtmlChunks[idx]}`;

      document.body.appendChild(container);
      try {
        if (typeof document !== 'undefined' && document.fonts) {
          await document.fonts.ready;
        }
        await waitForContainerImages(container);
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

        const rect = container.getBoundingClientRect();
        const captureWidth = Math.round(rect.width) || 794;
        const captureHeight = Math.round(rect.height) || 1123;

        const canvas = await html2canvas(container, {
          scale: 2.5,
          width: captureWidth,
          height: captureHeight,
          windowWidth: captureWidth,
          windowHeight: captureHeight,
          useCORS: true,
          logging: false,
          backgroundColor: '#FFFFFF',
        });

        const imgData = canvas.toDataURL('image/png');
        if (idx > 0) pdf.addPage('a4', 'portrait');
        const imgHeightMm = (canvas.height * pageWidthMm) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidthMm, Math.min(pageHeightMm, imgHeightMm), undefined, 'FAST');
      } finally {
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }
    }

    if (options.save !== false) {
      pdf.save(`${printTitle}.pdf`);
    }

    return pdf.output('datauristring');
  } finally {
    endBusy();
  }
}

/**
 * دالة لطباعة كشف مجمع للمكتب (كل الحافلات)
 * مطابقة تماماً لتصميم وشكل السند الفردي وتدعم تعدد الصفحات عبر نافذة الطباعة الأصلية
 */
export async function generateBulkOfficePDF(
  data: any,
  options: {
    save?: boolean;
    print?: boolean;
    twoCopies?: boolean;
    copyLabels?: string[];
    targetWindow?: Window | null;
  } = { save: true }
): Promise<VoucherPrintResult> {
  return generateVoucherPDF(
    {
      ...data,
      isBulkReport: true,
    },
    {
      ...options,
      twoCopies: options.twoCopies ?? false,
    }
  );
}

export interface StatementReportConfig {
  reportTitle: string;
  periodLabel: string;
  reportType?: 'monthly' | 'seasonal' | 'custom' | 'filtered';
  vouchers: any[];
  logoUrl?: string;
  sloganUrl?: string;
  generatedBy?: string;
  season?: string;
  notes?: string;
  filterSummary?: string;
  hijriOffsetDays?: number;
  companyWebsite?: string;
}

/**
 * دالة لتوليد كشوفات وتقارير PDF رسمية للسندات والعمليات
 * للمدراء والمشرفين (كشوفات شهرية، موسمية، أو نطاقات زمنية مخصصة)
 */
export async function generateStatementReportPDF(
  config: StatementReportConfig,
  options: { save?: boolean; print?: boolean } = { save: true, print: true }
) {
  const endBusy = beginBusyActivity();
  try {
  const isBase64OrRelative = (url: string) => !url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('.');
  const logoUrl = config.logoUrl || '/logo.png';
  const sloganUrl = config.sloganUrl || '/input_file_0.png';

  const logoCrossOrigin = isBase64OrRelative(logoUrl) ? '' : 'crossOrigin="anonymous"';
  const sloganCrossOrigin = isBase64OrRelative(sloganUrl) ? '' : 'crossOrigin="anonymous"';

  const vouchers = config.vouchers || [];
  
  // Calculate summary metrics
  let totalBusesCount = 0;
  let totalPilgrims = 0;
  let totalTickets = 0;
  const organizationsSet = new Set<string>();
  const delegatesSet = new Set<string>();

  vouchers.forEach((v) => {
    const bCount = Array.isArray(v.buses) && v.buses.length > 0
      ? v.buses.length
      : (Number(v.busesQuantity) || (v.busNumber ? 1 : 0));
    totalBusesCount += bCount;
    totalPilgrims += Number(v.pilgrimsCount) || 0;
    totalTickets += Number(v.ticketsCount) || 0;
    if (v.organization && String(v.organization).trim()) {
      organizationsSet.add(String(v.organization).trim());
    }
    if (v.delegateNumber && String(v.delegateNumber).trim()) {
      delegatesSet.add(String(v.delegateNumber).trim());
    }
  });

  const rowsPerPage = 12;
  const totalPages = Math.ceil(vouchers.length / rowsPerPage) || 1;

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'px',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const html2canvas = (await import('html2canvas')).default;

  // Format generation dates
  const todayDate = new Date();
  const hijriNow = formatHijriLongWithOffset(
    todayDate,
    normalizeHijriOffsetDays(config.hijriOffsetDays)
  );

  const gregorianNow = format(todayDate, 'yyyy/MM/dd | HH:mm');

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * rowsPerPage;
    const pageVouchers = vouchers.slice(startIdx, startIdx + rowsPerPage);

    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1120px';

    const html = `
      <div style="padding: 16px 24px; font-family: 'Calibri', 'Arial', sans-serif; background-color: #ffffff; position: relative; min-height: 790px; direction: rtl; box-sizing: border-box; color: #0f172a; display: flex; flex-direction: column; justify-content: space-between;">
        
        <!-- Header Section -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 10px;">
            <!-- Right: Slogan & Vision -->
            <div style="width: 28%; text-align: right;">
              <img src="${sloganUrl}" style="height: 75px; max-width: 100%; object-fit: contain; display: inline-block;" ${sloganCrossOrigin} />
            </div>

            <!-- Center: Report Title & Season/Period -->
            <div style="width: 44%; text-align: center;">
              <div style="display: inline-block; background-color: #0f172a; color: #ffffff; padding: 4px 18px; border-radius: 8px; font-size: 19px; font-weight: 900; margin-bottom: 4px; letter-spacing: 0.5px;">
                ${clean_and_reshape_text(config.reportTitle || 'كشف تقرير السندات والعمليات')}
              </div>
              <div style="font-size: 13px; font-weight: 800; color: #1e3a8a; display: flex; items-center; justify-content: center; gap: 8px;">
                <span>${clean_and_reshape_text('الفترة / التصنيف :')}</span>
                <span style="background-color: #f1f5f9; padding: 1px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">${clean_and_reshape_text(config.periodLabel || 'كافة السجلات')}</span>
              </div>
            </div>

            <!-- Left: Logo & Company Name -->
            <div style="width: 28%; text-align: left; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
              <div>
                <div style="font-size: 17px; font-weight: 900; color: #0f172a; white-space: nowrap;">${clean_and_reshape_text('شركة درة المنورة للنقليات')}</div>
                <div style="font-size: 11px; font-weight: 800; font-family: 'Times New Roman', serif; color: #334155; white-space: nowrap;">Durrat Al-Munawwara Transport Co.</div>
                <div style="font-size: 10px; font-weight: 700; color: #059669; margin-top: 2px;">${clean_and_reshape_text('نظام إدارة وحركة السندات والحافلات')}</div>
              </div>
              <img src="${logoUrl}" style="height: 75px; object-fit: contain; display: inline-block;" ${logoCrossOrigin} />
            </div>
          </div>

          <!-- Summary KPI Strip (Only on first page or concise header) -->
          <div style="display: flex; justify-content: space-between; align-items: center; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 6px 14px; margin-bottom: 10px; font-size: 12px; font-weight: 800;">
            <div style="display: flex; gap: 16px; align-items: center;">
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي السندات : ')}</span>
                <span style="color: #1e40af; font-size: 14px; font-weight: 900;">${vouchers.length}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي الحافلات : ')}</span>
                <span style="color: #047857; font-size: 14px; font-weight: 900;">${totalBusesCount}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي الحجاج : ')}</span>
                <span style="color: #b45309; font-size: 14px; font-weight: 900;">${totalPilgrims}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('إجمالي التذاكر : ')}</span>
                <span style="color: #475569; font-size: 14px; font-weight: 900;">${totalTickets}</span>
              </div>
              <div style="color: #cbd5e1;">|</div>
              <div>
                <span style="color: #64748b;">${clean_and_reshape_text('عدد الجهات : ')}</span>
                <span style="color: #0f172a; font-size: 14px; font-weight: 900;">${organizationsSet.size}</span>
              </div>
            </div>

            <div style="display: flex; gap: 12px; font-size: 11px; color: #475569;">
              <div>
                <span>${clean_and_reshape_text('تاريخ التقرير: ')}</span>
                <strong style="color: #0f172a;">${hijriNow} (${gregorianNow})</strong>
              </div>
              ${config.generatedBy ? `
                <div style="color: #cbd5e1;">|</div>
                <div>
                  <span>${clean_and_reshape_text('المصدر: ')}</span>
                  <strong style="color: #0f172a;">${clean_and_reshape_text(config.generatedBy)}</strong>
                </div>
              ` : ''}
            </div>
          </div>

          <!-- Data Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #0f172a; font-size: 11px;">
            <thead>
              <tr style="background-color: #1e293b; color: #ffffff; height: 30px;">
                <th style="border: 1px solid #334155; width: 30px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('م')}</th>
                <th style="border: 1px solid #334155; width: 65px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('رقم السند')}</th>
                <th style="border: 1px solid #334155; width: 85px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('التاريخ')}</th>
                <th style="border: 1px solid #334155; width: 85px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('رقم الاعتماد')}</th>
                <th style="border: 1px solid #334155; width: 140px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('المؤسسة / العميل')}</th>
                <th style="border: 1px solid #334155; width: 130px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('المندوب / المستلم')}</th>
                <th style="border: 1px solid #334155; width: 65px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('الحافلات')}</th>
                <th style="border: 1px solid #334155; width: 170px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('أرقام اللوحات والحافلات')}</th>
                <th style="border: 1px solid #334155; width: 150px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('خط السير / الموقع')}</th>
                <th style="border: 1px solid #334155; width: 80px; text-align: center; vertical-align: middle; font-weight: 900;">${clean_and_reshape_text('حجاج / تذاكر')}</th>
              </tr>
            </thead>
            <tbody>
              ${pageVouchers.map((v: any, i: number) => {
                const bArray = Array.isArray(v.buses) && v.buses.length > 0
                  ? v.buses
                  : [{ busNumber: v.busNumber || '', driverName: v.driverName || '' }];
                const busNumbersList = bArray.map((b: any) => b.busNumber).filter(Boolean).join(' ، ');
                const dateStr = v.customDate || (v.timestamp ? format(new Date(v.timestamp), 'yyyy/MM/dd') : '-');
                const timeStr = v.eventTime || (v.timestamp ? format(new Date(v.timestamp), 'HH:mm') : '');
                const routeStr = (v.directionFrom || v.directionTo)
                  ? `${v.directionFrom || ''} ➔ ${v.directionTo || ''}`
                  : (v.hotelName || v.loadingLocation || '-');
                
                const isEven = i % 2 === 0;
                const bgColor = isEven ? '#ffffff' : '#f8fafc';

                return `
                  <tr style="background-color: ${bgColor}; height: 28px;">
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 11px; vertical-align: middle;">${startIdx + i + 1}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 12px; color: #1e3a8a; vertical-align: middle;">#${v.voucherNumber}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; vertical-align: middle;">
                      ${dateStr}
                      ${timeStr ? `<div style="font-size: 9px; color: #64748b;">${timeStr}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 800; font-size: 11px; color: #0f172a; vertical-align: middle;">${clean_and_reshape_text(v.approvalNumber || '-')}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 800; font-size: 10.5px; padding: 0 4px; vertical-align: middle;">${clean_and_reshape_text(v.organization || '-')}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10.5px; padding: 0 4px; vertical-align: middle;">
                      <div style="font-weight: 800;">${clean_and_reshape_text(v.receiverName || v.userName || '-')}</div>
                      ${v.delegateNumber ? `<div style="font-size: 9.5px; color: #475569;">${clean_and_reshape_text('رقم المكتب')} ${clean_and_reshape_text(v.delegateNumber)}</div>` : ''}
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-weight: 900; font-size: 12px; color: #047857; vertical-align: middle;">${bArray.length}</td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; padding: 0 4px; vertical-align: middle;">
                      <div style="white-space: normal; line-height: 1.2; word-break: break-word;">${busNumbersList || clean_and_reshape_text('غير محدد')}</div>
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 700; padding: 0 4px; vertical-align: middle;">
                      <div>${clean_and_reshape_text(routeStr)}</div>
                    </td>
                    <td style="border: 1px solid #cbd5e1; text-align: center; font-size: 10px; font-weight: 800; vertical-align: middle;">
                      <div style="color: #b45309;">${v.pilgrimsCount || 0} ${clean_and_reshape_text('حاج')}</div>
                      <div style="font-size: 9px; color: #64748b;">${v.ticketsCount || 0} ${clean_and_reshape_text('تذكرة')}</div>
                    </td>
                  </tr>
                `;
              }).join('')}
              ${Array(Math.max(0, rowsPerPage - pageVouchers.length)).fill(0).map((_, i) => {
                const index = startIdx + pageVouchers.length + i + 1;
                return `
                  <tr style="height: 28px; background-color: #fafafa;">
                    <td style="border: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #cbd5e1;">${index}</td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                    <td style="border: 1px solid #e2e8f0;"></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Footer, Signatures & Pagination -->
        <div style="margin-top: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-end; border-top: 1.5px solid #cbd5e1; padding-top: 8px; font-size: 11px;">
            <!-- Left: Operation Signatures -->
            <div style="display: flex; gap: 40px; text-align: center; font-weight: 800;">
              <div>
                <div style="margin-bottom: 16px; color: #1e293b;">${clean_and_reshape_text('مسؤول التشغيل والحركة')}</div>
                <div style="color: #94a3b8; font-size: 10px;">.........................................</div>
              </div>
              <div>
                <div style="margin-bottom: 16px; color: #1e293b;">${clean_and_reshape_text('مدير إدارة العمليات والنقل')}</div>
                <div style="color: #94a3b8; font-size: 10px;">.........................................</div>
              </div>
              <div>
                <div style="margin-bottom: 16px; color: #1e293b;">${clean_and_reshape_text('الختم والاعتماد الرسمي')}</div>
                <div style="color: #94a3b8; font-size: 10px;">.........................................</div>
              </div>
            </div>

            <!-- Center: Pagination -->
            <div style="text-align: center; font-weight: 900; color: #475569; font-size: 11px;">
              ${clean_and_reshape_text('صفحة')} ${pageNum} ${clean_and_reshape_text('من')} ${totalPages}
            </div>

            <!-- Right: Company System Stamp -->
            <div style="text-align: left; font-size: 9.5px; color: #64748b; font-weight: 700; line-height: 1.4;">
              <div>${clean_and_reshape_text('شركة درة المنورة للنقليات - المملكة العربية السعودية')}</div>
              <div>www.munawwara.com | info@munawwara.com</div>
            </div>
          </div>
        </div>

      </div>
    `;

    document.body.appendChild(container);
    container.innerHTML = html;

    try {
      const canvas = await html2canvas(container, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (doc) => {
          const style = doc.createElement('style');
          style.innerHTML = `
            body, div, span, p, td, th, table, tr, thead, tbody { 
              font-family: 'Calibri', 'Arial', sans-serif !important;
              -webkit-font-smoothing: antialiased; 
              -moz-osx-font-smoothing: grayscale; 
              text-rendering: optimizeLegibility; 
              letter-spacing: 0px !important; 
            }
          `;
          doc.head.appendChild(style);
        }
      });

      const imgData = canvas.toDataURL('image/png');

      let imgWidth = pageWidth;
      let imgHeight = (canvas.height * pageWidth) / canvas.width;
      let x = 0;
      let y = 0;

      if (imgHeight > pageHeight) {
        imgHeight = pageHeight;
        imgWidth = (canvas.width * pageHeight) / canvas.height;
        x = (pageWidth - imgWidth) / 2;
      }

      if (pageNum > 1) pdf.addPage();
      pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
    } finally {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  }

  const safeFileName = `كشف_${config.periodLabel || 'السندات'}_${format(todayDate, 'yyyyMMdd_HHmm')}.pdf`
    .replace(/\s+/g, '_')
    .replace(/[^\u0600-\u06FF\w.-]/g, '');

  if (options.save) {
    pdf.save(safeFileName);
  }

  if (options.print) {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    const printWindow = window.open(url, '_blank');
    if (!printWindow) {
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.click();
    }

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 60000);
  }
  } finally {
    endBusy();
  }
}

