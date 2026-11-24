export function toEnglishDigits(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return '';
  return String(value)
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
}

/**
 * Normalizes Saudi mobile numbers:
 * - Converts Arabic/Persian digits (٠-٩ / ۰-۹) to English 0-9
 * - 5XXXXXXXX -> 05XXXXXXXX
 * - 9665XXXXXXXX / +9665XXXXXXXX / 009665XXXXXXXX -> 05XXXXXXXX
 */
export function normalizeSaudiMobile(
  rawValue: string | number | null | undefined,
  options: { finalize?: boolean } = {}
): string {
  const english = toEnglishDigits(rawValue);
  const stripped = english.replace(/[\s\-().]/g, '');
  if (!stripped) return '';

  const hasLeadingPlus = stripped.startsWith('+');
  const digitsOnly = stripped.replace(/[^0-9]/g, '');
  if (!digitsOnly) return '';

  // +9665XXXXXXXX / 009665XXXXXXXX / 9665XXXXXXXX (also tolerate optional 0 after 966)
  const intlMatch = digitsOnly.match(/^(?:00)?9660?(5\d{8})$/);
  if (intlMatch) {
    return `0${intlMatch[1]}`;
  }

  // 5XXXXXXXX (9 digits starting with 5) -> 05XXXXXXXX
  if (/^5\d{8}$/.test(digitsOnly)) {
    return `0${digitsOnly}`;
  }

  if (options.finalize) {
    return digitsOnly;
  }

  return hasLeadingPlus ? `+${digitsOnly}` : digitsOnly;
}

export function validateReceiverMobile(value: string): string | null {
  const normalized = normalizeSaudiMobile(value, { finalize: true });
  if (!normalized) {
    return 'رقم جوال المستلم مطلوب';
  }
  if (!/^05\d{8}$/.test(normalized)) {
    return 'يجب أن يكون بصيغة 05XXXXXXXX (10 أرقام)';
  }
  return null;
}

/**
 * Saudi ID / Iqama checksum validation:
 * Sum 10 digits where even indices (0, 2, 4, 6, 8) are doubled (subtract 9 if > 9),
 * odd indices are added as-is. Valid when total % 10 === 0.
 */
export function isValidSaudiIdChecksum(id: string): boolean {
  if (!/^[12]\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const digit = Number(id[i]);
    if (i % 2 === 0) {
      const doubled = digit * 2;
      sum += doubled > 9 ? doubled - 9 : doubled;
    } else {
      sum += digit;
    }
  }
  return sum % 10 === 0;
}

export function validateReceiverId(value: string): {
  error: string | null;
  warning: string | null;
} {
  const clean = toEnglishDigits(value).replace(/[^0-9]/g, '');
  if (!clean) {
    return { error: 'رقم هوية المستلم مطلوب', warning: null };
  }
  if (!/^[12]\d{9}$/.test(clean)) {
    return {
      error: 'يجب أن تتكون الهوية من 10 أرقام وتبدأ بـ 1 أو 2',
      warning: null,
    };
  }
  if (!isValidSaudiIdChecksum(clean)) {
    return {
      error: null,
      warning: 'تنبيه: رقم الهوية لم يجتز التحقق الحسابي للخانة الأخيرة (لن يمنع الإصدار)',
    };
  }
  return { error: null, warning: null };
}

export function validateDriverPhoneWarning(value: string): string | null {
  const normalized = normalizeSaudiMobile(value, { finalize: true });
  if (!normalized) {
    return 'تنبيه: هاتف السائق فارغ (لا يمنع الإصدار)';
  }
  if (!/^05\d{8}$/.test(normalized)) {
    return 'تنبيه: صيغة هاتف السائق غير مكتملة، يُفضّل 05XXXXXXXX (لا يمنع الإصدار)';
  }
  return null;
}
