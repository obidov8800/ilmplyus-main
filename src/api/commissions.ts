import { useQueries, useQuery } from '@tanstack/react-query';
import { fetchOptions, type Option } from './options';
import { normalizePaymentMethod } from '@/utils/paymentMethod';
import type { BranchCommission } from '@/types/payment.types';

/** Tanish to'lov turlarini shu tartibda ko'rsatamiz, notanishlari oxirida qoladi. */
export const METHOD_ORDER = ['cash', 'card', 'qr', 'transfer', 'click', 'payme', 'paynet', 'bank'];

/**
 * Xodim QO'LDA kirita oladigan to'lov turlari.
 *
 * Click / Payme / Paynet kabi onlayn turlar bu ro'yxatda yo'q: ular to'lov
 * shlyuzi orqali tizimga o'zi tushadi, qo'lda kiritilmaydi. Filtrlash va
 * hisobotlarda esa ular baribir ko'rinadi — bu cheklov faqat kiritish
 * formasiga tegishli.
 */
export const MANUAL_ENTRY_METHODS = ['cash', 'card', 'bank'];

export function compareMethods(a: string, b: string): number {
  const ai = METHOD_ORDER.indexOf(a);
  const bi = METHOD_ORDER.indexOf(b);
  return (ai === -1 ? METHOD_ORDER.length : ai) - (bi === -1 ? METHOD_ORDER.length : bi);
}

/** `expired_date` o'tib ketgan yoki o'chirilgan turlarni ko'rsatmaymiz. */
export function isUsableCommission(c: BranchCommission): boolean {
  if (!c.is_active || c.deleted_at) return false;
  if (c.expired_date && new Date(c.expired_date).getTime() < Date.now()) return false;
  return true;
}

export function commissionsQueryKey(branchId: number) {
  return ['branch-commissions', branchId] as const;
}

/**
 * `/options/payment-gateway-commissions` javobini `BranchCommission` ko'rinishiga
 * keltiradi.
 *
 * Options ro'yxatlari `{ id, label, ...ustunlar }` shaklida keladi, ya'ni to'lov
 * turi `payment_method` da ham, `label` da ham bo'lishi mumkin. `label` ko'rsatuv
 * matni bo'lsa ("Naqd"), `normalizePaymentMethod` uni `cash` kalitiga keltiradi —
 * saqlashda va tarjimada aynan shu kalit ishlatiladi.
 *
 * Options manbasida `is_active` / `expired_date` bo'lmasligi mumkin: bunday
 * yozuvlar ishlatilishi mumkin deb qabul qilinadi (backend allaqachon faqat
 * amaldagilarini qaytaradi).
 */
function optionToCommission(option: Option, branchId: number): BranchCommission {
  const raw = option as Option & {
    payment_method?: string;
    is_active?: boolean;
    deleted_at?: string | null;
    effective_date?: string | null;
    expired_date?: string | null;
  };

  return {
    id: option.id,
    branch_id: raw.branch_id ?? branchId,
    payment_method: normalizePaymentMethod(raw.payment_method ?? option.label),
    commission_percent: option.commission_percent ?? 0,
    effective_date: raw.effective_date ?? null,
    expired_date: raw.expired_date ?? null,
    is_active: raw.is_active ?? true,
    deleted_at: raw.deleted_at ?? null,
  };
}

/**
 * Filialning to'lov turlari — `/options/payment-gateway-commissions`.
 *
 * Nega `/branches/{id}/commissions` emas: u alohida ruxsat talab qiladi va ko'p
 * xodimda 403 qaytaradi. Natijada to'lov formasida «Bu filial uchun to'lov turi
 * topilmadi» chiqib, to'lov umuman kiritib bo'lmasdi. Options ro'yxatlari esa
 * faqat `lookups.view` talab qiladi, shuning uchun hamma xodimda ishlaydi.
 *
 * Filial bo'yicha filtr ikki qavat: serverga `branch_id` yuboriladi, va agar
 * javobda `branch_id` bo'lsa mahalliy ravishda ham tekshiriladi. Param e'tiborsiz
 * qolsa ham begona filialning turlari o'tib ketmaydi.
 */
export async function fetchBranchCommissions(branchId: number): Promise<BranchCommission[]> {
  const options = await fetchOptions('payment-gateway-commissions', { branch_id: branchId });

  return options
    .filter((o) => o.branch_id == null || o.branch_id === branchId)
    .map((o) => optionToCommission(o, branchId))
    .filter((c) => c.payment_method !== '');
}

const STALE_TIME = 5 * 60 * 1000;

/** Bitta filialning to'lov turlari. */
export function useBranchCommissions(branchId: number | null | undefined, enabled = true) {
  return useQuery<BranchCommission[]>({
    queryKey: commissionsQueryKey(branchId as number),
    queryFn: () => fetchBranchCommissions(branchId as number),
    enabled: enabled && !!branchId,
    staleTime: STALE_TIME,
  });
}

/** Bir nechta filialning to'lov turlari — filtrda bir vaqtda bir necha filial tanlanishi mumkin. */
export function useBranchesCommissions(branchIds: number[]) {
  return useQueries({
    queries: branchIds.map((id) => ({
      queryKey: commissionsQueryKey(id),
      queryFn: () => fetchBranchCommissions(id),
      staleTime: STALE_TIME,
    })),
    combine: (results) => ({
      isLoading: results.some((r) => r.isLoading),
      data: results.flatMap((r) => r.data ?? []),
    }),
  });
}
