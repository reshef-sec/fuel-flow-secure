const PUBLIC_PREFIXES = ["/login", "/worker", "/voucher", "/v", "/training", "/__mockup", "/__component"];
export const isWorkerPublicPath = (path: string) =>
  path.startsWith("/v/") || path === "/voucher" || path.startsWith("/voucher/") || path === "/worker" || path.startsWith("/worker/");
export const isPublicPath = (path: string) =>
  PUBLIC_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}.`));