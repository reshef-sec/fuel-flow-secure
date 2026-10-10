/** Published site used for employee links when staff are inside the editor preview (preview requires a Lovable login). */
export const PUBLIC_APP_ORIGIN = "https://delekcards.lovable.app";

/** Real site address when staff use the published app or a custom domain; published address otherwise. */
function origin() {
  if (typeof window === "undefined") return PUBLIC_APP_ORIGIN;
  const { origin, hostname } = window.location;
  const isPreview = hostname.startsWith("id-preview--") || hostname.includes("lovableproject.com") || hostname === "localhost";
  return isPreview ? PUBLIC_APP_ORIGIN : origin;
}

export const publicVoucherUrl = (id: string) => `${origin()}/voucher/${id}`;
