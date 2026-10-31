type DisplayProfile = { full_name?: string | null; phone?: string | null; role?: string | null };

export function cleanUserName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return /^(text|test|placeholder|undefined|null)(\s+(text|test|placeholder|undefined|null))*$/i.test(name) ? "" : name;
}

/** Display only: permissions continue to use the authenticated account and DB roles. */
export function userDisplayName(profile: DisplayProfile | null | undefined): string {
  return cleanUserName(profile?.full_name) || profile?.phone?.trim()
    || ({ admin: "אדמין", branch: "מנהל סניף", supervisor: "מפקח" }[profile?.role ?? ""] ?? "משתמש");
}