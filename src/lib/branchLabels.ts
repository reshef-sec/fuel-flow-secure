/** Presentation aliases only: never rewrite stored branch values or transfer targets. */
export const CENTRAL_POOL_LABEL = "מאגר מרכזי";

export function branchLabel(branch: string | null | undefined): string {
  const label = (branch ?? "").trim().replace(/^סניף\s+/, "").replace(/(?:\s*\([^)]*\))+\s*$/, "").trim();
  return !label || label === "מאגר ראשי" || label === CENTRAL_POOL_LABEL ? CENTRAL_POOL_LABEL : label;
}

export function assignmentLabel(branch: string, supervisor?: string): string {
  const embedded = /\(([^()]*)\)/.exec(branch)?.[1]?.trim();
  const name = supervisor?.trim() || embedded;
  const label = branchLabel(branch);
  return name ? `${label} (${name})` : label;
}

/** Group display-equivalent options but retain every original value for filtering. */
export function branchOptions(branches: string[]) {
  const groups = new Map<string, string[]>();
  for (const value of branches) {
    if (!value.trim()) continue;
    const label = branchLabel(value);
    const values = groups.get(label) ?? [];
    if (!values.includes(value)) values.push(value);
    groups.set(label, values);
  }
  return [...groups].map(([label, values]) => ({ label, values }));
}