export interface PaymentFilters {
  branch: number | null;
  group: number | null;
  /** `payment_method` kaliti: `cash`, `card`, `click`, ... */
  method: string;
  /** To'lovni qabul qilgan xodim (`cashier.id` / `user_id`). */
  cashier: number | null;
  /** `YYYY-MM-DD` */
  date: string;
}

export const EMPTY_PAYMENT_FILTERS: PaymentFilters = {
  branch: null,
  group: null,
  method: '',
  cashier: null,
  date: '',
};

/**
 * Filtr holatini backend kutayotgan query paramlarga o'giradi.
 * Bo'sh qiymatlarni `useTableQuery` o'zi tashlab yuboradi.
 *
 * Param nomlari backend bilan kelishilgan bo'lishi shart — mos kelmasa Laravel
 * ularni jimgina e'tiborsiz qoldiradi va filtr ishlamay qo'yadi.
 */
export function paymentFiltersToParams(f: PaymentFilters): Record<string, unknown> {
  return {
    branch_id: f.branch,
    group_id: f.group,
    payment_method: f.method,
    cashier_id: f.cashier,
    date: f.date,
  };
}

export function countPaymentFilters(f: PaymentFilters): number {
  return (
    (f.branch ? 1 : 0) +
    (f.group ? 1 : 0) +
    (f.method ? 1 : 0) +
    (f.cashier ? 1 : 0) +
    (f.date ? 1 : 0)
  );
}
