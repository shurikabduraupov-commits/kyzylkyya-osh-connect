/** Kyrgyz mobile: +996 plus exactly 9 national digits (13 characters total). */
export const KG_MOBILE_PREFIX = "+996" as const;

const NATIONAL_DIGITS = 9;

/** True if value is exactly `+996` followed by 9 digits. */
export function isValidKg996Phone(value: string): boolean {
  return /^\+996\d{9}$/.test(value.trim());
}

/**
 * Builds canonical phone from user input: strips non-digits, takes up to 9 digits
 * after optional leading 996, prefixes +996.
 */
export function normalizePassengerPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("996")) {
    digits = digits.slice(3);
  }
  digits = digits.slice(0, NATIONAL_DIGITS);
  return `${KG_MOBILE_PREFIX}${digits}`;
}

/** Digits only after +996 (0–9 characters) for display in the suffix field. */
export function kg996Suffix(full: string): string {
  const v = full.trim();
  if (!v.startsWith(KG_MOBILE_PREFIX)) return "";
  const rest = v.slice(KG_MOBILE_PREFIX.length).replace(/\D/g, "");
  return rest.slice(0, NATIONAL_DIGITS);
}
