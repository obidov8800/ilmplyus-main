/**
 * Filial turi (`branches.type`): oddiy filial yoki maktabga tayyorlov filiali.
 *
 * Hozircha tur faqat saqlanadi va ko'rsatiladi — tizim ishlashi o'zgarmagan. Tur farqlari (shartnoma,
 * davomat) keyingi bosqichda qo'shiladi, shu sabab tur bilan bog'liq hamma tekshiruv shu yerdan o'tadi.
 * Eski javoblarda `type` bo'lmasa — `standard`.
 */
export const BRANCH_TYPES = ['standard', 'preschool'] as const;

export type BranchType = (typeof BRANCH_TYPES)[number];

export const DEFAULT_BRANCH_TYPE: BranchType = 'standard';

export const normalizeBranchType = (value: unknown): BranchType =>
  value === 'preschool' ? 'preschool' : DEFAULT_BRANCH_TYPE;

/** Maktabga tayyorlov filialimi. `type` yo'q bo'lsa — yo'q. */
export const isPreschoolBranch = (branch: { type?: unknown } | null | undefined): boolean =>
  normalizeBranchType(branch?.type) === 'preschool';

/** i18n kaliti: `branches.types.standard` / `branches.types.preschool`. */
export const branchTypeLabelKey = (value: unknown) => `branches.types.${normalizeBranchType(value)}`;
