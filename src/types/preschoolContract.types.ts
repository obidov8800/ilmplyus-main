/*
 * Maktabga tayyorlov (`branches.type = preschool`) shartnomasi.
 * Admin va User ilovalarida bir xil fayl.
 *
 * Shartnoma turi `preschool` — mavjud `/student-contracts` endpointi (backend: `StudentContractController`).
 * Forma kurs shartnomasining «Vakil bilan» (voyaga yetmagan) varianti kabi: 1-qadam — vakil (ota-ona), 2-qadam — bola;
 * farqi: ariza (lid) yo'q, kurs/daraja yo'q — o'rniga filial, o'quv yili va maktabga tayyorlov guruhi («Sinf»).
 */

export const PRESCHOOL_CONTRACT_TYPE = 'preschool';

/** Ruxsatlar (backend `PreschoolContractPermissionSeeder`). */
export const PRESCHOOL_CONTRACT_PERMISSIONS = {
  view: 'preschool_contracts.view',
  show: 'preschool_contracts.show',
  create: 'preschool_contracts.create',
  edit: 'preschool_contracts.edit',
  delete: 'preschool_contracts.delete',
} as const;

export type ContractLanguage = 'uz' | 'ru' | 'en';
export type ContractCitizenship = 'citizen' | 'stateless' | 'foreign';
export type StudentGender = 'male' | 'female';

export const CONTRACT_LANGUAGES: ContractLanguage[] = ['uz', 'ru', 'en'];
export const CONTRACT_CITIZENSHIPS: ContractCitizenship[] = ['citizen', 'stateless', 'foreign'];
export const STUDENT_GENDERS: StudentGender[] = ['male', 'female'];

/** Vakil turi — backend `representative_type` ga shu matn yoziladi (kurs shartnomasidagi «Otasi», «Onasi»… bilan mos). */
export const REPRESENTATIVE_TYPES = ['Ota', 'Ona', 'Vasiy', 'Boshqa'] as const;
export type RepresentativeType = (typeof REPRESENTATIVE_TYPES)[number];

export interface PreschoolRepresentativeForm {
  /** Faqat React `key` uchun. */
  key: number;
  representative_type: RepresentativeType;
  jshshir: string;
  citizenship: ContractCitizenship;
  birth_date: string;
  passport_series: string;
  passport_number: string;
  passport_given_date: string;
  passport_expiry_date: string;
  passport_given_by: string;
  last_name: string;
  first_name: string;
  father_name: string;
  /** Birinchisi — asosiy (`phone`), qolganlari `extra_phones`. Har biri `+998XXXXXXXXX`. */
  phones: string[];
  registered_address: string;
  residential_address: string;
}

export interface PreschoolContractForm {
  // ── Shartnoma ──
  language: ContractLanguage;
  branch_id: string;
  academic_year_id: string;
  /** «Sinf» — maktabga tayyorlov guruhi (0-A, 0-B …). */
  group_id: string;
  contract_date: string;
  end_date: string;
  study_start_date: string;
  first_payment_date: string;

  // ── Bola ──
  citizenship: ContractCitizenship;
  birth_cert_series: string;
  birth_cert_number: string;
  birth_cert_given_date: string;
  birth_place: string;
  last_name: string;
  first_name: string;
  father_name: string;
  birth_date: string;
  gender: StudentGender | '';
  /** Bolaning o'z telefoni — ixtiyoriy. */
  phone: string;
  residential_address: string;

  // ── Vakillar (ota-ona) ──
  representatives: PreschoolRepresentativeForm[];
}

let representativeKey = 0;

export const emptyRepresentative = (type: RepresentativeType = 'Ota'): PreschoolRepresentativeForm => ({
  key: (representativeKey += 1),
  representative_type: type,
  jshshir: '',
  citizenship: 'citizen',
  birth_date: '',
  passport_series: '',
  passport_number: '',
  passport_given_date: '',
  passport_expiry_date: '',
  passport_given_by: '',
  last_name: '',
  first_name: '',
  father_name: '',
  phones: ['+998'],
  registered_address: '',
  residential_address: '',
});

export const emptyPreschoolContractForm = (today: string): PreschoolContractForm => ({
  language: 'uz',
  branch_id: '',
  academic_year_id: '',
  group_id: '',
  contract_date: today,
  end_date: '',
  study_start_date: '',
  first_payment_date: '',
  citizenship: 'citizen',
  birth_cert_series: '',
  birth_cert_number: '',
  birth_cert_given_date: '',
  birth_place: '',
  last_name: '',
  first_name: '',
  father_name: '',
  birth_date: '',
  gender: '',
  phone: '+998',
  residential_address: '',
  representatives: [emptyRepresentative()],
});

// ── Backend javoblari (ro'yxat / ko'rish) ────────────────────────────────────

export interface PreschoolContractPerson {
  id?: number;
  first_name?: string | null;
  last_name?: string | null;
  father_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
  extra_phones?: string[] | null;
  jshshir?: string | null;
  representative_type?: string | null;
  citizenship?: string | null;
  passport_series?: string | null;
  passport_number?: string | null;
  residential_address?: string | null;
  registered_address?: string | null;
  birth_date?: string | null;
  birth_place?: string | null;
  gender?: string | null;
  birth_cert_series?: string | null;
  birth_cert_number?: string | null;
  group_id?: number | null;
  group?: { id: number; name?: string | null } | null;
  monthly_price?: string | number | null;
  total_price?: string | number | null;
  course_start_date?: string | null;
  course_end_date?: string | null;
}

export interface PreschoolContract {
  id: number;
  contract_number: string;
  contract_type: string;
  status: string;
  language?: string | null;
  contract_date?: string | null;
  end_date?: string | null;
  first_payment_date?: string | null;
  academic_year_id?: number | null;
  academic_year?: { id: number; name?: string | null } | null;
  branch?: { id?: number; name_uz?: string | null; name_ru?: string | null; name_en?: string | null; city?: string | null } | null;
  /** Bir nechta vakil (yangi); eski backendda faqat bitta `representative`. */
  representatives?: PreschoolContractPerson[] | null;
  representative?: PreschoolContractPerson | null;
  contract_students?: PreschoolContractPerson[] | null;
  created_at?: string;
}
