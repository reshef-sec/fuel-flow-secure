/** Normalizes an Israeli mobile number to digits only (e.g. 0501234567). */
export function normalizePhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("972")) digits = `0${digits.slice(3)}`;
  return digits;
}

/** Internal login identifier derived from the phone. Never shown to users. */
export function phoneToLoginEmail(phone: string) {
  return `p${normalizePhone(phone)}@login.reshef-fuel.app`;
}
