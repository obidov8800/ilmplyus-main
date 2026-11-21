import { useQuery } from '@tanstack/react-query';
import { fetchOptions, type Option } from './options';
import { normalizePaymentMethod } from '@/utils/paymentMethod';
import type { PaymentGatewayCommission } from '@/types/payment.types';

/** Tanish to'lov turlarini shu tartibda ko'rsatamiz, notanishlari oxirida qoladi. */
export const METHOD_ORDER = ['cash', 'card', 'qr', 'transfer', 'click', 'payme', 'paynet', 'bank'];

/**
 * Backenddagi asosiy to'lov usullari. Filtrda ular doim ko'rinadi — usul keyinroq
 * nofaol qilinsa ham, o'sha usuldagi eski to'lovlarni topish mumkin bo'lsin
 * (options ro'yxati faqat faol usullarni qaytaradi).
 */
export const KNOWN_METHODS = ['cash', 'card', 'bank', 'click', 'paynet'];

export function compareMethods(a: string, b: string): number {
  const ai = METHOD_ORDER.indexOf(a);
  const bi = METHOD_ORDER.indexOf(b);
  return (ai === -1 ? METHOD_ORDER.length : ai) - (bi === -1 ? METHOD_ORDER.length : bi);
}

export const COMMISSIONS_QUERY_KEY = ['payment-gateway-commissions'] as const;

/** Backend `show_on_site` ni 1/0 ustun sifatida saqlaydi — son, matn yoki boolean bo'lib kelishi mumkin. */
const toBool = (value: unknown) => value === true || value === 1 || value === '1' || value === 'true';

/**
 * `/options/payment-gateway-commissions` javobini `PaymentGatewayCommission` ko'rinishiga
 * keltiradi.
 *
 * Javob `{ id, label, commission_percent, show_on_site }` shaklida keladi — to'lov
 * usulining kaliti `label` da (`payment_method` maydoni yo'q). `normalizePaymentMethod`
 * eski matnli qiymatlarni ("Naqd") ham `cash` kalitiga keltiradi — saqlashda va
 * tarjimada aynan shu kalit ishlatiladi.
 */
function optionToCommission(option: Option): PaymentGatewayCommission {
  const raw = option as Option & { payment_method?: string; show_on_site?: unknown };

  return {
    id: option.id,
    payment_method: normalizePaymentMethod(raw.payment_method ?? option.label),
    commission_percent: option.commission_percent ?? 0,
    show_on_site: raw.show_on_site == null ? undefined : toBool(raw.show_on_site),
  };
}

interface CommissionsQuery {
  /**
   * `true` — faqat «Saytda ko'rinsin» belgilangan usullar (console → Komissiyalar).
   * Xodimning to'lov formasida aynan shular chiqadi.
   */
  showOnSite?: boolean;
}

/**
 * To'lov usullari — `/options/payment-gateway-commissions`.
 *
 * 2026-11-20 dan komissiya barcha filiallar uchun UMUMIY: filial bo'yicha so'rash
 * shart emas (`branch_id` yuborilsa ham e'tiborga olinmaydi).
 *
 * Nega `/payment-gateway-commissions` emas: u `payment_gateway_commissions.view`
 * ruxsatini talab qiladi va ko'p xodimda 403 qaytaradi. Options ro'yxati esa
 * faqat `lookups.view` talab qiladi, shuning uchun hamma xodimda ishlaydi.
 *
 * Backend bu yerda FAQAT FAOL usullarni qaytaradi (`is_active = true` majburiy
 * filtr) — kelgan har bir usul ishlatilishi mumkin, qayta tekshirish shart emas.
 */
export async function fetchCommissions({ showOnSite }: CommissionsQuery = {}): Promise<
  PaymentGatewayCommission[]
> {
  const options = await fetchOptions(
    'payment-gateway-commissions',
    showOnSite ? { show_on_site: 1 } : undefined,
  );
  return (
    options
      .map(optionToCommission)
      .filter((c) => c.payment_method !== '')
      // Server filtri asosiy; javobda maydon kelsa, mahalliy ham tekshiramiz.
      .filter((c) => !showOnSite || c.show_on_site !== false)
  );
}

/**
 * Qisqa: komissiya sozlamasi console'da o'zgartirilsa (masalan «Saytda ko'rinsin»
 * yoqilsa), xodimning to'lov formasi uni tez ko'rsin — boshqa options ro'yxatlari
 * bilan bir xil.
 */
const STALE_TIME = 15 * 1000;

/** Faol to'lov usullari va ularning komissiyalari (barcha filiallar uchun bir xil). */
export function useCommissions({ enabled = true, showOnSite = false } = {}) {
  return useQuery<PaymentGatewayCommission[]>({
    queryKey: [...COMMISSIONS_QUERY_KEY, showOnSite ? 'site' : 'all'],
    queryFn: () => fetchCommissions({ showOnSite }),
    enabled,
    staleTime: STALE_TIME,
  });
}
