export const MAX_RECEIPT_NAME_LENGTH = 40;

const DISALLOWED_RECEIPT_NAMES = new Set([
  'مدير العمليات',
  'مسؤول العمليات',
  'ahmad abduljalil',
  'google user',
  'مستخدم النظام',
  'غير معروف',
  'المسؤول',
  'غير محدد',
]);

export interface IssuerUserLike {
  uid?: string | null;
  id?: string | null;
  username?: string | null;
  displayName?: string | null;
  name?: string | null;
  receiptName?: string | null;
  role?: string | null;
}

export interface VoucherLike {
  issuedByName?: string | null;
  issuedByUid?: string | null;
  resolvedIssuerName?: string | null;
  userId?: string | null;
  userName?: string | null;
  delegateName?: string | null;
}

export function sanitizeReceiptName(raw: unknown): string {
  return String(raw ?? '').trim().slice(0, MAX_RECEIPT_NAME_LENGTH);
}

export function isEmailLike(value: string): boolean {
  return value.includes('@');
}

export function isEnglishOnlyName(value: string): boolean {
  const hasLatin = /[A-Za-z]/.test(value);
  const hasArabic = /[\u0600-\u06FF]/.test(value);
  return hasLatin && !hasArabic;
}

export function isValidReceiptDisplayName(raw: unknown): boolean {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return false;
  if (DISALLOWED_RECEIPT_NAMES.has(trimmed.toLowerCase())) return false;
  if (isEmailLike(trimmed)) return false;
  if (isEnglishOnlyName(trimmed)) return false;
  return true;
}

/**
 * Returns the explicit receiptName configured on the user's profile (trimmed, max 40 chars).
 */
export function getUserReceiptName(user?: IssuerUserLike | null): string {
  if (!user) return '';
  return sanitizeReceiptName(user.receiptName);
}

/**
 * Resolves the issuer name snapshot saved inside newly created vouchers.
 * Uses user.receiptName first; if empty, falls back to user.displayName (only if valid, non-email, non-English-only, non-placeholder).
 */
export function resolveNewVoucherIssuerName(user?: IssuerUserLike | null): string {
  if (!user) return '';
  const receiptName = sanitizeReceiptName(user.receiptName);
  if (receiptName && isValidReceiptDisplayName(receiptName)) {
    return receiptName;
  }
  const displayFallback = sanitizeReceiptName(user.displayName || user.name);
  if (displayFallback && isValidReceiptDisplayName(displayFallback)) {
    return displayFallback;
  }
  return '';
}

/**
 * Builds a lookup dictionary from app_users documents so legacy vouchers can resolve their issuer
 * by id, uid, username, or custom_{username}.
 */
export function buildUsersLookupMap(users: IssuerUserLike[]): Record<string, IssuerUserLike> {
  const map: Record<string, IssuerUserLike> = {};
  for (const u of users) {
    if (!u) continue;
    if (u.id) map[String(u.id)] = u;
    if (u.uid) map[String(u.uid)] = u;
    if (u.username) {
      const uname = String(u.username).trim();
      if (uname) {
        map[uname] = u;
        map[`custom_${uname}`] = u;
      }
    }
  }
  return map;
}

/**
 * Resolves the issuer name for display in UI tables/cards/logs.
 * - If voucher.issuedByName exists on the voucher, returns the frozen snapshot (never reading live user profile).
 * - For legacy vouchers without issuedByName, looks up the linked user in usersMap (without modifying Firestore),
 *   falling back to valid legacy userName if needed, or empty string if unavailable.
 */
export function resolveVoucherIssuerForUI(
  voucher?: VoucherLike | null,
  usersMap?: Record<string, IssuerUserLike>
): string {
  if (!voucher) return '';

  if (typeof voucher.issuedByName === 'string') {
    const frozen = voucher.issuedByName.trim();
    return isValidReceiptDisplayName(frozen) ? frozen : '';
  }

  const lookupUid = String(voucher.issuedByUid || voucher.userId || '').trim();
  if (lookupUid && lookupUid !== 'anonymous' && lookupUid !== 'guest' && usersMap) {
    const linkedUser = usersMap[lookupUid];
    if (linkedUser) {
      const resolvedFromUser = resolveNewVoucherIssuerName(linkedUser);
      if (resolvedFromUser) return resolvedFromUser;
    }
  }

  const legacyName = String(voucher.userName || voucher.delegateName || '').trim();
  return isValidReceiptDisplayName(legacyName) ? legacyName : '';
}

/**
 * Resolves the issuer name strictly for printed/PDF vouchers.
 * Never falls back to current logged-in user, localStorage, emails, English names, or hardcoded role titles.
 */
export function resolveVoucherIssuerForPrint(
  voucher?: VoucherLike | null,
  usersMap?: Record<string, IssuerUserLike>
): string {
  if (!voucher) return '';

  if (typeof voucher.issuedByName === 'string') {
    const frozen = voucher.issuedByName.trim();
    return isValidReceiptDisplayName(frozen) ? frozen : '';
  }

  if (typeof voucher.resolvedIssuerName === 'string') {
    const preResolved = voucher.resolvedIssuerName.trim();
    return isValidReceiptDisplayName(preResolved) ? preResolved : '';
  }

  const lookupUid = String(voucher.issuedByUid || voucher.userId || '').trim();
  if (lookupUid && lookupUid !== 'anonymous' && lookupUid !== 'guest' && usersMap) {
    const linkedUser = usersMap[lookupUid];
    if (linkedUser) {
      const resolvedFromUser = resolveNewVoucherIssuerName(linkedUser);
      if (resolvedFromUser) return resolvedFromUser;
    }
  }

  const legacyName = String(voucher.userName || '').trim();
  return isValidReceiptDisplayName(legacyName) ? legacyName : '';
}

/**
 * Computes an automatic font size in pt (from maxPt down to minPt = 10) for long single-line names
 * so the name stays on one line with white-space: nowrap and never truncates.
 */
export function getFittedReceiptFontSizePt(
  text: string,
  options: { maxPt?: number; minPt?: number; thresholdChars?: number; maxChars?: number } = {}
): number {
  const maxPt = options.maxPt ?? 11;
  const minPt = options.minPt ?? 10;
  const thresholdChars = options.thresholdChars ?? 18;
  const maxChars = options.maxChars ?? 36;

  const len = (text || '').trim().length;
  if (len <= thresholdChars) return maxPt;
  if (len >= maxChars) return minPt;

  const progress = (len - thresholdChars) / (maxChars - thresholdChars);
  return Number((maxPt - progress * (maxPt - minPt)).toFixed(2));
}
