import { useQuery } from '@tanstack/react-query';
import { API, type SilentForbiddenConfig } from '@/api/api';
import { fetchOptions } from '@/api/options';
import { usePermission } from '@/hooks/usePermission';
import useAuthStore from '@/store/useAuthStore';
import { getBranchScope, scopeOptionItems } from '@/utils/branchScope';

/** Jamg'armadan pul yechishga ruxsat berilgan xodim. */
export interface Withdrawer {
  id: number;
  full_name?: string;
}

/**
 * Chiqim oynasi uchun jamg'arma.
 *
 * `cash_withdrawers` / `non_cash_withdrawers` — aynan shu ro'yxatlar
 * «ruxsat» ni bildiradi: xodim qaysi ro'yxatda bo'lsa, o'sha turdagi chiqimni
 * qila oladi. Admin panelidagi «Chiqim qiluvchilar» ustuni ham shu.
 */
export interface JamgarmaRow {
  id: number;
  label: string;
  branch_id?: number;
  /** Jamg'arma turi (oddiy / ish haqi / ijtimoiy soliq). Zaxira manbada (`/options/jamgarmas`) kelmasligi mumkin. */
  purpose?: 'operating' | 'payroll' | 'payroll_tax';
  /** Jamg'arma bo'limi (zararsiz nuqta / marjinal daromad / MD). Zaxira manbada kelmasligi mumkin. */
  jamgarma_fund_type?: 'harmless_point' | 'marginal_income' | 'adjusted_income' | null;
  withdrawableCash?: boolean;
  withdrawableNonCash?: boolean;
  is_active?: boolean;
  cash_balance?: number | string;
  non_cash_balance?: number | string;
  cash_withdrawers?: Withdrawer[];
  non_cash_withdrawers?: Withdrawer[];
}

interface RawJamgarma {
  id: number;
  name_uz?: string;
  name_ru?: string;
  name_en?: string;
  label?: string;
  branch_id?: number;
  purpose?: JamgarmaRow['purpose'];
  jamgarma_fund_type?: JamgarmaRow['jamgarma_fund_type'];
  is_active?: boolean;
  cash_balance?: number | string;
  non_cash_balance?: number | string;
  cash_withdrawers?: Withdrawer[];
  non_cash_withdrawers?: Withdrawer[];
}

function toRow(raw: RawJamgarma, lang: string): JamgarmaRow {
  const localized =
    raw[`name_${lang.slice(0, 2)}` as 'name_uz'] ?? raw.name_uz ?? raw.label ?? String(raw.id);

  return {
    id: raw.id,
    label: localized,
    branch_id: raw.branch_id,
    purpose: raw.purpose,
    jamgarma_fund_type: raw.jamgarma_fund_type,
    is_active: raw.is_active,
    cash_balance: raw.cash_balance,
    non_cash_balance: raw.non_cash_balance,
    cash_withdrawers: raw.cash_withdrawers,
    non_cash_withdrawers: raw.non_cash_withdrawers,
  };
}

/**
 * Jamg'armalar ro'yxati.
 *
 * Asosiy manba — `/jamgarmas`: balans va chiqim qiluvchilar faqat shu javobda
 * bor. `/options/jamgarmas` yengil ro'yxat bo'lib, unda na balans, na ruxsat
 * ro'yxati keladi — shuning uchun u faqat zaxira sifatida ishlatiladi
 * (xodimda `jamgarmas.view` ruxsati bo'lmasa). Zaxira holatda balans
 * ko'rsatilmaydi, lekin chiqim kiritish to'silib qolmaydi.
 */
export function useJamgarmas(lang: string) {
  // `/jamgarmas` — `jamgarmas.view` ruxsatini talab qiladi. Ruxsati yo'q foydalanuvchi (masalan kassir) uchun u
  // so'ralmaydi (har safar 403 va qizil xabar chiqmasin) — to'g'ridan-to'g'ri yengil `/options/jamgarmas`.
  const canView = usePermission('jamgarmas.view');
  // Filialga biriktirilgan foydalanuvchi faqat o'z filiallari jamg'armalarini ko'radi (`utils/branchScope.ts`).
  const user = useAuthStore((state) => state.user);
  const scope = getBranchScope(user);

  return useQuery<JamgarmaRow[]>({
    queryKey: ['expense-jamgarmas', 'withdrawable', user?.id, lang, canView, scope?.join(',') ?? 'all'],
    queryFn: async () => {
      // Fund is chosen first; each lookup determines its permitted payment kinds.
      const [cash, nonCash] = await Promise.all([
        fetchOptions('jamgarmas', { withdrawable: 'cash' }),
        fetchOptions('jamgarmas', { withdrawable: 'non_cash' }),
      ]);
      const cashIds = new Set(cash.map((o) => String(o.id)));
      const nonCashIds = new Set(nonCash.map((o) => String(o.id)));
      const allowed = [...new Map([...cash, ...nonCash].map((o) => [String(o.id), o])).values()];
      let rows: JamgarmaRow[];
      if (canView) {
        try {
          const config: SilentForbiddenConfig = { skip403Toast: true };
          const { data } = await API.get('/jamgarmas', config);
          const list: RawJamgarma[] = Array.isArray(data) ? data : (data?.data ?? []);
          rows = list.map((item) => toRow(item, lang));
        } catch {
          const options = allowed;
          rows = options.map((o) => toRow(o as RawJamgarma, lang));
        }
      } else {
        const options = allowed;
        rows = options.map((o) => toRow(o as RawJamgarma, lang));
      }
      const details = new Map(rows.map((row) => [String(row.id), row]));
      rows = allowed.map((o) => ({
        ...toRow(o as RawJamgarma, lang),
        ...details.get(String(o.id)),
        withdrawableCash: cashIds.has(String(o.id)),
        withdrawableNonCash: nonCashIds.has(String(o.id)),
      }));
      return scopeOptionItems('jamgarmas', rows, scope);
    },
    staleTime: 15 * 1000,
  });
}
