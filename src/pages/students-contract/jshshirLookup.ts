import { API } from '@/api/api';
import { registerDataCache } from '@/utils/dataSync';
import { formatPhone } from '@/utils/phone';

/**
 * Shartnoma formalarida JSHSHR (pinfl) bo'yicha odamni bazadan topib, uning
 * mavjud ma'lumotlarini qaytaradi — forma inputlarini avtomatik to'ldirish
 * uchun.
 *
 * Manba — backend `GET /jshshir-lookup?jshshir=…`: BITTA odam (xodim → oldingi shartnomadagi o'quvchi/vakil →
 * foydalanuvchi). Ilgari bu yerda butun `/employees`, `/options/users`, `/students` va `/student-contracts`
 * ro'yxatlari yuklanib, ichidan qidirilardi — natijada hamma odamning pasporti va manzili brauzerga kelardi;
 * endi ro'yxat javoblarida hujjat maydonlari yo'q.
 * Har bir JSHSHR uchun natija `resultCache` da eslanadi — bir xil raqamni qayta yozganda so'rov ketmaydi.
 */

const digitsOnly = (v: unknown): string => String(v ?? '').replace(/\D/g, '');

const toDateInput = (d: unknown): string => {
  const s = String(d ?? '');
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(
    dt.getDate(),
  ).padStart(2, '0')}`;
};

export interface PersonMatch {
  source: 'employee' | 'student' | 'contract-student' | 'contract-rep' | 'user';
  displayName: string;
  last_name?: string;
  first_name?: string;
  father_name?: string;
  birth_date?: string;
  birth_place?: string;
  passport_series?: string;
  passport_number?: string;
  passport_given_date?: string;
  passport_expiry_date?: string;
  passport_given_by?: string;
  birth_cert_series?: string;
  birth_cert_number?: string;
  birth_cert_given_date?: string;
  birth_cert_expiry_date?: string;
  citizenship?: string;
  country?: string;
  language?: string;
  residential_address?: string;
  registered_address?: string;
  branch_id?: string;
  department_id?: string;
  phones?: string[];
  /** Faqat `source === 'employee'`: mavjud xodim id'si (shartnoma shu xodimga qo'shiladi). */
  employee_id?: number;
}

const str = (v: unknown): string | undefined => {
  const s = v == null ? '' : String(v).trim();
  return s === '' ? undefined : s;
};

function mapPerson(o: Record<string, unknown>, source: PersonMatch['source']): PersonMatch {
  const last = str(o.last_name);
  const first = str(o.first_name);
  const father = str(o.father_name) ?? str(o.middle_name);
  const displayName =
    [last, first, father].filter(Boolean).join(' ') || str(o.full_name) || str(o.label) || '';

  const rawPhones = [
    o.phone,
    ...((o.extra_phones as unknown[]) ?? []),
    ...((o.phones as unknown[]) ?? []),
  ]
    .filter((p) => p != null && String(p).trim() !== '')
    .map((p) => formatPhone(String(p)));
  const phones = [...new Set(rawPhones)];

  return {
    source,
    displayName,
    last_name: last,
    first_name: first,
    father_name: father,
    birth_date: toDateInput(o.birth_date) || undefined,
    birth_place: str(o.birth_place),
    passport_series: str(o.passport_series),
    passport_number: str(o.passport_number),
    passport_given_date: toDateInput(o.passport_given_date) || undefined,
    passport_expiry_date: toDateInput(o.passport_expiry_date) || undefined,
    passport_given_by: str(o.passport_given_by),
    birth_cert_series: str(o.birth_cert_series),
    birth_cert_number: str(o.birth_cert_number),
    birth_cert_given_date: toDateInput(o.birth_cert_given_date) || undefined,
    birth_cert_expiry_date: toDateInput(o.birth_cert_expiry_date) || undefined,
    citizenship: str(o.citizenship),
    country: str(o.country),
    language: str(o.language),
    residential_address:
      str(o.residential_address) ?? str(o.address_living) ?? str(o.address_current),
    registered_address:
      str(o.registered_address) ?? str(o.address_registration) ?? str(o.address_reg),
    branch_id: o.branch_id != null ? String(o.branch_id) : undefined,
    department_id: o.department_id != null ? String(o.department_id) : undefined,
    phones: phones.length ? phones : undefined,
    employee_id: source === 'employee' && o.id != null && Number(o.id) > 0 ? Number(o.id) : undefined,
  };
}

/** JSHSHR -> natija (yoki topilmadi = null). Bir marta olingach qayta so'ralmaydi. */
const resultCache = new Map<string, PersonMatch | null>();

// Ma'lumot o'zgarganda (yangi xodim/o'quvchi qo'shildi, tahrirlandi) eslab qolingan natijalar — jumladan
// "topilmadi" (null) — eskirib qoladi va F5 gacha yangi ma'lumotni ko'rsatmaydi: har yozuvdan keyin tozalanadi.
registerDataCache(() => resultCache.clear());

/** Xato toast'i chiqmasin: qidiruv — yordamchi funksiya, topilmasa forma oddiy qo'lda to'ldiriladi. */
const QUIET = { silentError: true, skip403Toast: true } as Record<string, unknown>;

interface JshshirLookupResponse {
  source?: 'employee' | 'contract-student' | 'contract-rep' | 'user' | null;
  person?: Record<string, unknown> | null;
}

function mapUser(person: Record<string, unknown>): PersonMatch {
  const fullName = str(person.full_name) ?? '';
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    source: 'user',
    displayName: fullName,
    last_name: parts[0] || undefined,
    first_name: parts[1] || undefined,
    father_name: parts[2] || undefined,
    phones: person.phone ? [formatPhone(String(person.phone))] : undefined,
  };
}

export async function lookupPersonByJshshir(jshshir: string): Promise<PersonMatch | null> {
  const digits = digitsOnly(jshshir);
  if (digits.length !== 14) return null;
  if (resultCache.has(digits)) return resultCache.get(digits) ?? null;

  let data: JshshirLookupResponse | undefined;
  try {
    data = (await API.get<JshshirLookupResponse>('/jshshir-lookup', { params: { jshshir: digits }, ...QUIET })).data;
  } catch {
    // Tarmoq/ruxsat xatosi — «topilmadi» deb eslab qolmaymiz (keyingi urinishda qayta so'raladi).
    return null;
  }

  const person = data?.person;
  const source = data?.source;
  const match = person && source ? (source === 'user' ? mapUser(person) : mapPerson(person, source)) : null;
  resultCache.set(digits, match);
  return match;
}

/**
 * Topilgan `PersonMatch` maydonlarini forma state'iga qo'llaydi. Faqat manba
 * qiymat BERGAN va `prev` da MAVJUD kalitlar. Forma turi bo'yicha kalit
 * farqlari (`father_name`↔`middle_name`, `residential_address`↔`address_current`,
 * `phones`↔`phone`) hisobga olinadi.
 */
export function applyPersonMatch<T extends object>(prev: T, m: PersonMatch): T {
  const rec = prev as unknown as Record<string, unknown>;
  const has = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';

  const candidates: Record<string, unknown> = {
    last_name: m.last_name,
    first_name: m.first_name,
    father_name: m.father_name,
    middle_name: m.father_name,
    birth_date: m.birth_date,
    birth_place: m.birth_place,
    passport_series: m.passport_series,
    passport_number: m.passport_number,
    passport_given_date: m.passport_given_date,
    passport_expiry_date: m.passport_expiry_date,
    passport_given_by: m.passport_given_by,
    birth_cert_series: m.birth_cert_series,
    birth_cert_number: m.birth_cert_number,
    birth_cert_given_date: m.birth_cert_given_date,
    birth_cert_expiry_date: m.birth_cert_expiry_date,
    citizenship: m.citizenship,
    country: m.country,
    language: m.language,
    residential_address: m.residential_address,
    registered_address: m.registered_address,
    address_current: m.residential_address,
    address_reg: m.registered_address,
  };

  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(candidates)) {
    if (k in rec && has(v)) patch[k] = v;
  }

  if (m.phones && m.phones.length) {
    if ('phones' in rec) patch.phones = m.phones;
    else if ('phone' in rec) patch.phone = m.phones[0];
  }

  if ('branch_id' in rec && has(m.branch_id)) {
    patch.branch_id = typeof rec.branch_id === 'number' ? Number(m.branch_id) : m.branch_id;
  }
  if ('department_id' in rec && has(m.department_id)) {
    patch.department_id =
      typeof rec.department_id === 'number' ? Number(m.department_id) : m.department_id;
  }

  return { ...prev, ...patch } as T;
}
