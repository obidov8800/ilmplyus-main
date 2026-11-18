export interface CategoryAssignment {
  jamgarmas?: { id: number | string }[];
  jamgarma_ids?: (number | string)[];
}

export function hasCategoryAssignment(category: CategoryAssignment): boolean {
  return Array.isArray(category.jamgarmas) || Array.isArray(category.jamgarma_ids);
}

export function categoryBelongsToFund(category: CategoryAssignment, fundId: string): boolean {
  if (!fundId) return false;
  if (Array.isArray(category.jamgarmas)) {
    return category.jamgarmas.some((fund) => String(fund.id) === fundId);
  }
  return Array.isArray(category.jamgarma_ids) && category.jamgarma_ids.some((id) => String(id) === fundId);
}
