import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { AxiosRequestConfig } from 'axios';
import { API } from './api';
import { getLocalized } from '@/utils/getLocalized';
import useAuthStore from '@/store/useAuthStore';
import { getBranchScope, scopeOptionItems } from '@/utils/branchScope';

/**
 * Forma dropdownlari uchun yengil ro'yxatlar: GET /api/options/{entity}
 * Bo'limning o'z `*.view` ruxsati emas, faqat `lookups.view` talab qilinadi.
 */
export type OptionEntity =
  | 'branches'
  | 'courses'
  | 'levels'
  | 'rooms'
  | 'groups'
  | 'academic_years'
  | 'students'
  | 'employees'
  | 'teachers'
  | 'users'
  | 'departments'
  | 'positions'
  | 'sources'
  | 'rejection-reasons'
  | 'regions'
  | 'districts'
  | 'jamgarmas'
  | 'chart-of-accounts'
  | 'expense-categories'
  | 'expense-subcategories'
  | 'payment-gateway-commissions'
  | 'roles'
  /** stage15 (B4): jarima turlari, testlar, ruxsatlar ro'yxati — `lookups.view` bilan. */
  | 'fine-types'
  | 'tests'
  | 'permissions';

/**
 * Ichma-ich kelgan element (masalan `courses[].levels[]`). Backend uni `label` bilan ham,
 * ko'p tilli `name_uz` / `name_ru` ustunlari bilan ham qaytarishi mumkin — `optionLabel()`
 * ikkalasini ham qo'llab-quvvatlaydi.
 */
export interface NestedOption {
  id: number;
  label?: string;
  name?: string | null;
  name_uz?: string | null;
  name_ru?: string | null;
  name_en?: string | null;
}

/**
 * Ro'yxat elementining ko'rsatiladigan nomi.
 * `label` bo'lsa o'sha, aks holda joriy tildagi `name_*` ustuni.
 *
 * DIQQAT: to'g'ridan-to'g'ri `getLocalized(option, 'name', lang)` chaqirmang —
 * u `any` qabul qiladi, `label` ni tanimaydi va jimgina `"-"` qaytaradi.
 */
export function optionLabel(item: NestedOption | null | undefined, lang: string): string {
  if (!item) return '-';
  if (item.label) return item.label;
  return getLocalized(item, 'name', lang);
}

const FLOOR_SUFFIX: Record<string, (floor: number) => string> = {
  uz: (floor) => `${floor}-qavat`,
  ru: (floor) => `${floor} этаж`,
  en: (floor) => `floor ${floor}`,
};

/**
 * Xona ro'yxatlari uchun: `"208 · 2-qavat"`. Faqat raqamdan qaysi qavat ekani
 * bilinmagani uchun `floor` bo'lsa u ham qo'shiladi.
 */
export function roomOptionLabel(room: Option | null | undefined, lang: string): string {
  if (!room) return '-';
  const name = room.label || String(room.id);
  if (room.floor == null) return name;
  const suffix = (FLOOR_SUFFIX[lang.slice(0, 2)] ?? FLOOR_SUFFIX.uz)(room.floor);
  return `${name} · ${suffix}`;
}

/** `id` va `label` har doim bo'ladi, qolgani entity'ning "extra" ustunlari. */
export interface Option {
  id: number;
  label: string;

  /** employees/teachers — xodim faol shartnomasi bor filiallar (asosiy filial bilan). */
  contract_branch_ids?: number[];

  /** courses — daraja selecti uchun ichki ro'yxat. */
  levels?: NestedOption[];

  /**
   * courses — kurs tegishli bo'lgan filiallar. DIQQAT: bu massiv, ya'ni bitta kurs
   * bir necha filialga tegishli bo'lishi mumkin va kursda `branch_id` YO'Q.
   * Kursni filialga qarab filtrlash serverda bajariladi: `/options/courses?branch_id=...`
   */
  branches?: NestedOption[];

  /** students — o'quvchi a'zo bo'lgan guruhlar. */
  groups?: NestedOption[];

  /**
   * students — o'quvchining kurslari. Har biri `group_id` bilan keladi, ya'ni
   * kursni guruh bo'yicha topish mumkin: `courses.find(c => c.group_id === groupId)`.
   */
  courses?: (NestedOption & { group_id?: number })[];

  // ── Bog'lovchi id'lar ──
  /** DIQQAT: `courses` da bu maydon yo'q — yuqoridagi `branches[]` ga qarang. */
  branch_id?: number;
  course_id?: number;
  level_id?: number;
  teacher_id?: number;
  room_id?: number;
  region_id?: number;
  district_id?: number;
  department_id?: number;
  position_id?: number;
  expense_category_id?: number;
  chart_of_accounts_id?: number;
  /** jamgarmas — jamg'arma bo'limi: «Yangi oy rejasi» oynasi qatorlarni shu bo'yicha tablarga ajratadi. */
  jamgarma_fund_type?: 'harmless_point' | 'marginal_income' | 'adjusted_income' | null;
  /** jamgarmas — jamg'arma turi (oddiy / ish haqi / ijtimoiy soliq). */
  purpose?: 'operating' | 'payroll' | 'payroll_tax';
  /** jamgarmas — nomi (`jamgarma_names`) ga bog'lanishi; eski jamg'armada `null`. */
  jamgarma_name_id?: number | null;

  // ── Yassi ustunlar ──
  /**
   * branches — bitta kod. students — o'quvchi tegishli bo'lgan filial kodlari
   * massivi (`["0101"]`), ya'ni bir nechta bo'lishi mumkin.
   */
  branch_code?: string | string[];
  student_code?: string;
  username?: string;
  account_type?: string;
  balance?: number | string;
  capacity?: number;
  floor?: number;
  commission_percent?: number | string;
  /** fine-types — jarima summasi. */
  amount?: number | string;

  /** users / employees — operator↔xodim bog'lanishi va JSHSHIR autofill uchun. */
  pinfl?: string;

  /**
   * users — foydalanuvchi rollari. DIQQAT: bu yerda rol nomi `label` da keladi
   * (`{ id: 3, label: 'operator' }`), `/users` dagidek `name` da emas.
   */
  roles?: NestedOption[];
  /** users — shartnoma formalarida vakil telefonini avtomatik to'ldirish uchun. */
  phone?: string | null;
  /** groups — guruh tanlanganda kurs sanalarini avtomatik to'ldirish uchun. */
  start_date?: string | null;
  end_date?: string | null;
  /** branches — filial tanlanganda shahar maydonini to'ldirish uchun. */
  city?: string;
  /**
   * branches — filial turi (`standard` | `preschool`). Filtr: `useOptions('branches', { type: 'preschool' })`.
   * Hozircha tanlovlar turga qarab o'zgarmaydi (tur farqlari keyingi bosqichda).
   */
  type?: 'standard' | 'preschool';
  /** groups — preschool filial guruhining o'quv yili (oddiy filialda `null`). Filtr: `{ academic_year_id }`. */
  academic_year_id?: number | null;
  /** students — to'lov formasida ko'rsatiladi. */
  last_payment_date?: string | null;

  // ── chart-of-accounts / jamgarmas ──
  status?: string;
  account_number?: string;
  cash_balance?: number | string;
  non_cash_balance?: number | string;
}

export type OptionParams = Record<string, string | number | boolean | null | undefined>;

/** Bo'sh (undefined/null/'') parametrlarni tashlab yuboradi. */
function cleanParams(params?: OptionParams): OptionParams {
  if (!params) return {};
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  );
}

export function optionsQueryKey(entity: OptionEntity, params?: OptionParams) {
  return ['options', entity, cleanParams(params)] as const;
}

export async function fetchOptions(
  entity: OptionEntity,
  params?: OptionParams,
  config?: AxiosRequestConfig & { skip403Toast?: boolean; silentError?: boolean },
): Promise<Option[]> {
  const { data } = await API.get(`/options/${entity}`, { ...config, params: cleanParams(params) });
  if (Array.isArray(data)) return data;
  return Array.isArray(data?.data) ? data.data : [];
}

type UseOptionsExtra = Omit<UseQueryOptions<Option[], Error>, 'queryKey' | 'queryFn'>;

export function useOptions(entity: OptionEntity, params?: OptionParams, options?: UseOptionsExtra) {
  // Filial biriktirilgan foydalanuvchi (masalan kassir) faqat o'z filiallarini va ularning o'quvchi/guruhlarini
  // ko'radi. Kesh umumiy qoladi — cheklov `select` da, shuning uchun /me keyin kelsa ham darhol qo'llanadi.
  const user = useAuthStore((state) => state.user);
  const branchScope = getBranchScope(user);

  return useQuery<Option[], Error>({
    queryKey: optionsQueryKey(entity, params),
    queryFn: () => fetchOptions(entity, params),
    staleTime: 15 * 1000,
    select: branchScope ? (items) => scopeOptionItems(entity, items, branchScope) : undefined,
    ...options,
  });
}

/** Mantine `<Select data={...} />` uchun. */
export function toSelectData(options: Option[] | undefined) {
  return (options ?? []).map((o) => ({ value: String(o.id), label: o.label }));
}
