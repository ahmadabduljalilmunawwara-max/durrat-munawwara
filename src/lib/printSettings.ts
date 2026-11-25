export interface PdfMargins {
  top: number;
  bottom: number;
  left: number;
  right: number;
  unit?: 'mm';
}

export const MIN_MARGIN_MM = 0;
export const MAX_MARGIN_MM = 20;
export const DEFAULT_PDF_MARGINS: PdfMargins = {
  top: 10,
  bottom: 10,
  left: 10,
  right: 10,
  unit: 'mm',
};

export const MIN_SLOGAN_HEIGHT_MM = 15;
export const MAX_SLOGAN_HEIGHT_MM = 30;
export const DEFAULT_SLOGAN_HEIGHT_MM = 23;

export const MIN_PRINT_COPIES = 1;
export const MAX_PRINT_COPIES = 5;
export const DEFAULT_PRINT_COPY_LABELS = [
  'نسخة المكتب',
  'نسخة الشركة',
  'نسخة الأرشيف',
  'نسخة رابعة',
  'نسخة خامسة',
] as const;

export const DEFAULT_ACTIVE_SEASON = '1448';
export const MIN_HIJRI_OFFSET_DAYS = -2;
export const MAX_HIJRI_OFFSET_DAYS = 2;
export const DEFAULT_HIJRI_OFFSET_DAYS = 0;

export const DEFAULT_COMPANY_ADDRESS = 'المقر الرئيسي: العكيشية - ص.ب 20442 جدة 21455';
export const DEFAULT_COMPANY_WEBSITE = 'www.munawwara.com';
export const DEFAULT_COMPANY_PHONE = '';

export const MIN_IDLE_TIMEOUT_MINUTES = 5;
export const MAX_IDLE_TIMEOUT_MINUTES = 120;
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;

export const WELCOME_MESSAGE_MAX_LENGTH = 300;
export const DEFAULT_WELCOME_TITLE = 'مرحباً بك في نظام درة المنورة';
export const DEFAULT_WELCOME_MESSAGE =
  'أهلاً {الاسم}، نظام درة المنورة جاهز لموسم حج 1448هـ. تم تطويره بإشراف الأستاذ عبد الحميد سالمة، مدير التشغيل العام.';

export const PAGE_TARGET_HEIGHT_MM = 296;
export const TABLE_ROWS_COUNT = 18;
export const DEFAULT_TABLE_ROW_HEIGHT_MM = 6.2;
export const MIN_TABLE_ROW_HEIGHT_MM = 6.0;

function toFiniteNumber(val: unknown, fallback: number): number {
  const n = typeof val === 'number' ? val : Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function toEnglishDigitsLocal(input: string | number | null | undefined): string {
  if (input === undefined || input === null) return '';
  return String(input)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/**
 * Normalizes stored pdfMargins.
 * Legacy records stored pixel defaults `{ top: 20, bottom: 20, left: 40, right: 40 }` without `unit: 'mm'`.
 * Those legacy pixel values are automatically converted to the new 10mm default on all 4 sides.
 */
export function normalizePdfMargins(raw: any): PdfMargins {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_PDF_MARGINS };
  }

  const isExplicitMm = raw.unit === 'mm';
  const top = toFiniteNumber(raw.top, DEFAULT_PDF_MARGINS.top);
  const bottom = toFiniteNumber(raw.bottom, DEFAULT_PDF_MARGINS.bottom);
  const left = toFiniteNumber(raw.left, DEFAULT_PDF_MARGINS.left);
  const right = toFiniteNumber(raw.right, DEFAULT_PDF_MARGINS.right);

  if (!isExplicitMm) {
    const looksLikeLegacyPx =
      top > MAX_MARGIN_MM ||
      bottom > MAX_MARGIN_MM ||
      left > MAX_MARGIN_MM ||
      right > MAX_MARGIN_MM ||
      (top === 20 && bottom === 20 && left === 40 && right === 40);

    if (looksLikeLegacyPx) {
      return { ...DEFAULT_PDF_MARGINS };
    }
  }

  return {
    top: Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, Math.round(top * 10) / 10)),
    bottom: Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, Math.round(bottom * 10) / 10)),
    left: Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, Math.round(left * 10) / 10)),
    right: Math.max(MIN_MARGIN_MM, Math.min(MAX_MARGIN_MM, Math.round(right * 10) / 10)),
    unit: 'mm',
  };
}

export function normalizeSloganHeightMm(raw: any): number {
  const n = toFiniteNumber(raw, DEFAULT_SLOGAN_HEIGHT_MM);
  return Math.max(MIN_SLOGAN_HEIGHT_MM, Math.min(MAX_SLOGAN_HEIGHT_MM, Math.round(n)));
}

export function normalizePrintCopies(raw: unknown): number {
  const n = Math.trunc(toFiniteNumber(raw, 1));
  return Math.max(MIN_PRINT_COPIES, Math.min(MAX_PRINT_COPIES, n));
}

export function normalizePrintCopyLabels(raw: unknown, copiesCount: number = MAX_PRINT_COPIES): string[] {
  const count = Math.max(1, Math.min(MAX_PRINT_COPIES, Math.trunc(copiesCount)));
  const arr = Array.isArray(raw) ? raw : [];
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = typeof arr[i] === 'string' ? arr[i].trim().slice(0, 40) : '';
    result.push(item || DEFAULT_PRINT_COPY_LABELS[i]);
  }
  return result;
}

export function normalizeHijriOffsetDays(raw: unknown): number {
  const n = Math.trunc(toFiniteNumber(raw, DEFAULT_HIJRI_OFFSET_DAYS));
  return Math.max(MIN_HIJRI_OFFSET_DAYS, Math.min(MAX_HIJRI_OFFSET_DAYS, n));
}

export function normalizeIdleTimeoutMinutes(raw: unknown): number {
  const n = Math.trunc(toFiniteNumber(raw, DEFAULT_IDLE_TIMEOUT_MINUTES));
  return Math.max(MIN_IDLE_TIMEOUT_MINUTES, Math.min(MAX_IDLE_TIMEOUT_MINUTES, n));
}

export function normalizeActiveSeason(raw: unknown): string {
  const cleaned = toEnglishDigitsLocal(typeof raw === 'string' || typeof raw === 'number' ? raw : '')
    .replace(/[^\d]/g, '')
    .slice(0, 6);
  return cleaned || DEFAULT_ACTIVE_SEASON;
}

export function formatWelcomeTextWithName(template: string, displayName: string): string {
  const safeTemplate = (template || '').trim() || DEFAULT_WELCOME_MESSAGE;
  const safeName = (displayName || '').trim() || 'بك';
  return safeTemplate.replace(/\{الاسم\}/g, safeName);
}

export function computeAdjustedDate(baseDate: Date, offsetDays: number): Date {
  const safeOffset = normalizeHijriOffsetDays(offsetDays);
  const shifted = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + safeOffset,
    12,
    0,
    0
  );
  return shifted;
}

export function formatHijriDDMMYYYYWithOffset(
  gregorianInput: string | Date | undefined,
  offsetDays: number = 0
): string {
  try {
    let baseDate: Date;
    if (gregorianInput instanceof Date) {
      baseDate = isNaN(gregorianInput.getTime()) ? new Date() : gregorianInput;
    } else if (typeof gregorianInput === 'string' && gregorianInput.trim()) {
      const clean = toEnglishDigitsLocal(gregorianInput).trim();
      const ymd = clean.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
      const dmy = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
      if (ymd) {
        baseDate = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), 12, 0, 0);
      } else if (dmy) {
        baseDate = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 12, 0, 0);
      } else {
        const parsed = new Date(clean);
        baseDate = isNaN(parsed.getTime()) ? new Date() : parsed;
      }
    } else {
      baseDate = new Date();
    }

    const adjusted = computeAdjustedDate(baseDate, offsetDays);
    const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'numeric',
      year: 'numeric',
    }).formatToParts(adjusted);

    const y = toEnglishDigitsLocal(parts.find((p) => p.type === 'year')?.value || '');
    const m = toEnglishDigitsLocal(parts.find((p) => p.type === 'month')?.value || '').padStart(2, '0');
    const d = toEnglishDigitsLocal(parts.find((p) => p.type === 'day')?.value || '').padStart(2, '0');
    if (y && m && d) return `${d}/${m}/${y}`;
  } catch {
    // ignore formatting fallback
  }
  return '';
}

export function formatHijriLongWithOffset(baseDate: Date = new Date(), offsetDays: number = 0): string {
  const adjusted = computeAdjustedDate(baseDate, offsetDays);
  try {
    const formatted = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic-umalqura', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(adjusted);
    const normalized = toEnglishDigitsLocal(formatted);
    return normalized.includes('هـ') ? normalized : `${normalized} هـ`;
  } catch {
    try {
      const formatted = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-islamic', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(adjusted);
      const normalized = toEnglishDigitsLocal(formatted);
      return normalized.includes('هـ') ? normalized : `${normalized} هـ`;
    } catch {
      return `${DEFAULT_ACTIVE_SEASON} هـ`;
    }
  }
}

export interface PrintLayoutMetrics {
  isValid: boolean;
  rowHeightMm: number;
  availableTableRowsHeightMm: number;
  verticalSumMm: number;
  maxAllowedVerticalSumMm: number;
  errorMessage: string | null;
}

/**
 * Computes the available vertical height on a single A4 page (296mm) after header,
 * metadata card, table header, signature boxes, footer, and top/bottom padding.
 * The 18 table rows absorb compression down to 6.0mm minimum; any margin combination
 * that would squeeze a row below 6.0mm is rejected with an Arabic explanation.
 */
export function computePrintLayoutMetrics(
  marginsInput: { top: number; bottom: number; left: number; right: number },
  sloganHeightMmInput: number = DEFAULT_SLOGAN_HEIGHT_MM
): PrintLayoutMetrics {
  const sloganHeight = normalizeSloganHeightMm(sloganHeightMmInput);
  const top = toFiniteNumber(marginsInput.top, DEFAULT_PDF_MARGINS.top);
  const bottom = toFiniteNumber(marginsInput.bottom, DEFAULT_PDF_MARGINS.bottom);
  const left = toFiniteNumber(marginsInput.left, DEFAULT_PDF_MARGINS.left);
  const right = toFiniteNumber(marginsInput.right, DEFAULT_PDF_MARGINS.right);

  if (
    top < MIN_MARGIN_MM ||
    top > MAX_MARGIN_MM ||
    bottom < MIN_MARGIN_MM ||
    bottom > MAX_MARGIN_MM ||
    left < MIN_MARGIN_MM ||
    left > MAX_MARGIN_MM ||
    right < MIN_MARGIN_MM ||
    right > MAX_MARGIN_MM
  ) {
    return {
      isValid: false,
      rowHeightMm: DEFAULT_TABLE_ROW_HEIGHT_MM,
      availableTableRowsHeightMm: DEFAULT_TABLE_ROW_HEIGHT_MM * TABLE_ROWS_COUNT,
      verticalSumMm: Math.round((top + bottom) * 10) / 10,
      maxAllowedVerticalSumMm: 26,
      errorMessage: `يجب أن تتراوح قيم الهوامش لكل جهة بين ${MIN_MARGIN_MM} و ${MAX_MARGIN_MM} مليمتر فقط.`,
    };
  }

  const headerBlockMm = Math.max(28, sloganHeight) + 1.4;
  const fixedContentMm = headerBlockMm + 13.5 + 47.5 + 6.8 + 36 + 26 + 2;

  const verticalSumMm = Math.round((top + bottom) * 100) / 100;
  const maxAllowedVerticalSumMm = Math.floor(
    (PAGE_TARGET_HEIGHT_MM - fixedContentMm - MIN_TABLE_ROW_HEIGHT_MM * TABLE_ROWS_COUNT) * 10
  ) / 10;

  const availableTableRowsHeightMm = PAGE_TARGET_HEIGHT_MM - verticalSumMm - fixedContentMm;
  const rawRowHeightMm = availableTableRowsHeightMm / TABLE_ROWS_COUNT;
  const rowHeightMm = Math.min(DEFAULT_TABLE_ROW_HEIGHT_MM, Math.round(rawRowHeightMm * 100) / 100);

  if (rawRowHeightMm < MIN_TABLE_ROW_HEIGHT_MM) {
    return {
      isValid: false,
      rowHeightMm: Math.max(0, Math.round(rawRowHeightMm * 100) / 100),
      availableTableRowsHeightMm: Math.max(0, Math.round(availableTableRowsHeightMm * 100) / 100),
      verticalSumMm,
      maxAllowedVerticalSumMm: Math.max(0, maxAllowedVerticalSumMm),
      errorMessage: `مجموع الهامش العلوي والسفلي (${verticalSumMm} مم) كبير جداً ويضغط ارتفاع صف الجدول إلى ${Math.max(0, rawRowHeightMm).toFixed(2)} مم، وهو أقل من الحد الأدنى المسموح (${MIN_TABLE_ROW_HEIGHT_MM} مم) للحفاظ على بقاء السند في صفحة A4 واحدة. يجب ألا يتجاوز مجموع الهامش العلوي والسفلي ${Math.max(0, maxAllowedVerticalSumMm).toFixed(1)} مم.`,
    };
  }

  return {
    isValid: true,
    rowHeightMm,
    availableTableRowsHeightMm: Math.round(availableTableRowsHeightMm * 100) / 100,
    verticalSumMm,
    maxAllowedVerticalSumMm: Math.max(0, maxAllowedVerticalSumMm),
    errorMessage: null,
  };
}
