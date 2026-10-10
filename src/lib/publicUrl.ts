/** Public base for employee links. Preview domains require a Lovable login, so always share the published site. */
export const PUBLIC_APP_ORIGIN = "https://fuel-flow-secure.lovable.app";
export const publicVoucherUrl = (id: string) => `${PUBLIC_APP_ORIGIN}/voucher/${id}`;
