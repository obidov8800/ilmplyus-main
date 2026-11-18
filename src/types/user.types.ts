import type { BaseEntity, PaginatedResponse } from "./common.types";

export interface Permission extends BaseEntity {
  name: string;
  guard_name?: string;
}

export interface Role extends BaseEntity {
  name: string;
  guard_name?: string;
  permissions?: Permission[];
}

export interface Branch extends BaseEntity {
  name_uz: string;
  name_ru?: string;
  name_en?: string;
  /** `standard` | `preschool` (maktabga tayyorlov). */
  type?: 'standard' | 'preschool';
  address?: string;
  city?: string;
  has_contract?: number;
  director_name?: string;
  postal_code?: string;
  legal_name?: string;
  inn?: string;
  phone?: string;
  email?: string;
  bank_name?: string;
  account_number?: string;
  mfo?: string;
  oked?: string;
  is_active?: number;
}

export interface User extends BaseEntity {
  full_name: string;
  account_type?: 'user' | 'employee';
  username: string;
  phone: string;
  role?: string | Role;
  roles?: Role[];
  role_id?: number;
  branch_id?: number;
  branch?: Branch;
  /** Foydalanuvchiga biriktirilgan filiallar (backend `/me` da qaytarishi kerak) — `utils/branchScope.ts`. */
  branches?: Branch[];
  /** Backend `/me` bersa: xodim yozuvi va faol shartnoma holati (`hooks/useEmployeeStatus.ts`). */
  employee?: { id?: number; branch_id?: number | null; has_active_contract?: boolean } | null;
  pinfl?: string;
  /**
   * TASDIQLANMAGAN: bu ilova login qilib tekshirilmagani uchun backend
   * javobida bu maydon haqiqatan kelishi tasdiqlanmadi — `dashboard-main`
   * (bir xil backend, `control.ilmplyus.uz`) shu shaklda ishlatadi, shu
   * yerga ham shu taxmin bilan qo'shildi. Kelmasa, shunga bog'liq
   * funksiyalar (masalan davomat sahifasidagi avtomatik oyna) hech kimga
   * chiqmay, sezilmay o'chib qoladi — xavfli emas, faqat ishlamaydi.
   */
  departments?: { id: number; name_uz: string; name_ru?: string; name_en?: string }[];
}

export type UserListResponse = PaginatedResponse<User[]>;

export interface SaveUserPayload {
  full_name: string;
  username: string;
  phone: string;
  password?: string;
  role_id: number;
  branch_id: number;
}
