import { jsPDF } from 'jspdf';
import { format } from 'date-fns';
import arabicReshaper from 'arabic-reshaper';
import Bidi from 'bidi-js';
import QRCode from 'qrcode';

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

function formatHijriDDMMYYYY(hijriDate?: string, customDate?: string, timestamp?: string): string {
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

  try {
    let refDate: Date;
    const customClean = toEnglishDigits(customDate || '').trim();
    const cMatch = customClean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (cMatch) {
      refDate = new Date(Number(cMatch[1]), Number(cMatch[2]) - 1, Number(cMatch[3]), 12, 0, 0);
    } else if (timestamp && !isNaN(new Date(timestamp).getTime())) {
      refDate = new Date(timestamp);
    } else {
      refDate = new Date();
    }

    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(refDate);
    const y = toEnglishDigits(parts.find((p) => p.type === 'year')?.value || '');
    const m = toEnglishDigits(parts.find((p) => p.type === 'month')?.value || '').padStart(2, '0');
    const d = toEnglishDigits(parts.find((p) => p.type === 'day')?.value || '').padStart(2, '0');
    if (y && m && d) return `${d}/${m}/${y}`;
  } catch {
    // ignore fallback error
  }
  return '';
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
              document.fonts.load("400 14px 'IBM Plex Sans Arabic'"),
              document.fonts.load("500 14px 'IBM Plex Sans Arabic'"),
              document.fonts.load("600 14px 'IBM Plex Sans Arabic'"),
              document.fonts.load("700 14px 'IBM Plex Sans Arabic'"),
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

async function waitForContainerImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve();
            return;
          }
          const done = () => resolve();
          img.addEventListener('load', done, { once: true });
          img.addEventListener('error', done, { once: true });
          setTimeout(done, 4000);
        })
    )
  );
}

export async function generateVoucherPDF(
  data: any,
  options: { save?: boolean; print?: boolean; twoCopies?: boolean } = { save: true }
) {
  const isBase64OrRelative = (url: string) => !url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('.');
  const logoUrl = data.logoUrl || '/logo.png';
  const sloganUrl = hasValue(data.sloganUrl) ? String(data.sloganUrl).trim() : '';

  const logoCrossOrigin = isBase64OrRelative(logoUrl) ? '' : 'crossOrigin="anonymous"';
  const sloganCrossOrigin = sloganUrl && !isBase64OrRelative(sloganUrl) ? 'crossOrigin="anonymous"' : '';

  const rawMargins = data.pdfMargins || { top: 15, bottom: 15, left: 35, right: 35 };
  const margins = {
    top: Math.max(Number(rawMargins.top) || 15, 22),
    bottom: Math.max(Number(rawMargins.bottom) || 15, 22),
    left: Math.max(Number(rawMargins.left) || 35, 30),
    right: Math.max(Number(rawMargins.right) || 35, 30),
  };

  // Preserve voucher number without leading zero padding (English digits)
  const voucherNoStr = toEnglishDigits(
    data.voucherNumber !== undefined && data.voucherNumber !== null ? String(data.voucherNumber).trim() : ''
  );

  // Format dates strictly as dd/MM/yyyy (English digits)
  const { display: gregorianStr, filePart: gregorianFilePart } = formatGregorianDDMMYYYY(
    data.customDate,
    data.timestamp
  );
  const hijriStr = formatHijriDDMMYYYY(data.hijriDate, data.customDate, data.timestamp);

  // Use only filled bus rows (no empty placeholder padding)
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

  const busesPerPage = 20;
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

  const busesQtyStr =
    hasValue(data.busesQuantity) && Number(toEnglishDigits(data.busesQuantity)) > 0
      ? toEnglishDigits(data.busesQuantity)
      : allBuses.length > 0
      ? String(allBuses.length)
      : '';

  const issuedBy = hasValue(data.userName) ? escapeHtml(toEnglishDigits(String(data.userName).trim())) : 'مستخدم النظام';
  const issuedAt = formatAuditDateTime(data.timestamp);

  // Corner QR code linking directly to voucher in Archive
  let qrDataUrl = '';
  try {
    const baseOrigin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
    const verifyUrl = voucherNoStr ? `${baseOrigin}/?voucher=${encodeURIComponent(voucherNoStr)}` : `${baseOrigin}/`;
    qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      width: 140,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch (err) {
    console.warn('QR generation skipped:', err);
  }

  const fontFaceCss = await ensureEmbeddedIBMPlexFont();

  const renderFieldSpan = (val: any, minWidthPx: number, forceLtr = false) => {
    const clean = toEnglishDigits(val || '').trim();
    const isFilled = clean !== '';
    const safeVal = isFilled ? escapeHtml(clean) : '&nbsp;';
    const dirStyle = forceLtr ? 'direction: ltr; unicode-bidi: isolate;' : '';
    return `<span style="display: inline-block; min-width: ${minWidthPx}px; text-align: center; padding: 0 6px 2px; border-bottom: 1px solid ${
      isFilled ? '#94a3b8' : '#475569'
    }; font-weight: ${isFilled ? '700' : '400'}; color: #0f172a; line-height: 1.35; ${dirStyle}">${safeVal}</span>`;
  };

  const renderSignatureLine = (minWidthPx = 190) =>
    `<span style="display: inline-block; min-width: ${minWidthPx}px; border-bottom: 1px solid #475569; height: 18px; vertical-align: bottom;">&nbsp;</span>`;

  const useTwoCopies = Boolean(options.twoCopies ?? data.twoCopies);
  const copyLabels = useTwoCopies ? ['نسخة المكتب', 'نسخة الشركة'] : [''];

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const html2canvas = (await import('html2canvas')).default;

  let isFirstPdfPage = true;

  for (const copyLabel of copyLabels) {
    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const startIdx = (pageNum - 1) * busesPerPage;
      const pageBuses = allBuses.slice(startIdx, startIdx + busesPerPage);
      const isLastPageOfCopy = pageNum === totalPages;

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '850px';
      container.setAttribute('dir', 'rtl');
      container.setAttribute('lang', 'ar');

      const html = `
        <div dir="rtl" lang="ar" style="padding: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px; font-family: 'IBM Plex Sans Arabic', sans-serif; background-color: #ffffff; position: relative; min-height: 1202px; direction: rtl; box-sizing: border-box; color: #0f172a; display: flex; flex-direction: column;">
          
          <!-- Top Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 8px; margin-bottom: 10px;">
            <!-- Right: Slogan (or Vision text when custom image absent) -->
            <div style="width: 31%; text-align: right; display: flex; align-items: center;">
              ${
                sloganUrl
                  ? `<img src="${sloganUrl}" onerror="this.style.display='none'" style="height: 74px; max-width: 100%; object-fit: contain; display: block;" ${sloganCrossOrigin} />`
                  : `<div style="font-size: 13px; font-weight: 700; color: #1e3a8a; line-height: 1.5;">خدمة ضيوف الرحمن شرف لنا<br/><span style="font-size: 11px; color: #b45309; font-weight: 600;">موسم حج 1448 هـ</span></div>`
              }
            </div>

            <!-- Center: Logo -->
            <div style="width: 30%; text-align: center; display: flex; justify-content: center; align-items: center;">
              <img src="${logoUrl}" onerror="this.style.display='none'" style="height: 92px; max-width: 100%; object-fit: contain; display: block;" ${logoCrossOrigin} />
            </div>

            <!-- Left: Company Name + QR Corner Verification -->
            <div style="width: 39%; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
              <div style="text-align: left; white-space: nowrap;">
                <div style="font-size: 18px; font-weight: 700; color: #0f172a; margin-bottom: 2px;">شركة درة المنورة للنقليات</div>
                <div dir="ltr" style="direction: ltr; unicode-bidi: isolate; text-align: left; font-size: 12.5px; font-weight: 700; color: #334155;">Durrat Al-Munawwara Transport Co.</div>
              </div>
              ${
                qrDataUrl
                  ? `<div style="display: flex; flex-direction: column; align-items: center; padding: 3px; border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff; flex-shrink: 0;">
                      <img src="${qrDataUrl}" style="width: 58px; height: 58px; display: block;" alt="QR" />
                      <span style="font-size: 8.5px; font-weight: 600; color: #475569; margin-top: 1px; white-space: nowrap;">تحقق من السند</span>
                    </div>`
                  : ''
              }
            </div>
          </div>

          <!-- Voucher Number, Copy Label & Dates Row -->
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px;">
            <!-- Right: Dates -->
            <div style="width: 30%; font-size: 13px; font-weight: 700; line-height: 1.75; text-align: right;">
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span style="color: #334155; white-space: nowrap;">التاريخ الهجري:</span>
                <span dir="ltr" style="direction: ltr; unicode-bidi: isolate; display: inline-block; min-width: 96px; text-align: center; border-bottom: 1px solid #475569; padding: 0 4px 1px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;">${
                  hijriStr || '&nbsp;'
                }</span>
              </div>
              <div style="display: flex; align-items: baseline; gap: 6px; margin-top: 2px;">
                <span style="color: #334155; white-space: nowrap;">التاريخ الميلادي:</span>
                <span dir="ltr" style="direction: ltr; unicode-bidi: isolate; display: inline-block; min-width: 96px; text-align: center; border-bottom: 1px solid #475569; padding: 0 4px 1px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums;">${
                  gregorianStr || '&nbsp;'
                }</span>
              </div>
            </div>

            <!-- Center: Document Title -->
            <div style="flex: 1; text-align: center;">
              <div style="display: inline-block; font-size: 21px; font-weight: 700; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 4px;">
                سند استلام حافلات
              </div>
              ${
                totalPages > 1
                  ? `<div style="font-size: 11.5px; font-weight: 600; color: #475569; margin-top: 4px; font-variant-numeric: tabular-nums;">صفحة <span dir="ltr" style="unicode-bidi: isolate;">${pageNum}</span> من <span dir="ltr" style="unicode-bidi: isolate;">${totalPages}</span></div>`
                  : ''
              }
            </div>

            <!-- Left: Voucher Number & Copy Label -->
            <div style="width: 30%; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <div style="font-size: 15px; font-weight: 700; color: #0f172a; border: 1px solid #334155; background-color: #f8fafc; padding: 4px 12px; border-radius: 6px; white-space: nowrap; font-variant-numeric: tabular-nums;">
                رقم السند: <span dir="ltr" style="unicode-bidi: isolate; font-weight: 700;">${escapeHtml(voucherNoStr)}</span>
              </div>
              ${
                copyLabel
                  ? `<div style="font-size: 11.5px; font-weight: 700; color: #1d4ed8; background-color: #eff6ff; border: 1px solid #bfdbfe; padding: 2px 10px; border-radius: 4px; white-space: nowrap;">${copyLabel}</div>`
                  : ''
              }
            </div>
          </div>

          <!-- Voucher Metadata & Form Fields -->
          <div style="font-size: 13.5px; line-height: 1.7; margin-bottom: 10px; font-weight: 600; color: #0f172a; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 12px;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: nowrap;">
              <div style="white-space: nowrap;">استلمت أنا: ${renderFieldSpan(data.receiverName, 175)}</div>
              <div style="white-space: nowrap;">رقم المكتب: ${renderFieldSpan(data.delegateNumber, 70, true)}</div>
              <div style="white-space: nowrap;">التابع لمؤسسة: ${renderFieldSpan(data.organization, 165)}</div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: nowrap;">
              <div style="white-space: nowrap;">عدد الحافلات: ${renderFieldSpan(busesQtyStr, 48, true)} حافلة</div>
              <div style="white-space: nowrap;">عدد التذاكر: ${renderFieldSpan(unifiedTickets, 65, true)}</div>
              <div style="white-space: nowrap;">بموجب اعتماد رقم: ${renderFieldSpan(data.approvalNumber, 130, true)}</div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; flex-wrap: nowrap;">
              <div style="white-space: nowrap;">وقت الاستلام / الحركة: ${renderFieldSpan(data.eventTime, 110)}</div>
              <div style="white-space: nowrap;">الاتجاه من: ${renderFieldSpan(data.directionFrom, 115)} إلى: ${renderFieldSpan(data.directionTo, 115)}</div>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: nowrap;">
              <div style="white-space: nowrap;">مكان التحميل: ${renderFieldSpan(data.loadingLocation, 175)}</div>
              <div style="white-space: nowrap;">اسم الفندق: ${renderFieldSpan(data.hotelName, 210)}</div>
            </div>
          </div>

          <!-- Buses Table -->
          <table style="width: 100%; border-collapse: collapse; border: 1px solid #334155; margin-top: 2px;">
            <thead>
              <tr style="background-color: #f1f5f9;">
                <th style="border: 1px solid #334155; width: 46px; padding: 6px; font-size: 13px; font-weight: 700; text-align: center; vertical-align: middle; color: #0f172a;">م</th>
                <th style="border: 1px solid #334155; width: 39%; padding: 6px; font-size: 13px; font-weight: 700; text-align: center; vertical-align: middle; color: #0f172a;">اسم السائق</th>
                <th style="border: 1px solid #334155; width: 17%; padding: 6px; font-size: 13px; font-weight: 700; text-align: center; vertical-align: middle; color: #0f172a;">رقم اللوحة</th>
                <th style="border: 1px solid #334155; width: 14%; padding: 6px; font-size: 13px; font-weight: 700; text-align: center; vertical-align: middle; color: #0f172a;">نوعها</th>
                <th style="border: 1px solid #334155; width: 24%; padding: 6px; font-size: 13px; font-weight: 700; text-align: center; vertical-align: middle; color: #0f172a;">رقم الهاتف</th>
              </tr>
            </thead>
            <tbody>
              ${pageBuses
                .map((bus: any, i: number) => {
                  const rowNum = startIdx + i + 1;
                  const driver = escapeHtml(toEnglishDigits(bus.driverName || '').trim());
                  const plate = escapeHtml(toEnglishDigits(bus.busNumber || '').trim());
                  const type = escapeHtml(toEnglishDigits(bus.busType || 'حافلة').trim());
                  const phone = escapeHtml(toEnglishDigits(bus.driverPhone || '').trim());
                  return `
                    <tr>
                      <td style="border: 1px solid #334155; padding: 6px; text-align: center; vertical-align: middle; font-weight: 700; font-size: 12.5px; font-variant-numeric: tabular-nums;"><span dir="ltr" style="unicode-bidi: isolate;">${rowNum}</span></td>
                      <td style="border: 1px solid #334155; padding: 6px; text-align: center; vertical-align: middle;">
                        <div style="font-size: ${getFontSizeForText(driver, 13, 28)}px; font-weight: 600; line-height: 1.3; text-align: center; width: 100%;">
                          ${driver || '&nbsp;'}
                        </div>
                      </td>
                      <td style="border: 1px solid #334155; padding: 6px; text-align: center; vertical-align: middle; font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums;"><span dir="ltr" style="unicode-bidi: isolate;">${plate || '&nbsp;'}</span></td>
                      <td style="border: 1px solid #334155; padding: 6px; text-align: center; vertical-align: middle; font-weight: 600; font-size: 12.5px;">${type}</td>
                      <td style="border: 1px solid #334155; padding: 6px; text-align: center; vertical-align: middle; font-weight: 600; font-size: 12.5px; font-variant-numeric: tabular-nums;"><span dir="ltr" style="unicode-bidi: isolate;">${phone || '&nbsp;'}</span></td>
                    </tr>
                  `;
                })
                .join('')}
              ${
                isLastPageOfCopy
                  ? `<tr>
                      <td colspan="5" style="border: 1px solid #334155; padding: 6px; text-align: center; vertical-align: middle; font-size: 12px; font-weight: 600; color: #64748b; background-color: #f8fafc;">
                        — لا توجد حافلات بعد هذا السطر —
                      </td>
                    </tr>`
                  : ''
              }
            </tbody>
          </table>

          ${
            !isLastPageOfCopy
              ? `<div style="text-align: center; font-size: 12px; font-weight: 600; color: #475569; margin-top: 10px;">
                  يتبع في الصفحة التالية... (<span dir="ltr" style="unicode-bidi: isolate; font-variant-numeric: tabular-nums;">${pageNum} / ${totalPages}</span>)
                </div>`
              : ''
          }

          ${
            isLastPageOfCopy && hasValue(data.notes)
              ? `<div style="margin-top: 10px; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 10px; background-color: #f8fafc; font-size: 12px; line-height: 1.5;">
                  <strong style="font-weight: 700; color: #0f172a;">ملاحظات:</strong>
                  <span style="font-weight: 500; color: #334155; white-space: pre-wrap;">${escapeHtml(toEnglishDigits(String(data.notes).trim()))}</span>
                </div>`
              : ''
          }

          ${
            isLastPageOfCopy
              ? `<!-- Equal Side-by-Side Signature Boxes -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px;">
                  <!-- Company Delegate Box -->
                  <div style="border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; background-color: #ffffff;">
                    <div>
                      <div style="font-size: 13.5px; font-weight: 700; text-align: center; color: #0f172a; background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 4px 8px; margin: -10px -12px 10px -12px; border-radius: 5px 5px 0 0;">
                        مندوب شركة درة المنورة
                      </div>
                      <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px;">
                        <span style="white-space: nowrap;">الاسم:</span>
                        <span style="flex: 1; border-bottom: 1px solid #475569; height: 18px;">&nbsp;</span>
                      </div>
                      <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 10px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px;">
                        <span style="white-space: nowrap;">التوقيع:</span>
                        <span style="flex: 1; border-bottom: 1px solid #475569; height: 18px;">&nbsp;</span>
                      </div>
                    </div>
                    <div style="border: 1px dashed #64748b; border-radius: 6px; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 600; color: #64748b; background-color: #f8fafc;">
                      ختم الشركة
                    </div>
                  </div>

                  <!-- Receiver Box -->
                  <div style="border: 1px solid #334155; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; justify-content: space-between; background-color: #ffffff;">
                    <div>
                      <div style="font-size: 13.5px; font-weight: 700; text-align: center; color: #0f172a; background-color: #f1f5f9; border-bottom: 1px solid #cbd5e1; padding: 4px 8px; margin: -10px -12px 10px -12px; border-radius: 5px 5px 0 0;">
                        المستلم (مندوب مجموعة الخدمة الميدانية)
                      </div>
                      <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px;">
                        <span style="white-space: nowrap;">الاسم:</span>
                        <span style="flex: 1; border-bottom: 1px solid ${hasValue(data.receiverName) ? '#94a3b8' : '#475569'}; padding: 0 4px 1px; font-weight: 700; text-align: center;">${
                          hasValue(data.receiverName) ? escapeHtml(toEnglishDigits(data.receiverName).trim()) : '&nbsp;'
                        }</span>
                      </div>
                      <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px;">
                        <span style="white-space: nowrap;">رقم الموبايل:</span>
                        <span dir="ltr" style="direction: ltr; unicode-bidi: isolate; flex: 1; border-bottom: 1px solid ${
                          hasValue(data.receiverMobile) ? '#94a3b8' : '#475569'
                        }; padding: 0 4px 1px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums;">${
                          hasValue(data.receiverMobile) ? escapeHtml(toEnglishDigits(data.receiverMobile).trim()) : '&nbsp;'
                        }</span>
                      </div>
                      <div style="font-size: 12.5px; font-weight: 600; margin-bottom: 8px; display: flex; align-items: baseline; gap: 8px;">
                        <span style="white-space: nowrap;">رقم الهوية:</span>
                        <span dir="ltr" style="direction: ltr; unicode-bidi: isolate; flex: 1; border-bottom: 1px solid ${
                          hasValue(data.receiverId) ? '#94a3b8' : '#475569'
                        }; padding: 0 4px 1px; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums;">${
                          hasValue(data.receiverId) ? escapeHtml(toEnglishDigits(data.receiverId).trim()) : '&nbsp;'
                        }</span>
                      </div>
                      <div style="font-size: 12.5px; font-weight: 600; display: flex; align-items: baseline; gap: 8px;">
                        <span style="white-space: nowrap;">التوقيع:</span>
                        ${renderSignatureLine(160)}
                      </div>
                    </div>
                  </div>
                </div>`
              : ''
          }

          <!-- Bottom Audit Line & Footer Info -->
          <div style="margin-top: auto; padding-top: 12px; padding-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 10.5px; font-weight: 600; color: #475569; margin-bottom: 6px; padding-bottom: 5px; border-bottom: 1px solid #cbd5e1;">
              <div>صدر بواسطة: <span style="color: #0f172a; font-weight: 700;">${issuedBy}</span> • <span dir="ltr" style="unicode-bidi: isolate; font-variant-numeric: tabular-nums;">${issuedAt}</span></div>
              <div style="font-variant-numeric: tabular-nums;">سند رقم <span dir="ltr" style="unicode-bidi: isolate;">${escapeHtml(voucherNoStr)}</span>${
                copyLabel ? ` • ${copyLabel}` : ''
              }${totalPages > 1 ? ` • صفحة <span dir="ltr" style="unicode-bidi: isolate;">${pageNum}</span> من <span dir="ltr" style="unicode-bidi: isolate;">${totalPages}</span>` : ''}</div>
            </div>
            <div style="text-align: center; font-size: 11px; font-weight: 700; line-height: 1.6; color: #334155;">
              <div>المقر الرئيسي : العكيشية - ص . ب 20442 جدة 21455</div>
              <div dir="ltr" style="direction: ltr; unicode-bidi: isolate; font-weight: 700; color: #1e3a8a;">www.munawwara.com</div>
            </div>
          </div>
        </div>
      `;

      container.innerHTML = html;
      document.body.appendChild(container);
      await waitForContainerImages(container);

      try {
        const canvas = await html2canvas(container, {
          scale: 3,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          onclone: (doc) => {
            const style = doc.createElement('style');
            style.innerHTML = `
              ${fontFaceCss}
              body, div, span, p, td, th, table, tr, thead, tbody, strong {
                font-family: 'IBM Plex Sans Arabic', sans-serif !important;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-rendering: optimizeLegibility;
                letter-spacing: 0px !important;
              }
            `;
            doc.head.appendChild(style);
          },
        });

        const imgData = canvas.toDataURL('image/png');

        let imgWidth = pageWidth;
        let imgHeight = (canvas.height * pageWidth) / canvas.width;
        let x = 0;
        const y = 0;

        if (imgHeight > pageHeight) {
          imgHeight = pageHeight;
          imgWidth = (canvas.width * pageHeight) / canvas.height;
          x = (pageWidth - imgWidth) / 2;
        }

        if (!isFirstPdfPage) pdf.addPage();
        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
        isFirstPdfPage = false;
      } finally {
        if (document.body.contains(container)) {
          document.body.removeChild(container);
        }
      }
    }
  }

  let pdfBase64 = '';
  if (options.save || options.print) {
    pdfBase64 = pdf.output('datauristring');
  }

  if (options.save) {
    pdf.save(`سند-${voucherNoStr}-${gregorianFilePart}.pdf`);
  }

  if (options.print) {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    // Attempt to open in a new tab for printing
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

  return pdfBase64;
}

/**
 * دالة لطباعة كشف مجمع للمكتب (كل الحافلات)
 * تحافظ على نفس التنسيق والشكل وتدعم تعدد الصفحات
 */
export async function generateBulkOfficePDF(data: any, options: { save?: boolean, print?: boolean } = { save: true }) {
  const isBase64OrRelative = (url: string) => !url || url.startsWith('data:') || url.startsWith('/') || url.startsWith('.');
  const logoUrl = data.logoUrl || '/logo.png';
  const sloganUrl = data.sloganUrl || '/input_file_0.png';

  const logoCrossOrigin = isBase64OrRelative(logoUrl) ? '' : 'crossOrigin="anonymous"';
  const sloganCrossOrigin = isBase64OrRelative(sloganUrl) ? '' : 'crossOrigin="anonymous"';

  const margins = { top: 15, bottom: 15, left: 25, right: 25 }; 
  const allBuses = data.buses || [];
  const busesPerPage = 16; // Reduced to fit signatures, notes, and footer comfortably
  const totalPages = Math.ceil(allBuses.length / busesPerPage) || 1;

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'px',
    format: 'a4'
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const html2canvas = (await import('html2canvas')).default;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const startIdx = (pageNum - 1) * busesPerPage;
    const pageBuses = allBuses.slice(startIdx, startIdx + busesPerPage);
    
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '850px'; 
    
    const html = `
      <div style="padding: ${margins.top}px ${margins.left}px ${margins.bottom}px ${margins.right}px; font-family: 'Calibri', 'Arial', sans-serif; background-color: white; position: relative; min-height: 1120px; direction: rtl; box-sizing: border-box; color: #000; display: flex; flex-direction: column;">
        
        <!-- Header (Slightly Smaller to save space) -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
          <!-- Right: Slogan -->
          <div style="width: 33%; text-align: right;">
             <img src="${sloganUrl}" style="height: 100px; max-width: 100%; object-fit: contain; display: inline-block; vertical-align: middle;" ${sloganCrossOrigin} />
          </div>
          <!-- Center: Logo -->
          <div style="width: 34%; text-align: center;">
            <img src="${logoUrl}" style="height: 145px; object-fit: contain; display: inline-block;" ${logoCrossOrigin} />
          </div>
          <!-- Left: Company Name -->
          <div style="text-align: left; width: 33%; white-space: nowrap;">
            <div style="font-size: 26px; font-weight: 800; margin-bottom: 2px; white-space: nowrap;">${clean_and_reshape_text('شركة درة المنورة للنقليات')}</div>
            <div style="font-size: 16px; font-weight: 800; font-family: 'Times New Roman', serif; white-space: nowrap;">Durrat Al-Munawwara Transport Co.</div>
          </div>
        </div>

        <!-- Center Title -->
        <div style="text-align: center; margin-bottom: 15px;">
          <span style="font-size: 32px; font-weight: 900; color: #000; border-bottom: 3px solid #000; padding-bottom: 4px; display: inline-block;">
            ${clean_and_reshape_text('سند استلام حافلات')}
          </span>
        </div>

        <!-- Row after header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
          <div style="width: 30%; font-size: 16px; font-weight: 900; line-height: 1.4; text-align: right;">
            <div style="display: flex; gap: 8px;">
              <span>${clean_and_reshape_text('التاريــخ : ')}</span>
              <span style="min-width: 80px; text-align: center; border-bottom: 1px dotted #000;">${data.hijriDate || '      -  -  '}</span>
            </div>
            <div style="display: flex; gap: 8px;">
              <span>${clean_and_reshape_text('الـمـوافق : ')}</span>
              <span style="min-width: 80px; text-align: center; border-bottom: 1px dotted #000;">${format(new Date(data.customDate || data.timestamp), 'yyyy/MM/dd')}</span>
            </div>
          </div>
          <div style="flex: 1;"></div>
          <div style="width: 20%;"></div>
        </div>

        <div style="font-size: 16px; line-height: 1.8; margin-bottom: 10px; font-weight: 900;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px; gap: 10px;">
             <div style="white-space: nowrap;">${clean_and_reshape_text('المكتب / المندوب : ')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 150px; text-align: center;">${hasValue(data.delegateNumber) ? clean_and_reshape_text(data.delegateNumber) : ''}</span></div>
             <div style="white-space: nowrap;">${clean_and_reshape_text('التابع لمؤسسة : ')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 250px; text-align: center;">${hasValue(data.organization) ? clean_and_reshape_text(data.organization) : ''}</span></div>
          </div>
          <div style="display: flex; justify-content: space-between; gap: 10px;">
            <div style="white-space: nowrap;">
              ${clean_and_reshape_text('إجمالي الحافلات : ')} <span style="padding: 0 10px; min-width: 30px; display: inline-block; text-align: center;">${allBuses.length}</span>
            </div>
             <div style="white-space: nowrap; flex: 1; text-align: left;">
              ${clean_and_reshape_text('الإتجاه من')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 120px; text-align: center;">${hasValue(data.directionFrom) ? clean_and_reshape_text(data.directionFrom) : ''}</span> 
              ${clean_and_reshape_text('إلى')} <span style="font-weight: 600; padding: 0 10px; display: inline-block; min-width: 120px; text-align: center;">${hasValue(data.directionTo) ? clean_and_reshape_text(data.directionTo) : ''}</span>
            </div>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000; margin-top: 5px;">
          <thead>
            <tr style="background-color: #e2e8f0; height: 34px;">
              <th style="border: 1px solid #000; width: 35px; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('م')}</th>
              <th style="border: 1px solid #000; width: 30%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('اسم السائق')}</th>
              <th style="border: 1px solid #000; width: 12%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم اللوحة')}</th>
              <th style="border: 1px solid #000; width: 13%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('نوعها')}</th>
              <th style="border: 1px solid #000; width: 20%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم الاعتماد')}</th>
              <th style="border: 1px solid #000; width: 20%; font-size: 14.5px; font-weight: 700; text-align: center; vertical-align: middle;">${clean_and_reshape_text('رقم الهاتف')}</th>
            </tr>
          </thead>
          <tbody>
            ${pageBuses.map((bus: any, i: number) => `
              <tr style="height: 34px;">
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${startIdx + i + 1}</td>
                <td style="border: 1px solid #000; text-align: center; padding: 2px 5px; vertical-align: middle;">
                  <div style="font-size: ${getFontSizeForText(bus.driverName, 14.5, 25)}px; font-weight: 700; line-height: 1.3; text-align: center; width: 100%; white-space: nowrap;">
                    ${clean_and_reshape_text(bus.driverName)}
                  </div>
                </td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 14.5px; vertical-align: middle;">${bus.busNumber}</td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${clean_and_reshape_text(bus.busType || 'حافلة')}</td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${bus.approvalNumber || ''}</td>
                <td style="border: 1px solid #000; text-align: center; font-weight: 700; font-size: 13px; vertical-align: middle;">${bus.driverPhone || ''}</td>
              </tr>
            `).join('')}
            ${Array(Math.max(0, busesPerPage - pageBuses.length)).fill(0).map((_, i) => {
              const index = startIdx + pageBuses.length + i + 1;
              return `
                <tr style="height: 34px;">
                  <td style="border: 1px solid #000; text-align: center; font-size: 13px; font-weight: 700;">${index}</td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                  <td style="border: 1px solid #000;"></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>

        <!-- حقل الملاحظات أسفل الجدول -->
        ${pageNum === totalPages ? `
        <div style="margin-top: 10px; border: 1.5px solid #000; padding: 10px; border-radius: 4px; font-size: 14.5px; text-align: right; background-color: #f8fafc; min-height: 50px; box-sizing: border-box;">
          <strong style="font-weight: 900;">${clean_and_reshape_text('الملاحظات : ')}</strong>
          <span style="font-weight: 700; white-space: pre-wrap; margin-right: 5px;">${hasValue(data.notes) ? clean_and_reshape_text(data.notes) : ''}</span>
        </div>
        ` : ''}

        <!-- Signatures and footer area -->
        <div style="margin-top: auto; padding-top: 20px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 25px; font-weight: bold;">
            <div style="width: 45%; text-align: center;">
              <div style="font-size: 15px; margin-bottom: 15px; text-decoration: underline;">${clean_and_reshape_text('مندوب شركة درة المنورة')}</div>
              <div style="text-align: right; font-size: 13px; margin-bottom: 10px;">${clean_and_reshape_text('الأسم : .............................................')}</div>
              <div style="text-align: right; font-size: 13px;">${clean_and_reshape_text('التوقيع : ...........................................')}</div>
            </div>
            <div style="width: 50%; text-align: center;">
              <div style="font-size: 15px; margin-bottom: 15px; text-decoration: underline;">${clean_and_reshape_text('المستلم ( مندوب مجموعة الخدمة الميدانية )')}</div>
              <div style="text-align: right; font-size: 13px; margin-bottom: 10px;">${clean_and_reshape_text('الأسم : .............................................')}</div>
              <div style="text-align: right; font-size: 13px;">${clean_and_reshape_text('التوقيع : ...........................................')}</div>
            </div>
          </div>

          <div style="border-top: 2px solid #000; padding-top: 10px; text-align: center; font-size: 11px; font-weight: bold; line-height: 1.5; color: #333;">
            ${clean_and_reshape_text('المقر الرئيسي : العكيشية - ص . ب 20442 جدة 21455')}
            <br/>
            www.munawwara.com
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
      if (document.body.contains(container)) document.body.removeChild(container);
    }
  }

  if (options.save) {
    pdf.save(`كشف_مكتب_${data.delegateNumber}_${format(new Date(), 'yyyyMMdd')}.pdf`);
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
}

/**
 * دالة لتوليد كشوفات وتقارير PDF رسمية للسندات والعمليات
 * للمدراء والمشرفين (كشوفات شهرية، موسمية، أو نطاقات زمنية مخصصة)
 */
export async function generateStatementReportPDF(
  config: StatementReportConfig,
  options: { save?: boolean; print?: boolean } = { save: true, print: true }
) {
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
  let hijriNow = '';
  try {
    hijriNow = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(todayDate);
    if (!hijriNow.includes('هـ')) hijriNow += ' هـ';
  } catch {
    hijriNow = '1448 هـ';
  }

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
}

