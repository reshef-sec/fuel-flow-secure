/** Publish an employee link only after both writes have completed successfully. */
export async function persistWorkerIssue(
  saveVouchers: () => PromiseLike<{ error: { message: string } | null }>,
  saveLink: () => PromiseLike<{ error: { message: string } | null }>,
) {
  const vouchers = await saveVouchers();
  if (vouchers.error) throw new Error(vouchers.error.message);
  const link = await saveLink();
  if (link.error) throw new Error(link.error.message);
}