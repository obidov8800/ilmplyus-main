export interface BaseEntity {
  id: number;
  created_at: string;
  updated_at: string;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  status?: boolean;
}

export interface PaginationMeta {
  current_page: number;
  last_page: number;
  total: number;
  from: number;
  to: number;
}

export interface PaginatedResponse<T> extends PaginationMeta {
  data: T;
}

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface APIError {
  message: string;
  errors?: Record<string, string[]>;
}

export interface Branch {
  id: number;
  name_uz: string;
  name_ru?: string;
  name_en?: string;
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
  created_at?: string;
  updated_at?: string;
}
