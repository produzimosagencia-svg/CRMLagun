/**
 * Format phone numbers:
 * - Remove country code "55" prefix
 * - Format as (DDD) XXXXX-XXXX or (DDD) XXXX-XXXX
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—';

  // Remove all non-digit characters
  let digits = phone.replace(/\D/g, '');

  // Remove country code "55" if present at the start and remaining length is 10 or 11
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  // Format: (DD) XXXXX-XXXX (11 digits) or (DD) XXXX-XXXX (10 digits)
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  // If format doesn't match, return cleaned version
  return phone;
}
