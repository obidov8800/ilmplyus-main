import type { JamgarmaRow } from './jamgarma.service';

/**
 * Jamg'armadan chiqim qaysi yo'l bilan qilinishi.
 *
 * «Ruxsat» — jamg'armaning **chiqim qiluvchilar** ro'yxati: xodim
 * `cash_withdrawers` da bo'lsa naqd, `non_cash_withdrawers` da bo'lsa naqdsiz
 * chiqim qila oladi. Admin panelidagi «Chiqim qiluvchilar» ustuni shuni
 * ko'rsatadi (masalan «Abdullayev A.Naqd» — faqat naqd).
 *
 * Ruxsatli yo'l(lar) formada ko'rinadi. Ikkala yo'l ochiq bo'lsa foydalanuvchi
 * tanlaydi; bittasi ochiq bo'lsa, faqat o'sha yo'l ko'rinadi va avtomatik ishlatiladi.
 */

/** Chiqim qaysi pul turidan yechilishi. */
export type PaymentKind = 'cash' | 'non_cash';

/** Raqamga keltiradi — backend balansni satr sifatida ham qaytarishi mumkin. */
export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface JamgarmaPaymentInfo {
  /** Ruxsat ro'yxati umuman kelganmi. Kelmasa hech narsa taxmin qilinmaydi. */
  known: boolean;
  allowsCash: boolean;
  allowsNonCash: boolean;
  /** Ikkala yo'l ochiq bo'lsa foydalanuvchi tanlov qilishi kerak. */
  needsChoice: boolean;
  /** Bitta yo'l ochiq bo'lsa — o'sha, aks holda `null`. */
  onlyKind: PaymentKind | null;
  cashBalance: number;
  nonCashBalance: number;
  /** Balans ma'lumoti kelganmi. */
  hasBalanceData: boolean;
}

const UNKNOWN: JamgarmaPaymentInfo = {
  known: false,
  allowsCash: false,
  allowsNonCash: false,
  needsChoice: false,
  onlyKind: null,
  cashBalance: 0,
  nonCashBalance: 0,
  hasBalanceData: false,
};

/**
 * Tanlangan jamg'arma va joriy xodim bo'yicha ruxsat hamda balansni hisoblaydi.
 *
 * Jamg'arma tanlanmagan yoki ruxsat ro'yxati kelmagan bo'lsa `known: false`
 * qaytadi — bunday holatda interfeys hech qanday tanlov ko'rsatmaydi va
 * so'rovda chiqim yo'li yuborilmaydi, qarorni backend beradi. Bu «bilmasak
 * ham tanlov chiqarib qo'yish» dan xavfsizroq: noto'g'ri yo'l tanlanib
 * qolmaydi.
 */
export function readJamgarmaPayment(
  jamgarma: JamgarmaRow | undefined,
  userId: number | undefined,
): JamgarmaPaymentInfo {
  if (!jamgarma) return UNKNOWN;

  const cashBalance = toNumber(jamgarma.cash_balance);
  const nonCashBalance = toNumber(jamgarma.non_cash_balance);
  const hasBalanceData = jamgarma.cash_balance != null || jamgarma.non_cash_balance != null;

  const cashList = jamgarma.cash_withdrawers;
  const nonCashList = jamgarma.non_cash_withdrawers;
  const hasLookupPermissions = typeof jamgarma.withdrawableCash === 'boolean' && typeof jamgarma.withdrawableNonCash === 'boolean';
  const hasWithdrawerData = Array.isArray(cashList) || Array.isArray(nonCashList);

  /*
   * Ruxsat ro'yxati kelmagan (masalan `/jamgarmas` 403 bergan) holat.
   *
   * Bunda tanlov ko'rsatiladi: backend chiqim summasini `cash_amount` yoki
   * `non_cash_amount` sifatida kutadi, ya'ni yo'lni bilmasdan so'rov ham
   * tuzib bo'lmaydi. Foydalanuvchi tanlaydi, ruxsatni backend tekshiradi.
   */
  if (!hasLookupPermissions && (!hasWithdrawerData || userId == null)) {
    return {
      known: false,
      allowsCash: true,
      allowsNonCash: true,
      needsChoice: true,
      onlyKind: null,
      cashBalance,
      nonCashBalance,
      hasBalanceData,
    };
  }

  const allowsCash = jamgarma.withdrawableCash ?? (cashList ?? []).some((w) => w.id === userId);
  const allowsNonCash = jamgarma.withdrawableNonCash ?? (nonCashList ?? []).some((w) => w.id === userId);

  return {
    known: true,
    allowsCash,
    allowsNonCash,
    needsChoice: allowsCash && allowsNonCash,
    onlyKind: allowsCash && allowsNonCash ? null : allowsCash ? 'cash' : allowsNonCash ? 'non_cash' : null,
    cashBalance,
    nonCashBalance,
    hasBalanceData,
  };
}
