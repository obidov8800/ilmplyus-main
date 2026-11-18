/**
 * Jamg'arma nomi filial bilan: bir xil nomli jamg'arma har filialda bor ("Markaziy ofis jamg'armasi" × 7),
 * filial ko'rsatilmasa ro'yxatda ularni bir-biridan ajratib bo'lmaydi.
 */
export function jamgarmaLabelWithBranch(
  label: string,
  branchId: number | string | null | undefined,
  branches: { id: number; label: string }[] | undefined,
): string {
  if (branchId === null || branchId === undefined || branchId === '') return label;
  const branch = branches?.find((b) => String(b.id) === String(branchId))?.label;
  return branch ? `${label} — ${branch}` : label;
}
